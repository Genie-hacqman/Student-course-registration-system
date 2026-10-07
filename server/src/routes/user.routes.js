import { Router } from 'express';
import * as ctrl from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { z } from 'zod';
import { id, idParam } from '../validators/common.validator.js';
import { listUsersQuery, createUserSchema, updateUserSchema } from '../validators/user.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

const userSessionParams = z.object({ id, sessionId: id });

const router = Router();

router.use(authenticate, requirePermission(PERMISSIONS.USER_MANAGE));

router.get('/', validate({ query: listUsersQuery }), ctrl.list);
router.get('/role-responsibilities', ctrl.roleResponsibilities);
router.post('/', validate({ body: createUserSchema }), ctrl.create);
router.get('/:id', validate({ params: idParam }), ctrl.getById);
router.patch('/:id', validate({ params: idParam, body: updateUserSchema }), ctrl.update);
router.delete('/:id', validate({ params: idParam }), ctrl.deactivate);
router.post('/:id/invite', validate({ params: idParam }), ctrl.invite);

router.get('/:id/sessions', validate({ params: idParam }), ctrl.sessions);
router.delete('/:id/sessions/:sessionId', validate({ params: userSessionParams }), ctrl.endSession);

export default router;
