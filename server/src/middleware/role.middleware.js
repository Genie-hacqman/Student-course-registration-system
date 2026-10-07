import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export const authorize = (...roles) => {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) throw new UnauthorizedError();
    if (!allowed.includes(req.user.role)) {
      req.accessDenied = { kind: 'role', required: allowed.join(' | ') };
      throw new ForbiddenError();
    }
    next();
  };
};
