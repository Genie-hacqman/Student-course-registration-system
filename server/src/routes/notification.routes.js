import { Router } from 'express';
import * as ctrl from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import { notificationListQuery } from '../validators/registration.validator.js';

const router = Router();

router.use(authenticate);
router.get('/', validate({ query: notificationListQuery }), ctrl.list);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:id/read', validate({ params: idParam }), ctrl.markRead);

export default router;
