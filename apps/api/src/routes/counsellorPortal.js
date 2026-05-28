/**
 * Counsellor portal routes
 *
 * GET    /api/counsellor/me
 * GET    /api/counsellor/accommodation-codes
 * GET    /api/counsellor/students?q=
 * GET    /api/counsellor/students/:id
 * GET    /api/counsellor/students/:id/exams
 * POST   /api/counsellor/students/:id/accommodations
 * DELETE /api/counsellor/students/:id/accommodations/:accId
 * GET    /api/counsellor/registrations
 * GET    /api/counsellor/registrations/:id
 * POST   /api/counsellor/registrations/:id/start-review
 * POST   /api/counsellor/registrations/:id/approve
 * POST   /api/counsellor/registrations/:id/reject
 * PATCH  /api/counsellor/registrations/:id/provider-form
 * PATCH  /api/counsellor/registrations/:id/notes
 * POST   /api/counsellor/registrations/:id/attachments
 * DELETE /api/counsellor/registrations/:id/attachments/:attachmentId
 * GET    /api/counsellor/renewal-requests
 * GET    /api/counsellor/renewal-requests/:id
 * POST   /api/counsellor/renewal-requests/:id/approve
 * POST   /api/counsellor/renewal-requests/:id/reject
 */
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { tenantQuery } from "../db/tenantPool.js";
import {
  getCounsellorProfileId,
  listAccommodationCodes,
  searchStudents,
  getStudentDetail,
  getStudentExams,
  getAppointmentAccommodations,
  addStudentAccommodation,
  removeStudentAccommodation,
  listStudentCourses,
  addStudentCourse,
  removeStudentCourse,
} from "../db/queries/counsellor.js";
import {
  listPendingRegistrations,
  getRegistrationRequest,
  markUnderReview,
  approveRegistration,
  rejectRegistration,
  updateProviderFormStatus,
} from "../db/queries/studentRegistration.js";
import { saveFile, deleteFile, generateFilePath, getFileUrl } from "../services/fileStorage.js";

const ATTACHMENT_MIME_ALLOWLIST = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ATTACHMENT_MIME_ALLOWLIST.has(file.mimetype)) {
      return cb(Object.assign(new Error("Only PDF, Word, JPEG, or PNG files are allowed"), { status: 400 }));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(requireAuth);
router.use(requireRole("counsellor", "institution_admin"));

// ── GET /api/counsellor/me ────────────────────────────────────────────────────
router.get("/me", async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const result = await tenantQuery(
      schema,
      `SELECT cp.id, cp.department, cp.created_at,
              u.first_name, u.last_name, u.email
       FROM counsellor_profile cp
       JOIN "user" u ON u.id = cp.user_id
       WHERE cp.user_id = $1`,
      [req.user.id],
    );
    res.json({ profile: result.rows[0] ?? null });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/counsellor/accommodation-codes ───────────────────────────────────
router.get("/accommodation-codes", async (req, res, next) => {
  try {
    const codes = await listAccommodationCodes(req.tenantSchema);
    res.json({ codes });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/counsellor/students?q= ──────────────────────────────────────────
router.get("/students", async (req, res, next) => {
  try {
    const q = (req.query.q ?? "").trim();
    if (!q) return res.json({ students: [] });
    const students = await searchStudents(req.tenantSchema, q);
    res.json({ students });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/counsellor/students/:id ─────────────────────────────────────────
router.get("/students/:id", async (req, res, next) => {
  try {
    const student = await getStudentDetail(req.tenantSchema, req.params.id);
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json({ student });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/counsellor/students/:id/exams ───────────────────────────────────
router.get("/students/:id/exams", async (req, res, next) => {
  try {
    const rows = await getStudentExams(req.tenantSchema, req.params.id);
    const exams = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        accommodations: await getAppointmentAccommodations(
          req.tenantSchema,
          row.appointment_id,
        ),
      })),
    );
    res.json({ exams });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/counsellor/students/:id/courses ─────────────────────────────────
router.get("/students/:id/courses", async (req, res, next) => {
  try {
    const courses = await listStudentCourses(req.tenantSchema, req.params.id);
    res.json({ courses });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/counsellor/students/:id/courses — admin only ────────────────────
const addCourseSchema = z.object({
  courseOfferingId: z.string().uuid(),
});

router.post(
  "/students/:id/courses",
  requireRole("institution_admin"),
  async (req, res, next) => {
    try {
      const parsed = addCourseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const row = await addStudentCourse(req.tenantSchema, {
        studentProfileId:  req.params.id,
        courseOfferingId:  parsed.data.courseOfferingId,
        addedBy:           req.user.id,
      });
      res.status(201).json({ course: row });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "This student is already enrolled in this course offering" });
      }
      next(err);
    }
  },
);

// ── DELETE /api/counsellor/students/:id/courses/:courseOfferingId — admin only ─
router.delete(
  "/students/:id/courses/:courseOfferingId",
  requireRole("institution_admin"),
  async (req, res, next) => {
    try {
      const deleted = await removeStudentCourse(
        req.tenantSchema,
        req.params.id,
        req.params.courseOfferingId,
      );
      if (!deleted) {
        return res.status(404).json({ error: "Course enrollment not found for this student" });
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/counsellor/students/:id/accommodations ─────────────────────────
const addAccSchema = z.object({
  accommodationCodeId: z.string().uuid(),
  termId: z.string().uuid(),
  notes: z.string().max(1000).optional().nullable(),
});

router.post(
  "/students/:id/accommodations",
  requireRole("counsellor", "institution_admin"),
  async (req, res, next) => {
    try {
      const parsed = addAccSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0].message });
      }

      const { accommodationCodeId, termId, notes } = parsed.data;
      const counsellorProfileId = await getCounsellorProfileId(
        req.tenantSchema,
        req.user.id,
      );

      const row = await addStudentAccommodation(req.tenantSchema, {
        studentProfileId: req.params.id,
        counsellorProfileId,
        accommodationCodeId,
        termId,
        notes,
      });

      res.status(201).json({ accommodation: row });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /api/counsellor/students/:id/accommodations/:accId ─────────────────
router.delete(
  "/students/:id/accommodations/:accId",
  requireRole("counsellor", "institution_admin"),
  async (req, res, next) => {
    try {
      const isAdmin = req.user.roles?.includes("institution_admin");
      const counsellorProfileId = isAdmin
        ? null
        : await getCounsellorProfileId(req.tenantSchema, req.user.id);

      const deleted = await removeStudentAccommodation(
        req.tenantSchema,
        req.params.accId,
        counsellorProfileId,
      );

      if (!deleted) {
        return res
          .status(404)
          .json({ error: "Accommodation not found or not yours to remove" });
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/counsellor/registrations ────────────────────────────────────────
router.get("/registrations", async (req, res, next) => {
  try {
    const registrations = await listPendingRegistrations(req.tenantSchema);
    res.json({ registrations });
  } catch (err) { next(err); }
});

// ── GET /api/counsellor/registrations/:id ─────────────────────────────────────
router.get("/registrations/:id", async (req, res, next) => {
  try {
    const registration = await getRegistrationRequest(req.tenantSchema, req.params.id);
    if (!registration) return res.status(404).json({ error: "Registration not found" });
    res.json({ registration });
  } catch (err) { next(err); }
});

// ── POST /api/counsellor/registrations/:id/start-review ──────────────────────
router.post("/registrations/:id/start-review", async (req, res, next) => {
  try {
    await markUnderReview(req.tenantSchema, req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /api/counsellor/registrations/:id/approve ───────────────────────────
const ApproveSchema = z.object({
  termId: z.string().uuid(),
  grantedCodes: z.array(z.object({
    accommodationCodeId: z.string().uuid(),
    notes:     z.string().max(1000).optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
  })).default([]),
});

router.post("/registrations/:id/approve", async (req, res, next) => {
  try {
    const { termId, grantedCodes } = ApproveSchema.parse(req.body);
    // Attach the selected termId to each granted code
    const codesWithTerm = grantedCodes.map(g => ({ ...g, termId }));
    await approveRegistration(req.tenantSchema, req.params.id, {
      reviewedBy:  req.user.id,
      grantedCodes: codesWithTerm,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /api/counsellor/registrations/:id/reject ─────────────────────────────
const RejectSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required").max(2000),
});

router.post("/registrations/:id/reject", async (req, res, next) => {
  try {
    const { reason } = RejectSchema.parse(req.body);
    await rejectRegistration(req.tenantSchema, req.params.id, {
      reviewedBy: req.user.id,
      reason,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PATCH /api/counsellor/registrations/:id/provider-form ─────────────────────
const ProviderFormSchema = z.object({
  status: z.enum(["received", "waived"]),
});

router.patch("/registrations/:id/provider-form", async (req, res, next) => {
  try {
    const { status } = ProviderFormSchema.parse(req.body);
    await updateProviderFormStatus(req.tenantSchema, req.params.id, status);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/counsellor/courses/:courseId/professor ──────────────────────────
router.get("/courses/:courseId/professor", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         pp.id, pp.department, pp.phone, pp.office,
         u.first_name, u.last_name, u.email,
         t.label AS term, cd.preferred_delivery, cd.typical_materials,
         cd.notes, c.code AS course_code
       FROM course_dossier cd
       JOIN course_offering co ON co.id = cd.course_offering_id
       JOIN course c ON c.id = co.course_id
       JOIN term t ON t.id = co.term_id
       JOIN professor_profile pp ON pp.id = cd.professor_id
       JOIN "user" u ON u.id = pp.user_id
       WHERE co.course_id = $1
       ORDER BY t.start_date DESC NULLS LAST
       LIMIT 1`,
      [req.params.courseId],
    );
    if (!result.rows.length) {
      return res.json({ professor: null });
    }
    res.json({ professor: result.rows[0] });
  } catch (err) { next(err); }
});

// ── GET /api/counsellor/students/:id/exam-requests ───────────────────────────
router.get("/students/:id/exam-requests", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         ebr.id, ebr.course_id, c.code AS course_code,
         ebr.exam_date, ebr.exam_time,
         ebr.exam_type, ebr.special_materials_note, ebr.status,
         ebr.rejection_reason, ebr.confirmed_at, ebr.created_at,
         ebr.base_duration_mins, ebr.extra_mins, ebr.stb_mins,
         ebr.computed_duration_mins
       FROM exam_booking_request ebr
       JOIN course c ON c.id = ebr.course_id
       WHERE ebr.student_profile_id = $1
       ORDER BY ebr.exam_date ASC, ebr.created_at ASC`,
      [req.params.id],
    );
    res.json({ examRequests: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/counsellor/exam-requests ────────────────────────────────────────
router.get("/exam-requests", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         ebr.id, ebr.course_id, c.code AS course_code,
         ebr.exam_date, ebr.exam_time,
         ebr.exam_type, ebr.special_materials_note, ebr.status,
         ebr.confirmed_at, ebr.created_at,
         u.first_name, u.last_name, u.email,
         sp.student_number
       FROM exam_booking_request ebr
       JOIN course c ON c.id = ebr.course_id
       JOIN student_profile sp ON sp.id = ebr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       WHERE ebr.status = 'professor_approved'
       ORDER BY ebr.exam_date ASC, ebr.created_at ASC`,
    );
    res.json({ examRequests: result.rows });
  } catch (err) { next(err); }
});

// ── PATCH /api/counsellor/exam-requests/:id/confirm ──────────────────────────
router.patch("/exam-requests/:id/confirm", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE exam_booking_request
       SET status = 'confirmed', confirmed_by = $2, confirmed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'professor_approved'
       RETURNING id`,
      [req.params.id, req.user.id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Request not found or already actioned" });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PATCH /api/counsellor/exam-requests/:id/cancel ───────────────────────────
router.patch("/exam-requests/:id/cancel", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE exam_booking_request
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status = 'professor_approved'
       RETURNING id, course_id, exam_date, exam_time, professor_profile_id,
                 (SELECT first_name || ' ' || last_name FROM "user" u
                  JOIN student_profile sp ON sp.user_id = u.id
                  WHERE sp.id = exam_booking_request.student_profile_id) AS student_name`,
      [req.params.id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Request not found or already actioned" });
    }

    const row = result.rows[0];
    // Resolve course code for notification message
    const courseRow = await tenantQuery(
      req.tenantSchema,
      `SELECT code FROM course WHERE id = $1`,
      [row.course_id],
    );
    const course_code = courseRow.rows[0]?.code ?? row.course_id;
    const { professor_profile_id, student_name, exam_date, exam_time } = row;
    if (professor_profile_id) {
      const dateStr = new Date(exam_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = exam_time ? ` at ${exam_time.slice(0, 5)}` : '';
      tenantQuery(
        req.tenantSchema,
        `INSERT INTO upload_notification (professor_profile_id, type, message)
         VALUES ($1, 'booking_cancelled', $2)`,
        [professor_profile_id,
          `${student_name ?? 'A student'}'s booking for ${course_code} on ${dateStr}${timeStr} has been cancelled by the accommodation centre.`],
      ).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/counsellor/registrations/:id/notes — save/update counsellor internal notes
router.patch('/registrations/:id/notes', async (req, res, next) => {
  try {
    const { notes } = req.body;
    await tenantQuery(
      req.tenantSchema,
      `UPDATE student_registration_request
       SET counsellor_notes = $1, updated_at = NOW()
       WHERE id = $2`,
      [notes ?? null, req.params.id],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/counsellor/registrations/:id/attachments — upload a supporting document
router.post('/registrations/:id/attachments', attachmentUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storagePath = generateFilePath(req.tenantSchema, req.params.id, req.file.originalname)
      .replace(/^[^/]+\//, `${req.tenantSchema}/registrations/`);
    await saveFile(req.file.buffer, storagePath);

    const result = await tenantQuery(
      req.tenantSchema,
      `INSERT INTO registration_attachment
         (registration_id, file_path, original_name, file_size, mime_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_path, original_name, file_size, mime_type, created_at`,
      [req.params.id, storagePath, req.file.originalname, req.file.size, req.file.mimetype, req.user.id],
    );

    const att = result.rows[0];
    res.status(201).json({ ok: true, attachment: { ...att, url: getFileUrl(att.file_path) } });
  } catch (err) { next(err); }
});

// DELETE /api/counsellor/registrations/:id/attachments/:attachmentId
router.delete('/registrations/:id/attachments/:attachmentId', async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `DELETE FROM registration_attachment
       WHERE id = $1 AND registration_id = $2
       RETURNING file_path`,
      [req.params.attachmentId, req.params.id],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Attachment not found' });
    await deleteFile(result.rows[0].file_path);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/counsellor/renewal-requests?status= ─────────────────────────────
router.get('/renewal-requests', async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const status = req.query.status ?? 'pending';
    const result = await tenantQuery(
      schema,
      `SELECT arr.id, arr.status, arr.notes, arr.counsellor_notes, arr.reviewed_at, arr.created_at,
              t.id AS term_id, t.label AS term_label,
              u.first_name, u.last_name, u.email, sp.student_number
       FROM accommodation_renewal_request arr
       JOIN student_profile sp ON sp.id = arr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       JOIN term t ON t.id = arr.requested_term_id
       WHERE arr.status = $1
       ORDER BY arr.created_at ASC`,
      [status],
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/counsellor/renewal-requests/:id ─────────────────────────────────
router.get('/renewal-requests/:id', async (req, res, next) => {
  try {
    const schema = req.tenantSchema;

    const reqResult = await tenantQuery(
      schema,
      `SELECT arr.id, arr.status, arr.notes, arr.counsellor_notes, arr.reviewed_at, arr.created_at,
              arr.student_profile_id,
              t.id AS term_id, t.label AS term_label,
              t.start_date AS term_start_date, t.end_date AS term_end_date,
              (t.start_date IS NOT NULL
               AND t.start_date <= CURRENT_DATE
               AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)) AS is_current_term,
              u.first_name, u.last_name, u.email, sp.student_number
       FROM accommodation_renewal_request arr
       JOIN student_profile sp ON sp.id = arr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       JOIN term t ON t.id = arr.requested_term_id
       WHERE arr.id = $1`,
      [req.params.id],
    );
    if (!reqResult.rows.length) return res.status(404).json({ ok: false, error: 'Renewal request not found' });

    const row = reqResult.rows[0];
    const isFutureTerm = !row.is_current_term;

    const [requestedCodesResult, contextAccomResult, allCodesResult] = await Promise.all([
      // What the student selected in their renewal request
      tenantQuery(
        schema,
        `SELECT rra.accommodation_code_id, ac.code, ac.label
         FROM renewal_request_accommodation rra
         JOIN accommodation_code ac ON ac.id = rra.accommodation_code_id
         WHERE rra.renewal_request_id = $1
         ORDER BY ac.label`,
        [req.params.id],
      ),
      isFutureTerm
        // Future: prefer existing grants for this future term (re-request), else fall back to most recent past-term
        ? tenantQuery(
            schema,
            `SELECT DISTINCT ON (ac.id) sa.accommodation_code_id, sa.notes AS granted_notes,
                    ac.code, ac.label,
                    t.id AS term_id, t.label AS term_label
             FROM student_accommodation sa
             JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
             JOIN term t ON t.id = sa.term_id
             WHERE sa.student_profile_id = $1
               AND sa.is_active = TRUE
               AND (
                 sa.term_id = $2
                 OR (sa.term_id != $2 AND (t.start_date IS NULL OR t.start_date < $3))
               )
             ORDER BY ac.id,
               (sa.term_id = $2)::int DESC,
               t.start_date DESC NULLS LAST`,
            [row.student_profile_id, row.term_id, row.term_start_date],
          )
        // Current: this term's active grants
        : tenantQuery(
            schema,
            `SELECT sa.accommodation_code_id, sa.notes AS granted_notes,
                    ac.code, ac.label
             FROM student_accommodation sa
             JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
             WHERE sa.student_profile_id = $1
               AND sa.term_id = $2
               AND sa.is_active = TRUE
             ORDER BY ac.label`,
            [row.student_profile_id, row.term_id],
          ),
      // All active codes for additional-accommodation picker
      tenantQuery(
        schema,
        `SELECT id, code, label FROM accommodation_code WHERE is_active = TRUE ORDER BY label`,
      ),
    ]);

    // For future-term re-requests: contextAccommodations may include grants for this future term itself
    const isReRequest = isFutureTerm && contextAccomResult.rows.some((r) => r.term_id === row.term_id);

    res.json({
      ok: true,
      data: {
        ...row,
        isFutureTerm,
        isReRequest,
        requestedCodes: requestedCodesResult.rows,
        contextAccommodations: contextAccomResult.rows,
        allCodes: allCodesResult.rows,
      },
    });
  } catch (err) { next(err); }
});

// ── POST /api/counsellor/renewal-requests/:id/approve ────────────────────────
router.post('/renewal-requests/:id/approve', async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { grantedCodes } = req.body; // [{ accommodationCodeId, notes }]

    if (!Array.isArray(grantedCodes) || grantedCodes.length === 0) {
      return res.status(400).json({ ok: false, error: 'grantedCodes must be a non-empty array' });
    }

    const reqResult = await tenantQuery(
      schema,
      `SELECT arr.id, arr.status, arr.student_profile_id, arr.requested_term_id,
              (t.start_date IS NOT NULL
               AND t.start_date <= CURRENT_DATE
               AND (t.end_date IS NULL OR t.end_date >= CURRENT_DATE)) AS is_current_term,
              cp.id AS counsellor_profile_id
       FROM accommodation_renewal_request arr
       JOIN term t ON t.id = arr.requested_term_id
       CROSS JOIN (SELECT id FROM counsellor_profile WHERE user_id = $2 LIMIT 1) cp
       WHERE arr.id = $1`,
      [req.params.id, req.user.id],
    );
    if (!reqResult.rows.length) return res.status(404).json({ ok: false, error: 'Renewal request not found' });

    const { status, student_profile_id, requested_term_id, is_current_term, counsellor_profile_id } = reqResult.rows[0];
    if (status !== 'pending') {
      return res.status(409).json({ ok: false, error: 'Request is no longer pending' });
    }

    // Upsert all granted codes — named constraint avoids schema-resolution ambiguity
    for (const { accommodationCodeId, notes } of grantedCodes) {
      await tenantQuery(
        schema,
        `INSERT INTO student_accommodation
           (student_profile_id, accommodation_code_id, term_id, notes, source, counsellor_profile_id, is_active)
         VALUES ($1, $2, $3, $4, 'granted', $5, TRUE)
         ON CONFLICT ON CONSTRAINT uq_student_accommodation_term
         DO UPDATE SET is_active = TRUE, source = 'granted', notes = EXCLUDED.notes,
                       counsellor_profile_id = EXCLUDED.counsellor_profile_id,
                       updated_at = NOW()`,
        [student_profile_id, accommodationCodeId, requested_term_id, notes?.trim() || null, counsellor_profile_id],
      );
    }

    // For current-term requests: deactivate any existing grants the counsellor unchecked
    if (is_current_term) {
      const grantedIds = grantedCodes.map(c => c.accommodationCodeId);
      await tenantQuery(
        schema,
        `UPDATE student_accommodation
         SET is_active = FALSE, updated_at = NOW()
         WHERE student_profile_id = $1
           AND term_id = $2
           AND is_active = TRUE
           AND NOT (accommodation_code_id = ANY($3::uuid[]))`,
        [student_profile_id, requested_term_id, grantedIds],
      );
    }

    await tenantQuery(
      schema,
      `UPDATE accommodation_renewal_request
       SET status = 'approved', counsellor_profile_id = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, counsellor_profile_id],
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /api/counsellor/renewal-requests/:id/reject ─────────────────────────
router.post('/renewal-requests/:id/reject', async (req, res, next) => {
  try {
    const schema = req.tenantSchema;
    const { reason } = req.body;

    const reqResult = await tenantQuery(
      schema,
      `SELECT arr.id, arr.status,
              cp.id AS counsellor_profile_id
       FROM accommodation_renewal_request arr
       CROSS JOIN (SELECT id FROM counsellor_profile WHERE user_id = $2 LIMIT 1) cp
       WHERE arr.id = $1`,
      [req.params.id, req.user.id],
    );
    if (!reqResult.rows.length) return res.status(404).json({ ok: false, error: 'Renewal request not found' });

    const { status, counsellor_profile_id } = reqResult.rows[0];
    if (status !== 'pending') {
      return res.status(409).json({ ok: false, error: 'Request is no longer pending' });
    }

    await tenantQuery(
      schema,
      `UPDATE accommodation_renewal_request
       SET status = 'rejected', counsellor_profile_id = $2, counsellor_notes = $3,
           reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, counsellor_profile_id, reason?.trim() || null],
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/counsellor/terms — active terms (for accommodation granting, student side panel, etc.)
router.get('/terms', async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT id, label, start_date, end_date, is_active
       FROM term
       WHERE is_active = TRUE
       ORDER BY start_date DESC NULLS LAST, label DESC`,
    );
    res.json({ ok: true, terms: result.rows });
  } catch (err) { next(err); }
});

export default router;
