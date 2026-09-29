/**
 * Course management permissions and the course-catalogue import: preview, validation against the
 * database, duplicate protection, per-course commits, failure reporting and student eligibility.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, login, auth, query, createStudent, sequelize,
} from './helpers.js';

let registrar;
let admin;
let lecturer;
let student;
let year;

const importCatalog = (who, rows, dryRun) => api().post('/api/admin/import/course-catalog').set(auth(who.token)).send({ rows, dryRun });
const count = async (sql, replacements) => Number((await query(sql, replacements))[0].n);

const row = (overrides = {}) => ({
  courseCode: 'CS250', courseTitle: 'Data Engineering', department: 'CS', programme: 'BSC-CS', level: '200',
  semester: '1', creditHours: '3', courseType: 'core', prerequisiteCourseCodes: 'CS101', academicYear: year,
  ...overrides,
});

before(async () => {
  resetDatabase();
  [admin, registrar, lecturer] = await Promise.all(['admin', 'registrar', 'lecturer'].map((w) => loginAs(w)));
  student = await loginAs('student');
  [{ name: year }] = await query('SELECT name FROM academic_years ORDER BY start_date LIMIT 1');
});
after(() => sequelize.close());

describe('authorization', () => {
  test('only course:catalog holders (the registrar) import; admins, lecturers and students get 403', async () => {
    for (const who of [admin, lecturer, student]) assert.equal((await importCatalog(who, [row()], true)).status, 403);
    assert.equal((await importCatalog(registrar, [row()], true)).status, 200);
  });

  test('admins can view courses but not create, edit or archive them; the registrar can', async () => {
    const [cs] = await query("SELECT id FROM departments WHERE code = 'CS'");
    const body = { code: 'CS299', title: 'Special Topics', departmentId: cs.id, credits: 3, level: 200 };
    assert.equal((await api().get('/api/courses').set(auth(admin.token))).status, 200);
    assert.equal((await api().post('/api/courses').set(auth(admin.token)).send(body)).status, 403);

    const created = await api().post('/api/courses').set(auth(registrar.token)).send(body);
    assert.equal(created.status, 201);
    const { id } = created.body.data;
    assert.equal((await api().patch(`/api/courses/${id}`).set(auth(admin.token)).send({ title: 'x y' })).status, 403);
    assert.equal((await api().delete(`/api/courses/${id}`).set(auth(admin.token))).status, 403);

    assert.equal((await api().patch(`/api/courses/${id}`).set(auth(registrar.token)).send({ title: 'Special Topics II' })).status, 200);
    assert.ok([200, 204].includes((await api().delete(`/api/courses/${id}`).set(auth(registrar.token))).status), 'archive');
    const [{ status }] = await query('SELECT status FROM courses WHERE id = :id', { id });
    assert.equal(status, 'inactive', 'archived, not deleted');
    assert.equal((await api().patch(`/api/courses/${id}`).set(auth(registrar.token)).send({ status: 'active' })).status, 200, 'restore');
  });
});

describe('preview (dry run)', () => {
  test('reports totals, per-row errors and duplicates, and writes nothing', async () => {
    const before = await count('SELECT COUNT(*) AS n FROM courses');
    const res = await importCatalog(registrar, [
      row(),
      row({ courseCode: 'CS101', courseTitle: 'Renamed!', level: '100', prerequisiteCourseCodes: '' }), // exists
      row({ courseCode: 'CS251', department: 'PHYS', creditHours: '20' }),
      row(), // same course + programme again
    ], true);
    assert.equal(res.status, 200);
    const d = res.body.data;
    assert.equal(d.dryRun, true);
    assert.deepEqual([d.total, d.valid, d.invalid, d.duplicates], [4, 1, 1, 2]);
    assert.deepEqual(d.rows.map((r) => r.status), ['valid', 'duplicate', 'invalid', 'duplicate']);
    assert.ok(d.rows[2].errors.some((e) => /department "PHYS" does not exist/.test(e)));
    assert.ok(d.rows[2].errors.some((e) => /credit_hours "20"/.test(e)));
    assert.equal(await count('SELECT COUNT(*) AS n FROM courses'), before, 'preview writes nothing');
  });

  test('defaults to a preview when dryRun is omitted, and rejects an empty or oversized file', async () => {
    const res = await api().post('/api/admin/import/course-catalog').set(auth(registrar.token)).send({ rows: [row()] });
    assert.equal(res.body.data.dryRun, true);
    assert.equal((await importCatalog(registrar, [], true)).status, 422);
    assert.equal((await importCatalog(registrar, Array.from({ length: 5001 }, () => row()), true)).status, 422);
  });
});

describe('import', () => {
  test('imports valid courses with curriculum and prerequisites, never touches existing ones, creates no sections', async () => {
    const sectionsBefore = await count('SELECT COUNT(*) AS n FROM course_sections');
    const [{ title: cs101Title }] = await query("SELECT title FROM courses WHERE code = 'CS101'");

    const res = await importCatalog(registrar, [
      row({ courseCode: 'CS350', courseTitle: 'Distributed Systems', level: '300', semester: '2', prerequisiteCourseCodes: 'CS250;CS101' }),
      row(),
      row({ programme: 'BSC-CS', courseCode: 'CS101', courseTitle: 'Changed title', level: '100', prerequisiteCourseCodes: '' }),
      row({ courseCode: 'CS252', semester: '7' }),
    ], false);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    assert.deepEqual(d.rows.map((r) => r.status), ['imported', 'imported', 'duplicate', 'invalid']);
    assert.deepEqual([d.imported, d.duplicates, d.invalid, d.failed], [2, 1, 1, 0]);

    const [cs350] = await query(
      `SELECT c.id, c.title, c.credits, c.level, c.status, pc.type, pc.semester, pc.recommended_level, ay.name AS year
         FROM courses c JOIN program_courses pc ON pc.course_id = c.id LEFT JOIN academic_years ay ON ay.id = pc.academic_year_id
        WHERE c.code = 'CS350'`,
    );
    assert.deepEqual(
      [cs350.title, cs350.credits, cs350.level, cs350.status, cs350.type, cs350.semester, cs350.recommended_level, cs350.year],
      ['Distributed Systems', 3, 300, 'active', 'core', 2, 300, year],
    );
    const prereqs = await query(
      'SELECT p.code FROM course_prerequisites cp JOIN courses p ON p.id = cp.prerequisite_course_id WHERE cp.course_id = :id ORDER BY p.code',
      { id: cs350.id },
    );
    assert.deepEqual(prereqs.map((p) => p.code), ['CS101', 'CS250'], 'each listed prerequisite is required');

    assert.equal((await query("SELECT title FROM courses WHERE code = 'CS101'"))[0].title, cs101Title, 'existing course untouched');
    assert.equal(await count('SELECT COUNT(*) AS n FROM course_sections'), sectionsBefore, 'scheduling is separate');

    // Re-importing the same file adds nothing.
    const again = await importCatalog(registrar, [row()], false);
    assert.equal(again.body.data.rows[0].status, 'duplicate');
    assert.equal(await count("SELECT COUNT(*) AS n FROM courses WHERE code = 'CS250'"), 1);
  });

  test('a course shared by two programmes is created once with two curriculum entries', async () => {
    const [{ id: dept }] = await query("SELECT id FROM departments WHERE code = 'CS'");
    await query(
      `INSERT INTO programs (department_id, name, code, duration_years, max_credits, created_at, updated_at)
       VALUES (:dept, 'BSc Information Technology', 'BSC-IT', 3, 18, NOW(), NOW())`,
      { dept },
    );
    const res = await importCatalog(registrar, [
      row({ courseCode: 'CS260', prerequisiteCourseCodes: '' }),
      row({ courseCode: 'CS260', programme: 'BSC-IT', courseType: 'elective', prerequisiteCourseCodes: '' }),
    ], false);
    assert.deepEqual(res.body.data.rows.map((r) => r.status), ['imported', 'imported']);
    assert.equal(await count("SELECT COUNT(*) AS n FROM courses WHERE code = 'CS260'"), 1);
    const entries = await query(
      "SELECT p.code, pc.type FROM program_courses pc JOIN programs p ON p.id = pc.program_id JOIN courses c ON c.id = pc.course_id WHERE c.code = 'CS260' ORDER BY p.code",
    );
    assert.deepEqual(entries.map((e) => `${e.code}:${e.type}`), ['BSC-CS:core', 'BSC-IT:elective']);

    const filtered = await api().get('/api/courses').query({ programId: (await query("SELECT id FROM programs WHERE code = 'BSC-IT'"))[0].id }).set(auth(registrar.token));
    assert.deepEqual(filtered.body.data.map((c) => c.code), ['CS260'], 'programme filter');
  });

  test('parallel imports of one file create each course once; the losers are reported, not duplicated', async () => {
    const file = [
      row({ courseCode: 'CS270', prerequisiteCourseCodes: '' }),
      row({ courseCode: 'CS370', level: '300', prerequisiteCourseCodes: 'CS270' }),
    ];
    const reports = (await Promise.all([importCatalog(registrar, file, false), importCatalog(registrar, file, false)])).map((r) => r.body.data);
    assert.equal(reports.reduce((n, r) => n + r.imported, 0), 2, 'each course imported exactly once in total');
    for (const r of reports) {
      for (const status of r.rows.map((x) => x.status)) assert.ok(['imported', 'duplicate', 'failed'].includes(status), status);
    }
    assert.equal(await count("SELECT COUNT(*) AS n FROM courses WHERE code IN ('CS270', 'CS370')"), 2);
    assert.equal(await count("SELECT COUNT(*) AS n FROM program_courses pc JOIN courses c ON c.id = pc.course_id WHERE c.code IN ('CS270', 'CS370')"), 2);
  });

  test('a course whose prerequisite is invalid is not imported, and says why', async () => {
    const res = await importCatalog(registrar, [
      row({ courseCode: 'CS280', courseType: 'mandatory', prerequisiteCourseCodes: '' }),
      row({ courseCode: 'CS380', level: '300', prerequisiteCourseCodes: 'CS280' }),
    ], false);
    assert.deepEqual(res.body.data.rows.map((r) => r.status), ['invalid', 'invalid']);
    assert.match(res.body.data.rows[1].errors.join(), /Prerequisite CS280 does not exist and is not a valid course in this file/);
    assert.equal(await count("SELECT COUNT(*) AS n FROM courses WHERE code IN ('CS280', 'CS380')"), 0);
  });

  test('the import is audited', async () => {
    assert.ok(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'import.course_catalog'") >= 1);
  });
});

describe('student eligibility for imported courses', () => {
  test('an imported course reaches students only with a section, on their programme, level, term and year', async () => {
    const res = await importCatalog(registrar, [row({ courseCode: 'CS255', semester: '2', prerequisiteCourseCodes: '' })], false);
    assert.equal(res.body.data.imported, 1);
    const me = await createStudent(1); // level 200 on BSC-CS
    const find = async () => {
      const courses = (await api().get('/api/registrations/available-courses').set(auth(me.token))).body.data.courses;
      return courses.find((c) => c.code === 'CS255')?.sections[0];
    };

    assert.equal(await find(), undefined, 'no section yet: nothing to register for (scheduling is separate)');

    const [{ id: semesterId }] = await query('SELECT id FROM semesters WHERE is_current = 1');
    const [{ id: courseId }] = await query("SELECT id FROM courses WHERE code = 'CS255'");
    const section = await api().post('/api/sections').set(auth(registrar.token)).send({ courseId, semesterId, capacity: 10 });
    assert.equal(section.status, 201);

    await query('UPDATE semesters SET term = 1 WHERE id = :semesterId', { semesterId });
    let s = await find();
    assert.equal(s.status, 'blocked');
    assert.ok(s.reasons.some((r) => r.rule === 'SEMESTER_ELIGIBILITY' && /semester 2/.test(r.message)));
    const refused = await api().post('/api/registrations/items').set(auth(me.token)).send({ courseSectionId: section.body.data.id });
    assert.equal(refused.status, 422, 'enforced on the backend, not just the listing');

    await query('UPDATE semesters SET term = 2 WHERE id = :semesterId', { semesterId });
    s = await find();
    assert.ok(!s.reasons.some((r) => r.rule === 'SEMESTER_ELIGIBILITY'), JSON.stringify(s.reasons));

    // A curriculum entry that only takes effect in a later academic year.
    await query("INSERT INTO academic_years (name, start_date, end_date, created_at, updated_at) VALUES ('2099/2100', '2099-01-01', '2100-12-31', NOW(), NOW())");
    await query(
      "UPDATE program_courses SET academic_year_id = (SELECT id FROM academic_years WHERE name = '2099/2100') WHERE course_id = :courseId",
      { courseId },
    );
    s = await find();
    assert.ok(s.reasons.some((r) => r.rule === 'SEMESTER_ELIGIBILITY' && /from 2099\/2100/.test(r.message)));
    await query('UPDATE semesters SET term = NULL WHERE id = :semesterId', { semesterId });
  });
});
