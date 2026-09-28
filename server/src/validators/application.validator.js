import { z } from 'zod';
import { id, paginationQuery, dateOnly } from './common.validator.js';
import { password } from './auth.validator.js';
import { admissionSession } from './admission.validator.js';
import { APPLICATION_STATUS } from '../utils/constants.js';

const name = z.string().trim().min(1).max(100);
const level = z.coerce.number().int().min(100).max(900).multipleOf(100);

export const signUpSchema = z.object({
  firstName: name,
  lastName: name,
  email: z.email().max(191).transform((v) => v.toLowerCase()),
  password,
});

/**
 * Draft save: every field optional, none with a default (a save must not reset what's already there).
 * The personal email is the account's and isn't editable here. Completeness is checked on submit.
 */
export const saveApplicationSchema = z
  .object({
    firstName: name,
    lastName: name,
    otherNames: z.string().trim().max(100).nullable(),
    dateOfBirth: dateOnly.refine((d) => {
      const age = (Date.now() - new Date(d).getTime()) / (365.25 * 24 * 3600 * 1000);
      return age >= 12 && age <= 100;
    }, 'Enter a valid date of birth'),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
    departmentId: id,
    programId: id,
    entryLevel: level,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to save');

export const listApplicationsQuery = z.object({
  ...paginationQuery,
  status: z.enum(Object.values(APPLICATION_STATUS).filter((s) => s !== APPLICATION_STATUS.DRAFT)).optional(),
  programId: id.optional(),
  search: z.string().trim().max(100).optional(),
});

export const admitApplicationSchema = z.object({
  programId: id.optional(),
  level: level.optional(),
  admissionSession: admissionSession.optional(),
});

export const rejectApplicationSchema = z.object({ reason: z.string().trim().max(500).optional() });

// Only the PIN's shape here; the strength rules (pinProblem) run in the service, where the Student ID is known.
export const activateSchema = z
  .object({
    token: z.string().min(20).max(200),
    pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
    confirmPin: z.string(),
  })
  .refine((d) => d.pin === d.confirmPin, { message: 'The PINs do not match', path: ['confirmPin'] });
