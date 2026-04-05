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
import { Router }      from 'express';
import { z }           from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
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
} from '../db/queries/examUploads.js';
import { tenantQuery } from '../db/tenantPool.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('professor', 'institution_admin', 'lead'));

const EXAM_TYPES = ['midterm','endterm','tutorial','lab','quiz','assignment','other'];
const DELIVERIES = ['pickup','dropped','delivery','pending'];

const createUploadSchema = z.object({
  courseCode:     z.string().min(1).max(50).trim().toUpperCase(),
  examTypeLabel:  z.enum(EXAM_TYPES),
  versionLabel:   z.string().max(100).optional().nullable(),
  delivery:       z.enum(DELIVERIES).default('pending'),
  materials:      z.string().max(500).optional().nullable(),
  password:       z.string().max(200).optional().nullable(),
  rwgFlag:        z.boolean().default(false),
  isMakeup:       z.boolean().default(false),
  makeupNotes:    z.string().max(500).optional().nullable(),
});

const addDateSchema = z.object({
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlot: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
});

const respondSchema = z.object({
  status:        z.enum(['approved','denied']),
  professorNote: z.string().max(500).optional().nullable(),
});

// ── Helper: get and verify professor profile ──────────────────────────────────
async function getProfId(req, res) {
  const profId = await getProfessorProfileId(req.tenantSchema, req.user.id);
  if (!profId) {
    res.status(403).json({ ok: false, error: 'No professor profile found for your account' });
    return null;
  }
  return profId;
}

// ── GET /api/portal/me ────────────────────────────────────────────────────────
router.get('/me', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const [profileResult, statsResult, notifResult] = await Promise.all([
      tenantQuery(req.tenantSchema,
        `SELECT pp.id, pp.department, pp.phone, pp.office,
                u.first_name, u.last_name, u.email
         FROM professor_profile pp
         JOIN "user" u ON u.id = pp.user_id
         WHERE pp.id = $1`,
        [profId]
      ),
      tenantQuery(req.tenantSchema,
        `SELECT
           COUNT(*)                                              AS total_uploads,
           COUNT(*) FILTER (WHERE status = 'submitted')         AS submitted,
           COUNT(*) FILTER (WHERE status = 'draft')             AS drafts,
           COUNT(DISTINCT course_code)                          AS courses
         FROM exam_upload WHERE professor_profile_id = $1`,
        [profId]
      ),
      tenantQuery(req.tenantSchema,
        `SELECT COUNT(*) AS unread
         FROM upload_notification
         WHERE professor_profile_id = $1 AND is_read = FALSE`,
        [profId]
      ),
    ]);

    res.json({
      ok:      true,
      profile: profileResult.rows[0],
      stats:   statsResult.rows[0],
      unread:  parseInt(notifResult.rows[0].unread),
    });
  } catch (err) { next(err); }
});

// ── GET /api/portal/uploads ───────────────────────────────────────────────────
router.get('/uploads', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const uploads = await listUploadsForProfessor(req.tenantSchema, profId);
    res.json({ ok: true, uploads });
  } catch (err) { next(err); }
});

// ── POST /api/portal/uploads ──────────────────────────────────────────────────
router.post('/uploads', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const data     = createUploadSchema.parse(req.body);
    const uploadId = await createUpload(req.tenantSchema, {
      professorProfileId: profId,
      courseCode:         data.courseCode,
      examTypeLabel:      data.examTypeLabel,
      versionLabel:       data.versionLabel,
      delivery:           data.delivery,
      materials:          data.materials,
      password:           data.password,
      rwgFlag:            data.rwgFlag,
      isMakeup:           data.isMakeup,
      makeupNotes:        data.makeupNotes,
    });

    res.status(201).json({ ok: true, uploadId });
  } catch (err) { next(err); }
});

// ── GET /api/portal/uploads/:id ───────────────────────────────────────────────
router.get('/uploads/:id', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const upload = await getUpload(req.tenantSchema, req.params.id, profId);
    if (!upload) return res.status(404).json({ ok: false, error: 'Upload not found' });

    res.json({ ok: true, upload });
  } catch (err) { next(err); }
});

// ── PUT /api/portal/uploads/:id ───────────────────────────────────────────────
router.put('/uploads/:id', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const data = createUploadSchema.partial().parse(req.body);
    const dbFields = {};
    if (data.courseCode    !== undefined) dbFields.course_code     = data.courseCode;
    if (data.examTypeLabel !== undefined) dbFields.exam_type_label = data.examTypeLabel;
    if (data.versionLabel  !== undefined) dbFields.version_label   = data.versionLabel;
    if (data.delivery      !== undefined) dbFields.delivery        = data.delivery;
    if (data.materials     !== undefined) dbFields.materials       = data.materials;
    if (data.password      !== undefined) dbFields.password        = data.password;
    if (data.rwgFlag       !== undefined) dbFields.rwg_flag        = data.rwgFlag;
    if (data.isMakeup      !== undefined) dbFields.is_makeup       = data.isMakeup;
    if (data.makeupNotes   !== undefined) dbFields.makeup_notes    = data.makeupNotes;

    await updateUpload(req.tenantSchema, req.params.id, profId, dbFields);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /api/portal/uploads/:id/submit ──────────────────────────────────────
router.post('/uploads/:id/submit', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    await submitUpload(req.tenantSchema, req.params.id, profId);
    res.json({ ok: true, message: 'Exam submitted successfully' });
  } catch (err) { next(err); }
});

// ── POST /api/portal/uploads/:id/dates ───────────────────────────────────────
router.post('/uploads/:id/dates', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const data   = addDateSchema.parse(req.body);
    const dateId = await addUploadDate(req.tenantSchema, req.params.id, {
      examDate:  data.examDate,
      timeSlot:  data.timeSlot ?? null,
    });

    res.status(201).json({ ok: true, dateId });
  } catch (err) { next(err); }
});

// ── DELETE /api/portal/uploads/:id/dates/:dateId ─────────────────────────────
router.delete('/uploads/:id/dates/:dateId', async (req, res, next) => {
  try {
    await removeUploadDate(req.tenantSchema, req.params.dateId, req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/portal/reuse ─────────────────────────────────────────────────────
router.get('/reuse', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const requests = await getPendingReuseRequests(req.tenantSchema, profId);
    res.json({ ok: true, requests });
  } catch (err) { next(err); }
});

// ── POST /api/portal/reuse/:id/respond ───────────────────────────────────────
router.post('/reuse/:id/respond', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const { status, professorNote } = respondSchema.parse(req.body);
    await respondToReuseRequest(req.tenantSchema, req.params.id, {
      status, professorNote, professorProfileId: profId,
    });

    res.json({ ok: true, message: `Request ${status}` });
  } catch (err) { next(err); }
});

// ── GET /api/portal/notifications ────────────────────────────────────────────
router.get('/notifications', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    const notifications = await getProfessorNotifications(req.tenantSchema, profId);
    res.json({ ok: true, notifications });
  } catch (err) { next(err); }
});

// ── POST /api/portal/notifications/read ──────────────────────────────────────
router.post('/notifications/read', async (req, res, next) => {
  try {
    const profId = await getProfId(req, res);
    if (!profId) return;

    await markNotificationsRead(req.tenantSchema, profId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
