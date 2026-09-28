import { Router } from 'express';
import * as ctrl from '../controllers/admission.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { admitSchema, bulkAdmitSchema } from '../validators/admission.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

/** Student accounts are created here, by the school, and nowhere else (there is no self sign-up). */
const router = Router();
router.use(authenticate, requirePermission(PERMISSIONS.STUDENT_ADMIT));

router.post('/', validate({ body: admitSchema }), ctrl.admit);
router.post('/bulk', validate({ body: bulkAdmitSchema }), ctrl.admitMany);

export default router;
