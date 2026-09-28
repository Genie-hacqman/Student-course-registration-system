import { Router } from 'express';
import * as attendance from '../controllers/attendance.controller.js';
import * as assessments from '../controllers/assessment.controller.js';
import * as announcements from '../controllers/announcement.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import { updateAttendanceSchema, updateAssessmentSchema, assessmentScoresSchema } from '../validators/teaching.validator.js';
import { announcementSchema, updateAnnouncementSchema, listAnnouncementsQuery } from '../validators/announcement.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

// Section-level routes (list/create) live in section.routes.js; these act on a single record.
// Lecturers are limited to their own sections in the services.

const recordAttendance = requirePermission(PERMISSIONS.ATTENDANCE_RECORD);
export const attendanceRouter = Router();
attendanceRouter.use(authenticate);
attendanceRouter.get('/:id', recordAttendance, validate({ params: idParam }), attendance.getById);
attendanceRouter.put('/:id', recordAttendance, validate({ params: idParam, body: updateAttendanceSchema }), attendance.update);
attendanceRouter.delete('/:id', recordAttendance, validate({ params: idParam }), attendance.remove);

const manageAssessments = requirePermission(PERMISSIONS.ASSESSMENT_MANAGE);
export const assessmentRouter = Router();
assessmentRouter.use(authenticate);
assessmentRouter.patch('/:id', manageAssessments, validate({ params: idParam, body: updateAssessmentSchema }), assessments.update);
assessmentRouter.delete('/:id', manageAssessments, validate({ params: idParam }), assessments.remove);
assessmentRouter.get('/:id/scores', manageAssessments, validate({ params: idParam }), assessments.scores);
assessmentRouter.put('/:id/scores', manageAssessments, validate({ params: idParam, body: assessmentScoresSchema }), assessments.setScores);
assessmentRouter.post('/:id/publish', manageAssessments, validate({ params: idParam }), assessments.publish);

// Everyone signed in reads their own feed; posting needs announcement:create.
const post = requirePermission(PERMISSIONS.ANNOUNCEMENT_CREATE);
export const announcementRouter = Router();
announcementRouter.use(authenticate);
announcementRouter.get('/', validate({ query: listAnnouncementsQuery }), announcements.feed);
announcementRouter.get('/mine', post, validate({ query: listAnnouncementsQuery }), announcements.mine);
announcementRouter.post('/', post, validate({ body: announcementSchema }), announcements.create);
announcementRouter.patch('/:id', post, validate({ params: idParam, body: updateAnnouncementSchema }), announcements.update);
announcementRouter.delete('/:id', post, validate({ params: idParam }), announcements.remove);
