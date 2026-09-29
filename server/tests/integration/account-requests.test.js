import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as authService from '../../src/services/auth.service.js';
import {
  resetDatabase, api, loginAs, login, auth, query, createStudent, createAdmin, sequelize,
} from './helpers.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../src/utils/constants.js';

before(resetDatabase);
after(() => sequelize.close());

const pendingFor = async (email, type) => query(
  `SELECT r.id, r.status FROM account_change_requests r JOIN users u ON u.id = r.user_id
    WHERE u.email = :email AND r.type = :type AND r.status = 'pending'`,
  { email, type },
);
const lastNotification = async (userId, type) =>
  (await query('SELECT title, message FROM notifications WHERE user_id = :userId AND type = :type ORDER BY id DESC LIMIT 1', { userId, type }))[0];

describe('staff password resets need an admin', () => {
  test('forgot password files one request, notifies the admins, and emails no link yet', async () => {
    const admin0 = await loginAs('admin');
    await api().post('/api/users').set(auth(admin0.token)).send({
      firstName: 'Staff', lastName: 'One', email: 'staff1@test.local', password: 'Passw0rd!', role: 'LECTURER',
    });
    const s = { email: 'staff1@test.local' };
    assert.equal(await authService.forgotPassword(s.email), null);
    await api().post('/api/auth/forgot-password').send({ email: s.email });
    assert.equal((await pendingFor(s.email, 'password_reset')).length, 1, 'a second request reuses the pending one');
    const [{ hash }] = await query('SELECT password_reset_hash AS hash FROM users WHERE email = :email', { email: s.email });
    assert.equal(hash, null);

    const admin = await loginAs('admin');
    assert.match((await lastNotification(admin.user.id, 'ACCOUNT_REQUEST_CREATED')).message, /staff1@test.local/);
  });

  test('only an admin can approve; approval issues the reset link and tells the user', async () => {
    const [{ id }] = await pendingFor('staff1@test.local', 'password_reset');
    const registrar = await loginAs('registrar');
    assert.equal((await api().patch(`/api/admin/account-requests/${id}/approve`).set(auth(registrar.token)).send({})).status, 403);

    const admin = await loginAs('admin');
    const approved = await api().patch(`/api/admin/account-requests/${id}/approve`).set(auth(admin.token)).send({});
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.status, 'approved');
    assert.equal(approved.body.data.reviewer.id, admin.user.id);
    const [{ hash }] = await query("SELECT password_reset_hash AS hash FROM users WHERE email = 'staff1@test.local'");
    assert.ok(hash);
    const [{ userId }] = await query("SELECT id AS userId FROM users WHERE email = 'staff1@test.local'");
    assert.match((await lastNotification(userId, 'ACCOUNT_REQUEST_APPROVED')).message, /emailed you a link/);

    assert.equal((await api().patch(`/api/admin/account-requests/${id}/approve`).set(auth(admin.token)).send({})).status, 409);
  });

  test('students recover a PIN instead: forgot-password files nothing for them', async () => {
    const s = await createStudent(1);
    assert.equal((await api().post('/api/auth/forgot-password').send({ email: s.email })).status, 200);
    assert.equal((await pendingFor(s.email, 'password_reset')).length, 0);
  });

  test('registrars and lecturers need approval; admins do not', async () => {
    const registrar = await loginAs('registrar');
    assert.equal((await api().patch('/api/auth/password').set(auth(registrar.token)).send({ currentPassword: 'Registrar@12345', newPassword: 'Changed1Pass' })).status, 403);
    assert.equal((await api().patch('/api/auth/me').set(auth(registrar.token)).send({ firstName: 'X' })).status, 403);
    const req = await api().post('/api/auth/change-requests').set(auth(registrar.token)).send({ type: 'password_reset', note: 'Forgot it' });
    assert.equal(req.status, 201);

    const sa = await createAdmin(1);
    assert.ok(await authService.forgotPassword(sa.email), 'an admin gets a link straight away');
    assert.equal((await api().post('/api/auth/change-requests').set(auth(sa.token)).send({ type: 'password_reset' })).status, 400);
  });

  test('students cannot file a password-reset change request, or have one approved into a real password', async () => {
    const student = await createStudent(2);
    const filed = await api().post('/api/auth/change-requests').set(auth(student.token)).send({ type: 'password_reset' });
    assert.equal(filed.status, 403);
    assert.equal((await pendingFor(student.email, 'password_reset')).length, 0);

    // Even a request that slipped in some other way must not be approvable into a password.
    await sequelize.query(
      "INSERT INTO account_change_requests (user_id, type, status, created_at, updated_at) VALUES (:userId, 'password_reset', 'pending', NOW(), NOW())",
      { replacements: { userId: student.userId } },
    );
    const [{ id: requestId }] = await query(
      "SELECT id FROM account_change_requests WHERE user_id = :userId AND type = 'password_reset' ORDER BY id DESC LIMIT 1",
      { userId: student.userId },
    );
    const admin = await loginAs('admin');
    const approved = await api().patch(`/api/admin/account-requests/${requestId}/approve`).set(auth(admin.token)).send({});
    assert.equal(approved.status, 409);
  });

  test('a reviewer with account:approve cannot approve their own request', async () => {
    const admin = await loginAs('admin');
    const [{ id: registrarRoleId }] = await query("SELECT id FROM roles WHERE name = 'REGISTRAR'");
    const grant = (permissions) => api().put(`/api/admin/roles/${registrarRoleId}/permissions`).set(auth(admin.token)).send({ permissions });
    await grant([...ROLE_PERMISSIONS.REGISTRAR, PERMISSIONS.ACCOUNT_APPROVE]);
    try {
      const registrar = await loginAs('registrar');
      const req = await api().post('/api/auth/change-requests').set(auth(registrar.token)).send({ type: 'name_change', firstName: 'Reg', lastName: 'Istrar' });
      assert.equal(req.status, 201);
      const own = await api().patch(`/api/admin/account-requests/${req.body.data.id}/approve`).set(auth(registrar.token)).send({});
      assert.equal(own.status, 403);
    } finally {
      await grant(ROLE_PERMISSIONS.REGISTRAR);
    }
  });
});

describe('name changes need an admin', () => {
  test('a request must name the new first and last name; a rejection needs a reason and changes nothing', async () => {
    const { token, user } = await loginAs('student');
    assert.equal((await api().post('/api/auth/change-requests').set(auth(token)).send({ type: 'name_change', firstName: 'Only' })).status, 422);

    const req = await api().post('/api/auth/change-requests').set(auth(token)).send({ type: 'name_change', firstName: 'Ama', lastName: 'Mensah-Boateng', note: 'Married' });
    assert.equal(req.status, 201);
    const admin = await loginAs('admin');
    const reject = (note) => api().patch(`/api/admin/account-requests/${req.body.data.id}/reject`).set(auth(admin.token)).send({ note });
    assert.equal((await reject('')).status, 422);
    assert.equal((await reject('Please bring your marriage certificate')).body.data.status, 'rejected');
    assert.equal((await api().get('/api/auth/me').set(auth(token))).body.data.lastName, 'Mensah');
    assert.match((await lastNotification(user.id, 'ACCOUNT_REQUEST_REJECTED')).message, /marriage certificate/);
  });

  test('an approved request renames the user', async () => {
    const { token } = await loginAs('student');
    const req = await api().post('/api/auth/change-requests').set(auth(token)).send({ type: 'name_change', firstName: 'Ama', lastName: 'Mensah-Boateng' });
    const admin = await loginAs('admin');
    await api().patch(`/api/admin/account-requests/${req.body.data.id}/approve`).set(auth(admin.token)).send({ note: 'Certificate seen' });
    assert.equal((await api().get('/api/auth/me').set(auth(token))).body.data.lastName, 'Mensah-Boateng');

    const mine = await api().get('/api/auth/change-requests').set(auth(token));
    assert.deepEqual(mine.body.data.map((r) => r.status), ['approved', 'rejected']);
  });

  test('users only see and cancel their own requests; the queue filters by status and type', async () => {
    const { token } = await loginAs('lecturer');
    const req = await api().post('/api/auth/change-requests').set(auth(token)).send({ type: 'name_change', firstName: 'Kofi', lastName: 'Owusu-Ansah' });
    const student = await loginAs('student');
    assert.equal((await api().delete(`/api/auth/change-requests/${req.body.data.id}`).set(auth(student.token))).status, 404);
    assert.equal((await api().delete(`/api/auth/change-requests/${req.body.data.id}`).set(auth(token))).body.data.status, 'cancelled');

    const admin = await loginAs('admin');
    const queue = await api().get('/api/admin/account-requests?status=pending&type=password_reset').set(auth(admin.token));
    assert.ok(queue.body.data.length >= 1);
    assert.ok(queue.body.data.every((r) => r.status === 'pending' && r.type === 'password_reset'));
    assert.ok(queue.body.data[0].user.role.name);
  });
});

describe('sign-in tracking', () => {
  test('records time, IP and device for successful and failed sign-ins', async () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
    await api().post('/api/auth/login').set('User-Agent', ua).send({ email: 'lecturer@scrs.local', password: 'Lecturer@12345' });
    await api().post('/api/auth/login').set('User-Agent', ua).send({ email: 'lecturer@scrs.local', password: 'wrong-password' });
    await api().post('/api/auth/login').send({ email: 'nobody@nowhere.test', password: 'whatever1A' });

    const admin = await loginAs('admin');
    const lecturers = await api().get('/api/admin/sign-ins?role=LECTURER').set(auth(admin.token));
    assert.equal(lecturers.status, 200);
    assert.ok(lecturers.body.data.every((s) => s.user.role === 'LECTURER'));
    const [latest] = lecturers.body.data;
    assert.equal(latest.userAgent, ua);
    assert.equal(latest.success, false);
    assert.ok(latest.at && latest.ipAddress);

    const successes = await api().get('/api/admin/sign-ins?result=success&search=lecturer@scrs').set(auth(admin.token));
    assert.ok(successes.body.data.length >= 1);
    assert.ok(successes.body.data.every((s) => s.success && s.user.email === 'lecturer@scrs.local'));

    const failed = await api().get('/api/admin/sign-ins?result=failed').set(auth(admin.token));
    assert.ok(failed.body.data.some((s) => s.user === null && s.email === 'nobody@nowhere.test'));

    const registrar = await loginAs('registrar');
    assert.equal((await api().get('/api/admin/sign-ins').set(auth(registrar.token))).status, 403);
  });

  test("an admin sees a user's signed-in devices and can sign one out", async () => {
    const lecturer = await login('lecturer@scrs.local', 'Lecturer@12345');
    const admin = await loginAs('admin');
    const devices = await api().get(`/api/users/${lecturer.user.id}/sessions`).set(auth(admin.token));
    assert.ok(devices.body.data.length >= 1);
    assert.ok(devices.body.data.every((d) => d.current === false));
    const newest = devices.body.data[0];
    assert.equal((await api().delete(`/api/users/${lecturer.user.id}/sessions/${newest.id}`).set(auth(admin.token))).status, 204);
    assert.equal((await api().get('/api/auth/me').set(auth(lecturer.token))).status, 401);
    const [entry] = await query("SELECT user_id AS actor FROM audit_logs WHERE action = 'auth.end_session' ORDER BY id DESC LIMIT 1");
    assert.equal(entry.actor, admin.user.id);
  });
});
