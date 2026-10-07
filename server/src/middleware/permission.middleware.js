import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { hasPermission } from '../services/permission.service.js';

export { hasPermission };

/** Allows the request only if the user's role grants the permission (ROLE_PERMISSIONS plus admin overrides). */
export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) throw new UnauthorizedError();
  if (!hasPermission(req.user.role, permission)) {
    req.accessDenied = { kind: 'permission', required: permission }; // read by the error handler for the audit entry
    throw new ForbiddenError();
  }
  next();
};

/** Allows the request if the user's role grants at least one of the permissions. */
export const requireAnyPermission = (...permissions) => (req, res, next) => {
  if (!req.user) throw new UnauthorizedError();
  if (!permissions.some((p) => hasPermission(req.user.role, p))) {
    req.accessDenied = { kind: 'permission', required: permissions.join(' | ') };
    throw new ForbiddenError();
  }
  next();
};
