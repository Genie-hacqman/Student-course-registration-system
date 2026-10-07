import { Router } from 'express';
import * as ctrl from '../controllers/application.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { authLimiter, activationLimiter, resendLimiter, photoLimiter } from '../middleware/rate-limit.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  signUpSchema, saveApplicationSchema, listApplicationsQuery, admitApplicationSchema, rejectApplicationSchema, activateSchema, photoQuery,
} from '../validators/application.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

const router = Router();

router.post('/account', authLimiter, validate({ body: signUpSchema }), ctrl.signUp);
router.post('/activate', activationLimiter, validate({ body: activateSchema }), ctrl.activate);

const applicant = [authenticate, requirePermission(PERMISSIONS.APPLICATION_SELF)];
router.get('/options', ...applicant, ctrl.options);
router.get('/me', ...applicant, ctrl.mine);
router.put('/me', ...applicant, validate({ body: saveApplicationSchema }), ctrl.saveMine);
router.post('/me/submit', ...applicant, ctrl.submitMine);
router.put('/me/photo', ...applicant, photoLimiter, ctrl.setPhoto);
router.delete('/me/photo', ...applicant, photoLimiter, ctrl.removePhoto);
router.get('/me/photo', ...applicant, ctrl.myPhoto);

const reviewer = [authenticate, requirePermission(PERMISSIONS.APPLICATION_REVIEW)];
router.get('/', ...reviewer, validate({ query: listApplicationsQuery }), ctrl.list);
router.get('/:id', ...reviewer, validate({ params: idParam }), ctrl.getById);
router.get('/:id/photo', ...reviewer, validate({ params: idParam, query: photoQuery }), ctrl.reviewPhoto);
router.post('/:id/admit', ...reviewer, validate({ params: idParam, body: admitApplicationSchema }), ctrl.admit);
router.post('/:id/reject', ...reviewer, validate({ params: idParam, body: rejectApplicationSchema }), ctrl.reject);
router.post('/:id/resend-activation', ...reviewer, resendLimiter, validate({ params: idParam }), ctrl.resendActivation);

export default router;
