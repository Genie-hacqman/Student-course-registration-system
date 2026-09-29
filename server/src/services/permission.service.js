import { RolePermissionOverride, Role } from '../models/index.js';
import { PERMISSIONS, ROLE_PERMISSIONS, EDITABLE_ROLES } from '../utils/constants.js';
import logger from '../config/logger.js';

/**
 * Effective permissions = ROLE_PERMISSIONS (code defaults) + admin overrides from role_permission_overrides.
 * Overrides are cached in memory so permission checks stay synchronous; until the cache is loaded
 * (e.g. in tests that never call reload) the code defaults apply unchanged.
 */
let overrides = new Map(); // role name → Map(permission → granted)

const ALL = Object.values(PERMISSIONS);

export const defaultsFor = (role) => [...(ROLE_PERMISSIONS[role] ?? [])];

/** Unknown role names get nothing; only editable roles (REGISTRAR, LECTURER) take overrides. */
export const permissionsFor = (role) => {
  const effective = new Set(ROLE_PERMISSIONS[role] ?? []);
  const roleOverrides = EDITABLE_ROLES.includes(role) ? overrides.get(role) : null;
  for (const [permission, granted] of roleOverrides ?? []) {
    if (granted) effective.add(permission);
    else effective.delete(permission);
  }
  return ALL.filter((p) => effective.has(p));
};

export const hasPermission = (role, permission) => permissionsFor(role).includes(permission);

/** Re-reads every override. Called at startup, after each edit, and periodically so several processes converge. */
export const reload = async () => {
  const rows = await RolePermissionOverride.findAll({ include: [{ model: Role, as: 'role', attributes: ['name'] }] });
  const next = new Map();
  for (const row of rows) {
    if (!next.has(row.role.name)) next.set(row.role.name, new Map());
    next.get(row.role.name).set(row.permission, row.granted);
  }
  overrides = next;
};

export const startPeriodicReload = (intervalMs = 60_000) => {
  const timer = setInterval(() => {
    reload().catch((err) => logger.error('Permission reload failed:', err.message));
  }, intervalMs);
  timer.unref();
  return timer;
};
