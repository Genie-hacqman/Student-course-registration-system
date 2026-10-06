import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/**
 * env.js validates process.env with zod and calls process.exit(1) on failure — it cannot be
 * imported in-process with bad config without killing the test runner itself. Each case here
 * spawns a real `node` subprocess with its own environment, exactly reproducing how the real
 * server would boot, and inspects the exit code and the printed error.
 */
const BASE_ENV = {
  PATH: process.env.PATH,
  DB_NAME: 'x',
  DB_USER: 'x',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  AUDIT_HMAC_SECRET: 'b'.repeat(32),
};

const runEnvJs = (extraEnv) => {
  try {
    execFileSync(
      process.execPath,
      ['-e', "import('./src/config/env.js')"],
      { cwd: new URL('../..', import.meta.url), env: { ...BASE_ENV, ...extraEnv }, stdio: 'pipe' },
    );
    return { exitCode: 0 };
  } catch (err) {
    return { exitCode: err.status, stderr: err.stderr.toString() };
  }
};

const PRODUCTION_SMTP = { SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'x', EMAIL_FROM: '' };

describe('env.js refuses an unsafe cross-origin setup in production', () => {
  test('a wildcard CORS_ORIGIN is rejected', () => {
    const result = runEnvJs({ NODE_ENV: 'production', ...PRODUCTION_SMTP, CORS_ORIGIN: '*', FRONTEND_URL: 'https://app.example.edu' });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /CORS_ORIGIN cannot be "\*"/);
  });

  test('a plain http:// CORS_ORIGIN is rejected (Secure cookies need https)', () => {
    const result = runEnvJs({
      NODE_ENV: 'production', ...PRODUCTION_SMTP, CORS_ORIGIN: 'http://app.example.edu', FRONTEND_URL: 'https://app.example.edu',
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /must use https/);
  });

  test('a leftover localhost origin is rejected even over https', () => {
    const result = runEnvJs({
      NODE_ENV: 'production', ...PRODUCTION_SMTP, CORS_ORIGIN: 'https://localhost:5173', FRONTEND_URL: 'https://app.example.edu',
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /looks like a dev origin/);
  });

  test('the default CORS_ORIGIN (unset in production) is rejected', () => {
    const result = runEnvJs({ NODE_ENV: 'production', ...PRODUCTION_SMTP, FRONTEND_URL: 'https://app.example.edu' });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /CORS_ORIGIN/);
  });

  test('a non-https FRONTEND_URL is rejected even when CORS_ORIGIN is fine', () => {
    const result = runEnvJs({
      NODE_ENV: 'production', ...PRODUCTION_SMTP, CORS_ORIGIN: 'https://app.example.edu', FRONTEND_URL: 'http://app.example.edu',
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /FRONTEND_URL must use https/);
  });

  test('a real subdomain setup — https origin, no wildcard, no localhost — boots cleanly', () => {
    const result = runEnvJs({
      NODE_ENV: 'production', ...PRODUCTION_SMTP, CORS_ORIGIN: 'https://app.university.edu', FRONTEND_URL: 'https://app.university.edu',
    });
    assert.equal(result.exitCode, 0);
  });

  test('development keeps its localhost/http defaults — this check is production-only', () => {
    const result = runEnvJs({ NODE_ENV: 'development' });
    assert.equal(result.exitCode, 0);
  });
});

describe('env.js requires a working email sender in production', () => {
  // Empty values are set explicitly: dotenv never overrides them with the developer's local .env.
  const PROD = {
    NODE_ENV: 'production', CORS_ORIGIN: 'https://app.university.edu', FRONTEND_URL: 'https://app.university.edu',
    RESEND_API_KEY: '', SMTP_HOST: '', EMAIL_FROM: '', SMTP_FROM: '',
  };

  test('no Resend key and no SMTP host is rejected', () => {
    const result = runEnvJs({ ...PROD, EMAIL_FROM: 'SCRS <no-reply@mail.university.edu>' });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /RESEND_API_KEY \(or SMTP_HOST\) is required in production/);
  });

  test('a Resend key without EMAIL_FROM is rejected', () => {
    const result = runEnvJs({ ...PROD, RESEND_API_KEY: 're_test_key' });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /EMAIL_FROM is required in production/);
  });

  test('the Resend onboarding sender is refused in production', () => {
    const result = runEnvJs({ ...PROD, RESEND_API_KEY: 're_test_key', EMAIL_FROM: 'SCRS <onboarding@resend.dev>' });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /onboarding sender/);
  });

  test('Resend with a verified-domain sender boots', () => {
    const result = runEnvJs({ ...PROD, RESEND_API_KEY: 're_test_key', EMAIL_FROM: 'SCRS <no-reply@mail.university.edu>' });
    assert.equal(result.exitCode, 0, result.stderr);
  });
});

describe('env.js requires a dedicated audit signing key in production', () => {
  const PROD = {
    NODE_ENV: 'production', CORS_ORIGIN: 'https://app.university.edu', FRONTEND_URL: 'https://app.university.edu',
    RESEND_API_KEY: 're_test_key', EMAIL_FROM: 'SCRS <no-reply@mail.university.edu>', SMTP_HOST: '', SMTP_FROM: '',
  };

  test('a missing AUDIT_HMAC_SECRET is rejected', () => {
    const result = runEnvJs({ ...PROD, AUDIT_HMAC_SECRET: '' });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /AUDIT_HMAC_SECRET is required in production/);
  });

  test('reusing the JWT secret is rejected', () => {
    const result = runEnvJs({ ...PROD, AUDIT_HMAC_SECRET: 'a'.repeat(32) });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /must differ from JWT_ACCESS_SECRET/);
  });

  test('outside production no extra key is needed', () => {
    const result = runEnvJs({ NODE_ENV: 'development', AUDIT_HMAC_SECRET: '' });
    assert.equal(result.exitCode, 0, result.stderr);
  });
});
