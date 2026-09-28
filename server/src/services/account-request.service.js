import { sequelize, AccountChangeRequest, User, Role } from '../models/index.js';
import { buildPagination } from '../utils/pagination.js';
import {
  BadRequestError, ConflictError, ForbiddenError, NotFoundError,
} from '../utils/errors.js';
import {
  ACCOUNT_REQUEST_STATUS, ACCOUNT_REQUEST_TYPE, ROLES, USER_STATUS,
} from '../utils/constants.js';
import { issuePasswordReset } from './password-reset.service.js';
import * as notificationService from './notification.service.js';
import * as audit from './audit.service.js';

const { PENDING, APPROVED, REJECTED, CANCELLED } = ACCOUNT_REQUEST_STATUS;
const { PASSWORD_RESET, NAME_CHANGE } = ACCOUNT_REQUEST_TYPE;

/** Only the super admin changes their own password or name directly; everyone else needs the super admin's approval. */
// Applicants sign up with their own personal email, so they reset/rename themselves like the super admin.
export const requiresApproval = (roleName) => ![ROLES.SUPER_ADMIN, ROLES.APPLICANT].includes(roleName);

const LABEL = { [PASSWORD_RESET]: 'password reset', [NAME_CHANGE]: 'name change' };

const userInclude = {
  model: User,
  as: 'user',
  attributes: ['id', 'firstName', 'lastName', 'email', 'status'],
  include: [{ model: Role, as: 'role', attributes: ['name'] }],
};
const reviewerInclude = { model: User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'] };

/** Tells every active super admin that a request is waiting (in-app only; they act from the queue). */
const notifySuperAdmins = async (request, user, transaction) => {
  const admins = await User.findAll({
    where: { status: USER_STATUS.ACTIVE },
    include: [{ model: Role, as: 'role', where: { name: ROLES.SUPER_ADMIN }, attributes: [] }],
    attributes: ['id'],
    transaction,
  });
  for (const admin of admins) {
    await notificationService.create({
      userId: admin.id,
      type: 'ACCOUNT_REQUEST_CREATED',
      title: `New ${LABEL[request.type]} request`,
      message: `${user.firstName} ${user.lastName} (${user.email}) asked for a ${LABEL[request.type]}.`,
      data: { accountRequestId: request.id },
    }, { transaction });
  }
};

const createRequest = async (user, fields, req) => sequelize.transaction(async (transaction) => {
  // Locking the user's own row serialises their requests (one pending per type) without the gap locks a
  // FOR UPDATE on a missing request row would take, which could block other users' requests.
  await User.findByPk(user.id, { attributes: ['id'], lock: transaction.LOCK.UPDATE, transaction });
  const pending = await AccountChangeRequest.findOne({
    where: { userId: user.id, type: fields.type, status: PENDING }, transaction,
  });
  if (pending) return { request: pending, created: false };

  const request = await AccountChangeRequest.create({ userId: user.id, ...fields }, { transaction });
  await notifySuperAdmins(request, user, transaction);
  await audit.log({
    userId: user.id, action: `account_request.${fields.type}`, entityType: 'AccountChangeRequest', entityId: request.id, req, transaction,
  });
  return { request, created: true };
});

/**
 * From "forgot password": files a reset request (or keeps the one already pending) without revealing
 * anything to the caller, which stays as enumeration-safe as the old direct flow.
 */
export const requestPasswordReset = async (user) => {
  await createRequest(user, { type: PASSWORD_RESET, note: 'Requested from the sign-in page' });
};

export const createForSelf = async (userId, { type, firstName, lastName, note }, req) => {
  const user = await User.findByPk(userId, { include: [{ model: Role, as: 'role', attributes: ['name'] }] });
  if (!user) throw new NotFoundError('User');
  if (!requiresApproval(user.role.name)) throw new BadRequestError('As the super admin you can change this directly');
  if (type === PASSWORD_RESET && user.role.name === ROLES.USER) {
    throw new ForbiddenError('Students change their PIN instead (PATCH /auth/pin)');
  }

  const fields = type === NAME_CHANGE ? { type, firstName, lastName, note } : { type, note };
  const { request, created } = await createRequest(user, fields, req);
  if (!created) throw new ConflictError(`You already have a pending ${LABEL[type]} request`);
  return request;
};

export const listForSelf = (userId) =>
  AccountChangeRequest.findAll({ where: { userId }, include: [reviewerInclude], order: [['createdAt', 'DESC'], ['id', 'DESC']] });

export const cancel = async (userId, id, req) => {
  const request = await AccountChangeRequest.findOne({ where: { id, userId } });
  if (!request) throw new NotFoundError('Request');
  if (request.status !== PENDING) throw new ConflictError(`This request is already ${request.status}`);
  await request.update({ status: CANCELLED });
  await audit.log({ userId, action: 'account_request.cancel', entityType: 'AccountChangeRequest', entityId: request.id, req });
  return request;
};

export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['createdAt', 'reviewedAt'], ['createdAt', 'DESC']);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  const result = await AccountChangeRequest.findAndCountAll({ where, include: [userInclude, reviewerInclude], limit, offset, order, distinct: true });
  return { result, page, limit };
};

const getById = async (id) => {
  const request = await AccountChangeRequest.findByPk(id, { include: [userInclude, reviewerInclude] });
  if (!request) throw new NotFoundError('Request');
  return request;
};

/**
 * Approves or rejects a pending request. An approved name change is applied at once; an approved
 * password reset emails the usual reset link after commit (the email never fails the decision).
 */
const review = async (id, decision, note, actor, req) => {
  const request = await sequelize.transaction(async (transaction) => {
    const r = await AccountChangeRequest.findByPk(id, { include: [userInclude], lock: transaction.LOCK.UPDATE, transaction });
    if (!r) throw new NotFoundError('Request');
    if (r.status !== PENDING) throw new ConflictError(`This request is already ${r.status}`);
    if (r.userId === actor.id) throw new ForbiddenError('You cannot review your own request');

    const approved = decision === APPROVED;
    if (approved && r.type === PASSWORD_RESET && r.user.role.name === ROLES.USER) {
      throw new ConflictError('Students change their PIN instead — this request cannot be approved');
    }
    if (approved && r.type === NAME_CHANGE) {
      await User.update({ firstName: r.firstName, lastName: r.lastName }, { where: { id: r.userId }, transaction });
    }
    await r.update({ status: decision, reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: note ?? null }, { transaction });

    const what = LABEL[r.type];
    await notificationService.create({
      userId: r.userId,
      type: approved ? 'ACCOUNT_REQUEST_APPROVED' : 'ACCOUNT_REQUEST_REJECTED',
      title: `Your ${what} request was ${approved ? 'approved' : 'declined'}`,
      message: approved
        ? (r.type === PASSWORD_RESET
          ? 'We have emailed you a link to choose a new password.'
          : `Your name is now ${r.firstName} ${r.lastName}.`)
        : `Your ${what} request was declined.${note ? ` Reason: ${note}` : ''}`,
      data: { accountRequestId: r.id },
    }, { transaction });
    await audit.log({
      userId: actor.id, action: `account_request.${decision}`, entityType: 'AccountChangeRequest', entityId: r.id,
      metadata: { type: r.type, forUserId: r.userId, note }, req, transaction,
    });
    return r;
  });

  if (decision === APPROVED && request.type === PASSWORD_RESET) await issuePasswordReset(request.user, { actor });
  return getById(request.id);
};

export const approve = (id, note, actor, req) => review(id, APPROVED, note, actor, req);
export const reject = (id, note, actor, req) => review(id, REJECTED, note, actor, req);
