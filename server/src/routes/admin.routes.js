import { Router } from 'express';
import * as admin from '../controllers/admin.controller.js';
import * as registrations from '../controllers/registration.controller.js';
import * as reports from '../controllers/report.controller.js';
import * as slips from '../controllers/slip.controller.js';
import * as accountRequests from '../controllers/account-request.controller.js';
import * as roles from '../controllers/role.controller.js';
import * as timetable from '../controllers/timetable.controller.js';
import * as emailWebhook from '../services/email-webhook.service.js';
import { paginated } from '../utils/response.js';
import { emailDeliveriesQuery } from '../validators/registration.validator.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParam } from '../validators/common.validator.js';
import {
  listRegistrationsQuery, reviewSchema, auditLogQuery, reportQuery, settingUpdateSchema, slipQuery,
  sectionStudentParams, staffAddSchema, staffDropSchema, accountRequestsQuery, approveRequestSchema, rejectRequestSchema, signInsQuery,
  timetableIssuesQuery, resolveIssueSchema,
} from '../validators/registration.validator.js';
import { rolePermissionsSchema } from '../validators/role.validator.js';
import { PERMISSIONS } from '../utils/constants.js';

const router = Router();

router.use(authenticate);

// Registration review
router.get('/registrations', requirePermission(PERMISSIONS.REGISTRATION_VIEW_ALL), validate({ query: listRegistrationsQuery }), registrations.list);
router.get('/registrations/:id', requirePermission(PERMISSIONS.REGISTRATION_VIEW_ALL), validate({ params: idParam }), registrations.getById);
router.get('/registrations/:id/slip', requirePermission(PERMISSIONS.REGISTRATION_VIEW_ALL), validate({ params: idParam, query: slipQuery }), slips.staffSlip);
router.patch('/registrations/:id/approve', requirePermission(PERMISSIONS.REGISTRATION_APPROVE), validate({ params: idParam, body: reviewSchema }), registrations.approve);
router.patch('/registrations/:id/reject', requirePermission(PERMISSIONS.REGISTRATION_APPROVE), validate({ params: idParam, body: reviewSchema }), registrations.reject);

// Timetable confirmation issues (recorded when an approval finds clashes)
router.get('/timetable-issues', requirePermission(PERMISSIONS.REGISTRATION_VIEW_ALL), validate({ query: timetableIssuesQuery }), timetable.listIssues);
router.post('/timetable-issues/:id/resolve', requirePermission(PERMISSIONS.REGISTRATION_APPROVE), validate({ params: idParam, body: resolveIssueSchema }), timetable.resolveIssue);

// Staff enrolment: add or remove a student from a section on their behalf
router.post('/sections/:id/students', requirePermission(PERMISSIONS.REGISTRATION_MANAGE), validate({ params: idParam, body: staffAddSchema }), registrations.staffAdd);
router.delete('/sections/:id/students/:studentId', requirePermission(PERMISSIONS.REGISTRATION_MANAGE), validate({ params: sectionStudentParams, body: staffDropSchema }), registrations.staffRemove);

// Password-reset and name-change requests awaiting an admin
router.get('/account-requests', requirePermission(PERMISSIONS.ACCOUNT_APPROVE), validate({ query: accountRequestsQuery }), accountRequests.list);
router.patch('/account-requests/:id/approve', requirePermission(PERMISSIONS.ACCOUNT_APPROVE), validate({ params: idParam, body: approveRequestSchema }), accountRequests.approve);
router.patch('/account-requests/:id/reject', requirePermission(PERMISSIONS.ACCOUNT_APPROVE), validate({ params: idParam, body: rejectRequestSchema }), accountRequests.reject);

// Reports
router.get('/reports/course-popularity', requirePermission(PERMISSIONS.REPORT_VIEW), validate({ query: reportQuery }), reports.coursePopularity);
router.get('/reports/overview', requirePermission(PERMISSIONS.REPORT_VIEW), validate({ query: reportQuery }), reports.overview);
router.get('/reports/registration-summary', requirePermission(PERMISSIONS.REPORT_VIEW), validate({ query: reportQuery }), reports.registrationSummary);

// Email delivery log (ADMIN, audit:view): what was sent, accepted, delivered or failed. No bodies.
router.get('/email-deliveries', requirePermission(PERMISSIONS.AUDIT_VIEW), validate({ query: emailDeliveriesQuery }), async (req, res) => {
  const { result, page, limit } = await emailWebhook.listDeliveries(req.validated.query);
  return paginated(res, result, { page, limit });
});

// Roles & permissions (ADMIN, role:manage)
router.get('/roles', requirePermission(PERMISSIONS.ROLE_MANAGE), roles.list);
router.get('/permissions', requirePermission(PERMISSIONS.ROLE_MANAGE), roles.permissions);
router.put('/roles/:id/permissions', requirePermission(PERMISSIONS.ROLE_MANAGE), validate({ params: idParam, body: rolePermissionsSchema }), roles.setPermissions);

// Audit logs & settings
router.get('/sign-ins', requirePermission(PERMISSIONS.AUDIT_VIEW), validate({ query: signInsQuery }), admin.signIns);
router.get('/audit-logs/options', requirePermission(PERMISSIONS.AUDIT_VIEW), admin.auditLogOptions);
router.get('/audit-logs', requirePermission(PERMISSIONS.AUDIT_VIEW), validate({ query: auditLogQuery }), admin.auditLogs);
router.get('/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), admin.settings);
router.patch('/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), validate({ body: settingUpdateSchema }), admin.updateSettings);

export default router;
