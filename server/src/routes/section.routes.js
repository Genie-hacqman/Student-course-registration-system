import { Router } from 'express';
import * as sections from '../controllers/section.controller.js';
import * as schedules from '../controllers/schedule.controller.js';
import * as grades from '../controllers/grade.controller.js';
import * as attendance from '../controllers/attendance.controller.js';
import * as assessments from '../controllers/assessment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission, requireAnyPermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  createSectionSchema, updateSectionSchema, listSectionsQuery,
  createScheduleSchema, updateScheduleSchema, listSchedulesQuery,
} from '../validators/schedule.validator.js';
import { enterGradesSchema } from '../validators/grade.validator.js';
import { createAttendanceSchema, createAssessmentSchema } from '../validators/teaching.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

const manage = requirePermission(PERMISSIONS.SECTION_MANAGE);

export const sectionRouter = Router();
sectionRouter.use(authenticate);
sectionRouter.get('/', validate({ query: listSectionsQuery }), sections.list);
sectionRouter.get('/:id', validate({ params: idParam }), sections.getById);
sectionRouter.post('/', manage, validate({ body: createSectionSchema }), sections.create);
sectionRouter.patch('/:id', manage, validate({ params: idParam, body: updateSectionSchema }), sections.update);
sectionRouter.delete('/:id', manage, validate({ params: idParam }), sections.remove);

// Grades: lecturers for their own sections (checked in the service), registrar/admin for any.
const grading = requireAnyPermission(PERMISSIONS.GRADE_ENTER, PERMISSIONS.GRADE_MANAGE);
sectionRouter.get('/:id/grades', grading, validate({ params: idParam }), grades.sectionGrades);
sectionRouter.put('/:id/grades', grading, validate({ params: idParam, body: enterGradesSchema }), grades.enter);
sectionRouter.post('/:id/grades/finalize', grading, validate({ params: idParam }), grades.finalize);

// Attendance and assessments: the section's own lecturer, or any other role holding the permission.
const recordAttendance = requirePermission(PERMISSIONS.ATTENDANCE_RECORD);
const manageAssessments = requirePermission(PERMISSIONS.ASSESSMENT_MANAGE);
sectionRouter.get('/:id/attendance', recordAttendance, validate({ params: idParam }), attendance.listForSection);
sectionRouter.post('/:id/attendance', recordAttendance, validate({ params: idParam, body: createAttendanceSchema }), attendance.create);
sectionRouter.get('/:id/assessments', manageAssessments, validate({ params: idParam }), assessments.listForSection);
sectionRouter.post('/:id/assessments', manageAssessments, validate({ params: idParam, body: createAssessmentSchema }), assessments.create);

export const scheduleRouter = Router();
scheduleRouter.use(authenticate);
scheduleRouter.get('/', validate({ query: listSchedulesQuery }), schedules.list);
scheduleRouter.get('/:id', validate({ params: idParam }), schedules.getById);
scheduleRouter.post('/', manage, validate({ body: createScheduleSchema }), schedules.create);
scheduleRouter.patch('/:id', manage, validate({ params: idParam, body: updateScheduleSchema }), schedules.update);
scheduleRouter.delete('/:id', manage, validate({ params: idParam }), schedules.remove);
