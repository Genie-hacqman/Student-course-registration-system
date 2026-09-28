import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLogArgs } from '../../src/config/logger.js';

describe('normalizeLogArgs — turns this codebase\'s (message, extra?) calls into pino args', () => {
  test('a single string message passes through unchanged', () => {
    assert.deepEqual(normalizeLogArgs(['Connected to MySQL']), ['Connected to MySQL']);
  });

  test('message + a plain string is joined into one message', () => {
    assert.deepEqual(normalizeLogArgs(['Token cleanup failed:', 'connect ECONNREFUSED']), ['Token cleanup failed: connect ECONNREFUSED']);
  });

  test('message + an Error is hoisted into pino\'s special `err` field, not stringified', () => {
    const err = new Error('SMTP down');
    assert.deepEqual(normalizeLogArgs(['Failed to email x@example.com:', err]), [{ err }, 'Failed to email x@example.com:']);
  });

  test('message + a non-Error, non-string value is JSON-stringified into the message', () => {
    assert.deepEqual(normalizeLogArgs(['Unhandled rejection:', { code: 'EPIPE' }]), ['Unhandled rejection: {"code":"EPIPE"}']);
  });

  test('an Error passed as the sole "reason" (e.g. an unhandledRejection) is not lost', () => {
    const err = new Error('boom');
    assert.deepEqual(normalizeLogArgs(['Unhandled rejection:', err]), [{ err }, 'Unhandled rejection:']);
  });
});
