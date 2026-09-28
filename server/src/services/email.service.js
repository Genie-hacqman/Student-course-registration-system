import nodemailer from 'nodemailer';
import env from '../config/env.js';
import logger from '../config/logger.js';

let cachedTransporter;

/**
 * Lazily built and cached. `null` when SMTP isn't configured — outside production only;
 * env.js refuses to boot in production without SMTP_HOST/SMTP_FROM set.
 */
const getDefaultTransporter = () => {
  if (cachedTransporter !== undefined) return cachedTransporter;
  cachedTransporter = env.SMTP_HOST
    ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    })
    : null;
  return cachedTransporter;
};

/**
 * Sends an email, or logs it when SMTP isn't configured (dev/test).
 * Never throws: a failed send must not fail the business action that triggered it — callers get
 * `{ sent: false }` back instead. Pass `transporter` to use one other than the env-configured
 * default (tests inject nodemailer's jsonTransport/streamTransport to avoid any real network call).
 */
/** Hides token values in links (activation, reset, verification) so raw tokens never reach the logs. */
export const redactTokens = (text) => String(text ?? '').replace(/([?&]token=)[^\s&"'<>]+/g, '$1[redacted]');

export const sendMail = async ({ to, subject, text, html }, { transporter = getDefaultTransporter() } = {}) => {
  if (!transporter) {
    const body = env.EMAIL_LOG_LINKS ? text : redactTokens(text);
    logger.info(`[email not configured] to=${to} subject="${subject}"\n${body}`);
    return { sent: false, error: 'Email is not configured on the server (SMTP_HOST is not set)' };
  }
  try {
    const info = await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text, html });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Failed to email ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
};
