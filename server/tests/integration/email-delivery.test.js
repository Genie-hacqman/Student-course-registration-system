import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Webhook } from 'standardwebhooks';
import {
  resetDatabase, requireManualApproval, api, loginAs, login, auth, query, sectionIdFor, createStudent, createAdmin, sequelize, STUDENT_PIN,
} from './helpers.js';
import env from '../../src/config/env.js';
import { hashToken } from '../../src/utils/jwt.js';
import { sendMail, setEmailProviderForTests } from '../../src/services/email.service.js';
import { emailAnnouncement } from '../../src/services/announcement.service.js';

const outbox = [];
let mode = 'ok';
let n = 0;
const provider = {
  name: 'resend',
  async send(message, options) {
    outbox.push({ ...message, options });
    if (mode === 'fail') throw new Error('rate_limit_exceeded: Too many requests (HTTP 429)');
    n += 1;
    return { id: `msg_${n}` };
  },
};

const deliveries = (where = '1=1', replacements = {}) => query(`SELECT * FROM email_deliveries WHERE ${where} ORDER BY id`, replacements);
const waitFor = async (fn, ms = 3000) => {
  const until = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error('timed out waiting');
    await new Promise((r) => { setTimeout(r, 25); });
  }
};
const deliveryFor = (template, recipient) => waitFor(async () => (await deliveries('template = :template AND recipient = :recipient', { template, recipient })).at(-1));

let registrar;
let admin;

before(async () => {
  resetDatabase();
  await requireManualApproval();
  setEmailProviderForTests(provider);
  [registrar, admin] = await Promise.all([loginAs('registrar'), loginAs('admin')]);
});
after(() => {
  setEmailProviderForTests(undefined);
  env.RESEND_WEBHOOK_SECRET = undefined;
  return sequelize.close();
});

describe('delivery log and retries', () => {
  test('a logged send records the provider message id; the same idempotency key never sends twice', async () => {
    const before = outbox.length;
    const first = await sendMail({ to: 'dup@test.local', subject: 'Once', text: 'x' }, { template: 'notification', idempotencyKey: 'test:dup' });
    const second = await sendMail({ to: 'dup@test.local', subject: 'Once', text: 'x' }, { template: 'notification', idempotencyKey: 'test:dup' });
    assert.equal(first.sent, true);
    assert.deepEqual([second.sent, second.duplicate], [true, true]);
    assert.equal(outbox.length, before + 1, 'the provider was called once');
    assert.equal(outbox.at(-1).options.idempotencyKey, 'test:dup', 'the key is passed on to Resend too');
    const [row] = await deliveries("idempotency_key = 'test:dup'");
    assert.deepEqual([row.status, row.attempts, row.provider, row.provider_message_id], ['sent', 1, 'resend', first.messageId]);
  });

  test('a failed send is recorded and can be retried with the same key', async () => {
    mode = 'fail';
    const failed = await sendMail({ to: 'retry@test.local', subject: 'Retry', text: 'x' }, { template: 'notification', idempotencyKey: 'test:retry' });
    assert.deepEqual([failed.sent, failed.error], [false, 'rate_limit_exceeded: Too many requests (HTTP 429)']);
    let [row] = await deliveries("idempotency_key = 'test:retry'");
    assert.deepEqual([row.status, row.attempts], ['failed', 1]);

    mode = 'ok';
    assert.equal((await sendMail({ to: 'retry@test.local', subject: 'Retry', text: 'x' }, { template: 'notification', idempotencyKey: 'test:retry' })).sent, true);
    [row] = await deliveries("idempotency_key = 'test:retry'");
    assert.deepEqual([row.status, row.attempts, row.error], ['sent', 2, null]);
  });

  test('bodies (which carry single-use links) are never stored', async () => {
    const columns = (await query('SHOW COLUMNS FROM email_deliveries')).map((c) => c.Field);
    assert.ok(!columns.some((c) => /body|text|html/.test(c)), columns.join(','));
  });
});

describe('account emails and tokens', () => {
  test('sign-up sends a branded verification email to the personal address; the link works once', async () => {
    const email = 'fresh.applicant@gmail.com';
    const res = await api().post('/api/applications/account').send({ firstName: 'Fresh', lastName: 'Applicant', email, password: 'Applicant1pass' });
    assert.equal(res.status, 202);
    const row = await deliveryFor('emailVerification', email);
    assert.equal(row.status, 'sent');
    const mail = outbox.findLast((m) => m.to === email);
    assert.match(mail.html, /Confirm email address/);

    const raw = 'planted-verification-token-'.padEnd(48, 'v');
    await query('UPDATE users SET email_verification_hash = :h, email_verification_expires = NOW() + INTERVAL 1 HOUR WHERE email = :email', { h: hashToken(raw), email });
    const [a, b] = await Promise.all([
      api().post('/api/auth/verify-email').send({ token: raw }),
      api().post('/api/auth/verify-email').send({ token: raw }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 400], 'single use, even in parallel');
  });

  test('password reset: single use (even in parallel), expiry enforced, completion alert sent', async () => {
    const other = await createAdmin(7);
    const raw = 'planted-reset-token-'.padEnd(48, 'r');
    const plant = (expires) => query(
      `UPDATE users SET password_reset_hash = :h, password_reset_expires = ${expires} WHERE email = :email`,
      { h: hashToken(raw), email: other.email },
    );

    await plant('NOW() - INTERVAL 1 MINUTE');
    assert.equal((await api().post('/api/auth/reset-password').send({ token: raw, password: 'NewPassw0rd1' })).status, 400, 'expired');

    await plant('NOW() + INTERVAL 30 MINUTE');
    const [a, b] = await Promise.all([
      api().post('/api/auth/reset-password').send({ token: raw, password: 'NewPassw0rd1' }),
      api().post('/api/auth/reset-password').send({ token: raw, password: 'OtherPassw0rd2' }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 400]);
    assert.equal((await api().post('/api/auth/reset-password').send({ token: raw, password: 'Again1passw0rd' })).status, 400, 'reuse refused');

    const alert = await deliveryFor('passwordResetCompleted', other.email);
    assert.equal(alert.status, 'sent');
    assert.doesNotMatch(outbox.findLast((m) => m.to === other.email).text, /NewPassw0rd1|OtherPassw0rd2/, 'no password in the email');
  });

  test('forgot-password answers the same for unknown and known emails', async () => {
    const known = await api().post('/api/auth/forgot-password').send({ email: admin.user.email });
    const unknown = await api().post('/api/auth/forgot-password').send({ email: 'nobody@nowhere.test' });
    assert.equal(known.status, unknown.status);
    assert.deepEqual(known.body.data, unknown.body.data);
  });

  test('changing a password sends a security alert (and never the password)', async () => {
    const other = await createAdmin(8);
    const res = await api().patch('/api/auth/password').set(auth(other.token)).send({ currentPassword: 'Passw0rd!', newPassword: 'Changed1Passw0rd' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    await deliveryFor('passwordChanged', other.email);
    assert.doesNotMatch(outbox.findLast((m) => m.to === other.email).text, /Changed1Passw0rd/);
  });

  test('replacing a temporary PIN sends no alert; a later PIN change does', async () => {
    const s = await createStudent(31);
    assert.equal((await deliveries("template = 'pinChanged' AND user_id = :id", { id: s.userId })).length, 0);
    const session = await login(s.studentNumber, STUDENT_PIN);
    const changed = await api().patch('/api/auth/pin').set(auth(session.token)).set('Cookie', session.cookie)
      .send({ currentPin: STUDENT_PIN, newPin: '739164', confirmPin: '739164' });
    assert.equal(changed.status, 200);
    await deliveryFor('pinChanged', s.email);
  });
});

describe('registration emails', () => {
  const register = async (n) => {
    const s = await createStudent(n);
    for (const code of ['CS201', 'MATH201']) {
      assert.equal((await api().post('/api/registrations/items').set(auth(s.token)).send({ courseSectionId: await sectionIdFor(code) })).status, 201);
    }
    const submitted = await api().post('/api/registrations/submit').set(auth(s.token));
    assert.equal(submitted.status, 200);
    return { ...s, registrationId: submitted.body.data.id, reference: submitted.body.data.referenceNumber };
  };

  test('submission is confirmed by email; a rejection email carries the reason', async () => {
    const s = await register(41);
    await deliveryFor('registrationSubmitted', s.email);
    assert.match(outbox.findLast((m) => m.to === s.email && /submitted/i.test(m.subject)).text, new RegExp(s.reference));

    const rejected = await api().patch(`/api/admin/registrations/${s.registrationId}/reject`).set(auth(registrar.token)).send({ remarks: 'Swap MATH201 for a core course' });
    assert.equal(rejected.status, 200);
    await deliveryFor('registrationDecision', s.email);
    assert.match(outbox.findLast((m) => m.to === s.email && /needs changes/i.test(m.subject)).text, /Reason: Swap MATH201 for a core course/);
  });

  test('an email failure never undoes the approval; the failure is recorded', async () => {
    const s = await register(42);
    mode = 'fail';
    const approved = await api().patch(`/api/admin/registrations/${s.registrationId}/approve`).set(auth(registrar.token)).send({});
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.status, 'approved');
    const row = await deliveryFor('registrationDecision', s.email);
    mode = 'ok';
    assert.equal(row.status, 'failed');
    assert.match(row.error, /rate_limit_exceeded/);
    const [{ status }] = await query('SELECT status FROM registrations WHERE id = :id', { id: s.registrationId });
    assert.equal(status, 'approved');
  });
});

describe('delivery webhook', () => {
  const secret = `whsec_${Buffer.from('scrs-test-webhook-secret-32bytes!').toString('base64')}`;
  const post = (event, { sign = secret } = {}) => {
    const payload = JSON.stringify(event);
    const id = `msg_evt_${Date.now()}_${Math.random()}`;
    const now = new Date();
    const signature = new Webhook(sign).sign(id, now, payload);
    return api().post('/api/webhooks/resend')
      .set('content-type', 'application/json')
      .set('svix-id', id).set('svix-timestamp', String(Math.floor(now.getTime() / 1000))).set('svix-signature', signature)
      .send(payload);
  };

  test('refuses events while no signing secret is configured', async () => {
    env.RESEND_WEBHOOK_SECRET = undefined;
    assert.equal((await post({ type: 'email.delivered', data: { email_id: 'x' } })).status, 503);
  });

  test('a signed "delivered" event confirms delivery; bad signatures are rejected; delivered is final', async () => {
    env.RESEND_WEBHOOK_SECRET = secret;
    const sent = await sendMail({ to: 'hook@test.local', subject: 'Hook', text: 'x' }, { template: 'notification', idempotencyKey: 'test:hook' });

    const forged = await post({ type: 'email.delivered', data: { email_id: sent.messageId } }, { sign: `whsec_${Buffer.from('some-other-secret-that-is-long!!').toString('base64')}` });
    assert.equal(forged.status, 400);
    assert.equal((await deliveries("idempotency_key = 'test:hook'"))[0].status, 'sent', 'unchanged by a forged event');

    assert.equal((await post({ type: 'email.delivered', created_at: new Date().toISOString(), data: { email_id: sent.messageId } })).status, 200);
    assert.equal((await deliveries("idempotency_key = 'test:hook'"))[0].status, 'delivered');

    assert.equal((await post({ type: 'email.delivery_delayed', data: { email_id: sent.messageId } })).status, 200);
    assert.equal((await deliveries("idempotency_key = 'test:hook'"))[0].status, 'delivered', 'a late weaker event does not downgrade it');
    assert.equal((await post({ type: 'contact.created', data: {} })).status, 200, 'unknown events are acknowledged');
  });

  test('a bounce is recorded with its reason', async () => {
    env.RESEND_WEBHOOK_SECRET = secret;
    const sent = await sendMail({ to: 'bounce@test.local', subject: 'B', text: 'x' }, { template: 'notification', idempotencyKey: 'test:bounce' });
    await post({ type: 'email.bounced', data: { email_id: sent.messageId, bounce: { message: 'Mailbox does not exist' } } });
    const [row] = await deliveries("idempotency_key = 'test:bounce'");
    assert.deepEqual([row.status, row.error], ['bounced', 'Mailbox does not exist']);
  });
});

describe('admin email log and announcements', () => {
  test('admins see the email log without bodies; registrars and students cannot', async () => {
    const res = await api().get('/api/admin/email-deliveries?status=sent&limit=5').set(auth(admin.token));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length > 0);
    assert.ok(res.body.data.every((d) => !('text' in d) && !('html' in d)));
    const student = await loginAs('student').catch(() => null);
    assert.equal((await api().get('/api/admin/email-deliveries').set(auth(registrar.token))).status, 403);
    if (student) assert.equal((await api().get('/api/admin/email-deliveries').set(auth(student.token))).status, 403);
  });

  test('an announcement is emailed to its audience once when asked, never twice', async () => {
    const res = await api().post('/api/announcements').set(auth(registrar.token))
      .send({ title: 'Exam timetable published', body: 'Check your timetable.', audience: 'all_students', emailRecipients: true });
    assert.equal(res.status, 201);
    const id = res.body.data.id;
    const recipients = res.body.data.recipientCount;
    assert.ok(recipients > 0);
    await waitFor(async () => (await deliveries("entity_type = 'Announcement' AND entity_id = :id", { id })).length === recipients);
    assert.deepEqual(await emailAnnouncement(id, [1, 2, 3]), { sent: 0, skipped: true }, 'already emailed');

    const quiet = await api().post('/api/announcements').set(auth(registrar.token))
      .send({ title: 'No email please', body: 'In-app only.', audience: 'all_students' });
    await new Promise((r) => { setTimeout(r, 200); });
    assert.equal((await deliveries("entity_type = 'Announcement' AND entity_id = :id", { id: quiet.body.data.id })).length, 0);
  });
});
