import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {
  resendProvider, safeError, maskEmail, redactTokens, sendMail, ONBOARDING_SENDER, isEmailConfigured,
} from '../../src/services/email.service.js';
import env from '../../src/config/env.js';
import { createLimiter } from '../../src/middleware/rate-limit.middleware.js';

/** A stand-in for `new Resend(key)`: records calls and answers like the SDK ({ data } or { error }). */
const fakeResend = (answer) => {
  const calls = [];
  return {
    calls,
    emails: {
      send: async (payload, options) => {
        calls.push({ payload, options });
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  };
};

describe('Resend provider', () => {
  test('success: returns the message id and passes the idempotency key to Resend', async () => {
    const client = fakeResend({ data: { id: 'msg_123' }, error: null });
    const r = await resendProvider(client).send({ from: 'a@b.c', to: 'x@y.z', subject: 's', text: 't', html: '<p>t</p>' }, { idempotencyKey: 'k1' });
    assert.deepEqual(r, { id: 'msg_123' });
    assert.deepEqual(client.calls[0].options, { idempotencyKey: 'k1' });
    assert.equal(client.calls[0].payload.to, 'x@y.z');
  });

  test('an API error (returned, not thrown) becomes a failed send with a safe message', async () => {
    const client = fakeResend({ data: null, error: { name: 'validation_error', message: 'Invalid `from` for key re_AbCdEf123456', statusCode: 422 } });
    const result = await sendMail({ to: 'x@y.z', subject: 's', text: 't' }, { provider: resendProvider(client) });
    assert.equal(result.sent, false);
    assert.match(result.error, /validation_error: Invalid `from` for key re_\[redacted\] \(HTTP 422\)/);
    assert.doesNotMatch(result.error, /re_AbCdEf123456/, 'API keys never reach stored errors');
  });

  test('a thrown network error also becomes a failed send, never an exception', async () => {
    const result = await sendMail({ to: 'x@y.z', subject: 's', text: 't' }, { provider: resendProvider(fakeResend(new Error('ECONNRESET'))) });
    assert.deepEqual(result, { sent: false, error: 'ECONNRESET' });
  });

  test('success through sendMail reports "sent" (accepted), with the provider message id', async () => {
    const result = await sendMail({ to: 'x@y.z', subject: 's', text: 't' }, { provider: resendProvider(fakeResend({ data: { id: 'msg_9' } })) });
    assert.deepEqual(result, { sent: true, messageId: 'msg_9' });
  });

  test('without a provider (no RESEND_API_KEY/SMTP, or under tests) nothing is sent', async () => {
    const result = await sendMail({ to: 'x@y.z', subject: 's', text: 'Reset: https://a/reset-password?token=SECRET' });
    assert.equal(result.sent, false);
    assert.match(result.error, /not configured/);
  });
});

describe('safe logging helpers', () => {
  test('masks recipients, redacts tokens and API keys', () => {
    assert.equal(maskEmail('ama.mensah@gmail.com'), 'a***@gmail.com');
    assert.equal(redactTokens('go https://a/b?token=abc123&x=1'), 'go https://a/b?token=[redacted]&x=1');
    assert.equal(safeError({ message: 'bad key re_1234567890abc' }), 'bad key re_[redacted]');
    assert.equal(ONBOARDING_SENDER, 'SCRS <onboarding@resend.dev>');
  });
});

describe('rate limiting', () => {
  test('a limiter answers 429 with the standard error shape once the limit is used up', async () => {
    const app = express();
    app.post('/forgot', createLimiter(60_000, 2, 'Too many authentication attempts, please try again later', { skip: () => false }), (req, res) => res.json({ ok: true }));
    assert.equal((await request(app).post('/forgot')).status, 200);
    assert.equal((await request(app).post('/forgot')).status, 200);
    const limited = await request(app).post('/forgot');
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, 'TOO_MANY_REQUESTS');
  });
});

describe('isEmailConfigured (what the health check reports)', () => {
  const KEYS = ['RESEND_API_KEY', 'SMTP_HOST', 'EMAIL_FROM', 'SMTP_FROM', 'isProduction'];
  /** Runs `fn` with exactly these email settings, then restores the real ones. */
  const withEnv = (values, fn) => {
    const saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]));
    for (const k of KEYS) env[k] = k === 'isProduction' ? false : undefined;
    Object.assign(env, values);
    try { return fn(); } finally { Object.assign(env, saved); }
  };

  test('nothing configured: false', () => {
    assert.equal(withEnv({}, isEmailConfigured), false);
  });

  test('Resend with a sender: true (the case that used to report false)', () => {
    assert.equal(withEnv({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'UniReg <no-reply@school.edu>' }, isEmailConfigured), true);
  });

  test('Resend without a sender: true outside production (onboarding sender), false in production (nothing would send)', () => {
    assert.equal(withEnv({ RESEND_API_KEY: 're_test' }, isEmailConfigured), true);
    assert.equal(withEnv({ RESEND_API_KEY: 're_test', isProduction: true }, isEmailConfigured), false);
  });

  test('SMTP needs a sender too', () => {
    assert.equal(withEnv({ SMTP_HOST: 'smtp.school.edu', SMTP_FROM: 'no-reply@school.edu' }, isEmailConfigured), true);
    assert.equal(withEnv({ SMTP_HOST: 'smtp.school.edu' }, isEmailConfigured), false);
  });

  test('a sender alone, with no provider, is not configured', () => {
    assert.equal(withEnv({ EMAIL_FROM: 'no-reply@school.edu' }, isEmailConfigured), false);
  });
});
