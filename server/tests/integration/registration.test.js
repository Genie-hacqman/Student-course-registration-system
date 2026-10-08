import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, requireManualApproval, api, loginAs, auth, query, sectionIdFor, createStudent, sequelize,
  STUDENT_PIN,
} from './helpers.js';

let student;
before(async () => {
  resetDatabase();
  await requireManualApproval();
  student = await loginAs('student');
});
after(() => sequelize.close());

const add = async (token, code) =>
  api().post('/api/registrations/items').set(auth(token)).send({ courseSectionId: await sectionIdFor(code) });

const rules = (res) => res.body.error?.details?.map((d) => d.rule) ?? [];

describe('registration flow', () => {
  test('current registration is empty before adding courses', async () => {
    const res = await api().get('/api/registrations/current').set(auth(student.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.registration, null);
    assert.equal(res.body.data.semester.registrationOpen, true);
    assert.equal(res.body.data.semester.maxCredits, 18);
  });

  test('adds a course whose prerequisites are met', async () => {
    const res = await add(student.token, 'CS201');
    assert.equal(res.status, 201);
    assert.equal(res.body.data.registration.status, 'draft');
    assert.equal(res.body.data.registration.totalCredits, 3);
    const [{ seats_taken }] = await query('SELECT seats_taken FROM course_sections WHERE id = :id', { id: await sectionIdFor('CS201') });
    assert.equal(seats_taken, 1);
  });

  test('blocks a course with unmet prerequisites', async () => {
    const res = await add(student.token, 'CS202');
    assert.equal(res.status, 422);
    assert.deepEqual(rules(res), ['PREREQUISITE']);
    assert.deepEqual(res.body.error.details[0].details.missing.map((m) => m.code), ['CS201']);
  });

  test('reports every failing rule at once', async () => {
    const res = await add(student.token, 'CS301');
    assert.deepEqual(rules(res), ['PREREQUISITE', 'LEVEL_ELIGIBILITY']);
  });

  test('blocks duplicate courses without a self-clash', async () => {
    const res = await add(student.token, 'CS201');
    assert.deepEqual(rules(res), ['DUPLICATE_COURSE']);
  });

  test('blocks timetable conflicts', async () => {
    assert.equal((await add(student.token, 'CS203')).status, 201);
    const res = await add(student.token, 'CS204');
    assert.deepEqual(rules(res), ['TIMETABLE_CONFLICT']);
    assert.match(res.body.error.details[0].message, /CS203/);
  });

  test('blocks exceeding the credit limit', async () => {
    await query('UPDATE semesters SET max_credits = 8 WHERE is_current = 1');
    try {
      const res = await add(student.token, 'MATH201');
      assert.deepEqual(rules(res), ['CREDIT_LIMIT']);
    } finally {
      await query('UPDATE semesters SET max_credits = 18 WHERE is_current = 1');
    }
  });

  test('blocks students with an academic hold', async () => {
    await query("UPDATE students SET academic_hold = true WHERE student_number = 'STU2025001'");
    try {
      const res = await add(student.token, 'MATH201');
      assert.ok(rules(res).includes('STUDENT_ELIGIBILITY'));
    } finally {
      await query("UPDATE students SET academic_hold = false WHERE student_number = 'STU2025001'");
    }
  });

  test('blocks registration when the window is closed', async () => {
    await query('UPDATE semesters SET registration_end = NOW() - INTERVAL 1 DAY WHERE is_current = 1');
    try {
      const res = await add(student.token, 'MATH201');
      assert.ok(rules(res).includes('REGISTRATION_WINDOW'));
    } finally {
      await query('UPDATE semesters SET registration_end = NOW() + INTERVAL 30 DAY WHERE is_current = 1');
    }
  });

  test('drop frees the seat and re-adding the same section works', async () => {
    assert.equal((await add(student.token, 'MATH201')).status, 201);
    const current = await api().get('/api/registrations/current').set(auth(student.token));
    const math = current.body.data.registration.items.find((i) => i.section.course.code === 'MATH201');

    const dropped = await api().delete(`/api/registrations/items/${math.id}`).set(auth(student.token));
    assert.equal(dropped.status, 200);
    assert.equal(dropped.body.data.totalCredits, 6);
    const [{ seats_taken }] = await query('SELECT seats_taken FROM course_sections WHERE id = :id', { id: math.courseSectionId });
    assert.equal(seats_taken, 0);

    assert.equal((await add(student.token, 'MATH201')).status, 201);
  });

  test('submit validates the whole selection, then the registrar approves it', async () => {
    const submitted = await api().post('/api/registrations/submit').set(auth(student.token));
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.data.status, 'submitted');
    assert.equal(submitted.body.data.totalCredits, 9);

    const again = await api().post('/api/registrations/submit').set(auth(student.token));
    assert.equal(again.status, 409);

    const registrar = await loginAs('registrar');
    const pending = await api().get('/api/admin/registrations?status=submitted').set(auth(registrar.token));
    assert.equal(pending.body.data.length, 1);

    const approved = await api()
      .patch(`/api/admin/registrations/${submitted.body.data.id}/approve`)
      .set(auth(registrar.token))
      .send({ remarks: 'OK' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.status, 'approved');

    const notifications = await api().get('/api/notifications').set(auth(student.token));
    const statusNotes = notifications.body.data.map((n) => n.type).filter((t) => t.startsWith('REGISTRATION_'));
    assert.deepEqual(statusNotes, ['REGISTRATION_APPROVED', 'REGISTRATION_SUBMITTED']);
  });

  test('timetable shows registered classes grouped by day', async () => {
    const res = await api().get('/api/timetable/me').set(auth(student.token));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.days.map((d) => d.day), ['MON', 'WED', 'THU', 'FRI']);
    assert.equal(res.body.data.totalCredits, 9);
    assert.deepEqual(res.body.data.conflicts, []);
  });

  test('changing an approved registration sends it back for review', async () => {
    const current = await api().get('/api/registrations/current').set(auth(student.token));
    const math = current.body.data.registration.items.find((i) => i.section.course.code === 'MATH201');
    const res = await api().delete(`/api/registrations/items/${math.id}`).set(auth(student.token));
    assert.equal(res.body.data.status, 'submitted');
  });

  test('non-students cannot use registration endpoints', async () => {
    const registrar = await loginAs('registrar');
    const res = await api().get('/api/registrations/current').set(auth(registrar.token));
    assert.equal(res.status, 403);
  });
});

describe('concurrency', () => {
  test('parallel requests for the last seat: exactly one succeeds', async () => {
    const sectionId = await sectionIdFor('CS202');
    await query('UPDATE course_sections SET capacity = 1, seats_taken = 0 WHERE id = :id', { id: sectionId });
    const students = await Promise.all([1, 2, 3, 4, 5].map((n) => createStudent(n)));
    await query(
      `INSERT INTO results (student_id, course_id, grade, grade_point, passed, created_at, updated_at)
       SELECT s.id, c.id, 'A', 4.0, true, NOW(), NOW() FROM students s, courses c
        WHERE c.code = 'CS201' AND s.id IN (:ids)`,
      { ids: students.map((s) => s.studentId) },
    );

    const results = await Promise.all(
      students.map((s) => api().post('/api/registrations/items').set(auth(s.token)).send({ courseSectionId: sectionId })),
    );

    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 422, 422, 422, 422]);
    for (const r of results.filter((x) => x.status === 422)) assert.deepEqual(rules(r), ['CAPACITY']);

    const [{ seats_taken }] = await query('SELECT seats_taken FROM course_sections WHERE id = :id', { id: sectionId });
    assert.equal(seats_taken, 1);
  });
});

describe('waitlist', () => {
  test('full section → join waitlist → seat frees → next student notified and can register', async () => {
    const sectionId = await sectionIdFor('CS202');
    const [holder] = await query(
      `SELECT u.email, ri.id AS itemId FROM registration_items ri
         JOIN registrations r ON r.id = ri.registration_id
         JOIN students s ON s.id = r.student_id JOIN users u ON u.id = s.user_id
        WHERE ri.course_section_id = :sectionId AND ri.status = 'registered'`,
      { sectionId },
    );
    const waiting = await createStudent(9);
    await query(
      `INSERT INTO results (student_id, course_id, grade, grade_point, passed, created_at, updated_at)
       SELECT :id, id, 'A', 4.0, true, NOW(), NOW() FROM courses WHERE code = 'CS201'`,
      { id: waiting.studentId },
    );

    const join = await api().post('/api/waitlists').set(auth(waiting.token)).send({ courseSectionId: sectionId });
    assert.equal(join.status, 201);
    assert.equal(join.body.data.position, 1);
    assert.equal((await api().post('/api/waitlists').set(auth(waiting.token)).send({ courseSectionId: sectionId })).status, 409);

    const holderLogin = await api().post('/api/auth/login').send({ identifier: holder.email, password: STUDENT_PIN });
    const drop = await api().delete(`/api/registrations/items/${holder.itemId}`).set(auth(holderLogin.body.data.accessToken));
    assert.equal(drop.status, 200);

    const notes = await api().get('/api/notifications').set(auth(waiting.token));
    assert.equal(notes.body.data[0].type, 'WAITLIST_SEAT_AVAILABLE');

    const reg = await api().post('/api/registrations/items').set(auth(waiting.token)).send({ courseSectionId: sectionId });
    assert.equal(reg.status, 201);
    const mine = await api().get('/api/waitlists/me').set(auth(waiting.token));
    assert.deepEqual(mine.body.data, [], 'waitlist entry is converted once registered');
  });

  test('cannot join a waitlist while seats are available', async () => {
    const other = await createStudent(10);
    const res = await api().post('/api/waitlists').set(auth(other.token)).send({ courseSectionId: await sectionIdFor('MATH201') });
    assert.equal(res.status, 400);
  });
});
