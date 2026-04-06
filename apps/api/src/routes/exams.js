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

// ── GET /api/exams/:id/upload ─────────────────────────────────────────────────
// Full upload panel data for the lead-facing exam card
router.get('/:id/upload',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const schema = req.tenantSchema;
      const examId = req.params.id;

      // Get matched upload with dates
      const uploadResult = await import('../db/tenantPool.js').then(
        ({ tenantQuery }) => tenantQuery(schema,
          `SELECT
             eu.id, eu.course_code, eu.exam_type_label, eu.version_label,
             eu.delivery, eu.materials, eu.password, eu.rwg_flag,
             eu.is_makeup, eu.makeup_notes, eu.status, eu.submitted_at,
             up.first_name || ' ' || up.last_name AS professor_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'exam_date',    eud.exam_date,
                   'time_slot',    eud.time_slot,
                   'match_status', eud.match_status
                 ) ORDER BY eud.exam_date
               ) FILTER (WHERE eud.id IS NOT NULL),
               '[]'
             ) AS dates
           FROM exam e
           JOIN exam_upload       eu  ON eu.id  = e.exam_upload_id
           JOIN professor_profile pp  ON pp.id  = eu.professor_profile_id
           JOIN "user"            up  ON up.id  = pp.user_id
           LEFT JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
           WHERE e.id = $1
           GROUP BY eu.id, up.first_name, up.last_name`,
          [examId]
        )
      );

      // Get any pending reuse requests for this exam
      const reuseResult = await import('../db/tenantPool.js').then(
        ({ tenantQuery }) => tenantQuery(schema,
          `SELECT
             err.id, err.status, err.professor_note, err.requested_at, err.responded_at,
             eu.course_code, eu.version_label, eu.exam_type_label
           FROM exam_reuse_request err
           JOIN exam_upload eu ON eu.id = err.original_upload_id
           WHERE err.makeup_exam_id = $1
           ORDER BY err.requested_at DESC
           LIMIT 1`,
          [examId]
        )
      );

      // Get exam makeup status
      const makeupResult = await import('../db/tenantPool.js').then(
        ({ tenantQuery }) => tenantQuery(schema,
          `SELECT
             COUNT(*) FILTER (WHERE a.is_makeup) AS makeup_count,
             COUNT(*) AS total_appointments
           FROM appointment a
           JOIN exam_room er ON er.id = a.exam_room_id
           WHERE er.exam_id = $1`,
          [examId]
        )
      );

      res.json({
        ok:           true,
        upload:       uploadResult.rows[0] ?? null,
        reuseRequest: reuseResult.rows[0]  ?? null,
        makeupStats:  makeupResult.rows[0],
      });
    } catch (err) { next(err); }
  }
);

// ── GET /api/exams/:id/uploads/available ─────────────────────────────────────
// List submitted uploads for the same course — for manual linking
router.get('/:id/uploads/available',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const { tenantQuery } = await import('../db/tenantPool.js');

      // Get exam course code first
      const examResult = await tenantQuery(req.tenantSchema,
        `SELECT course_code, cross_listed_code FROM exam WHERE id = $1`,
        [req.params.id]
      );
      if (!examResult.rows.length) {
        return res.status(404).json({ ok: false, error: 'Exam not found' });
      }
      const { course_code, cross_listed_code } = examResult.rows[0];

      // Find submitted uploads for this course
      const uploads = await tenantQuery(req.tenantSchema,
        `SELECT
           eu.id, eu.course_code, eu.exam_type_label,
           eu.version_label, eu.delivery, eu.materials,
           eu.password, eu.rwg_flag, eu.is_makeup,
           eu.status, eu.submitted_at,
           u.first_name || ' ' || u.last_name AS professor_name,
           COALESCE(
             json_agg(
               json_build_object('exam_date', eud.exam_date, 'time_slot', eud.time_slot)
               ORDER BY eud.exam_date
             ) FILTER (WHERE eud.id IS NOT NULL),
             '[]'
           ) AS dates
         FROM exam_upload eu
         JOIN professor_profile pp ON pp.id = eu.professor_profile_id
         JOIN "user" u ON u.id = pp.user_id
         LEFT JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
         WHERE eu.status = 'submitted'
           AND (
             UPPER(eu.course_code) = UPPER($1)
             OR UPPER(eu.course_code) = UPPER($2)
           )
         GROUP BY eu.id, u.first_name, u.last_name
         ORDER BY eu.submitted_at DESC`,
        [course_code, cross_listed_code ?? course_code]
      );

      res.json({ ok: true, uploads: uploads.rows });
    } catch (err) { next(err); }
  }
);

// ── POST /api/exams/:id/uploads/:uploadId/link ────────────────────────────────
// Manually link an upload to an exam
router.post('/:id/uploads/:uploadId/link',
  requireRole('lead', 'institution_admin'),
  async (req, res, next) => {
    try {
      const { tenantQuery } = await import('../db/tenantPool.js');

      await tenantQuery(req.tenantSchema,
        `UPDATE exam SET exam_upload_id = $1, updated_at = NOW() WHERE id = $2`,
        [req.params.uploadId, req.params.id]
      );

      // Mark upload date as matched
      await tenantQuery(req.tenantSchema,
        `UPDATE exam_upload_date
         SET match_status = 'matched', matched_exam_id = $1
         WHERE exam_upload_id = $2`,
        [req.params.id, req.params.uploadId]
      );

      res.json({ ok: true, message: 'Upload linked to exam' });
    } catch (err) { next(err); }
  }
);
