import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import apiRouter from '../../src/routes/index.js';
import env from '../../src/config/env.js';
import * as pinService from '../../src/services/pin.service.js';
import {
  resetDatabase, api, loginAs, login, auth, query, courseIdFor, sectionIdFor, createStudent, approvedResetToken, sequelize,
  createApplicant, submitApplication, plantActivationToken, uploadAvatar, uploadApplicationPhoto,
} from './helpers.js';

const require = createRequire(import.meta.url);
const Route = require('router/lib/route.js');
const hit = new Set();
const originalDispatch = Route.prototype.dispatch;
Route.prototype.dispatch = function dispatch(req, res, done) {
  hit.add(`${req.method} ${req.baseUrl}${this.path}`);
  return originalDispatch.call(this, req, res, done);
};

const routeInventory = () => {
  const source = readFileSync(new URL('../../src/routes/index.js', import.meta.url), 'utf8');
  const prefixes = [...source.matchAll(/router\.use\('([^']+)'/g)].map((m) => m[1]);
  const routes = [];
  const mounted = apiRouter.stack.filter((layer) => !layer.route);
  assert.equal(mounted.length, prefixes.length, 'every router.use() in routes/index.js must mount a router');

  for (const layer of apiRouter.stack.filter((l) => l.route)) {
    for (const method of Object.keys(layer.route.methods)) routes.push(`${method.toUpperCase()} /api${layer.route.path}`);
  }
  mounted.forEach((layer, i) => {
    for (const inner of layer.handle.stack.filter((l) => l.route)) {
      for (const method of Object.keys(inner.route.methods)) {
        routes.push(`${method.toUpperCase()} /api${prefixes[i]}${inner.route.path}`);
      }
    }
  });
  return routes;
};

let admin;
let registrar;
let lecturer;
let student;
const ids = {};

before(async () => {
  resetDatabase();
  [admin, registrar, lecturer, student] = await Promise.all(
    ['admin', 'registrar', 'lecturer', 'student'].map((who) => loginAs(who)),
  );
  ids.cs = (await query("SELECT id FROM departments WHERE code = 'CS'"))[0].id;
  ids.program = (await query("SELECT id FROM programs WHERE code = 'BSC-CS'"))[0].id;
  ids.semester = (await query('SELECT id FROM semesters WHERE is_current = 1'))[0].id;
});
after(() => sequelize.close());

const as = (who) => auth(who.token);

describe('health & auth', () => {
  test('GET /health', async () => {
    const res = await api().get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.database, 'up');

    const saved = { RESEND_API_KEY: env.RESEND_API_KEY, SMTP_HOST: env.SMTP_HOST, EMAIL_FROM: env.EMAIL_FROM };
    try {
      Object.assign(env, { RESEND_API_KEY: undefined, SMTP_HOST: undefined, EMAIL_FROM: undefined });
      assert.equal((await api().get('/api/health')).body.data.integrations.email, false, 'no provider: off');

      Object.assign(env, { RESEND_API_KEY: 're_test_only', EMAIL_FROM: 'UniReg <no-reply@school.edu>' });
      const configured = await api().get('/api/health');
      assert.equal(configured.body.data.integrations.email, true, 'Resend: on');
      assert.equal(JSON.stringify(configured.body).includes('re_test_only'), false, 'never leaks the key');
    } finally {
      Object.assign(env, saved);
    }
  });

  test('admission → first sign-in → change PIN → me → refresh → sessions → requests → forgot/reset PIN → logout', async () => {
    const admitted = await api().post('/api/admissions').set(as(admin)).send({
      firstName: 'Route', lastName: 'Tester', programId: ids.program, admissionSession: '2026/2027',
    });
    assert.equal(admitted.status, 201);
    const { studentNumber, schoolEmail, pin } = admitted.body.data.credentials;

    const first = await login(studentNumber, pin);
    assert.equal((await api().get('/api/courses').set(auth(first.token))).body.error.code, 'PIN_CHANGE_REQUIRED');
    const changed = await api().patch('/api/auth/pin').set(auth(first.token)).set('Cookie', first.cookie)
      .send({ currentPin: pin, newPin: '480162', confirmPin: '480162' });
    assert.equal(changed.status, 200);

    const session = await login(studentNumber, '480162');
    assert.equal((await api().get('/api/auth/me').set(auth(session.token))).body.data.email, schoolEmail);
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', session.cookie)).status, 200);

    const pinCookie = changed.headers['set-cookie'].find((c) => c.startsWith('scrs_refresh='));
    const asDevice = (r) => r.set(auth(changed.body.data.accessToken)).set('Cookie', pinCookie);
    assert.equal((await asDevice(api().patch('/api/auth/me')).send({ lastName: 'Tested' })).status, 403, 'students need approval');
    assert.equal((await uploadAvatar({ token: changed.body.data.accessToken })).status, 200, 'any role can set a picture');
    assert.equal((await asDevice(api().delete('/api/auth/me/avatar'))).status, 200, 'a profile picture can be removed by anyone');
    assert.equal((await asDevice(api().post('/api/auth/verify-email/resend'))).status, 409, 'school email is verified at admission');
    assert.equal((await api().post('/api/auth/verify-email').send({ token: 'x'.repeat(40) })).status, 400);
    const devices = (await asDevice(api().get('/api/auth/sessions'))).body.data;
    assert.equal(devices.filter((d) => d.current).length, 1);
    const other = devices.find((d) => !d.current);
    assert.equal((await asDevice(api().delete(`/api/auth/sessions/${other.id}`))).status, 204);

    const password = await api().patch('/api/auth/password').set(auth(session.token))
      .send({ currentPassword: '480162', newPassword: 'Changed1Pass' });
    assert.equal(password.status, 403, 'students change a PIN, not a password');

    const asStudent = (r) => r.set(auth(session.token));
    const nameReq = () => asStudent(api().post('/api/auth/change-requests')).send({ type: 'name_change', firstName: 'Route', lastName: 'Renamed' });
    const first2 = await nameReq();
    assert.equal(first2.status, 201);
    assert.equal((await nameReq()).status, 409, 'one pending request per type');
    assert.equal((await asStudent(api().delete(`/api/auth/change-requests/${first2.body.data.id}`))).body.data.status, 'cancelled');
    const second = await nameReq();
    const queue = await api().get('/api/admin/account-requests?status=pending').set(as(admin));
    assert.ok(queue.body.data.some((r) => r.id === second.body.data.id));
    const rejected = await api().patch(`/api/admin/account-requests/${second.body.data.id}/reject`).set(as(admin)).send({ note: 'Please use your legal name' });
    assert.equal(rejected.body.data.status, 'rejected');
    const third = await nameReq();
    assert.equal((await api().patch(`/api/admin/account-requests/${third.body.data.id}/approve`).set(as(admin)).send({})).body.data.status, 'approved');
    assert.equal((await asStudent(api().get('/api/auth/me'))).body.data.lastName, 'Renamed');
    assert.equal((await asStudent(api().get('/api/auth/change-requests'))).body.data.length, 3);

    assert.equal((await api().post('/api/auth/forgot-password').send({ email: 'nobody@test.local' })).status, 200);
    assert.equal((await api().post('/api/auth/reset-password').send({ token: 'y'.repeat(40), password: 'Reset1Pass' })).status, 400);

    assert.equal((await api().post('/api/auth/pin/forgot').send({ studentNumber, email: schoolEmail })).status, 200);
    await query('UPDATE users SET pin_otp_sent_at = NULL WHERE email = :email', { email: schoolEmail });
    const otp = await pinService.forgotPin({ studentNumber, email: schoolEmail });
    const reset = await api().post('/api/auth/pin/reset').send({ studentNumber, otp, newPin: '739204', confirmPin: '739204' });
    assert.equal(reset.status, 200);

    const fresh = await login(studentNumber, '739204');
    assert.equal((await api().post('/api/auth/logout').set('Cookie', fresh.cookie)).status, 200);

    const again = await login(studentNumber, '739204');
    assert.equal((await api().post('/api/auth/logout-all').set(auth(again.token))).status, 200);
    assert.equal((await api().get('/api/auth/me').set(auth(again.token))).status, 401);

    const [{ id: studentId }] = await query('SELECT id FROM students WHERE student_number = :studentNumber', { studentNumber });
    const staffReset = await api().post(`/api/students/${studentId}/reset-pin`).set(as(admin));
    assert.equal(staffReset.status, 200);
    const temp = await login(studentNumber, staffReset.body.data.pin);
    assert.equal(temp.user.mustChangePassword, true);

    const bulk = await api().post('/api/admissions/bulk').set(as(admin)).send({
      rows: [{ firstName: 'Bulk', lastName: 'Student', programCode: 'BSC-CS', admissionSession: '2026/2027', admissionNumber: 'ADM-ROUTES-1' }],
      dryRun: true,
    });
    assert.equal(bulk.status, 200);
    assert.equal(bulk.body.data.created, 1);
  });
});

describe('users', () => {
  test('list, get, create, update, deactivate (admin only)', async () => {
    const list = await api().get('/api/users?role=STUDENT&search=scrs.local').set(as(admin));
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((u) => u.email), ['student@scrs.local']);
    assert.equal(list.body.data[0].role.name, 'STUDENT');
    assert.equal(JSON.stringify(list.body).includes('passwordHash'), false);

    const one = await api().get(`/api/users/${list.body.data[0].id}`).set(as(admin));
    assert.equal(one.body.data.email, 'student@scrs.local');

    const created = await api().post('/api/users').set(as(admin)).send({
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada@test.local', password: 'Passw0rd!', role: 'LECTURER',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.role.name, 'LECTURER');
    ids.adaUser = created.body.data.id;

    const promoted = await api().patch(`/api/users/${ids.adaUser}`).set(as(admin)).send({ role: 'REGISTRAR', firstName: 'Augusta' });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.data.role.name, 'REGISTRAR');
    for (const removed of ['SUPER_ADMIN', 'USER', 'ACADEMIC_ADVISOR', 'APPLICANT']) {
      assert.equal((await api().patch(`/api/users/${ids.adaUser}`).set(as(admin)).send({ role: removed })).status, 422, removed);
    }
    assert.equal(promoted.body.data.firstName, 'Augusta');
    await api().patch(`/api/users/${ids.adaUser}`).set(as(admin)).send({ role: 'LECTURER' });

    const temp = await api().post('/api/users').set(as(admin)).send({
      firstName: 'Temp', lastName: 'User', email: 'temp@test.local', password: 'Passw0rd!', role: 'STUDENT',
    });
    const deactivated = await api().delete(`/api/users/${temp.body.data.id}`).set(as(admin));
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.data.status, 'suspended');

    const self = await api().delete(`/api/users/${admin.user.id}`).set(as(admin));
    assert.equal(self.status, 400);

    assert.equal((await api().get('/api/users').set(as(student))).status, 403);
    assert.equal((await api().get('/api/users/role-responsibilities').set(as(admin))).status, 200);
    assert.equal((await api().get('/api/users')).status, 401);
  });
});

describe('departments & programs', () => {
  test('department CRUD', async () => {
    assert.equal((await api().get('/api/departments').set(as(student))).status, 200);
    assert.equal((await api().post('/api/departments').set(as(student)).send({ name: 'Physics', code: 'PHY' })).status, 403);

    const created = await api().post('/api/departments').set(as(admin)).send({ name: 'Physics', code: 'phy' });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.code, 'PHY');
    ids.phy = created.body.data.id;

    assert.equal((await api().get(`/api/departments/${ids.phy}`).set(as(student))).body.data.name, 'Physics');
    const renamed = await api().patch(`/api/departments/${ids.phy}`).set(as(admin)).send({ name: 'Applied Physics' });
    assert.equal(renamed.body.data.name, 'Applied Physics');

    assert.equal((await api().get('/api/departments/summary').set(as(registrar))).status, 200);
    assert.equal((await api().get(`/api/departments/${ids.cs}/overview`).set(as(registrar))).status, 200);
    assert.equal((await api().get(`/api/departments/${ids.cs}/students`).set(as(registrar))).status, 200);
    assert.equal((await api().get(`/api/departments/${ids.cs}/lecturers`).set(as(registrar))).status, 200);
    assert.equal((await api().get('/api/students/summary').set(as(registrar))).status, 200);
    const [{ id: lecturerId }] = await query("SELECT id FROM lecturers WHERE staff_number = 'STF1001'");
    assert.equal((await api().put(`/api/lecturers/${lecturerId}/departments`).set(as(admin)).send({ departmentIds: [ids.phy] })).status, 200);
    assert.equal((await api().put(`/api/lecturers/${lecturerId}/departments`).set(as(admin)).send({ departmentIds: [] })).status, 200);
    assert.equal((await api().post(`/api/departments/${ids.phy}/archive`).set(as(admin))).status, 200);
    assert.equal((await api().post(`/api/departments/${ids.phy}/activate`).set(as(admin))).status, 200);

    const inUse = await api().delete(`/api/departments/${ids.cs}`).set(as(admin));
    assert.equal(inUse.status, 409, 'departments with programs/courses cannot be deleted');
  });

  test('program CRUD and curriculum', async () => {
    const list = await api().get('/api/programs');
    assert.equal(list.status, 200, 'programs are public for the sign-up form');
    assert.ok(list.body.data.some((p) => p.code === 'BSC-CS'));

    const created = await api().post('/api/programs').set(as(admin)).send({ departmentId: ids.phy, name: 'BSc Physics', code: 'bsc-phy' });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.code, 'BSC-PHY');
    ids.phyProgram = created.body.data.id;

    assert.equal((await api().get(`/api/programs/${ids.phyProgram}`)).body.data.department.code, 'PHY');

    const patched = await api().patch(`/api/programs/${ids.phyProgram}`).set(as(admin)).send({ maxCredits: 20 });
    assert.equal(patched.body.data.maxCredits, 20);
    assert.equal(patched.body.data.durationYears, 4, 'partial update keeps other fields');
    assert.equal((await api().get(`/api/programs/${ids.phyProgram}/students`).set(as(registrar))).status, 200);
    assert.equal((await api().post(`/api/programs/${ids.phyProgram}/archive`).set(as(admin))).status, 200);
    assert.equal((await api().post(`/api/programs/${ids.phyProgram}/activate`).set(as(admin))).status, 200);

    const math101 = await courseIdFor('MATH101');
    const added = await api().post(`/api/programs/${ids.phyProgram}/courses`).set(as(registrar)).send({ courseId: math101, type: 'core' });
    assert.equal(added.status, 201);

    const curriculum = await api().get(`/api/programs/${ids.phyProgram}/courses`);
    assert.equal(curriculum.status, 200);
    assert.deepEqual(curriculum.body.data.map((c) => c.code), ['MATH101']);
    assert.equal(curriculum.body.data[0].ProgramCourse.type, 'core');

    assert.equal((await api().delete(`/api/programs/${ids.phyProgram}/courses/${math101}`).set(as(registrar))).status, 204);
    assert.equal((await api().delete(`/api/programs/${ids.phyProgram}`).set(as(admin))).status, 204);
    assert.equal((await api().delete(`/api/departments/${ids.phy}`).set(as(admin))).status, 204);
    assert.equal((await api().get(`/api/departments/${ids.phy}`).set(as(admin))).status, 404);
  });
});

describe('students & lecturers', () => {
  test('student self-service', async () => {
    const me = await api().get('/api/students/me').set(as(student));
    assert.equal(me.body.data.studentNumber, 'STU2025001');
    ids.student = me.body.data.id;

    const results = await api().get('/api/students/me/results').set(as(student));
    assert.deepEqual(results.body.data.results.map((r) => r.course.code).sort(), ['CS101', 'MATH101']);
    assert.equal(results.body.data.summary.gpa, 3.5);

    assert.equal((await api().get('/api/students/me').set(as(lecturer))).status, 403);
  });

  test('staff student management', async () => {
    const list = await api().get('/api/students?search=Mensah&limit=5').set(as(registrar));
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((s) => s.studentNumber), ['STU2025001']);

    assert.equal((await api().get(`/api/students/${ids.student}`).set(as(registrar))).body.data.user.lastName, 'Mensah');
    assert.equal((await api().get(`/api/students/${ids.student}/results`).set(as(registrar))).body.data.results.length, 2);

    const user = await api().post('/api/users').set(as(admin)).send({
      firstName: 'Kwame', lastName: 'Asante', email: 'kwame@test.local', password: 'Passw0rd!', role: 'STUDENT',
    });
    const created = await api().post('/api/students').set(as(admin)).send({
      userId: user.body.data.id, programId: ids.program, studentNumber: 'STU2026500', level: 100,
    });
    assert.equal(created.status, 201);

    const patched = await api().patch(`/api/students/${created.body.data.id}`).set(as(admin)).send({ academicHold: true });
    assert.equal(patched.body.data.academicHold, true);
    assert.equal(patched.body.data.level, 100, 'partial update keeps other fields');

    assert.equal((await api().get('/api/students').set(as(student))).status, 403);
  });

  test('lecturer management and self-service', async () => {
    const created = await api().post('/api/lecturers').set(as(admin)).send({
      userId: ids.adaUser, departmentId: ids.cs, staffNumber: 'STF2002', title: 'Dr.',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const list = await api().get(`/api/lecturers?departmentId=${ids.cs}`).set(as(admin));
    assert.deepEqual(list.body.data.map((l) => l.staffNumber).sort(), ['STF1001', 'STF2002']);
    assert.equal((await api().get('/api/lecturers').set(as(registrar))).status, 200);
    assert.equal((await api().get(`/api/lecturers/${created.body.data.id}`).set(as(registrar))).status, 200);
    assert.equal((await api().patch(`/api/lecturers/${created.body.data.id}`).set(as(registrar)).send({ title: 'x' })).status, 403);
    assert.equal((await api().get('/api/lecturers').set(as(student))).status, 403);

    assert.equal((await api().get(`/api/lecturers/${created.body.data.id}`).set(as(admin))).body.data.user.email, 'ada@test.local');
    const patched = await api().patch(`/api/lecturers/${created.body.data.id}`).set(as(admin)).send({ title: 'Prof.' });
    assert.equal(patched.body.data.title, 'Prof.');

    const mine = await api().get(`/api/lecturers/me/sections?semesterId=${ids.semester}`).set(as(lecturer));
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.data.map((s) => s.course.code).sort(), ['CS201', 'CS202', 'CS203', 'CS301', 'CS301L']);

    const timetable = await api().get('/api/timetable/lecturer/me').set(as(lecturer));
    assert.equal(timetable.status, 200);
    assert.ok(timetable.body.data.days.length > 0);

    const roster = await api().get(`/api/lecturers/sections/${await sectionIdFor('CS201')}/roster`).set(as(lecturer));
    assert.equal(roster.status, 200);

    assert.equal((await api().get('/api/lecturers/me/sections').set(as(student))).status, 403);
  });
});

describe('academic periods', () => {
  test('academic years and semesters', async () => {
    assert.equal((await api().get('/api/academic-years').set(as(student))).status, 200);

    const year = await api().post('/api/academic-years').set(as(registrar))
      .send({ name: '2030/2031', startDate: '2030-01-01', endDate: '2031-12-31' });
    assert.equal(year.status, 201);
    const patchedYear = await api().patch(`/api/academic-years/${year.body.data.id}`).set(as(registrar)).send({ endDate: '2031-06-30' });
    assert.equal(patchedYear.body.data.endDate, '2031-06-30');
    const badYear = await api().patch(`/api/academic-years/${year.body.data.id}`).set(as(registrar)).send({ endDate: '2029-01-01' });
    assert.equal(badYear.status, 400);

    const semester = await api().post('/api/semesters').set(as(registrar)).send({
      academicYearId: year.body.data.id, name: 'First Semester', startDate: '2030-09-01', endDate: '2030-12-20',
      registrationStart: '2030-08-01T00:00:00Z', registrationEnd: '2030-08-31T00:00:00Z', maxCredits: 21,
    });
    assert.equal(semester.status, 201);

    const list = await api().get(`/api/semesters?academicYearId=${year.body.data.id}`).set(as(student));
    assert.deepEqual(list.body.data.map((s) => s.name), ['First Semester']);
    assert.equal((await api().get(`/api/semesters/${semester.body.data.id}`).set(as(student))).body.data.academicYear.name, '2030/2031');
    assert.equal((await api().get('/api/semesters/current').set(as(student))).body.data.id, ids.semester);

    const patched = await api().patch(`/api/semesters/${semester.body.data.id}`).set(as(registrar)).send({ maxCredits: 24 });
    assert.equal(patched.body.data.maxCredits, 24);
    assert.equal(patched.body.data.isCurrent, false);

    assert.equal((await api().post('/api/semesters').set(as(student)).send({})).status, 403);
  });
});

describe('courses, prerequisites, sections & schedules', () => {
  test('course CRUD and prerequisites', async () => {
    const list = await api().get('/api/courses?departmentId=' + ids.cs).set(as(student));
    assert.equal(list.status, 200);

    const created = await api().post('/api/courses').set(as(registrar))
      .send({ departmentId: ids.cs, code: 'CS250', title: 'Web Development', credits: 3, level: 200 });
    assert.equal(created.status, 201);
    ids.cs250 = created.body.data.id;

    const patched = await api().patch(`/api/courses/${ids.cs250}`).set(as(registrar)).send({ title: 'Web Engineering' });
    assert.equal(patched.body.data.title, 'Web Engineering');
    assert.equal(patched.body.data.credits, 3);
    assert.equal((await api().get(`/api/courses/${ids.cs250}`).set(as(student))).body.data.title, 'Web Engineering');

    const cs101 = await courseIdFor('CS101');
    await api().post(`/api/courses/${ids.cs250}/prerequisites`).set(as(registrar)).send({ prerequisiteCourseId: cs101 });
    const prereqs = await api().get(`/api/courses/${ids.cs250}/prerequisites`).set(as(student));
    assert.deepEqual(prereqs.body.data.map((c) => c.code), ['CS101']);
    const check = await api().get(`/api/courses/${ids.cs250}/prerequisites/check`).set(as(student));
    assert.equal(check.body.data.qualified, true);
    assert.equal((await api().delete(`/api/courses/${ids.cs250}/prerequisites/${cs101}`).set(as(registrar))).status, 204);
  });

  test('section and schedule CRUD', async () => {
    const section = await api().post('/api/sections').set(as(registrar))
      .send({ courseId: ids.cs250, semesterId: ids.semester, capacity: 25 });
    assert.equal(section.status, 201);
    const sectionId = section.body.data.id;

    const list = await api().get(`/api/sections?semesterId=${ids.semester}&courseId=${ids.cs250}`).set(as(student));
    assert.deepEqual(list.body.data.map((s) => s.id), [sectionId]);
    assert.equal((await api().get(`/api/sections/${sectionId}`).set(as(student))).body.data.course.code, 'CS250');

    const resized = await api().patch(`/api/sections/${sectionId}`).set(as(registrar)).send({ capacity: 40, lecturerId: null });
    assert.equal(resized.status, 200);
    assert.equal(resized.body.data.capacity, 40);
    assert.equal(resized.body.data.waitlistEnabled, true, 'partial update keeps other fields');

    const schedule = await api().post('/api/schedules').set(as(registrar))
      .send({ courseSectionId: sectionId, day: 'SAT', startTime: '09:00', endTime: '11:00', room: 'LAB-9' });
    assert.equal(schedule.status, 201);
    const scheduleId = schedule.body.data.id;

    const bySection = await api().get(`/api/schedules?courseSectionId=${sectionId}`).set(as(student));
    assert.deepEqual(bySection.body.data.map((s) => s.id), [scheduleId]);
    assert.equal((await api().get(`/api/schedules/${scheduleId}`).set(as(student))).body.data.room, 'LAB-9');

    const moved = await api().patch(`/api/schedules/${scheduleId}`).set(as(registrar)).send({ room: 'LAB-10', startTime: '10:00' });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.room, 'LAB-10');
    assert.equal(moved.body.data.startTime, '10:00:00');

    const reversed = await api().patch(`/api/schedules/${scheduleId}`).set(as(registrar)).send({ startTime: '12:00' });
    assert.equal(reversed.status, 422, 'start after end is a validation error');

    assert.equal((await api().delete(`/api/schedules/${scheduleId}`).set(as(registrar))).status, 204);
    assert.equal((await api().get(`/api/schedules/${scheduleId}`).set(as(student))).status, 404);

    assert.equal((await api().delete(`/api/sections/${sectionId}`).set(as(registrar))).status, 204);
    assert.equal((await api().get(`/api/sections/${sectionId}`).set(as(student))).status, 404);

    assert.equal((await api().delete(`/api/courses/${ids.cs250}`).set(as(registrar))).status, 204);
  });
});

describe('registration lifecycle, waitlist, notifications, timetable', () => {
  test('student registration endpoints', async () => {
    assert.equal((await api().get('/api/registrations/current').set(as(student))).status, 200);
    assert.equal((await api().get('/api/registrations/available-courses').set(as(student))).status, 200);

    const cs201 = await sectionIdFor('CS201');
    const addRes = await api().post('/api/registrations/items').set(as(student)).send({ courseSectionId: cs201 });
    assert.equal(addRes.status, 201);
    await api().post('/api/registrations/items').set(as(student)).send({ courseSectionId: await sectionIdFor('MATH201') });

    assert.equal((await api().delete(`/api/sections/${cs201}`).set(as(registrar))).status, 409);

    const current = await api().get('/api/registrations/current').set(as(student));
    const mathItem = current.body.data.registration.items.find((i) => i.section.course.code === 'MATH201');
    assert.equal((await api().delete(`/api/registrations/items/${mathItem.id}`).set(as(student))).status, 200);

    const submitted = await api().post('/api/registrations/submit').set(as(student));
    assert.equal(submitted.status, 422, 'CS201 alone (3 credits) is below the 6-credit minimum');
    await api().post('/api/registrations/items').set(as(student)).send({ courseSectionId: await sectionIdFor('CS203') });
    const ok = await api().post('/api/registrations/submit').set(as(student));
    assert.equal(ok.status, 200);
    ids.registration = ok.body.data.id;

    const pdf = await api().get(`/api/registrations/${ids.registration}/slip`).set(as(student));
    assert.equal(pdf.headers['content-type'], 'application/pdf');
    const slipData = (await api().get(`/api/registrations/${ids.registration}/slip?format=json`).set(as(student))).body.data;
    const verified = await api().get(`/api/registrations/verify/${slipData.referenceNumber}?code=${slipData.verificationCode}`);
    assert.equal(verified.body.data.valid, true);
    assert.equal((await api().get(`/api/admin/registrations/${ids.registration}/slip?format=json`).set(as(registrar))).status, 200);

    const history = await api().get('/api/registrations/history').set(as(student));
    assert.deepEqual(history.body.data.map((r) => r.id), [ids.registration]);

    assert.equal((await api().get('/api/timetable/me').set(as(student))).body.data.totalCredits, 6);
  });

  test('admin reject → student notified → resubmit → approve', async () => {
    const list = await api().get('/api/admin/registrations?status=submitted').set(as(registrar));
    assert.deepEqual(list.body.data.map((r) => r.id), [ids.registration]);

    const detail = await api().get(`/api/admin/registrations/${ids.registration}`).set(as(registrar));
    assert.equal(detail.body.data.student.studentNumber, 'STU2025001');
    assert.equal(detail.body.data.items.length, 2);

    const rejected = await api().patch(`/api/admin/registrations/${ids.registration}/reject`).set(as(registrar))
      .send({ remarks: 'Please add MATH201' });
    assert.equal(rejected.body.data.status, 'rejected');
    assert.equal(rejected.body.data.remarks, 'Please add MATH201');

    const resubmitted = await api().post('/api/registrations/submit').set(as(student));
    assert.equal(resubmitted.body.data.status, 'submitted');
    const approved = await api().patch(`/api/admin/registrations/${ids.registration}/approve`).set(as(registrar)).send({});
    assert.equal(approved.body.data.status, 'approved');

    assert.equal((await api().patch(`/api/admin/registrations/${ids.registration}/reject`).set(as(student)).send({})).status, 403);
  });

  test('notifications: list, mark one read, mark all read', async () => {
    const list = await api().get('/api/notifications').set(as(student));
    const rejection = list.body.data.find((n) => n.type === 'REGISTRATION_REJECTED');
    assert.match(rejection.message, /Please add MATH201/);
    const unreadBefore = list.body.meta.unreadCount;
    assert.ok(unreadBefore >= 3);

    const read = await api().patch(`/api/notifications/${rejection.id}/read`).set(as(student));
    assert.ok(read.body.data.readAt);
    assert.equal((await api().get('/api/notifications?unread=true').set(as(student))).body.meta.unreadCount, unreadBefore - 1);

    const all = await api().patch('/api/notifications/read-all').set(as(student));
    assert.equal(all.body.data.updated, unreadBefore - 1);
    assert.equal((await api().get('/api/notifications?unread=true').set(as(student))).body.data.length, 0);

    assert.equal((await api().patch(`/api/notifications/${rejection.id}/read`).set(as(registrar))).status, 404, "cannot read someone else's notification");
  });

  test('waitlist join, list, leave', async () => {
    const other = await createStudent(1);
    const sectionId = await sectionIdFor('MATH201');
    await query('UPDATE course_sections SET capacity = 1, seats_taken = 1 WHERE id = :sectionId', { sectionId });

    const joined = await api().post('/api/waitlists').set(auth(other.token)).send({ courseSectionId: sectionId });
    assert.equal(joined.status, 201);
    const mine = await api().get('/api/waitlists/me').set(auth(other.token));
    assert.equal(mine.body.data[0].section.course.code, 'MATH201');
    assert.equal((await api().delete(`/api/waitlists/${joined.body.data.id}`).set(auth(other.token))).status, 204);
    assert.deepEqual((await api().get('/api/waitlists/me').set(auth(other.token))).body.data, []);
  });

  test('reports, audit logs, settings', async () => {
    assert.equal((await api().get('/api/admin/reports/course-popularity').set(as(registrar))).status, 200);
    const summary = await api().get('/api/admin/reports/registration-summary').set(as(registrar));
    assert.equal(summary.body.data.students, 1);

    const deliveries = await api().get('/api/admin/email-deliveries?limit=5').set(as(admin));
    assert.equal(deliveries.status, 200);
    assert.equal((await api().get('/api/admin/email-deliveries').set(as(registrar))).status, 403);
    const options = await api().get('/api/admin/audit-logs/options').set(as(admin));
    assert.equal(options.status, 200);
    assert.ok(options.body.data.entityTypes.length > 0);
    const audit = await api().get('/api/admin/audit-logs?entityType=Registration').set(as(admin));
    assert.ok(audit.body.data.some((a) => a.action === 'registration.rejected'));

    assert.equal((await api().get('/api/admin/settings').set(as(admin))).status, 200);
    const patched = await api().patch('/api/admin/settings').set(as(admin))
      .send({ settings: [{ key: 'registration.defaultMaxCredits', value: 21 }] });
    assert.equal(patched.body.data.find((s) => s.key === 'registration.defaultMaxCredits').value, 21);
  });
});

describe('grades, prerequisite overrides, registration priority', () => {
  test('lecturer enters and finalises grades; registrar amends and imports', async () => {
    const cs201 = await sectionIdFor('CS201');
    const roster = await api().get(`/api/sections/${cs201}/grades`).set(as(lecturer));
    assert.equal(roster.status, 200);
    assert.deepEqual(roster.body.data.students.map((s) => s.studentNumber), ['STU2025001']);

    const entered = await api().put(`/api/sections/${cs201}/grades`).set(as(lecturer))
      .send({ grades: [{ studentId: ids.student, grade: 'b+' }] });
    assert.equal(entered.status, 200);
    assert.equal(entered.body.data.students[0].grade, 'B+');
    assert.equal(entered.body.data.students[0].status, 'provisional');

    const finalized = await api().post(`/api/sections/${cs201}/grades/finalize`).set(as(lecturer));
    assert.equal(finalized.body.data.finalized, true);

    const [{ id: resultId }] = await query('SELECT id FROM results WHERE course_section_id = :cs201', { cs201 });
    const amended = await api().patch(`/api/results/${resultId}`).set(as(registrar)).send({ grade: 'A', reason: 'Script re-marked' });
    assert.equal(amended.body.data.grade, 'A');

    const imported = await api().post('/api/results/import').set(as(registrar)).send({
      results: [
        { studentNumber: 'STU2025001', courseCode: 'MATH201', grade: 'C' },
        { studentNumber: 'NOPE', courseCode: 'MATH201', grade: 'C' },
      ],
    });
    assert.equal(imported.body.data.imported, 1);
    assert.equal(imported.body.data.failed, 1);
  });

  test('the registrar grants and revokes a prerequisite override', async () => {
    const cs301 = await courseIdFor('CS301');
    const granted = await api().post(`/api/students/${ids.student}/prerequisite-overrides`).set(as(registrar))
      .send({ courseId: cs301, semesterId: ids.semester, reason: 'Completed equivalent course abroad' });
    assert.equal(granted.status, 201);

    const list = await api().get(`/api/students/${ids.student}/prerequisite-overrides`).set(as(registrar));
    assert.deepEqual(list.body.data.map((o) => o.course.code), ['CS301']);

    assert.equal((await api().delete(`/api/students/${ids.student}/prerequisite-overrides/${granted.body.data.id}`).set(as(registrar))).status, 204);
    assert.equal((await api().get(`/api/students/${ids.student}/prerequisite-overrides`).set(as(student))).status, 403);
  });

  test('registrar manages priority windows and individual registration times', async () => {
    const [semester] = await query('SELECT registration_start AS start FROM semesters WHERE id = :id', { id: ids.semester });
    const opensAt = new Date(new Date(semester.start).getTime() + 60 * 60 * 1000).toISOString();

    const created = await api().post(`/api/semesters/${ids.semester}/priority-windows`).set(as(registrar))
      .send({ name: 'Final year', minLevel: 400, opensAt });
    assert.equal(created.status, 201);
    const windowId = created.body.data.id;

    assert.equal((await api().get(`/api/semesters/${ids.semester}/priority-windows`).set(as(registrar))).body.data.length, 1);
    const renamed = await api().patch(`/api/semesters/${ids.semester}/priority-windows/${windowId}`).set(as(registrar)).send({ name: 'Level 400' });
    assert.equal(renamed.body.data.name, 'Level 400');

    const override = await api().put(`/api/semesters/${ids.semester}/registration-overrides`).set(as(registrar))
      .send({ studentId: ids.student, opensAt, reason: 'Varsity athlete' });
    assert.equal(override.status, 200);
    const overrides = await api().get(`/api/semesters/${ids.semester}/registration-overrides`).set(as(registrar));
    assert.deepEqual(overrides.body.data.map((o) => o.reason), ['Varsity athlete']);
    assert.equal((await api().delete(`/api/semesters/${ids.semester}/registration-overrides/${ids.student}`).set(as(registrar))).status, 204);
    assert.equal((await api().delete(`/api/semesters/${ids.semester}/priority-windows/${windowId}`).set(as(registrar))).status, 204);
  });
});

describe('staff tools: enrolment, sign-ins, users’ devices', () => {
  test('registrar adds and removes a student; admin reviews sign-ins and signs a device out', async () => {
    const s = await createStudent(700);
    const sectionId = await sectionIdFor('CS201');
    const added = await api().post(`/api/admin/sections/${sectionId}/students`).set(as(registrar)).send({ studentId: s.studentId });
    assert.equal(added.status, 201);
    assert.equal(added.body.data.registration.items[0].addedBy > 0, true);
    const removed = await api().delete(`/api/admin/sections/${sectionId}/students/${s.studentId}`).set(as(registrar))
      .send({ reason: 'Added to the wrong section' });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.items.length, 0);

    const signIns = await api().get(`/api/admin/sign-ins?userId=${s.userId}`).set(as(admin));
    assert.equal(signIns.status, 200);

    const devices = await api().get(`/api/users/${s.userId}/sessions`).set(as(admin));
    assert.ok(devices.body.data.length >= 1);
    assert.equal((await api().delete(`/api/users/${s.userId}/sessions/${devices.body.data[0].id}`).set(as(admin))).status, 204);
  });
});

describe('teaching, announcements, roles & overview', () => {
  test('attendance, assessments, tasks, announcements, role permissions and the overview report', async () => {
    const cs201 = await sectionIdFor('CS201');

    const session = await api().post(`/api/sections/${cs201}/attendance`).set(as(lecturer)).send({ date: '2026-02-02', records: [] });
    assert.equal(session.status, 201);
    assert.equal((await api().get(`/api/sections/${cs201}/attendance`).set(as(lecturer))).status, 200);
    assert.equal((await api().get(`/api/attendance/${session.body.data.id}`).set(as(lecturer))).status, 200);
    assert.equal((await api().put(`/api/attendance/${session.body.data.id}`).set(as(lecturer)).send({ topic: 'Recursion' })).body.data.topic, 'Recursion');
    assert.equal((await api().delete(`/api/attendance/${session.body.data.id}`).set(as(lecturer))).status, 204);
    assert.equal((await api().get('/api/students/me/attendance').set(as(student))).status, 200);

    const assessment = await api().post(`/api/sections/${cs201}/assessments`).set(as(lecturer))
      .send({ title: 'Lab report', type: 'assignment', maxScore: 10, weight: 5 });
    assert.equal(assessment.status, 201);
    const id = assessment.body.data.id;
    assert.equal((await api().get(`/api/sections/${cs201}/assessments`).set(as(lecturer))).status, 200);
    assert.equal((await api().patch(`/api/assessments/${id}`).set(as(lecturer)).send({ weight: 4 })).body.data.weight, 4);
    const roster = (await api().get(`/api/assessments/${id}/scores`).set(as(lecturer))).body.data.students;
    assert.ok(roster.length > 0);
    assert.equal((await api().put(`/api/assessments/${id}/scores`).set(as(lecturer)).send({ scores: [{ studentId: roster[0].studentId, score: 8 }] })).status, 200);
    assert.equal((await api().post(`/api/assessments/${id}/publish`).set(as(lecturer))).status, 200);
    assert.equal((await api().get('/api/students/me/assessments').set(as(student))).status, 200);
    assert.equal((await api().delete(`/api/assessments/${id}`).set(as(lecturer))).status, 204);
    assert.equal((await api().get('/api/lecturers/me/tasks').set(as(lecturer))).status, 200);

    const post = await api().post('/api/announcements').set(as(registrar)).send({ title: 'Library hours', body: 'Open late this week.', audience: 'everyone' });
    assert.equal(post.status, 201);
    assert.equal((await api().get('/api/announcements').set(as(student))).status, 200);
    assert.equal((await api().get('/api/announcements/mine').set(as(registrar))).body.data[0].title, 'Library hours');
    assert.equal((await api().patch(`/api/announcements/${post.body.data.id}`).set(as(registrar)).send({ pinned: true })).body.data.pinned, true);
    assert.equal((await api().delete(`/api/announcements/${post.body.data.id}`).set(as(registrar))).status, 204);

    const roles = (await api().get('/api/admin/roles').set(as(admin))).body.data;
    assert.equal((await api().get('/api/admin/permissions').set(as(admin))).status, 200);
    const lecturerRole = roles.find((r) => r.name === 'LECTURER');
    assert.equal((await api().put(`/api/admin/roles/${lecturerRole.id}/permissions`).set(as(admin)).send({ permissions: lecturerRole.defaults })).status, 200);
    assert.equal((await api().get('/api/admin/reports/overview').set(as(registrar))).status, 200);
  });

  test('bulk import endpoints (dry runs) and invites', async () => {
    const rows = {
      departments: [{ code: 'RT', name: 'Route Test' }],
      programs: [{ code: 'BSC-CS', name: 'Computer Science', departmentCode: 'CS' }],
      courses: [{ code: 'RT101', title: 'Route Test', departmentCode: 'CS', credits: 3, level: 100 }],
      'program-courses': [{ programCode: 'BSC-CS', courseCode: 'CS101' }],
      prerequisites: [{ courseCode: 'CS101', requiresAnyOf: ['MATH101'] }],
      lecturers: [{ email: 'rt.lecturer@test.local', firstName: 'Rt', lastName: 'Lecturer', staffNumber: 'RT-1', departmentCode: 'CS' }],
      sections: [{ courseCode: 'CS101', sectionCode: 'RT', capacity: 5 }],
    };
    for (const [path, body] of Object.entries(rows)) {
      const who = ['courses', 'program-courses', 'prerequisites', 'sections'].includes(path) ? registrar : admin;
      const res = await api().post(`/api/admin/import/${path}`).set(as(who)).send({ rows: body, dryRun: true });
      assert.equal(res.status, 200, `${path}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.dryRun, true);
    }
    const catalog = await api().post('/api/admin/import/course-catalog').set(as(registrar)).send({
      dryRun: true,
      rows: [{ courseCode: 'RT201', courseTitle: 'Route Test', department: 'CS', programme: 'BSC-CS', level: '200', semester: '1', creditHours: '3', courseType: 'core' }],
    });
    assert.equal(catalog.status, 200, JSON.stringify(catalog.body));
    assert.equal(catalog.body.data.valid, 1);
    assert.equal((await api().post('/api/admin/import/invites').set(as(admin)).send({})).status, 200);
    assert.equal((await api().post('/api/admin/import/students').set(as(admin)).send({ rows: [] })).status, 410);

    const invited = await api().post('/api/users').set(as(admin)).send({
      firstName: 'Invited', lastName: 'Registrar', email: 'rt.invited@test.local', role: 'REGISTRAR',
    });
    assert.equal(invited.status, 201);
    assert.equal((await api().post(`/api/users/${invited.body.data.id}/invite`).set(as(admin))).status, 204);
  });
});

describe('section lifecycle notifications', () => {
  test('cancelling, unassigning or rescheduling a section notifies the lecturer and its registered students', async () => {
    const course = await api().post('/api/courses').set(as(registrar))
      .send({ departmentId: ids.cs, code: 'CS270', title: 'Notification Coverage', credits: 3, level: 200 });
    assert.equal(course.status, 201);
    const courseId = course.body.data.id;
    await api().post(`/api/programs/${ids.program}/courses`).set(as(registrar)).send({ courseId, type: 'elective' });

    const [{ id: lecturerId }] = await query('SELECT id FROM lecturers WHERE user_id = :userId', { userId: lecturer.user.id });
    const section = await api().post('/api/sections').set(as(registrar))
      .send({ courseId, semesterId: ids.semester, capacity: 5, lecturerId });
    assert.equal(section.status, 201);
    const sectionId = section.body.data.id;

    const newStudent = await createStudent(2);
    assert.equal((await api().post('/api/registrations/items').set(auth(newStudent.token)).send({ courseSectionId: sectionId })).status, 201);

    const schedule = await api().post('/api/schedules').set(as(registrar))
      .send({ courseSectionId: sectionId, day: 'SUN', startTime: '18:00', endTime: '19:00', room: 'ZZZ-TEST' });
    assert.equal(schedule.status, 201);
    assert.equal((await api().patch(`/api/schedules/${schedule.body.data.id}`).set(as(registrar)).send({ room: 'R2' })).status, 200);

    assert.equal((await api().patch(`/api/sections/${sectionId}`).set(as(registrar)).send({ status: 'cancelled' })).status, 200);

    const lecturerTypes = (await api().get('/api/notifications').set(as(lecturer))).body.data.map((n) => n.type);
    assert.ok(lecturerTypes.includes('SECTION_RESCHEDULED'), 'lecturer is told about the room change');
    assert.ok(lecturerTypes.includes('SECTION_CANCELLED'), 'lecturer is told their section was cancelled');

    const studentTypes = (await api().get('/api/notifications').set(auth(newStudent.token))).body.data.map((n) => n.type);
    assert.ok(studentTypes.includes('SECTION_RESCHEDULED'), 'registered student is told about the room change');
    assert.ok(studentTypes.includes('SECTION_CANCELLED'), 'registered student is told their section was cancelled');

    assert.equal((await api().patch(`/api/sections/${sectionId}`).set(as(registrar)).send({ lecturerId: null })).status, 200);
    const lecturerTypesAfter = (await api().get('/api/notifications').set(as(lecturer))).body.data.map((n) => n.type);
    assert.ok(lecturerTypesAfter.includes('SECTION_UNASSIGNED'), 'lecturer is told they are no longer assigned');
  });
});

describe('online admission and timetable issues', () => {
  test('sign up → options → save → submit → review list/detail → admit → resend → activate; reject', async () => {
    const applicant = await createApplicant('rt');
    assert.equal((await api().get('/api/applications/options').set(as(applicant))).status, 200);
    assert.equal((await api().get('/api/applications/me').set(as(applicant))).body.data.application, null);
    assert.equal((await api().get('/api/applications/me/photo').set(as(applicant))).status, 404);
    assert.equal((await api().delete('/api/applications/me/photo').set(as(applicant))).status, 404);
    const application = await submitApplication(applicant);
    assert.equal((await api().get('/api/applications/me/photo').set(as(applicant))).status, 200);
    assert.equal((await api().get(`/api/applications/${application.id}/photo`).set(as(admin))).status, 200);
    assert.equal((await uploadApplicationPhoto(applicant)).status, 409, 'locked once submitted');

    assert.equal((await api().get('/api/applications?status=submitted').set(as(admin))).status, 200);
    assert.equal((await api().get(`/api/applications/${application.id}`).set(as(admin))).status, 200);
    const admitted = await api().post(`/api/applications/${application.id}/admit`).set(as(admin)).send({});
    assert.equal(admitted.status, 200, JSON.stringify(admitted.body));
    const studentId = admitted.body.data.application.student.id;
    assert.equal((await api().get(`/api/students/${studentId}/application`).set(as(registrar))).status, 200);
    assert.equal((await api().get(`/api/students/${studentId}/application/photo?size=thumb`).set(as(registrar))).status, 200);
    assert.equal((await api().post(`/api/applications/${application.id}/resend-activation`).set(as(admin))).status, 200);

    const token = await plantActivationToken(application.userId);
    const activated = await api().post('/api/applications/activate').send({ token, pin: '482915', confirmPin: '482915' });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));

    const other = await createApplicant('rt2');
    const second = await submitApplication(other);
    assert.equal((await api().post(`/api/applications/${second.id}/reject`).set(as(admin)).send({ reason: 'Incomplete results' })).status, 200);
  });

  test('timetable issues: list and resolve', async () => {
    const [registration] = await query('SELECT id FROM registrations LIMIT 1');
    const cs201 = await sectionIdFor('CS201');
    await query(
      `INSERT INTO timetable_issues (registration_id, course_section_id, type, details, status, created_at, updated_at)
       VALUES (:registrationId, :cs201, 'ROOM', '[]', 'open', NOW(), NOW())`,
      { registrationId: registration.id, cs201 },
    );
    const listed = await api().get('/api/admin/timetable-issues?status=open').set(as(registrar));
    assert.equal(listed.status, 200);
    const resolved = await api().post(`/api/admin/timetable-issues/${listed.body.data[0].id}/resolve`).set(as(registrar)).send({ note: 'Room swapped' });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.status, 'resolved');
  });
});

describe('lecturer accounts and course-offering assignment', () => {
  test('create → deactivate/activate → invite; assign → history → unassign', async () => {
    const created = await api().post('/api/lecturers').set(as(admin)).send({
      firstName: 'Route', lastName: 'Lecturer', staffNumber: 'RT-LEC-1', departmentId: ids.cs, schoolEmail: 'route.lecturer@staff.test',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const lecturerId = created.body.data.id;
    assert.equal((await api().post(`/api/lecturers/${lecturerId}/deactivate`).set(as(admin))).status, 200);
    assert.equal((await api().post(`/api/lecturers/${lecturerId}/activate`).set(as(admin))).status, 200);
    assert.equal((await api().post(`/api/lecturers/${lecturerId}/invite`).set(as(admin))).status, 204);

    const [{ id: sectionId }] = await query(
      "SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id WHERE c.code = 'CS202' AND s.status <> 'cancelled' LIMIT 1",
    );
    const assigned = await api().put(`/api/sections/${sectionId}/lecturer`).set(as(registrar)).send({ lecturerId });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
    assert.equal((await api().get(`/api/sections/${sectionId}/lecturer-history`).set(as(registrar))).status, 200);
    assert.equal((await api().delete(`/api/sections/${sectionId}/lecturer`).set(as(registrar)).send({ reason: 'Route test' })).status, 200);
  });
});

test('every registered route was exercised by this file', () => {
  const inventory = routeInventory();
  assert.ok(inventory.length >= 70, `expected the full route table, found ${inventory.length}`);
  const missed = inventory.filter((route) => !hit.has(route));
  assert.deepEqual(missed, [], `routes never called: ${missed.join(', ')}`);
});
