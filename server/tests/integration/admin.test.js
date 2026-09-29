import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, api, loginAs, auth, courseIdFor, query, sequelize } from './helpers.js';

let admin;
let registrar;
let student;
let lecturer;
before(async () => {
  resetDatabase();
  [admin, registrar, student, lecturer] = await Promise.all(['admin', 'registrar', 'student', 'lecturer'].map((w) => loginAs(w)));
});
after(() => sequelize.close());

describe('courses & RBAC', () => {
  test('students, lecturers and admins cannot create courses; the registrar can', async () => {
    const [{ id: departmentId }] = await query("SELECT id FROM departments WHERE code = 'CS'");
    const body = { departmentId, code: 'cs290', title: 'Special Topics', credits: 3, level: 200 };

    assert.equal((await api().post('/api/courses').set(auth(student.token)).send(body)).status, 403);
    assert.equal((await api().post('/api/courses').set(auth(lecturer.token)).send(body)).status, 403);
    assert.equal((await api().post('/api/courses').set(auth(admin.token)).send(body)).status, 403, 'courses are the registry\'s');

    const res = await api().post('/api/courses').set(auth(registrar.token)).send(body);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.code, 'CS290');

    assert.equal((await api().post('/api/courses').set(auth(registrar.token)).send(body)).status, 409);
  });

  test('list supports search, filters, sorting and pagination', async () => {
    const res = await api().get('/api/courses?search=CS&level=200&sort=-code&limit=2&page=1').set(auth(student.token));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((c) => c.code), ['CS290', 'CS204']);
    assert.equal(res.body.meta.total, 5);
    assert.equal(res.body.meta.totalPages, 3);
  });

  test('semester filter returns only courses with sections that semester', async () => {
    const [{ id }] = await query('SELECT id FROM semesters WHERE is_current = 1');
    const res = await api().get(`/api/courses?semesterId=${id}&limit=50`).set(auth(student.token));
    assert.deepEqual(res.body.data.map((c) => c.code).sort(), ['CS201', 'CS202', 'CS203', 'CS204', 'CS301', 'CS301L', 'MATH201']);
  });

  test('archived courses are hidden from students but visible to staff', async () => {
    const id = await courseIdFor('CS290');
    assert.equal((await api().delete(`/api/courses/${id}`).set(auth(registrar.token))).status, 204);
    assert.equal((await api().get(`/api/courses/${id}`).set(auth(student.token))).status, 404);

    const asStudent = await api().get('/api/courses?status=inactive').set(auth(student.token));
    assert.ok(asStudent.body.data.every((c) => c.status === 'active'));

    for (const staff of [registrar, admin]) {
      const asStaff = await api().get('/api/courses?status=inactive').set(auth(staff.token));
      assert.deepEqual(asStaff.body.data.map((c) => c.code), ['CS290']);
    }
  });

  test('course detail includes prerequisites and sections', async () => {
    const res = await api().get(`/api/courses/${await courseIdFor('CS202')}`).set(auth(student.token));
    assert.deepEqual(res.body.data.prerequisites.map((p) => p.code).sort(), ['CS201', 'MATH101']);
    assert.equal(res.body.data.sections.length, 1);
    assert.equal(res.body.data.sections[0].schedules.length, 1);
  });
});

describe('prerequisites', () => {
  test('add, reject cycles and self-references, remove', async () => {
    const cs201 = await courseIdFor('CS201');
    const cs301 = await courseIdFor('CS301');
    const cs204 = await courseIdFor('CS204');

    const cycle = await api().post(`/api/courses/${cs201}/prerequisites`).set(auth(registrar.token)).send({ prerequisiteCourseId: cs301 });
    assert.equal(cycle.status, 400);
    assert.match(cycle.body.error.message, /circular/);

    const self = await api().post(`/api/courses/${cs201}/prerequisites`).set(auth(registrar.token)).send({ prerequisiteCourseId: cs201 });
    assert.equal(self.status, 400);

    const added = await api().post(`/api/courses/${cs301}/prerequisites`).set(auth(registrar.token)).send({ prerequisiteCourseId: cs204 });
    assert.equal(added.status, 201);
    assert.deepEqual(added.body.data.map((c) => c.code).sort(), ['CS201', 'CS204', 'CS301L'], 'CS301L is its corequisite');

    const dup = await api().post(`/api/courses/${cs301}/prerequisites`).set(auth(registrar.token)).send({ prerequisiteCourseId: cs204 });
    assert.equal(dup.status, 409);

    assert.equal((await api().delete(`/api/courses/${cs301}/prerequisites/${cs204}`).set(auth(registrar.token))).status, 204);
    assert.equal((await api().delete(`/api/courses/${cs301}/prerequisites/${cs204}`).set(auth(registrar.token))).status, 404);
  });

  test('students can check whether they qualify', async () => {
    const res = await api().get(`/api/courses/${await courseIdFor('CS202')}/prerequisites/check`).set(auth(student.token));
    assert.equal(res.body.data.qualified, false);
    assert.deepEqual(res.body.data.missing.map((m) => m.code), ['CS201']);
  });
});

describe('semesters, sections & schedules', () => {
  test('GET /semesters/current exposes window state', async () => {
    const res = await api().get('/api/semesters/current').set(auth(student.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.registrationOpen, true);
  });

  test('creating a current semester unsets the previous one', async () => {
    const [{ id: academicYearId }] = await query('SELECT id FROM academic_years LIMIT 1');
    const res = await api().post('/api/semesters').set(auth(registrar.token)).send({
      academicYearId, name: 'Summer', startDate: '2027-06-01', endDate: '2027-08-01',
      registrationStart: '2027-05-01T00:00:00Z', registrationEnd: '2027-05-20T00:00:00Z', isCurrent: true,
    });
    assert.equal(res.status, 201);
    const current = await query('SELECT name FROM semesters WHERE is_current = 1');
    assert.deepEqual(current.map((s) => s.name), ['Summer']);

    // Partial update must not reset other fields to their defaults.
    const [{ id: previous }] = await query("SELECT id FROM semesters WHERE name = 'Current Semester'");
    const patched = await api().patch(`/api/semesters/${previous}`).set(auth(registrar.token)).send({ isCurrent: true });
    assert.equal(patched.body.data.status, 'active');
    assert.equal(patched.body.data.minCredits, 6);
  });

  test('rejects invalid semester windows', async () => {
    const [{ id: academicYearId }] = await query('SELECT id FROM academic_years LIMIT 1');
    const res = await api().post('/api/semesters').set(auth(registrar.token)).send({
      academicYearId, name: 'Broken', startDate: '2027-06-01', endDate: '2027-05-01',
      registrationStart: '2027-05-20T00:00:00Z', registrationEnd: '2027-05-01T00:00:00Z',
    });
    assert.equal(res.status, 422);
  });

  test('schedule creation detects room and lecturer clashes', async () => {
    const [{ id: semesterId }] = await query('SELECT id FROM semesters WHERE is_current = 1');
    const [{ id: lecturerId }] = await query('SELECT id FROM lecturers LIMIT 1');
    const section = await api().post('/api/sections').set(auth(registrar.token)).send({
      courseId: await courseIdFor('CS204'), semesterId, sectionCode: 'B', capacity: 20, lecturerId,
    });
    assert.equal(section.status, 201);
    const courseSectionId = section.body.data.id;

    // Lecturer already teaches CS201 on MON 08:00-10:00.
    const lecturerClash = await api().post('/api/schedules').set(auth(registrar.token)).send({
      courseSectionId, day: 'MON', startTime: '09:00', endTime: '11:00', room: 'NEW-ROOM',
    });
    assert.equal(lecturerClash.status, 409);
    assert.equal(lecturerClash.body.error.details[0].type, 'LECTURER');

    // LT-4 is used by MATH201 (no lecturer) on FRI 09:00-11:00.
    const roomClash = await api().post('/api/schedules').set(auth(registrar.token)).send({
      courseSectionId, day: 'FRI', startTime: '10:00', endTime: '12:00', room: 'lt-4',
    });
    assert.equal(roomClash.status, 409);
    assert.equal(roomClash.body.error.details[0].type, 'ROOM');

    const ok = await api().post('/api/schedules').set(auth(registrar.token)).send({
      courseSectionId, day: 'MON', startTime: '10:00', endTime: '12:00', room: 'LT-1',
    });
    assert.equal(ok.status, 201, 'back-to-back in the same room is allowed');

    const badTimes = await api().post('/api/schedules').set(auth(registrar.token)).send({
      courseSectionId, day: 'SAT', startTime: '12:00', endTime: '11:00',
    });
    assert.equal(badTimes.status, 422);
  });

  test('capacity cannot drop below seats taken', async () => {
    const [{ id }] = await query("SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id WHERE c.code = 'CS201'");
    await query('UPDATE course_sections SET seats_taken = 5 WHERE id = :id', { id });
    const res = await api().patch(`/api/sections/${id}`).set(auth(registrar.token)).send({ capacity: 3 });
    assert.equal(res.status, 400);
    await query('UPDATE course_sections SET seats_taken = 0 WHERE id = :id', { id });
  });
});

describe('admin tools', () => {
  test('lecturer can see the roster only for their own sections', async () => {
    const [{ id: own }] = await query("SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id WHERE c.code = 'CS201' AND s.section_code = 'A'");
    const [{ id: other }] = await query("SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id WHERE c.code = 'MATH201'");
    assert.equal((await api().get(`/api/lecturers/sections/${own}/roster`).set(auth(lecturer.token))).status, 200);
    assert.equal((await api().get(`/api/lecturers/sections/${other}/roster`).set(auth(lecturer.token))).status, 403);
  });

  test('audit logs record staff actions for the admin; registrars and students cannot read them', async () => {
    const res = await api().get('/api/admin/audit-logs?action=course.create').set(auth(admin.token));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    assert.equal((await api().get('/api/admin/audit-logs').set(auth(student.token))).status, 403);
    assert.equal((await api().get('/api/admin/audit-logs').set(auth(registrar.token))).status, 403);
  });

  test('settings can be read and updated by the admin only', async () => {
    assert.equal((await api().get('/api/admin/settings').set(auth(registrar.token))).status, 403);
    const res = await api().patch('/api/admin/settings').set(auth(admin.token))
      .send({ settings: [{ key: 'registration.requireApproval', value: false }] });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.find((s) => s.key === 'registration.requireApproval').value, false);
  });

  test('reports', async () => {
    const popularity = await api().get('/api/admin/reports/course-popularity').set(auth(admin.token));
    assert.equal(popularity.status, 200);
    assert.ok(popularity.body.data.sections.length >= 6);
    const summary = await api().get('/api/admin/reports/registration-summary').set(auth(admin.token));
    assert.equal(summary.status, 200);
  });
});
