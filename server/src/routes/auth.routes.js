import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { authenticate, optionalAuthenticate, allowPendingPinChange } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { authLimiter } from '../middleware/rate-limit.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema,
  updateProfileSchema, avatarSchema, verifyEmailSchema, changeRequestSchema, changePinSchema, forgotPinSchema, resetPinSchema,
} from '../validators/auth.validator.js';
import * as accountRequests from '../controllers/account-request.controller.js';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), ctrl.login);
router.post('/refresh', authLimiter, ctrl.refresh);
router.post('/logout', optionalAuthenticate, ctrl.logout);
router.post('/logout-all', allowPendingPinChange, authenticate, ctrl.logoutAll);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), ctrl.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), ctrl.resetPassword);
router.get('/me', allowPendingPinChange, authenticate, ctrl.me);
router.patch('/me', authenticate, validate({ body: updateProfileSchema }), ctrl.updateProfile);
router.put('/me/avatar', authenticate, validate({ body: avatarSchema }), ctrl.setAvatar);
router.delete('/me/avatar', authenticate, ctrl.removeAvatar);
router.patch('/password', authenticate, validate({ body: changePasswordSchema }), ctrl.changePassword);

router.patch('/pin', allowPendingPinChange, authenticate, validate({ body: changePinSchema }), ctrl.changePin);
router.post('/pin/forgot', authLimiter, validate({ body: forgotPinSchema }), ctrl.forgotPin);
router.post('/pin/reset', authLimiter, validate({ body: resetPinSchema }), ctrl.resetPin);

router.post('/verify-email', authLimiter, validate({ body: verifyEmailSchema }), ctrl.verifyEmail);
router.post('/verify-email/resend', authLimiter, authenticate, ctrl.resendVerification);

router.post('/change-requests', authenticate, validate({ body: changeRequestSchema }), accountRequests.createForSelf);
router.get('/change-requests', authenticate, accountRequests.listForSelf);
router.delete('/change-requests/:id', authenticate, validate({ params: idParam }), accountRequests.cancel);

router.get('/sessions', authenticate, ctrl.sessions);
router.delete('/sessions/:id', authenticate, validate({ params: idParam }), ctrl.endSession);

export default router;
