import env from '../config/env.js';
import * as templates from './email/templates.js';
import * as settingService from './setting.service.js';
import { sendMail } from './email.service.js';

/*
 * Branded, logged email: renders a template from email/templates.js and sends it through
 * email.service.sendMail with the delivery log on. Every caller should pass an `idempotencyKey`
 * that identifies the logical email (so a retried request never sends it twice) and, where it
 * applies, the user and the record it's about.
 */

/** The school's name: the institution.name setting, unless it still holds its stock default and SCHOOL_NAME is set. */
export const schoolName = async () => {
  const setting = await settingService.get('institution.name').catch(() => null);
  const stock = settingService.DEFAULTS['institution.name'];
  if (setting && setting !== stock) return setting;
  return env.SCHOOL_NAME || setting || stock;
};

/** Renders `template` with `data` and sends it. Never throws; returns sendMail's result. */
export const sendTemplate = async (template, data, { to, idempotencyKey, userId, entityType, entityId } = {}) => {
  const render = templates[template];
  if (!render) throw new Error(`Unknown email template ${template}`); // a programming error, not a delivery failure
  const message = render(data, { school: await schoolName(), frontendUrl: env.FRONTEND_URL });
  return sendMail({ to, ...message }, { template, idempotencyKey, userId, entityType, entityId });
};

/** A stable, non-secret fingerprint of a token for idempotency keys (the first 16 hex chars of its sha256). */
export const tokenKey = (tokenHash) => String(tokenHash).slice(0, 16);
