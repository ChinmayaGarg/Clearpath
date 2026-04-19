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
import {
  listPendingRegistrations,
  getRegistrationRequest,
  markUnderReview,
  approveRegistration,
  rejectRegistration,
  updateProviderFormStatus,
} from "../db/queries/studentRegistration.js";

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
        req.tenantSchema,
        req.user.id,
      );

      const row = await addStudentAccommodation(req.tenantSchema, {
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
  grantedCodes: z.array(z.object({
    accommodationCodeId: z.string().uuid(),
    notes:     z.string().max(1000).optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
  })).default([]),
});

router.post("/registrations/:id/approve", async (req, res, next) => {
  try {
    const { grantedCodes } = ApproveSchema.parse(req.body);
    await approveRegistration(req.tenantSchema, req.params.id, {
      reviewedBy:  req.user.id,
      grantedCodes,
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

export default router;
