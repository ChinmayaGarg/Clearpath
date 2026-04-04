/**
 * CourseDossier routes
 *
 * GET  /api/dossier/search             Search by course code (autocomplete)
 * GET  /api/dossier/exam/:examId       Get dossier + prefill suggestions for an exam
 * GET  /api/dossier/professor/:id      Get all dossiers for a professor
 * PUT  /api/dossier                    Save / update a dossier entry
 */
import { Router }         from 'express';
import { requireAuth }    from '../middleware/auth.js';
import { requireRole }    from '../middleware/role.js';
import { requireFeature } from '../middleware/feature.js';
import { z }              from 'zod';
import {
  getDossierForExam,
  getProfessorDossiers,
  saveDossier,
  prefillFromDossier,
  searchCourseDossiers,
} from '../services/dossierService.js';

const router = Router();
router.use(requireAuth);
router.use(requireFeature('course_dossier'));

const saveDossierSchema = z.object({
  professorId:       z.string().uuid(),
  courseCode:        z.string().min(1).max(50).toUpperCase(),
  preferredDelivery: z.enum(['pickup','dropped','delivery','pending']).optional().nullable(),
  typicalMaterials:  z.string().max(500).optional().nullable(),
  passwordReminder:  z.boolean().optional(),
  notes:             z.string().max(2000).optional().nullable(),
});

// ── GET /api/dossier/search ───────────────────────────────────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const q       = String(req.query.q ?? '').trim();
    const results = await searchCourseDossiers(req.tenantSchema, q);
    res.json({ ok: true, results });
  } catch (err) { next(err); }
});

// ── GET /api/dossier/exam/:examId ─────────────────────────────────────────────
router.get('/exam/:examId', async (req, res, next) => {
  try {
    const prefill = await prefillFromDossier(req.tenantSchema, req.params.examId);
    res.json({ ok: true, prefill });
  } catch (err) { next(err); }
});

// ── GET /api/dossier/professor/:id ────────────────────────────────────────────
router.get('/professor/:id',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const data = await getProfessorDossiers(req.tenantSchema, req.params.id);
      res.json({ ok: true, ...data });
    } catch (err) { next(err); }
  }
);

// ── PUT /api/dossier ──────────────────────────────────────────────────────────
router.put('/',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const data   = saveDossierSchema.parse(req.body);
      const result = await saveDossier(req.tenantSchema, {
        ...data,
        savedBy: req.user.id,
      });
      res.json({ ok: true, dossier: result });
    } catch (err) { next(err); }
  }
);

export default router;
