import { z } from 'zod';

export const loginSchema = z.object({
  email:    z.string().email().max(254).toLowerCase().trim(),
  password: z.string().min(1).max(1024),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword:     z.string().min(12).max(1024),
});

export const resetPasswordSchema = z.object({
  token:       z.string().length(64),
  newPassword: z.string().min(12).max(1024),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email().max(254).toLowerCase().trim(),
});

export const inviteUserSchema = z.object({
  email:     z.string().email().max(254).toLowerCase().trim(),
  firstName: z.string().min(1).max(100).trim(),
  lastName:  z.string().min(1).max(100).trim(),
  roles:     z.array(z.enum([
    'institution_admin', 'lead', 'professor', 'student', 'counsellor',
  ])).min(1),
});
