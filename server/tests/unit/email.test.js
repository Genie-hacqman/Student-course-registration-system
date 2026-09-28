import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { sendMail } from '../../src/services/email.service.js';
import { isEmailable } from '../../src/services/notification.service.js';

describe('email service', () => {
  test('falls back to logging (never throws) when SMTP is not configured', async () => {
    // The test environment has no SMTP_HOST set, exercising the real default-transporter path.
    const result = await sendMail({ to: 'student@example.com', subject: 'Test', text: 'Hello' });
    assert.deepEqual(result, { sent: false });
  });

  test('sends through an injected transporter and actually composes the message', async () => {
    // nodemailer's jsonTransport composes and returns the message without any real network I/O —
    // this is nodemailer's own recommended way to test callers without a mail server.
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

describe('notification email allowlist', () => {
  test('emails status changes and time-sensitive events', () => {
    for (const type of ['REGISTRATION_APPROVED', 'REGISTRATION_REJECTED', 'WAITLIST_SEAT_AVAILABLE', 'GRADES_RELEASED', 'GRADE_AMENDED']) {
      assert.equal(isEmailable(type), true, `expected ${type} to be emailed`);
    }
  });

  test('does not email actions the student just took in-app', () => {
    for (const type of ['COURSE_REGISTERED', 'REGISTRATION_SUBMITTED', 'PREREQUISITE_OVERRIDE', 'REGISTRATION_TIME']) {
      assert.equal(isEmailable(type), false, `expected ${type} not to be emailed`);
    }
  });
});
