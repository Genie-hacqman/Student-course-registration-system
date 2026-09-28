import { z } from 'zod';
import { id, paginationQuery } from './common.validator.js';
import {
  REGISTRATION_STATUS, ACCOUNT_REQUEST_STATUS, ACCOUNT_REQUEST_TYPE, ROLES, TIMETABLE_ISSUE_STATUS, TIMETABLE_ISSUE_TYPES,
} from '../utils/constants.js';
import { PASSABLE_GRADES } from '../utils/grades.js';

export const addItemSchema = z.object({ courseSectionId: id });

export const availableCoursesQuery = z.object({
  search: z.string().trim().max(100).optional(),
  level: z.coerce.number().int().optional(),
  departmentId: id.optional(),
  eligibleOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const itemIdParam = z.object({ itemId: id });

export const timetableIssuesQuery = z.object({
  ...paginationQuery,
  status: z.enum(Object.values(TIMETABLE_ISSUE_STATUS)).optional(),
  type: z.enum(TIMETABLE_ISSUE_TYPES).optional(),
  registrationId: id.optional(),
});
export const resolveIssueSchema = z.object({ note: z.string().trim().min(3).max(500) });

export const reviewSchema = z.object({ remarks: z.string().trim().max(500).optional() });

export const listRegistrationsQuery = z.object({
  ...paginationQuery,
  semesterId: id.optional(),
  studentId: id.optional(),
  status: z.enum(Object.values(REGISTRATION_STATUS)).optional(),
});

export const joinWaitlistSchema = z.object({ courseSectionId: id });

export const notificationListQuery = z.object({
  ...paginationQuery,
  unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const auditLogQuery = z.object({
  ...paginationQuery,
  userId: id.optional(),
  action: z.string().max(100).optional(),
  entityType: z.string().max(50).optional(),
});

export const reportQuery = z.object({ semesterId: id.optional() });

/** Value rule for every setting the code reads (see setting.service DEFAULTS). */
export const SETTING_VALUES = {
  'registration.requireApproval': z.boolean(),
  'registration.waitlistEnabled': z.boolean(),
  'registration.defaultMaxCredits': z.number().int().min(1).max(60),
  'grades.passingGrade': z.enum(PASSABLE_GRADES),
  'institution.name': z.string().trim().min(2).max(150),
  'institution.studentEmailDomain': z.string().trim().toLowerCase()
    .regex(/^(?=.{3,120}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, 'Must be a domain such as school.edu.gh'),
};

export const settingUpdateSchema = z.object({
  settings: z
    .array(z.object({ key: z.string().trim().min(1).max(100), value: z.unknown(), description: z.string().max(255).optional() }))
    .min(1)
    .superRefine((settings, ctx) => settings.forEach(({ key, value }, i) => {
      const rule = SETTING_VALUES[key];
      if (!rule) {
        ctx.addIssue({ code: 'custom', message: `Unknown setting ${key}`, path: [i, 'key'] });
        return;
      }
      const parsed = rule.safeParse(value);
      if (!parsed.success) ctx.addIssue({ code: 'custom', message: `${key}: ${parsed.error.issues[0].message}`, path: [i, 'value'] });
    })),
});

export const slipQuery = z.object({ format: z.enum(['pdf', 'json']).default('pdf') });

export const verifySlipParams = z.object({ reference: z.string().trim().regex(/^REG-\d{4}-\d{2,}-\d{6,}$/, 'Invalid reference number') });
export const verifySlipQuery = z.object({ code: z.string().trim().max(20).optional() });

// Staff enrolment
export const sectionStudentParams = z.object({ id, studentId: id });
export const staffAddSchema = z
  .object({
    studentId: id,
    override: z.boolean().default(false),
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .refine((d) => !d.override || d.reason, { message: 'Give a reason for overriding the checks', path: ['reason'] });
export const staffDropSchema = z.object({ reason: z.string().trim().min(5).max(500) });

// Account change requests (super admin)
export const accountRequestsQuery = z.object({
  ...paginationQuery,
  status: z.enum(Object.values(ACCOUNT_REQUEST_STATUS)).optional(),
  type: z.enum(Object.values(ACCOUNT_REQUEST_TYPE)).optional(),
});
export const approveRequestSchema = z.object({ note: z.string().trim().max(500).optional() });
export const rejectRequestSchema = z.object({ note: z.string().trim().min(3).max(500) });

// Sign-in history
export const signInsQuery = z.object({
  ...paginationQuery,
  userId: id.optional(),
  role: z.enum(Object.values(ROLES)).optional(),
  search: z.string().trim().max(100).optional(),
  result: z.enum(['success', 'failed']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
