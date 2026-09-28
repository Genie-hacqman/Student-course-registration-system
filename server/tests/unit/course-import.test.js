import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCatalog, importOrder, parseSemester, parseCodes, summarize,
} from '../../src/services/course-import/validate.js';
import { semesterEligibility } from '../../src/services/registration/rules/index.js';

const lookups = () => ({
  departments: new Map([['CS', { id: 1, code: 'CS', name: 'Computer Science' }], ['computer science', { id: 1, code: 'CS', name: 'Computer Science' }]]),
  programmes: new Map([['BSC-CS', { id: 10, code: 'BSC-CS', durationYears: 4 }], ['BSC-IT', { id: 11, code: 'BSC-IT', durationYears: 3 }]]),
  academicYears: new Map([['2026/2027', { id: 5, name: '2026/2027' }]]),
  courses: new Map([['CS101', { id: 100, level: 100 }], ['CS401', { id: 400, level: 400 }]]),
});

const row = (overrides = {}) => ({
  courseCode: 'CS250', courseTitle: 'Data Engineering', department: 'CS', programme: 'BSC-CS', level: '200',
  semester: '1', creditHours: '3', courseType: 'core', prerequisiteCourseCodes: 'CS101', academicYear: '2026/2027',
  ...overrides,
});

const statusOf = (rows) => validateCatalog(rows, lookups()).results.map((r) => r.status);
const errorsOf = (rows) => validateCatalog(rows, lookups()).results.flatMap((r) => r.errors);

describe('course import parsing helpers', () => {
  test('semesters accept numbers and words', () => {
    assert.deepEqual(['1', 2, 'Semester 2', 'second', '3rd', 'Third'].map(parseSemester), [1, 2, 2, 2, 3, 3]);
    assert.deepEqual(['4', '0', 'spring', ''].map(parseSemester), [null, null, null, null]);
  });

  test('prerequisite codes split on ; , | and are de-duplicated and upper-cased', () => {
    assert.deepEqual(parseCodes('cs101; CS102,math101|cs101'), ['CS101', 'CS102', 'MATH101']);
    assert.deepEqual(parseCodes(''), []);
    assert.deepEqual(parseCodes(['a1', ' A1 ']), ['A1']);
  });
});

describe('course import validation', () => {
  test('a complete row is valid; department by code or name, case-insensitive type', () => {
    assert.deepEqual(statusOf([row(), row({ courseCode: 'CS251', department: 'Computer Science', courseType: 'ELECTIVE', academicYear: '' })]), ['valid', 'valid']);
  });

  test('required fields are reported together, in plain language', () => {
    const errors = errorsOf([{}]);
    for (const field of ['course_code', 'course_title', 'department', 'programme', 'level', 'semester', 'credit_hours', 'course_type']) {
      assert.ok(errors.some((e) => e.startsWith(`${field} is required`)), `${field} missing`);
    }
  });

  test('bad values', () => {
    const cases = [
      [{ courseCode: 'CS 250!' }, /letters, numbers and dashes/],
      [{ department: 'PHYS' }, /department "PHYS" does not exist/],
      [{ programme: 'BSC-XX' }, /programme "BSC-XX" does not exist/],
      [{ level: '250' }, /must be 100, 200, 300/],
      [{ level: '400', programme: 'BSC-IT' }, /beyond BSC-IT, which runs to level 300/],
      [{ semester: '4' }, /semester "4" must be 1, 2 or 3/],
      [{ creditHours: '0' }, /credit_hours "0" must be a whole number from 1 to 12/],
      [{ creditHours: '3.5' }, /credit_hours/],
      [{ creditHours: '13' }, /credit_hours/],
      [{ courseType: 'optional' }, /must be core or elective/],
      [{ academicYear: '2030/2031' }, /has not been set up/],
      [{ academicYear: '26/27' }, /must look like 2026\/2027/],
      [{ prerequisiteCourseCodes: 'CS250' }, /cannot be its own prerequisite/],
    ];
    for (const [overrides, pattern] of cases) {
      const { results } = validateCatalog([row(overrides)], lookups());
      assert.equal(results[0].status, 'invalid', JSON.stringify(overrides));
      assert.ok(results[0].errors.some((e) => pattern.test(e)), `${JSON.stringify(overrides)} → ${results[0].errors}`);
    }
  });

  test('prerequisites must exist, not be above the course level, and not form a cycle', () => {
    assert.match(errorsOf([row({ prerequisiteCourseCodes: 'CS999' })]).join(), /CS999 does not exist/);
    assert.match(errorsOf([row({ prerequisiteCourseCodes: 'CS401' })]).join(), /CS401 is a level 400 course, above this level 200/);

    // Prerequisites may be new courses in the same file…
    assert.deepEqual(statusOf([row({ prerequisiteCourseCodes: 'CS150' }), row({ courseCode: 'CS150', level: '100', prerequisiteCourseCodes: '' })]), ['valid', 'valid']);
    // …but not an invalid one, which invalidates the course that needs it.
    assert.deepEqual(statusOf([row({ prerequisiteCourseCodes: 'CS150' }), row({ courseCode: 'CS150', level: '100', semester: '9', prerequisiteCourseCodes: '' })]), ['invalid', 'invalid']);

    const cycle = validateCatalog([
      row({ courseCode: 'CS260', prerequisiteCourseCodes: 'CS261' }),
      row({ courseCode: 'CS261', prerequisiteCourseCodes: 'CS260' }),
      row({ courseCode: 'CS262', prerequisiteCourseCodes: 'CS101' }),
    ], lookups()).results;
    assert.deepEqual(cycle.map((r) => r.status), ['invalid', 'invalid', 'valid']);
    assert.match(cycle[0].errors.join(), /cycle/);
  });

  test('duplicates: an existing course is never changed; a repeated course + programme counts once', () => {
    const { results } = validateCatalog([row({ courseCode: 'CS101', level: '100', prerequisiteCourseCodes: '' }), row(), row()], lookups());
    assert.deepEqual(results.map((r) => r.status), ['duplicate', 'valid', 'duplicate']);
    assert.match(results[0].errors[0], /already exists — it was not changed/);
    assert.match(results[2].errors[0], /Repeats line 3/);
  });

  test('one course shared by two programmes is one course; conflicting details are rejected', () => {
    const shared = validateCatalog([row(), row({ programme: 'BSC-IT', courseType: 'elective' })], lookups());
    assert.deepEqual(shared.results.map((r) => r.status), ['valid', 'valid']);
    assert.equal(shared.courses.size, 1);
    assert.equal(shared.courses.get('CS250').rows.length, 2);

    const conflict = validateCatalog([row(), row({ programme: 'BSC-IT', creditHours: '4' })], lookups()).results;
    assert.deepEqual(conflict.map((r) => r.status), ['valid', 'invalid']);
    assert.match(conflict[1].errors[0], /Conflicts with line 2 for CS250 \(credit_hours differ\)/);
  });

  test('lines come from the client when given, and the summary counts statuses', () => {
    const { results } = validateCatalog([{ ...row(), line: 7 }, { ...row({ courseCode: 'CS252', semester: 'x' }), line: 9 }], lookups());
    assert.deepEqual(results.map((r) => r.line), [7, 9]);
    const s = summarize(results, { dryRun: true });
    assert.deepEqual([s.total, s.valid, s.invalid, s.duplicates], [2, 1, 1, 0]);
  });

  test('import order puts in-file prerequisites first', () => {
    const { courses } = validateCatalog([
      row({ courseCode: 'CS350', level: '300', prerequisiteCourseCodes: 'CS250' }),
      row({ prerequisiteCourseCodes: 'CS150' }),
      row({ courseCode: 'CS150', level: '100', prerequisiteCourseCodes: '' }),
    ], lookups());
    assert.deepEqual(importOrder(courses).map((c) => c.code), ['CS150', 'CS250', 'CS350']);
  });
});

describe('semester eligibility rule', () => {
  const section = { course: { code: 'CS250' } };
  test('passes when unset, fails on a different term or before the curriculum takes effect', () => {
    assert.equal(semesterEligibility({ section, semester: { term: 1 }, curriculum: null }).passed, true);
    assert.equal(semesterEligibility({ section, semester: { term: null }, curriculum: { semester: 2 } }).passed, true);
    assert.equal(semesterEligibility({ section, semester: { term: 2 }, curriculum: { semester: 2 } }).passed, true);
    const wrongTerm = semesterEligibility({ section, semester: { term: 1 }, curriculum: { semester: 2 } });
    assert.equal(wrongTerm.passed, false);
    assert.match(wrongTerm.message, /taught in semester 2/);
    const early = semesterEligibility({ section, semester: { term: 1 }, curriculum: { semester: 1, notYetInEffect: true, effectiveYear: '2027/2028' } });
    assert.match(early.message, /from 2027\/2028/);
  });
});
