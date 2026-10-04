import { Op } from 'sequelize';
import {
  sequelize, User, Role, Student, Lecturer, Program, Department,
} from '../models/index.js';
import { hashPassword, UNUSABLE_PASSWORD_HASH } from '../utils/password.js';
import { buildPagination } from '../utils/pagination.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { PERMISSION_CATALOG, ROLES, USER_STATUS } from '../utils/constants.js';
import * as audit from './audit.service.js';
import { permissionsFor } from './permission.service.js';
import * as sessionService from './session.service.js';
import { issueInvite } from './password-reset.service.js';

const roleInclude = { model: Role, as: 'role', attributes: ['id', 'name'] };

const findRole = async (name) => {
  const role = await Role.findOne({ where: { name } });
  if (!role) throw new BadRequestError(`Unknown role ${name}`);
  return role;
};

// Administrators and registrars run the institution: only an ADMIN may create, change or suspend those accounts,
// even if `user:manage` has been granted to another role through the roles editor.
const PRIVILEGED_ROLES = [ROLES.ADMIN, ROLES.REGISTRAR];
const assertAdminActor = (actor, what) => {
  if (actor?.role !== ROLES.ADMIN) throw new ForbiddenError(`Only an administrator can ${what}`, 'PRIVILEGED_ACCOUNT');
};

const U = '`User`.`id`';
/**
 * The user directory. `role` may be several roles; `departmentId` matches students through their programme and
 * lecturers through their home or additional departments; `programId` matches students on that programme.
 */
export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['email', 'firstName', 'lastName', 'createdAt', 'lastLoginAt']);
  const where = {};
  const and = [];
  if (query.status) where.status = query.status;
  if (query.search) {
    const like = `%${query.search}%`;
    where[Op.or] = [{ email: { [Op.like]: like } }, { firstName: { [Op.like]: like } }, { lastName: { [Op.like]: like } }];
  }
  if (query.departmentId) {
    const d = sequelize.escape(query.departmentId);
    and.push({
      [Op.or]: [
        sequelize.literal(`EXISTS (SELECT 1 FROM students s JOIN programs p ON p.id = s.program_id WHERE s.user_id = ${U} AND p.department_id = ${d})`),
        sequelize.literal(`EXISTS (SELECT 1 FROM lecturers l WHERE l.user_id = ${U} AND (l.department_id = ${d}
          OR EXISTS (SELECT 1 FROM lecturer_departments ld WHERE ld.lecturer_id = l.id AND ld.department_id = ${d})))`),
      ],
    });
  }
  if (query.programId) {
    and.push(sequelize.literal(`EXISTS (SELECT 1 FROM students s WHERE s.user_id = ${U} AND s.program_id = ${sequelize.escape(query.programId)})`));
  }
  if (and.length) where[Op.and] = and;
  const roles = query.role?.length ? query.role : null;
  const include = [
    { ...roleInclude, ...(roles ? { where: { name: roles } } : {}) },
    {
      model: Student, as: 'student', attributes: ['id', 'studentNumber', 'level'],
      include: [{ model: Program, as: 'program', attributes: ['id', 'name', 'code'], include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }] }],
    },
    { model: Lecturer, as: 'lecturer', attributes: ['id', 'staffNumber'], include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }] },
  ];

  const result = await User.findAndCountAll({ where, include, limit, offset, order, distinct: true });
  return { result, page, limit };
};

/** What administrators and registrars may do: each role's effective permissions in plain language. */
export const roleResponsibilities = () => PRIVILEGED_ROLES.map((role) => ({
  role,
  permissions: permissionsFor(role).map((name) => {
    const entry = PERMISSION_CATALOG.find((p) => p.name === name);
    return { name, group: entry?.group ?? 'Other', description: entry?.description ?? name };
  }),
}));

export const getById = async (id) => {
  const user = await User.scope('withAvatar').findByPk(id, {
    include: [
      roleInclude,
      { model: Student, as: 'student', include: [{ model: Program, as: 'program', attributes: ['id', 'name', 'code'] }] },
      { model: Lecturer, as: 'lecturer', include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }] },
    ],
  });
  if (!user) throw new NotFoundError('User');
  return user;
};

export const create = async (data, actor, req) => {
  if (PRIVILEGED_ROLES.includes(data.role)) assertAdminActor(actor, 'create administrator or registrar accounts');
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
    userId: actor.id, action: 'user.create', entityType: 'User', entityId: user.id, metadata: { role: role.name, invited: !data.password }, req,
  });
  if (!data.password) await issueInvite(user, { actor });
  return getById(user.id);
};

/** Re-sends the set-your-password invite, e.g. after the first link expired. */
export const invite = async (id, actor) => {
  const user = await User.scope('withSecrets').findByPk(id, { include: [roleInclude] });
  if (!user) throw new NotFoundError('User');
  if (PRIVILEGED_ROLES.includes(user.role?.name)) assertAdminActor(actor, 'manage administrator or registrar accounts');
  if (user.passwordHash !== UNUSABLE_PASSWORD_HASH) {
    throw new ConflictError('This user has already set a password; use a password reset instead');
  }
  if (user.status !== USER_STATUS.ACTIVE) throw new BadRequestError(`Account is ${user.status}`);
  await issueInvite(user, { actor });
};

/**
 * Account edits. Guards: only an ADMIN may touch administrator or registrar accounts or give anyone those roles;
 * nobody may change their own role or status; the last active administrator can't be demoted or suspended.
 */
export const update = async (id, data, actor, req) => {
  const user = await getById(id);
  const currentRole = user.role?.name;
  const roleChanges = data.role && data.role !== currentRole;
  const statusChanges = data.status && data.status !== user.status;
  if (Number(id) === actor.id && (roleChanges || statusChanges)) {
    throw new ForbiddenError('You cannot change your own role or account status', 'SELF_CHANGE');
  }
  if (PRIVILEGED_ROLES.includes(currentRole) || (roleChanges && PRIVILEGED_ROLES.includes(data.role))) {
    assertAdminActor(actor, 'change administrator or registrar accounts or assign those roles');
  }
  if (currentRole === ROLES.ADMIN && user.status === USER_STATUS.ACTIVE
    && ((roleChanges && data.role !== ROLES.ADMIN) || (statusChanges && data.status !== USER_STATUS.ACTIVE))) {
    const otherActiveAdmins = await User.count({
      where: { status: USER_STATUS.ACTIVE, id: { [Op.ne]: user.id } },
      include: [{ model: Role, as: 'role', where: { name: ROLES.ADMIN }, attributes: [] }],
    });
    if (otherActiveAdmins === 0) throw new ConflictError('There must always be at least one active administrator', { code: 'LAST_ADMIN' });
  }
  const changes = { ...data };
  delete changes.role;
  if (data.role) changes.roleId = (await findRole(data.role)).id;

  await sequelize.transaction(async (transaction) => {
    await user.update(changes, { transaction });
    // Suspending an account or changing its role ends its existing sessions.
    if ((data.status && data.status !== USER_STATUS.ACTIVE) || data.role) {
      await sessionService.endAllSessions(id, transaction);
    }
    await audit.log({
      userId: actor.id, action: 'user.update', entityType: 'User', entityId: id, transaction, req,
      metadata: {
        ...data,
        ...(roleChanges ? { roleBefore: currentRole, roleAfter: data.role } : {}),
        ...(statusChanges ? { statusBefore: user.status, statusAfter: data.status } : {}),
      },
    });
  });
  return getById(id);
};

/** Soft delete: accounts are suspended rather than removed so registration history stays intact. */
export const deactivate = async (id, actor, req) => {
  if (Number(id) === actor.id) throw new BadRequestError('You cannot deactivate your own account');
  return update(id, { status: USER_STATUS.SUSPENDED }, actor, req);
};
