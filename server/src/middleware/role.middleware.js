import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/** Allows the request only if the authenticated user has one of the given roles. */
export const authorize = (...roles) => {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) throw new UnauthorizedError();
    if (!allowed.includes(req.user.role)) {
      req.accessDenied = { kind: 'role', required: allowed.join(' | ') }; // read by the error handler for the audit entry
      throw new ForbiddenError();
    }
    next();
  };
};
