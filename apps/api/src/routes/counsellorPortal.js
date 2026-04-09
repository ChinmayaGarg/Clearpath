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
 */
import { Router } from "express";
import { z } from "zod";
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
} from "../db/queries/counsellor.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("counsellor", "institution_admin"));

// ── GET /api/counsellor/me ────────────────────────────────────────────────────
router.get("/me", async (req, res, next) => {
  try {
    const schema = req.user.schema;
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
    const codes = await listAccommodationCodes(req.user.schema);
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
    const students = await searchStudents(req.user.schema, q);
    res.json({ students });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/counsellor/students/:id ─────────────────────────────────────────
router.get("/students/:id", async (req, res, next) => {
  try {
    const student = await getStudentDetail(req.user.schema, req.params.id);
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json({ student });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/counsellor/students/:id/exams ───────────────────────────────────
router.get("/students/:id/exams", async (req, res, next) => {
  try {
    const rows = await getStudentExams(req.user.schema, req.params.id);
    const exams = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        accommodations: await getAppointmentAccommodations(
          req.user.schema,
          row.appointment_id,
        ),
      })),
    );
    res.json({ exams });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/counsellor/students/:id/accommodations ─────────────────────────
const addAccSchema = z.object({
  accommodationCodeId: z.string().uuid(),
  term: z.string().min(1).max(100),
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

      const { accommodationCodeId, term, notes } = parsed.data;
      const counsellorProfileId = await getCounsellorProfileId(
        req.user.schema,
        req.user.id,
      );

      const row = await addStudentAccommodation(req.user.schema, {
        studentProfileId: req.params.id,
        counsellorProfileId,
        accommodationCodeId,
        term,
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
        : await getCounsellorProfileId(req.user.schema, req.user.id);

      const deleted = await removeStudentAccommodation(
        req.user.schema,
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

export default router;
