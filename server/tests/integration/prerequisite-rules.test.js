import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, login, auth, query, sectionIdFor, courseIdFor, sequelize,
} from './helpers.js';

let student;
let registrar;
let ids;

before(async () => {
  resetDatabase();
  [student, registrar] = await Promise.all([loginAs('student'), loginAs('registrar')]);
  const [dept] = await query("SELECT id FROM departments WHERE code = 'CS'");
  const [program] = await query("SELECT id FROM programs WHERE code = 'BSC-CS'");
  const [semester] = await query('SELECT id FROM semesters WHERE is_current = 1');
  ids = { dept: dept.id, program: program.id, semester: semester.id, student: (await query("SELECT id FROM students WHERE student_number = 'STU2025001'"))[0].id };
});
after(() => sequelize.close());

const createCourse = async (code, { credits = 3, day, start, end } = {}) => {
  const course = await api().post('/api/courses').set(auth(registrar.token))
    .send({ departmentId: ids.dept, code, title: `${code} title`, credits, level: 200 });
  await api().post(`/api/programs/${ids.program}/courses`).set(auth(registrar.token)).send({ courseId: course.body.data.id });
  const section = await api().post('/api/sections').set(auth(registrar.token)).send({ courseId: course.body.data.id, semesterId: ids.semester, capacity: 30 });
  if (day) {
    await api().post('/api/schedules').set(auth(registrar.token))
      .send({ courseSectionId: section.body.data.id, day, startTime: start, endTime: end, room: `R-${code}` });
  }
  return { courseId: course.body.data.id, sectionId: section.body.data.id };
};
const requirement = (courseId, body) => api().post(`/api/courses/${courseId}/prerequisites`).set(auth(registrar.token)).send(body);
const check = (courseId) => api().get(`/api/courses/${courseId}/prerequisites/check`).set(auth(student.token));
const add = (sectionId) => api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: sectionId });

describe('alternatives (OR) and minimum grades', () => {
  test('any one course of an "anyOf" group satisfies it', async () => {
    const x = await createCourse('CS240');
    const res = await requirement(x.courseId, { anyOf: [await courseIdFor('CS202'), await courseIdFor('MATH101')] });
    assert.equal(res.status, 201);
    assert.equal(new Set(res.body.data.map((c) => c.groupNo)).size, 1, 'both alternatives share one group');

    const result = await check(x.courseId);
    assert.equal(result.body.data.qualified, true, 'MATH101 (passed) satisfies CS202-or-MATH101');
  });

  test('groups are ANDed, and a minimum grade is enforced', async () => {
    const y = await createCourse('CS241');
    await requirement(y.courseId, { anyOf: [await courseIdFor('CS202'), await courseIdFor('CS204')] });
    await requirement(y.courseId, { prerequisiteCourseId: await courseIdFor('MATH101'), minGrade: 'A' });

    const result = await check(y.courseId);
    assert.equal(result.body.data.qualified, false);
    assert.deepEqual(result.body.data.groups.map((g) => g.description), ['(CS202 or CS204)', 'MATH101 (min A)']);

    const res = await add(y.sectionId);
    assert.equal(res.status, 422);
    assert.equal(res.body.error.details[0].message, 'CS241 requires: (CS202 or CS204) and MATH101 (min A)');
  });

  test('validation: corequisites take no minimum grade; W is not a valid minimum', async () => {
    const z = await createCourse('CS242');
    assert.equal((await requirement(z.courseId, { anyOf: [await courseIdFor('CS101')], type: 'corequisite', minGrade: 'C' })).status, 400);
    assert.equal((await requirement(z.courseId, { prerequisiteCourseId: await courseIdFor('CS101'), minGrade: 'W' })).status, 422);
    assert.equal((await requirement(z.courseId, {})).status, 422);
  });
});

describe('corequisites', () => {
  let lecture;
  let lab;
  before(async () => {
    lecture = await createCourse('CS260', { day: 'SAT', start: '08:00', end: '10:00' });
    lab = await createCourse('CS260L', { credits: 1, day: 'SAT', start: '10:00', end: '12:00' });
    assert.equal((await requirement(lecture.courseId, { anyOf: [lab.courseId], type: 'corequisite' })).status, 201);
    assert.equal((await requirement(lab.courseId, { anyOf: [lecture.courseId], type: 'corequisite' })).status, 201);
  });

  test('adding one half does not block, but warns', async () => {
    const res = await add(lecture.sectionId);
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data.confirmation.warnings, ['Also register CS260L (corequisite of CS260) before submitting']);

    const list = await api().get('/api/registrations/available-courses').set(auth(student.token));
    const labEntry = list.body.data.courses.find((c) => c.code === 'CS260L').sections[0];
    assert.equal(labEntry.status, 'eligible');
    assert.deepEqual(labEntry.notes, []);
  });

  test('submitting without the lab is rejected; with it, submission succeeds', async () => {
    await add(await sectionIdFor('CS201'));
    const without = await api().post('/api/registrations/submit').set(auth(student.token));
    assert.equal(without.status, 422);
    const coreq = without.body.error.details.find((d) => d.rule === 'COREQUISITE');
    assert.equal(coreq.message, 'CS260 must be taken together with CS260L');

    assert.equal((await add(lab.sectionId)).status, 201);
    const withLab = await api().post('/api/registrations/submit').set(auth(student.token));
    assert.equal(withLab.status, 200);
  });
});

describe('overrides', () => {
  test('students cannot grant themselves overrides', async () => {
    const res = await api().post(`/api/students/${ids.student}/prerequisite-overrides`).set(auth(student.token))
      .send({ courseId: await courseIdFor('CS202'), reason: 'I really want it' });
    assert.equal(res.status, 403);
  });

  test('a registrar override lets the student register despite missing prerequisites', async () => {
    const cs202 = await courseIdFor('CS202');
    assert.equal((await check(cs202)).body.data.qualified, false);

    const granted = await api().post(`/api/students/${ids.student}/prerequisite-overrides`).set(auth(registrar.token))
      .send({ courseId: cs202, semesterId: ids.semester, reason: 'Completed Data Structures at transfer university' });
    assert.equal(granted.status, 201);
    const dup = await api().post(`/api/students/${ids.student}/prerequisite-overrides`).set(auth(registrar.token))
      .send({ courseId: cs202, semesterId: ids.semester, reason: 'Duplicate request' });
    assert.equal(dup.status, 409);

    const checked = await check(cs202);
    assert.equal(checked.body.data.qualified, true);
    assert.equal(checked.body.data.overridden, true);
    assert.equal((await add(await sectionIdFor('CS202'))).status, 201);

    const notes = await api().get('/api/notifications').set(auth(student.token));
    assert.ok(notes.body.data.some((n) => n.type === 'PREREQUISITE_OVERRIDE'));
  });
});
