import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * `jti` identifies this exact token (revoked individually on logout);
 * `ver` must match users.token_version (bumped to revoke every token the user holds).
 */
export const signAccessToken = (user) =>
  jwt.sign({ sub: String(user.id), role: user.role, ver: user.tokenVersion ?? 0 }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
    issuer: 'scrs-api',
    jwtid: crypto.randomUUID(),
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'scrs-api' });

/** Opaque refresh/reset tokens: the raw value goes to the client, only the hash is stored. */
export const generateOpaqueToken = () => crypto.randomBytes(48).toString('base64url');

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
