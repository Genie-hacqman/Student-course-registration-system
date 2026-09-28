import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken } from '../../src/utils/jwt.js';
import {
  resetDatabase, api, login, loginAs, auth, query, programId, sequelize,
} from './helpers.js';

before(resetDatabase);
after(() => sequelize.close());

describe('email verification', () => {
  test('an unverified account is verified with the emailed token', async () => {
    // Every account is created verified now (admission, staff); this covers any that aren't, e.g. older ones.
    const admin = await loginAs('admin');
    await api().post('/api/users').set(auth(admin.token)).send({
      firstName: 'Nana', lastName: 'Ansah', email: 'verify@test.local', password: 'Passw0rd!', role: 'LECTURER',
    });
    await query("UPDATE users SET email_verified_at = NULL WHERE email = 'verify@test.local'");
    const res = await api().post('/api/auth/login').send({ identifier: 'verify@test.local', password: 'Passw0rd!' });
    assert.equal(res.body.data.user.emailVerifiedAt, null);
    assert.equal(JSON.stringify(res.body).includes('emailVerificationHash'), false);
    const token = res.body.data.accessToken;

    assert.equal((await api().post('/api/auth/verify-email/resend').set(auth(token))).status, 200);

    // The raw token only exists in the email, so plant a known one the way the service stores it.
    const raw = 'k'.repeat(40);
    await query("UPDATE users SET email_verification_hash = :hash WHERE email = 'verify@test.local'", { hash: hashToken(raw) });
    assert.equal((await api().post('/api/auth/verify-email').send({ token: raw })).status, 200);

    const me = await api().get('/api/auth/me').set(auth(token));
    assert.ok(me.body.data.emailVerifiedAt);
    assert.equal((await api().post('/api/auth/verify-email').send({ token: raw })).status, 400, 'a token works once');
    assert.equal((await api().post('/api/auth/verify-email/resend').set(auth(token))).status, 409);
  });

  test('an expired token is rejected', async () => {
    const raw = 'e'.repeat(40);
    await query(
      "UPDATE users SET email_verified_at = NULL, email_verification_hash = :hash, email_verification_expires = NOW() - INTERVAL 1 MINUTE WHERE email = 'verify@test.local'",
      { hash: hashToken(raw) },
    );
    const res = await api().post('/api/auth/verify-email').send({ token: raw });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /expired/);
  });

  test('seeded and staff-created accounts count as verified', async () => {
    const { user } = await loginAs('student');
    assert.ok(user.emailVerifiedAt);
    const admin = await loginAs('admin');
    const created = await api().post('/api/users').set(auth(admin.token)).send({
      firstName: 'Staff', lastName: 'Made', email: 'staffmade@test.local', password: 'Passw0rd!', role: 'LECTURER',
    });
    assert.equal(created.status, 201);
    assert.ok(created.body.data.emailVerifiedAt);
  });
});

describe('profile', () => {
  test('only the super admin renames themselves directly, and nothing but the name changes', async () => {
    const student = await loginAs('student');
    const refused = await api().patch('/api/auth/me').set(auth(student.token)).send({ firstName: 'Amma' });
    assert.equal(refused.status, 403);
    assert.match(refused.body.error.message, /approval/);

    const { token } = await loginAs('admin');
    const res = await api().patch('/api/auth/me').set(auth(token)).send({ firstName: 'Root', email: 'hijack@test.local', role: 'USER' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.firstName, 'Root');
    assert.equal(res.body.data.role.name, 'SUPER_ADMIN');
    assert.notEqual(res.body.data.email, 'hijack@test.local');
    assert.equal((await api().patch('/api/auth/me').set(auth(token)).send({})).status, 422);
    assert.equal((await api().patch('/api/auth/me').send({ firstName: 'X' })).status, 401);
  });
});

describe('sessions', () => {
  test('lists signed-in devices and ends one without affecting the others', async () => {
    const laptop = await login('lecturer@scrs.local', 'Lecturer@12345');
    const phone = await login('lecturer@scrs.local', 'Lecturer@12345');

    const list = await api().get('/api/auth/sessions').set(auth(laptop.token)).set('Cookie', laptop.cookie);
    assert.equal(list.status, 200);
    assert.ok(list.body.data.length >= 2);
    const current = list.body.data.filter((s) => s.current);
    assert.equal(current.length, 1);
    const phoneSession = list.body.data.find((s) => !s.current && s.id > current[0].id);
    assert.equal(JSON.stringify(list.body.data).includes('tokenHash'), false);

    assert.equal((await api().delete(`/api/auth/sessions/${current[0].id}`).set(auth(laptop.token)).set('Cookie', laptop.cookie)).status, 400);
    assert.equal((await api().delete(`/api/auth/sessions/${phoneSession.id}`).set(auth(laptop.token)).set('Cookie', laptop.cookie)).status, 204);

    // The phone is cut off at once: its access token and its refresh token both stop working.
    assert.equal((await api().get('/api/auth/me').set(auth(phone.token))).status, 401);
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', phone.cookie)).status, 401);
    // ...and presenting that ended session's token is not treated as theft: the laptop keeps working.
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', laptop.cookie)).status, 200);

    assert.equal((await api().delete('/api/auth/sessions/999999').set(auth(laptop.token))).status, 404);
  });

  test('a user cannot end someone else’s session', async () => {
    const other = await loginAs('registrar');
    const [{ id }] = await query(
      "SELECT rt.id FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE u.email = 'registrar@scrs.local' AND rt.revoked_at IS NULL LIMIT 1",
    );
    const { token } = await loginAs('student');
    assert.equal((await api().delete(`/api/auth/sessions/${id}`).set(auth(token))).status, 404);
    assert.equal((await api().get('/api/auth/me').set(auth(other.token))).status, 200);
  });
});

describe('user administration', () => {
  test('a user record includes its student or lecturer profile', async () => {
    const admin = await loginAs('admin');
    const [{ id }] = await query("SELECT id FROM users WHERE email = 'student@scrs.local'");
    const res = await api().get(`/api/users/${id}`).set(auth(admin.token));
    assert.equal(res.body.data.student.studentNumber, 'STU2025001');
    assert.equal(res.body.data.student.program.code.length > 0, true);
    assert.equal(res.body.data.lecturer, null);
  });

  test('a student profile created by staff gets a generated number unless one is given', async () => {
    const admin = await loginAs('admin');
    const make = async (email) => (await api().post('/api/users').set(auth(admin.token)).send({
      firstName: 'New', lastName: 'Student', email, password: 'Passw0rd!', role: 'USER',
    })).body.data.id;

    const generated = await api().post('/api/students').set(auth(admin.token)).send({ userId: await make('gen@test.local'), programId: await programId() });
    assert.equal(generated.status, 201);
    assert.match(generated.body.data.studentNumber, /^STU\d{8,}$/);

    const userId = await make('given@test.local');
    const given = await api().post('/api/students').set(auth(admin.token)).send({ userId, programId: await programId(), studentNumber: 'ADM-0042', level: 300 });
    assert.equal(given.body.data.studentNumber, 'ADM-0042');
    assert.equal(given.body.data.level, 300);
    assert.equal((await api().post('/api/students').set(auth(admin.token)).send({ userId, programId: await programId() })).status, 409);
  });

  test('settings values are validated per key', async () => {
    const admin = await loginAs('admin');
    const patch = (settings) => api().patch('/api/admin/settings').set(auth(admin.token)).send({ settings });
    assert.equal((await patch([{ key: 'registration.requireApproval', value: 'yes' }])).status, 422);
    assert.equal((await patch([{ key: 'registration.defaultMaxCredits', value: 0 }])).status, 422);
    assert.equal((await patch([{ key: 'grades.passingGrade', value: 'W' }])).status, 422);
    assert.equal((await patch([{ key: 'no.such.setting', value: 1 }])).status, 422);
    assert.equal((await patch([{ key: 'grades.passingGrade', value: 'C' }, { key: 'institution.name', value: 'UniReg University' }])).status, 200);
  });
});
