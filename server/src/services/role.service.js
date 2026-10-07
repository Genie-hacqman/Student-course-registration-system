import { sequelize, Role, User, RolePermissionOverride } from '../models/index.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import { EDITABLE_ROLES, NON_GRANTABLE_PERMISSIONS, PERMISSION_CATALOG } from '../utils/constants.js';
import * as permissionService from './permission.service.js';
import * as audit from './audit.service.js';

export const catalog = () => PERMISSION_CATALOG;

const describe = (role, userCount) => ({
  id: role.id,
  name: role.name,
  description: role.description,
  userCount,
  editable: EDITABLE_ROLES.includes(role.name),
  permissions: permissionService.permissionsFor(role.name),
  defaults: permissionService.defaultsFor(role.name),
});

const userCounts = async () => {
  const rows = await User.findAll({ attributes: ['roleId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']], group: ['roleId'], raw: true });
  return new Map(rows.map((r) => [r.roleId, Number(r.count)]));
};

export const list = async () => {
  const [roles, counts] = await Promise.all([Role.findAll({ order: [['id', 'ASC']] }), userCounts()]);
  return roles.map((r) => describe(r, counts.get(r.id) ?? 0));
};

export const setPermissions = async (roleId, permissions, actor, req) => {
  const role = await Role.findByPk(roleId);
  if (!role) throw new NotFoundError('Role');
  if (!EDITABLE_ROLES.includes(role.name)) throw new ForbiddenError(`The ${role.name} role's permissions are fixed`);
  if (role.name === actor.role) throw new ForbiddenError('You cannot change the permissions of your own role');

  const blocked = permissions.filter((p) => NON_GRANTABLE_PERMISSIONS.includes(p));
  if (blocked.length) throw new BadRequestError(`These permissions cannot be granted: ${blocked.join(', ')}`);

  const before = new Set(permissionService.permissionsFor(role.name));
  const wanted = new Set(permissions);
  const defaults = new Set(permissionService.defaultsFor(role.name));
  const rows = [
    ...[...wanted].filter((p) => !defaults.has(p)).map((permission) => ({ permission, granted: true })),
    ...[...defaults].filter((p) => !wanted.has(p)).map((permission) => ({ permission, granted: false })),
  ].map((r) => ({ ...r, roleId: role.id, updatedBy: actor.id }));

  await sequelize.transaction(async (transaction) => {
    await RolePermissionOverride.destroy({ where: { roleId: role.id }, transaction });
    if (rows.length) await RolePermissionOverride.bulkCreate(rows, { transaction });
    await audit.log({
      userId: actor.id, action: 'role.permissions.update', entityType: 'Role', entityId: role.id,
      metadata: {
        role: role.name,
        added: [...wanted].filter((p) => !before.has(p)),
        removed: [...before].filter((p) => !wanted.has(p)),
      },
      req, transaction,
    });
  });
  await permissionService.reload();

  const counts = await userCounts();
  return describe(role, counts.get(role.id) ?? 0);
};
