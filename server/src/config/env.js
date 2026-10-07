import 'dotenv/config';
import crypto from 'node:crypto';
import { z } from 'zod';

const blankAsUnset = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),

    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    DB_SSL: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    DB_SSL_CA: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(7),
    AUDIT_HMAC_SECRET: z.preprocess(blankAsUnset, z.string().min(32, 'AUDIT_HMAC_SECRET must be at least 32 characters').optional()),

    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    PASSWORD_RESET_EXPIRES_MINUTES: z.coerce.number().int().positive().default(30),
    INVITE_EXPIRES_HOURS: z.coerce.number().int().positive().default(72),
    ACTIVATION_EXPIRES_HOURS: z.coerce.number().int().positive().default(72),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.preprocess(blankAsUnset, z.coerce.number().int().positive().default(587)),
    SMTP_SECURE: z.preprocess(blankAsUnset, z.enum(['true', 'false']).default('false')).transform((v) => v === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    RESEND_API_KEY: z.string().trim().optional(),
    RESEND_WEBHOOK_SECRET: z.string().trim().optional(),
    EMAIL_FROM: z.string().trim().optional(),
    SCHOOL_NAME: z.string().trim().max(150).optional(),
    SCHOOL_EMAIL_DOMAIN: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'SCHOOL_EMAIL_DOMAIN must be a domain like school.edu').optional().or(z.literal('')),
    EMAIL_LOG_LINKS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

    STORAGE_DRIVER: z.preprocess(blankAsUnset, z.enum(['s3', 'local']).optional()),
    S3_ENDPOINT: z.preprocess(blankAsUnset, z.string().url().optional()),
    S3_REGION: z.preprocess(blankAsUnset, z.string().default('auto')),
    S3_BUCKET: z.preprocess(blankAsUnset, z.string().optional()),
    S3_ACCESS_KEY_ID: z.preprocess(blankAsUnset, z.string().optional()),
    S3_SECRET_ACCESS_KEY: z.preprocess(blankAsUnset, z.string().optional()),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
    SENTRY_DSN: z.preprocess(blankAsUnset, z.string().url().optional()),
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
    if (!data.AUDIT_HMAC_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['AUDIT_HMAC_SECRET'], message: 'AUDIT_HMAC_SECRET is required in production: it signs the audit log so tampering can be detected (generate one with `openssl rand -hex 32`).' });
    } else if (data.AUDIT_HMAC_SECRET === data.JWT_ACCESS_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['AUDIT_HMAC_SECRET'], message: 'AUDIT_HMAC_SECRET must differ from JWT_ACCESS_SECRET.' });
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
    if (data.STORAGE_DRIVER === 'local') {
      ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'STORAGE_DRIVER=local is for development only; production needs an S3-compatible bucket (the disk is wiped on every deploy).' });
    }
  })
  .superRefine((data, ctx) => {
    const s3 = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
    const set = s3.filter((k) => data[k]);
    if ((data.STORAGE_DRIVER === 's3' || set.length > 0) && set.length < s3.length) {
      ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: `S3 storage needs all of ${s3.join(', ')} (missing: ${s3.filter((k) => !data[k]).join(', ')}).` });
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
  auditHmacSecret: env.AUDIT_HMAC_SECRET
    ?? crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update('scrs-audit-hmac-dev-fallback').digest('hex'),
  corsOrigins: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  storageDriver: env.STORAGE_DRIVER === 'local' ? 'local'
    : (env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) ? 's3'
      : (env.NODE_ENV === 'production' ? null : 'local'),
  dbName: env.NODE_ENV === 'test' ? `${env.DB_NAME}_test` : env.DB_NAME,
  logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'error' : env.NODE_ENV === 'production' ? 'info' : 'debug'),
};
