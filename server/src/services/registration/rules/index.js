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

export const SUBMIT_ITEM_RULES = [sectionAvailability, programEligibility, semesterEligibility, prerequisite, corequisite, levelEligibility, timetableConflict];

export const runRules = (rules, context) =>
  rules.map((rule) => rule(context)).filter((result) => !result.passed);
