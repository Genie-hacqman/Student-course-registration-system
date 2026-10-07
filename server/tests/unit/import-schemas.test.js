import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  importProgramsSchema, importCoursesSchema, importLecturersSchema, importSectionsSchema,
} from '../../src/validators/import.validator.js';

test('omitted optional fields stay undefined, so re-imports never reset stored values', () => {
  const program = importProgramsSchema.parse({ rows: [{ code: 'x1', name: 'Prog', departmentCode: 'd1' }] }).rows[0];
  assert.equal(program.durationYears, undefined);
  assert.equal(program.maxCredits, undefined);

  const course = importCoursesSchema.parse({ rows: [{ code: 'c1', title: 'Course', departmentCode: 'd1', credits: 3, level: 100 }] }).rows[0];
  assert.equal(course.status, undefined);

  const lecturer = importLecturersSchema.parse({ rows: [{ email: 'A@B.EDU', firstName: 'A', lastName: 'B', staffNumber: 'S1', departmentCode: 'd1' }] });
  assert.equal(lecturer.rows[0].title, undefined);
  assert.equal(lecturer.rows[0].email, 'a@b.edu');
  assert.equal(lecturer.sendInvites, false);
  assert.equal(lecturer.dryRun, false);

  const section = importSectionsSchema.parse({ rows: [{ courseCode: 'c1', capacity: 10 }] }).rows[0];
  assert.equal(section.lecturerStaffNumber, undefined);
  assert.equal(section.status, undefined);
  assert.equal(section.waitlistEnabled, undefined);
});

test('codes are upper-cased and spreadsheet strings are coerced', () => {
  const course = importCoursesSchema.parse({ rows: [{ code: 'eng101', title: 'Course', departmentCode: 'eng', credits: '3', level: '100' }] }).rows[0];
  assert.deepEqual([course.code, course.departmentCode, course.credits, course.level], ['ENG101', 'ENG', 3, 100]);
});

test('a section can explicitly clear its lecturer with null', () => {
  const section = importSectionsSchema.parse({ rows: [{ courseCode: 'c1', capacity: 10, lecturerStaffNumber: null }] }).rows[0];
  assert.equal(section.lecturerStaffNumber, null);
});

test('bad schedule slots and oversized files are rejected', () => {
  assert.equal(importSectionsSchema.safeParse({
    rows: [{ courseCode: 'c1', capacity: 10, schedules: [{ day: 'MON', startTime: '10:00', endTime: '09:00' }] }],
  }).success, false);
  const rows = Array.from({ length: 5001 }, (_, i) => ({ email: `s${i}@x.edu`, firstName: 'A', lastName: 'B', staffNumber: `S${i}`, departmentCode: 'd1' }));
  assert.equal(importLecturersSchema.safeParse({ rows }).success, false);
});
