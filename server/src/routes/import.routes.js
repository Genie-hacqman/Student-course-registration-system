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

/**
 * Bulk import of real data, listed in the order a new institution loads it: each file may only
 * reference records from the ones above it. See docs/deployment-runbook.md.
 */
const router = Router();
router.use(authenticate);

// The go-live data pipeline (departments through course offerings) is one connected job — whichever
// of ADMIN (course:manage) or REGISTRAR (course:catalog/section:manage) is doing the data load can run
// all of it, rather than needing to hand off between two logged-in accounts partway through. Account
// creation (lecturers/students/invites) stays ADMIN-only (user:manage) — that split is unrelated to
// this pipeline and still deliberate.
const academic = requireAnyPermission(PERMISSIONS.COURSE_MANAGE, PERMISSIONS.COURSE_CATALOG, PERMISSIONS.SECTION_MANAGE);
const catalog = requirePermission(PERMISSIONS.COURSE_CATALOG);
const users = requirePermission(PERMISSIONS.USER_MANAGE);

router.post('/departments', academic, validate({ body: importDepartmentsSchema }), ctrl.departments);
router.post('/programs', academic, validate({ body: importProgramsSchema }), ctrl.programs);
router.post('/courses', academic, validate({ body: importCoursesSchema }), ctrl.courses);
router.post('/program-courses', academic, validate({ body: importProgramCoursesSchema }), ctrl.programCourses);
// Strict catalogue import (preview with dryRun, never overwrites): see course-import.service.js.
// Kept registrar-only (course:catalog) — this is the specialized one-row-per-course×programme tool
// on its own page (CourseImport.jsx), not part of the departments→sections wizard above.
router.post('/course-catalog', catalog, validate({ body: importCourseCatalogSchema }), ctrl.courseCatalog);
router.post('/prerequisites', academic, validate({ body: importPrerequisitesSchema }), ctrl.prerequisites);
router.post('/lecturers', users, validate({ body: importLecturersSchema }), ctrl.lecturers);
router.post('/students', users, ctrl.studentsMoved);
router.post('/sections', academic, validate({ body: importSectionsSchema }), ctrl.sections);
router.post('/invites', users, validate({ body: sendInvitesSchema }), ctrl.invites);

export default router;
