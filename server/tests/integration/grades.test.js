import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, login, auth, query, sectionIdFor, courseIdFor, sequelize,
} from './helpers.js';

let student;
let lecturer;
let registrar;
let admin;
let studentId;
let cs201Section;

before(async () => {
  resetDatabase();
  [student, lecturer, registrar, admin] = await Promise.all(['student', 'lecturer', 'registrar', 'admin'].map((w) => loginAs(w)));
  studentId = (await query("SELECT id FROM students WHERE student_number = 'STU2025001'"))[0].id;
  cs201Section = await sectionIdFor('CS201');

  // An approved registration: CS201 (taught by the seeded lecturer) + CS203.
  for (const code of ['CS201', 'CS203']) {
    const res = await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: await sectionIdFor(code) });
    assert.equal(res.status, 201);
  }
  const submitted = await api().post('/api/registrations/submit').set(auth(student.token));
  await api().patch(`/api/admin/registrations/${submitted.body.data.id}/approve`).set(auth(registrar.token)).send({});
});
after(() => sequelize.close());

const grades = (who, body) => api().put(`/api/sections/${cs201Section}/grades`).set(auth(who.token)).send(body);

describe('grade entry', () => {
  test('only the section\'s own lecturer (or registrar) can see or enter grades', async () => {
    const user = await api().post('/api/users').set(auth(admin.token)).send({
      firstName: 'Other', lastName: 'Lecturer', email: 'other.lecturer@test.local', password: 'Passw0rd!', role: 'LECTURER',
    });
    const [{ id: departmentId }] = await query("SELECT id FROM departments WHERE code = 'CS'");
    await api().post('/api/lecturers').set(auth(admin.token)).send({ userId: user.body.data.id, departmentId, staffNumber: 'STF9999' });
    const other = await login('other.lecturer@test.local', 'Passw0rd!');

    assert.equal((await api().get(`/api/sections/${cs201Section}/grades`).set(auth(other.token))).status, 403);
    assert.equal((await api().get(`/api/sections/${cs201Section}/grades`).set(auth(student.token))).status, 403);

    const roster = await api().get(`/api/sections/${cs201Section}/grades`).set(auth(lecturer.token));
    assert.equal(roster.status, 200);
    assert.deepEqual(roster.body.data.students.map((s) => [s.studentNumber, s.grade]), [['STU2025001', null]]);
    assert.equal((await api().get(`/api/sections/${cs201Section}/grades`).set(auth(registrar.token))).status, 200);
  });

  test('rejects unknown grades and students who are not on the roster', async () => {
    assert.equal((await grades(lecturer, { grades: [{ studentId, grade: 'Z' }] })).status, 422);
    const outsider = await grades(lecturer, { grades: [{ studentId: 99999, grade: 'A' }] });
    assert.equal(outsider.status, 400);
    assert.deepEqual(outsider.body.error.details, { studentIds: [99999] });
  });

  test('cannot finalise until every student has a grade', async () => {
    const res = await api().post(`/api/sections/${cs201Section}/grades/finalize`).set(auth(lecturer.token));
    assert.equal(res.status, 422);
    assert.equal(res.body.error.details[0].studentNumber, 'STU2025001');
  });

  test('provisional grades are hidden from the student until finalised', async () => {
    const entered = await grades(lecturer, { grades: [{ studentId, grade: 'D' }] });
    assert.equal(entered.body.data.students[0].status, 'provisional');

    const mine = await api().get('/api/students/me/results').set(auth(student.token));
    assert.ok(!mine.body.data.results.some((r) => r.course.code === 'CS201'));
    const staffView = await api().get(`/api/students/${studentId}/results`).set(auth(registrar.token));
    assert.ok(staffView.body.data.results.some((r) => r.course.code === 'CS201' && r.status === 'provisional'));
  });

  test('finalising publishes grades, notifies students and locks the section', async () => {
    const res = await api().post(`/api/sections/${cs201Section}/grades/finalize`).set(auth(lecturer.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.finalized, true);

    const mine = await api().get('/api/students/me/results').set(auth(student.token));
    const cs201 = mine.body.data.results.find((r) => r.course.code === 'CS201');
    assert.equal(cs201.grade, 'D');
    // CS101 A(4.0) + MATH101 B(3.0) + CS201 D(1.0), all 3 credits
    assert.deepEqual(mine.body.data.summary, { gpa: 2.67, creditsAttempted: 9, creditsEarned: 9 });

    const notes = await api().get('/api/notifications').set(auth(student.token));
    assert.equal(notes.body.data[0].type, 'GRADES_RELEASED');

    assert.equal((await grades(lecturer, { grades: [{ studentId, grade: 'A' }] })).status, 409);
    assert.equal((await api().post(`/api/sections/${cs201Section}/grades/finalize`).set(auth(lecturer.token))).status, 409);
  });

  test('a D does not meet CS202\'s "CS201 (min C)"; a registrar amendment to B does', async () => {
    const cs202 = await courseIdFor('CS202');
    const before = await api().get(`/api/courses/${cs202}/prerequisites/check`).set(auth(student.token));
    assert.equal(before.body.data.qualified, false);
    assert.equal(before.body.data.groups[0].description, 'CS201 (min C)');

    const [{ id: resultId }] = await query('SELECT id FROM results WHERE course_section_id = :cs201Section', { cs201Section });
    assert.equal((await api().patch(`/api/results/${resultId}`).set(auth(lecturer.token)).send({ grade: 'B', reason: 'Re-marked' })).status, 403);
    const amended = await api().patch(`/api/results/${resultId}`).set(auth(registrar.token)).send({ grade: 'B', reason: 'Exam script re-marked' });
    assert.equal(amended.status, 200);

    const [audit] = await query("SELECT metadata FROM audit_logs WHERE action = 'result.amend'");
    assert.deepEqual(JSON.parse(JSON.stringify(audit.metadata)), { from: 'D', to: 'B', reason: 'Exam script re-marked' });

    const after = await api().get(`/api/courses/${cs202}/prerequisites/check`).set(auth(student.token));
    assert.equal(after.body.data.qualified, true);
  });

  test('bulk import saves good rows and reports bad ones', async () => {
    const res = await api().post('/api/results/import').set(auth(registrar.token)).send({
      results: [
        { studentNumber: 'STU2025001', courseCode: 'cs204', grade: 'A' },
        { studentNumber: 'UNKNOWN', courseCode: 'CS204', grade: 'A' },
        { studentNumber: 'STU2025001', courseCode: 'NOPE999', grade: 'A' },
        { studentNumber: 'STU2025001', courseCode: 'CS203', grade: 'Q' },
      ],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.imported, 1);
    assert.deepEqual(res.body.data.errors.map((e) => e.row), [1, 2, 3]);
    assert.equal((await api().post('/api/results/import').set(auth(lecturer.token)).send({ results: [] })).status, 403);
  });
});
