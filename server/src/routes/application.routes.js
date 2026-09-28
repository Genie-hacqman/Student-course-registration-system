import { Router } from 'express';
import * as ctrl from '../controllers/application.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { authLimiter, activationLimiter, resendLimiter } from '../middleware/rate-limit.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  signUpSchema, saveApplicationSchema, listApplicationsQuery, admitApplicationSchema, rejectApplicationSchema, activateSchema,
} from '../validators/application.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

/**
 * Online admission. Applicants sign up here with their personal email (the one self sign-up in the
 * system, and it only ever creates an APPLICANT); a student account comes from admitting an application
 * here, or from staff admission (/api/admissions).
 */
const router = Router();

// Public
router.post('/account', authLimiter, validate({ body: signUpSchema }), ctrl.signUp);
router.post('/activate', activationLimiter, validate({ body: activateSchema }), ctrl.activate);

// Applicant: their own application only
const applicant = [authenticate, requirePermission(PERMISSIONS.APPLICATION_SELF)];
router.get('/options', ...applicant, ctrl.options);
router.get('/me', ...applicant, ctrl.mine);
router.put('/me', ...applicant, validate({ body: saveApplicationSchema }), ctrl.saveMine);
router.post('/me/submit', ...applicant, ctrl.submitMine);

// Reviewers
const reviewer = [authenticate, requirePermission(PERMISSIONS.APPLICATION_REVIEW)];
router.get('/', ...reviewer, validate({ query: listApplicationsQuery }), ctrl.list);
router.get('/:id', ...reviewer, validate({ params: idParam }), ctrl.getById);
router.post('/:id/admit', ...reviewer, validate({ params: idParam, body: admitApplicationSchema }), ctrl.admit);
router.post('/:id/reject', ...reviewer, validate({ params: idParam, body: rejectApplicationSchema }), ctrl.reject);
router.post('/:id/resend-activation', ...reviewer, resendLimiter, validate({ params: idParam }), ctrl.resendActivation);

export default router;
