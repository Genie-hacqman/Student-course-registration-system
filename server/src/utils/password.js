import bcrypt from 'bcryptjs';
import env from '../config/env.js';

export const hashPassword = (plain) => bcrypt.hash(plain, env.isTest ? 4 : env.BCRYPT_ROUNDS);

export const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

export const hashTemporaryPin = (pin) => bcrypt.hash(pin, env.isTest ? 4 : Math.min(10, env.BCRYPT_ROUNDS));

export const UNUSABLE_PASSWORD_HASH = '!invite-pending';
