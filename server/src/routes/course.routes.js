import { Router } from 'express';
import * as courses from '../controllers/course.controller.js';
import * as prerequisites from '../controllers/prerequisite.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  listCoursesQuery, createCourseSchema, updateCourseSchema, courseIdParam, prerequisiteParams, addPrerequisiteSchema,
} from '../validators/course.validator.js';
import { PERMISSIONS, ROLES } from '../utils/constants.js';

const router = Router();
// Creating, editing and archiving courses (and their prerequisites) is the registry's job: course:catalog.
const academicStaff = requirePermission(PERMISSIONS.COURSE_CATALOG);

router.use(authenticate);

// Courses
router.get('/', validate({ query: listCoursesQuery }), courses.list);
router.get('/:id', validate({ params: idParam }), courses.getById);
router.post('/', academicStaff, validate({ body: createCourseSchema }), courses.create);
router.patch('/:id', academicStaff, validate({ params: idParam, body: updateCourseSchema }), courses.update);
router.delete('/:id', academicStaff, validate({ params: idParam }), courses.remove);

// Prerequisites
router.get('/:courseId/prerequisites', validate({ params: courseIdParam }), prerequisites.list);
router.get('/:courseId/prerequisites/check', authorize(ROLES.USER), validate({ params: courseIdParam }), prerequisites.check);
router.post(
  '/:courseId/prerequisites',
  academicStaff,
  validate({ params: courseIdParam, body: addPrerequisiteSchema }),
  prerequisites.add,
);
router.delete(
  '/:courseId/prerequisites/:prerequisiteId',
  academicStaff,
  validate({ params: prerequisiteParams }),
  prerequisites.remove,
);

export default router;
