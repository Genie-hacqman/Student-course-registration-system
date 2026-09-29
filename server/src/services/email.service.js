import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { UniqueConstraintError } from 'sequelize';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { EmailDelivery } from '../models/index.js';
import { EMAIL_STATUS } from '../utils/constants.js';

/*
 * The only place that sends email. Providers, in order: Resend (RESEND_API_KEY), SMTP (SMTP_HOST,
 * nodemailer), else nothing — the email is logged with token links redacted (dev). Under NODE_ENV=test a
 * real provider is never used (nor under `node --test`) unless a test injects one, so a developer's .env
 * can't make tests send mail.
 *
 * sendMail never throws: a failed send must not fail (or roll back) the business action that triggered it.
 * With a `template`, every attempt is recorded in email_deliveries; with an `idempotencyKey`, an email
 * that was already accepted is not sent again (and the key is passed to Resend, which dedupes for 24 h).
 */

export const ONBOARDING_SENDER = 'SCRS <onboarding@resend.dev>';

/** EMAIL_FROM, else SMTP_FROM; outside production with Resend, the onboarding sender (reaches only the account owner). */
export const senderAddress = () => env.EMAIL_FROM
  || env.SMTP_FROM
  || (env.RESEND_API_KEY && !env.isProduction ? ONBOARDING_SENDER : undefined);

/** Hides token values in links (activation, reset, verification) so raw tokens never reach the logs. */
export const redactTokens = (text) => String(text ?? '').replace(/([?&]token=)[^\s&"'<>]+/g, '$1[redacted]');

/** "ama.mensah@gmail.com" → "a***@gmail.com": enough to tell addresses apart in logs, not to harvest them. */
export const maskEmail = (email) => String(email ?? '').replace(/^(.)[^@]*(@.*)$/, '$1***$2');

/** A provider error reduced to something safe to store and log (no API keys, bounded length). */
export const safeError = (error) => {
  const name = error?.name && error.name !== 'Error' ? `${error.name}: ` : '';
  const status = error?.statusCode ? ` (HTTP ${error.statusCode})` : '';
  return `${name}${String(error?.message ?? error ?? 'Unknown error')}${status}`
    .replace(/re_[A-Za-z0-9_]{6,}/g, 're_[redacted]')
    .slice(0, 250);
};

class ProviderError extends Error {}

/** Resend. Its SDK reports failures as `{ error }` rather than throwing; both become a ProviderError. */
export const resendProvider = (client) => ({
  name: 'resend',
  async send({ from, to, subject, text, html }, { idempotencyKey } = {}) {
    const { data, error } = await client.emails.send({ from, to, subject, text, html }, idempotencyKey ? { idempotencyKey } : undefined);
    if (error) throw new ProviderError(safeError(error));
    return { id: data?.id ?? null };
  },
});

/** SMTP via nodemailer (the pre-Resend setup), also what tests inject as `{ transporter }`. */
export const smtpProvider = (transporter) => ({
  name: 'smtp',
  async send({ from, to, subject, text, html }) {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    return { id: info?.messageId ?? null };
  },
});

let cachedProvider;
let testProvider; // undefined = not overridden; null = force "not configured"

/** Tests only: route every email through `provider` (a mock with `send`), or `undefined` to reset. */
export const setEmailProviderForTests = (provider) => {
  testProvider = provider;
};

// node --test sets NODE_TEST_CONTEXT in every test process, including `npm run test:unit` (no NODE_ENV).
const underTest = () => env.isTest || Boolean(process.env.NODE_TEST_CONTEXT);

const defaultProvider = () => {
  if (testProvider !== undefined) return testProvider;
  if (underTest()) return null;
  if (cachedProvider === undefined) {
    if (env.RESEND_API_KEY) cachedProvider = resendProvider(new Resend(env.RESEND_API_KEY));
    else if (env.SMTP_HOST) {
      cachedProvider = smtpProvider(nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      }));
    } else cachedProvider = null;
  }
  return cachedProvider;
};

// Statuses meaning "the provider has it": a retry with the same key must not send again.
const ACCEPTED = [EMAIL_STATUS.SENT, EMAIL_STATUS.DELIVERED, EMAIL_STATUS.DELIVERY_DELAYED];

/** Writes (or updates) the delivery row. Never throws: logging must not break sending. */
const record = async (existing, fields) => {
  try {
    if (existing) return await existing.update({ ...fields, attempts: existing.attempts + 1 });
    return await EmailDelivery.create(fields);
  } catch (err) {
    if (err instanceof UniqueConstraintError && fields.idempotencyKey) {
      const row = await EmailDelivery.findOne({ where: { idempotencyKey: fields.idempotencyKey } }).catch(() => null);
      if (row) return row.update({ ...fields, attempts: row.attempts + 1 }).catch(() => row);
    }
    logger.error(`Could not record email delivery (${fields.template}): ${err.message}`);
    return null;
  }
};

/**
 * Sends one email. Returns `{ sent, duplicate?, messageId?, error?, deliveryId? }` and never throws.
 * `sent` means the provider accepted it, not that it was delivered (see the Resend webhook).
 *
 * Options: `template` (a name — also turns on the delivery log), `idempotencyKey`, `userId`,
 * `entityType`/`entityId` (what it's about), and for tests `transporter` (nodemailer) or `provider`.
 */
export const sendMail = async ({ to, subject, text, html }, options = {}) => {
  const { transporter, template, idempotencyKey, userId, entityType, entityId } = options;
  const provider = options.provider ?? (transporter ? smtpProvider(transporter) : defaultProvider());
  const logged = Boolean(template);

  let existing = null;
  if (logged && idempotencyKey) {
    existing = await EmailDelivery.findOne({ where: { idempotencyKey } }).catch(() => null);
    if (existing && ACCEPTED.includes(existing.status)) {
      return { sent: true, duplicate: true, messageId: existing.providerMessageId, deliveryId: existing.id };
    }
  }

  let outcome;
  const from = senderAddress();
  if (!provider || !from) {
    const body = env.EMAIL_LOG_LINKS ? text : redactTokens(text);
    logger.info(`[email not configured] to=${maskEmail(to)} subject="${subject}"\n${body}`);
    outcome = {
      provider: 'log',
      status: EMAIL_STATUS.NOT_CONFIGURED,
      error: provider ? 'No sender address (set EMAIL_FROM)' : 'Email is not configured on the server (set RESEND_API_KEY)',
    };
  } else {
    try {
      const { id } = await provider.send({ from, to, subject, text, html }, { idempotencyKey });
      outcome = { provider: provider.name, status: EMAIL_STATUS.SENT, messageId: id };
    } catch (err) {
      const error = err instanceof ProviderError ? err.message : safeError(err);
      logger.error(`Email to ${maskEmail(to)} failed${template ? ` (${template})` : ''}: ${error}`);
      outcome = { provider: provider.name, status: EMAIL_STATUS.FAILED, error };
    }
  }

  const row = logged
    ? await record(existing, {
      idempotencyKey: idempotencyKey ?? null,
      template,
      recipient: String(to).slice(0, 191),
      subject: String(subject).slice(0, 255),
      userId: userId ?? null,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      provider: outcome.provider,
      providerMessageId: outcome.messageId ?? null,
      status: outcome.status,
      error: outcome.error ?? null,
    })
    : null;

  const sent = outcome.status === EMAIL_STATUS.SENT;
  return {
    sent,
    ...(sent ? { messageId: outcome.messageId } : { error: outcome.error }),
    ...(row ? { deliveryId: row.id } : {}),
  };
};
