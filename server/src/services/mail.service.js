import env from '../config/env.js';
import * as templates from './email/templates.js';
import * as settingService from './setting.service.js';
import { sendMail } from './email.service.js';

export const schoolName = async () => {
  const setting = await settingService.get('institution.name').catch(() => null);
  const stock = settingService.DEFAULTS['institution.name'];
  if (setting && setting !== stock) return setting;
  return env.SCHOOL_NAME || setting || stock;
};

export const sendTemplate = async (template, data, { to, idempotencyKey, userId, entityType, entityId } = {}) => {
  const render = templates[template];
  if (!render) throw new Error(`Unknown email template ${template}`);
  const message = render(data, { school: await schoolName(), frontendUrl: env.FRONTEND_URL });
  return sendMail({ to, ...message }, { template, idempotencyKey, userId, entityType, entityId });
};

export const tokenKey = (tokenHash) => String(tokenHash).slice(0, 16);
