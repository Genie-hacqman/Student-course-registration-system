import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, login, auth, query, sectionIdFor, sequelize,
  createApplicant, submitApplication, createStudent, createAdmin, STUDENT_PIN,
} from './helpers.js';
import * as pinService from '../../src/services/pin.service.js';
import { MAX_FAILED_LOGINS } from '../../src/services/auth.service.js';
import { resetSeen } from '../../src/utils/ttl-set.js';

let admin;
let registrar;
let lecturer;
let student;

const rows = (action, where = '') => query(`SELECT * FROM audit_logs WHERE action = :action ${where} ORDER BY id`, { action });
const count = async (action, where = '') => (await rows(action, where)).length;
const everything = async () => JSON.stringify(await query('SELECT action, metadata FROM audit_logs'));
const makeUser = async (email, role = 'LECTURER') => {
  const res = await api().post('/api/users').set(auth(admin.token)).send({ firstName: 'Sec', lastName: 'Test', email, password: 'Passw0rd!', role });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};
const signIn = (identifier, password) => api().post('/api/auth/login').send({ identifier, password });

before(async () => {
  resetDatabase();
  [admin, registrar, lecturer, student] = await Promise.all(['admin', 'registrar', 'lecturer', 'student'].map((w) => loginAs(w)));
});
after(() => sequelize.close());
beforeEach(() => resetSeen());

describe('sign-in security', () => {
  test('a right password on a suspended account is a blocked sign-in, not a failed one', async () => {
    const user = await makeUser('suspended.user@test.local');
    await api().patch(`/api/users/${user.id}`).set(auth(admin.token)).send({ status: 'suspended' });

    const res = await signIn('suspended.user@test.local', 'Passw0rd!');
    assert.equal(res.status, 403);
    const [row] = await rows('security.login_blocked');
    assert.equal(row.user_id, user.id);
    assert.equal(row.metadata.status, 'suspended');
    assert.equal(row.metadata.identifier, 'suspended.user@test.local');
    assert.ok(row.ip_address);
    assert.equal(await count('auth.login_failed', `AND user_id = ${user.id}`), 0, 'the password was right');
  });

  test('the fifth failed sign-in writes account_locked with the lock time; earlier ones do not', async () => {
    const user = await makeUser('lock.me@test.local');
    for (let i = 1; i < MAX_FAILED_LOGINS; i += 1) {
      assert.equal((await signIn('lock.me@test.local', 'Wrong@12345')).status, 401);
    }
    assert.equal(await count('security.account_locked'), 0, 'not locked yet');

    assert.equal((await signIn('lock.me@test.local', 'Wrong@12345')).status, 401);
    const [locked] = await rows('security.account_locked');
    assert.equal(locked.user_id, user.id);
    assert.equal(locked.metadata.lockoutMinutes, 15);
    assert.ok(new Date(locked.metadata.lockedUntil) > new Date(), 'locked until a future time');

    assert.equal((await signIn('lock.me@test.local', 'Passw0rd!')).status, 429);
    assert.equal(await count('security.account_locked'), 1, 'attempts while locked are auth.login_locked, not a new lock');
    assert.equal(await count('auth.login_locked', `AND user_id = ${user.id}`), 1);
  });

  test('wrong current password and wrong current PIN are recorded without the values typed', async () => {
    const extra = await createAdmin(1);
    const attempt = await api().patch('/api/auth/password').set(auth(extra.token)).send({ currentPassword: 'TypedWrong@999', newPassword: 'BrandNew@12345' });
    assert.equal(attempt.status, 400);
    const [password] = await rows('security.credential_change_failed', `AND user_id = ${extra.user.id}`);
    assert.deepEqual(password.metadata, { kind: 'password' });

    const pupil = await createStudent(1);
    const pin = await api().patch('/api/auth/pin').set(auth(pupil.token)).set('Cookie', 'x=y')
      .send({ currentPin: '135790', newPin: '640281', confirmPin: '640281' });
    assert.equal(pin.status, 400);
    const [pinRow] = await rows('security.credential_change_failed', `AND user_id = ${pupil.userId}`);
    assert.deepEqual(pinRow.metadata, { kind: 'pin' });

    const stored = await everything();
    for (const secret of ['TypedWrong@999', 'BrandNew@12345', '135790', '640281']) assert.ok(!stored.includes(secret), `${secret} is not in the log`);
  });
});

describe('PIN reset codes', () => {
  test('wrong codes are counted with the attempt, burn the code on the last one, and never store the code or PIN', async () => {
    const pupil = await createStudent(2);
    const otp = await pinService.forgotPin({ studentNumber: pupil.studentNumber, email: pupil.email });
    const wrong = otp === '000000' ? '000001' : '000000';
    const reset = (code) => api().post('/api/auth/pin/reset').send({ studentNumber: pupil.studentNumber, otp: code, newPin: '640281', confirmPin: '640281' });

    assert.equal((await reset(wrong)).status, 400);
    let [first] = await rows('security.pin_otp_failed');
    assert.equal(first.user_id, pupil.userId);
    assert.deepEqual(
      [first.metadata.reason, first.metadata.attempts, first.metadata.codeBurned, first.metadata.studentNumber],
      ['wrong_code', 1, false, pupil.studentNumber],
    );

    for (let i = 1; i < pinService.OTP_MAX_ATTEMPTS; i += 1) await reset(wrong);
    const all = await rows('security.pin_otp_failed');
    assert.equal(all.length, pinService.OTP_MAX_ATTEMPTS);
    assert.equal(all.at(-1).metadata.codeBurned, true);

    assert.equal((await reset(otp)).status, 400, 'the right code no longer works');
    assert.equal((await rows('security.pin_otp_failed')).at(-1).metadata.reason, 'too_many_attempts');

    const stored = JSON.stringify((await rows('security.pin_otp_failed')).map((r) => r.metadata));
    for (const secret of [otp, wrong, '640281']) assert.ok(!stored.includes(`"${secret}"`) && !stored.includes(`:${secret}`), `${secret} is not stored`);
    assert.ok(!/hash/i.test(stored));
  });

  test('an unknown student number is recorded without a user, and only if it looks like a Student ID', async () => {
    const send = (studentNumber) => api().post('/api/auth/pin/reset').send({ studentNumber, otp: '123456', newPin: '640281', confirmPin: '640281' });
    assert.equal((await send('STU9999999')).status, 400);
    const [row] = await rows('security.pin_otp_failed', "AND JSON_EXTRACT(metadata, '$.reason') = 'unknown_student'");
    assert.equal(row.user_id, null);
    assert.equal(row.metadata.studentNumber, 'STU9999999');
  });
});

describe('invalid links and refused sessions', () => {
  test('invalid reset, verification and activation tokens are recorded, never the token', async () => {
    const reset = `reset-${'a'.repeat(40)}`;
    const verify = `verify-${'b'.repeat(40)}`;
    const activate = `activate-${'c'.repeat(40)}`;
    assert.equal((await api().post('/api/auth/reset-password').send({ token: reset, password: 'BrandNew@12345' })).status, 400);
    assert.equal((await api().post('/api/auth/verify-email').send({ token: verify })).status, 400);
    assert.equal((await api().post('/api/applications/activate').send({ token: activate, pin: '640281', confirmPin: '640281' })).status, 400);

    const kinds = (await rows('security.token_invalid')).map((r) => r.metadata.kind).sort();
    assert.deepEqual(kinds, ['activation', 'email_verification', 'password_reset']);
    const stored = await everything();
    for (const secret of [reset, verify, activate, 'BrandNew@12345']) assert.ok(!stored.includes(secret), 'no token or password in the log');
  });

  test('an unknown refresh cookie is one row per address; a revoked one names the user', async () => {
    const forged = (value) => api().post('/api/auth/refresh').set('Cookie', `scrs_refresh=${value}`);
    assert.equal((await forged('not-a-real-token')).status, 401);
    assert.equal((await forged('another-fake-token')).status, 401);
    assert.equal(await count('security.refresh_rejected', "AND JSON_EXTRACT(metadata, '$.reason') = 'unknown_token'"), 1, 'the retry is not a new row');

    const session = await login('lecturer@scrs.local', 'Lecturer@12345');
    assert.equal((await api().post('/api/auth/logout').set('Cookie', session.cookie)).status, 200);
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', session.cookie)).status, 401);
    const [revoked] = await rows('security.refresh_rejected', "AND JSON_EXTRACT(metadata, '$.reason') = 'revoked'");
    assert.equal(revoked.user_id, session.user.id);
  });

  test('a suspended account still holding a live refresh token is the high-signal refusal', async () => {
    const user = await makeUser('holds.token@test.local');
    const session = await login('holds.token@test.local', 'Passw0rd!');
    await query("UPDATE users SET status = 'suspended' WHERE id = :id", { id: user.id });

    assert.equal((await api().post('/api/auth/refresh').set('Cookie', session.cookie)).status, 401);
    const [row] = await rows('security.refresh_rejected', "AND JSON_EXTRACT(metadata, '$.reason') = 'inactive'");
    assert.equal(row.user_id, user.id);
    assert.equal(row.metadata.status, 'suspended');
  });
});

describe('403 denials', () => {
  test('a refused request is one row with what was required; a repeat is not; a different URL is', async () => {
    assert.equal((await api().get('/api/admin/audit-logs').set(auth(registrar.token))).status, 403);
    const [row] = await rows('security.access_denied');
    assert.equal(row.user_id, registrar.user.id);
    assert.deepEqual(
      [row.metadata.method, row.metadata.path, row.metadata.required, row.metadata.source],
      ['GET', '/api/admin/audit-logs', 'audit:view', 'permission'],
    );
    assert.equal(row.actor_role, 'REGISTRAR');

    await api().get('/api/admin/audit-logs?action=x').set(auth(registrar.token));
    assert.equal(await count('security.access_denied'), 1, 'the same route within ten minutes is not a second row');

    assert.equal((await api().get('/api/admin/settings').set(auth(registrar.token))).status, 403);
    assert.equal(await count('security.access_denied'), 2);
  });

  test('ids and query strings never reach the log, and role checks are labelled as such', async () => {
    assert.equal((await api().get('/api/users/12345?secret=abc').set(auth(registrar.token))).status, 403);
    const paths = (await rows('security.access_denied')).map((r) => r.metadata.path);
    assert.ok(paths.includes('/api/users/:id'));
    assert.ok(!paths.some((p) => p.includes('12345') || p.includes('secret')));

    assert.equal((await api().get('/api/students/me/results').set(auth(lecturer.token))).status, 403);
    const [byRole] = await rows('security.access_denied', "AND JSON_EXTRACT(metadata, '$.source') = 'role'");
    assert.equal(byRole.metadata.required, 'STUDENT');
  });

  test('not signed in (401) and the forced PIN change are not access denials', async () => {
    const before = await count('security.access_denied');
    assert.equal((await api().get('/api/admin/audit-logs')).status, 401);
    assert.equal(await count('security.access_denied'), before);
  });
});

describe('sensitive reads by staff', () => {
  test('student results: logged for staff once per ten minutes; a student reading their own is not logged', async () => {
    const [{ id: studentId }] = await query("SELECT id FROM students WHERE student_number = 'STU2025001'");
    assert.equal((await api().get(`/api/students/${studentId}/results`).set(auth(registrar.token))).status, 200);
    assert.equal((await api().get(`/api/students/${studentId}/results`).set(auth(registrar.token))).status, 200);
    const logged = await rows('student.results_viewed');
    assert.equal(logged.length, 1, 'the repeat is deduped');
    assert.deepEqual([logged[0].user_id, logged[0].entity_type, logged[0].entity_id], [registrar.user.id, 'Student', studentId]);

    assert.equal((await api().get(`/api/students/${studentId}/results`).set(auth(admin.token))).status, 200);
    assert.equal((await rows('student.results_viewed')).length, 2, 'another viewer is a new row');

    assert.equal((await api().get('/api/students/me/results').set(auth(student.token))).status, 200);
    assert.equal((await rows('student.results_viewed')).length, 2, 'the owner is never logged');
  });

  test('slip as JSON: staff are logged, the student reading their own slip is not', async () => {
    for (const code of ['CS201', 'CS203']) {
      await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: await sectionIdFor(code) });
    }
    const submitted = await api().post('/api/registrations/submit').set(auth(student.token));
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    const id = submitted.body.data.id;

    assert.equal((await api().get(`/api/registrations/${id}/slip?format=json`).set(auth(student.token))).status, 200);
    assert.equal(await count('registration.slip_viewed'), 0, 'the owner');

    assert.equal((await api().get(`/api/admin/registrations/${id}/slip?format=json`).set(auth(registrar.token))).status, 200);
    const [row] = await rows('registration.slip_viewed');
    assert.deepEqual([row.user_id, row.entity_id], [registrar.user.id, id]);
    assert.ok(row.metadata.referenceNumber);
    assert.ok(!JSON.stringify(row.metadata).includes('verificationCode'));
  });

  test("another user's sessions are logged; your own are not", async () => {
    const [{ id: lecturerId }] = await query("SELECT id FROM users WHERE email = 'lecturer@scrs.local'");
    assert.equal((await api().get(`/api/users/${lecturerId}/sessions`).set(auth(admin.token))).status, 200);
    const [row] = await rows('user.sessions_viewed');
    assert.deepEqual([row.user_id, row.entity_id], [admin.user.id, lecturerId]);

    assert.equal((await api().get(`/api/users/${admin.user.id}/sessions`).set(auth(admin.token))).status, 200);
    assert.equal(await count('user.sessions_viewed'), 1);
  });

  test('an applicant photo: full size is logged without the storage key, thumbnails are not', async () => {
    const applicant = await createApplicant(301);
    const application = await submitApplication(applicant);
    const photo = (size) => api().get(`/api/applications/${application.id}/photo?size=${size}`).set(auth(admin.token)).buffer(true)
      .parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });

    assert.equal((await photo('thumb')).status, 200);
    assert.equal(await count('application.photo_viewed'), 0, 'thumbnails load by the dozen in lists');

    assert.equal((await photo('full')).status, 200);
    assert.equal((await photo('full')).status, 200);
    const [row] = await rows('application.photo_viewed');
    assert.equal(await count('application.photo_viewed'), 1, 'the repeat is deduped');
    assert.deepEqual([row.entity_type, row.entity_id, row.metadata], ['AdmissionApplication', application.id, { via: 'review' }]);
    assert.ok(!(await everything()).includes('official-photo'), 'the storage key is never recorded');

    const owner = await api().get('/api/applications/me/photo').set(auth(applicant.token));
    assert.equal(owner.status, 200);
    assert.equal(await count('application.photo_viewed'), 1, 'an applicant viewing their own is not logged');
  });
});

describe('viewing the audit log', () => {
  const get = (path) => api().get(path).set(auth(admin.token));

  test('the first page of a distinct filter set is one row; paging, repeats and the options helper are not', async () => {
    assert.equal((await get('/api/admin/audit-logs?actionPrefix=course.')).status, 200);
    const [row] = await rows('audit.viewed');
    assert.equal(row.user_id, admin.user.id);
    assert.deepEqual(row.metadata, { view: 'audit_log', filters: { actionPrefix: 'course.' } });

    await get('/api/admin/audit-logs?actionPrefix=course.');
    await get('/api/admin/audit-logs?actionPrefix=course.&page=2');
    await get('/api/admin/audit-logs/options');
    assert.equal(await count('audit.viewed'), 1);

    await get('/api/admin/audit-logs?entityType=Course');
    assert.equal(await count('audit.viewed'), 2, 'a different filter set is a new view');
  });

  test('sign-ins and the email log are recorded too, with only whitelisted filters', async () => {
    await get('/api/admin/sign-ins?result=failed&search=somebody');
    await get('/api/admin/email-deliveries?status=failed');
    const views = (await rows('audit.viewed')).map((r) => r.metadata);
    assert.ok(views.some((v) => v.view === 'sign_ins' && v.filters.result === 'failed' && v.filters.search === undefined), 'free text is not recorded');
    assert.ok(views.some((v) => v.view === 'email_deliveries' && v.filters.status === 'failed'));
  });
});

describe('the Sign-ins page and the log as a whole', () => {
  test('security signals never appear on the Sign-ins page', async () => {
    const [{ n }] = await query("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('auth.login', 'auth.login_failed')");
    const res = await api().get('/api/admin/sign-ins?limit=100').set(auth(admin.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.total, Number(n));
  });

  test('no secret from any of these tests is anywhere in the log', async () => {
    const stored = await everything();
    for (const secret of [STUDENT_PIN, 'Passw0rd!', 'Wrong@12345', 'Lecturer@12345', 'Student@12345', 'Hunter2']) {
      assert.ok(!stored.includes(secret), `${secret} must not be in audit_logs`);
    }
  });

  test('security rows are short-retention: they seal into the sign-in stream and the chain verifies', async () => {
    const { sealPending, verify } = await import('../../src/services/audit-maintenance.service.js');
    await sealPending({ now: new Date(Date.now() + 10 * 60 * 1000) });
    const [{ n }] = await query("SELECT COUNT(*) n FROM audit_seals WHERE stream = 'signin'");
    assert.ok(Number(n) >= 1);
    const result = await verify();
    assert.deepEqual(result.problems, []);
  });
});
