/**
 * Exam routes
 *
 * GET    /api/exams/:id                Get one exam
 * POST   /api/exams                    Create exam on a book
 * PATCH  /api/exams/:id                Update exam fields
 * DELETE /api/exams/:id                Delete exam (pending/cancelled only)
 * PATCH  /api/exams/:id/status         Advance exam status
 * GET    /api/exams/:id/history        Get status history
 * POST   /api/exams/:id/rooms          Add/update a room
 * DELETE /api/exams/:id/rooms/:roomId  Remove a room
 */
import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import {
  createExamSchema, updateExamSchema,
  updateStatusSchema, upsertRoomSchema,
} from '../utils/validation.js';
import {
  getOneExam, addExam, editExam, removeExam,
  changeExamStatus, saveExamRoom, removeExamRoom,
  getExamHistory,
} from '../services/bookService.js';

const router = Router();
router.use(requireAuth);

// ── GET /api/exams/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const exam = await getOneExam(req.tenantSchema, req.params.id);
    res.json({ ok: true, exam });
  } catch (err) { next(err); }
});

// ── POST /api/exams ───────────────────────────────────────────────────────────
router.post('/',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const { examDayId, ...examData } = createExamSchema
        .extend({ examDayId: require('zod').z.string().uuid() })
        .parse(req.body);

      const exam = await addExam(
        req.tenantSchema, examDayId, examData, req.user.id
      );
      res.status(201).json({ ok: true, exam });
    } catch (err) { next(err); }
  }
);

// ── PATCH /api/exams/:id ──────────────────────────────────────────────────────
router.patch('/:id',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const fields = updateExamSchema.parse(req.body);
      const exam   = await editExam(
        req.tenantSchema, req.params.id, fields, req.user.id
      );
      res.json({ ok: true, exam });
    } catch (err) { next(err); }
  }
);

// ── DELETE /api/exams/:id ─────────────────────────────────────────────────────
router.delete('/:id',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      await removeExam(req.tenantSchema, req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ── PATCH /api/exams/:id/status ───────────────────────────────────────────────
router.patch('/:id/status',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const { status, note } = updateStatusSchema.parse(req.body);
      const result = await changeExamStatus(req.tenantSchema, req.params.id, {
        toStatus:  status,
        changedBy: req.user.id,
        note,
      });
      res.json({ ok: true, ...result });
    } catch (err) { next(err); }
  }
);

// ── GET /api/exams/:id/history ────────────────────────────────────────────────
router.get('/:id/history', async (req, res, next) => {
  try {
    const history = await getExamHistory(req.tenantSchema, req.params.id);
    res.json({ ok: true, history });
  } catch (err) { next(err); }
});

// ── POST /api/exams/:id/rooms ─────────────────────────────────────────────────
router.post('/:id/rooms',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const data = upsertRoomSchema.parse(req.body);
      const room = await saveExamRoom(
        req.tenantSchema, req.params.id, data, req.user.id
      );
      res.status(201).json({ ok: true, room });
    } catch (err) { next(err); }
  }
);

// ── DELETE /api/exams/:id/rooms/:roomId ───────────────────────────────────────
router.delete('/:id/rooms/:roomId',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      await removeExamRoom(
        req.tenantSchema, req.params.id, req.params.roomId, req.user.id
      );
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

export default router;

// ── Email routes (added to exams router) ─────────────────────────────────────
import {
  composeExamEmail,
  sendExamEmail,
  getExamEmailLog,
} from '../services/emailService.js';
import { requireFeature } from '../middleware/feature.js';

// GET  /api/exams/:id/email         — compose preview (no send)
router.get('/:id/email',
  requireRole('lead', 'institution_admin'),
  requireFeature('prof_email_direct'),
  async (req, res, next) => {
    try {
      const composed = await composeExamEmail(
        req.tenantSchema,
        req.params.id,
        req.institutionId
      );
      res.json({ ok: true, ...composed });
    } catch (err) { next(err); }
  }
);

// POST /api/exams/:id/email         — send the email
router.post('/:id/email',
  requireRole('lead', 'institution_admin'),
  requireFeature('prof_email_direct'),
  async (req, res, next) => {
    try {
      const { toEmail, subject, htmlBody, textBody } = req.body;

      if (!toEmail || !subject) {
        return res.status(400).json({
          ok: false, error: 'toEmail and subject are required',
        });
      }

      const result = await sendExamEmail(
        req.tenantSchema,
        req.institutionId,
        {
          examId:   req.params.id,
          toEmail,
          subject,
          htmlBody,
          textBody,
          sentBy:   req.user.id,
        }
      );

      res.json({ ok: true, ...result });
    } catch (err) { next(err); }
  }
);

// GET  /api/exams/:id/email/log     — email history for this exam
router.get('/:id/email/log',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const log = await getExamEmailLog(req.tenantSchema, req.params.id);
      res.json({ ok: true, log });
    } catch (err) { next(err); }
  }
);
