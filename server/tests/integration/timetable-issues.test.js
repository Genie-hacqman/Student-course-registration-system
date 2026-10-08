import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, requireManualApproval, api, loginAs, auth, query, sectionIdFor, createStudent, sequelize,
} from './helpers.js';

let registrar;
let lecturer;
let math201;
let cs201;

before(async () => {
  resetDatabase();
  await requireManualApproval();
  [registrar, lecturer] = await Promise.all([loginAs('registrar'), loginAs('lecturer')]);
  [math201, cs201] = await Promise.all([sectionIdFor('MATH201'), sectionIdFor('CS201')]);
});
after(() => sequelize.close());

const add = async (student, code) => {
  const res = await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: await sectionIdFor(code) });
  assert.equal(res.status, 201, `${code}: ${JSON.stringify(res.body)}`);
};
const submitted = async (n, codes = ['CS201', 'MATH201']) => {
  const student = await createStudent(n);
  for (const code of codes) await add(student, code);
  const res = await api().post('/api/registrations/submit').set(auth(student.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { student, registrationId: res.body.data.id };
};
const approve = (id) => api().patch(`/api/admin/registrations/${id}/approve`).set(auth(registrar.token)).send({});
const openIssues = (registrationId) =>
  query("SELECT id, course_section_id, type, status FROM timetable_issues WHERE registration_id = :registrationId AND status = 'open' ORDER BY id", { registrationId });
const mathSlot = async () => (await query('SELECT id FROM schedules WHERE course_section_id = :math201', { math201 }))[0].id;
const moveMath = async (slot) => {
  const res = await api().patch(`/api/schedules/${await mathSlot()}`).set(auth(registrar.token)).send(slot);
  assert.equal(res.status, 200, JSON.stringify(res.body));
};
const MATH_HOME = { day: 'FRI', startTime: '09:00', endTime: '11:00', room: 'LT-4' };

describe('student clash introduced after submission', () => {
  test('approval is refused with the clash, recorded once, and succeeds after the schedule is fixed', async () => {
    const { student, registrationId } = await submitted(1);

    await moveMath({ day: 'MON', startTime: '09:00', endTime: '10:00', room: 'LT-4' });

    const refused = await approve(registrationId);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'TIMETABLE_CONFLICT');
    assert.deepEqual(refused.body.error.details.map((i) => i.type), ['STUDENT', 'STUDENT']);
    assert.match(refused.body.error.details[0].details[0].message, /overlaps/);

    const [reg] = await query('SELECT status, timetable_confirmed_at FROM registrations WHERE id = :registrationId', { registrationId });
    assert.equal(reg.status, 'submitted', 'nothing about the registration changed');
    assert.equal(reg.timetable_confirmed_at, null);
    assert.equal((await openIssues(registrationId)).length, 2);

    assert.equal((await approve(registrationId)).status, 409);
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM timetable_issues WHERE registration_id = :registrationId', { registrationId });
    assert.equal(n, 2, 'a retry updates the recorded issues instead of duplicating them');

    const listed = await api().get(`/api/admin/timetable-issues?status=open&registrationId=${registrationId}`).set(auth(registrar.token));
    assert.equal(listed.status, 200);
    assert.equal(listed.body.meta.total, 2);
    assert.equal(listed.body.data[0].registration.student.studentNumber, student.studentNumber);

    await moveMath(MATH_HOME);
    const approved = await approve(registrationId);
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.ok(approved.body.data.timetableConfirmedAt);
    assert.equal((await openIssues(registrationId)).length, 0, 'confirmation closes the open issues');
  });

  test('resolving an issue by hand does not approve; a clash still present is reopened on the next approval', async () => {
    const { registrationId } = await submitted(2);
    await moveMath({ day: 'MON', startTime: '09:00', endTime: '10:00', room: 'LT-4' });
    assert.equal((await approve(registrationId)).status, 409);

    const [issue] = await openIssues(registrationId);
    const resolved = await api().post(`/api/admin/timetable-issues/${issue.id}/resolve`).set(auth(registrar.token)).send({ note: 'Asked the department' });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.resolutionNote, 'Asked the department');
    assert.equal((await api().post(`/api/admin/timetable-issues/${issue.id}/resolve`).set(auth(registrar.token)).send({ note: 'again' })).status, 409);

    const [reg] = await query('SELECT status FROM registrations WHERE id = :registrationId', { registrationId });
    assert.equal(reg.status, 'submitted');
    assert.equal((await approve(registrationId)).status, 409);
    assert.ok((await openIssues(registrationId)).some((i) => i.id === issue.id), 'reopened');

    await moveMath(MATH_HOME);
    assert.equal((await approve(registrationId)).status, 200);
  });
});

describe('lecturer and room clashes with other sections', () => {
  test('a double-booked lecturer or room blocks approval', async () => {
    const { registrationId } = await submitted(3);
    const [{ lecturer_id: lecturerId }] = await query('SELECT lecturer_id FROM course_sections WHERE id = :cs201', { cs201 });
    const cs202 = await sectionIdFor('CS202');

    await query("UPDATE schedules SET day = 'TUE', start_time = '11:00', end_time = '12:00', room = 'LT-2' WHERE course_section_id = :math201", { math201 });
    await query('UPDATE course_sections SET lecturer_id = :lecturerId WHERE id = :math201', { lecturerId, math201 });

    const refused = await approve(registrationId);
    assert.equal(refused.status, 409);
    const types = refused.body.error.details.filter((i) => i.courseSectionId === math201).map((i) => i.type).sort();
    assert.deepEqual(types, ['LECTURER', 'ROOM']);
    const room = refused.body.error.details.find((i) => i.type === 'ROOM');
    assert.equal(room.details[0].withSectionId, cs202);

    await query('UPDATE course_sections SET lecturer_id = NULL WHERE id = :math201', { math201 });
    await query("UPDATE schedules SET day = 'FRI', start_time = '09:00', end_time = '11:00', room = 'LT-4' WHERE course_section_id = :math201", { math201 });
    assert.equal((await approve(registrationId)).status, 200);
  });
});

describe('sections with no configured slot', () => {
  test('a section without class times is an issue, not a silent pass', async () => {
    const [program] = await query("SELECT id FROM programs WHERE code = 'BSC-CS'");
    const [dept] = await query("SELECT id FROM departments WHERE code = 'CS'");
    const [semester] = await query('SELECT id FROM semesters WHERE is_current = 1');
    const course = await api().post('/api/courses').set(auth(registrar.token))
      .send({ departmentId: dept.id, code: 'CS250', title: 'Unscheduled Seminar', credits: 3, level: 200 });
    assert.equal(course.status, 201);
    await api().post(`/api/programs/${program.id}/courses`).set(auth(registrar.token)).send({ courseId: course.body.data.id, type: 'elective' });
    const section = await api().post('/api/sections').set(auth(registrar.token)).send({ courseId: course.body.data.id, semesterId: semester.id, capacity: 10 });
    assert.equal(section.status, 201);

    const { registrationId } = await submitted(4, ['CS201', 'CS250']);
    const refused = await approve(registrationId);
    assert.equal(refused.status, 409);
    assert.deepEqual(refused.body.error.details.map((i) => i.type), ['UNSCHEDULED']);

    const slot = await api().post('/api/schedules').set(auth(registrar.token))
      .send({ courseSectionId: section.body.data.id, day: 'SAT', startTime: '09:00', endTime: '11:00', room: 'LT-9' });
    assert.equal(slot.status, 201);
    assert.equal((await approve(registrationId)).status, 200);
  });
});

describe('reject and permissions', () => {
  test('rejecting needs no timetable check, and the student sees the reason', async () => {
    const { student, registrationId } = await submitted(5);
    const res = await api().patch(`/api/admin/registrations/${registrationId}/reject`).set(auth(registrar.token)).send({ remarks: 'Too few core courses' });
    assert.equal(res.status, 200);
    const current = await api().get('/api/registrations/current').set(auth(student.token));
    assert.equal(current.body.data.registration?.status ?? current.body.data.status, 'rejected');
    assert.equal(current.body.data.registration?.remarks ?? current.body.data.remarks, 'Too few core courses');
  });

  test('students and lecturers cannot see or resolve timetable issues, nor approve', async () => {
    const { student, registrationId } = await submitted(6);
    for (const who of [student, lecturer]) {
      assert.equal((await api().get('/api/admin/timetable-issues').set(auth(who.token))).status, 403);
      assert.equal((await api().post('/api/admin/timetable-issues/1/resolve').set(auth(who.token)).send({ note: 'nope' })).status, 403);
      assert.equal((await api().patch(`/api/admin/registrations/${registrationId}/approve`).set(auth(who.token)).send({})).status, 403);
    }
  });
});
