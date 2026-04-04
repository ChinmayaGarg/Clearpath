/**
 * Notification routes
 *
 * GET  /api/notifications              Get active notifications for today
 * GET  /api/notifications/settings     Get notification settings
 * PUT  /api/notifications/settings     Update notification settings
 * POST /api/notifications/dismiss/:id  Dismiss a notification
 */
import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { tenantQuery } from '../db/tenantPool.js';

const router = Router();
router.use(requireAuth);

// ── GET /api/notifications ────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const now  = new Date();

    const notifications = await buildNotifications(req.tenantSchema, date, now);
    res.json({ ok: true, notifications, date });
  } catch (err) { next(err); }
});

export default router;

// ── Notification builder ──────────────────────────────────────────────────────

async function buildNotifications(schema, date, now) {
  const notifications = [];

  // Check exam day exists
  const dayResult = await tenantQuery(schema,
    `SELECT id FROM exam_day WHERE date = $1`, [date]
  );
  if (!dayResult.rows.length) return notifications;
  const examDayId = dayResult.rows[0].id;

  // Get all active exams for the day with timing info
  const examsResult = await tenantQuery(schema,
    `SELECT
       e.id, e.course_code, e.exam_type, e.status,
       e.password, e.rwg_flag, e.professor_id,
       MIN(er.start_time) AS earliest_start,
       COUNT(er.id)       AS room_count,
       SUM(er.student_count) AS student_count
     FROM exam e
     JOIN exam_room er ON er.exam_id = e.id
     WHERE e.exam_day_id = $1
       AND e.status NOT IN ('cancelled', 'dropped')
     GROUP BY e.id
     ORDER BY earliest_start`,
    [examDayId]
  );

  const nowTimeStr = now.toTimeString().slice(0, 8); // HH:MM:SS
  const nowHour    = now.getHours() + now.getMinutes() / 60;

  for (const exam of examsResult.rows) {
    const startStr  = exam.earliest_start; // HH:MM:SS
    const [h, m]    = startStr.split(':').map(Number);
    const startHour = h + m / 60;
    const hoursUntil = startHour - nowHour;

    // ── Missing password ────────────────────────────────────────────────────
    // Brightspace/Crowdmark exams with no password, starting within 3 hours
    if (
      ['brightspace', 'crowdmark'].includes(exam.exam_type) &&
      !exam.password &&
      exam.status !== 'cancelled' &&
      hoursUntil < 3 &&
      hoursUntil > -0.5 // up to 30 min after start
    ) {
      const urgency = hoursUntil < 0.5 ? 'critical' : hoursUntil < 1 ? 'high' : 'medium';
      notifications.push({
        id:       `missing-pwd-${exam.id}`,
        type:     'missing_password',
        urgency,
        examId:   exam.id,
        title:    `Missing password — ${exam.course_code}`,
        message:  `${exam.exam_type === 'brightspace' ? 'Brightspace' : 'Crowdmark'} exam starts at ${formatTime(startStr)} with no password set`,
        action:   'Edit exam to add password',
        startTime: startStr,
        course:   exam.course_code,
      });
    }

    // ── Not emailed ─────────────────────────────────────────────────────────
    // Exams still pending within 2 hours of start time
    if (
      exam.status === 'pending' &&
      hoursUntil < 2 &&
      hoursUntil > -0.25
    ) {
      const urgency = hoursUntil < 0.5 ? 'critical' : hoursUntil < 1 ? 'high' : 'medium';
      notifications.push({
        id:       `not-emailed-${exam.id}`,
        type:     'not_emailed',
        urgency,
        examId:   exam.id,
        title:    `Not emailed — ${exam.course_code}`,
        message:  `Professor has not been contacted. Exam starts at ${formatTime(startStr)}`,
        action:   exam.professor_id ? 'Send email now' : 'Link professor and send email',
        startTime: startStr,
        course:   exam.course_code,
      });
    }

    // ── Not received ────────────────────────────────────────────────────────
    // Emailed exams not yet received within 1 hour of start
    if (
      exam.status === 'emailed' &&
      hoursUntil < 1 &&
      hoursUntil > -0.25
    ) {
      notifications.push({
        id:       `not-received-${exam.id}`,
        type:     'not_received',
        urgency:  hoursUntil < 0 ? 'critical' : 'high',
        examId:   exam.id,
        title:    `Exam not received — ${exam.course_code}`,
        message:  `Email was sent but exam not yet marked received. Starts at ${formatTime(startStr)}`,
        action:   'Follow up with professor',
        startTime: startStr,
        course:   exam.course_code,
      });
    }

    // ── RWG without Word file flag ──────────────────────────────────────────
    // RWG exam that is paper type (should be electronic for RWG students)
    if (
      exam.rwg_flag &&
      exam.exam_type === 'paper' &&
      exam.status === 'pending' &&
      hoursUntil < 4
    ) {
      notifications.push({
        id:       `rwg-paper-${exam.id}`,
        type:     'rwg_check',
        urgency:  'medium',
        examId:   exam.id,
        title:    `RWG check — ${exam.course_code}`,
        message:  `This exam has RWG students but is set as paper type. Confirm a Word file is available`,
        action:   'Verify with professor',
        startTime: startStr,
        course:   exam.course_code,
      });
    }
  }

  // ── End of day — unresolved exams ─────────────────────────────────────────
  // After 5pm, flag exams not yet picked up
  if (nowHour >= 17) {
    const unresolvedResult = await tenantQuery(schema,
      `SELECT e.id, e.course_code, MIN(er.start_time) AS start_time
       FROM exam e
       JOIN exam_room er ON er.exam_id = e.id
       WHERE e.exam_day_id = $1
         AND e.status NOT IN ('picked_up', 'cancelled', 'dropped')
       GROUP BY e.id`,
      [examDayId]
    );

    for (const exam of unresolvedResult.rows) {
      notifications.push({
        id:       `unresolved-${exam.id}`,
        type:     'unresolved',
        urgency:  'medium',
        examId:   exam.id,
        title:    `Unresolved — ${exam.course_code}`,
        message:  `This exam has not been marked as picked up`,
        action:   'Update status',
        startTime: exam.start_time,
        course:   exam.course_code,
      });
    }
  }

  // Sort by urgency then start time
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  notifications.sort((a, b) =>
    (urgencyOrder[a.urgency] - urgencyOrder[b.urgency]) ||
    a.startTime?.localeCompare(b.startTime ?? '')
  );

  return notifications;
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}
