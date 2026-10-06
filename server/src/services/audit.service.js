import { Op } from 'sequelize';
import { AuditLog, User, Role } from '../models/index.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { captureException } from '../config/sentry.js';
import { buildPagination } from '../utils/pagination.js';
import { redactSecrets } from '../utils/redact.js';
import { computeRowHmac, SIGN_IN_ACTIONS } from '../utils/audit-integrity.js';
import { currentRequest } from '../middleware/request-context.middleware.js';

const clip = (value, max) => (value == null ? null : String(value).slice(0, max));

/**
 * Records an audit entry.
 *
 * Request details (IP, user agent, request id and, unless `userId` is given, the signed-in actor) come from
 * `req`, or from the current HTTP request when a caller does not pass one. Scripts pass `actor` instead.
 *
 * Failure handling depends on `transaction`:
 *  - with one, the entry is part of the change it describes, so a failed write throws and rolls the change
 *    back (on MySQL a failed insert can already have doomed the transaction; carrying on would report
 *    success for work that was rolled back);
 *  - without one, a failure must not fail the business action: it is logged and reported, never thrown.
 */
export const log = async ({ userId, action, entityType, entityId, metadata, req, transaction, actor } = {}) => {
  try {
    const request = req ?? currentRequest();
    const signedIn = request?.user;
    const resolvedUserId = userId === undefined ? (signedIn?.id ?? null) : userId;
    const who = actor ?? (signedIn && signedIn.id === resolvedUserId ? { email: signedIn.email, role: signedIn.role } : null);

    const row = {
      userId: resolvedUserId,
      action,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      // JSON round trip first: what is hashed must be exactly what the JSON column will hold.
      metadata: metadata === undefined || metadata === null ? null : redactSecrets(JSON.parse(JSON.stringify(metadata))),
      ipAddress: clip(request?.ip, 64),
      requestId: clip(request?.id, 64),
      userAgent: clip(request?.get?.('user-agent') ?? request?.headers?.['user-agent'], 255),
      actorEmail: clip(who?.email, 255),
      actorRole: clip(who?.role, 30),
      // The column has one-second resolution, so use a whole second or the signature would not match.
      createdAt: new Date(Math.floor(Date.now() / 1000) * 1000),
    };
    row.rowHmac = computeRowHmac(env.auditHmacSecret, row);
    await AuditLog.create(row, { transaction });
  } catch (err) {
    if (transaction) throw err;
    logger.error('Failed to write audit log', err);
    captureException(err instanceof Error ? err : new Error(String(err)), { action, requestId: (req ?? currentRequest())?.id });
  }
};

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['createdAt', 'action'], ['createdAt', 'DESC']);
  const where = {};
  if (query.userId) where.userId = query.userId;
  if (query.action) where.action = query.action;
  else if (query.actionPrefix) where.action = { [Op.like]: `${escapeLike(query.actionPrefix)}%` };
  if (query.entityType) where.entityType = query.entityType;
  if (query.entityId) where.entityId = query.entityId;
  if (query.requestId) where.requestId = query.requestId;
  if (query.from || query.to) {
    where.createdAt = { ...(query.from ? { [Op.gte]: query.from } : {}), ...(query.to ? { [Op.lte]: query.to } : {}) };
  }

  const result = await AuditLog.findAndCountAll({
    where,
    attributes: { exclude: ['rowHmac'] },
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'firstName', 'lastName'] }],
    limit,
    offset,
    // Rows from the same second would otherwise repeat or vanish between pages.
    order: [...order, ['id', order[0][1]]],
  });
  return { result, page, limit };
};

/** The values the audit-log filters can offer, so the UI never goes out of date with what is being written. */
export const filterOptions = async () => {
  const [types, actions] = await Promise.all([
    AuditLog.findAll({ attributes: ['entityType'], group: ['entity_type'], where: { entityType: { [Op.ne]: null } }, order: [['entityType', 'ASC']], raw: true }),
    AuditLog.findAll({ attributes: ['action'], group: ['action'], order: [['action', 'ASC']], raw: true }),
  ]);
  return { entityTypes: types.map((t) => t.entityType), actions: actions.map((a) => a.action) };
};

const SIGN_IN_LIST_ACTIONS = SIGN_IN_ACTIONS.filter((a) => a !== 'auth.login_locked');

/**
 * Sign-in history built from the audit log: every successful and failed sign-in, with time, IP and
 * the browser's user agent (recorded in metadata since sign-in tracking was added — older rows have none).
 */
export const listSignIns = async (query) => {
  const { page, limit, offset } = buildPagination(query, []);
  const where = { action: query.result ? (query.result === 'success' ? 'auth.login' : 'auth.login_failed') : SIGN_IN_LIST_ACTIONS };
  if (query.userId) where.userId = query.userId;
  if (query.from || query.to) {
    where.createdAt = { ...(query.from ? { [Op.gte]: query.from } : {}), ...(query.to ? { [Op.lte]: query.to } : {}) };
  }
  if (query.search) {
    const like = `%${query.search}%`;
    where[Op.or] = [
      { '$user.first_name$': { [Op.like]: like } },
      { '$user.last_name$': { [Op.like]: like } },
      { '$user.email$': { [Op.like]: like } },
    ];
  }

  const result = await AuditLog.findAndCountAll({
    where,
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'firstName', 'lastName', 'email'],
      // A role filter only keeps sign-ins that belong to a known user.
      required: Boolean(query.role),
      include: [{ model: Role, as: 'role', attributes: ['name'], ...(query.role ? { where: { name: query.role } } : {}) }],
    }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
    subQuery: false,
  });

  const rows = result.rows.map((l) => ({
    id: l.id,
    at: l.createdAt,
    success: l.action === 'auth.login',
    ipAddress: l.ipAddress,
    userAgent: l.userAgent ?? l.metadata?.userAgent ?? null,
    user: l.user ? { id: l.user.id, firstName: l.user.firstName, lastName: l.user.lastName, email: l.user.email, role: l.user.role?.name } : null,
    // A failed attempt for an unknown address has no user, only what was typed.
    email: l.user?.email ?? l.metadata?.email ?? null,
  }));
  return { result: { rows, count: result.count }, page, limit };
};
