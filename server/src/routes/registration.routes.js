import { Router } from 'express';
import * as ctrl from '../controllers/registration.controller.js';
import * as waitlist from '../controllers/waitlist.controller.js';
import * as slips from '../controllers/slip.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { registrationLimiter, verifyLimiter } from '../middleware/rate-limit.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  addItemSchema, itemIdParam, joinWaitlistSchema, availableCoursesQuery, slipQuery, verifySlipParams, verifySlipQuery,
} from '../validators/registration.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

const student = requirePermission(PERMISSIONS.REGISTRATION_SELF);

// Public: anyone holding a printed slip can check it against the live registration.
export const registrationPublicRouter = Router();
registrationPublicRouter.get('/verify/:reference', verifyLimiter, validate({ params: verifySlipParams, query: verifySlipQuery }), slips.verify);

export const registrationRouter = Router();
registrationRouter.use(authenticate, student);
registrationRouter.get('/current', ctrl.current);
registrationRouter.get('/available-courses', validate({ query: availableCoursesQuery }), ctrl.availableCourses);
registrationRouter.get('/history', ctrl.history);
registrationRouter.get('/:id/slip', validate({ params: idParam, query: slipQuery }), slips.mySlip);
registrationRouter.post('/items', registrationLimiter, validate({ body: addItemSchema }), ctrl.addItem);
registrationRouter.delete('/items/:itemId', registrationLimiter, validate({ params: itemIdParam }), ctrl.dropItem);
registrationRouter.post('/submit', registrationLimiter, ctrl.submit);

export const waitlistRouter = Router();
waitlistRouter.use(authenticate, student);
waitlistRouter.get('/me', waitlist.mine);
waitlistRouter.post('/', validate({ body: joinWaitlistSchema }), waitlist.join);
waitlistRouter.delete('/:id', validate({ params: idParam }), waitlist.leave);
