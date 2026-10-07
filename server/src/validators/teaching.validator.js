import { z } from 'zod';
import { id, dateOnly, isoDate } from './common.validator.js';
import { ASSESSMENT_TYPES, ATTENDANCE_STATUS } from '../utils/constants.js';

const oncePerStudent = (list) => new Set(list.map((r) => r.studentId)).size === list.length;
const notEmpty = (d) => Object.keys(d).length > 0;

const attendanceRecords = z.array(z.object({
  studentId: id,
  status: z.enum(Object.values(ATTENDANCE_STATUS)),
  remark: z.string().trim().max(255).nullable().optional(),
})).max(1000).refine(oncePerStudent, 'Each student may appear only once');

const topic = z.string().trim().max(200).nullable();

export const createAttendanceSchema = z.object({
  date: dateOnly,
  scheduleId: id.optional(),
  topic: topic.optional(),
  records: attendanceRecords.default([]),
});

export const updateAttendanceSchema = z.object({
  topic: topic.optional(),
  records: attendanceRecords.optional(),
}).refine(notEmpty, 'Provide at least one field to update');

const assessmentFields = {
  title: z.string().trim().min(2).max(150),
  type: z.enum(ASSESSMENT_TYPES),
  description: z.string().trim().max(5000).nullable().optional(),
  maxScore: z.number().positive().max(1000),
  weight: z.number().min(0).max(100),
  dueAt: isoDate.nullable().optional(),
};

export const createAssessmentSchema = z.object(assessmentFields);
export const updateAssessmentSchema = z.object(assessmentFields).partial().refine(notEmpty, 'Provide at least one field to update');

export const assessmentScoresSchema = z.object({
  scores: z.array(z.object({
    studentId: id,
    score: z.number().min(0).nullable(),
    feedback: z.string().trim().max(500).nullable().optional(),
  })).min(1).max(1000).refine(oncePerStudent, 'Each student may appear only once'),
});
