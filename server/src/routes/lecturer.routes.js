import { Router } from 'express';
import * as ctrl from '../controllers/lecturer.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import { requireAnyPermission, requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  createLecturerSchema, updateLecturerSchema, listLecturersQuery, semesterFilterQuery,
} from '../validators/user.validator.js';
import { PERMISSIONS, ROLES } from '../utils/constants.js';

const router = Router();

router.use(authenticate);

router.get('/me/sections', authorize(ROLES.LECTURER), validate({ query: semesterFilterQuery }), ctrl.mySections);
router.get('/me/tasks', authorize(ROLES.LECTURER), ctrl.myTasks);
router.get('/sections/:id/roster', requirePermission(PERMISSIONS.ROSTER_VIEW), validate({ params: idParam }), ctrl.roster);

// Section managers need the list to assign lecturers; everything else about lecturers stays user:manage.
router.get('/', requireAnyPermission(PERMISSIONS.USER_MANAGE, PERMISSIONS.SECTION_MANAGE), validate({ query: listLecturersQuery }), ctrl.list);
router.get('/:id', requirePermission(PERMISSIONS.USER_MANAGE), validate({ params: idParam }), ctrl.getById);
router.post('/', requirePermission(PERMISSIONS.USER_MANAGE), validate({ body: createLecturerSchema }), ctrl.create);
router.patch('/:id', requirePermission(PERMISSIONS.USER_MANAGE), validate({ params: idParam, body: updateLecturerSchema }), ctrl.update);

export default router;
