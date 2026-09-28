import { registrationWindow } from './registrationWindow.rule.js';
import { studentEligibility } from './studentEligibility.rule.js';
import { sectionAvailability } from './sectionAvailability.rule.js';
import { programEligibility } from './programEligibility.rule.js';
import { duplicateCourse } from './duplicateCourse.rule.js';
import { prerequisite } from './prerequisite.rule.js';
import { corequisite, corequisiteWarnings } from './corequisite.rule.js';
import { levelEligibility } from './levelEligibility.rule.js';
import { capacity } from './capacity.rule.js';
import { creditLimit } from './creditLimit.rule.js';
import { timetableConflict } from './timetableConflict.rule.js';
import { semesterEligibility } from './semesterEligibility.rule.js';

export {
  registrationWindow, studentEligibility, sectionAvailability, programEligibility, duplicateCourse,
  prerequisite, corequisite, corequisiteWarnings, levelEligibility, capacity, creditLimit, timetableConflict, semesterEligibility,
};

/** Rules run when adding a section. Order is the order failures are reported in. */
export const ADD_RULES = [
  registrationWindow,
  studentEligibility,
  sectionAvailability,
  programEligibility,
  semesterEligibility,
  duplicateCourse,
  prerequisite,
  levelEligibility,
  capacity,
  creditLimit,
  timetableConflict,
];

/**
 * Per-item rules re-checked on submit (the seat is already held, so capacity is not re-checked).
 * Corequisites are only enforced here — see corequisite.rule.js.
 */
export const SUBMIT_ITEM_RULES = [sectionAvailability, programEligibility, semesterEligibility, prerequisite, corequisite, levelEligibility, timetableConflict];

/** Runs every rule and returns all failures (not just the first) so the client can show them together. */
export const runRules = (rules, context) =>
  rules.map((rule) => rule(context)).filter((result) => !result.passed);
