import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

/** Exported for tests, which build a limiter with `skip: () => false` to exercise the real behaviour. */
export const createLimiter = (windowMs, limit, message, { skip = () => env.isTest } = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip,
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message },
        requestId: req.id,
      }),
  });

export const apiLimiter = createLimiter(15 * 60 * 1000, 1000, 'Too many requests, please try again later');
export const authLimiter = createLimiter(15 * 60 * 1000, 20, 'Too many authentication attempts, please try again later');
export const verifyLimiter = createLimiter(15 * 60 * 1000, 60, 'Too many verification attempts, please try again later');
export const registrationLimiter = createLimiter(60 * 1000, 60, 'Too many registration requests, slow down');
// Online admission: activation links and admin resends of the admission email.
export const activationLimiter = createLimiter(15 * 60 * 1000, 10, 'Too many activation attempts, please try again later');
// Official photo uploads re-encode an image each time, so cap how often one account can ask.
export const photoLimiter = createLimiter(15 * 60 * 1000, 30, 'Too many photo uploads, please try again later');
export const resendLimiter = createLimiter(15 * 60 * 1000, 10, 'Too many activation emails sent, please try again later');
