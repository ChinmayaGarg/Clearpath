/**
 * Professor routes
 *
 * GET  /api/professors              List all professors
 * GET  /api/professors/search       Search professors (autocomplete)
 * GET  /api/professors/terms        List available terms
 * GET  /api/professors/:id          Get one professor with dossiers + history
 * POST /api/professors              Create a new professor
 * PUT  /api/professors/:id          Update professor profile
 * POST /api/professors/:id/link/:examId  Link professor to an exam
 * POST /api/professors/link-courses        Link courses to professor email (form)
 * POST /api/professors/link-courses/bulk   Link courses to professor email (CSV)
 */
import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { logAction } from "../db/queries/audit.js";
import { tenantQuery, tenantTransaction } from "../db/tenantPool.js";
import pool from "../db/pool.js";
import {
  listProfessors,
  searchProfessors,
  listCourseProfessorEmails,
  listAvailableTerms,
  getProfessor,
  createProfessor,
  updateProfessor,
  linkProfessorToExam,
  getOrCreateProfessorByEmail,
  linkCourseToProfessor,
} from "../db/queries/professors.js";
import { upsertDossier } from "../db/queries/dossier.js";
import { logger } from "../utils/logger.js";

const router = Router();
router.use(requireAuth);

const createProfSchema = z.object({
  email: z.string().email().max(254).toLowerCase().trim(),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  department: z.string().max(100).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  office: z.string().max(100).optional().nullable(),
});

const updateProfSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  department: z.string().max(100).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  office: z.string().max(100).optional().nullable(),
});

// Course code format: 2-4 uppercase letters, space, 4 digits (e.g., ABCD 1234)
const COURSE_CODE_REGEX = /^[A-Z]{2,4}\s\d{4}$/;

const linkCourseSchema = z.object({
  courseCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (code) => COURSE_CODE_REGEX.test(code),
      "Course code must be in format: ABCD 1234 (2-4 letters, space, 4 digits)",
    ),
  professorEmail: z.string().email().toLowerCase().trim(),
  term: z.string().min(1).max(100).trim().default("current"),
  preferredDelivery: z
    .enum(["pickup", "dropped", "delivery", "pending"])
    .optional(),
  typicalMaterials: z.string().max(1000).optional().nullable(),
  passwordReminder: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});

// ── GET /api/professors ───────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const professors = await listProfessors(req.tenantSchema);
    res.json({ ok: true, professors });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/professors/search ────────────────────────────────────────────────
router.get("/search", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ ok: true, professors: [] });
    const professors = await searchProfessors(req.tenantSchema, q);
    res.json({ ok: true, professors });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/professors/terms ──────────────────────────────────────────────────
router.get(
  "/terms",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const terms = await listAvailableTerms(req.tenantSchema);
      res.json({ ok: true, terms });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/professors/course-emails ─────────────────────────────────────────
router.get(
  "/course-emails",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const term = req.query.term ?? null;
      const courseProfessorEmails = await listCourseProfessorEmails(
        req.tenantSchema,
        term,
      );
      res.json({ ok: true, courseProfessorEmails });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/professors/:id ───────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const professor = await getProfessor(req.tenantSchema, req.params.id);
    console.log("Got professor:", professor);
    if (!professor) {
      return res.status(404).json({ ok: false, error: "Professor not found" });
    }
    res.json({ ok: true, professor });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/professors ──────────────────────────────────────────────────────
router.post(
  "/",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const data = createProfSchema.parse(req.body);
      const emailDomain = data.email.split("@")[1];

      const professorId = await createProfessor(req.tenantSchema, {
        ...data,
        emailDomain,
        createdBy: req.user.id,
      });

      await logAction(req.tenantSchema, {
        entityType: "user",
        entityId: professorId,
        action: "created",
        newValue: `professor:${data.email}`,
        changedBy: req.user.id,
      });

      res.status(201).json({ ok: true, professorId });
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /api/professors/:id ───────────────────────────────────────────────────
router.put(
  "/:id",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const data = updateProfSchema.parse(req.body);
      await updateProfessor(req.tenantSchema, req.params.id, data);

      await logAction(req.tenantSchema, {
        entityType: "professor",
        entityId: req.params.id,
        action: "updated",
        changedBy: req.user.id,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/professors/:id/link/:examId ─────────────────────────────────────
router.post(
  "/:id/link/:examId",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      await linkProfessorToExam(
        req.tenantSchema,
        req.params.examId,
        req.params.id,
      );

      await logAction(req.tenantSchema, {
        entityType: "exam",
        entityId: req.params.examId,
        action: "updated",
        fieldName: "professor_id",
        newValue: req.params.id,
        changedBy: req.user.id,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/professors/link-courses ──────────────────────────────────────────
// Link a single course to a professor email (form submission)
router.post(
  "/link-courses",
  requireAuth,
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const {
        courseCode,
        professorEmail,
        term,
        preferredDelivery,
        typicalMaterials,
        passwordReminder,
        notes,
      } = linkCourseSchema.parse(req.body);

      // Get or create professor by email
      const prof = await getOrCreateProfessorByEmail(
        req.tenantSchema,
        professorEmail,
        req.user.id,
      );

      // Upsert the dossier entry with details, defaulting term to current.
      const dossier = await upsertDossier(req.tenantSchema, {
        professorId: prof.professorId,
        courseCode,
        preferredDelivery,
        typicalMaterials,
        passwordReminder,
        notes,
        updatedBy: req.user.id,
        term,
      });

      // If new user, generate magic link token
      let magicLink = null;
      if (prof.isNewUser) {
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await tenantQuery(
          req.tenantSchema,
          `INSERT INTO password_reset_token (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)`,
          [prof.userId, token, expiresAt],
        );

        magicLink = {
          token,
          url: `${process.env.APP_URL ?? "http://localhost:5173"}/claim/${token}`,
          expiresAt,
        };

        // Log the link in dev mode
        if (process.env.NODE_ENV !== "production") {
          logger.info("MAGIC LINK (dev)", {
            email: professorEmail,
            url: magicLink.url,
          });
          console.log(`\n[MAGIC LINK] ${professorEmail}\n${magicLink.url}\n`);
        }
      }

      await logAction(req.tenantSchema, {
        entityType: "course_dossier",
        entityId: dossier.id,
        action: prof.isNewUser ? "created_with_invite" : "created",
        newValue: `${courseCode}/${term}/${professorEmail}`,
        changedBy: req.user.id,
      });

      res.status(201).json({
        ok: true,
        result: {
          courseCode,
          term,
          professorEmail,
          isNewProfessor: prof.isNewUser,
          magicLink: prof.isNewUser ? magicLink : null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/professors/link-courses/bulk ────────────────────────────────────
// Link multiple courses to professor emails via CSV
router.post(
  "/link-courses/bulk",
  requireAuth,
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const { csv } = z
        .object({
          csv: z.string(),
        })
        .parse(req.body);

      // Parse CSV: expect headers "course_code,professor_email" and optional "term"
      const lines = csv.trim().split("\n");
      const headers = lines[0]
        .toLowerCase()
        .split(",")
        .map((h) => h.trim());

      if (
        !headers.includes("course_code") ||
        !headers.includes("professor_email")
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'CSV must have headers: "course_code" and "professor_email". Optional: "term" (defaults to "current")',
        });
      }

      const courseCodeIdx = headers.indexOf("course_code");
      const emailIdx = headers.indexOf("professor_email");
      const termIdx = headers.indexOf("term");

      const results = {
        created: [],
        linkedExisting: [],
        errors: [],
        summary: {
          total: 0,
          success: 0,
          failed: 0,
        },
      };

      // Process each row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        results.summary.total++;

        try {
          const cols = line.split(",").map((c) => c.trim());
          const courseCode = cols[courseCodeIdx];
          const email = cols[emailIdx];
          const term =
            termIdx >= 0 && cols[termIdx] ? cols[termIdx] : "current";

          // Validate
          if (!courseCode || !email) {
            throw new Error("Missing course code or email");
          }

          if (!COURSE_CODE_REGEX.test(courseCode)) {
            throw new Error(
              `Invalid course code: ${courseCode} (expected format: ABCD 1234)`,
            );
          }

          if (!z.string().email().safeParse(email).success) {
            throw new Error(`Invalid email: ${email}`);
          }

          // Get or create professor
          const prof = await getOrCreateProfessorByEmail(
            req.tenantSchema,
            email.toLowerCase(),
            req.user.id,
          );

          // Link course with term
          await linkCourseToProfessor(
            req.tenantSchema,
            prof.professorId,
            courseCode.toUpperCase(),
            term,
            req.user.id,
          );

          // Generate magic link if new user
          if (prof.isNewUser) {
            const token = crypto.randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

            await tenantQuery(
              req.tenantSchema,
              `INSERT INTO password_reset_token (user_id, token_hash, expires_at)
               VALUES ($1, $2, $3)`,
              [prof.userId, token, expiresAt],
            );

            results.created.push({
              courseCode: courseCode.toUpperCase(),
              term,
              professorEmail: email.toLowerCase(),
              magicLink: `${process.env.APP_URL ?? "http://localhost:5173"}/claim/${token}`,
            });

            if (process.env.NODE_ENV !== "production") {
              console.log(
                `\n[MAGIC LINK] ${email}\n${results.created.at(-1).magicLink}\n`,
              );
            }
          } else {
            results.linkedExisting.push({
              courseCode: courseCode.toUpperCase(),
              term,
              professorEmail: email.toLowerCase(),
            });
          }

          results.summary.success++;
        } catch (rowErr) {
          results.errors.push({
            rowNumber: i + 1,
            line,
            error: rowErr.message,
          });
          results.summary.failed++;
        }
      }

      res.json({
        ok: true,
        results,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
