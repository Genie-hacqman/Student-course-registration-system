import * as importService from '../services/import.service.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

const handle = (fn) => async (req, res) => ok(res, await fn(req.validated.body, req.user));

export const departments = handle(importService.importDepartments);
export const programs = handle(importService.importPrograms);
export const courses = handle(importService.importCourses);
export const programCourses = handle(importService.importProgramCourses);
export const prerequisites = handle(importService.importPrerequisites);
export const lecturers = handle(importService.importLecturers);
export const sections = handle(importService.importSections);
export const invites = handle(importService.sendPendingInvites);

/** Students are admitted by the school now, with a Student ID and PIN rather than an emailed invite. */
export const studentsMoved = () => {
  throw new AppError('Students are imported through admission now: POST /api/admissions/bulk', 410, 'GONE');
};
