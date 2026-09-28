import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { slotsOverlap } from '../../src/utils/time.js';
import { wouldCreateCycle } from '../../src/services/prerequisite.service.js';
import { buildTimetable } from '../../src/services/timetable.service.js';
import {
  registrationWindow, studentEligibility, sectionAvailability, programEligibility, duplicateCourse, prerequisite,
  levelEligibility, capacity, creditLimit, timetableConflict, runRules, ADD_RULES,
} from '../../src/services/registration/rules/index.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-26T12:00:00Z');

const semester = (overrides = {}) => ({
  id: 1,
  name: 'Fall',
  registrationStart: new Date(now.getTime() - DAY),
  registrationEnd: new Date(now.getTime() + DAY),
  addDropEnd: new Date(now.getTime() + 10 * DAY),
  isRegistrationOpen(at) { return at >= this.registrationStart && at <= this.registrationEnd; },
  isAddDropOpen(at) { return at >= this.registrationStart && at <= (this.addDropEnd ?? this.registrationEnd); },
  ...overrides,
});

const section = (overrides = {}) => ({
  id: 10,
  courseId: 100,
  semesterId: 1,
  sectionCode: 'A',
  status: 'open',
  capacity: 30,
  seatsTaken: 0,
  course: { id: 100, code: 'CS201', credits: 3, level: 200, status: 'active' },
  schedules: [{ day: 'MON', startTime: '08:00:00', endTime: '10:00:00' }],
  ...overrides,
});

const item = (courseId, code, schedules, credits = 3, courseSectionId = courseId * 10) => ({
  courseId,
  courseSectionId,
  credits,
  section: { course: { code, title: `${code} title` }, schedules },
});

describe('slotsOverlap', () => {
  const a = { day: 'MON', startTime: '08:00', endTime: '10:00' };
  test('overlapping slots on the same day clash', () => {
    assert.equal(slotsOverlap(a, { day: 'MON', startTime: '09:00', endTime: '11:00' }), true);
  });
  test('one slot inside another clashes', () => {
    assert.equal(slotsOverlap(a, { day: 'MON', startTime: '08:30', endTime: '09:00' }), true);
  });
  test('back-to-back slots do not clash', () => {
    assert.equal(slotsOverlap(a, { day: 'MON', startTime: '10:00', endTime: '12:00' }), false);
  });
  test('different days never clash', () => {
    assert.equal(slotsOverlap(a, { day: 'TUE', startTime: '08:00', endTime: '10:00' }), false);
  });
});

describe('wouldCreateCycle', () => {
  const edges = [
    { courseId: 2, prerequisiteCourseId: 1 }, // 2 requires 1
    { courseId: 3, prerequisiteCourseId: 2 }, // 3 requires 2
  ];
  test('self reference is a cycle', () => assert.equal(wouldCreateCycle(edges, 1, 1), true));
  test('direct back-edge is a cycle', () => assert.equal(wouldCreateCycle(edges, 1, 2), true));
  test('transitive back-edge is a cycle', () => assert.equal(wouldCreateCycle(edges, 1, 3), true));
  test('forward edge is fine', () => assert.equal(wouldCreateCycle(edges, 3, 1), false));
  test('unrelated edge is fine', () => assert.equal(wouldCreateCycle(edges, 4, 3), false));
});

describe('registration rules', () => {
  test('window: open during registration', () => {
    assert.equal(registrationWindow({ semester: semester(), registration: null, now }).passed, true);
  });
  test('window: closed after registration for students who never submitted', () => {
    const s = semester({ registrationEnd: new Date(now.getTime() - 1000) });
    assert.equal(registrationWindow({ semester: s, registration: { submittedAt: null }, now }).passed, false);
  });
  test('window: add/drop still open for students who submitted', () => {
    const s = semester({ registrationEnd: new Date(now.getTime() - 1000) });
    assert.equal(registrationWindow({ semester: s, registration: { submittedAt: new Date() }, now }).passed, true);
  });
  test('window: fails without an active semester', () => {
    assert.equal(registrationWindow({ semester: null, now }).passed, false);
  });

  test('eligibility: academic hold blocks registration', () => {
    assert.equal(studentEligibility({ student: { status: 'active', academicHold: true } }).passed, false);
    assert.equal(studentEligibility({ student: { status: 'suspended', academicHold: false } }).passed, false);
    assert.equal(studentEligibility({ student: { status: 'probation', academicHold: false } }).passed, true);
  });

  test('section availability: wrong semester, closed section, inactive course', () => {
    assert.equal(sectionAvailability({ section: section(), semester: { id: 2 } }).passed, false);
    assert.equal(sectionAvailability({ section: section({ status: 'closed' }), semester: { id: 1 } }).passed, false);
    const inactive = section({ course: { ...section().course, status: 'inactive' } });
    assert.equal(sectionAvailability({ section: inactive, semester: { id: 1 } }).passed, false);
    assert.equal(sectionAvailability({ section: section(), semester: { id: 1 } }).passed, true);
  });

  test('duplicate: same course in another section is rejected', () => {
    const result = duplicateCourse({ section: section(), otherItems: [item(100, 'CS201', [], 3, 99)] });
    assert.equal(result.passed, false);
    assert.match(result.message, /another section/);
  });

  test('prerequisite: fails with missing list', () => {
    const requirements = { missing: [{ anyOf: [{ id: 1, code: 'CS101' }], minGrade: null }] };
    const result = prerequisite({ section: section(), requirements });
    assert.equal(result.passed, false);
    assert.equal(result.message, 'CS201 requires: CS101');
    assert.deepEqual(result.details.missing, [{ id: 1, code: 'CS101' }]);
    assert.equal(prerequisite({ section: section(), requirements: { missing: [] } }).passed, true);
  });

  test('level: cannot take courses above own level', () => {
    assert.equal(levelEligibility({ student: { level: 100 }, section: section() }).passed, false);
    assert.equal(levelEligibility({ student: { level: 200 }, section: section() }).passed, true);
  });

  test('capacity: full section offers a waitlist only where enabled', () => {
    const full = section({ capacity: 2, seatsTaken: 2 });
    const offered = capacity({ section: full, waitlistOffered: true });
    assert.equal(offered.passed, false);
    assert.equal(offered.details.waitlistAvailable, true);
    assert.match(offered.message, /join the waitlist/);

    const notOffered = capacity({ section: full, waitlistOffered: false });
    assert.equal(notOffered.details.waitlistAvailable, false);
    assert.match(notOffered.message, /No waitlist/);

    assert.equal(capacity({ section: section({ capacity: 2, seatsTaken: 1 }) }).passed, true);
  });

  test('program eligibility: course must be on the curriculum', () => {
    const result = programEligibility({ section: section(), inProgram: false, programName: 'BSc CS' });
    assert.equal(result.passed, false);
    assert.equal(result.message, 'CS201 is not part of your program (BSc CS)');
    assert.equal(programEligibility({ section: section(), inProgram: true }).passed, true);
  });

  test('credit limit: exactly at the limit passes, above fails', () => {
    const others = [item(1, 'A', [], 6), item(2, 'B', [], 6)];
    assert.equal(creditLimit({ section: section(), otherItems: others, maxCredits: 15 }).passed, true);
    assert.equal(creditLimit({ section: section(), otherItems: others, maxCredits: 14 }).passed, false);
  });

  test('timetable conflict: detects clash and names the course', () => {
    const others = [item(5, 'MATH201', [{ day: 'MON', startTime: '09:00:00', endTime: '11:00:00' }])];
    const result = timetableConflict({ section: section(), otherItems: others });
    assert.equal(result.passed, false);
    assert.match(result.message, /MATH201/);
  });

  test('timetable conflict: each conflicting course is identified once, with ids', () => {
    const mon = section({
      schedules: [
        { day: 'MON', startTime: '08:00:00', endTime: '10:00:00' },
        { day: 'WED', startTime: '08:00:00', endTime: '10:00:00' },
      ],
    });
    const others = [
      item(5, 'MATH201', [
        { day: 'MON', startTime: '09:00:00', endTime: '11:00:00' },
        { day: 'WED', startTime: '09:00:00', endTime: '11:00:00' },
      ]),
      item(6, 'PHY101', [{ day: 'WED', startTime: '07:00:00', endTime: '08:30:00' }]),
    ];
    const result = timetableConflict({ section: mon, otherItems: others });
    assert.equal(result.message, 'CS201 clashes with MATH201, PHY101');
    assert.deepEqual(result.details.conflictingCourses, [
      { courseId: 5, code: 'MATH201', title: 'MATH201 title', courseSectionId: 50 },
      { courseId: 6, code: 'PHY101', title: 'PHY101 title', courseSectionId: 60 },
    ]);
    assert.equal(result.details.clashes.length, 3);
  });

  test('timetable conflict: touching slots are fine', () => {
    const others = [item(5, 'MATH201', [{ day: 'MON', startTime: '10:00:00', endTime: '11:00:00' }])];
    assert.equal(timetableConflict({ section: section(), otherItems: others }).passed, true);
  });

  test('runRules returns every failure, not only the first', () => {
    const failures = runRules(ADD_RULES, {
      now,
      semester: semester(),
      student: { status: 'active', academicHold: true, level: 100 },
      registration: null,
      section: section({ capacity: 1, seatsTaken: 1 }),
      otherItems: [],
      maxCredits: 24,
      inProgram: true,
      requirements: { missing: [{ anyOf: [{ id: 1, code: 'CS101' }], minGrade: null }], corequisitesMissing: [] },
    });
    assert.deepEqual(failures.map((f) => f.rule), ['STUDENT_ELIGIBILITY', 'PREREQUISITE', 'LEVEL_ELIGIBILITY', 'CAPACITY']);
  });
});

describe('buildTimetable', () => {
  test('groups by day in week order and sorts by start time', () => {
    const mk = (id, code, schedules) => ({ id, sectionCode: 'A', course: { id, code, title: code, credits: 3 }, schedules, lecturer: null });
    const result = buildTimetable([
      mk(1, 'B', [{ day: 'WED', startTime: '10:00:00', endTime: '11:00:00' }, { day: 'MON', startTime: '12:00:00', endTime: '13:00:00' }]),
      mk(2, 'A', [{ day: 'MON', startTime: '08:00:00', endTime: '09:00:00' }]),
    ]);
    assert.deepEqual(result.days.map((d) => d.day), ['MON', 'WED']);
    assert.deepEqual(result.days[0].classes.map((c) => c.course.code), ['A', 'B']);
    assert.equal(result.totalCredits, 6);
    assert.deepEqual(result.conflicts, []);
  });
});
