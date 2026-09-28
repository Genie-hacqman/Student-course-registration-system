import { z } from 'zod';
import { id, time } from './common.validator.js';
import { COURSE_STATUS, DAYS, ROLES, SECTION_STATUS } from '../utils/constants.js';
import { PASSABLE_GRADES } from '../utils/grades.js';

/*
 * Bulk import rows reference other records by natural key (codes, emails, staff numbers), never by
 * database id, so the source spreadsheet stays readable and editable by the registrar.
 *
 * Rows are upserts. So optional fields deliberately have NO `.default()`: an omitted field on a
 * re-imported row must leave the stored value alone. Defaults for new records are applied in
 * import.service instead.
 */

const MAX_ROWS = 5000;

const code = z.string().trim().min(2).max(20).transform((v) => v.toUpperCase());
const courseCode = z.string().trim().min(2).max(20)
  .regex(/^[A-Za-z0-9-]+$/, 'Code may only contain letters, numbers and dashes')
  .transform((v) => v.toUpperCase());
const email = z.email().max(191).transform((v) => v.toLowerCase());
const name = z.string().trim().min(1).max(100);
const level = z.coerce.number().int().min(100).max(900);

export const importBody = (row, extra = {}, maxRows = MAX_ROWS) => z.object({
  rows: z.array(row).min(1).max(maxRows),
  // Runs every row, reports exactly what a real import would, then rolls everything back.
  dryRun: z.boolean().default(false),
  ...extra,
});

export const importDepartmentsSchema = importBody(z.object({
  code,
  name: z.string().trim().min(2).max(150),
}));

export const importProgramsSchema = importBody(z.object({
  code,
  name: z.string().trim().min(2).max(150),
  departmentCode: code,
  durationYears: z.coerce.number().int().min(1).max(10).optional(),
  maxCredits: z.coerce.number().int().min(1).max(60).optional(),
  qualificationCode: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()).optional(),
}));

export const importCoursesSchema = importBody(z.object({
  code: courseCode,
  title: z.string().trim().min(2).max(200),
  departmentCode: code,
  description: z.string().trim().max(5000).optional(),
  credits: z.coerce.number().int().min(0).max(12),
  level,
  status: z.enum(Object.values(COURSE_STATUS)).optional(),
}));

export const importProgramCoursesSchema = importBody(z.object({
  programCode: code,
  courseCode,
  type: z.enum(['core', 'elective']).optional(),
  recommendedLevel: level.optional(),
}));

export const importPrerequisitesSchema = importBody(z.object({
  courseCode,
  // One requirement group: any one of these courses satisfies it.
  requiresAnyOf: z.array(courseCode).min(1).max(10),
  type: z.enum(['prerequisite', 'corequisite']).default('prerequisite'),
  minGrade: z.string().trim().transform((v) => v.toUpperCase())
    .refine((v) => PASSABLE_GRADES.includes(v), { message: `minGrade must be one of: ${PASSABLE_GRADES.join(', ')}` })
    .optional(),
}));

const sendInvites = {
  // Off by default so everything can be loaded and checked before anyone is emailed.
  // Send them later with POST /admin/import/invites.
  sendInvites: z.boolean().default(false),
};

export const importLecturersSchema = importBody(z.object({
  email,
  firstName: name,
  lastName: name,
  staffNumber: z.string().trim().min(2).max(30),
  departmentCode: code,
  title: z.string().trim().max(50).optional(),
}), sendInvites);

const slot = z
  .object({ day: z.enum(DAYS), startTime: time, endTime: time, room: z.string().trim().max(50).optional() })
  .refine((d) => d.startTime < d.endTime, { message: 'endTime must be after startTime', path: ['endTime'] });

export const importSectionsSchema = importBody(z.object({
  courseCode,
  // Omit it to use the current semester.
  semesterId: id.optional(),
  sectionCode: z.string().trim().min(1).max(10).default('A'),
  capacity: z.coerce.number().int().min(1).max(2000),
  // null removes the lecturer; omitted leaves it unchanged.
  lecturerStaffNumber: z.string().trim().min(2).max(30).nullable().optional(),
  status: z.enum(Object.values(SECTION_STATUS)).optional(),
  waitlistEnabled: z.boolean().optional(),
  // When given, replaces the section's whole timetable.
  schedules: z.array(slot).max(20).optional(),
}));

export const sendInvitesSchema = z.object({
  // Students are admitted with a PIN instead (POST /api/admissions); invites are for staff accounts.
  role: z.enum([ROLES.LECTURER, ROLES.ACADEMIC_ADVISOR, ROLES.REGISTRAR, ROLES.ADMIN]).optional(),
  // Invites are emailed one by one, so a large backlog is sent in batches; `remaining` says how many are left.
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
