import crypto from 'node:crypto';
import { SHORT_RETENTION_ACTIONS } from './audit-actions.js';

export { SHORT_RETENTION_ACTIONS };
export const STREAMS = Object.freeze({ MAIN: 'main', SIGN_IN: 'signin' });
export const streamOf = (action) => (SHORT_RETENTION_ACTIONS.includes(action) ? STREAMS.SIGN_IN : STREAMS.MAIN);

export const GENESIS_HASH = '0'.repeat(64);

export const canonicalize = (value) => {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
};

const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

export const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

export const computeRowHmac = (secret, row) => hmac(secret, canonicalize({
  action: row.action,
  entityType: row.entityType ?? null,
  entityId: row.entityId ?? null,
  metadata: row.metadata ?? null,
  ipAddress: row.ipAddress ?? null,
  requestId: row.requestId ?? null,
  userAgent: row.userAgent ?? null,
  actorEmail: row.actorEmail ?? null,
  actorRole: row.actorRole ?? null,
  createdAt: iso(row.createdAt),
}));

export const computeSealHash = ({ stream, prevSealHash, fromId, toId, rowHmacs }) =>
  sha256([stream, prevSealHash, fromId, toId, rowHmacs.length, ...rowHmacs].join('|'));

export const timingSafeEqualHex = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const verifyStream = ({ secret, stream, seals, rowsFor }) => {
  const problems = [];
  let prev = GENESIS_HASH;
  for (const seal of seals) {
    if (!timingSafeEqualHex(seal.prevSealHash, prev)) {
      problems.push({ type: 'chain_broken', stream, sealId: seal.id, message: `Seal #${seal.id} does not follow the previous seal (a seal was removed or changed).` });
    }
    if (!seal.purgedAt) {
      const rows = rowsFor(seal);
      if (rows.length !== seal.rowCount) {
        problems.push({ type: 'row_count', stream, sealId: seal.id, message: `Seal #${seal.id} covers ${seal.rowCount} rows (ids ${seal.fromId}-${seal.toId}) but ${rows.length} exist: rows were deleted or inserted.` });
      }
      for (const row of rows) {
        if (!row.rowHmac) {
          problems.push({ type: 'unsigned_row', stream, sealId: seal.id, rowId: row.id, message: `Row #${row.id} inside seal #${seal.id} has no signature.` });
        } else if (!timingSafeEqualHex(row.rowHmac, computeRowHmac(secret, row))) {
          problems.push({ type: 'row_modified', stream, sealId: seal.id, rowId: row.id, message: `Row #${row.id} was modified after it was written.` });
        }
      }
      const expected = computeSealHash({
        stream, prevSealHash: seal.prevSealHash, fromId: seal.fromId, toId: seal.toId, rowHmacs: rows.map((r) => r.rowHmac),
      });
      if (!timingSafeEqualHex(expected, seal.sealHash)) {
        problems.push({ type: 'seal_mismatch', stream, sealId: seal.id, message: `Seal #${seal.id} no longer matches its rows.` });
      }
    }
    prev = seal.sealHash;
  }
  return problems;
};
