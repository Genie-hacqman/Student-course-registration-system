import { User, Role } from '../models/index.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { USER_STATUS } from '../utils/constants.js';
import { isAccessTokenRevoked } from '../services/session.service.js';

/**
 * Full access-token check, shared by the REST middleware and the Socket.IO handshake:
 * signature + expiry, not individually revoked (jti), account active, token_version current (ver).
 * Returns { user, payload } or throws UnauthorizedError.
 */
export const resolveAccessToken = async (token) => {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw new UnauthorizedError(err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token');
  }
  if (!payload.jti || payload.ver === undefined) throw new UnauthorizedError('Invalid access token');

  const [revoked, user] = await Promise.all([
    isAccessTokenRevoked(payload.jti),
    User.findByPk(payload.sub, { include: [{ model: Role, as: 'role' }] }),
  ]);
  if (revoked) throw new UnauthorizedError('Token has been revoked');
  if (!user || user.status !== USER_STATUS.ACTIVE) throw new UnauthorizedError('Account is not active');
  if (payload.ver !== user.tokenVersion) throw new UnauthorizedError('Session has ended, please log in again');

  return { user, payload };
};

/**
 * Verifies the Bearer access token and loads the user.
 * Sets req.user = { id, email, role, status, firstName, lastName } and req.auth = { jti, exp }.
 */
export const authenticate = async (req, res, next) => {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new UnauthorizedError();

  const { user, payload } = await resolveAccessToken(token);
  // A temporary PIN (new admission or staff reset) only unlocks the few routes needed to replace it.
  if (user.mustChangePassword && !req.allowPendingPinChange) {
    throw new ForbiddenError('Change your temporary PIN to continue', 'PIN_CHANGE_REQUIRED');
  }

  req.user = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    role: user.role.name,
  };
  req.auth = { jti: payload.jti, exp: payload.exp };
  next();
};

/**
 * Put before `authenticate` on the routes a user with a temporary PIN may still use:
 * reading their profile, changing the PIN and signing out.
 */
export const allowPendingPinChange = (req, res, next) => {
  req.allowPendingPinChange = true;
  next();
};

/**
 * Like `authenticate`, but never rejects: a valid Bearer token sets req.user,
 * a missing/invalid/expired one is ignored. Used where the action must always succeed (logout).
 */
export const optionalAuthenticate = async (req, res, next) => {
  if (req.get('authorization')) {
    req.allowPendingPinChange = true; // signing out must always work
    try {
      await authenticate(req, res, () => {});
    } catch {
      req.user = undefined;
      req.auth = undefined;
    }
  }
  next();
};
