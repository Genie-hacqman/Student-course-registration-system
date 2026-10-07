import { z } from 'zod';

export const id = z.coerce.number().int().positive();
export const idParam = z.object({ id });

export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(50).optional(),
};

export const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Must be a time in HH:MM format')
  .transform((v) => (v.length === 5 ? `${v}:00` : v));

export const isoDate = z.coerce.date();
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');
