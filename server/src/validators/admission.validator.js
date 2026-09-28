import { z } from 'zod';
import { id } from './common.validator.js';
import { importBody } from './import.validator.js';

const name = z.string().trim().min(1).max(100);
const code = z.string().trim().min(2).max(20).transform((v) => v.toUpperCase());

/** "2026/2027": two consecutive years. */
export const admissionSession = z
  .string()
  .trim()
  .regex(/^\d{4}\/\d{4}$/, 'Admission session must look like 2026/2027')
  .refine((s) => Number(s.slice(5)) === Number(s.slice(0, 4)) + 1, 'The second year must follow the first');

const admissionNumber = z.string().trim().min(1).max(30);
// Only when migrating students who already have an ID; new admissions get a generated one.
const studentNumber = z.string().trim().min(3).max(30).transform((v) => v.toUpperCase());
const level = z.coerce.number().int().min(100).max(900);

export const admitSchema = z
  .object({
    firstName: name,
    lastName: name,
    programId: id.optional(),
    programCode: code.optional(),
    admissionSession,
    level: level.default(100),
    admissionNumber: admissionNumber.optional(),
    studentNumber: studentNumber.optional(),
  })
  .refine((d) => d.programId || d.programCode, { message: 'Give programId or programCode', path: ['programCode'] });

// Each row hashes a PIN, so a request is capped lower than other imports (send larger files in parts).
export const MAX_ADMISSIONS_PER_REQUEST = 1000;

/**
 * Bulk rows are upserts keyed by `studentNumber` (existing students) or else `admissionNumber`,
 * so re-running a file never admits anyone twice. No `.default()` on optional fields, as for imports.
 */
export const bulkAdmitSchema = importBody(
  z.object({
    firstName: name,
    lastName: name,
    programCode: code,
    admissionSession,
    level: level.optional(),
    admissionNumber: admissionNumber.optional(),
    studentNumber: studentNumber.optional(),
  }).refine((d) => d.admissionNumber || d.studentNumber, {
    message: 'Each row needs an admissionNumber (or the studentNumber of an existing student)', path: ['admissionNumber'],
  }),
  {},
  MAX_ADMISSIONS_PER_REQUEST,
);
