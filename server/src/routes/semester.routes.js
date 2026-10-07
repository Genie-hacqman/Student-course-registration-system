import { Router } from 'express';
import * as ctrl from '../controllers/semester.controller.js';
import * as priority from '../controllers/priority.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  academicYearSchema, updateAcademicYearSchema, createSemesterSchema, updateSemesterSchema, listSemestersQuery,
  priorityWindowSchema, updatePriorityWindowSchema, windowParams, registrationOverrideSchema, overrideStudentParams,
} from '../validators/schedule.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

const manage = requirePermission(PERMISSIONS.SEMESTER_MANAGE);

export const academicYearRouter = Router();
academicYearRouter.use(authenticate);
academicYearRouter.get('/', ctrl.listAcademicYears);
academicYearRouter.post('/', manage, validate({ body: academicYearSchema }), ctrl.createAcademicYear);
academicYearRouter.patch('/:id', manage, validate({ params: idParam, body: updateAcademicYearSchema }), ctrl.updateAcademicYear);

export const semesterRouter = Router();
semesterRouter.use(authenticate);
semesterRouter.get('/', validate({ query: listSemestersQuery }), ctrl.list);
semesterRouter.get('/current', ctrl.current);
semesterRouter.get('/:id', validate({ params: idParam }), ctrl.getById);
semesterRouter.post('/', manage, validate({ body: createSemesterSchema }), ctrl.create);
semesterRouter.patch('/:id', manage, validate({ params: idParam, body: updateSemesterSchema }), ctrl.update);

semesterRouter.get('/:id/priority-windows', manage, validate({ params: idParam }), priority.listWindows);
semesterRouter.post('/:id/priority-windows', manage, validate({ params: idParam, body: priorityWindowSchema }), priority.createWindow);
semesterRouter.patch('/:id/priority-windows/:windowId', manage, validate({ params: windowParams, body: updatePriorityWindowSchema }), priority.updateWindow);
semesterRouter.delete('/:id/priority-windows/:windowId', manage, validate({ params: windowParams }), priority.deleteWindow);
semesterRouter.get('/:id/registration-overrides', manage, validate({ params: idParam }), priority.listOverrides);
semesterRouter.put('/:id/registration-overrides',manage, validate({ params: idParam, body: registrationOverrideSchema }), priority.setOverride);
semesterRouter.delete('/:id/registration-overrides/:studentId', manage, validate({ params: overrideStudentParams }), priority.removeOverride);
