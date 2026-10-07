import * as storage from '../services/storage.service.js';
import { isEmailConfigured } from '../services/email.service.js';
import { Router } from 'express';
import { sequelize } from '../models/index.js';
import env from '../config/env.js';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import studentRoutes from './student.routes.js';
import lecturerRoutes from './lecturer.routes.js';
import { departmentRouter, programRouter } from './department.routes.js';
import courseRoutes from './course.routes.js';
import { academicYearRouter, semesterRouter } from './semester.routes.js';
import { sectionRouter, scheduleRouter } from './section.routes.js';
import { registrationRouter, registrationPublicRouter, waitlistRouter } from './registration.routes.js';
import timetableRoutes from './timetable.routes.js';
import notificationRoutes from './notification.routes.js';
import adminRoutes from './admin.routes.js';
import importRoutes from './import.routes.js';
import admissionRoutes from './admission.routes.js';
import applicationRoutes from './application.routes.js';
import resultRoutes from './result.routes.js';
import { attendanceRouter, assessmentRouter, announcementRouter } from './teaching.routes.js';

const router = Router();

router.get('/health', async (req, res) => {
  let database = 'up';
  const startedAt = process.hrtime.bigint();
  try {
    await sequelize.authenticate();
  } catch {
    database = 'down';
  }
  const databaseLatencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  res.status(database === 'up' ? 200 : 503).json({
    success: database === 'up',
    data: {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      databaseLatencyMs: Math.round(databaseLatencyMs * 100) / 100,
      uptime: process.uptime(),
      integrations: { email: isEmailConfigured(), errorTracking: Boolean(env.SENTRY_DSN), storage: storage.isConfigured() },
    },
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/students', studentRoutes);
router.use('/lecturers', lecturerRoutes);
router.use('/departments', departmentRouter);
router.use('/programs', programRouter);
router.use('/courses', courseRoutes);
router.use('/academic-years', academicYearRouter);
router.use('/semesters', semesterRouter);
router.use('/sections', sectionRouter);
router.use('/schedules', scheduleRouter);
router.use('/registrations', registrationPublicRouter);
router.use('/registrations', registrationRouter);
router.use('/waitlists', waitlistRouter);
router.use('/timetable', timetableRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admissions', admissionRoutes);
router.use('/applications', applicationRoutes);
router.use('/admin/import', importRoutes);
router.use('/admin', adminRoutes);
router.use('/results', resultRoutes);
router.use('/attendance', attendanceRouter);
router.use('/assessments', assessmentRouter);
router.use('/announcements', announcementRouter);

export default router;
