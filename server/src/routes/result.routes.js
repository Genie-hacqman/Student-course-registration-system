import { Router } from 'express';
import * as ctrl from '../controllers/grade.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import { amendResultSchema, importResultsSchema } from '../validators/grade.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

const router = Router();

router.use(authenticate, requirePermission(PERMISSIONS.GRADE_MANAGE));
router.post('/import', validate({ body: importResultsSchema }), ctrl.importResults);
router.patch('/:id', validate({ params: idParam, body: amendResultSchema }), ctrl.amend);

export default router;
