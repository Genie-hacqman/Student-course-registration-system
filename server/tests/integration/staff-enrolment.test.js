import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, login, auth, query, sectionIdFor, createStudent, sequelize,
} from './helpers.js';

before(resetDatabase);
after(() => sequelize.close());

const staffAdd = (token, sectionId, body) => api().post(`/api/admin/sections/${sectionId}/students`).set(auth(token)).send(body);
const staffRemove = (token, sectionId, studentId, reason) => api().delete(`/api/admin/sections/${sectionId}/students/${studentId}`).set(auth(token)).send({ reason });
const notifications = async (userId, type) =>
  (await query('SELECT title, message FROM notifications WHERE user_id = :userId AND type = :type', { userId, type }));

describe('staff enrolment', () => {
  let registrar;
  let student;
  before(async () => {
    registrar = await loginAs('registrar');
    student = await createStudent(1);
  });

  test('adds a student who qualifies, records who added it and tells the student', async () => {
    const res = await staffAdd(registrar.token, await sectionIdFor('CS201'), { studentId: student.studentId });
    assert.equal(res.status, 201);
    const item = res.body.data.registration.items.find((i) => i.section.course.code === 'CS201');
    assert.equal(item.addedBy, registrar.user.id);
    assert.equal(item.overriddenRules, null);
    const [note] = await notifications(student.userId, 'COURSE_ADDED_BY_STAFF');
    assert.match(note.message, /The registry added you to CS201/);
  });

  test('a failed check can be overridden only with a reason, and is recorded on the item', async () => {
    const cs202 = await sectionIdFor('CS202');

    const refused = await staffAdd(registrar.token, cs202, { studentId: student.studentId });
    assert.equal(refused.status, 422);
    assert.deepEqual(refused.body.error.details.map((f) => [f.rule, f.overridable]), [['PREREQUISITE', true]]);

    assert.equal((await staffAdd(registrar.token, cs202, { studentId: student.studentId, override: true })).status, 422, 'no reason');

    const ok = await staffAdd(registrar.token, cs202, { studentId: student.studentId, override: true, reason: 'Equivalent course taken abroad' });
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.body.data.confirmation.overridden, ['PREREQUISITE']);
    const [row] = await query(
      "SELECT overridden_rules, override_reason FROM registration_items ri JOIN course_sections s ON s.id = ri.course_section_id JOIN courses c ON c.id = s.course_id WHERE c.code = 'CS202' AND ri.status = 'registered'",
    );
    assert.deepEqual(typeof row.overridden_rules === 'string' ? JSON.parse(row.overridden_rules) : row.overridden_rules, ['PREREQUISITE']);
    assert.equal(row.override_reason, 'Equivalent course taken abroad');
  });

  test('the student can still submit with the overridden course', async () => {
    const res = await api().post('/api/registrations/submit').set(auth(student.token));
    assert.equal(res.status, 200, JSON.stringify(res.body.error));
    assert.equal(res.body.data.status, 'submitted');
  });

  test('a full section can never be overridden — capacity must be raised instead', async () => {
    const cs203 = await sectionIdFor('CS203');
    await query('UPDATE course_sections SET capacity = seats_taken WHERE id = :id', { id: cs203 });
    const res = await staffAdd(registrar.token, cs203, { studentId: student.studentId, override: true, reason: 'Needed to graduate' });
    assert.equal(res.status, 422);
    const capacity = res.body.error.details.find((f) => f.rule === 'CAPACITY');
    assert.equal(capacity.overridable, false);
    await query('UPDATE course_sections SET capacity = 35 WHERE id = :id', { id: cs203 });
  });

  test('staff changes keep an approved registration approved, and work after registration has closed', async () => {
    const [{ id }] = await query('SELECT id FROM registrations WHERE student_id = :id', { id: student.studentId });
    await api().patch(`/api/admin/registrations/${id}/approve`).set(auth(registrar.token)).send({});
    await query('UPDATE semesters SET registration_end = NOW() - INTERVAL 1 DAY, add_drop_end = NOW() - INTERVAL 1 DAY WHERE is_current = 1');

    try {
      const math = await sectionIdFor('MATH201');
      const own = await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: math });
      assert.equal(own.status, 422, 'the student themselves is outside the window');

      const added = await staffAdd(registrar.token, math, { studentId: student.studentId });
      assert.equal(added.status, 201);
      assert.equal(added.body.data.registration.status, 'approved');

      const removed = await staffRemove(registrar.token, math, student.studentId, 'Timetable change requested by department');
      assert.equal(removed.status, 200);
      assert.equal(removed.body.data.status, 'approved');
      const [note] = await notifications(student.userId, 'COURSE_DROPPED_BY_STAFF');
      assert.match(note.message, /removed you from MATH201.*Reason: Timetable change/);
    } finally {
      await query('UPDATE semesters SET registration_end = NOW() + INTERVAL 30 DAY, add_drop_end = NOW() + INTERVAL 45 DAY WHERE is_current = 1');
    }
  });

  test('removing needs a reason and a registered student; admins, lecturers and students cannot enrol', async () => {
    const cs201 = await sectionIdFor('CS201');
    assert.equal((await staffRemove(registrar.token, cs201, student.studentId, '')).status, 422);
    assert.equal((await staffRemove(registrar.token, await sectionIdFor('CS204'), student.studentId, 'Not registered here')).status, 404);

    for (const who of ['admin', 'lecturer']) {
      const staff = await loginAs(who);
      assert.equal((await staffAdd(staff.token, cs201, { studentId: student.studentId })).status, 403, who);
    }
    assert.equal((await staffAdd(student.token, cs201, { studentId: student.studentId })).status, 403);
  });
});
