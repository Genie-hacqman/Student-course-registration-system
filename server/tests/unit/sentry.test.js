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

  test('a blank SENTRY_DSN (as in .env.example) counts as not set and never blocks start-up', () => {
    assert.equal(run({ SENTRY_DSN: '' }).trim(), 'OK');
  });

  test('with a real-looking SENTRY_DSN, both calls still complete without throwing', () => {
    assert.equal(run({ SENTRY_DSN: 'https://abc123@o0.ingest.sentry.io/0' }).trim(), 'OK');
  });
});

describe('scrubEvent: nothing secret leaves the server', () => {
  test('redacts token/code query values and drops secret-named fields', async () => {
    const { scrubEvent } = await import('../../src/config/sentry.js');
    const out = scrubEvent({
      message: 'failed GET /api/applications/activate?token=abc123&x=1',
      request: { url: 'https://api/reset-password?token=SECRET', cookies: { scrs_refresh: 'r' }, data: '{"password":"p"}', headers: { authorization: 'Bearer x', 'user-agent': 'ua' } },
      extra: { requestId: 'r1', path: '/api/registrations/verify/REF?code=ZZZ', password: 'p', nested: { pin: '1234', ok: 1 } },
      exception: { values: [{ type: 'Error', value: 'bad link ?token=T0K3N' }] },
      breadcrumbs: [{ message: 'GET /verify-email?token=AAA', data: { url: '/x?code=BBB', authorization: 'y' } }],
    });
    const text = JSON.stringify(out);
    for (const secret of ['abc123', 'SECRET', 'ZZZ', 'T0K3N', 'AAA', 'BBB', 'Bearer x', '"password"', '1234', 'scrs_refresh']) {
      assert.equal(text.includes(secret), false, `leaked ${secret}`);
    }
    assert.equal(out.extra.requestId, 'r1');
    assert.equal(out.extra.nested.ok, 1);
    assert.equal(out.request.headers['user-agent'], 'ua');
    assert.match(out.message, /token=\[redacted\]&x=1/);
  });
});

