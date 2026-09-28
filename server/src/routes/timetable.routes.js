import { Router } from 'express';
import * as ctrl from '../controllers/timetable.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { semesterFilterQuery } from '../validators/user.validator.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

router.use(authenticate);
router.get('/me', authorize(ROLES.USER), validate({ query: semesterFilterQuery }), ctrl.mine);
router.get('/lecturer/me', authorize(ROLES.LECTURER), validate({ query: semesterFilterQuery }), ctrl.lecturerMine);

export default router;
