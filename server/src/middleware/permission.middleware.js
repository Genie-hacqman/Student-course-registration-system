import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { hasPermission } from '../services/permission.service.js';

export { hasPermission };

export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) throw new UnauthorizedError();
  if (!hasPermission(req.user.role, permission)) {
    req.accessDenied = { kind: 'permission', required: permission };
    throw new ForbiddenError();
  }
  next();
};

export const requireAnyPermission = (...permissions) => (req, res, next) => {
  if (!req.user) throw new UnauthorizedError();
  if (!permissions.some((p) => hasPermission(req.user.role, p))) {
    req.accessDenied = { kind: 'permission', required: permissions.join(' | ') };
    throw new ForbiddenError();
  }
  next();
};
