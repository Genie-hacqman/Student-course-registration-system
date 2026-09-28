import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/**
 * env.js reads SENTRY_DSN once at import time, so exercising both the "not configured" and
 * "configured" paths needs two real processes, not two in-process calls — matches the pattern in
 * env-safety.test.js. Confirms both paths complete quickly and never throw, so a Sentry outage or
 * a missing/invalid DSN can never be the thing that breaks a request.
 */
const BASE_ENV = { PATH: process.env.PATH, DB_NAME: 'x', DB_USER: 'x', JWT_ACCESS_SECRET: 'a'.repeat(32) };

const SCRIPT = `
import('./src/config/sentry.js').then(({ initSentry, captureException }) => {
  initSentry();
  captureException(new Error('test error'), { requestId: 'abc' });
  console.log('OK');
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
`;

const run = (extraEnv) => execFileSync(process.execPath, ['-e', SCRIPT], {
  cwd: new URL('../..', import.meta.url),
  env: { ...BASE_ENV, ...extraEnv },
  timeout: 5000,
}).toString();

describe('sentry.js never throws and never blocks, configured or not', () => {
  test('with no SENTRY_DSN, both calls are no-ops', () => {
    assert.equal(run({}).trim(), 'OK');
  });

  test('with a real-looking SENTRY_DSN, both calls still complete without throwing', () => {
    assert.equal(run({ SENTRY_DSN: 'https://abc123@o0.ingest.sentry.io/0' }).trim(), 'OK');
  });
});
