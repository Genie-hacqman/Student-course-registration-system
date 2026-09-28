import { User } from '../models/index.js';
import env from '../config/env.js';
import { generateOpaqueToken, hashToken } from '../utils/jwt.js';
import * as emailService from './email.service.js';
import * as audit from './audit.service.js';
import * as settingService from './setting.service.js';

/**
 * Stores a fresh reset token and emails the link. Used directly for the super admin, and on approval
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

  const resetLink = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  await emailService.sendMail({
    to: user.email,
    subject: 'Reset your password',
    text: `${actor ? 'Your password reset request was approved. ' : 'We received a request to reset your password. '}This link expires in ${env.PASSWORD_RESET_EXPIRES_MINUTES} minutes:\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
  });

  await audit.log({ userId: actor?.id ?? user.id, action: 'auth.password_reset_issued', entityType: 'User', entityId: user.id });
  return token;
};

/**
 * Invite for an account staff created without a password: the same token and `/reset-password` page as
 * a reset, but a longer expiry and "set your password" wording. Call it only after the account's
 * transaction commits, so an invite can never point at a rolled-back user. Returns the raw token for tests only.
 */
export const issueInvite = async (user, { actor } = {}) => {
  const token = generateOpaqueToken();
  await User.update(
    {
      passwordResetHash: hashToken(token),
      passwordResetExpires: new Date(Date.now() + env.INVITE_EXPIRES_HOURS * 60 * 60 * 1000),
    },
    { where: { id: user.id } },
  );

  const institution = await settingService.get('institution.name');
  const link = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  await emailService.sendMail({
    to: user.email,
    subject: `Your ${institution} account`,
    text: `Hello ${user.firstName},\n\nAn account has been created for you on ${institution}. Sign in with this email address (${user.email}) after choosing your password here. This link expires in ${env.INVITE_EXPIRES_HOURS} hours:\n\n${link}\n\nIf the link has expired, ask your registrar to send a new invite.`,
  });

  await audit.log({ userId: actor?.id ?? user.id, action: 'auth.invite_issued', entityType: 'User', entityId: user.id });
  return token;
};
