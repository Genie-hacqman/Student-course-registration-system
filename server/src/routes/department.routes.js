import { Router } from 'express';
import * as departments from '../controllers/department.controller.js';
import * as programs from '../controllers/program.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  departmentSchema, updateDepartmentSchema, programSchema, updateProgramSchema, listProgramsQuery,
  programCourseSchema, programCourseParams, listDepartmentsQuery, departmentSummaryQuery, departmentLecturersQuery,
  departmentStudentsQuery, programStudentsQuery,
} from '../validators/user.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

const manage = requirePermission(PERMISSIONS.COURSE_MANAGE);
const curriculum = requirePermission(PERMISSIONS.COURSE_CATALOG);
const directory = requirePermission(PERMISSIONS.DIRECTORY_VIEW);
const studentsView = requirePermission(PERMISSIONS.REGISTRATION_VIEW_ALL);

export const departmentRouter = Router();
departmentRouter.use(authenticate);
departmentRouter.get('/', validate({ query: listDepartmentsQuery }), departments.list);
departmentRouter.get('/summary', directory, validate({ query: departmentSummaryQuery }), departments.summary);
departmentRouter.get('/:id', validate({ params: idParam }), departments.getById);
departmentRouter.get('/:id/overview', directory, validate({ params: idParam }), departments.overview);
departmentRouter.get('/:id/students', studentsView, validate({ params: idParam, query: departmentStudentsQuery }), departments.students);
departmentRouter.get('/:id/lecturers', directory, validate({ params: idParam, query: departmentLecturersQuery }), departments.lecturers);
departmentRouter.post('/:id/archive', manage, validate({ params: idParam }), departments.archive);
departmentRouter.post('/:id/activate', manage, validate({ params: idParam }), departments.activate);
departmentRouter.post('/', manage, validate({ body: departmentSchema }), departments.create);
departmentRouter.patch('/:id', manage, validate({ params: idParam, body: updateDepartmentSchema }), departments.update);
departmentRouter.delete('/:id', manage, validate({ params: idParam }), departments.remove);

export const programRouter = Router();
programRouter.get('/', validate({ query: listProgramsQuery }), programs.list);
programRouter.get('/:id', validate({ params: idParam }), programs.getById);
programRouter.post('/', authenticate, manage, validate({ body: programSchema }), programs.create);
programRouter.patch('/:id', authenticate, manage, validate({ params: idParam, body: updateProgramSchema }), programs.update);
programRouter.delete('/:id', authenticate, manage, validate({ params: idParam }), programs.remove);
programRouter.get('/:id/students', authenticate, studentsView, validate({ params: idParam, query: programStudentsQuery }), programs.students);
programRouter.post('/:id/archive', authenticate, manage, validate({ params: idParam }), programs.archive);
programRouter.post('/:id/activate', authenticate, manage, validate({ params: idParam }), programs.activate);
programRouter.get('/:id/courses', validate({ params: idParam }), programs.listCourses);
programRouter.post('/:id/courses', authenticate, curriculum, validate({ params: idParam, body: programCourseSchema }), programs.addCourse);
programRouter.delete('/:id/courses/:courseId', authenticate, curriculum, validate({ params: programCourseParams }), programs.removeCourse);
