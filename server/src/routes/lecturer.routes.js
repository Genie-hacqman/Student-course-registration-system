import { Router } from 'express';
import * as ctrl from '../controllers/lecturer.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import { requireAnyPermission, requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  createLecturerSchema, updateLecturerSchema, listLecturersQuery, semesterFilterQuery, lecturerDepartmentsSchema,
} from '../validators/user.validator.js';
import { PERMISSIONS, ROLES } from '../utils/constants.js';

const router = Router();

router.use(authenticate);

router.get('/me/sections', authorize(ROLES.LECTURER), validate({ query: semesterFilterQuery }), ctrl.mySections);
router.get('/me/tasks', authorize(ROLES.LECTURER), ctrl.myTasks);
router.get('/sections/:id/roster', requirePermission(PERMISSIONS.ROSTER_VIEW), validate({ params: idParam }), ctrl.roster);

const view = requireAnyPermission(PERMISSIONS.USER_MANAGE, PERMISSIONS.LECTURER_ASSIGN, PERMISSIONS.SECTION_MANAGE, PERMISSIONS.DIRECTORY_VIEW);
const manage = requirePermission(PERMISSIONS.USER_MANAGE);
router.get('/', view, validate({ query: listLecturersQuery }), ctrl.list);
router.get('/:id', view, validate({ params: idParam }), ctrl.getById);
router.post('/', manage, validate({ body: createLecturerSchema }), ctrl.create);
router.patch('/:id', manage, validate({ params: idParam, body: updateLecturerSchema }), ctrl.update);
router.put('/:id/departments', manage, validate({ params: idParam, body: lecturerDepartmentsSchema }), ctrl.setDepartments);
router.post('/:id/activate', manage, validate({ params: idParam }), ctrl.activate);
router.post('/:id/deactivate', manage, validate({ params: idParam }), ctrl.deactivate);
router.post('/:id/invite', manage, validate({ params: idParam }), ctrl.invite);

export default router;
