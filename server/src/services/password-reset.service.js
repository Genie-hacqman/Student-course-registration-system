import { User } from '../models/index.js';
import env from '../config/env.js';
import { generateOpaqueToken, hashToken } from '../utils/jwt.js';
import { sendTemplate, tokenKey } from './mail.service.js';
import * as audit from './audit.service.js';

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

export const issueInvite = async (user, { actor, to } = {}) => {
  const token = generateOpaqueToken();
  await User.update(
    {
      passwordResetHash: hashToken(token),
      passwordResetExpires: new Date(Date.now() + env.INVITE_EXPIRES_HOURS * 60 * 60 * 1000),
    },
    { where: { id: user.id } },
  );

  await sendTemplate('staffInvite', {
    name: user.firstName,
    email: user.email,
    setPasswordUrl: `${env.FRONTEND_URL}/reset-password?token=${token}`,
    hours: env.INVITE_EXPIRES_HOURS,
  }, { to: to ?? user.email, idempotencyKey: `invite:${user.id}:${tokenKey(hashToken(token))}`, userId: user.id, entityType: 'User', entityId: user.id });

  await audit.log({ userId: actor?.id ?? user.id, action: 'auth.invite_issued', entityType: 'User', entityId: user.id });
  return token;
};
