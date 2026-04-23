/**
 * Professor portal routes
 *
 * GET  /api/portal/me                   Professor's own profile + stats
 * GET  /api/portal/uploads              List all uploads
 * POST /api/portal/uploads              Create a new upload (draft)
 * GET  /api/portal/uploads/:id          Get one upload
 * PUT  /api/portal/uploads/:id          Update a draft upload
 * POST /api/portal/uploads/:id/submit   Submit a draft
 * POST /api/portal/uploads/:id/dates    Add a date
 * DELETE /api/portal/uploads/:id/dates/:dateId  Remove a date
 * GET  /api/portal/reuse                Pending reuse requests
 * POST /api/portal/reuse/:id/respond    Approve or deny a reuse request
 * GET  /api/portal/notifications        Get notifications
 * POST /api/portal/notifications/read   Mark all as read
 */
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import {
  getProfessorProfileId,
  listUploadsForProfessor,
  getUpload,
  createUpload,
  updateUpload,
  submitUpload,
  addUploadDate,
  removeUploadDate,
  getPendingReuseRequests,
  respondToReuseRequest,
  getProfessorNotifications,
  markNotificationsRead,
  getAllowedCoursesForProfessor,
  updateUploadFile,
  getUploadFileInfo,
} from "../db/queries/examUploads.js";
import { tenantQuery } from "../db/tenantPool.js";
import { matchUpload } from "../services/matchingEngine.js";
import { persistUploadDossier } from "../services/dossierService.js";
import {
  saveFile,
  generateFilePath,
  readFileFromStorage,
  getFileUrl,
} from "../services/fileStorage.js";
import { logger } from "../utils/logger.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("professor", "institution_admin", "lead"));

// Multer config for file uploads - memory storage (we'll save to disk manually)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(
        Object.assign(new Error("Only PDF files are allowed"), { status: 400 }),
      );
    }
    cb(null, true);
  },
});

const WORD_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

// Combined multer — accepts PDF and Word docs (used for multi-file endpoint)
const uploadCombined = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf" && !WORD_MIMES.has(file.mimetype)) {
      return cb(
        Object.assign(new Error("Only PDF or Word document files are allowed"), { status: 400 }),
      );
    }
    cb(null, true);
  },
});

const EXAM_TYPES = [
  "midterm",
  "endterm",
  "tutorial",
  "lab",
  "quiz",
  "assignment",
  "other",
];
const DELIVERIES = ["pickup", "dropped", "delivery", "pending", "file_upload"];

const createUploadSchema = z.object({
  courseCode:        z.string().min(1).max(50).trim().toUpperCase(),
  examTypeLabel:     z.enum(EXAM_TYPES),
  versionLabel:      z.string().max(100).optional().nullable(),
  delivery:          z.enum(DELIVERIES).default("pending"),
  materials:         z.string().max(500).optional().nullable(),
  password:          z.string().max(200).optional().nullable(),
  rwgFlag:           z.boolean().default(false),
  isMakeup:          z.boolean().default(false),
  makeupNotes:       z.string().max(500).optional().nullable(),
  estimatedCopies:   z.number().int().min(1).optional().nullable(),
  isWordDoc:             z.boolean().default(false),
  examDurationMins:      z.number().int().min(1).max(600).optional().nullable(),
  examFormat:            z.enum(['crowdmark', 'paper', 'brightspace']).optional().nullable(),
  bookletType:           z.enum(['engineering_booklet', 'essay_booklet', 'not_needed']).optional().nullable(),
  scantronNeeded:        z.enum(['not_needed', 'purple', 'green']).optional().nullable(),
  calculatorType:        z.enum(['scientific', 'non_programmable', 'financial', 'basic', 'none']).optional().nullable(),
  studentInstructions:   z.string().max(1000).optional().nullable(),
  examCollectionMethod:  z.enum(['delivery', 'pickup_mah', 'pickup_sexton']).optional().nullable(),
}).superRefine((data, ctx) => {
  if (!data.isWordDoc) {
    if (data.examDurationMins == null) ctx.addIssue({ code: "custom", path: ["examDurationMins"], message: "Required" });
    if (data.examFormat == null)        ctx.addIssue({ code: "custom", path: ["examFormat"],        message: "Required" });
    if (data.bookletType == null)       ctx.addIssue({ code: "custom", path: ["bookletType"],       message: "Required" });
    if (data.scantronNeeded == null)    ctx.addIssue({ code: "custom", path: ["scantronNeeded"],    message: "Required" });
    if (data.calculatorType == null)    ctx.addIssue({ code: "custom", path: ["calculatorType"],    message: "Required" });
    if (data.examCollectionMethod == null) ctx.addIssue({ code: "custom", path: ["examCollectionMethod"], message: "Required" });
  }
});

const addDateSchema = z.object({
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlot: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional()
    .nullable(),
});

const respondSchema = z.object({
  status: z.enum(["approved", "denied"]),
  professorNote: z.string().max(500).optional().nullable(),
});

// ── Helper: get and verify professor profile ──────────────────────────────────
async function getProfId(req, res) {
  let profId = await getProfessorProfileId(req.tenantSchema, req.user.id);

  // Auto-create professor_profile if missing — happens when professor
  // claimed their account but no profile row was created yet
  if (!profId) {
    try {
      const result = await tenantQuery(
        req.tenantSchema,
        `INSERT INTO professor_profile (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING id`,
        [req.user.id],
      );
      // Also ensure professor role exists
      await tenantQuery(
        req.tenantSchema,
        `INSERT INTO user_role (user_id, role)
         VALUES ($1, 'professor')
         ON CONFLICT (user_id, role) DO NOTHING`,
        [req.user.id],
      );
      profId = result.rows[0]?.id ?? null;
    } catch (err) {
      res
        .status(403)
        .json({ ok: false, error: "Could not resolve professor profile" });
      return null;
    }
  }

  return profId;
}

async function ensureCourseAllowed(schema, professorProfileId, courseCode) {
  const allowed = await getAllowedCoursesForProfessor(
    schema,
    professorProfileId,
  );
  if (!allowed.includes(courseCode.toUpperCase())) {
    throw Object.assign(
      new Error(
        `Course '${courseCode}' is not assigned to your profile. Contact your lead to assign it.`,
      ),
      { status: 400 },
    );
  }
}

// ── GET /api/portal/me ────────────────────────────────────────────────────────
router.get("/me", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const [profileResult, statsResult, notifResult, requestsResult, missingResult, dropoffResult, upcomingResult, reuseResult, studentsResult, rwgResult, nextExamsResult] = await Promise.all([
      tenantQuery(
        req.tenantSchema,
        `SELECT pp.id, pp.department, pp.phone, pp.office,
                u.first_name, u.last_name, u.email
         FROM professor_profile pp
         JOIN "user" u ON u.id = pp.user_id
         WHERE pp.id = $1`,
        [profId],
      ),
      tenantQuery(
        req.tenantSchema,
        `SELECT
           COUNT(*) FILTER (WHERE status = 'submitted')  AS submitted,
           COUNT(*) FILTER (WHERE status = 'draft')      AS drafts,
           COUNT(DISTINCT course_code)                   AS courses
         FROM exam_upload WHERE professor_profile_id = $1`,
        [profId],
      ),
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(*) AS unread
         FROM upload_notification
         WHERE professor_profile_id = $1 AND is_read = FALSE`,
        [profId],
      ),
      // Pending exam booking requests waiting for professor approval
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(*) AS pending_requests
         FROM exam_booking_request ebr
         WHERE ebr.status = 'pending'
           AND (
             ebr.professor_profile_id = $1
             OR EXISTS (
               SELECT 1 FROM course_dossier cd
               WHERE UPPER(cd.course_code) = UPPER(ebr.course_code)
                 AND cd.professor_id = $1
             )
           )`,
        [profId],
      ),
      // Course+date combos with confirmed students but no submitted exam upload
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(*) AS missing_uploads
         FROM (
           SELECT UPPER(ebr.course_code) AS course_code,
                  ebr.exam_date::text    AS exam_date,
                  ebr.exam_type
           FROM exam_booking_request ebr
           WHERE ebr.status IN ('professor_approved', 'confirmed')
             AND ebr.exam_date >= CURRENT_DATE
             AND (
               ebr.professor_profile_id = $1
               OR EXISTS (
                 SELECT 1 FROM course_dossier cd
                 WHERE UPPER(cd.course_code) = UPPER(ebr.course_code)
                   AND cd.professor_id = $1
               )
             )
           GROUP BY UPPER(ebr.course_code), ebr.exam_date::text, ebr.exam_type
         ) bookings
         WHERE NOT EXISTS (
           SELECT 1 FROM exam_upload eu
           JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
           WHERE eu.status = 'submitted'
             AND UPPER(eu.course_code) = bookings.course_code
             AND eud.exam_date::text = bookings.exam_date
             AND eu.exam_type_label   = bookings.exam_type
             AND (
               eu.professor_profile_id = $1
               OR EXISTS (
                 SELECT 1 FROM course_dossier cd
                 WHERE UPPER(cd.course_code) = UPPER(eu.course_code)
                   AND cd.professor_id = $1
               )
             )
         )`,
        [profId],
      ),
      // Exams dropped off but not yet confirmed by accessibility centre
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(*) AS pending_dropoffs
         FROM exam_upload
         WHERE professor_profile_id = $1
           AND delivery = 'dropped'
           AND dropoff_confirmed_at IS NULL
           AND status = 'submitted'`,
        [profId],
      ),
      // Upcoming submitted exams (future dates)
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(DISTINCT eu.id) AS upcoming_exams
         FROM exam_upload eu
         JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
         WHERE eu.status = 'submitted'
           AND eud.exam_date >= CURRENT_DATE
           AND (
             eu.professor_profile_id = $1
             OR EXISTS (
               SELECT 1 FROM course_dossier cd
               WHERE UPPER(cd.course_code) = UPPER(eu.course_code)
                 AND cd.professor_id = $1
             )
           )`,
        [profId],
      ),
      // Pending reuse requests
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(*) AS reuse_count
         FROM exam_reuse_request err
         JOIN exam_upload eu ON eu.id = err.original_upload_id
         WHERE eu.professor_profile_id = $1
           AND err.status = 'pending'`,
        [profId],
      ),
      // Total distinct confirmed students with upcoming exams
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(DISTINCT ebr.student_profile_id) AS total_students
         FROM exam_booking_request ebr
         WHERE ebr.status IN ('confirmed', 'professor_approved')
           AND ebr.exam_date >= CURRENT_DATE
           AND (
             ebr.professor_profile_id = $1
             OR EXISTS (
               SELECT 1 FROM course_dossier cd
               WHERE UPPER(cd.course_code) = UPPER(ebr.course_code)
                 AND cd.professor_id = $1
             )
           )`,
        [profId],
      ),
      // RWG students with upcoming exams
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(DISTINCT ebr.student_profile_id) AS rwg_students
         FROM exam_booking_request ebr
         JOIN student_accommodation sa ON sa.student_profile_id = ebr.student_profile_id
         JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
         WHERE ac.triggers_rwg_flag = true
           AND ebr.status IN ('confirmed', 'professor_approved')
           AND ebr.exam_date >= CURRENT_DATE
           AND (
             ebr.professor_profile_id = $1
             OR EXISTS (
               SELECT 1 FROM course_dossier cd
               WHERE UPPER(cd.course_code) = UPPER(ebr.course_code)
                 AND cd.professor_id = $1
             )
           )`,
        [profId],
      ),
      // Next 5 upcoming exam date slots with student counts + upload status
      tenantQuery(
        req.tenantSchema,
        `SELECT
           UPPER(ebr.course_code)                    AS course_code,
           ebr.exam_date::text                       AS exam_date,
           ebr.exam_time::text                       AS exam_time,
           ebr.exam_type                             AS exam_type,
           COUNT(DISTINCT ebr.student_profile_id)    AS student_count,
           EXISTS (
             SELECT 1 FROM exam_upload eu2
             JOIN exam_upload_date eud2 ON eud2.exam_upload_id = eu2.id
             WHERE eu2.status = 'submitted'
               AND UPPER(eu2.course_code) = UPPER(ebr.course_code)
               AND eud2.exam_date::text  = ebr.exam_date::text
               AND eu2.exam_type_label   = ebr.exam_type
               AND (
                 eu2.professor_profile_id = $1
                 OR EXISTS (
                   SELECT 1 FROM course_dossier cd
                   WHERE UPPER(cd.course_code) = UPPER(eu2.course_code)
                     AND cd.professor_id = $1
                 )
               )
           ) AS uploaded
         FROM exam_booking_request ebr
         WHERE ebr.status IN ('confirmed', 'professor_approved')
           AND ebr.exam_date >= CURRENT_DATE
           AND (
             ebr.professor_profile_id = $1
             OR EXISTS (
               SELECT 1 FROM course_dossier cd
               WHERE UPPER(cd.course_code) = UPPER(ebr.course_code)
                 AND cd.professor_id = $1
             )
           )
         GROUP BY UPPER(ebr.course_code), ebr.exam_date::text, ebr.exam_time::text, ebr.exam_type
         ORDER BY ebr.exam_date ASC, ebr.exam_time ASC NULLS LAST
         LIMIT 5`,
        [profId],
      ),
    ]);

    res.json({
      ok: true,
      profile: profileResult.rows[0],
      stats: {
        ...statsResult.rows[0],
        pendingRequests: parseInt(requestsResult.rows[0].pending_requests),
        missingUploads:  parseInt(missingResult.rows[0].missing_uploads),
        pendingDropoffs: parseInt(dropoffResult.rows[0].pending_dropoffs),
        upcomingExams:   parseInt(upcomingResult.rows[0].upcoming_exams),
        reuseCount:      parseInt(reuseResult.rows[0].reuse_count),
        totalStudents:   parseInt(studentsResult.rows[0].total_students),
        rwgStudents:     parseInt(rwgResult.rows[0].rwg_students),
      },
      unread:     parseInt(notifResult.rows[0].unread),
      nextExams:  nextExamsResult.rows.map(r => ({
        courseCode:   r.course_code,
        examDate:     r.exam_date,
        examTime:     r.exam_time,
        examType:     r.exam_type,
        studentCount: parseInt(r.student_count),
        uploaded:     r.uploaded,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/portal/courses ──────────────────────────────────────────────────
router.get("/courses", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const courses = await getAllowedCoursesForProfessor(
      req.tenantSchema,
      profId,
    );
    res.json({ ok: true, courses });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/portal/my-dossiers ──────────────────────────────────────────────
// Read-only view of the dossier entries a lead has built for this professor
router.get("/my-dossiers", async (req, res, next) => {
  try {
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         cd.id, cd.course_code, cd.term, cd.preferred_delivery,
         cd.typical_materials, cd.password_reminder, cd.notes,
         cd.updated_at,
         u.first_name || ' ' || u.last_name AS last_updated_by_name
       FROM course_dossier cd
       JOIN professor_profile pp ON pp.id = cd.professor_id
       LEFT JOIN "user" u ON u.id = cd.last_updated_by
       WHERE pp.user_id = $1
       ORDER BY cd.term DESC, UPPER(cd.course_code)`,
      [req.user.id],
    );
    res.json({ ok: true, dossiers: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/portal/uploads ───────────────────────────────────────────────────
router.get("/uploads", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const uploads = await listUploadsForProfessor(req.tenantSchema, profId);
    res.json({ ok: true, uploads });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/portal/uploads ──────────────────────────────────────────────────
router.post("/uploads", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const data = createUploadSchema.parse(req.body);
    if (!data.isWordDoc) {
      await ensureCourseAllowed(req.tenantSchema, profId, data.courseCode);
    }
    const uploadId = await createUpload(req.tenantSchema, {
      professorProfileId:  profId,
      courseCode:          data.courseCode,
      examTypeLabel:       data.examTypeLabel,
      versionLabel:        data.versionLabel,
      delivery:            data.delivery,
      materials:           data.materials,
      password:            data.password,
      rwgFlag:             data.rwgFlag,
      isMakeup:            data.isMakeup,
      makeupNotes:         data.makeupNotes,
      estimatedCopies:     data.estimatedCopies,
      isWordDoc:           data.isWordDoc,
      examDurationMins:    data.examDurationMins,
      examFormat:          data.examFormat,
      bookletType:         data.bookletType,
      scantronNeeded:      data.scantronNeeded,
      calculatorType:      data.calculatorType,
      studentInstructions: data.studentInstructions,
      examCollectionMethod: data.examCollectionMethod,
    });

    await persistUploadDossier(req.tenantSchema, uploadId, req.user.id);

    res.status(201).json({ ok: true, uploadId });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/portal/uploads/:id ───────────────────────────────────────────────
router.get("/uploads/:id", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const upload = await getUpload(req.tenantSchema, req.params.id, profId);
    if (!upload)
      return res.status(404).json({ ok: false, error: "Upload not found" });

    res.json({ ok: true, upload });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/portal/uploads/:id ───────────────────────────────────────────────
router.put("/uploads/:id", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    // Lock editing once the earliest exam date+time has passed (exam has started)
    const datesResult = await tenantQuery(
      req.tenantSchema,
      `SELECT exam_date, time_slot
       FROM exam_upload_date
       WHERE exam_upload_id = $1
       ORDER BY exam_date ASC, time_slot ASC NULLS LAST
       LIMIT 1`,
      [req.params.id],
    );
    const earliest = datesResult.rows[0];
    if (earliest) {
      const dateStr = new Date(earliest.exam_date).toISOString().split("T")[0];
      const examStart = earliest.time_slot
        ? new Date(`${dateStr}T${earliest.time_slot}`)
        : new Date(`${dateStr}T00:00:00`);
      if (examStart <= new Date()) {
        return res.status(403).json({
          ok: false,
          error: "This exam can no longer be edited — it has already started.",
        });
      }
    }

    const data = createUploadSchema.partial().parse(req.body);
    const dbFields = {};
    if (data.courseCode !== undefined) {
      await ensureCourseAllowed(req.tenantSchema, profId, data.courseCode);
      dbFields.course_code = data.courseCode;
    }
    if (data.examTypeLabel !== undefined)
      dbFields.exam_type_label = data.examTypeLabel;
    if (data.versionLabel !== undefined)
      dbFields.version_label = data.versionLabel;
    if (data.delivery !== undefined) dbFields.delivery = data.delivery;
    if (data.materials !== undefined) dbFields.materials = data.materials;
    if (data.password !== undefined) dbFields.password = data.password;
    if (data.rwgFlag !== undefined)           dbFields.rwg_flag           = data.rwgFlag;
    if (data.isMakeup !== undefined)          dbFields.is_makeup          = data.isMakeup;
    if (data.makeupNotes !== undefined)       dbFields.makeup_notes       = data.makeupNotes;
    if (data.estimatedCopies !== undefined)      dbFields.estimated_copies      = data.estimatedCopies;
    if (data.examDurationMins !== undefined)     dbFields.exam_duration_mins     = data.examDurationMins;
    if (data.examFormat !== undefined)           dbFields.exam_format            = data.examFormat;
    if (data.bookletType !== undefined)          dbFields.booklet_type           = data.bookletType;
    if (data.scantronNeeded !== undefined)       dbFields.scantron_needed        = data.scantronNeeded;
    if (data.calculatorType !== undefined)       dbFields.calculator_type        = data.calculatorType;
    if (data.studentInstructions !== undefined)  dbFields.student_instructions   = data.studentInstructions;
    if (data.examCollectionMethod !== undefined) dbFields.exam_collection_method = data.examCollectionMethod;

    await updateUpload(req.tenantSchema, req.params.id, profId, dbFields);
    await persistUploadDossier(req.tenantSchema, req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/portal/uploads/:id/dropoff ────────────────────────────────────
// Lead-only: record copies received and notes for a drop-off submission
router.patch(
  "/uploads/:id/dropoff",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const { copiesReceived, leadNotes } = z
        .object({
          copiesReceived: z.number().int().min(0).nullable().optional(),
          leadNotes: z.string().max(1000).nullable().optional(),
        })
        .parse(req.body);

      await tenantQuery(
        req.tenantSchema,
        `UPDATE exam_upload
         SET copies_received = COALESCE($2, copies_received),
             lead_notes      = COALESCE($3, lead_notes),
             updated_at      = NOW()
         WHERE id = $1`,
        [req.params.id, copiesReceived ?? null, leadNotes ?? null],
      );

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/portal/uploads/:id/submit ──────────────────────────────────────
router.post("/uploads/:id/submit", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    // Check if upload requires a file
    const uploadResult = await tenantQuery(
      req.tenantSchema,
      `SELECT delivery, file_path FROM exam_upload WHERE id = $1 AND professor_profile_id = $2`,
      [req.params.id, profId],
    );
    const upload = uploadResult.rows[0];

    // Validate file upload requirement
    if (upload?.delivery === "file_upload" && !upload?.file_path) {
      return res.status(400).json({
        ok: false,
        error: "Please upload the exam file before submitting",
      });
    }

    await submitUpload(req.tenantSchema, req.params.id, profId);
    await persistUploadDossier(req.tenantSchema, req.params.id, req.user.id);

    // Run matching engine asynchronously — don't block the response
    matchUpload(
      req.tenantSchema,
      req.params.id,
      req.institutionId,
      req.user.id,
    ).catch((err) => console.warn("Match upload failed:", err.message));

    res.json({ ok: true, message: "Exam submitted successfully" });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/portal/uploads/:id/file ─────────────────────────────────────────
// Upload file for an exam (when delivery = file_upload)
router.post(
  "/uploads/:id/file",
  upload.single("file"),
  async (req, res, next) => {
    try {
      const profId = await getProfId(req, res);
      if (!profId) return;

      if (!req.file) {
        return res.status(400).json({ ok: false, error: "No file uploaded" });
      }

      const uploadId = req.params.id;

      // Verify upload belongs to professor
      const uploadResult = await tenantQuery(
        req.tenantSchema,
        `SELECT delivery FROM exam_upload WHERE id = $1 AND professor_profile_id = $2`,
        [uploadId, profId],
      );

      if (!uploadResult.rows.length) {
        return res.status(404).json({ ok: false, error: "Upload not found" });
      }

      // Generate storage path and save file
      const storagePath = generateFilePath(
        req.tenantSchema,
        uploadId,
        req.file.originalname,
      );

      const { size } = await saveFile(req.file.buffer, storagePath);

      // Update database with file info
      const result = await updateUploadFile(req.tenantSchema, uploadId, profId, {
        filePath: storagePath,
        fileOriginalName: req.file.originalname,
        fileSize: size,
      });

      logger.info("Professor uploaded exam file", {
        uploadId,
        professorId: profId,
        schema: req.tenantSchema,
        fileName: req.file.originalname,
        size,
      });

      res.json({
        ok: true,
        file: {
          originalName: req.file.originalname,
          size: size,
          uploadedAt: result.file_uploaded_at,
          url: getFileUrl(storagePath),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/portal/uploads/:id/files ───────────────────────────────────────
// Add a file to an upload (supports PDF and Word documents)
router.post(
  "/uploads/:id/files",
  uploadCombined.single("file"),
  async (req, res, next) => {
    try {
      const profId = await getProfId(req, res);
      if (!profId) return;

      if (!req.file) {
        return res.status(400).json({ ok: false, error: "No file provided" });
      }

      // Verify upload belongs to professor
      const check = await tenantQuery(
        req.tenantSchema,
        `SELECT id FROM exam_upload WHERE id = $1 AND professor_profile_id = $2`,
        [req.params.id, profId],
      );
      if (!check.rows.length) {
        return res.status(404).json({ ok: false, error: "Upload not found" });
      }

      const storagePath = generateFilePath(req.tenantSchema, req.params.id, req.file.originalname);
      const { size } = await saveFile(req.file.buffer, storagePath);

      const result = await tenantQuery(
        req.tenantSchema,
        `INSERT INTO exam_upload_file
           (exam_upload_id, file_path, file_original_name, file_size)
         VALUES ($1, $2, $3, $4)
         RETURNING id, file_original_name, file_size, file_uploaded_at`,
        [req.params.id, storagePath, req.file.originalname, size],
      );

      const row = result.rows[0];
      res.status(201).json({
        ok: true,
        file: {
          id:           row.id,
          originalName: row.file_original_name,
          size:         row.file_size,
          uploadedAt:   row.file_uploaded_at,
          url:          getFileUrl(storagePath),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /api/portal/uploads/:id/files/:fileId ──────────────────────────────
router.delete("/uploads/:id/files/:fileId", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    // Verify ownership via join
    const result = await tenantQuery(
      req.tenantSchema,
      `DELETE FROM exam_upload_file f
       USING exam_upload eu
       WHERE f.id = $1
         AND f.exam_upload_id = eu.id
         AND eu.id = $2
         AND eu.professor_profile_id = $3
       RETURNING f.file_path`,
      [req.params.fileId, req.params.id, profId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: "File not found" });
    }

    const { deleteFile } = await import("../services/fileStorage.js");
    await deleteFile(result.rows[0].file_path);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/portal/uploads/:id/file ─────────────────────────────────────────
// Download the uploaded file (legacy single-file endpoint)
router.get("/uploads/:id/file", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const fileInfo = await getUploadFileInfo(
      req.tenantSchema,
      req.params.id,
      profId,
    );

    if (!fileInfo || !fileInfo.file_path) {
      return res.status(404).json({ ok: false, error: "File not found" });
    }

    const fileBuffer = await readFileFromStorage(fileInfo.file_path);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileInfo.file_original_name)}"`,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", fileInfo.file_size);
    res.send(fileBuffer);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/portal/uploads/:id/dates ───────────────────────────────────────
router.post("/uploads/:id/dates", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const data = addDateSchema.parse(req.body);
    const dateId = await addUploadDate(req.tenantSchema, req.params.id, {
      examDate: data.examDate,
      timeSlot: data.timeSlot ?? null,
    });

    res.status(201).json({ ok: true, dateId });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/portal/uploads/:id/dates/:dateId ─────────────────────────────
router.delete("/uploads/:id/dates/:dateId", async (req, res, next) => {
  try {
    await removeUploadDate(req.tenantSchema, req.params.dateId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/portal/reuse ─────────────────────────────────────────────────────
router.get("/reuse", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const requests = await getPendingReuseRequests(req.tenantSchema, profId);
    res.json({ ok: true, requests });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/portal/reuse/:id/respond ───────────────────────────────────────
router.post("/reuse/:id/respond", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const { status, professorNote } = respondSchema.parse(req.body);
    await respondToReuseRequest(req.tenantSchema, req.params.id, {
      status,
      professorNote,
      professorProfileId: profId,
    });

    res.json({ ok: true, message: `Request ${status}` });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/portal/my-students ──────────────────────────────────────────────
// Returns all confirmed students whose exam bookings the professor approved,
// grouped by course code then exam date.
router.get("/my-students", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         ebr.id AS booking_id,
         ebr.course_code, ebr.exam_type,
         ebr.exam_date::text AS exam_date, ebr.exam_time::text AS exam_time, ebr.status,
         ebr.base_duration_mins, ebr.extra_mins, ebr.stb_mins,
         ebr.student_duration_mins,
         u.first_name, u.last_name, u.email,
         sp.student_number
       FROM exam_booking_request ebr
       JOIN student_profile sp ON sp.id = ebr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       WHERE (
           ebr.professor_profile_id = $1
           OR EXISTS (
             SELECT 1 FROM course_dossier cd
             WHERE UPPER(cd.course_code) = UPPER(ebr.course_code)
               AND cd.professor_id = $1
           )
         )
         AND ebr.status IN ('professor_approved', 'confirmed')
       ORDER BY ebr.course_code ASC, ebr.exam_date ASC, ebr.exam_time ASC NULLS LAST, u.last_name ASC`,
      [profId],
    );

    // Find which (course_code, exam_date, exam_type_label, time_slot) tuples have a
    // submitted upload. A null time_slot on the upload means "all time slots that day".
    const uploadResult = await tenantQuery(
      req.tenantSchema,
      `SELECT UPPER(eu.course_code) AS course_code,
              eud.exam_date::text    AS exam_date,
              eu.exam_type_label,
              eud.time_slot::text    AS time_slot
       FROM exam_upload eu
       JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
       WHERE eu.status = 'submitted'
         AND (
           eu.professor_profile_id = $1
           OR EXISTS (
             SELECT 1 FROM course_dossier cd
             WHERE UPPER(cd.course_code) = UPPER(eu.course_code)
               AND cd.professor_id = $1
           )
         )`,
      [profId],
    );
    // Two key sets:
    //   uploadedExact — course+date+type+time (specific time slot upload)
    //   uploadedAllDay — course+date+type (null time_slot upload covers all times)
    const uploadedExact  = new Set();
    const uploadedAllDay = new Set();
    for (const r of uploadResult.rows) {
      const base = `${r.course_code}__${r.exam_date.slice(0, 10)}__${r.exam_type_label}`;
      if (r.time_slot) {
        uploadedExact.add(`${base}__${r.time_slot.slice(0, 5)}`);
      } else {
        uploadedAllDay.add(base);
      }
    }

    // Group: courseCode → { examDate, examTime, examUploaded, students[] }
    const grouped = {};
    for (const row of result.rows) {
      const courseKey = row.course_code;
      const dateKey   = `${row.exam_date}__${row.exam_time ?? ''}__${row.exam_type}`;
      const timeStr   = row.exam_time ? row.exam_time.slice(0, 5) : null;
      const base      = `${row.course_code.toUpperCase()}__${row.exam_date.slice(0, 10)}__${row.exam_type}`;
      const examUploaded = uploadedAllDay.has(base) ||
                           (timeStr ? uploadedExact.has(`${base}__${timeStr}`) : false);

      if (!grouped[courseKey]) grouped[courseKey] = { courseCode: courseKey, dates: {} };

      if (!grouped[courseKey].dates[dateKey]) {
        grouped[courseKey].dates[dateKey] = {
          examDate:     row.exam_date,
          examTime:     timeStr,
          examType:     row.exam_type,
          examUploaded,
          students:     [],
        };
      }

      grouped[courseKey].dates[dateKey].students.push({
        bookingId:       row.booking_id,
        firstName:       row.first_name,
        lastName:        row.last_name,
        email:           row.email,
        studentNumber:   row.student_number,
        status:          row.status,
        baseDurationMins: row.base_duration_mins ?? row.student_duration_mins,
        extraMins:       row.extra_mins ?? 0,
        stbMins:         row.stb_mins  ?? 0,
      });
    }

    // Flatten to array
    const courses = Object.values(grouped).map(c => ({
      courseCode: c.courseCode,
      dates: Object.values(c.dates),
    }));

    res.json({ ok: true, courses });
  } catch (err) { next(err); }
});

// ── GET /api/portal/notifications ────────────────────────────────────────────
router.get("/notifications", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const notifications = await getProfessorNotifications(
      req.tenantSchema,
      profId,
    );
    res.json({ ok: true, notifications });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/portal/notifications/read ──────────────────────────────────────
router.post("/notifications/read", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    await markNotificationsRead(req.tenantSchema, profId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/portal/exam-requests ────────────────────────────────────────────
router.get("/exam-requests", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         ebr.id, ebr.course_code, ebr.exam_date, ebr.exam_time,
         ebr.exam_type, ebr.special_materials_note, ebr.status, ebr.created_at,
         ebr.student_duration_mins, ebr.rejection_reason,
         u.first_name, u.last_name, u.email,
         sp.student_number,
         ru.first_name || ' ' || ru.last_name AS rejected_by_name,
         ur.role AS rejected_by_role,
         EXISTS (
           SELECT 1 FROM student_accommodation sa
           JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
           WHERE sa.student_profile_id = ebr.student_profile_id
             AND ac.triggers_rwg_flag = TRUE
             AND ac.is_active = TRUE
         ) AS has_rwg
       FROM exam_booking_request ebr
       JOIN student_profile sp ON sp.id = ebr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       LEFT JOIN "user" ru ON ru.id = ebr.rejected_by
       LEFT JOIN LATERAL (
         SELECT role FROM user_role WHERE user_id = ebr.rejected_by LIMIT 1
       ) ur ON TRUE
       WHERE (
         ebr.professor_profile_id = $1
         OR EXISTS (
           SELECT 1 FROM course_dossier cd
           WHERE UPPER(cd.course_code) = UPPER(ebr.course_code)
             AND cd.professor_id = $1
         )
       )
         AND ebr.status IN ('pending', 'professor_approved', 'professor_rejected', 'confirmed', 'cancelled')
       ORDER BY ebr.exam_date ASC, ebr.created_at ASC`,
      [profId],
    );
    res.json({ ok: true, examRequests: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/portal/exam-requests/:id/approve ──────────────────────────────
router.patch("/exam-requests/:id/approve", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE exam_booking_request
       SET status = 'professor_approved',
           professor_profile_id = $2,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'pending'
         AND (
           professor_profile_id = $2
           OR EXISTS (
             SELECT 1 FROM course_dossier cd
             WHERE UPPER(cd.course_code) = UPPER(
               (SELECT course_code FROM exam_booking_request WHERE id = $1)
             )
               AND cd.professor_id = $2
           )
         )
       RETURNING id`,
      [req.params.id, profId],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Request not found or already actioned" });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/portal/exam-requests/:id/reject ───────────────────────────────
const examRejectSchema = z.object({
  reason: z.string().min(1).max(1000),
});

router.patch("/exam-requests/:id/reject", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const { reason } = examRejectSchema.parse(req.body);

    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE exam_booking_request
       SET status = 'professor_rejected',
           professor_profile_id = COALESCE(professor_profile_id, $2),
           rejection_reason = $3,
           rejected_by = $4,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'pending'
         AND (
           professor_profile_id = $2
           OR EXISTS (
             SELECT 1 FROM course_dossier cd
             WHERE UPPER(cd.course_code) = UPPER(
               (SELECT course_code FROM exam_booking_request WHERE id = $1)
             )
               AND cd.professor_id = $2
           )
         )
       RETURNING id`,
      [req.params.id, profId, reason, req.user.id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Request not found or already actioned" });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// =============================================================================
// Lead-facing routes — create/manage uploads on behalf of a professor
// =============================================================================

// ── GET /api/portal/professor/:profId/courses ─────────────────────────────────
router.get(
  "/professor/:profId/courses",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const courses = await getAllowedCoursesForProfessor(
        req.tenantSchema,
        req.params.profId,
      );
      res.json({ ok: true, courses });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/portal/professor/:profId/uploads ─────────────────────────────────
router.get(
  "/professor/:profId/uploads",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const uploads = await listUploadsForProfessor(
        req.tenantSchema,
        req.params.profId,
      );
      res.json({ ok: true, uploads });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/portal/professor/:profId/uploads ────────────────────────────────
router.post(
  "/professor/:profId/uploads",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const data = createUploadSchema.parse(req.body);
      const uploadId = await createUpload(req.tenantSchema, {
        professorProfileId:   req.params.profId,
        courseCode:           data.courseCode,
        examTypeLabel:        data.examTypeLabel,
        versionLabel:         data.versionLabel,
        delivery:             data.delivery,
        materials:            data.materials,
        password:             data.password,
        rwgFlag:              data.rwgFlag,
        isMakeup:             data.isMakeup,
        makeupNotes:          data.makeupNotes,
        estimatedCopies:      data.estimatedCopies,
        isWordDoc:            data.isWordDoc,
        examDurationMins:     data.examDurationMins,
        examFormat:           data.examFormat,
        bookletType:          data.bookletType,
        scantronNeeded:       data.scantronNeeded,
        calculatorType:       data.calculatorType,
        studentInstructions:  data.studentInstructions,
        examCollectionMethod: data.examCollectionMethod,
      });
      await persistUploadDossier(req.tenantSchema, uploadId, req.user.id);
      res.status(201).json({ ok: true, uploadId });
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /api/portal/professor/:profId/uploads/:id ─────────────────────────────
router.put(
  "/professor/:profId/uploads/:id",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const data = createUploadSchema.partial().parse(req.body);
      const dbFields = {};
      if (data.courseCode !== undefined)           dbFields.course_code             = data.courseCode;
      if (data.examTypeLabel !== undefined)        dbFields.exam_type_label         = data.examTypeLabel;
      if (data.versionLabel !== undefined)         dbFields.version_label           = data.versionLabel;
      if (data.delivery !== undefined)             dbFields.delivery                = data.delivery;
      if (data.materials !== undefined)            dbFields.materials               = data.materials;
      if (data.password !== undefined)             dbFields.password                = data.password;
      if (data.rwgFlag !== undefined)              dbFields.rwg_flag                = data.rwgFlag;
      if (data.isMakeup !== undefined)             dbFields.is_makeup               = data.isMakeup;
      if (data.makeupNotes !== undefined)          dbFields.makeup_notes            = data.makeupNotes;
      if (data.estimatedCopies !== undefined)      dbFields.estimated_copies        = data.estimatedCopies;
      if (data.isWordDoc !== undefined)            dbFields.is_word_doc             = data.isWordDoc;
      if (data.examDurationMins !== undefined)     dbFields.exam_duration_mins      = data.examDurationMins;
      if (data.examFormat !== undefined)           dbFields.exam_format             = data.examFormat;
      if (data.bookletType !== undefined)          dbFields.booklet_type            = data.bookletType;
      if (data.scantronNeeded !== undefined)       dbFields.scantron_needed         = data.scantronNeeded;
      if (data.calculatorType !== undefined)       dbFields.calculator_type         = data.calculatorType;
      if (data.studentInstructions !== undefined)  dbFields.student_instructions    = data.studentInstructions;
      if (data.examCollectionMethod !== undefined) dbFields.exam_collection_method  = data.examCollectionMethod;

      await updateUpload(req.tenantSchema, req.params.id, req.params.profId, dbFields);
      await persistUploadDossier(req.tenantSchema, req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/portal/professor/:profId/uploads/:id/submit ─────────────────────
router.post(
  "/professor/:profId/uploads/:id/submit",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      await submitUpload(req.tenantSchema, req.params.id, req.params.profId);
      await persistUploadDossier(req.tenantSchema, req.params.id, req.user.id);

      // If delivery is 'dropped', auto-confirm the drop-off — the prof is physically present
      await tenantQuery(
        req.tenantSchema,
        `UPDATE exam_upload
         SET dropoff_confirmed_at = NOW(),
             dropoff_confirmed_by = $2,
             updated_at           = NOW()
         WHERE id = $1
           AND delivery = 'dropped'
           AND dropoff_confirmed_at IS NULL`,
        [req.params.id, req.user.id],
      );

      matchUpload(req.tenantSchema, req.params.id).catch(() => {});
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/portal/professor/:profId/uploads/:id/dates ─────────────────────
router.post(
  "/professor/:profId/uploads/:id/dates",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const { examDate, timeSlot } = addDateSchema.parse(req.body);
      const data = await addUploadDate(req.tenantSchema, req.params.id, {
        examDate,
        timeSlot,
      });
      res.status(201).json({ ok: true, dateId: data.id });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/portal/professor/:profId/uploads/:id/files ─────────────────────
// Lead/admin: add a file (PDF or Word doc) to an upload on behalf of a professor
router.post(
  "/professor/:profId/uploads/:id/files",
  requireRole("lead", "institution_admin"),
  uploadCombined.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: "No file provided" });
      }

      // Verify upload belongs to this professor
      const check = await tenantQuery(
        req.tenantSchema,
        `SELECT id FROM exam_upload WHERE id = $1 AND professor_profile_id = $2`,
        [req.params.id, req.params.profId],
      );
      if (!check.rows.length) {
        return res.status(404).json({ ok: false, error: "Upload not found" });
      }

      const storagePath = generateFilePath(req.tenantSchema, req.params.id, req.file.originalname);
      const { size } = await saveFile(req.file.buffer, storagePath);

      const result = await tenantQuery(
        req.tenantSchema,
        `INSERT INTO exam_upload_file
           (exam_upload_id, file_path, file_original_name, file_size)
         VALUES ($1, $2, $3, $4)
         RETURNING id, file_original_name, file_size, file_uploaded_at`,
        [req.params.id, storagePath, req.file.originalname, size],
      );

      const row = result.rows[0];
      res.status(201).json({
        ok: true,
        file: {
          id:           row.id,
          originalName: row.file_original_name,
          size:         row.file_size,
          uploadedAt:   row.file_uploaded_at,
          url:          getFileUrl(storagePath),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /api/portal/professor/:profId/uploads/:id/dates/:dateId ────────────
router.delete(
  "/professor/:profId/uploads/:id/dates/:dateId",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      await removeUploadDate(
        req.tenantSchema,
        req.params.dateId,
        req.params.id,
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
