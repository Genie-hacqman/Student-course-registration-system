import { Router } from 'express';
import * as ctrl from '../controllers/import.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import {
  importDepartmentsSchema, importProgramsSchema, importCoursesSchema, importProgramCoursesSchema, importPrerequisitesSchema,
  importLecturersSchema, importSectionsSchema, sendInvitesSchema,
} from '../validators/import.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

/**
 * Bulk import of real data, listed in the order a new institution loads it: each file may only
 * reference records from the ones above it. See docs/deployment-runbook.md.
 */
const router = Router();
router.use(authenticate);

const course = requirePermission(PERMISSIONS.COURSE_MANAGE);
const users = requirePermission(PERMISSIONS.USER_MANAGE);
const sections = requirePermission(PERMISSIONS.SECTION_MANAGE);

router.post('/departments', course, validate({ body: importDepartmentsSchema }), ctrl.departments);
router.post('/programs', course, validate({ body: importProgramsSchema }), ctrl.programs);
router.post('/courses', course, validate({ body: importCoursesSchema }), ctrl.courses);
router.post('/program-courses', course, validate({ body: importProgramCoursesSchema }), ctrl.programCourses);
router.post('/prerequisites', course, validate({ body: importPrerequisitesSchema }), ctrl.prerequisites);
router.post('/lecturers', users, validate({ body: importLecturersSchema }), ctrl.lecturers);
router.post('/students', users, ctrl.studentsMoved);
router.post('/sections', sections, validate({ body: importSectionsSchema }), ctrl.sections);
router.post('/invites', users, validate({ body: sendInvitesSchema }), ctrl.invites);

export default router;
