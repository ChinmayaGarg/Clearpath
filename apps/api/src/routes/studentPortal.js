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
import { requireAuth }  from '../middleware/auth.js';
import { requireRole }  from '../middleware/role.js';
import { tenantQuery }  from '../db/tenantPool.js';
import {
  getStudentProfileId,
  getStudentPortalMe,
  getStudentPortalGrants,
  getStudentExamBookings,
  createExamBookingRequest,
  cancelExamBookingRequest,
  getStudentAccommodationCodes,
  findExamUploadDuration,
  getStudentBookingsOnDate,
  getSarsAppointmentsOnDate,
} from '../db/queries/studentPortal.js';
import { calcStudentDuration, timesOverlap, addMinutes } from '../utils/durationCalc.js';

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

// ── GET /api/student/courses ──────────────────────────────────────────────────
router.get('/courses', async (req, res, next) => {
  try {
    const schema           = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res.status(404).json({ ok: false, error: 'Student profile not found' });
    }

    const result = await tenantQuery(
      schema,
      `SELECT course_code FROM (
         SELECT DISTINCT e.course_code
         FROM appointment a
         JOIN exam_room er ON er.id = a.exam_room_id
         JOIN exam e       ON e.id  = er.exam_id
         WHERE a.student_profile_id = $1
           AND a.is_cancelled = FALSE

         UNION

         SELECT course_code
         FROM student_course
         WHERE student_profile_id = $1
       ) AS combined
       ORDER BY course_code`,
      [studentProfileId],
    );

    res.json({ ok: true, data: result.rows.map(r => r.course_code) });
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

// ── GET /api/student/accommodation-codes ─────────────────────────────────────
// Returns just the code strings from student_accommodation (counsellor-managed).
// Used by the booking form to compute estimated duration client-side.
router.get('/accommodation-codes', async (req, res, next) => {
  try {
    const schema           = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);
    if (!studentProfileId) {
      return res.status(404).json({ ok: false, error: 'Student profile not found' });
    }
    const codes = await getStudentAccommodationCodes(schema, studentProfileId);
    res.json({ ok: true, data: codes });
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
  examDurationMins:     z.number().int().min(1).max(600),
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

    // Validate date is at least 9 days from today
    const earliest = new Date();
    earliest.setDate(earliest.getDate() + 9);
    earliest.setHours(0, 0, 0, 0);
    if (new Date(body.examDate) < earliest) {
      return res.status(400).json({ ok: false, error: 'Exam must be scheduled at least 9 days in advance' });
    }

    // ── Compute duration from accommodations + exam upload (fallback to student input) ─
    const [codes, uploadBaseMins] = await Promise.all([
      getStudentAccommodationCodes(schema, studentProfileId),
      findExamUploadDuration(schema, body.courseCode, body.examType),
    ]);
    // Use professor's upload duration if available; otherwise use what the student entered
    const baseMins = uploadBaseMins ?? body.examDurationMins;
    const { extraMins, stbMins, totalMins } = calcStudentDuration(baseMins, codes);

    // ── 10 PM end-time check ─────────────────────────────────────────────────
    if (body.examTime && totalMins) {
      const [h, m] = body.examTime.split(':').map(Number);
      const endMins = h * 60 + m + totalMins;
      if (endMins > 22 * 60) {
        const endTime = addMinutes(body.examTime, totalMins);
        return res.status(400).json({
          ok: false,
          error: `Your exam would end at ${endTime}, which is past 10:00 PM. Please choose an earlier start time.`,
        });
      }
    }

    // ── Time conflict check (only when a time is provided and duration is known) ─
    if (body.examTime && totalMins) {
      const [sarsAppts, existingRequests] = await Promise.all([
        getSarsAppointmentsOnDate(schema, studentProfileId, body.examDate),
        getStudentBookingsOnDate(schema, studentProfileId, body.examDate),
      ]);

      const allSlots = [
        ...sarsAppts.map((a) => ({
          start: a.start_time.slice(0, 5),
          dur:   a.duration_mins,
          label: a.course_code,
        })),
        ...existingRequests.map((r) => ({
          start: r.exam_time.slice(0, 5),
          dur:   r.computed_duration_mins,
          label: r.course_code,
        })),
      ];

      for (const slot of allSlots) {
        if (timesOverlap(body.examTime, totalMins, slot.start, slot.dur)) {
          const slotEnd = addMinutes(slot.start, slot.dur);
          return res.status(409).json({
            ok: false,
            error: `You already have an exam (${slot.label}) from ${slot.start} to ${slotEnd} on that date`,
          });
        }
      }
    }

    const id = await createExamBookingRequest(schema, {
      studentProfileId,
      courseCode:            body.courseCode,
      examDate:              body.examDate,
      examTime:              body.examTime,
      examType:              body.examType,
      specialMaterialsNote:  body.specialMaterialsNote,
      studentDurationMins:   body.examDurationMins,
      baseDurationMins:      baseMins,
      extraMins,
      stbMins,
      computedDurationMins:  totalMins,
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
