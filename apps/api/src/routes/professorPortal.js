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
];
const DELIVERIES = ["pickup", "dropped", "delivery", "pending", "file_upload"];

const createUploadSchemaBase = z.object({
  courseId:          z.string().uuid(),
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
});

const createUploadSchema = createUploadSchemaBase.superRefine((data, ctx) => {
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

async function ensureCourseAllowed(schema, professorProfileId, courseId) {
  const allowed = await getAllowedCoursesForProfessor(schema, professorProfileId);
  if (!allowed.includes(courseId)) {
    throw Object.assign(
      new Error("This course is not assigned to your profile. Contact your lead to assign it."),
      { status: 400 },
    );
  }
}

// ── GET /api/portal/terms ─────────────────────────────────────────────────────
// Returns terms where this professor has at least one course_dossier,
// plus the currentTermId (most recent active term by start_date).
router.get("/terms", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT * FROM (
         SELECT DISTINCT t.id, t.label, t.start_date::text AS start_date,
                t.end_date::text AS end_date, t.is_active
         FROM term t
         JOIN course_offering co ON co.term_id = t.id
         JOIN course_dossier cd ON cd.course_offering_id = co.id
         WHERE cd.professor_id = $1
       ) terms
       ORDER BY start_date DESC NULLS LAST`,
      [profId],
    );

    const currentResult = await tenantQuery(
      req.tenantSchema,
      `SELECT id FROM term WHERE is_active = TRUE ORDER BY start_date DESC NULLS LAST LIMIT 1`,
      [],
    );

    res.json({
      ok: true,
      terms: result.rows,
      currentTermId: currentResult.rows[0]?.id ?? null,
    });
  } catch (err) { next(err); }
});

// ── GET /api/portal/me ────────────────────────────────────────────────────────
router.get("/me", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const { termId } = req.query;
    const tId = (!termId || termId === 'all') ? null : termId;

    const [profileResult, statsResult, notifResult, requestsResult, missingResult, dropoffResult, upcomingResult, reuseResult, studentsResult, rwgResult, nextExamsResult, missingWordDocResult] = await Promise.all([
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
           COUNT(DISTINCT course_id)                     AS courses
         FROM exam_upload
         WHERE professor_profile_id = $1
           AND ($2::uuid IS NULL OR course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))`,
        [profId, tId],
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
           AND ($2::uuid IS NULL OR ebr.course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))
           AND (
             ebr.professor_profile_id = $1
             OR EXISTS (
               SELECT 1 FROM course_dossier cd
               JOIN course_offering co ON co.id = cd.course_offering_id
               WHERE co.course_id = ebr.course_id
                 AND cd.professor_id = $1
             )
           )`,
        [profId, tId],
      ),
      // Course+date combos with confirmed students but no submitted exam upload
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(*) AS missing_uploads
         FROM (
           SELECT ebr.course_id,
                  ebr.exam_date::text AS exam_date,
                  ebr.exam_type
           FROM exam_booking_request ebr
           WHERE ebr.status IN ('professor_approved', 'confirmed')
             AND ebr.exam_date >= CURRENT_DATE
             AND ($2::uuid IS NULL OR ebr.course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))
             AND (
               ebr.professor_profile_id = $1
               OR EXISTS (
                 SELECT 1 FROM course_dossier cd
                 JOIN course_offering co ON co.id = cd.course_offering_id
                 WHERE co.course_id = ebr.course_id
                   AND cd.professor_id = $1
               )
             )
           GROUP BY ebr.course_id, ebr.exam_date::text, ebr.exam_type
         ) bookings
         WHERE NOT EXISTS (
           SELECT 1 FROM exam_upload eu
           JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
           WHERE eu.status = 'submitted'
             AND eu.is_word_doc = FALSE
             AND eu.course_id = bookings.course_id
             AND eud.exam_date::text = bookings.exam_date
             AND eu.exam_type_label::text = bookings.exam_type
             AND (
               eu.professor_profile_id = $1
               OR EXISTS (
                 SELECT 1 FROM course_dossier cd
                 JOIN course_offering co ON co.id = cd.course_offering_id
                 WHERE co.course_id = eu.course_id
                   AND cd.professor_id = $1
               )
             )
         )`,
        [profId, tId],
      ),
      // Exams dropped off but not yet confirmed by accessibility centre
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(*) AS pending_dropoffs
         FROM exam_upload
         WHERE professor_profile_id = $1
           AND ($2::uuid IS NULL OR course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))
           AND delivery = 'dropped'
           AND dropoff_confirmed_at IS NULL
           AND status = 'submitted'`,
        [profId, tId],
      ),
      // Upcoming submitted exams (future dates)
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(DISTINCT eu.id) AS upcoming_exams
         FROM exam_upload eu
         JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
         WHERE eu.status = 'submitted'
           AND eud.exam_date >= CURRENT_DATE
           AND ($2::uuid IS NULL OR eu.course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))
           AND (
             eu.professor_profile_id = $1
             OR EXISTS (
               SELECT 1 FROM course_dossier cd
               JOIN course_offering co ON co.id = cd.course_offering_id
               WHERE co.course_id = eu.course_id
                 AND cd.professor_id = $1
             )
           )`,
        [profId, tId],
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
           AND ($2::uuid IS NULL OR ebr.course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))
           AND (
             ebr.professor_profile_id = $1
             OR EXISTS (
               SELECT 1 FROM course_dossier cd
               JOIN course_offering co ON co.id = cd.course_offering_id
               WHERE co.course_id = ebr.course_id
                 AND cd.professor_id = $1
             )
           )`,
        [profId, tId],
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
           AND ($2::uuid IS NULL OR ebr.course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))
           AND (
             ebr.professor_profile_id = $1
             OR EXISTS (
               SELECT 1 FROM course_dossier cd
               JOIN course_offering co ON co.id = cd.course_offering_id
               WHERE co.course_id = ebr.course_id
                 AND cd.professor_id = $1
             )
           )`,
        [profId, tId],
      ),
      // Next 5 upcoming exam date slots with student counts + upload status
      tenantQuery(
        req.tenantSchema,
        `SELECT
           ebr.course_id                             AS course_id,
           c.code                                    AS course_code,
           ebr.exam_date::text                       AS exam_date,
           ebr.exam_time::text                       AS exam_time,
           ebr.exam_type                             AS exam_type,
           COUNT(DISTINCT ebr.student_profile_id)    AS student_count,
           EXISTS (
             SELECT 1 FROM exam_upload eu2
             JOIN exam_upload_date eud2 ON eud2.exam_upload_id = eu2.id
             WHERE eu2.status = 'submitted'
               AND eu2.course_id = ebr.course_id
               AND eud2.exam_date::text  = ebr.exam_date::text
               AND eu2.exam_type_label::text = ebr.exam_type
               AND (
                 eu2.professor_profile_id = $1
                 OR EXISTS (
                   SELECT 1 FROM course_dossier cd
                   JOIN course_offering co ON co.id = cd.course_offering_id
                   WHERE co.course_id = eu2.course_id
                     AND cd.professor_id = $1
                 )
               )
           ) AS uploaded,
           BOOL_OR(EXISTS (
             SELECT 1 FROM student_accommodation sa
             JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
             WHERE sa.student_profile_id = ebr.student_profile_id
               AND ac.triggers_rwg_flag = TRUE
           )) AS has_rwg_students,
           EXISTS (
             SELECT 1 FROM exam_upload eu3
             JOIN exam_upload_date eud3 ON eud3.exam_upload_id = eu3.id
             WHERE eu3.status = 'submitted'
               AND (
                 eu3.is_word_doc = TRUE
                 OR EXISTS (
                   SELECT 1 FROM exam_upload_file euf3
                   WHERE euf3.exam_upload_id = eu3.id
                     AND euf3.file_original_name ILIKE '%.doc%'
                 )
               )
               AND eu3.course_id = ebr.course_id
               AND eud3.exam_date::text = ebr.exam_date::text
               AND eu3.exam_type_label::text = ebr.exam_type
               AND (
                 eu3.professor_profile_id = $1
                 OR EXISTS (
                   SELECT 1 FROM course_dossier cd
                   JOIN course_offering co ON co.id = cd.course_offering_id
                   WHERE co.course_id = eu3.course_id
                     AND cd.professor_id = $1
                 )
               )
           ) AS word_doc_uploaded
         FROM exam_booking_request ebr
         JOIN course c ON c.id = ebr.course_id
         WHERE ebr.status IN ('confirmed', 'professor_approved')
           AND ebr.exam_date >= CURRENT_DATE
           AND ($2::uuid IS NULL OR ebr.course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))
           AND (
             ebr.professor_profile_id = $1
             OR EXISTS (
               SELECT 1 FROM course_dossier cd
               JOIN course_offering co ON co.id = cd.course_offering_id
               WHERE co.course_id = ebr.course_id
                 AND cd.professor_id = $1
             )
           )
         GROUP BY ebr.course_id, c.code, ebr.exam_date, ebr.exam_time, ebr.exam_type
         ORDER BY ebr.exam_date ASC, ebr.exam_time ASC NULLS LAST
         LIMIT 5`,
        [profId, tId],
      ),
      // Course+date combos with RWG students but no submitted Word doc upload
      tenantQuery(
        req.tenantSchema,
        `SELECT COUNT(*) AS missing_word_docs
         FROM (
           SELECT ebr.course_id,
                  ebr.exam_date::text AS exam_date,
                  ebr.exam_type
           FROM exam_booking_request ebr
           WHERE ebr.status IN ('professor_approved', 'confirmed')
             AND ebr.exam_date >= CURRENT_DATE
             AND ($2::uuid IS NULL OR ebr.course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))
             AND (
               ebr.professor_profile_id = $1
               OR EXISTS (
                 SELECT 1 FROM course_dossier cd
                 JOIN course_offering co ON co.id = cd.course_offering_id
                 WHERE co.course_id = ebr.course_id
                   AND cd.professor_id = $1
               )
             )
             AND EXISTS (
               SELECT 1 FROM student_accommodation sa
               JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
               WHERE sa.student_profile_id = ebr.student_profile_id
                 AND ac.triggers_rwg_flag = TRUE
             )
           GROUP BY ebr.course_id, ebr.exam_date::text, ebr.exam_type
         ) rwg_groups
         WHERE NOT EXISTS (
           SELECT 1 FROM exam_upload eu
           JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
           WHERE eu.status = 'submitted'
             AND (
               eu.is_word_doc = TRUE
               OR EXISTS (
                 SELECT 1 FROM exam_upload_file euf
                 WHERE euf.exam_upload_id = eu.id
                   AND euf.file_original_name ILIKE '%.doc%'
               )
             )
             AND eu.course_id = rwg_groups.course_id
             AND eud.exam_date::text = rwg_groups.exam_date
             AND eu.exam_type_label::text = rwg_groups.exam_type
             AND (
               eu.professor_profile_id = $1
               OR EXISTS (
                 SELECT 1 FROM course_dossier cd
                 JOIN course_offering co ON co.id = cd.course_offering_id
                 WHERE co.course_id = eu.course_id
                   AND cd.professor_id = $1
               )
             )
         )`,
        [profId, tId],
      ),
    ]);

    res.json({
      ok: true,
      profile: profileResult.rows[0],
      stats: {
        ...statsResult.rows[0],
        pendingRequests: parseInt(requestsResult.rows[0].pending_requests),
        missingUploads:        parseInt(missingResult.rows[0].missing_uploads),
        pendingDropoffs:       parseInt(dropoffResult.rows[0].pending_dropoffs),
        upcomingExams:         parseInt(upcomingResult.rows[0].upcoming_exams),
        reuseCount:            parseInt(reuseResult.rows[0].reuse_count),
        totalStudents:         parseInt(studentsResult.rows[0].total_students),
        rwgStudents:           parseInt(rwgResult.rows[0].rwg_students),
        missingWordDocUploads: parseInt(missingWordDocResult.rows[0].missing_word_docs),
      },
      unread:     parseInt(notifResult.rows[0].unread),
      nextExams:  nextExamsResult.rows.map(r => ({
        courseId:        r.course_id,
        courseCode:      r.course_code,
        examDate:        r.exam_date,
        examTime:        r.exam_time,
        examType:        r.exam_type,
        studentCount:    parseInt(r.student_count),
        uploaded:        r.uploaded,
        hasRwgStudents:  r.has_rwg_students,
        wordDocUploaded: r.word_doc_uploaded,
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

    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT DISTINCT co.course_id AS id, c.code
       FROM course_dossier cd
       JOIN course_offering co ON co.id = cd.course_offering_id
       JOIN course c ON c.id = co.course_id
       WHERE cd.professor_id = $1
       ORDER BY c.code`,
      [profId],
    );
    res.json({ ok: true, courses: result.rows });
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
         cd.id, c.code AS course_code, t.label AS term, cd.preferred_delivery,
         cd.typical_materials, cd.password_reminder, cd.notes,
         cd.updated_at,
         u.first_name || ' ' || u.last_name AS last_updated_by_name
       FROM course_dossier cd
       JOIN course_offering co ON co.id = cd.course_offering_id
       JOIN course c ON c.id = co.course_id
       JOIN term t ON t.id = co.term_id
       JOIN professor_profile pp ON pp.id = cd.professor_id
       LEFT JOIN "user" u ON u.id = cd.last_updated_by
       WHERE pp.user_id = $1
       ORDER BY t.start_date DESC NULLS LAST, UPPER(c.code)`,
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

    const data = createUploadSchemaBase.parse(req.body);
    if (!data.isWordDoc) {
      await ensureCourseAllowed(req.tenantSchema, profId, data.courseId);
    }
    const uploadId = await createUpload(req.tenantSchema, {
      professorProfileId:  profId,
      courseId:            data.courseId,
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
      `SELECT exam_date::text AS exam_date, time_slot::text AS time_slot
       FROM exam_upload_date
       WHERE exam_upload_id = $1
       ORDER BY exam_date ASC, time_slot ASC NULLS LAST
       LIMIT 1`,
      [req.params.id],
    );
    const earliest = datesResult.rows[0];
    if (earliest) {
      const dateStr = String(earliest.exam_date).slice(0, 10);
      const timeStr = earliest.time_slot ? String(earliest.time_slot).slice(0, 8) : null;
      const examStart = timeStr
        ? new Date(`${dateStr}T${timeStr}`)
        : new Date(`${dateStr}T00:00:00`);
      if (examStart <= new Date()) {
        return res.status(403).json({
          ok: false,
          error: "This exam can no longer be edited — it has already started.",
        });
      }
    }

    const data = createUploadSchemaBase.partial().parse(req.body);
    const dbFields = {};
    if (data.courseId !== undefined) {
      await ensureCourseAllowed(req.tenantSchema, profId, data.courseId);
      dbFields.course_id = data.courseId;
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
      `SELECT eu.delivery, eu.file_path,
              EXISTS (SELECT 1 FROM exam_upload_file euf WHERE euf.exam_upload_id = eu.id) AS has_files
       FROM exam_upload eu
       WHERE eu.id = $1 AND eu.professor_profile_id = $2`,
      [req.params.id, profId],
    );
    const upload = uploadResult.rows[0];

    // Validate file upload requirement (check both legacy file_path and multi-file table)
    if (upload?.delivery === "file_upload" && !upload?.file_path && !upload?.has_files) {
      return res.status(400).json({
        ok: false,
        error: "Please upload the exam file before submitting",
      });
    }

    // Duplicate upload check — warn if another submitted upload covers the same course+date
    if (!req.body?.force) {
      const dupCheck = await tenantQuery(
        req.tenantSchema,
        `SELECT eu.id, eu.exam_type_label, eu.version_label,
                array_agg(DISTINCT eud.exam_date::text ORDER BY eud.exam_date::text) AS conflicting_dates
         FROM exam_upload eu
         JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
         WHERE eu.course_id = (SELECT course_id FROM exam_upload WHERE id = $1)
           AND eu.status = 'submitted'
           AND eu.id != $1
           AND eud.exam_date IN (SELECT exam_date FROM exam_upload_date WHERE exam_upload_id = $1)
         GROUP BY eu.id`,
        [req.params.id],
      );
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({
          ok: false,
          error: "A submitted upload already exists for the same course and date(s). Submitting will create a conflict a lead must resolve.",
          conflicts: dupCheck.rows,
        });
      }
    }

    await submitUpload(req.tenantSchema, req.params.id, profId);
    await persistUploadDossier(req.tenantSchema, req.params.id, req.user.id);

    // Auto-approve all pending requests matching this upload's course+date+type+time
    const uploadDatesResult = await tenantQuery(
      req.tenantSchema,
      `SELECT eu.course_id, eu.exam_type_label::text AS exam_type,
              eud.exam_date, eud.time_slot
       FROM exam_upload eu
       JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
       WHERE eu.id = $1`,
      [req.params.id],
    );
    for (const row of uploadDatesResult.rows) {
      await tenantQuery(
        req.tenantSchema,
        `UPDATE exam_booking_request
         SET status = 'professor_approved', updated_at = NOW()
         WHERE course_id = $1
           AND exam_date = $2
           AND exam_type = $3
           AND ($4::time IS NULL OR exam_time IS NULL OR exam_time = $4::time)
           AND status = 'pending'`,
        [row.course_id, row.exam_date, row.exam_type, row.time_slot || null],
      );
      await tenantQuery(
        req.tenantSchema,
        `UPDATE exam_booking_request
         SET status = 'confirmed', confirmed_by = $1, confirmed_at = NOW(),
             auto_approve_source = 'upload', updated_at = NOW()
         WHERE course_id = $2
           AND exam_date = $3
           AND exam_type = $4
           AND ($5::time IS NULL OR exam_time IS NULL OR exam_time = $5::time)
           AND status = 'professor_approved'`,
        [req.user.id, row.course_id, row.exam_date, row.exam_type, row.time_slot || null],
      );
    }

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
          id:                 row.id,
          file_original_name: row.file_original_name,
          file_size:          row.file_size,
          file_uploaded_at:   row.file_uploaded_at,
          url:                getFileUrl(storagePath),
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

    const { termId } = req.query;
    const tId = (!termId || termId === 'all') ? null : termId;

    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         ebr.id AS booking_id,
         ebr.course_id, c.code AS course_code, ebr.exam_type,
         ebr.exam_date::text AS exam_date, ebr.exam_time::text AS exam_time, ebr.status,
         ebr.base_duration_mins, ebr.extra_mins, ebr.stb_mins,
         ebr.student_duration_mins, ebr.attendance_status,
         u.first_name, u.last_name, u.email,
         sp.student_number,
         EXISTS (
           SELECT 1 FROM student_accommodation sa
           JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
           WHERE sa.student_profile_id = ebr.student_profile_id
             AND ac.triggers_rwg_flag = TRUE
         ) AS has_rwg,
         ARRAY(
           SELECT DISTINCT ac2.code
           FROM student_accommodation sa2
           JOIN accommodation_code ac2 ON ac2.id = sa2.accommodation_code_id
           WHERE sa2.student_profile_id = ebr.student_profile_id
             AND sa2.is_active = TRUE
             AND ac2.is_active = TRUE
           ORDER BY ac2.code
         ) AS accommodation_codes
       FROM exam_booking_request ebr
       JOIN course c ON c.id = ebr.course_id
       JOIN student_profile sp ON sp.id = ebr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       WHERE (
           ebr.professor_profile_id = $1
           OR EXISTS (
             SELECT 1 FROM course_dossier cd
             JOIN course_offering co ON co.id = cd.course_offering_id
             WHERE co.course_id = ebr.course_id
               AND cd.professor_id = $1
           )
         )
         AND ($2::uuid IS NULL OR ebr.course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))
         AND ebr.status IN ('professor_approved', 'confirmed', 'cancelled')
       ORDER BY c.code ASC, ebr.exam_date ASC, ebr.exam_time ASC NULLS LAST, u.last_name ASC`,
      [profId, tId],
    );

    // Find which (course_code, exam_date, exam_type_label, time_slot) tuples have a
    // submitted upload. A null time_slot on the upload means "all time slots that day".
    const uploadResult = await tenantQuery(
      req.tenantSchema,
      `SELECT UPPER(c.code) AS course_code,
              eud.exam_date::text    AS exam_date,
              eu.exam_type_label,
              eud.time_slot::text    AS time_slot,
              eu.is_word_doc,
              EXISTS (
                SELECT 1 FROM exam_upload_file euf
                WHERE euf.exam_upload_id = eu.id
                  AND euf.file_original_name ILIKE '%.doc%'
              ) AS has_docx_file
       FROM exam_upload eu
       JOIN course c ON c.id = eu.course_id
       JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
       WHERE eu.status = 'submitted'
         AND (
           eu.professor_profile_id = $1
           OR EXISTS (
             SELECT 1 FROM course_dossier cd
             JOIN course_offering co ON co.id = cd.course_offering_id
             WHERE co.course_id = eu.course_id
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
    const wordDocExact   = new Set();
    const wordDocAllDay  = new Set();
    for (const r of uploadResult.rows) {
      const base = `${r.course_code}__${r.exam_date.slice(0, 10)}__${r.exam_type_label}`;
      const slot = r.time_slot?.slice(0, 5);
      // Only non-word-doc uploads count as the real exam being uploaded
      if (!r.is_word_doc) {
        slot ? uploadedExact.add(`${base}__${slot}`) : uploadedAllDay.add(base);
      }
      // Word doc satisfied by dedicated word doc OR any upload with a .docx file
      if (r.is_word_doc || r.has_docx_file) {
        slot ? wordDocExact.add(`${base}__${slot}`) : wordDocAllDay.add(base);
      }
    }

    // Group: courseCode → { courseId, examDate, examTime, examUploaded, students[] }
    const grouped = {};
    for (const row of result.rows) {
      const courseKey = row.course_code;
      const dateKey   = `${row.exam_date}__${row.exam_time ?? ''}__${row.exam_type}`;
      const timeStr   = row.exam_time ? row.exam_time.slice(0, 5) : null;
      const base      = `${row.course_code.toUpperCase()}__${row.exam_date.slice(0, 10)}__${row.exam_type}`;
      const examUploaded    = uploadedAllDay.has(base) ||
                              (timeStr ? uploadedExact.has(`${base}__${timeStr}`) : false);
      const wordDocUploaded = wordDocAllDay.has(base) ||
                              (timeStr ? wordDocExact.has(`${base}__${timeStr}`) : false);

      if (!grouped[courseKey]) grouped[courseKey] = { courseId: row.course_id, courseCode: courseKey, dates: {} };

      if (!grouped[courseKey].dates[dateKey]) {
        grouped[courseKey].dates[dateKey] = {
          examDate:        row.exam_date,
          examTime:        timeStr,
          examType:        row.exam_type,
          examUploaded,
          wordDocUploaded,
          hasRwgStudents:  !!row.has_rwg,
          students:        [],
        };
      } else if (row.has_rwg) {
        grouped[courseKey].dates[dateKey].hasRwgStudents = true;
      }

      grouped[courseKey].dates[dateKey].students.push({
        bookingId:        row.booking_id,
        firstName:        row.first_name,
        lastName:         row.last_name,
        email:            row.email,
        studentNumber:    row.student_number,
        status:           row.status,
        attendanceStatus:   row.attendance_status ?? null,
        baseDurationMins:   row.base_duration_mins ?? row.student_duration_mins,
        extraMins:          row.extra_mins ?? 0,
        stbMins:            row.stb_mins  ?? 0,
        accommodationCodes: row.accommodation_codes ?? [],
      });
    }

    // Flatten to array
    const courses = Object.values(grouped).map(c => ({
      courseId:   c.courseId,
      courseCode: c.courseCode,
      dates: Object.values(c.dates),
    }));

    res.json({ ok: true, courses });
  } catch (err) { next(err); }
});

// ── PATCH /api/portal/bookings/:id/attendance ─────────────────────────────────
router.patch("/bookings/:id/attendance", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const { status } = req.body;
    if (status !== null && status !== 'show' && status !== 'no_show') {
      return res.status(400).json({ ok: false, error: 'status must be "show", "no_show", or null' });
    }

    const result = await tenantQuery(
      req.tenantSchema,
      `UPDATE exam_booking_request
       SET attendance_status      = $2,
           attendance_recorded_by = $3,
           attendance_recorded_at = $4,
           updated_at             = NOW()
       WHERE id = $1
         AND status = 'confirmed'
         AND (
           professor_profile_id = $5
           OR EXISTS (
             SELECT 1 FROM course_dossier cd
             JOIN course_offering co ON co.id = cd.course_offering_id
             WHERE co.course_id = exam_booking_request.course_id
               AND cd.professor_id = $5
           )
         )
       RETURNING id`,
      [req.params.id, status, status ? req.user.id : null, status ? new Date() : null, profId],
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Booking not found or not accessible' });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/portal/accessibility-students ───────────────────────────────────
// Returns all students with active accommodations enrolled in this prof's courses.
router.get("/accessibility-students", async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const { termId } = req.query;
    const tId = (!termId || termId === 'all') ? null : termId;

    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         sp.id AS student_profile_id,
         sp.student_number,
         u.first_name, u.last_name, u.email,
         c.code AS course_code,
         array_remove(array_agg(DISTINCT ac.code ORDER BY ac.code), NULL) AS accommodation_codes,
         array_remove(array_agg(DISTINCT ac.label ORDER BY ac.label), NULL) AS accommodation_labels
       FROM student_course sc
       JOIN course_offering co ON co.id = sc.course_offering_id
       JOIN course c ON c.id = co.course_id
       JOIN course_dossier cd ON cd.course_offering_id = co.id
       JOIN student_profile sp ON sp.id = sc.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       LEFT JOIN student_accommodation sa ON sa.student_profile_id = sp.id
         AND sa.is_active = TRUE
       LEFT JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
         AND ac.is_active = TRUE
       WHERE cd.professor_id = $1
         AND ($2::uuid IS NULL OR co.term_id = $2::uuid)
       GROUP BY sp.id, sp.student_number, u.first_name, u.last_name, u.email, c.code
       ORDER BY c.code, u.last_name, u.first_name`,
      [profId, tId],
    );

    const students = result.rows.map(r => ({
      studentProfileId:     r.student_profile_id,
      studentNumber:        r.student_number,
      firstName:            r.first_name,
      lastName:             r.last_name,
      email:                r.email,
      courseCode:           r.course_code,
      accommodationCodes:   r.accommodation_codes ?? [],
      accommodationLabels:  r.accommodation_labels ?? [],
    }));

    res.json({ ok: true, students });
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

    const { termId } = req.query;
    const tId = (!termId || termId === 'all') ? null : termId;

    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         ebr.id, c.code AS course_code, ebr.exam_date, ebr.exam_time,
         ebr.exam_type, ebr.special_materials_note, ebr.status, ebr.created_at,
         ebr.student_duration_mins, ebr.rejection_reason, ebr.attendance_status,
         ebr.auto_approve_source,
         u.first_name, u.last_name, u.email,
         sp.student_number,
         cu.first_name AS confirmed_by_first, cu.last_name AS confirmed_by_last,
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
       JOIN course c ON c.id = ebr.course_id
       JOIN student_profile sp ON sp.id = ebr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       LEFT JOIN "user" cu ON cu.id = ebr.confirmed_by
       LEFT JOIN "user" ru ON ru.id = ebr.rejected_by
       LEFT JOIN LATERAL (
         SELECT role FROM user_role WHERE user_id = ebr.rejected_by LIMIT 1
       ) ur ON TRUE
       WHERE (
         ebr.professor_profile_id = $1
         OR EXISTS (
           SELECT 1 FROM course_dossier cd
           JOIN course_offering co ON co.id = cd.course_offering_id
           WHERE co.course_id = ebr.course_id
             AND cd.professor_id = $1
         )
       )
         AND ($2::uuid IS NULL OR ebr.course_offering_id IN (SELECT id FROM course_offering WHERE term_id = $2::uuid))
         AND ebr.status IN ('pending', 'professor_approved', 'professor_rejected', 'confirmed', 'cancelled')
       ORDER BY ebr.exam_date ASC, ebr.created_at ASC`,
      [profId, tId],
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
             JOIN course_offering co ON co.id = cd.course_offering_id
             WHERE co.course_id = (SELECT course_id FROM exam_booking_request WHERE id = $1)
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
             JOIN course_offering co ON co.id = cd.course_offering_id
             WHERE co.course_id = (SELECT course_id FROM exam_booking_request WHERE id = $1)
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
      const result = await tenantQuery(
        req.tenantSchema,
        `SELECT DISTINCT co.course_id AS id, c.code
         FROM course_dossier cd
         JOIN course_offering co ON co.id = cd.course_offering_id
         JOIN course c ON c.id = co.course_id
         WHERE cd.professor_id = $1
         ORDER BY c.code`,
        [req.params.profId],
      );
      res.json({ ok: true, courses: result.rows });
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
        courseId:             data.courseId,
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
      const data = createUploadSchemaBase.partial().parse(req.body);
      const dbFields = {};
      if (data.courseId !== undefined)             dbFields.course_id               = data.courseId;
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
      // Duplicate upload check
      if (!req.body?.force) {
        const dupCheck = await tenantQuery(
          req.tenantSchema,
          `SELECT eu.id, eu.exam_type_label, eu.version_label,
                  array_agg(DISTINCT eud.exam_date::text ORDER BY eud.exam_date::text) AS conflicting_dates
           FROM exam_upload eu
           JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
           WHERE eu.course_id = (SELECT course_id FROM exam_upload WHERE id = $1)
             AND eu.status = 'submitted'
             AND eu.id != $1
             AND eud.exam_date IN (SELECT exam_date FROM exam_upload_date WHERE exam_upload_id = $1)
           GROUP BY eu.id`,
          [req.params.id],
        );
        if (dupCheck.rows.length > 0) {
          return res.status(409).json({
            ok: false,
            error: "A submitted upload already exists for the same course and date(s). Submitting will create a conflict a lead must resolve.",
            conflicts: dupCheck.rows,
          });
        }
      }

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
          id:                 row.id,
          file_original_name: row.file_original_name,
          file_size:          row.file_size,
          file_uploaded_at:   row.file_uploaded_at,
          url:                getFileUrl(storagePath),
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

// ── GET /api/portal/conflicts ─────────────────────────────────────────────────
// Returns submitted uploads that share the same course+date+type+time, grouped as conflicts.
router.get(
  "/conflicts",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const result = await tenantQuery(
        req.tenantSchema,
        `SELECT
           eu.id           AS upload_id,
           eu.course_id,
           c.code          AS course_code,
           eu.exam_type_label,
           eu.version_label,
           eu.submitted_at,
           eud.id          AS upload_date_id,
           eud.exam_date,
           eud.time_slot,
           u.first_name || ' ' || u.last_name AS professor_name,
           u.email                            AS professor_email
         FROM exam_upload_date eud
         JOIN exam_upload      eu ON eu.id  = eud.exam_upload_id
         JOIN course           c  ON c.id   = eu.course_id
         JOIN professor_profile pp ON pp.id = eu.professor_profile_id
         JOIN "user"            u  ON u.id  = pp.user_id
         WHERE eu.status = 'submitted'
           AND (eu.course_id, eud.exam_date, eu.exam_type_label, eud.time_slot) IN (
             SELECT eu2.course_id, eud2.exam_date, eu2.exam_type_label, eud2.time_slot
             FROM exam_upload_date eud2
             JOIN exam_upload eu2 ON eu2.id = eud2.exam_upload_id
             WHERE eu2.status = 'submitted'
             GROUP BY eu2.course_id, eud2.exam_date, eu2.exam_type_label, eud2.time_slot
             HAVING COUNT(DISTINCT eu2.id) > 1
           )
         ORDER BY eud.exam_date, c.code`,
        [],
      );

      // Group by course_id + exam_date + exam_type_label + time_slot
      const map = new Map();
      for (const row of result.rows) {
        const examDate = String(row.exam_date).slice(0, 10);
        const timeSlot = row.time_slot ? String(row.time_slot).slice(0, 5) : null;
        const key = `${row.course_id}__${examDate}__${row.exam_type_label}__${timeSlot}`;
        if (!map.has(key)) {
          map.set(key, {
            courseId:   row.course_id,
            courseCode: row.course_code,
            examDate,
            examType:   row.exam_type_label,
            timeSlot,
            uploads:    [],
          });
        }
        map.get(key).uploads.push({
          uploadId:       row.upload_id,
          uploadDateId:   row.upload_date_id,
          examTypeLabel:  row.exam_type_label,
          versionLabel:   row.version_label,
          submittedAt:    row.submitted_at,
          timeSlot:       row.time_slot,
          professorName:  row.professor_name,
          professorEmail: row.professor_email,
        });
      }

      res.json({ ok: true, conflicts: [...map.values()] });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/portal/conflicts/resolve ───────────────────────────────────────
// Pick the winning upload for a course+date conflict; losers revert to unmatched.
router.post(
  "/conflicts/resolve",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const { courseId, examDate, examType, timeSlot, winnerUploadId } = req.body;
      if (!courseId || !examDate || !examType || !winnerUploadId) {
        return res.status(400).json({ ok: false, error: "courseId, examDate, examType, and winnerUploadId are required" });
      }

      // Find all submitted uploads for this course+date+type+time
      const conflictRows = await tenantQuery(
        req.tenantSchema,
        `SELECT eud.id AS date_id, eud.exam_upload_id
         FROM exam_upload_date eud
         JOIN exam_upload eu ON eu.id = eud.exam_upload_id
           AND eu.course_id = $1
           AND eu.exam_type_label = $3
           AND eu.status = 'submitted'
         WHERE eud.exam_date = $2
           AND eud.time_slot IS NOT DISTINCT FROM $4`,
        [courseId, examDate, examType, timeSlot ?? null],
      );

      if (conflictRows.rows.length < 2) {
        return res.status(404).json({ ok: false, error: "No conflicts found for this course, date, type, and time" });
      }

      const winnerDateId = conflictRows.rows.find(r => r.exam_upload_id === winnerUploadId)?.date_id;
      const loserDateIds = conflictRows.rows
        .filter(r => r.exam_upload_id !== winnerUploadId)
        .map(r => r.date_id);

      // Resolve winner
      if (winnerDateId) {
        await tenantQuery(
          req.tenantSchema,
          `UPDATE exam_upload_date SET match_status = 'matched' WHERE id = $1`,
          [winnerDateId],
        );
      }

      // Revert losers to unmatched
      if (loserDateIds.length) {
        await tenantQuery(
          req.tenantSchema,
          `UPDATE exam_upload_date SET match_status = 'unmatched' WHERE id = ANY($1::uuid[])`,
          [loserDateIds],
        );
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/portal/messages ─────────────────────────────────────────────────
// Conversation inbox for professors — all their upload threads with unread counts.
router.get('/messages', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         eu.id              AS upload_id,
         c.code             AS course_code,
         eu.exam_type_label,
         MAX(m.created_at)  AS latest_at,
         COUNT(m.id)::int   AS message_count,
         COUNT(m.id) FILTER (
           WHERE m.created_at > COALESCE(tr.last_read_at, '1970-01-01'::timestamptz)
             AND m.sent_by <> $1
         )::int             AS unread_count,
         (ARRAY_AGG(m.body ORDER BY m.created_at DESC))[1]                                       AS last_body,
         (ARRAY_AGG(lu.first_name || ' ' || lu.last_name ORDER BY m.created_at DESC))[1]         AS last_sender
       FROM exam_upload eu
       JOIN course                  c   ON c.id  = eu.course_id
       JOIN exam_upload_message     m   ON m.exam_upload_id = eu.id
       JOIN "user"                  lu  ON lu.id = m.sent_by
       LEFT JOIN exam_upload_thread_read tr
         ON tr.exam_upload_id = eu.id AND tr.user_id = $1
       WHERE eu.professor_profile_id = $2
       GROUP BY eu.id, c.code, eu.exam_type_label, tr.last_read_at
       ORDER BY MAX(m.created_at) DESC`,
      [req.user.id, profId],
    );

    res.json({ ok: true, conversations: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/portal/messages/unread-count ────────────────────────────────────
router.get('/messages/unread-count', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;
    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT COUNT(m.id)::int AS unread_count
       FROM exam_upload_message m
       JOIN exam_upload eu ON eu.id = m.exam_upload_id
       LEFT JOIN exam_upload_thread_read tr
         ON tr.exam_upload_id = eu.id AND tr.user_id = $1
       WHERE eu.professor_profile_id = $2
         AND m.sent_by <> $1
         AND m.created_at > COALESCE(tr.last_read_at, '1970-01-01'::timestamptz)`,
      [req.user.id, profId],
    );
    res.json({ ok: true, unreadCount: result.rows[0].unread_count });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/portal/uploads/message-files/:filePath ──────────────────────────
router.get('/uploads/message-files/:filePath(*)', async (req, res, next) => {
  try {
    const { readFileFromStorage } = await import('../services/fileStorage.js');
    const buffer = await readFileFromStorage(req.params.filePath);
    const filename = req.params.filePath.split('/').pop();
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ ok: false, error: 'File not found' });
    next(err);
  }
});

// ── GET /api/portal/uploads/:id/messages ─────────────────────────────────────
router.get('/uploads/:id/messages', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    // Ownership check — prof must own this upload
    const check = await tenantQuery(
      req.tenantSchema,
      `SELECT id FROM exam_upload WHERE id = $1 AND professor_profile_id = $2`,
      [req.params.id, profId],
    );
    if (!check.rows.length) {
      return res.status(404).json({ ok: false, error: 'Upload not found' });
    }

    const result = await tenantQuery(
      req.tenantSchema,
      `SELECT
         m.id, m.sent_by, m.body, m.created_at,
         u.first_name, u.last_name,
         (SELECT role FROM user_role WHERE user_id = u.id LIMIT 1) AS sender_role,
         COALESCE(
           json_agg(json_build_object(
             'id', f.id, 'original_name', f.original_name,
             'file_size', f.file_size, 'file_path', f.file_path
           )) FILTER (WHERE f.id IS NOT NULL),
           '[]'
         ) AS files
       FROM exam_upload_message m
       JOIN "user" u ON u.id = m.sent_by
       LEFT JOIN exam_upload_message_file f ON f.message_id = m.id
       WHERE m.exam_upload_id = $1
       GROUP BY m.id, u.first_name, u.last_name, u.id
       ORDER BY m.created_at ASC`,
      [req.params.id],
    );

    // Mark conversation as read for this user (fire-and-forget)
    tenantQuery(
      req.tenantSchema,
      `INSERT INTO exam_upload_thread_read (exam_upload_id, user_id, last_read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (exam_upload_id, user_id) DO UPDATE SET last_read_at = NOW()`,
      [req.params.id, req.user.id],
    ).catch(() => {});

    res.json({ ok: true, messages: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/portal/uploads/:id/messages ────────────────────────────────────
router.post('/uploads/:id/messages', uploadCombined.single('file'), async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const body = req.body.body?.trim() || null;

    if (!body && !req.file) {
      return res.status(400).json({ ok: false, error: 'Message body or file is required' });
    }

    // Ownership check + get professor's user_id for notification
    const check = await tenantQuery(
      req.tenantSchema,
      `SELECT eu.id, eu.professor_profile_id FROM exam_upload eu
       WHERE eu.id = $1 AND eu.professor_profile_id = $2`,
      [req.params.id, profId],
    );
    if (!check.rows.length) {
      return res.status(404).json({ ok: false, error: 'Upload not found' });
    }

    const msgResult = await tenantQuery(
      req.tenantSchema,
      `INSERT INTO exam_upload_message (exam_upload_id, sent_by, body)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [req.params.id, req.user.id, body],
    );
    const msg = msgResult.rows[0];

    let fileRow = null;
    if (req.file) {
      const storagePath = generateFilePath(req.tenantSchema, req.params.id, req.file.originalname);
      const { size } = await saveFile(req.file.buffer, storagePath);
      const fResult = await tenantQuery(
        req.tenantSchema,
        `INSERT INTO exam_upload_message_file (message_id, file_path, original_name, file_size)
         VALUES ($1, $2, $3, $4)
         RETURNING id, original_name, file_size`,
        [msg.id, storagePath, req.file.originalname, size],
      );
      fileRow = fResult.rows[0];
    }

    // Notify leads/admins (fire-and-forget)
    tenantQuery(
      req.tenantSchema,
      `INSERT INTO upload_notification (professor_profile_id, exam_upload_id, type, message)
       SELECT pp.id, $1, 'new_message', $2
       FROM professor_profile pp WHERE pp.id = $3`,
      [req.params.id, `Professor sent a message about exam upload`, profId],
    ).catch(() => {});

    res.status(201).json({
      ok: true,
      message: {
        id:          msg.id,
        sent_by:     req.user.id,
        body,
        created_at:  msg.created_at,
        files:       fileRow ? [fileRow] : [],
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
