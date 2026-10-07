import { z } from 'zod';
import { ACCOUNT_REQUEST_TYPE } from '../utils/constants.js';

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number');

const email = z.email().max(191).transform((v) => v.toLowerCase());

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(1).max(191).optional(),
    email: z.string().trim().min(1).max(191).optional(),
    password: z.string().min(1).max(72),
  })
  .refine((d) => d.identifier || d.email, { message: 'Enter your student ID or email', path: ['identifier'] })
  .transform((d) => ({ identifier: d.identifier ?? d.email, password: d.password }));

const studentNumber = z.string().trim().min(3).max(30).transform((v) => v.toUpperCase());
const pin = z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits');
const confirmed = (d) => d.newPin === d.confirmPin;
const mismatch = { message: 'The PINs do not match', path: ['confirmPin'] };

export const changePinSchema = z
  .object({ currentPin: z.string().min(1).max(72), newPin: pin, confirmPin: z.string() })
  .refine(confirmed, mismatch);

export const forgotPinSchema = z.object({ studentNumber, email });

export const resetPinSchema = z
  .object({ studentNumber, otp: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'), newPin: pin, confirmPin: z.string() })
  .refine(confirmed, mismatch);

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const avatarSchema = z.object({
  image: z.string().max(300_000).regex(/^data:image\/(jpeg|png|webp);base64,/, 'Upload a JPG, PNG or WebP image'),
  thumb: z.string().max(20_000).regex(/^data:image\/jpeg;base64,/, 'The thumbnail must be a JPEG').optional(),
});

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: password,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'New password must differ from the current password',
    path: ['newPassword'],
  });

export const changeRequestSchema = z
  .object({
    type: z.enum(Object.values(ACCOUNT_REQUEST_TYPE)),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.type !== ACCOUNT_REQUEST_TYPE.NAME_CHANGE || (d.firstName && d.lastName), {
    message: 'Give the new first and last name', path: ['firstName'],
  });
