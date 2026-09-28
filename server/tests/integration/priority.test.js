import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, auth, query, sectionIdFor, createStudent, sequelize,
} from './helpers.js';

const HOUR = 60 * 60 * 1000;
let student;
let registrar;
let admin;
let semester;
let windowIds = [];

before(async () => {
  resetDatabase();
  [student, registrar, admin] = await Promise.all([loginAs('student'), loginAs('registrar'), loginAs('admin')]);
  [semester] = await query('SELECT id, registration_start AS start, registration_end AS end FROM semesters WHERE is_current = 1');
});
after(() => sequelize.close());

const window = (body) => api().post(`/api/semesters/${semester.id}/priority-windows`).set(auth(registrar.token)).send(body);
const add = (who, code) => sectionIdFor(code).then((id) => api().post('/api/registrations/items').set(auth(who.token)).send({ courseSectionId: id }));

describe('priority windows', () => {
  test('windows must open inside the registration period', async () => {
    const res = await window({ name: 'Too early', minLevel: 400, opensAt: new Date(new Date(semester.start).getTime() - HOUR).toISOString() });
    assert.equal(res.status, 400);
  });

  test('a level-200 student is blocked until the general window, and is told when it opens', async () => {
    const finalYear = await window({ name: 'Final year', minLevel: 400, opensAt: new Date(new Date(semester.start).getTime() + HOUR).toISOString() });
    const general = await window({ name: 'All other students', opensAt: new Date(Date.now() + 2 * 24 * HOUR).toISOString() });
    assert.equal(finalYear.status, 201);
    assert.equal(general.status, 201);
    windowIds = [finalYear.body.data.id, general.body.data.id];

    const res = await add(student, 'CS201');
    assert.equal(res.status, 422);
    const failure = res.body.error.details.find((d) => d.rule === 'REGISTRATION_WINDOW');
    assert.match(failure.message, /Your registration for Current Semester opens on .* \(All other students\)/);

    const current = await api().get('/api/registrations/current').set(auth(student.token));
    assert.equal(current.body.data.semester.registrationOpen, false);
    assert.equal(current.body.data.semester.priority.windowName, 'All other students');

    const list = await api().get('/api/registrations/available-courses').set(auth(student.token));
    assert.equal(list.body.data.semester.registrationOpen, false);
    assert.ok(list.body.data.courses[0].sections[0].reasons.some((r) => r.rule === 'REGISTRATION_WINDOW'));
  });

  test('a final-year student is already in their window', async () => {
    const senior = await createStudent(400);
    await api().patch(`/api/students/${senior.studentId}`).set(auth(admin.token)).send({ level: 400 });
    const res = await add(senior, 'CS201');
    assert.equal(res.status, 201);
  });

  test('an individual override lets one student in early', async () => {
    const [{ id: studentId }] = await query("SELECT id FROM students WHERE student_number = 'STU2025001'");
    const res = await api().put(`/api/semesters/${semester.id}/registration-overrides`).set(auth(registrar.token))
      .send({ studentId, opensAt: new Date(semester.start).toISOString(), reason: 'Accessibility accommodation' });
    assert.equal(res.status, 200);

    assert.equal((await add(student, 'CS201')).status, 201);
    const current = await api().get('/api/registrations/current').set(auth(student.token));
    assert.equal(current.body.data.semester.priority.source, 'override');

    const list = await api().get(`/api/semesters/${semester.id}/registration-overrides`).set(auth(registrar.token));
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((o) => [o.student.studentNumber, o.student.user.lastName, o.reason]), [
      ['STU2025001', 'Mensah', 'Accessibility accommodation'],
    ]);
    assert.equal((await api().get('/api/semesters/999999/registration-overrides').set(auth(registrar.token))).status, 404);
    assert.equal((await api().get(`/api/semesters/${semester.id}/registration-overrides`).set(auth(student.token))).status, 403);
  });

  test('students cannot manage windows', async () => {
    assert.equal((await api().get(`/api/semesters/${semester.id}/priority-windows`).set(auth(student.token))).status, 403);
  });

  test('removing the windows restores the normal opening for everyone', async () => {
    for (const id of windowIds) {
      assert.equal((await api().delete(`/api/semesters/${semester.id}/priority-windows/${id}`).set(auth(registrar.token))).status, 204);
    }
    const other = await createStudent(401);
    assert.equal((await add(other, 'MATH201')).status, 201);
  });
});
