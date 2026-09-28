import { z } from 'zod';
import { id, paginationQuery } from './common.validator.js';
import { password } from './auth.validator.js';
import { ROLES, USER_STATUS, STUDENT_STATUS } from '../utils/constants.js';

export const listUsersQuery = z.object({
  ...paginationQuery,
  search: z.string().trim().max(100).optional(),
  role: z.enum(Object.values(ROLES)).optional(),
  status: z.enum(Object.values(USER_STATUS)).optional(),
});

// Applicant accounts only come from online sign-up (POST /api/applications/account), never from staff.
const assignableRole = z.enum(Object.values(ROLES).filter((r) => r !== ROLES.APPLICANT));

export const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email().max(191).transform((v) => v.toLowerCase()),
  // Omit it to email the person an invite link instead, so staff never know their password.
  password: password.optional(),
  role: assignableRole,
  status: z.enum(Object.values(USER_STATUS)).default(USER_STATUS.ACTIVE),
});

export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    role: assignableRole,
    status: z.enum(Object.values(USER_STATUS)),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const createStudentSchema = z.object({
  userId: id,
  programId: id,
  // Optional: omit it and a number is generated, the same way as for self sign-ups.
  studentNumber: z.string().trim().min(3).max(30).optional(),
  level: z.coerce.number().int().min(100).max(900).default(100),
  admissionYear: z.coerce.number().int().min(1950).max(2100).optional(),
});

export const updateStudentSchema = z
  .object({
    programId: id,
    level: z.coerce.number().int().min(100).max(900),
    status: z.enum(Object.values(STUDENT_STATUS)),
    academicHold: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const listStudentsQuery = z.object({
  ...paginationQuery,
  search: z.string().trim().max(100).optional(),
  programId: id.optional(),
  level: z.coerce.number().int().optional(),
  status: z.enum(Object.values(STUDENT_STATUS)).optional(),
});

export const createLecturerSchema = z.object({
  userId: id,
  departmentId: id,
  staffNumber: z.string().trim().min(2).max(30),
  title: z.string().trim().max(50).optional(),
});

export const updateLecturerSchema = z
  .object({
    departmentId: id,
    staffNumber: z.string().trim().min(2).max(30),
    title: z.string().trim().max(50),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const departmentSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
});

export const programSchema = z.object({
  departmentId: id,
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
  durationYears: z.coerce.number().int().min(1).max(10).default(4),
  maxCredits: z.coerce.number().int().min(1).max(60).default(24),
  qualificationCode: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()).optional(),
});

export const updateProgramSchema = z
  .object({
    departmentId: id,
    name: z.string().trim().min(2).max(150),
    code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
    durationYears: z.coerce.number().int().min(1).max(10),
    maxCredits: z.coerce.number().int().min(1).max(60),
    qualificationCode: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const updateDepartmentSchema = departmentSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const listLecturersQuery = z.object({ ...paginationQuery, departmentId: id.optional() });
export const programCourseSchema = z.object({
  courseId: id,
  type: z.enum(['core', 'elective']).default('core'),
  recommendedLevel: z.coerce.number().int().min(100).max(900).optional(),
});
export const programCourseParams = z.object({ id, courseId: id });

export const listProgramsQuery = z.object({ departmentId: id.optional() });
export const semesterFilterQuery = z.object({ semesterId: id.optional() });

export const prerequisiteOverrideSchema = z.object({
  courseId: id,
  semesterId: id.optional(),
  reason: z.string().trim().min(5).max(500),
});
export const overrideParams = z.object({ id, overrideId: id });
