import { z } from 'zod';
import { id, paginationQuery } from './common.validator.js';
import { ANNOUNCEMENT_AUDIENCE } from '../utils/constants.js';

const fields = {
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(10000),
  pinned: z.boolean(),
};

export const announcementSchema = z.object({
  ...fields,
  pinned: fields.pinned.optional(),
  audience: z.enum(Object.values(ANNOUNCEMENT_AUDIENCE)),
  courseSectionId: id.optional(),
  programId: id.optional(),
  emailRecipients: z.boolean().optional(),
}).superRefine((d, ctx) => {
  if (d.audience === ANNOUNCEMENT_AUDIENCE.SECTION && !d.courseSectionId) {
    ctx.addIssue({ code: 'custom', path: ['courseSectionId'], message: 'Choose a section' });
  }
  if (d.audience === ANNOUNCEMENT_AUDIENCE.PROGRAM && !d.programId) {
    ctx.addIssue({ code: 'custom', path: ['programId'], message: 'Choose a program' });
  }
});

export const updateAnnouncementSchema = z.object(fields).partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const listAnnouncementsQuery = z.object({ ...paginationQuery });
