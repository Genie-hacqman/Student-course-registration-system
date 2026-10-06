import zlib from 'node:zlib';
import { Op } from 'sequelize';
import { sequelize, AuditLog, AuditSeal } from '../models/index.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import * as storage from './storage.service.js';
import {
  GENESIS_HASH, SIGN_IN_ACTIONS, STREAMS, computeRowHmac, computeSealHash, timingSafeEqualHex, verifyStream,
} from '../utils/audit-integrity.js';

/**
 * Keeps the audit log tamper-evident and bounded: seals new rows into a hash chain, archives and purges old
 * ones. Run on a timer by server.js, or by hand through scripts/verify-audit.mjs (verify only).
 */

const BATCH_SIZE = 1000;
// Rows are sealed once they are this old, so a slow transaction that commits late cannot land inside a seal.
const SEAL_AFTER_MS = 5 * 60 * 1000;
const MAX_BATCHES_PER_RUN = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

// Months of retention per stream: sign-ins are routine noise, everything else may matter in a dispute.
export const RETENTION_MONTHS = Object.freeze({ [STREAMS.MAIN]: 24, [STREAMS.SIGN_IN]: 12 });

const streamWhere = (stream) => (stream === STREAMS.SIGN_IN
  ? { action: { [Op.in]: SIGN_IN_ACTIONS } }
  : { action: { [Op.notIn]: SIGN_IN_ACTIONS } });

const monthsAgo = (months, now = new Date()) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
};

const lastSeal = (stream) => AuditSeal.findOne({ where: { stream }, order: [['id', 'DESC']] });

/** Seals the next batch of rows in one stream. Returns the seal, or null when there is nothing to seal yet. */
export const sealNextBatch = async (stream, { now = new Date(), batchSize = BATCH_SIZE, minAgeMs = SEAL_AFTER_MS } = {}) => {
  const previous = await lastSeal(stream);
  const rows = await AuditLog.findAll({
    where: {
      ...streamWhere(stream),
      rowHmac: { [Op.ne]: null },
      createdAt: { [Op.lte]: new Date(now.getTime() - minAgeMs) },
      ...(previous ? { id: { [Op.gt]: previous.toId } } : {}),
    },
    order: [['id', 'ASC']],
    limit: batchSize,
    raw: true,
  });
  if (rows.length === 0) return null;

  const prevSealHash = previous?.sealHash ?? GENESIS_HASH;
  const fromId = rows[0].id;
  const toId = rows[rows.length - 1].id;
  return AuditSeal.create({
    stream,
    fromId,
    toId,
    rowCount: rows.length,
    lastRowAt: rows[rows.length - 1].createdAt,
    prevSealHash,
    sealHash: computeSealHash({ stream, prevSealHash, fromId, toId, rowHmacs: rows.map((r) => r.rowHmac) }),
  });
};

/** Seals everything that is old enough, in batches. Returns how many seals were written. */
export const sealPending = async (options = {}) => {
  let sealed = 0;
  for (const stream of Object.values(STREAMS)) {
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i += 1) {
      if (!(await sealNextBatch(stream, options))) break;
      sealed += 1;
    }
  }
  return sealed;
};

/**
 * Re-checks every seal and row signature. Returns { ok, problems, seals, unsealedRows }. `unsealedRows` are
 * recent rows not yet in a seal (they are protected by their row signature only); rows written before
 * hardening have no signature and are legacy, not tampering.
 */
export const verify = async () => {
  const problems = [];
  let seals = 0;
  for (const stream of Object.values(STREAMS)) {
    const streamSeals = await AuditSeal.findAll({ where: { stream }, order: [['id', 'ASC']], raw: true });
    seals += streamSeals.length;
    const rowsBySeal = new Map();
    for (const seal of streamSeals) {
      if (seal.purgedAt) continue;
      rowsBySeal.set(seal.id, await AuditLog.findAll({
        where: { ...streamWhere(stream), id: { [Op.between]: [seal.fromId, seal.toId] } }, order: [['id', 'ASC']], raw: true,
      }));
    }
    problems.push(...verifyStream({ secret: env.auditHmacSecret, stream, seals: streamSeals, rowsFor: (seal) => rowsBySeal.get(seal.id) ?? [] }));
  }

  // Signed rows past the newest seal of their stream: not sealed yet, still individually signed.
  let unsealedRows = 0;
  for (const stream of Object.values(STREAMS)) {
    const previous = await lastSeal(stream);
    const rows = await AuditLog.findAll({
      where: { ...streamWhere(stream), ...(previous ? { id: { [Op.gt]: previous.toId } } : {}), rowHmac: { [Op.ne]: null } }, raw: true,
    });
    unsealedRows += rows.length;
    for (const row of rows) {
      if (!timingSafeEqualHex(row.rowHmac, computeRowHmac(env.auditHmacSecret, row))) {
        problems.push({ type: 'row_modified', stream, rowId: row.id, message: `Row #${row.id} was modified after it was written.` });
      }
    }
  }
  return { ok: problems.length === 0, problems, seals, unsealedRows };
};

const archiveKeyFor = (seal) => `audit-archive/${seal.stream}/seal-${String(seal.id).padStart(8, '0')}.ndjson.gz`;

/**
 * Archives, then deletes, the rows of seals older than their stream's retention. The archive is read back and
 * compared before anything is deleted, so a failed upload never loses rows. Seals themselves are kept, marked
 * purged, so the chain stays verifiable. Does nothing when no storage is configured.
 */
export const purgeExpired = async ({ now = new Date() } = {}) => {
  if (!storage.isConfigured()) {
    logger.warn('Audit retention skipped: no object storage is configured to archive to.');
    return { purged: 0 };
  }
  let purged = 0;
  for (const stream of Object.values(STREAMS)) {
    const cutoff = monthsAgo(RETENTION_MONTHS[stream], now);
    const seals = await AuditSeal.findAll({ where: { stream, purgedAt: null, lastRowAt: { [Op.lt]: cutoff } }, order: [['id', 'ASC']] });
    for (const seal of seals) {
      const rows = await AuditLog.findAll({
        where: { ...streamWhere(stream), id: { [Op.between]: [seal.fromId, seal.toId] } }, order: [['id', 'ASC']], raw: true,
      });
      const body = zlib.gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n'), 'utf8'));
      const key = archiveKeyFor(seal);
      await storage.put(key, body, 'application/gzip');
      const readBack = await storage.get(key);
      if (!readBack || !readBack.equals(body)) throw new Error(`Audit archive ${key} did not read back identically; nothing was deleted.`);

      await sequelize.transaction(async (transaction) => {
        // Raw SQL on purpose: the model refuses deletes (see AuditLog.js). Only this job removes rows.
        const inList = SIGN_IN_ACTIONS.map(() => '?').join(',');
        await sequelize.query(
          `DELETE FROM audit_logs WHERE id BETWEEN ? AND ? AND action ${stream === STREAMS.SIGN_IN ? 'IN' : 'NOT IN'} (${inList})`,
          { replacements: [seal.fromId, seal.toId, ...SIGN_IN_ACTIONS], transaction },
        );
        await seal.update({ archiveKey: key, purgedAt: now }, { transaction });
      });
      purged += rows.length;
    }
  }
  return { purged };
};

let running = false;
/** One maintenance pass; never throws (it runs on a timer). */
export const runMaintenance = async () => {
  if (running) return;
  running = true;
  try {
    const sealed = await sealPending();
    const { purged } = await purgeExpired();
    if (sealed || purged) logger.info(`Audit maintenance: sealed ${sealed} batch(es), archived and purged ${purged} row(s)`);
  } catch (err) {
    logger.error('Audit maintenance failed:', err);
  } finally {
    running = false;
  }
};

export const MAINTENANCE_INTERVAL_MS = DAY_MS / 24;
