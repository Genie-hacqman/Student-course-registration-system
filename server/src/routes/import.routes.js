import { Router } from 'express';
import * as ctrl from '../controllers/import.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission, requireAnyPermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  importDepartmentsSchema, importProgramsSchema, importCoursesSchema, importProgramCoursesSchema, importPrerequisitesSchema,
  importLecturersSchema, importSectionsSchema, sendInvitesSchema, importCourseCatalogSchema,
} from '../validators/import.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

const router = Router();
router.use(authenticate);

const academic = requireAnyPermission(PERMISSIONS.COURSE_MANAGE, PERMISSIONS.COURSE_CATALOG, PERMISSIONS.SECTION_MANAGE);
const catalog = requirePermission(PERMISSIONS.COURSE_CATALOG);
const users = requirePermission(PERMISSIONS.USER_MANAGE);

router.post('/departments', academic, validate({ body: importDepartmentsSchema }), ctrl.departments);
router.post('/programs', academic, validate({ body: importProgramsSchema }), ctrl.programs);
router.post('/courses', academic, validate({ body: importCoursesSchema }), ctrl.courses);
router.post('/program-courses', academic, validate({ body: importProgramCoursesSchema }), ctrl.programCourses);
router.post('/course-catalog', catalog, validate({ body: importCourseCatalogSchema }), ctrl.courseCatalog);
router.post('/prerequisites', academic, validate({ body: importPrerequisitesSchema }), ctrl.prerequisites);
router.post('/lecturers', users, validate({ body: importLecturersSchema }), ctrl.lecturers);
router.post('/students', users, ctrl.studentsMoved);
router.post('/sections', academic, validate({ body: importSectionsSchema }), ctrl.sections);
router.post('/invites', users, validate({ body: sendInvitesSchema }), ctrl.invites);

export default router;
