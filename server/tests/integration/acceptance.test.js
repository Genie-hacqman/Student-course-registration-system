/**
 * User story: As a student, I want to register for courses so that I can enroll in
 * the courses required for my semester. One describe block per acceptance criterion.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, auth, query, sectionIdFor, courseIdFor, createStudent, sequelize,
} from './helpers.js';

let student;
let admin;
let registrar;

before(async () => {
  resetDatabase();
  [student, admin, registrar] = await Promise.all([loginAs('student'), loginAs('admin'), loginAs('registrar')]);
});
after(() => sequelize.close());

const available = (token, qs = '') => api().get(`/api/registrations/available-courses${qs}`).set(auth(token));
const add = async (token, code) =>
  api().post('/api/registrations/items').set(auth(token)).send({ courseSectionId: await sectionIdFor(code) });
const rules = (res) => res.body.error?.details?.map((d) => d.rule) ?? [];
const failure = (res, rule) => res.body.error.details.find((d) => d.rule === rule);
const findSection = (body, code) => body.data.courses.find((c) => c.code === code)?.sections[0];

describe('AC1 — Course availability', () => {
  before(async () => {
    // A course that exists and has a section this semester, but is NOT on BSC-CS's curriculum.
    const [{ id: departmentId }] = await query("SELECT id FROM departments WHERE code = 'MATH'");
    const course = await api().post('/api/courses').set(auth(registrar.token))
      .send({ departmentId, code: 'STAT210', title: 'Statistics for Economists', credits: 3, level: 200 });
    const [{ id: semesterId }] = await query('SELECT id FROM semesters WHERE is_current = 1');
    const section = await api().post('/api/sections').set(auth(registrar.token))
      .send({ courseId: course.body.data.id, semesterId, capacity: 30 });
    assert.equal(section.status, 201);
  });

  test('Given registration is open, when the student views available courses, then only courses for their program and the current semester are listed', async () => {
    const res = await available(student.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.semester.registrationOpen, true);
    assert.equal(res.body.data.program.code, 'BSC-CS');

    const codes = res.body.data.courses.map((c) => c.code);
    assert.deepEqual(codes, ['CS201', 'CS202', 'CS203', 'CS204', 'CS301', 'CS301L', 'MATH201']);
    assert.ok(!codes.includes('STAT210'), 'courses outside the program are not shown');
    assert.ok(!codes.includes('CS101'), 'courses without a section this semester are not shown');
  });

  test('each section shows whether the student can register and, if not, why', async () => {
    const res = await available(student.token);
    assert.equal(findSection(res.body, 'CS201').status, 'eligible');

    const cs301 = findSection(res.body, 'CS301');
    assert.equal(cs301.status, 'blocked');
    assert.deepEqual(cs301.reasons.map((r) => r.rule), ['PREREQUISITE', 'LEVEL_ELIGIBILITY']);
    assert.equal(res.body.data.courses.find((c) => c.code === 'CS204').type, 'elective');
  });

  test('eligibleOnly=true hides sections the student cannot register for', async () => {
    const res = await available(student.token, '?eligibleOnly=true');
    const codes = res.body.data.courses.map((c) => c.code);
    assert.deepEqual(codes, ['CS201', 'CS203', 'CS204', 'MATH201']);
  });

  test('registering for a course outside the program is rejected with the reason', async () => {
    const res = await add(student.token, 'STAT210');
    assert.equal(res.status, 422);
    assert.deepEqual(rules(res), ['PROGRAM_ELIGIBILITY']);
    assert.match(failure(res, 'PROGRAM_ELIGIBILITY').message, /not part of your program/);
  });

  test('after the registrar adds it to the curriculum, the course becomes available', async () => {
    const [{ id: programId }] = await query("SELECT id FROM programs WHERE code = 'BSC-CS'");
    const res = await api().post(`/api/programs/${programId}/courses`).set(auth(registrar.token))
      .send({ courseId: await courseIdFor('STAT210'), type: 'elective' });
    assert.equal(res.status, 201);
    const list = await available(student.token);
    assert.equal(findSection(list.body, 'STAT210').status, 'eligible');

    await api().delete(`/api/programs/${programId}/courses/${await courseIdFor('STAT210')}`).set(auth(registrar.token));
  });

  test('when registration is closed, the list says so and every section explains why', async () => {
    await query('UPDATE semesters SET registration_end = NOW() - INTERVAL 1 DAY WHERE is_current = 1');
    try {
      const res = await available(student.token);
      assert.equal(res.body.data.semester.registrationOpen, false);
      for (const course of res.body.data.courses) {
        for (const section of course.sections) {
          assert.ok(section.reasons.some((r) => r.rule === 'REGISTRATION_WINDOW'));
        }
      }
    } finally {
      await query('UPDATE semesters SET registration_end = NOW() + INTERVAL 30 DAY WHERE is_current = 1');
    }
  });
});

describe('AC2 — Prerequisites', () => {
  test('Given a course has prerequisites, when the student has not completed them, then registration is rejected and the missing courses are listed', async () => {
    const res = await add(student.token, 'CS202');
    assert.equal(res.status, 422);
    assert.deepEqual(rules(res), ['PREREQUISITE']);
    assert.deepEqual(failure(res, 'PREREQUISITE').details.missing.map((m) => m.code), ['CS201']);
  });

  test('when the student has completed them, registration is allowed', async () => {
    const res = await add(student.token, 'CS201'); // requires CS101, which the student passed
    assert.equal(res.status, 201);
  });
});

describe('AC3 — Credit limit', () => {
  test('Given the student has reached the maximum credits, when they add another course, then registration is prevented with the reason', async () => {
    await query('UPDATE semesters SET max_credits = 3 WHERE is_current = 1'); // student already holds CS201 (3 credits)
    try {
      const res = await add(student.token, 'MATH201');
      assert.equal(res.status, 422);
      assert.deepEqual(rules(res), ['CREDIT_LIMIT']);
      assert.match(failure(res, 'CREDIT_LIMIT').message, /maximum is 3/);
      assert.equal(failure(res, 'CREDIT_LIMIT').details.currentCredits, 3);

      const list = await available(student.token);
      assert.equal(findSection(list.body, 'MATH201').status, 'blocked');
      assert.equal(list.body.data.currentCredits, 3);
    } finally {
      await query('UPDATE semesters SET max_credits = 18 WHERE is_current = 1');
    }
  });
});

describe('AC4 — Capacity', () => {
  let other;
  let sectionId;
  before(async () => {
    other = await createStudent(1);
    sectionId = await sectionIdFor('MATH201');
    await query('UPDATE course_sections SET capacity = 1, seats_taken = 1 WHERE id = :sectionId', { sectionId });
  });

  test('Given the course is full, when a student registers, then normal enrolment is prevented and a waitlist is offered', async () => {
    const res = await add(other.token, 'MATH201');
    assert.equal(res.status, 422);
    assert.deepEqual(rules(res), ['CAPACITY']);
    assert.equal(failure(res, 'CAPACITY').details.waitlistAvailable, true);
    assert.match(failure(res, 'CAPACITY').message, /join the waitlist/);

    const list = await available(other.token);
    assert.equal(findSection(list.body, 'MATH201').status, 'full');
    assert.equal(findSection(list.body, 'MATH201').waitlistOffered, true);

    const join = await api().post('/api/waitlists').set(auth(other.token)).send({ courseSectionId: sectionId });
    assert.equal(join.status, 201);
    await api().delete(`/api/waitlists/${join.body.data.id}`).set(auth(other.token));
  });

  test('when the section has its waitlist disabled, no waitlist is offered', async () => {
    const patch = await api().patch(`/api/sections/${sectionId}`).set(auth(registrar.token)).send({ waitlistEnabled: false });
    assert.equal(patch.body.data.waitlistEnabled, false);
    assert.equal(patch.body.data.capacity, 1, 'partial update keeps other fields');
    try {
      const res = await add(other.token, 'MATH201');
      assert.equal(failure(res, 'CAPACITY').details.waitlistAvailable, false);
      assert.match(failure(res, 'CAPACITY').message, /No waitlist/);
      const join = await api().post('/api/waitlists').set(auth(other.token)).send({ courseSectionId: sectionId });
      assert.equal(join.status, 400);
    } finally {
      await api().patch(`/api/sections/${sectionId}`).set(auth(registrar.token)).send({ waitlistEnabled: true });
    }
  });

  test('when waitlists are disabled globally, no waitlist is offered', async () => {
    await api().patch('/api/admin/settings').set(auth(admin.token)).send({ settings: [{ key: 'registration.waitlistEnabled', value: false }] });
    try {
      const res = await add(other.token, 'MATH201');
      assert.equal(failure(res, 'CAPACITY').details.waitlistAvailable, false);
      const join = await api().post('/api/waitlists').set(auth(other.token)).send({ courseSectionId: sectionId });
      assert.equal(join.status, 400);
    } finally {
      await api().patch('/api/admin/settings').set(auth(admin.token)).send({ settings: [{ key: 'registration.waitlistEnabled', value: true }] });
      await query('UPDATE course_sections SET capacity = 50, seats_taken = 0 WHERE id = :sectionId', { sectionId });
    }
  });
});

describe('AC5 — Timetable conflict', () => {
  test('Given two courses overlap, when the student selects both, then the second is rejected and the conflicting course is identified', async () => {
    assert.equal((await add(student.token, 'CS203')).status, 201);
    const res = await add(student.token, 'CS204');
    assert.equal(res.status, 422);
    assert.deepEqual(rules(res), ['TIMETABLE_CONFLICT']);

    const conflict = failure(res, 'TIMETABLE_CONFLICT');
    assert.match(conflict.message, /CS204 clashes with CS203/);
    assert.deepEqual(conflict.details.conflictingCourses, [{
      courseId: await courseIdFor('CS203'),
      code: 'CS203',
      title: 'Database Systems',
      courseSectionId: await sectionIdFor('CS203'),
    }]);
    assert.equal(conflict.details.clashes[0].day, 'WED');

    const list = await available(student.token);
    assert.deepEqual(findSection(list.body, 'CS204').reasons.map((r) => r.rule), ['TIMETABLE_CONFLICT']);
  });
});

describe('AC6 — Successful registration', () => {
  test('Given all checks pass, when the student registers, then they are enrolled, a seat is taken, credits and timetable update, and a confirmation is returned', async () => {
    const sectionId = await sectionIdFor('MATH201');
    const [{ seats_taken: before }] = await query('SELECT seats_taken FROM course_sections WHERE id = :sectionId', { sectionId });

    const res = await add(student.token, 'MATH201');
    assert.equal(res.status, 201);

    const { confirmation, registration } = res.body.data;
    assert.equal(confirmation.message, 'You are registered for MATH201 — Linear Algebra (section A).');
    assert.equal(confirmation.course.code, 'MATH201');
    assert.equal(confirmation.courseSectionId, sectionId);
    assert.equal(confirmation.seatsRemaining, 50 - (before + 1));
    assert.equal(confirmation.totalCredits, 9);
    assert.equal(confirmation.maxCredits, 18);
    assert.ok(registration.items.some((i) => i.section.course.code === 'MATH201'));

    const [{ seats_taken: afterSeats }] = await query('SELECT seats_taken FROM course_sections WHERE id = :sectionId', { sectionId });
    assert.equal(afterSeats, before + 1);

    const timetable = await api().get('/api/timetable/me').set(auth(student.token));
    assert.ok(timetable.body.data.days.find((d) => d.day === 'FRI').classes.some((c) => c.course.code === 'MATH201'));

    const notifications = await api().get('/api/notifications').set(auth(student.token));
    assert.equal(notifications.body.data[0].type, 'COURSE_REGISTERED');
    assert.equal(notifications.body.data[0].message, confirmation.message);

    const list = await available(student.token);
    assert.equal(findSection(list.body, 'MATH201').status, 'registered');
  });
});
