import { Op } from 'sequelize';
import {
  sequelize, User, Role, Student, Lecturer, Program, Department,
} from '../models/index.js';
import { hashPassword, UNUSABLE_PASSWORD_HASH } from '../utils/password.js';
import { buildPagination } from '../utils/pagination.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import { USER_STATUS } from '../utils/constants.js';
import * as audit from './audit.service.js';
import * as sessionService from './session.service.js';
import { issueInvite } from './password-reset.service.js';

const roleInclude = { model: Role, as: 'role', attributes: ['id', 'name'] };

const findRole = async (name) => {
  const role = await Role.findOne({ where: { name } });
  if (!role) throw new BadRequestError(`Unknown role ${name}`);
  return role;
};

export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['email', 'firstName', 'lastName', 'createdAt']);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.search) {
    const like = `%${query.search}%`;
    where[Op.or] = [{ email: { [Op.like]: like } }, { firstName: { [Op.like]: like } }, { lastName: { [Op.like]: like } }];
  }
  const include = [{ ...roleInclude, ...(query.role ? { where: { name: query.role } } : {}) }];

  const result = await User.findAndCountAll({ where, include, limit, offset, order, distinct: true });
  return { result, page, limit };
};

export const getById = async (id) => {
  const user = await User.findByPk(id, {
    include: [
      roleInclude,
      { model: Student, as: 'student', include: [{ model: Program, as: 'program', attributes: ['id', 'name', 'code'] }] },
      { model: Lecturer, as: 'lecturer', include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }] },
    ],
  });
  if (!user) throw new NotFoundError('User');
  return user;
};

export const create = async (data, actor) => {
  if (await User.findOne({ where: { email: data.email } })) {
    throw new ConflictError('An account with this email already exists');
  }
  const role = await findRole(data.role);
  const user = await User.create({
    roleId: role.id,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    // Without a password the person gets an invite link and chooses their own.
    passwordHash: data.password ? await hashPassword(data.password) : UNUSABLE_PASSWORD_HASH,
    status: data.status,
    // Staff create accounts for real people they know, so no verification email is needed.
    emailVerifiedAt: new Date(),
  });
  await audit.log({
    userId: actor.id, action: 'user.create', entityType: 'User', entityId: user.id, metadata: { role: role.name, invited: !data.password },
  });
  if (!data.password) await issueInvite(user, { actor });
  return getById(user.id);
};

/** Re-sends the set-your-password invite, e.g. after the first link expired. */
export const invite = async (id, actor) => {
  const user = await User.scope('withSecrets').findByPk(id);
  if (!user) throw new NotFoundError('User');
  if (user.passwordHash !== UNUSABLE_PASSWORD_HASH) {
    throw new ConflictError('This user has already set a password; use a password reset instead');
  }
  if (user.status !== USER_STATUS.ACTIVE) throw new BadRequestError(`Account is ${user.status}`);
  await issueInvite(user, { actor });
};

export const update = async (id, data, actor) => {
  const user = await getById(id);
  const changes = { ...data };
  delete changes.role;
  if (data.role) changes.roleId = (await findRole(data.role)).id;

  await sequelize.transaction(async (transaction) => {
    await user.update(changes, { transaction });
    // Suspending an account or changing its role ends its existing sessions.
    if ((data.status && data.status !== USER_STATUS.ACTIVE) || data.role) {
      await sessionService.endAllSessions(id, transaction);
    }
    await audit.log({ userId: actor.id, action: 'user.update', entityType: 'User', entityId: id, metadata: data, transaction });
  });
  return getById(id);
};

/** Soft delete: accounts are suspended rather than removed so registration history stays intact. */
export const deactivate = async (id, actor) => {
  if (Number(id) === actor.id) throw new BadRequestError('You cannot deactivate your own account');
  return update(id, { status: USER_STATUS.SUSPENDED }, actor);
};
