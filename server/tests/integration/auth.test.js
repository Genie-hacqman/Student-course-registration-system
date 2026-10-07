import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as authService from '../../src/services/auth.service.js';
import jwt from 'jsonwebtoken';
import env from '../../src/config/env.js';
import { purgeExpiredTokens } from '../../src/services/session.service.js';
import {
  resetDatabase, api, login, loginAs, auth, query, createStudent, createAdmin, approvedResetToken, sequelize,
} from './helpers.js';

before(resetDatabase);
after(() => sequelize.close());

describe('auth', () => {
  test('login returns an access token and sets an HTTP-only refresh cookie', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'student@scrs.local', password: 'Student@12345' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.role.name, 'STUDENT');
    assert.ok(res.body.data.accessToken);
    assert.equal(JSON.stringify(res.body).includes('passwordHash'), false);
    assert.equal(JSON.stringify(res.body).includes('refreshToken'), false, 'refresh token must not be in the body');

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('scrs_refresh='));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Path=\/api\/auth/);
    assert.match(cookie, /SameSite=Strict/);
  });

  test('there is no self sign-up: student accounts come from admission only', async () => {
    const res = await api().post('/api/auth/register').send({
      email: 'fresh@test.local', password: 'Passw0rd!', firstName: 'Fresh', lastName: 'Person', programId: 1,
    });
    assert.equal(res.status, 404);
  });

  test('login fails with the same message for unknown email and wrong password', async () => {
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@x.com', password: 'whatever' });
    const wrong = await api().post('/api/auth/login').send({ email: 'student@scrs.local', password: 'whatever' });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.body.error.message, wrong.body.error.message);
  });

  test('GET /me returns the profile; missing or bad tokens are rejected', async () => {
    const { token } = await loginAs('student');
    const me = await api().get('/api/auth/me').set(auth(token));
    assert.equal(me.status, 200);
    assert.equal(me.body.data.student.studentNumber, 'STU2025001');
    assert.deepEqual(me.body.data.permissions, ['registration:self', 'application:self']);
    assert.equal(me.body.data.admissionStatus, 'ADMITTED');

    const registrar = await loginAs('registrar');
    const staff = await api().get('/api/auth/me').set(auth(registrar.token));
    assert.ok(staff.body.data.permissions.includes('report:view'));
    assert.ok(!staff.body.data.permissions.includes('settings:manage'));

    assert.equal((await api().get('/api/auth/me')).status, 401);
    assert.equal((await api().get('/api/auth/me').set(auth('garbage'))).status, 401);
  });

  test('refresh rotates the token, and reusing an old token revokes every session', async () => {
    const { cookie: first } = await loginAs('student');

    const rotated = await api().post('/api/auth/refresh').set('Cookie', first);
    assert.equal(rotated.status, 200);
    assert.ok(rotated.body.data.accessToken);
    const second = rotated.headers['set-cookie'].find((c) => c.startsWith('scrs_refresh='));
    assert.notEqual(second.split(';')[0], first.split(';')[0]);

    const reuse = await api().post('/api/auth/refresh').set('Cookie', first);
    assert.equal(reuse.status, 401);

    const afterReuse = await api().post('/api/auth/refresh').set('Cookie', second);
    assert.equal(afterReuse.status, 401);
  });

  test('logout with only the refresh cookie revokes it and is audited', async () => {
    const { cookie, user } = await loginAs('student');
    assert.equal((await api().post('/api/auth/logout').set('Cookie', cookie)).status, 200);
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', cookie)).status, 401);
    const [{ count }] = await query("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'auth.logout' AND user_id = :id", { id: user.id });
    assert.equal(count, 1);
  });

  test('logout with a Bearer token and cookie is audited for that user', async () => {
    const { token, cookie, user } = await loginAs('registrar');
    assert.equal((await api().post('/api/auth/logout').set(auth(token)).set('Cookie', cookie)).status, 200);
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', cookie)).status, 401);
    const [{ count }] = await query("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'auth.logout' AND user_id = :id", { id: user.id });
    assert.equal(count, 1);
  });

  test('logout racing a refresh still ends the session: the rotated-to token is revoked too', async () => {
    const { cookie: old } = await loginAs('student');
    const rotated = await api().post('/api/auth/refresh').set('Cookie', old);
    assert.equal(rotated.status, 200);
    const replacement = rotated.headers['set-cookie'].find((c) => c.startsWith('scrs_refresh='));

    assert.equal((await api().post('/api/auth/logout').set('Cookie', old)).status, 200);
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', replacement)).status, 401);
  });

  test('the refresh cookie is a browser-session cookie (closing the browser signs out)', async () => {
    const { cookie } = await loginAs('lecturer');
    assert.doesNotMatch(cookie, /Expires=|Max-Age=/i);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
  });

  test('logout still succeeds with an invalid or expired Bearer token', async () => {
    const { cookie } = await loginAs('lecturer');
    const res = await api().post('/api/auth/logout').set(auth('garbage.token.value')).set('Cookie', cookie);
    assert.equal(res.status, 200);
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', cookie)).status, 401);
  });

  test('forgot/reset password flow (staff)', async () => {
    const generic = await api().post('/api/auth/forgot-password').send({ email: 'nobody@x.com' });
    assert.equal(generic.status, 200);

    const { token: adminToken } = await loginAs('admin');
    const created = await api().post('/api/users').set(auth(adminToken)).send({
      firstName: 'Fresh', lastName: 'Lecturer', email: 'fresh@test.local', password: 'Passw0rd!', role: 'LECTURER',
    });
    assert.equal(created.status, 201);

    assert.equal(await authService.forgotPassword('fresh@test.local'), null);
    const token = await approvedResetToken('fresh@test.local');
    const reset = await api().post('/api/auth/reset-password').send({ token, password: 'NewPassw0rd' });
    assert.equal(reset.status, 200);

    await login('fresh@test.local', 'NewPassw0rd');
    const reused = await api().post('/api/auth/reset-password').send({ token, password: 'Another1Pass' });
    assert.equal(reused.status, 400);
  });

  test('an admin changes their password directly; it needs the current password and ends other sessions', async () => {
    const lecturer = await login('fresh@test.local', 'NewPassw0rd');
    const refused = await api().patch('/api/auth/password').set(auth(lecturer.token)).send({ currentPassword: 'NewPassw0rd', newPassword: 'Changed1Pass' });
    assert.equal(refused.status, 403);
    assert.match(refused.body.error.message, /approval/);

    const student = await createStudent(100);
    const pinOnly = await api().patch('/api/auth/password').set(auth(student.token)).send({ currentPassword: 'x', newPassword: 'Changed1Pass' });
    assert.equal(pinOnly.status, 403);
    assert.match(pinOnly.body.error.message, /PIN/);

    const { token, cookie, email } = await createAdmin(1);
    const wrong = await api().patch('/api/auth/password').set(auth(token)).send({ currentPassword: 'nope', newPassword: 'Changed1Pass' });
    assert.equal(wrong.status, 400);

    const ok = await api().patch('/api/auth/password').set(auth(token)).send({ currentPassword: 'Passw0rd!', newPassword: 'Changed1Pass' });
    assert.equal(ok.status, 200);
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', cookie)).status, 401);
    await login(email, 'Changed1Pass');
  });

  test('suspended accounts cannot log in', async () => {
    const { token: adminToken } = await loginAs('admin');
    const { user } = await login('fresh@test.local', 'NewPassw0rd');
    const res = await api().patch(`/api/users/${user.id}`).set(auth(adminToken)).send({ status: 'suspended' });
    assert.equal(res.status, 200);
    const denied = await api().post('/api/auth/login').send({ email: 'fresh@test.local', password: 'NewPassw0rd' });
    assert.equal(denied.status, 403);
  });
});

describe('strict token revocation', () => {
  const me = (token) => api().get('/api/auth/me').set(auth(token));

  test('logout cuts off the access token immediately, not after it expires', async () => {
    const { token, cookie } = await loginAs('student');
    assert.equal((await me(token)).status, 200);

    assert.equal((await api().post('/api/auth/logout').set(auth(token)).set('Cookie', cookie)).status, 200);

    const after = await me(token);
    assert.equal(after.status, 401);
    assert.equal(after.body.error.message, 'Token has been revoked');
    assert.equal((await api().get('/api/courses').set(auth(token))).status, 401);

    const other = await loginAs('student');
    assert.equal((await me(other.token)).status, 200);
  });

  test('logout-all ends every session of the user on every device', async () => {
    const a = await loginAs('lecturer');
    const b = await loginAs('lecturer');

    const res = await api().post('/api/auth/logout-all').set(auth(a.token));
    assert.equal(res.status, 200);

    for (const session of [a, b]) {
      const check = await me(session.token);
      assert.equal(check.status, 401);
      assert.equal(check.body.error.message, 'Session has ended, please log in again');
      assert.equal((await api().post('/api/auth/refresh').set('Cookie', session.cookie)).status, 401);
    }
    assert.equal((await me((await loginAs('lecturer')).token)).status, 200, 'logging in again works');
  });

  test('changing the password invalidates existing access tokens at once', async () => {
    const s = await createAdmin(101);
    const res = await api().patch('/api/auth/password').set(auth(s.token))
      .send({ currentPassword: 'Passw0rd!', newPassword: 'Changed1Pass' });
    assert.equal(res.status, 200);
    assert.equal((await me(s.token)).status, 401);
  });

  test('resetting the password invalidates existing access tokens at once', async () => {
    const { token: adminToken } = await loginAs('admin');
    await api().post('/api/users').set(auth(adminToken)).send({
      firstName: 'Reset', lastName: 'Lecturer', email: 'reset.lecturer@test.local', password: 'Passw0rd!', role: 'LECTURER',
    });
    const s = await login('reset.lecturer@test.local', 'Passw0rd!');
    const resetToken = await approvedResetToken('reset.lecturer@test.local');
    await api().post('/api/auth/reset-password').send({ token: resetToken, password: 'Reset1Pass' });
    assert.equal((await me(s.token)).status, 401);
  });

  test('an admin changing a role or suspending an account cuts off its tokens', async () => {
    const { token: adminToken } = await loginAs('admin');
    const promoted = await createStudent(103);
    await api().patch(`/api/users/${promoted.userId}`).set(auth(adminToken)).send({ role: 'LECTURER' });
    assert.equal((await me(promoted.token)).body.error.message, 'Session has ended, please log in again');

    const suspended = await createStudent(104);
    await api().patch(`/api/users/${suspended.userId}`).set(auth(adminToken)).send({ status: 'suspended' });
    assert.equal((await me(suspended.token)).status, 401);
  });

  test('refresh-token theft kills the current access token too', async () => {
    const { cookie: stolen } = await loginAs('registrar');
    const rotated = await api().post('/api/auth/refresh').set('Cookie', stolen);
    const current = rotated.body.data.accessToken;
    assert.equal((await me(current)).status, 200);

    assert.equal((await api().post('/api/auth/refresh').set('Cookie', stolen)).status, 401);
    assert.equal((await me(current)).status, 401);
  });

  test('tokens without a jti or version are rejected', async () => {
    const { user } = await loginAs('student');
    const legacy = jwt.sign({ sub: String(user.id), role: 'STUDENT' }, env.JWT_ACCESS_SECRET, { expiresIn: '5m', issuer: 'scrs-api' });
    assert.equal((await me(legacy)).status, 401);
  });

  test('cleanup removes only revocations and refresh tokens that have expired', async () => {
    const { user } = await loginAs('student');
    await query(
      `INSERT INTO revoked_access_tokens (jti, user_id, expires_at) VALUES
        ('00000000-0000-0000-0000-000000000001', :id, NOW() - INTERVAL 1 MINUTE),
        ('00000000-0000-0000-0000-000000000002', :id, NOW() + INTERVAL 10 MINUTE)`,
      { id: user.id },
    );
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (:id, REPEAT('a', 64), NOW() - INTERVAL 1 DAY)`,
      { id: user.id },
    );

    const removed = await purgeExpiredTokens();
    assert.equal(removed.revokedAccessTokens, 1);
    assert.ok(removed.refreshTokens >= 1);
    const left = await query("SELECT jti FROM revoked_access_tokens WHERE jti LIKE '00000000-%'");
    assert.deepEqual(left.map((r) => r.jti), ['00000000-0000-0000-0000-000000000002']);
  });
});
