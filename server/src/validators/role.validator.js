import { z } from 'zod';
import { PERMISSIONS } from '../utils/constants.js';

export const rolePermissionsSchema = z.object({
  permissions: z.array(z.enum(Object.values(PERMISSIONS))).max(100)
    .refine((list) => new Set(list).size === list.length, 'Each permission may appear only once'),
});
