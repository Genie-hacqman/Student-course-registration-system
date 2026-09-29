import { User } from '../models/index.js';
import env from '../config/env.js';
import { generateOpaqueToken, hashToken } from '../utils/jwt.js';
import { sendTemplate, tokenKey } from './mail.service.js';
import * as audit from './audit.service.js';

/**
 * Stores a fresh reset token and emails the link. Used directly for admins and applying students, and on approval
 * of a password-reset request for everyone else. Returns the raw token for internal use (tests) only.
 */
export const issuePasswordReset = async (user, { actor } = {}) => {
  const token = generateOpaqueToken();
  await User.update(
    {
      passwordResetHash: hashToken(token),
      passwordResetExpires: new Date(Date.now() + env.PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000),
    },
    { where: { id: user.id } },
  );

  const hash = hashToken(token);
  await sendTemplate('passwordResetRequest', {
    name: user.firstName,
    resetUrl: `${env.FRONTEND_URL}/reset-password?token=${token}`,
    minutes: env.PASSWORD_RESET_EXPIRES_MINUTES,
    approved: Boolean(actor),
  }, { to: user.email, idempotencyKey: `reset:${user.id}:${tokenKey(hash)}`, userId: user.id, entityType: 'User', entityId: user.id });

  await audit.log({ userId: actor?.id ?? user.id, action: 'auth.password_reset_issued', entityType: 'User', entityId: user.id });
  return token;
};

/**
 * Invite for an account staff created without a password: the same token and `/reset-password` page as
 * a reset, but a longer expiry and "set your password" wording. Call it only after the account's
 * transaction commits, so an invite can never point at a rolled-back user. Returns the raw token for tests only.
 */
export const issueInvite = async (user, { actor, to } = {}) => {
  const token = generateOpaqueToken();
  await User.update(
    {
      passwordResetHash: hashToken(token),
      passwordResetExpires: new Date(Date.now() + env.INVITE_EXPIRES_HOURS * 60 * 60 * 1000),
    },
    { where: { id: user.id } },
  );

  // `to`: e.g. a new lecturer's personal address, since they can't read the school mailbox yet.
  await sendTemplate('staffInvite', {
    name: user.firstName,
    email: user.email,
    setPasswordUrl: `${env.FRONTEND_URL}/reset-password?token=${token}`,
    hours: env.INVITE_EXPIRES_HOURS,
  }, { to: to ?? user.email, idempotencyKey: `invite:${user.id}:${tokenKey(hashToken(token))}`, userId: user.id, entityType: 'User', entityId: user.id });

  await audit.log({ userId: actor?.id ?? user.id, action: 'auth.invite_issued', entityType: 'User', entityId: user.id });
  return token;
};
