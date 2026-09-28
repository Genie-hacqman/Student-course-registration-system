import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message },
        requestId: req.id,
      }),
  });

export const apiLimiter = make(15 * 60 * 1000, 1000, 'Too many requests, please try again later');
export const authLimiter = make(15 * 60 * 1000, 20, 'Too many authentication attempts, please try again later');
export const verifyLimiter = make(15 * 60 * 1000, 60, 'Too many verification attempts, please try again later');
export const registrationLimiter = make(60 * 1000, 60, 'Too many registration requests, slow down');
// Online admission: activation links and admin resends of the admission email.
export const activationLimiter = make(15 * 60 * 1000, 10, 'Too many activation attempts, please try again later');
export const resendLimiter = make(15 * 60 * 1000, 10, 'Too many activation emails sent, please try again later');
