import { Router } from 'express';
import * as departments from '../controllers/department.controller.js';
import * as programs from '../controllers/program.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  departmentSchema, updateDepartmentSchema, programSchema, updateProgramSchema, listProgramsQuery,
  programCourseSchema, programCourseParams,
} from '../validators/user.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

const manage = requirePermission(PERMISSIONS.COURSE_MANAGE);
// A programme's curriculum decides which courses its students may take: the registry's (course:catalog).
const curriculum = requirePermission(PERMISSIONS.COURSE_CATALOG);

export const departmentRouter = Router();
departmentRouter.use(authenticate);
departmentRouter.get('/', departments.list);
departmentRouter.get('/:id', validate({ params: idParam }), departments.getById);
departmentRouter.post('/', manage, validate({ body: departmentSchema }), departments.create);
departmentRouter.patch('/:id', manage, validate({ params: idParam, body: updateDepartmentSchema }), departments.update);
departmentRouter.delete('/:id', manage, validate({ params: idParam }), departments.remove);

// Programs are public so the sign-up form can list them.
export const programRouter = Router();
programRouter.get('/', validate({ query: listProgramsQuery }), programs.list);
programRouter.get('/:id', validate({ params: idParam }), programs.getById);
programRouter.post('/', authenticate, manage, validate({ body: programSchema }), programs.create);
programRouter.patch('/:id', authenticate, manage, validate({ params: idParam, body: updateProgramSchema }), programs.update);
programRouter.delete('/:id', authenticate, manage, validate({ params: idParam }), programs.remove);
programRouter.get('/:id/courses', validate({ params: idParam }), programs.listCourses);
programRouter.post('/:id/courses', authenticate, curriculum, validate({ params: idParam, body: programCourseSchema }), programs.addCourse);
programRouter.delete('/:id/courses/:courseId', authenticate, curriculum, validate({ params: programCourseParams }), programs.removeCourse);
