import 'dotenv/config';
import { z } from 'zod';

const blankAsUnset = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    // Canonical link target for emails (e.g. the password-reset link). Distinct from CORS_ORIGIN,
    // which may be a comma-separated allowlist rather than one canonical URL.
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),

    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    // Most managed MySQL providers (Aiven, PlanetScale, ...) require TLS. Off by default so local dev
    // against a plain MySQL install needs no change; set true (and DB_SSL_CA if the provider gives you
    // one) for a real deployment. See docs/deployment-runbook.md.
    DB_SSL: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    DB_SSL_CA: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(7),

    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    PASSWORD_RESET_EXPIRES_MINUTES: z.coerce.number().int().positive().default(30),
    // Invite links for staff-created accounts (set-your-password emails). Longer than a reset link,
    // since an invite arrives unannounced and may sit in an inbox for a few days.
    INVITE_EXPIRES_HOURS: z.coerce.number().int().positive().default(72),
    // Activation links emailed to admitted online applicants (single use).
    ACTIVATION_EXPIRES_HOURS: z.coerce.number().int().positive().default(72),

    // Optional outside production: with SMTP_HOST unset, email.service.js logs instead of sending,
    // so local dev/test need no mail server. Required in production — see the check below.
    SMTP_HOST: z.string().optional(),
    // An empty value (`SMTP_PORT=`) means "not set", so the default applies instead of failing.
    SMTP_PORT: z.preprocess(blankAsUnset, z.coerce.number().int().positive().default(587)),
    // z.coerce.boolean() would treat the string "false" as truthy (Boolean("false") === true) —
    // this compares against the literal strings instead.
    SMTP_SECURE: z.preprocess(blankAsUnset, z.enum(['true', 'false']).default('false')).transform((v) => v === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    // Resend (preferred email provider). With RESEND_API_KEY set, email goes through Resend; otherwise
    // SMTP_HOST (nodemailer); otherwise emails are only logged (dev/test).
    RESEND_API_KEY: z.string().trim().optional(),
    // Signing secret of the Resend webhook (whsec_…); without it POST /api/webhooks/resend refuses events.
    RESEND_WEBHOOK_SECRET: z.string().trim().optional(),
    // Sender, e.g. "SCRS <no-reply@mail.school.edu>" (a Resend-verified domain). Falls back to SMTP_FROM.
    EMAIL_FROM: z.string().trim().optional(),
    // Name used in emails when the institution.name setting still holds its stock default.
    SCHOOL_NAME: z.string().trim().max(150).optional(),
    // Fallback for the institution.studentEmailDomain setting (the setting wins when set).
    SCHOOL_EMAIL_DOMAIN: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'SCHOOL_EMAIL_DOMAIN must be a domain like school.edu').optional().or(z.literal('')),
    // Development only: include token links in the "email not configured" log instead of redacting them.
    EMAIL_LOG_LINKS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

    // Both optional everywhere, including production: unlike SMTP/CORS, the app is fully
    // functional without them — you just have less visibility if something breaks. Worth
    // configuring for a real deployment, but not something to hard-fail boot over.
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
    SENTRY_DSN: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') return;
    if (!data.RESEND_API_KEY && !data.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY (or SMTP_HOST) is required in production, so activation, password-reset and registration emails can actually be sent.',
      });
    }
    if (data.EMAIL_LOG_LINKS) {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_LOG_LINKS'], message: 'EMAIL_LOG_LINKS must not be enabled in production: it writes raw account tokens to the logs.' });
    }
    const from = data.EMAIL_FROM || data.SMTP_FROM;
    if (!from) {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'EMAIL_FROM is required in production (an address on your Resend-verified domain).' });
    } else if (/@resend\.dev\b/i.test(from)) {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'EMAIL_FROM cannot be the Resend onboarding sender in production; use your verified domain.' });
    }

    // The refresh cookie is Secure + SameSite=Strict, which only works over HTTPS, and a wildcard
    // or leftover localhost origin would either break the credentialed CORS handshake the frontend
    // needs (browsers refuse `Access-Control-Allow-Origin: *` when credentials are involved) or
    // quietly leave a dev origin allowed in production. Both fail silently at the browser, not here,
    // so this is checked at boot instead of being discovered later as "login doesn't work in prod".
    const origins = data.CORS_ORIGIN.split(',').map((o) => o.trim());
    for (const origin of origins) {
      if (origin === '*') {
        ctx.addIssue({ code: 'custom', path: ['CORS_ORIGIN'], message: 'CORS_ORIGIN cannot be "*" in production — credentialed cross-origin requests require an exact origin.' });
      } else if (!origin.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['CORS_ORIGIN'], message: `CORS_ORIGIN entry "${origin}" must use https:// in production.` });
      } else if (/localhost|127\.0\.0\.1/.test(origin)) {
        ctx.addIssue({ code: 'custom', path: ['CORS_ORIGIN'], message: `CORS_ORIGIN entry "${origin}" looks like a dev origin — remove it in production.` });
      }
    }
    if (!data.FRONTEND_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'FRONTEND_URL must use https:// in production.' });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

export default {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  corsOrigins: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  dbName: env.NODE_ENV === 'test' ? `${env.DB_NAME}_test` : env.DB_NAME,
  logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'error' : env.NODE_ENV === 'production' ? 'info' : 'debug'),
};
