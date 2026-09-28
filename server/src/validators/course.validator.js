import { z } from 'zod';
import { id, paginationQuery } from './common.validator.js';
import { COURSE_STATUS } from '../utils/constants.js';
import { PASSABLE_GRADES } from '../utils/grades.js';

export const COURSE_SORT_FIELDS = ['code', 'title', 'credits', 'level', 'createdAt'];

export const listCoursesQuery = z.object({
  ...paginationQuery,
  search: z.string().trim().max(100).optional(),
  departmentId: id.optional(),
  level: z.coerce.number().int().optional(),
  semesterId: id.optional(),
  status: z.enum(Object.values(COURSE_STATUS)).optional(),
});

const courseFields = {
  departmentId: id,
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9-]+$/, 'Code may only contain letters, numbers and dashes'),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional(),
  credits: z.coerce.number().int().min(0).max(12),
  level: z.coerce.number().int().min(100).max(900),
  status: z.enum(Object.values(COURSE_STATUS)).default(COURSE_STATUS.ACTIVE),
};

export const createCourseSchema = z.object(courseFields);

export const updateCourseSchema = z
  .object(courseFields)
  .omit({ status: true })
  .extend({ status: z.enum(Object.values(COURSE_STATUS)) })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const courseIdParam = z.object({ courseId: id });
export const prerequisiteParams = z.object({ courseId: id, prerequisiteId: id });
/**
 * One requirement group. Either a single course (legacy shape) or alternatives:
 *   { "prerequisiteCourseId": 3 }
 *   { "anyOf": [3, 9], "minGrade": "C", "type": "prerequisite" }   // CS201 or CS205, with at least a C
 *   { "anyOf": [12], "type": "corequisite" }                        // must be taken together
 */
export const addPrerequisiteSchema = z
  .object({
    prerequisiteCourseId: id.optional(),
    anyOf: z.array(id).min(1).max(10).optional(),
    type: z.enum(['prerequisite', 'corequisite']).default('prerequisite'),
    minGrade: z.string().trim().transform((v) => v.toUpperCase())
      .refine((v) => PASSABLE_GRADES.includes(v), { message: `minGrade must be one of: ${PASSABLE_GRADES.join(', ')}` })
      .optional(),
  })
  .refine((d) => Boolean(d.prerequisiteCourseId) !== Boolean(d.anyOf), {
    message: 'Provide either prerequisiteCourseId or anyOf',
    path: ['anyOf'],
  });
