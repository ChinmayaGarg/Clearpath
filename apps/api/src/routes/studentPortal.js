/**
 * Student portal routes — requires auth + student role.
 *
 * GET    /api/student/me
 * GET    /api/student/accommodations
 * GET    /api/student/exam-requests
 * POST   /api/student/exam-requests
 * DELETE /api/student/exam-requests/:id
 * POST   /api/student/exam-requests/:id/cancellation-request
 * GET    /api/student/terms
 * GET    /api/student/renewal-requests
 * POST   /api/student/renewal-requests
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { tenantQuery } from "../db/tenantPool.js";
import {
  getStudentProfileId,
  getStudentPortalMe,
  getStudentAccommodations,
  getStudentExamBookings,
  createExamBookingRequest,
  cancelExamBookingRequest,
  getStudentAccommodationCodes,
  findExamUploadDuration,
  getStudentBookingsOnDate,
  getSarsAppointmentsOnDate,
  submitCancellationRequest,
  checkExistingCancellationRequest,
} from "../db/queries/studentPortal.js";
import {
  calcStudentDuration,
  timesOverlap,
  hoursUntilExam,
  addMinutes,
} from "../utils/durationCalc.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("student"));

// ── GET /api/student/me ───────────────────────────────────────────────────────
router.get("/me", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res
        .status(404)
        .json({ ok: false, error: "Student profile not found" });
    }

    const me = await getStudentPortalMe(schema, studentProfileId);
    res.json({ ok: true, data: me });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/courses ──────────────────────────────────────────────────
router.get("/courses", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res
        .status(404)
        .json({ ok: false, error: "Student profile not found" });
    }

    const result = await tenantQuery(
      schema,
      `SELECT co.course_id AS id, c.code, t.label AS term_label, co.id AS course_offering_id
       FROM student_course sc
       JOIN course_offering co ON co.id = sc.course_offering_id
       JOIN course c ON c.id = co.course_id
       JOIN term t ON t.id = co.term_id
       WHERE sc.student_profile_id = $1
       ORDER BY t.start_date DESC NULLS LAST, c.code`,
      [studentProfileId],
    );

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/accommodations ──────────────────────────────────────────
router.get("/accommodations", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res
        .status(404)
        .json({ ok: false, error: "Student profile not found" });
    }

    const terms = await getStudentAccommodations(schema, studentProfileId);
    res.json({ ok: true, data: terms });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/accommodation-codes ─────────────────────────────────────
// Returns just the code strings from student_accommodation (counsellor-managed).
// Used by the booking form to compute estimated duration client-side.
router.get("/accommodation-codes", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);
    if (!studentProfileId) {
      return res
        .status(404)
        .json({ ok: false, error: "Student profile not found" });
    }
    const codes = await getStudentAccommodationCodes(schema, studentProfileId);
    res.json({ ok: true, data: codes });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/exam-upload-duration ─────────────────────────────────────
// ?courseId=&examType=&examDate=&examTime= (examTime optional)
// Returns professor's uploaded duration if available, falls back to admin-scheduled duration.
router.get("/exam-upload-duration", async (req, res, next) => {
  try {
    const { courseId, examType, examDate, examTime } = req.query;
    if (!courseId || !examType || !examDate) {
      return res.json({ ok: true, data: null });
    }

    const [profMins, schedResult] = await Promise.all([
      findExamUploadDuration(req.tenantSchema, courseId, examType, examDate, examTime || null),
      tenantQuery(
        req.tenantSchema,
        `SELECT base_duration_mins FROM exam_schedule
         WHERE course_id = $1
           AND exam_date = $2
           AND exam_type = $3
           AND base_duration_mins IS NOT NULL
           AND (exam_time = $4 OR exam_time IS NULL OR $4 IS NULL)
         ORDER BY exam_time NULLS LAST
         LIMIT 1`,
        [courseId, examDate, examType, examTime || null],
      ),
    ]);

    const adminMins = schedResult.rows[0]?.base_duration_mins ?? null;
    // Professor's uploaded duration takes priority over admin-scheduled duration
    const durationMins = profMins ?? adminMins;
    res.json({ ok: true, data: durationMins });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/exam-requests ────────────────────────────────────────────
router.get("/exam-requests", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res
        .status(404)
        .json({ ok: false, error: "Student profile not found" });
    }

    const bookings = await getStudentExamBookings(schema, studentProfileId);
    res.json({ ok: true, data: bookings });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/student/exam-requests ──────────────────────────────────────────
const BookingSchema = z.object({
  courseId: z.string().uuid(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  examTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  examType: z
    .enum([
      "midterm",
      "final",
      "quiz_1",
      "quiz_2",
      "quiz_3",
      "quiz_4",
      "test_1",
      "test_2",
      "test_3",
      "assignment",
      "other",
    ])
    .default("midterm"),
  examDurationMins: z.number().int().min(1).max(600),
  specialMaterialsNote: z.string().max(1000).optional(),
});

router.post("/exam-requests", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res
        .status(404)
        .json({ ok: false, error: "Student profile not found" });
    }

    const body = BookingSchema.parse(req.body);

    // Validate term is still open for bookings
    const termCheck = await tenantQuery(
      schema,
      `SELECT t.end_date, t.label
       FROM student_course sc
       JOIN course_offering co ON co.id = sc.course_offering_id
       JOIN term t ON t.id = co.term_id
       WHERE sc.student_profile_id = $1 AND co.course_id = $2
       LIMIT 1`,
      [studentProfileId, body.courseId],
    );
    if (termCheck.rows.length > 0) {
      const { end_date, label } = termCheck.rows[0];
      if (end_date && new Date(end_date) < new Date()) {
        return res.status(400).json({
          ok: false,
          error: `Exam bookings for ${label} are closed (term ended ${end_date}).`,
        });
      }
    }

    // Validate date is at least 9 days from today
    const earliest = new Date();
    earliest.setDate(earliest.getDate() + 9);
    earliest.setHours(0, 0, 0, 0);
    if (new Date(body.examDate) < earliest) {
      return res
        .status(400)
        .json({
          ok: false,
          error: "Exam must be scheduled at least 9 days in advance",
        });
    }

    // ── Compute duration from accommodations + exam upload (fallback to student input) ─
    const [codes, uploadBaseMins] = await Promise.all([
      getStudentAccommodationCodes(schema, studentProfileId),
      findExamUploadDuration(schema, body.courseId, body.examType, body.examDate, body.examTime),
    ]);
    // Use professor's upload duration if available; otherwise use what the student entered
    const baseMins = uploadBaseMins ?? body.examDurationMins;
    const { extraMins, stbMins, totalMins } = calcStudentDuration(
      baseMins,
      codes,
    );

    // ── 10 PM end-time check ─────────────────────────────────────────────────
    if (body.examTime && totalMins) {
      const [h, m] = body.examTime.split(":").map(Number);
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
          dur: a.duration_mins,
          label: a.course_code,
        })),
        ...existingRequests.map((r) => ({
          start: r.exam_time.slice(0, 5),
          dur: r.computed_duration_mins,
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
      courseId: body.courseId,
      examDate: body.examDate,
      examTime: body.examTime,
      examType: body.examType,
      specialMaterialsNote: body.specialMaterialsNote,
      studentDurationMins: body.examDurationMins,
      baseDurationMins: baseMins,
      extraMins,
      stbMins,
      computedDurationMins: totalMins,
    });

    // ── Check if exam is scheduled for auto-approval (admin schedule OR prof upload) ──
    const [schedResult, uploadResult] = await Promise.all([
      tenantQuery(
        schema,
        `SELECT id FROM exam_schedule
         WHERE course_id = $1
           AND exam_date = $2
           AND (exam_time IS NULL OR $3 IS NULL OR exam_time = $3::time)
           AND auto_approve_enabled = true
         LIMIT 1`,
        [body.courseId, body.examDate, body.examTime || null],
      ),
      tenantQuery(
        schema,
        `SELECT eu.id FROM exam_upload eu
         JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
         WHERE eu.course_id = $1
           AND eud.exam_date = $2
           AND eu.exam_type_label::text = $3
           AND eu.status = 'submitted'
           AND (eud.time_slot IS NULL OR $4 IS NULL OR eud.time_slot = $4::time)
         LIMIT 1`,
        [body.courseId, body.examDate, body.examType, body.examTime || null],
      ),
    ]);

    let autoApproved = false;
    if (schedResult.rows.length > 0 || uploadResult.rows.length > 0) {
      const autoApproveSource = schedResult.rows.length > 0 ? 'schedule' : 'upload';
      await tenantQuery(
        schema,
        `UPDATE exam_booking_request
         SET status = 'professor_approved', updated_at = NOW()
         WHERE id = $1`,
        [id],
      );
      await tenantQuery(
        schema,
        `UPDATE exam_booking_request
         SET status = 'confirmed', confirmed_at = NOW(),
             auto_approve_source = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, autoApproveSource],
      );
      autoApproved = true;
    }

    res.status(201).json({ ok: true, data: { id, autoApproved } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/student/exam-requests/:id ─────────────────────────────────────
router.delete("/exam-requests/:id", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res
        .status(404)
        .json({ ok: false, error: "Student profile not found" });
    }

    // Get exam booking request to check exam datetime and status
    const bookingResult = await tenantQuery(
      schema,
      `SELECT id, exam_date, exam_time, status FROM exam_booking_request WHERE id = $1 AND student_profile_id = $2`,
      [req.params.id, studentProfileId],
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Request not found or doesn't belong to you",
      });
    }

    const booking = bookingResult.rows[0];

    // Only allow cancellation if status is pending
    if (booking.status !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: "Only pending requests can be directly cancelled. For approved/confirmed requests, please submit a cancellation request.",
      });
    }

    // Check 24-hour restriction
    const hoursLeft = hoursUntilExam(booking.exam_date, booking.exam_time);
    if (hoursLeft < 24 && hoursLeft !== Infinity) {
      return res.status(400).json({
        ok: false,
        error: "Cannot cancel within 24 hours of exam start time",
      });
    }

    const cancelled = await cancelExamBookingRequest(
      schema,
      req.params.id,
      studentProfileId,
    );

    if (!cancelled) {
      return res
        .status(404)
        .json({
          ok: false,
          error: "Request not found or already cancelled",
        });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/student/exam-requests/:id/cancellation-request ──────────────────
router.post("/exam-requests/:id/cancellation-request", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { studentReason } = req.body;

    if (!studentReason || studentReason.trim() === "") {
      return res.status(400).json({
        ok: false,
        error: "Cancellation reason is required",
      });
    }

    const studentProfileId = await getStudentProfileId(schema, req.user.id);

    if (!studentProfileId) {
      return res
        .status(404)
        .json({ ok: false, error: "Student profile not found" });
    }

    // Get exam booking request
    const bookingResult = await tenantQuery(
      schema,
      `SELECT ebr.id, ebr.exam_date, ebr.exam_time, ebr.status,
              ebr.course_id, c.code AS course_code, ebr.professor_profile_id
       FROM exam_booking_request ebr
       JOIN course c ON c.id = ebr.course_id
       WHERE ebr.id = $1 AND ebr.student_profile_id = $2`,
      [req.params.id, studentProfileId],
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Request not found or doesn't belong to you",
      });
    }

    const booking = bookingResult.rows[0];

    // Check if status allows cancellation
    if (!['pending', 'professor_approved', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        ok: false,
        error: "Cannot submit cancellation request for this booking status",
      });
    }

    // Check 24-hour restriction
    const hoursLeft = hoursUntilExam(booking.exam_date, booking.exam_time);
    if (hoursLeft < 24 && hoursLeft !== Infinity) {
      return res.status(400).json({
        ok: false,
        error: "Cannot cancel within 24 hours of exam start time",
      });
    }

    // If pending, direct them to use DELETE endpoint instead
    if (booking.status === 'pending') {
      return res.status(400).json({
        ok: false,
        error: "Pending requests can be cancelled directly. Please use the cancel button instead.",
      });
    }

    // Check for existing pending or approved cancellation request
    const existingRequest = await checkExistingCancellationRequest(schema, req.params.id);
    if (existingRequest) {
      return res.status(400).json({
        ok: false,
        error: "A cancellation request is already pending for this exam",
      });
    }

    // Create cancellation request
    const result = await submitCancellationRequest(
      schema,
      req.params.id,
      studentProfileId,
      studentReason.trim(),
    );

    if (!result) {
      return res.status(500).json({
        ok: false,
        error: "Failed to submit cancellation request",
      });
    }

    res.json({
      ok: true,
      data: {
        id: result.id,
        status: result.request_status,
        message: "Cancellation request submitted for admin review",
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/terms ───────────────────────────────────────────────────
router.get("/terms", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT id, label, start_date, end_date, is_active,
              (start_date IS NOT NULL
               AND start_date <= CURRENT_DATE
               AND (end_date IS NULL OR end_date >= CURRENT_DATE)) AS is_current
       FROM term
       WHERE is_active = TRUE
       ORDER BY start_date DESC NULLS LAST, label DESC`,
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/all-accommodation-codes ──────────────────────────────────
router.get("/all-accommodation-codes", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT id, code, label FROM accommodation_code WHERE is_active = TRUE ORDER BY label`,
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/student/renewal-requests ────────────────────────────────────────
router.get("/renewal-requests", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);
    if (!studentProfileId) {
      return res.status(404).json({ ok: false, error: "Student profile not found" });
    }

    const result = await tenantQuery(
      schema,
      `SELECT arr.id, arr.status, arr.notes, arr.counsellor_notes, arr.reviewed_at, arr.created_at,
              t.id AS term_id, t.label AS term_label,
              ARRAY(
                SELECT rra.accommodation_code_id
                FROM renewal_request_accommodation rra
                WHERE rra.renewal_request_id = arr.id
              ) AS requested_code_ids
       FROM accommodation_renewal_request arr
       JOIN term t ON t.id = arr.requested_term_id
       WHERE arr.student_profile_id = $1
       ORDER BY arr.created_at DESC`,
      [studentProfileId],
    );

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/student/renewal-requests ───────────────────────────────────────
router.post("/renewal-requests", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const studentProfileId = await getStudentProfileId(schema, req.user.id);
    if (!studentProfileId) {
      return res.status(404).json({ ok: false, error: "Student profile not found" });
    }

    const { termId, notes, requestedCodeIds } = req.body;
    if (!termId) {
      return res.status(400).json({ ok: false, error: "termId is required" });
    }
    if (!Array.isArray(requestedCodeIds) || requestedCodeIds.length === 0) {
      return res.status(400).json({ ok: false, error: "requestedCodeIds must be a non-empty array" });
    }

    // Ensure term exists
    const termCheck = await tenantQuery(schema, `SELECT id FROM term WHERE id = $1`, [termId]);
    if (!termCheck.rows.length) {
      return res.status(400).json({ ok: false, error: "Term not found" });
    }

    // Duplicate guard: block only if a pending request exists for the same term
    const dupCheck = await tenantQuery(
      schema,
      `SELECT id FROM accommodation_renewal_request
       WHERE student_profile_id = $1 AND requested_term_id = $2 AND status = 'pending'`,
      [studentProfileId, termId],
    );
    if (dupCheck.rows.length) {
      return res.status(409).json({ ok: false, error: "A pending renewal request for this term already exists" });
    }

    const renewalResult = await tenantQuery(
      schema,
      `INSERT INTO accommodation_renewal_request (student_profile_id, requested_term_id, notes)
       VALUES ($1, $2, $3)
       RETURNING id, status, created_at`,
      [studentProfileId, termId, notes?.trim() || null],
    );
    const renewalId = renewalResult.rows[0].id;

    // Insert requested accommodation codes into junction table
    for (const codeId of requestedCodeIds) {
      await tenantQuery(
        schema,
        `INSERT INTO renewal_request_accommodation (renewal_request_id, accommodation_code_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [renewalId, codeId],
      );
    }

    res.status(201).json({ ok: true, data: renewalResult.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
