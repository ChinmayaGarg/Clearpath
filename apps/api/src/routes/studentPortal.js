/**
 * Student portal routes — requires auth + student role.
 *
 * GET    /api/student/me
 * GET    /api/student/accommodations
 * GET    /api/student/exam-requests
 * POST   /api/student/exam-requests
 * DELETE /api/student/exam-requests/:id
 */
import { Router } from 'express';
import { z }      from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import {
  getStudentProfileId,
  getStudentPortalMe,
  getStudentPortalGrants,
  getStudentExamBookings,
  createExamBookingRequest,
  cancelExamBookingRequest,
} from '../db/queries/studentPortal.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('student'));

// ── GET /api/student/me ───────────────────────────────────────────────────────
router.get('/me', async (req, res, next) => {
  try {
    const schema           = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res.status(404).json({ ok: false, error: 'Student profile not found' });
    }

    const me = await getStudentPortalMe(schema, studentProfileId);
    res.json({ ok: true, data: me });
  } catch (err) { next(err); }
});

// ── GET /api/student/accommodations ──────────────────────────────────────────
router.get('/accommodations', async (req, res, next) => {
  try {
    const schema           = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res.status(404).json({ ok: false, error: 'Student profile not found' });
    }

    const grants = await getStudentPortalGrants(schema, studentProfileId);
    res.json({ ok: true, data: grants });
  } catch (err) { next(err); }
});

// ── GET /api/student/exam-requests ────────────────────────────────────────────
router.get('/exam-requests', async (req, res, next) => {
  try {
    const schema           = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res.status(404).json({ ok: false, error: 'Student profile not found' });
    }

    const bookings = await getStudentExamBookings(schema, studentProfileId);
    res.json({ ok: true, data: bookings });
  } catch (err) { next(err); }
});

// ── POST /api/student/exam-requests ──────────────────────────────────────────
const BookingSchema = z.object({
  courseCode:           z.string().min(1).max(20),
  examDate:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  examTime:             z.string().regex(/^\d{2}:\d{2}$/).optional(),
  examType:             z.enum(['midterm', 'final', 'quiz', 'assignment', 'other']).default('midterm'),
  specialMaterialsNote: z.string().max(1000).optional(),
});

router.post('/exam-requests', async (req, res, next) => {
  try {
    const schema           = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res.status(404).json({ ok: false, error: 'Student profile not found' });
    }

    const body = BookingSchema.parse(req.body);

    // Validate date is in the future
    if (new Date(body.examDate) < new Date()) {
      return res.status(400).json({ ok: false, error: 'Exam date must be in the future' });
    }

    const id = await createExamBookingRequest(schema, {
      studentProfileId,
      courseCode:           body.courseCode,
      examDate:             body.examDate,
      examTime:             body.examTime,
      examType:             body.examType,
      specialMaterialsNote: body.specialMaterialsNote,
    });

    res.status(201).json({ ok: true, data: { id } });
  } catch (err) { next(err); }
});

// ── DELETE /api/student/exam-requests/:id ─────────────────────────────────────
router.delete('/exam-requests/:id', async (req, res, next) => {
  try {
    const schema           = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res.status(404).json({ ok: false, error: 'Student profile not found' });
    }

    const cancelled = await cancelExamBookingRequest(schema, req.params.id, studentProfileId);

    if (!cancelled) {
      return res.status(404).json({ ok: false, error: 'Request not found or already confirmed/cancelled' });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
