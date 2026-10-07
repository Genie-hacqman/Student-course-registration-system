import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as t from '../../src/services/email/templates.js';

const ctx = { school: 'Sample <University>', frontendUrl: 'https://app.example.edu' };

const samples = {
  accountActivation: { name: 'Ama', studentNumber: 'STU202600001', programName: 'CS', departmentName: 'Computing', level: 100, schoolEmail: 's@x.edu', activationUrl: 'https://app.example.edu/activate-account?token=abc', hours: 72 },
  applicationDecision: { name: 'Ama', reason: 'Incomplete results' },
  emailVerification: { name: 'Ama', verifyUrl: 'https://app.example.edu/verify-email?token=abc', hours: 24 },
  staffInvite: { name: 'Kofi', email: 'k@staff.x.edu', setPasswordUrl: 'https://app.example.edu/reset-password?token=abc', hours: 72 },
  passwordResetRequest: { name: 'Kofi', resetUrl: 'https://app.example.edu/reset-password?token=abc', minutes: 30 },
  passwordResetCompleted: { name: 'Kofi', when: 'Mon, 01 Jan 2026 10:00:00 GMT' },
  passwordChanged: { name: 'Kofi', when: 'Mon, 01 Jan 2026 10:00:00 GMT' },
  pinChanged: { name: 'Ama', when: 'Mon, 01 Jan 2026 10:00:00 GMT', recovered: false },
  pinResetCode: { studentNumber: 'STU202600001', code: '482915', minutes: 10 },
  registrationSubmitted: { name: 'Ama', reference: 'REG-2026-01-000001', semester: 'First Semester', credits: 18, needsApproval: true },
  registrationDecision: { name: 'Ama', approved: false, reason: 'Too many electives' },
  timetableChange: { name: 'Ama', title: 'Class moved', message: 'CS201 moved to LT-2.' },
  announcement: { name: 'Ama', title: 'Exams', body: 'First paragraph.\n\nSecond paragraph.', author: 'The Registrar' },
  adminAlert: { title: 'New admission application', message: 'Ama applied.', path: '/staff/applications' },
  notification: { name: 'Ama', title: 'Grades released', message: 'Your CS201 grade is available.' },
};

describe('email templates', () => {
  test('every exported template has a sample, and renders a subject, text and HTML with the branding', () => {
    const exported = Object.keys(t).filter((k) => k !== 'escapeHtml');
    assert.deepEqual(exported.sort(), Object.keys(samples).sort());
    for (const [name, data] of Object.entries(samples)) {
      const m = t[name](data, ctx);
      assert.ok(m.subject && m.text && m.html, name);
      assert.match(m.html, /Sample &lt;University&gt;/, `${name}: school name escaped in the layout`);
      assert.doesNotMatch(m.html, /Sample <University>/, `${name}: never raw`);
    }
  });

  test('links are built from FRONTEND_URL and appear in both HTML and text', () => {
    const m = t.registrationDecision({ name: 'Ama', approved: true }, ctx);
    assert.match(m.html, /https:\/\/app\.example\.edu\/student\/timetable/);
    assert.match(m.text, /https:\/\/app\.example\.edu\/student\/timetable/);
  });

  test('applicant-supplied text is escaped', () => {
    const m = t.applicationDecision({ name: '<img src=x onerror=alert(1)>', reason: '"quoted" & <b>' }, ctx);
    assert.doesNotMatch(m.html, /<img src=x/);
    assert.match(m.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(m.html, /&quot;quoted&quot; &amp; &lt;b&gt;/);
  });

  test('rejections carry their reason', () => {
    assert.match(t.registrationDecision({ name: 'A', approved: false, reason: 'Too many electives' }, ctx).text, /Reason: Too many electives/);
    assert.match(t.applicationDecision({ name: 'A', reason: 'Incomplete results' }, ctx).text, /Reason: Incomplete results/);
  });

  test('no template carries a PIN or password; only the one-time PIN reset code has a 6-digit number', () => {
    for (const [name, data] of Object.entries(samples)) {
      const { text, html } = t[name](data, ctx);
      assert.doesNotMatch(`${text} ${html}`, /password\s*:\s*(?!https?:\/\/)\S|PIN\s*:\s*\d/i, name);
      if (name !== 'pinResetCode') assert.doesNotMatch(text, /(?<![\w-])\d{6}(?![\w-])/, `${name} has no standalone 6-digit value`);
    }
  });
});
