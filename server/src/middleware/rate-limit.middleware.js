import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

/**
 * Exported for tests, which build a limiter with `skip: () => false` to exercise the real behaviour.
 * `name` says which limiter fired in the audit entry; `onBlocked` is how tests observe it without a database.
 *
 * Only the first blocked request of each window per key is recorded (`used === limit + 1`), so a client hammering
 * a limit is one row, not thousands. The store is per process, so with several instances expect up to one row per
 * instance per window.
 */
// Loaded on first use so that importing the limiters (routes, unit tests) does not pull in the database layer.
const recordBlocked = async (...args) => (await import('../services/security-audit.service.js')).recordRateLimited(...args);

export const createLimiter = (windowMs, limit, message, { skip = () => env.isTest, name = 'unnamed', onBlocked = recordBlocked } = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip,
    handler: async (req, res) => {
      if (req.rateLimit?.used === req.rateLimit?.limit + 1) {
        try {
          await onBlocked(req, { limiter: name, limit, windowMs });
        } catch { /* a signal that cannot be recorded must not change the 429 */ }
      }
      res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message },
        requestId: req.id,
      });
    },
  });

export const apiLimiter = createLimiter(15 * 60 * 1000, 1000, 'Too many requests, please try again later', { name: 'api' });
export const authLimiter = createLimiter(15 * 60 * 1000, 20, 'Too many authentication attempts, please try again later', { name: 'auth' });
export const verifyLimiter = createLimiter(15 * 60 * 1000, 60, 'Too many verification attempts, please try again later', { name: 'verify' });
export const registrationLimiter = createLimiter(60 * 1000, 60, 'Too many registration requests, slow down', { name: 'registration' });
// Online admission: activation links and admin resends of the admission email.
export const activationLimiter = createLimiter(15 * 60 * 1000, 10, 'Too many activation attempts, please try again later', { name: 'activation' });
// Official photo uploads re-encode an image each time, so cap how often one account can ask.
export const photoLimiter = createLimiter(15 * 60 * 1000, 30, 'Too many photo uploads, please try again later', { name: 'photo' });
export const resendLimiter = createLimiter(15 * 60 * 1000, 10, 'Too many activation emails sent, please try again later', { name: 'resend' });
