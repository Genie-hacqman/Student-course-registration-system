import bcrypt from 'bcryptjs';
import env from '../config/env.js';

export const hashPassword = (plain) => bcrypt.hash(plain, env.isTest ? 4 : env.BCRYPT_ROUNDS);

export const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

/**
 * Temporary PINs (admission, staff reset) use a lower cost: bulk admission hashes hundreds in one
 * request, and these must be replaced at first sign-in anyway. PINs the student chooses use hashPassword.
 */
export const hashTemporaryPin = (pin) => bcrypt.hash(pin, env.isTest ? 4 : Math.min(10, env.BCRYPT_ROUNDS));

/**
 * Stored for accounts created without a password (staff imports and invites). It is not a bcrypt hash,
 * so `comparePassword` always returns false for it: nobody can sign in until they set a password
 * through their invite link. It also marks "invited, never set a password" for resending invites.
 */
export const UNUSABLE_PASSWORD_HASH = '!invite-pending';
