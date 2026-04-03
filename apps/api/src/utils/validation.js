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

export const grantRoleSchema = z.object({
  role: z.enum([
    'institution_admin', 'lead', 'professor', 'student', 'counsellor',
  ]),
});

export const updateStudentProfileSchema = z.object({
  student: z.object({
    studentNumber: z.string().max(20).optional().nullable(),
    phone:         z.string().max(30).optional().nullable(),
    doNotCall:     z.boolean().optional(),
  }).optional(),
  professor: z.object({
    department: z.string().max(100).optional().nullable(),
    phone:      z.string().max(30).optional().nullable(),
    office:     z.string().max(100).optional().nullable(),
  }).optional(),
  counsellor: z.object({
    department: z.string().max(100).optional().nullable(),
  }).optional(),
});

export const createBookSchema = z.object({
  date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  notes: z.string().max(1000).optional(),
});

export const createExamSchema = z.object({
  courseCode:      z.string().min(1).max(50).trim().toUpperCase(),
  crossListedCode: z.string().max(50).optional().nullable(),
  durationMins:    z.number().int().min(1).max(900).optional().nullable(),
  examType:        z.enum(['paper', 'brightspace', 'crowdmark']).default('paper'),
  delivery:        z.enum(['pickup', 'dropped', 'delivery', 'pending']).default('pending'),
  materials:       z.string().max(500).optional().nullable(),
  password:        z.string().max(200).optional().nullable(),
  rwgFlag:         z.boolean().default(false),
  professorId:     z.string().uuid().optional().nullable(),
  rooms: z.array(z.object({
    roomName:     z.string().min(1).max(100),
    startTime:    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    studentCount: z.number().int().min(0).default(0),
  })).optional().default([]),
});

export const updateExamSchema = createExamSchema.partial();

export const updateStatusSchema = z.object({
  status: z.enum(['pending','emailed','received','written','picked_up','cancelled','dropped']),
  note:   z.string().max(500).optional(),
});

export const upsertRoomSchema = z.object({
  roomId:       z.string().uuid().optional(),
  roomName:     z.string().min(1).max(100),
  startTime:    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  studentCount: z.number().int().min(0).default(0),
});
