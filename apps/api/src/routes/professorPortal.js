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
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1,
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
  courseCode: z.string().min(1).max(50).trim().toUpperCase(),
  examTypeLabel: z.enum(EXAM_TYPES),
  versionLabel: z.string().max(100).optional().nullable(),
  delivery: z.enum(DELIVERIES).default("pending"),
  materials: z.string().max(500).optional().nullable(),
  password: z.string().max(200).optional().nullable(),
  rwgFlag: z.boolean().default(false),
  isMakeup: z.boolean().default(false),
  makeupNotes: z.string().max(500).optional().nullable(),
  estimatedCopies: z.number().int().min(1).optional().nullable(),
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

    const [profileResult, statsResult, notifResult] = await Promise.all([
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
           COUNT(*)                                              AS total_uploads,
           COUNT(*) FILTER (WHERE status = 'submitted')         AS submitted,
           COUNT(*) FILTER (WHERE status = 'draft')             AS drafts,
           COUNT(DISTINCT course_code)                          AS courses
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
    ]);

    res.json({
      ok: true,
      profile: profileResult.rows[0],
      stats: statsResult.rows[0],
      unread: parseInt(notifResult.rows[0].unread),
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
    await ensureCourseAllowed(req.tenantSchema, profId, data.courseCode);
    const uploadId = await createUpload(req.tenantSchema, {
      professorProfileId: profId,
      courseCode: data.courseCode,
      examTypeLabel: data.examTypeLabel,
      versionLabel: data.versionLabel,
      delivery: data.delivery,
      materials: data.materials,
      password: data.password,
      rwgFlag: data.rwgFlag,
      isMakeup: data.isMakeup,
      makeupNotes: data.makeupNotes,
      estimatedCopies: data.estimatedCopies,
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

    // Enforce 2-day edit lock: reject if any exam date is within 2 days
    const datesResult = await tenantQuery(
      req.tenantSchema,
      `SELECT MIN(exam_date) AS earliest_date
       FROM exam_upload_date
       WHERE exam_upload_id = $1`,
      [req.params.id],
    );
    const earliest = datesResult.rows[0]?.earliest_date;
    if (earliest) {
      const diffDays = (new Date(earliest) - new Date()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 2) {
        return res.status(403).json({
          ok: false,
          error: "This exam can no longer be edited — it is within 2 days of the exam date.",
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
    if (data.rwgFlag !== undefined) dbFields.rwg_flag = data.rwgFlag;
    if (data.isMakeup !== undefined) dbFields.is_makeup = data.isMakeup;
    if (data.makeupNotes !== undefined)
      dbFields.makeup_notes = data.makeupNotes;
    if (data.estimatedCopies !== undefined)
      dbFields.estimated_copies = data.estimatedCopies;

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

// ── GET /api/portal/uploads/:id/file ─────────────────────────────────────────
// Download the uploaded file
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

// =============================================================================
// Lead-facing routes — create/manage uploads on behalf of a professor
// =============================================================================

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
        professorProfileId: req.params.profId,
        courseCode: data.courseCode,
        examTypeLabel: data.examTypeLabel,
        versionLabel: data.versionLabel,
        delivery: data.delivery,
        materials: data.materials,
        password: data.password,
        rwgFlag: data.rwgFlag,
        isMakeup: data.isMakeup,
        makeupNotes: data.makeupNotes,
        estimatedCopies: data.estimatedCopies,
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
      if (data.courseCode !== undefined) dbFields.course_code = data.courseCode;
      if (data.examTypeLabel !== undefined) dbFields.exam_type_label = data.examTypeLabel;
      if (data.versionLabel !== undefined) dbFields.version_label = data.versionLabel;
      if (data.delivery !== undefined) dbFields.delivery = data.delivery;
      if (data.materials !== undefined) dbFields.materials = data.materials;
      if (data.password !== undefined) dbFields.password = data.password;
      if (data.rwgFlag !== undefined) dbFields.rwg_flag = data.rwgFlag;
      if (data.isMakeup !== undefined) dbFields.is_makeup = data.isMakeup;
      if (data.makeupNotes !== undefined) dbFields.makeup_notes = data.makeupNotes;
      if (data.estimatedCopies !== undefined) dbFields.estimated_copies = data.estimatedCopies;

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
