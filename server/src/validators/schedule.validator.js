import { z } from 'zod';
import { id, time, dateOnly, isoDate, paginationQuery } from './common.validator.js';
import { DAYS, SECTION_STATUS, SEMESTER_STATUS } from '../utils/constants.js';

// Academic years
export const academicYearSchema = z
  .object({
    name: z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Name must look like 2026/2027'),
    startDate: dateOnly,
    endDate: dateOnly,
  })
  .refine((d) => d.startDate < d.endDate, { message: 'endDate must be after startDate', path: ['endDate'] });

export const updateAcademicYearSchema = z
  .object({ name: z.string().trim().regex(/^\d{4}\/\d{4}$/), startDate: dateOnly, endDate: dateOnly })
  .partial();

// Semesters
const semesterFields = {
  academicYearId: id,
  name: z.string().trim().min(2).max(50),
  startDate: dateOnly,
  endDate: dateOnly,
  registrationStart: isoDate,
  registrationEnd: isoDate,
  addDropEnd: isoDate.optional(),
  maxCredits: z.coerce.number().int().min(1).max(60).optional(),
  minCredits: z.coerce.number().int().min(0).max(60),
  isCurrent: z.boolean(),
  status: z.enum(Object.values(SEMESTER_STATUS)),
};

const checkSemesterDates = (d, ctx) => {
  if (d.startDate && d.endDate && d.startDate >= d.endDate) {
    ctx.addIssue({ code: 'custom', message: 'endDate must be after startDate', path: ['endDate'] });
  }
  if (d.registrationStart && d.registrationEnd && d.registrationStart >= d.registrationEnd) {
    ctx.addIssue({ code: 'custom', message: 'registrationEnd must be after registrationStart', path: ['registrationEnd'] });
  }
  if (d.addDropEnd && d.registrationStart && d.addDropEnd < d.registrationStart) {
    ctx.addIssue({ code: 'custom', message: 'addDropEnd must be after registrationStart', path: ['addDropEnd'] });
  }
  if (d.minCredits != null && d.maxCredits != null && d.minCredits > d.maxCredits) {
    ctx.addIssue({ code: 'custom', message: 'minCredits cannot exceed maxCredits', path: ['minCredits'] });
  }
};

export const createSemesterSchema = z
  .object({
    ...semesterFields,
    minCredits: semesterFields.minCredits.default(0),
    isCurrent: semesterFields.isCurrent.default(false),
    status: semesterFields.status.default(SEMESTER_STATUS.UPCOMING),
  })
  .superRefine(checkSemesterDates);

// Note: update schemas are built from fields without defaults — zod 4 applies defaults even inside .partial().

export const updateSemesterSchema = z
  .object(semesterFields)
  .partial()
  .superRefine(checkSemesterDates)
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const listSemestersQuery = z.object({
  ...paginationQuery,
  academicYearId: id.optional(),
  status: z.enum(Object.values(SEMESTER_STATUS)).optional(),
});

// Sections
export const createSectionSchema = z.object({
  courseId: id,
  semesterId: id,
  lecturerId: id.nullable().optional(),
  sectionCode: z.string().trim().min(1).max(10).default('A'),
  capacity: z.coerce.number().int().min(1).max(2000),
  status: z.enum(Object.values(SECTION_STATUS)).default(SECTION_STATUS.OPEN),
  waitlistEnabled: z.boolean().default(true),
});

export const updateSectionSchema = z
  .object({
    lecturerId: id.nullable(),
    sectionCode: z.string().trim().min(1).max(10),
    capacity: z.coerce.number().int().min(1).max(2000),
    status: z.enum(Object.values(SECTION_STATUS)),
    waitlistEnabled: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const listSectionsQuery = z.object({
  ...paginationQuery,
  semesterId: id.optional(),
  courseId: id.optional(),
  lecturerId: id.optional(),
  status: z.enum(Object.values(SECTION_STATUS)).optional(),
});

// Schedules
const scheduleFields = {
  courseSectionId: id,
  day: z.enum(DAYS),
  startTime: time,
  endTime: time,
  room: z.string().trim().max(50).optional(),
};

export const createScheduleSchema = z
  .object(scheduleFields)
  .refine((d) => d.startTime < d.endTime, { message: 'endTime must be after startTime', path: ['endTime'] });

export const updateScheduleSchema = z
  .object(scheduleFields)
  .omit({ courseSectionId: true })
  .partial()
  .refine((d) => !(d.startTime && d.endTime) || d.startTime < d.endTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  })
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const listSchedulesQuery = z.object({ courseSectionId: id.optional(), semesterId: id.optional() });

// Registration priority
export const priorityWindowSchema = z.object({
  name: z.string().trim().min(2).max(100),
  minLevel: z.coerce.number().int().min(100).max(900).optional(),
  programId: id.optional(),
  opensAt: isoDate,
});
export const updatePriorityWindowSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    minLevel: z.coerce.number().int().min(100).max(900).nullable(),
    programId: id.nullable(),
    opensAt: isoDate,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');
export const windowParams = z.object({ id, windowId: id });
export const registrationOverrideSchema = z.object({
  studentId: id,
  opensAt: isoDate,
  reason: z.string().trim().min(5).max(500),
});
export const overrideStudentParams = z.object({ id, studentId: id });
