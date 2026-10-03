import { Router } from 'express';
import * as ctrl from '../controllers/student.controller.js';
import * as prerequisites from '../controllers/prerequisite.controller.js';
import * as attendance from '../controllers/attendance.controller.js';
import * as assessments from '../controllers/assessment.controller.js';
import * as admissions from '../controllers/admission.controller.js';
import * as applications from '../controllers/application.controller.js';
import { photoQuery } from '../validators/application.validator.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  listStudentsQuery, createStudentSchema, updateStudentSchema, prerequisiteOverrideSchema, overrideParams,
} from '../validators/user.validator.js';
import { PERMISSIONS, ROLES } from '../utils/constants.js';

const router = Router();

router.use(authenticate);

router.get('/me', authorize(ROLES.STUDENT), ctrl.me);
router.get('/me/results', authorize(ROLES.STUDENT), ctrl.myResults);
router.get('/me/attendance', authorize(ROLES.STUDENT), attendance.mine);
router.get('/me/assessments', authorize(ROLES.STUDENT), assessments.mine);

router.get('/', requirePermission(PERMISSIONS.REGISTRATION_VIEW_ALL), validate({ query: listStudentsQuery }), ctrl.list);
router.get('/:id', requirePermission(PERMISSIONS.REGISTRATION_VIEW_ALL), validate({ params: idParam }), ctrl.getById);
router.get('/:id/results', requirePermission(PERMISSIONS.REGISTRATION_VIEW_ALL), validate({ params: idParam }), ctrl.results);
// The online application the student was admitted from, and its official photo: read-only, same gate as the record.
router.get('/:id/application', requirePermission(PERMISSIONS.REGISTRATION_VIEW_ALL), validate({ params: idParam }), applications.studentApplication);
router.get('/:id/application/photo', requirePermission(PERMISSIONS.REGISTRATION_VIEW_ALL), validate({ params: idParam, query: photoQuery }), applications.studentPhoto);
router.post('/', requirePermission(PERMISSIONS.USER_MANAGE), validate({ body: createStudentSchema }), ctrl.create);
router.patch('/:id', requirePermission(PERMISSIONS.USER_MANAGE), validate({ params: idParam, body: updateStudentSchema }), ctrl.update);
// A new temporary PIN, returned once, for a student who lost theirs and can't use their school email.
router.post('/:id/reset-pin', requirePermission(PERMISSIONS.STUDENT_ADMIT), validate({ params: idParam }), admissions.resetPin);

const override = requirePermission(PERMISSIONS.PREREQ_OVERRIDE);
router.get('/:id/prerequisite-overrides', override, validate({ params: idParam }), prerequisites.listOverrides);
router.post('/:id/prerequisite-overrides', override, validate({ params: idParam, body: prerequisiteOverrideSchema }), prerequisites.grantOverride);
router.delete('/:id/prerequisite-overrides/:overrideId', override, validate({ params: overrideParams }), prerequisites.revokeOverride);

export default router;
