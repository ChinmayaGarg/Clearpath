/**
 * Student routes
 *
 * GET  /api/students              List all students (paginated)
 * GET  /api/students/search       Search students
 * GET  /api/students/:id          Get student profile + full history
 * PUT  /api/students/:id          Update phone, do_not_call, notes
 */
import { Router }      from 'express';
import { z }           from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { logAction }   from '../db/queries/audit.js';
import {
  listStudents,
  searchStudents,
  getStudent,
  updateStudent,
} from '../db/queries/students.js';

const router = Router();
router.use(requireAuth);

const updateStudentSchema = z.object({
  phone:      z.string().max(30).optional().nullable(),
  doNotCall:  z.boolean().optional(),
  notes:      z.string().max(1000).optional().nullable(),
});

// ── GET /api/students ─────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  ?? '1'));
    const limit = Math.min(100, parseInt(req.query.limit ?? '50'));
    const data  = await listStudents(req.tenantSchema, { page, limit });
    res.json({ ok: true, ...data });
  } catch (err) { next(err); }
});

// ── GET /api/students/search ──────────────────────────────────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ ok: true, students: [] });
    const students = await searchStudents(req.tenantSchema, q);
    res.json({ ok: true, students });
  } catch (err) { next(err); }
});

// ── GET /api/students/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const student = await getStudent(req.tenantSchema, req.params.id);
    if (!student) {
      return res.status(404).json({ ok: false, error: 'Student not found' });
    }
    res.json({ ok: true, student });
  } catch (err) { next(err); }
});

// ── PUT /api/students/:id ─────────────────────────────────────────────────────
router.put('/:id',
  requireRole('lead', 'institution_admin', 'counsellor'),
  async (req, res, next) => {
    try {
      const data    = updateStudentSchema.parse(req.body);
      const updated = await updateStudent(req.tenantSchema, req.params.id, data);
      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Student not found' });
      }

      await logAction(req.tenantSchema, {
        entityType: 'student',
        entityId:   req.params.id,
        action:     'updated',
        changedBy:  req.user.id,
      });

      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

export default router;
