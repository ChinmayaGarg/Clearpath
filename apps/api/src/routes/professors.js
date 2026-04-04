/**
 * Professor routes
 *
 * GET  /api/professors              List all professors
 * GET  /api/professors/search       Search professors (autocomplete)
 * GET  /api/professors/:id          Get one professor with dossiers + history
 * POST /api/professors              Create a new professor
 * PUT  /api/professors/:id          Update professor profile
 * POST /api/professors/:id/link/:examId  Link professor to an exam
 */
import { Router }      from 'express';
import { z }           from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { logAction }   from '../db/queries/audit.js';
import {
  listProfessors, searchProfessors, getProfessor,
  createProfessor, updateProfessor, linkProfessorToExam,
} from '../db/queries/professors.js';

const router = Router();
router.use(requireAuth);

const createProfSchema = z.object({
  email:      z.string().email().max(254).toLowerCase().trim(),
  firstName:  z.string().min(1).max(100).trim(),
  lastName:   z.string().min(1).max(100).trim(),
  department: z.string().max(100).optional().nullable(),
  phone:      z.string().max(30).optional().nullable(),
  office:     z.string().max(100).optional().nullable(),
});

const updateProfSchema = z.object({
  firstName:  z.string().min(1).max(100).trim().optional(),
  lastName:   z.string().min(1).max(100).trim().optional(),
  department: z.string().max(100).optional().nullable(),
  phone:      z.string().max(30).optional().nullable(),
  office:     z.string().max(100).optional().nullable(),
});

// ── GET /api/professors ───────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const professors = await listProfessors(req.tenantSchema);
    res.json({ ok: true, professors });
  } catch (err) { next(err); }
});

// ── GET /api/professors/search ────────────────────────────────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ ok: true, professors: [] });
    const professors = await searchProfessors(req.tenantSchema, q);
    res.json({ ok: true, professors });
  } catch (err) { next(err); }
});

// ── GET /api/professors/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const professor = await getProfessor(req.tenantSchema, req.params.id);
    if (!professor) {
      return res.status(404).json({ ok: false, error: 'Professor not found' });
    }
    res.json({ ok: true, professor });
  } catch (err) { next(err); }
});

// ── POST /api/professors ──────────────────────────────────────────────────────
router.post('/',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const data = createProfSchema.parse(req.body);
      const emailDomain = data.email.split('@')[1];

      const professorId = await createProfessor(req.tenantSchema, {
        ...data,
        emailDomain,
        createdBy: req.user.id,
      });

      await logAction(req.tenantSchema, {
        entityType: 'user',
        entityId:   professorId,
        action:     'created',
        newValue:   `professor:${data.email}`,
        changedBy:  req.user.id,
      });

      res.status(201).json({ ok: true, professorId });
    } catch (err) { next(err); }
  }
);

// ── PUT /api/professors/:id ───────────────────────────────────────────────────
router.put('/:id',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const data = updateProfSchema.parse(req.body);
      await updateProfessor(req.tenantSchema, req.params.id, data);

      await logAction(req.tenantSchema, {
        entityType: 'professor',
        entityId:   req.params.id,
        action:     'updated',
        changedBy:  req.user.id,
      });

      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ── POST /api/professors/:id/link/:examId ─────────────────────────────────────
router.post('/:id/link/:examId',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      await linkProfessorToExam(
        req.tenantSchema,
        req.params.examId,
        req.params.id
      );

      await logAction(req.tenantSchema, {
        entityType: 'exam',
        entityId:   req.params.examId,
        action:     'updated',
        fieldName:  'professor_id',
        newValue:   req.params.id,
        changedBy:  req.user.id,
      });

      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

export default router;
