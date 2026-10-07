import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { sendMail, redactTokens } from '../../src/services/email.service.js';
import { isEmailable } from '../../src/services/notification.service.js';

describe('email service', () => {
  test('falls back to logging (never throws) when SMTP is not configured', async () => {
    const result = await sendMail({ to: 'student@example.com', subject: 'Test', text: 'Hello' });
    assert.equal(result.sent, false);
    assert.match(result.error, /not configured/);
  });

  test('sends through an injected transporter and actually composes the message', async () => {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const result = await sendMail(
      { to: 'student@example.com', subject: 'Reset your password', text: 'Click the link' },
      { transporter },
    );
    assert.equal(result.sent, true);
    assert.ok(result.messageId);
  });

  test('never throws even when the transporter itself rejects', async () => {
    const transporter = { sendMail: async () => { throw new Error('SMTP connection refused'); } };
    const result = await sendMail({ to: 'x@example.com', subject: 'x', text: 'x' }, { transporter });
    assert.equal(result.sent, false);
    assert.match(result.error, /SMTP connection refused/);
  });
});

describe('token redaction in logged emails', () => {
  test('hides token values in links but keeps the rest', () => {
    const text = 'Activate: http://app/activate-account?token=abcDEF_123-xyz\nReset: http://app/reset-password?x=1&token=zzz9 done';
    const out = redactTokens(text);
    assert.equal(out, 'Activate: http://app/activate-account?token=[redacted]\nReset: http://app/reset-password?x=1&token=[redacted] done');
    assert.doesNotMatch(out, /abcDEF_123|zzz9/);
  });
});

describe('notification email allowlist', () => {
  test('emails status changes, time-sensitive events, submission confirmations and admin alerts', () => {
    for (const type of [
      'REGISTRATION_SUBMITTED', 'REGISTRATION_APPROVED', 'REGISTRATION_REJECTED', 'WAITLIST_SEAT_AVAILABLE', 'GRADES_RELEASED',
      'GRADE_AMENDED', 'SECTION_RESCHEDULED', 'SECTION_CANCELLED', 'ACCOUNT_REQUEST_CREATED', 'APPLICATION_SUBMITTED',
    ]) {
      assert.equal(isEmailable(type), true, `expected ${type} to be emailed`);
    }
  });

  test('does not email actions the student just took in-app', () => {
    for (const type of ['COURSE_REGISTERED', 'PREREQUISITE_OVERRIDE', 'REGISTRATION_TIME']) {
      assert.equal(isEmailable(type), false, `expected ${type} not to be emailed`);
    }
  });
});
