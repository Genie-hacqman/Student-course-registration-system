import 'dotenv/config';
import { z } from 'zod';

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
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    // z.coerce.boolean() would treat the string "false" as truthy (Boolean("false") === true) —
    // this compares against the literal strings instead.
    SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().optional(),

    // Both optional everywhere, including production: unlike SMTP/CORS, the app is fully
    // functional without them — you just have less visibility if something breaks. Worth
    // configuring for a real deployment, but not something to hard-fail boot over.
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
    SENTRY_DSN: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') return;
    if (!data.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required in production, so password resets and grade/registration emails can actually be sent.',
      });
    }
    if (!data.SMTP_FROM) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_FROM'], message: 'SMTP_FROM is required in production.' });
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
