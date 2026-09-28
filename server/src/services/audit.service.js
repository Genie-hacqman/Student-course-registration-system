import { Op } from 'sequelize';
import { AuditLog, User, Role } from '../models/index.js';
import logger from '../config/logger.js';
import { buildPagination } from '../utils/pagination.js';

/**
 * Records an audit entry. Never throws: failing to audit must not fail the business action.
 * Pass `transaction` to write the entry atomically with the change it describes.
 */
export const log = async ({ userId = null, action, entityType, entityId, metadata, req, transaction } = {}) => {
  try {
    await AuditLog.create(
      {
        userId,
        action,
        entityType,
        entityId,
        metadata,
        ipAddress: req?.ip,
        requestId: req?.id,
      },
      { transaction },
    );
  } catch (err) {
    logger.error('Failed to write audit log', err);
  }
};

export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['createdAt', 'action'], ['createdAt', 'DESC']);
  const where = {};
  if (query.userId) where.userId = query.userId;
  if (query.action) where.action = query.action;
  if (query.entityType) where.entityType = query.entityType;

  const result = await AuditLog.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'firstName', 'lastName'] }],
    limit,
    offset,
    order,
  });
  return { result, page, limit };
};

const SIGN_IN_ACTIONS = ['auth.login', 'auth.login_failed'];

/**
 * Sign-in history built from the audit log: every successful and failed sign-in, with time, IP and
 * the browser's user agent (recorded in metadata since sign-in tracking was added — older rows have none).
 */
export const listSignIns = async (query) => {
  const { page, limit, offset } = buildPagination(query, []);
  const where = { action: query.result ? (query.result === 'success' ? 'auth.login' : 'auth.login_failed') : SIGN_IN_ACTIONS };
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
    userAgent: l.metadata?.userAgent ?? null,
    user: l.user ? { id: l.user.id, firstName: l.user.firstName, lastName: l.user.lastName, email: l.user.email, role: l.user.role?.name } : null,
    // A failed attempt for an unknown address has no user, only what was typed.
    email: l.user?.email ?? l.metadata?.email ?? null,
  }));
  return { result: { rows, count: result.count }, page, limit };
};
