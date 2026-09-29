import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as connect } from 'socket.io-client';
import app from '../../app.js';
import { initSocketServer } from '../../src/sockets/socket.server.js';
import {
  resetDatabase, api, loginAs, login, auth, query, programId, sequelize,
} from './helpers.js';
import * as pinService from '../../src/services/pin.service.js';
import { MAX_FAILED_LOGINS } from '../../src/services/auth.service.js';

let admin;
let registrar;
let lecturer;

before(async () => {
  resetDatabase();
  [admin, registrar, lecturer] = await Promise.all([loginAs('admin'), loginAs('registrar'), loginAs('lecturer')]);
});
after(() => sequelize.close());

// Admission (direct and bulk) is the ADMIN's (student:admit).
const admit = (body, who = admin) => api().post('/api/admissions').set(auth(who.token)).send(body);
const newStudent = async (extra = {}) => {
  const res = await admit({ firstName: 'John', lastName: 'Mensah', programId: await programId(), admissionSession: '2026/2027', ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};
const signIn = (identifier, password) => api().post('/api/auth/login').send({ identifier, password });
const changePin = (session, currentPin, newPin, confirmPin = newPin) => api().patch('/api/auth/pin')
  .set(auth(session.token)).set('Cookie', session.cookie).send({ currentPin, newPin, confirmPin });

describe('admission', () => {
  test('only staff with student:admit (ADMIN) can admit', async () => {
    const body = { firstName: 'A', lastName: 'B', programCode: 'BSC-CS', admissionSession: '2026/2027' };
    assert.equal((await admit(body, lecturer)).status, 403);
    assert.equal((await admit(body, registrar)).status, 403, 'admission belongs to the admin');
  });

  test('creates a Student ID, a school email and a one-time PIN, with programme details', async () => {
    const { student, credentials } = await newStudent({ admissionNumber: 'ADM-001' });
    assert.match(credentials.studentNumber, /^STU2026\d{5}$/);
    assert.equal(credentials.schoolEmail, `${credentials.studentNumber.toLowerCase()}@students.scrs.edu`);
    assert.match(credentials.pin, /^\d{6}$/);

    assert.equal(student.admissionSession, '2026/2027');
    assert.equal(student.admissionYear, 2026);
    assert.equal(student.program.qualificationCode, 'BSC');
    assert.equal(student.program.department.code, 'CS');
    assert.equal(student.user.email, credentials.schoolEmail);
    assert.equal(JSON.stringify(student).includes(credentials.pin), false, 'the PIN only appears in credentials');

    const [audit] = await query("SELECT metadata FROM audit_logs WHERE action = 'student.admit' ORDER BY id DESC LIMIT 1");
    assert.equal(JSON.stringify(audit.metadata).includes(credentials.pin), false, 'never audited');

    assert.equal((await newStudentRaw({ admissionNumber: 'ADM-001' })).status, 409, 'an admission number is admitted once');
  });

  test('refuses to run until the institution sets its student email domain', async () => {
    await query("UPDATE settings SET value = '\"\"' WHERE `key` = 'institution.studentEmailDomain'");
    const res = await newStudentRaw();
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /studentEmailDomain/);
    await query("UPDATE settings SET value = '\"students.scrs.edu\"' WHERE `key` = 'institution.studentEmailDomain'");
  });

  test('rejects a malformed admission session', async () => {
    assert.equal((await newStudentRaw({ admissionSession: '2026/2028' })).status, 422);
    assert.equal((await newStudentRaw({ admissionSession: '26/27' })).status, 422);
  });
});

const newStudentRaw = async (extra = {}) =>
  admit({ firstName: 'John', lastName: 'Mensah', programId: await programId(), admissionSession: '2026/2027', ...extra });

describe('first sign-in', () => {
  test('Student ID + temporary PIN signs in, but nothing works until the PIN is changed', async () => {
    const { credentials } = await newStudent();
    const first = await login(credentials.studentNumber.toLowerCase(), credentials.pin); // the ID is not case-sensitive
    assert.equal(first.user.mustChangePassword, true);

    const blocked = await api().get('/api/registrations/current').set(auth(first.token));
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'PIN_CHANGE_REQUIRED');
    assert.equal((await api().get('/api/auth/me').set(auth(first.token))).status, 200, 'the profile still loads');

    // No live updates either.
    const server = http.createServer(app);
    const io = initSocketServer(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const socket = connect(`http://127.0.0.1:${server.address().port}`, { auth: { token: first.token }, transports: ['websocket'] });
    const error = await new Promise((resolve) => socket.on('connect_error', resolve));
    socket.close();
    io.close();
    await new Promise((resolve) => server.close(resolve));
    assert.equal(error.message, 'PIN_CHANGE_REQUIRED');

    assert.equal((await changePin(first, credentials.pin, '111111')).status, 400, 'repeated digit');
    assert.equal((await changePin(first, credentials.pin, '234567')).status, 400, 'a run');
    assert.equal((await changePin(first, credentials.pin, '589316', '589317')).status, 422, 'confirmation must match');
    assert.equal((await changePin(first, '000000', '589316')).status, 400, 'current PIN must be right');

    const changed = await changePin(first, credentials.pin, '589316');
    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.user.mustChangePassword, false);
    assert.equal((await api().get('/api/registrations/current').set(auth(changed.body.data.accessToken))).status, 200, 'fresh token works');
    assert.equal((await api().get('/api/auth/me').set(auth(first.token))).status, 401, 'the old session is over');
    assert.equal((await signIn(credentials.studentNumber, credentials.pin)).status, 401, 'the temporary PIN is gone');
    assert.equal((await signIn(credentials.studentNumber, '589316')).status, 200);
  });
});

describe('lockout', () => {
  test(`${MAX_FAILED_LOGINS} wrong PINs lock the account; a correct PIN is refused while locked`, async () => {
    const { credentials } = await newStudent();
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i += 1) assert.equal((await signIn(credentials.studentNumber, '000000')).status, 401);
    assert.equal((await signIn(credentials.studentNumber, credentials.pin)).status, 200, 'a success resets the count');

    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) await signIn(credentials.studentNumber, '000000');
    const locked = await signIn(credentials.studentNumber, credentials.pin);
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, 'ACCOUNT_LOCKED');

    await query('UPDATE users SET locked_until = NOW() - INTERVAL 1 MINUTE WHERE email = :email', { email: credentials.schoolEmail });
    assert.equal((await signIn(credentials.studentNumber, credentials.pin)).status, 200, 'the lock expires');
  });

  test('unknown student IDs get the same answer as wrong PINs', async () => {
    const unknown = await signIn('STU209900001', '123789');
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error.message, 'Invalid student ID or PIN');
  });
});

describe('forgot PIN', () => {
  const forgot = (body) => api().post('/api/auth/pin/forgot').send(body);
  const reset = (body) => api().post('/api/auth/pin/reset').send(body);

  test('only the matching school email gets a code, and the answer never says which', async () => {
    const { credentials } = await newStudent();
    const wrong = await forgot({ studentNumber: credentials.studentNumber, email: 'someone@else.edu' });
    const right = await forgot({ studentNumber: credentials.studentNumber, email: credentials.schoolEmail });
    assert.equal(wrong.status, 200);
    assert.equal(wrong.body.data.message, right.body.data.message);

    const [row] = await query('SELECT pin_otp_hash FROM users WHERE email = :email', { email: credentials.schoolEmail });
    assert.ok(row.pin_otp_hash, 'a code was issued for the right email');
    assert.equal(await pinService.forgotPin({ studentNumber: credentials.studentNumber, email: credentials.schoolEmail }), null, 'one code a minute');
  });

  test('the code resets the PIN once, ends every session and clears a lockout', async () => {
    const { credentials } = await newStudent();
    const session = await login(credentials.studentNumber, credentials.pin);
    await query('UPDATE users SET locked_until = NOW() + INTERVAL 10 MINUTE WHERE email = :email', { email: credentials.schoolEmail });

    const otp = await pinService.forgotPin({ studentNumber: credentials.studentNumber, email: credentials.schoolEmail });
    const done = await reset({ studentNumber: credentials.studentNumber, otp, newPin: '640281', confirmPin: '640281' });
    assert.equal(done.status, 200);
    assert.equal((await api().get('/api/auth/me').set(auth(session.token))).status, 401);

    const after = await signIn(credentials.studentNumber, '640281');
    assert.equal(after.status, 200);
    assert.equal(after.body.data.user.mustChangePassword, false, 'a PIN the student chose is not temporary');
    assert.equal((await reset({ studentNumber: credentials.studentNumber, otp, newPin: '640282', confirmPin: '640282' })).status, 400, 'used once');
  });

  test('wrong guesses burn the code; an expired code is refused', async () => {
    const { credentials } = await newStudent();
    const otp = await pinService.forgotPin({ studentNumber: credentials.studentNumber, email: credentials.schoolEmail });
    const wrongOtp = otp === '000000' ? '000001' : '000000';
    for (let i = 0; i < pinService.OTP_MAX_ATTEMPTS; i += 1) {
      assert.equal((await reset({ studentNumber: credentials.studentNumber, otp: wrongOtp, newPin: '640281', confirmPin: '640281' })).status, 400);
    }
    assert.equal((await reset({ studentNumber: credentials.studentNumber, otp, newPin: '640281', confirmPin: '640281' })).status, 400, 'no longer valid');

    await query('UPDATE users SET pin_otp_sent_at = NULL WHERE email = :email', { email: credentials.schoolEmail });
    const fresh = await pinService.forgotPin({ studentNumber: credentials.studentNumber, email: credentials.schoolEmail });
    await query('UPDATE users SET pin_otp_expires = NOW() - INTERVAL 1 MINUTE WHERE email = :email', { email: credentials.schoolEmail });
    assert.equal((await reset({ studentNumber: credentials.studentNumber, otp: fresh, newPin: '640281', confirmPin: '640281' })).status, 400);
  });

  test('a weak new PIN is refused without using up the code', async () => {
    const { credentials } = await newStudent();
    const otp = await pinService.forgotPin({ studentNumber: credentials.studentNumber, email: credentials.schoolEmail });
    assert.equal((await reset({ studentNumber: credentials.studentNumber, otp, newPin: '999999', confirmPin: '999999' })).status, 400);
    assert.equal((await reset({ studentNumber: credentials.studentNumber, otp, newPin: '640281', confirmPin: '640281' })).status, 200);
  });
});

describe('staff PIN reset', () => {
  test('issues a new temporary PIN that must be changed, and ends the student\'s sessions', async () => {
    const { student, credentials } = await newStudent();
    const session = await login(credentials.studentNumber, credentials.pin);
    await changePin(session, credentials.pin, '702958');

    assert.equal((await api().post(`/api/students/${student.id}/reset-pin`).set(auth(lecturer.token))).status, 403);
    const res = await api().post(`/api/students/${student.id}/reset-pin`).set(auth(admin.token));
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal((await signIn(credentials.studentNumber, '702958')).status, 401);
    const temp = await signIn(credentials.studentNumber, res.body.data.pin);
    assert.equal(temp.body.data.user.mustChangePassword, true);
  });
});

describe('bulk admission', () => {
  const rows = [
    { firstName: 'Ama', lastName: 'Owusu', programCode: 'bsc-cs', admissionSession: '2026/2027', admissionNumber: 'ADM-100' },
    { firstName: 'Kofi', lastName: 'Boateng', programCode: 'BSC-CS', admissionSession: '2026/2027', admissionNumber: 'ADM-101', level: 200 },
  ];
  const bulk = (body) => api().post('/api/admissions/bulk').set(auth(admin.token)).send(body);

  test('a dry run reports what would happen, returns no credentials and saves nothing', async () => {
    const res = await bulk({ rows, dryRun: true });
    assert.equal(res.body.data.created, 2);
    assert.equal(res.body.data.credentials, undefined);
    assert.equal((await query("SELECT COUNT(*) n FROM students WHERE admission_number LIKE 'ADM-10%'"))[0].n, 0);
  });

  test('admits every row once, returning each one\'s credentials; re-running changes nothing', async () => {
    const res = await bulk({ rows });
    assert.equal(res.body.data.created, 2);
    assert.deepEqual(res.body.data.credentials.map((c) => c.row), [0, 1]);
    const [ama] = res.body.data.credentials;
    assert.equal((await signIn(ama.studentNumber, ama.pin)).status, 200);

    const again = await bulk({ rows });
    assert.deepEqual([again.body.data.created, again.body.data.unchanged], [0, 2]);
    assert.deepEqual(again.body.data.credentials, [], 'existing students never get a new PIN');

    const corrected = await bulk({ rows: [{ ...rows[0], lastName: 'Owusu-Ansah' }] });
    assert.equal(corrected.body.data.updated, 1);
  });

  test('bad rows are reported and the rest still admit', async () => {
    const res = await bulk({
      rows: [
        { firstName: 'Good', lastName: 'Row', programCode: 'BSC-CS', admissionSession: '2026/2027', admissionNumber: 'ADM-200' },
        { firstName: 'Bad', lastName: 'Programme', programCode: 'NOPE', admissionSession: '2026/2027', admissionNumber: 'ADM-201' },
      ],
    });
    assert.equal(res.body.data.created, 1);
    assert.deepEqual(res.body.data.errors.map((e) => e.row), [1]);
    assert.equal((await query("SELECT COUNT(*) n FROM users WHERE first_name = 'Bad'"))[0].n, 0, 'no orphan account');
  });

  test('every row needs an admission number (or an existing student number)', async () => {
    const res = await bulk({ rows: [{ firstName: 'No', lastName: 'Key', programCode: 'BSC-CS', admissionSession: '2026/2027' }] });
    assert.equal(res.status, 422);
  });

  test('the old students import points here', async () => {
    const admin = await loginAs('admin');
    const res = await api().post('/api/admin/import/students').set(auth(admin.token)).send({ rows: [] });
    assert.equal(res.status, 410);
    assert.match(res.body.error.message, /admissions\/bulk/);
  });
});

describe('no self sign-up', () => {
  test('POST /auth/register does not exist', async () => {
    assert.equal((await api().post('/api/auth/register').send({})).status, 404);
  });
});
