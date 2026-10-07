import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradePoint, meetsGrade, isPassing, computeGpa, isValidGrade,
} from '../../src/utils/grades.js';
import { evaluateGroups, describeGroup } from '../../src/services/prerequisite.service.js';
import { resolveOpensAtFrom } from '../../src/services/priority.service.js';
import {
  prerequisite, corequisite, corequisiteWarnings, registrationWindow,
} from '../../src/services/registration/rules/index.js';

describe('grade scale', () => {
  test('points and validity', () => {
    assert.equal(gradePoint('A'), 4);
    assert.equal(gradePoint('b+'), 3.5);
    assert.equal(gradePoint('W'), null);
    assert.equal(isValidGrade('Z'), false);
  });

  test('meetsGrade compares on the scale; W and I never meet anything', () => {
    assert.equal(meetsGrade('B', 'C'), true);
    assert.equal(meetsGrade('C', 'C'), true);
    assert.equal(meetsGrade('D+', 'C'), false);
    assert.equal(meetsGrade('W', 'F'), false);
    assert.equal(meetsGrade('I', 'F'), false);
  });

  test('passing uses the configurable pass mark', () => {
    assert.equal(isPassing('D'), true);
    assert.equal(isPassing('E'), false);
    assert.equal(isPassing('D', 'C'), false);
  });

  test('GPA is credit-weighted, counts the best attempt, ignores W/I', () => {
    const summary = computeGpa([
      { courseId: 1, grade: 'F', credits: 3 },
      { courseId: 1, grade: 'B', credits: 3 },
      { courseId: 2, grade: 'A', credits: 1 },
      { courseId: 3, grade: 'W', credits: 3 },
    ]);
    assert.deepEqual(summary, { gpa: 3.25, creditsAttempted: 4, creditsEarned: 4 });
    assert.deepEqual(computeGpa([]), { gpa: null, creditsAttempted: 0, creditsEarned: 0 });
  });
});

describe('requirement groups', () => {
  const course = (id, code) => ({ id, code, title: code });
  const row = (id, code, groupNo, extra = {}) => ({ type: 'prerequisite', groupNo, minGrade: null, prerequisite: course(id, code), ...extra });
  const evaluate = (rows, grades = {}, held = []) => evaluateGroups({
    rows,
    gradesByCourse: new Map(Object.entries(grades).map(([k, v]) => [Number(k), v])),
    heldCourseIds: new Set(held),
    passingGrade: 'D',
  });

  test('AND of groups, OR inside a group', () => {
    const rows = [row(1, 'CS201', 1), row(2, 'MATH101', 2), row(3, 'MATH102', 2)];
    assert.equal(evaluate(rows, { 1: ['B'], 3: ['C'] }).missing.length, 0, 'MATH102 satisfies the OR group');
    const missing = evaluate(rows, { 1: ['B'] }).missing;
    assert.equal(missing.length, 1);
    assert.equal(describeGroup(missing[0]), '(MATH101 or MATH102)');
  });

  test('minimum grade is enforced; a better retake satisfies it', () => {
    const rows = [row(1, 'CS201', 1, { minGrade: 'C' })];
    const missing = evaluate(rows, { 1: ['D'] }).missing;
    assert.equal(describeGroup(missing[0]), 'CS201 (min C)');
    assert.equal(evaluate(rows, { 1: ['D', 'B'] }).missing.length, 0);
  });

  test('corequisite is met by holding the course this semester or having passed it', () => {
    const rows = [row(9, 'CS301L', 7, { type: 'corequisite' })];
    assert.equal(evaluate(rows).corequisitesMissing.length, 1);
    assert.equal(evaluate(rows, {}, [9]).corequisitesMissing.length, 0);
    assert.equal(evaluate(rows, { 9: ['C'] }).corequisitesMissing.length, 0);
  });

  test('an override waives everything', () => {
    const result = evaluateGroups({
      rows: [row(1, 'CS201', 1), row(9, 'LAB', 2, { type: 'corequisite' })],
      gradesByCourse: new Map(),
      heldCourseIds: new Set(),
      passingGrade: 'D',
      overridden: true,
    });
    assert.deepEqual(result, { missing: [], corequisitesMissing: [], overridden: true });
  });

  test('rule messages', () => {
    const section = { course: { code: 'CS301' } };
    const requirements = {
      missing: [
        { anyOf: [course(1, 'CS201')], minGrade: 'C' },
        { anyOf: [course(2, 'MATH101'), course(3, 'MATH102')], minGrade: null },
      ],
      corequisitesMissing: [{ anyOf: [course(9, 'CS301L')], minGrade: null }],
    };
    assert.equal(prerequisite({ section, requirements }).message, 'CS301 requires: CS201 (min C) and (MATH101 or MATH102)');
    assert.equal(corequisite({ section, requirements }).message, 'CS301 must be taken together with CS301L');
    assert.deepEqual(corequisiteWarnings(section, requirements), ['Also register CS301L (corequisite of CS301) before submitting']);
  });
});

describe('registration priority', () => {
  const semester = { registrationStart: new Date('2026-10-01T08:00:00Z'), registrationEnd: new Date('2026-10-20T00:00:00Z') };
  const windows = [
    { name: 'Final year', minLevel: 400, programId: null, opensAt: new Date('2026-10-01T08:00:00Z') },
    { name: 'Level 300', minLevel: 300, programId: null, opensAt: new Date('2026-10-02T08:00:00Z') },
    { name: 'CS majors', minLevel: 200, programId: 7, opensAt: new Date('2026-10-03T08:00:00Z') },
    { name: 'Everyone', minLevel: null, programId: null, opensAt: new Date('2026-10-04T08:00:00Z') },
  ];
  const opens = (student, override) => resolveOpensAtFrom({ semester, student, windows, override });

  test('earliest matching window wins', () => {
    assert.equal(opens({ level: 400, programId: 1 }).windowName, 'Final year');
    assert.equal(opens({ level: 300, programId: 7 }).windowName, 'Level 300');
    assert.equal(opens({ level: 200, programId: 7 }).windowName, 'CS majors');
    assert.equal(opens({ level: 200, programId: 1 }).windowName, 'Everyone');
  });

  test('a student matching no window gets the latest window', () => {
    const only = resolveOpensAtFrom({ semester, student: { level: 100 }, windows: windows.slice(0, 2), override: null });
    assert.equal(only.windowName, 'Level 300');
  });

  test('an individual override beats every window; no windows means semester start', () => {
    const early = opens({ level: 100 }, { opensAt: new Date('2026-10-01T06:00:00Z') });
    assert.equal(early.source, 'override');
    const none = resolveOpensAtFrom({ semester, student: { level: 100 }, windows: [], override: null });
    assert.deepEqual(none, { opensAt: semester.registrationStart, source: 'semester', windowName: null });
  });

  test("the window rule blocks before the student's own opening time and names the slot", () => {
    const sem = { name: 'Fall', ...semester, addDropEnd: new Date('2026-10-30T00:00:00Z') };
    const opensAt = new Date('2026-10-04T08:00:00Z');
    const early = registrationWindow({ semester: sem, now: new Date('2026-10-02T00:00:00Z'), opensAt, priority: { windowName: 'Everyone' } });
    assert.equal(early.passed, false);
    assert.equal(early.message, 'Your registration for Fall opens on 2026-10-04T08:00:00.000Z (Everyone)');
    assert.equal(registrationWindow({ semester: sem, now: new Date('2026-10-05T00:00:00Z'), opensAt }).passed, true);
  });
});

describe('registration slip verification code', async () => {
  const { verificationCode } = await import('../../src/services/slip.service.js');
  const base = { referenceNumber: 'REG-2026-02-000001', status: 'approved', sectionIds: [5, 1, 3] };

  test('stable for the same reference, status and sections (order-independent)', () => {
    const code = verificationCode(base);
    assert.match(code, /^[0-9A-F]{10}$/);
    assert.equal(verificationCode({ ...base, sectionIds: [1, 3, 5] }), code);
  });

  test('changes when a course is added/dropped or the status changes', () => {
    const code = verificationCode(base);
    assert.notEqual(verificationCode({ ...base, sectionIds: [1, 3] }), code);
    assert.notEqual(verificationCode({ ...base, sectionIds: [1, 3, 5, 7] }), code);
    assert.notEqual(verificationCode({ ...base, status: 'submitted' }), code);
    assert.notEqual(verificationCode({ ...base, referenceNumber: 'REG-2026-02-000002' }), code);
  });
});
