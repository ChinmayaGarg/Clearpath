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
  getProfessorExamRequestsForPanel,
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

const linkCourseSchema = z.object({
  courseOfferingId: z.string().uuid(),
  professorEmail: z.string().email().toLowerCase().trim(),
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

// ── GET /api/professors/course-offerings ──────────────────────────────────────
// Returns all course offerings (optionally filtered by termId) for the link form
router.get(
  "/course-offerings",
  requireRole("lead", "institution_admin"),
  async (req, res, next) => {
    try {
      const { termId } = req.query;
      const result = await tenantQuery(
        req.tenantSchema,
        `SELECT co.id, co.course_id, c.code, c.name, co.term_id, t.label AS term_label
         FROM course_offering co
         JOIN course c ON c.id = co.course_id
         JOIN term t ON t.id = co.term_id
         WHERE t.is_active = TRUE
         ${termId ? 'AND co.term_id = $1' : ''}
         ORDER BY t.start_date DESC NULLS LAST, c.code ASC`,
        termId ? [termId] : [],
      );
      res.json({ ok: true, offerings: result.rows });
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
      const termId = req.query.termId ?? null;
      const courseProfessorEmails = await listCourseProfessorEmails(
        req.tenantSchema,
        termId,
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

// ── GET /api/professors/:id/exam-requests ────────────────────────────────────
router.get(
  "/:id/exam-requests",
  requireRole("lead", "institution_admin", "counsellor"),
  async (req, res, next) => {
    try {
      const rows = await getProfessorExamRequestsForPanel(req.tenantSchema, req.params.id);
      res.json({ ok: true, examRequests: rows });
    } catch (err) { next(err); }
  }
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
        courseOfferingId,
        professorEmail,
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

      // Upsert the dossier entry linked to the course offering
      const dossier = await upsertDossier(req.tenantSchema, {
        professorId: prof.professorId,
        courseOfferingId,
        preferredDelivery,
        typicalMaterials,
        passwordReminder,
        notes,
        updatedBy: req.user.id,
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
        newValue: `${courseOfferingId}/${professorEmail}`,
        changedBy: req.user.id,
      });

      res.status(201).json({
        ok: true,
        result: {
          courseOfferingId,
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

      // Parse CSV: headers "course_code,professor_email,term"
      // term must match an existing active term label exactly (case-insensitive).
      const lines = csv.trim().split("\n");
      const headers = lines[0]
        .toLowerCase()
        .split(",")
        .map((h) => h.trim());

      if (
        !headers.includes("course_code") ||
        !headers.includes("professor_email") ||
        !headers.includes("term")
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'CSV must have headers: "course_code", "professor_email", and "term". The term value must match an existing active term label.',
        });
      }

      const courseCodeIdx = headers.indexOf("course_code");
      const emailIdx      = headers.indexOf("professor_email");
      const termIdx       = headers.indexOf("term");

      // Build lookup maps
      const courseListResult = await tenantQuery(
        req.tenantSchema,
        `SELECT id, UPPER(code) AS code FROM course WHERE is_active = TRUE`,
      );
      const courseCodeToId = Object.fromEntries(
        courseListResult.rows.map((r) => [r.code, r.id]),
      );

      const termListResult = await tenantQuery(
        req.tenantSchema,
        `SELECT id, UPPER(label) AS label FROM term WHERE is_active = TRUE`,
      );
      const termLabelToId = Object.fromEntries(
        termListResult.rows.map((r) => [r.label, r.id]),
      );

      // Build course_offering lookup: "COURSE_ID__TERM_ID" → offering_id
      const offeringResult = await tenantQuery(
        req.tenantSchema,
        `SELECT id, course_id, term_id FROM course_offering`,
      );
      const offeringKey = (courseId, termId) => `${courseId}__${termId}`;
      const offeringMap = Object.fromEntries(
        offeringResult.rows.map((r) => [offeringKey(r.course_id, r.term_id), r.id]),
      );

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
        if (!line) continue;

        results.summary.total++;

        try {
          const cols       = line.split(",").map((c) => c.trim());
          const courseCode = cols[courseCodeIdx]?.toUpperCase();
          const email      = cols[emailIdx];
          const termLabel  = cols[termIdx]?.toUpperCase();

          if (!courseCode || !email || !termLabel) {
            throw new Error("Missing course code, email, or term");
          }

          if (!z.string().email().safeParse(email).success) {
            throw new Error(`Invalid email: ${email}`);
          }

          const courseId = courseCodeToId[courseCode];
          if (!courseId) {
            throw new Error(`Course "${courseCode}" not found in master course list`);
          }

          const termId = termLabelToId[termLabel];
          if (!termId) {
            throw new Error(`Term "${cols[termIdx]}" not found or not active`);
          }

          const courseOfferingId = offeringMap[offeringKey(courseId, termId)];
          if (!courseOfferingId) {
            throw new Error(`No course offering exists for "${courseCode}" in "${cols[termIdx]}". Create it in the Terms tab first.`);
          }

          // Get or create professor
          const prof = await getOrCreateProfessorByEmail(
            req.tenantSchema,
            email.toLowerCase(),
            req.user.id,
          );

          // Link professor to course offering via dossier
          await linkCourseToProfessor(
            req.tenantSchema,
            prof.professorId,
            courseOfferingId,
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
              courseCode: cols[courseCodeIdx].toUpperCase(),
              term: cols[termIdx],
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
              courseCode: cols[courseCodeIdx].toUpperCase(),
              term: cols[termIdx],
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
