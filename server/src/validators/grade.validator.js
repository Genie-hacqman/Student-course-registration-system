import { z } from 'zod';
import { id } from './common.validator.js';
import { GRADES } from '../utils/grades.js';

const grade = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => GRADES.includes(v), { message: `Grade must be one of: ${GRADES.join(', ')}` });

export const enterGradesSchema = z.object({
  grades: z.array(z.object({ studentId: id, grade })).min(1).max(1000)
    .refine((list) => new Set(list.map((g) => g.studentId)).size === list.length, 'Each student may appear only once'),
});

export const amendResultSchema = z.object({
  grade,
  reason: z.string().trim().min(5).max(500),
});

export const importResultsSchema = z.object({
  results: z.array(z.object({
    studentNumber: z.string().trim().min(1).max(30),
    courseCode: z.string().trim().min(1).max(20),
    semesterId: id.optional(),
    grade: z.string().trim().min(1).max(2),
  })).min(1).max(5000),
});
