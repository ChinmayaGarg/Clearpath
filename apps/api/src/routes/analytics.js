/**
 * Analytics routes
 *
 * GET /api/analytics/overview          Season-level summary stats
 * GET /api/analytics/daily?from&to     Day-by-day exam + student counts
 * GET /api/analytics/leads             Per-lead activity breakdown
 * GET /api/analytics/email             Email send rates and delivery stats
 * GET /api/analytics/accommodations    Most common accommodation codes
 */
import { Router }         from 'express';
import { requireAuth }    from '../middleware/auth.js';
import { requireRole }    from '../middleware/role.js';
import { requireFeature } from '../middleware/feature.js';
import { tenantQuery }    from '../db/tenantPool.js';

const router = Router();
router.use(requireAuth);
router.use(requireFeature('analytics_dashboard'));
router.use(requireRole('institution_admin', 'lead'));

// ── GET /api/analytics/overview ───────────────────────────────────────────────
router.get('/overview', async (req, res, next) => {
  try {
    const { from, to } = getDateRange(req.query);

    const [examStats, emailStats, studentStats, statusStats] = await Promise.all([

      // Exam and student counts
      tenantQuery(req.tenantSchema,
        `SELECT
           COUNT(DISTINCT ed.id)                              AS total_days,
           COUNT(DISTINCT e.id)                              AS total_exams,
           COUNT(DISTINCT e.id) FILTER (WHERE e.rwg_flag)   AS rwg_exams,
           COALESCE(SUM(er.student_count), 0)                AS total_students,
           COUNT(DISTINCT e.id) FILTER (
             WHERE e.status = 'pending'
           )                                                 AS pending_exams,
           COUNT(DISTINCT e.id) FILTER (
             WHERE e.status = 'picked_up'
           )                                                 AS completed_exams
         FROM exam_day ed
         JOIN exam      e  ON e.exam_day_id = ed.id
         LEFT JOIN exam_room er ON er.exam_id = e.id
         WHERE ed.date BETWEEN $1 AND $2`,
        [from, to]
      ),

      // Email stats
      tenantQuery(req.tenantSchema,
        `SELECT
           COUNT(*)                                              AS total_sent,
           COUNT(*) FILTER (WHERE delivery_status = 'delivered') AS delivered,
           COUNT(*) FILTER (WHERE delivery_status = 'bounced')   AS bounced,
           COUNT(*) FILTER (WHERE delivery_status = 'failed')    AS failed,
           COUNT(DISTINCT sent_by)                               AS active_senders
         FROM email_log
         WHERE sent_at::date BETWEEN $1 AND $2`,
        [from, to]
      ),

      // Unique students served
      tenantQuery(req.tenantSchema,
        `SELECT COUNT(DISTINCT a.student_profile_id) AS unique_students
         FROM appointment a
         JOIN exam_room      er ON er.id = a.exam_room_id
         JOIN exam           e  ON e.id  = er.exam_id
         JOIN exam_day       ed ON ed.id = e.exam_day_id
         WHERE ed.date BETWEEN $1 AND $2
           AND a.is_cancelled = FALSE`,
        [from, to]
      ),

      // Status breakdown
      tenantQuery(req.tenantSchema,
        `SELECT e.status, COUNT(*) AS count
         FROM exam e
         JOIN exam_day ed ON ed.id = e.exam_day_id
         WHERE ed.date BETWEEN $1 AND $2
         GROUP BY e.status`,
        [from, to]
      ),
    ]);

    const statusMap = Object.fromEntries(
      statusStats.rows.map(r => [r.status, parseInt(r.count)])
    );

    res.json({
      ok: true,
      period: { from, to },
      overview: {
        ...examStats.rows[0],
        unique_students:  studentStats.rows[0].unique_students,
        emails_sent:      emailStats.rows[0].total_sent,
        emails_delivered: emailStats.rows[0].delivered,
        emails_bounced:   emailStats.rows[0].bounced,
        active_senders:   emailStats.rows[0].active_senders,
        status_breakdown: statusMap,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/daily ──────────────────────────────────────────────────
router.get('/daily', async (req, res, next) => {
  try {
    const { from, to } = getDateRange(req.query);

    const result = await tenantQuery(req.tenantSchema,
      `SELECT
         ed.date,
         COUNT(DISTINCT e.id)                              AS exam_count,
         COALESCE(SUM(er.student_count), 0)                AS student_count,
         COUNT(DISTINCT e.id) FILTER (WHERE e.rwg_flag)   AS rwg_count,
         COUNT(DISTINCT e.id) FILTER (
           WHERE e.status = 'picked_up'
         )                                                 AS completed_count,
         COUNT(DISTINCT e.id) FILTER (
           WHERE e.status = 'pending'
         )                                                 AS pending_count
       FROM exam_day ed
       JOIN exam      e  ON e.exam_day_id = ed.id
       LEFT JOIN exam_room er ON er.exam_id = e.id
       WHERE ed.date BETWEEN $1 AND $2
       GROUP BY ed.date
       ORDER BY ed.date`,
      [from, to]
    );

    res.json({ ok: true, days: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/leads ──────────────────────────────────────────────────
router.get('/leads', async (req, res, next) => {
  try {
    const { from, to } = getDateRange(req.query);

    const result = await tenantQuery(req.tenantSchema,
      `SELECT
         u.first_name || ' ' || u.last_name   AS lead_name,
         u.email,
         COUNT(DISTINCT el.id)                AS emails_sent,
         COUNT(DISTINCT se.id)                AS status_changes,
         COUNT(DISTINCT al.id)                AS audit_actions,
         MAX(al.created_at)                   AS last_active
       FROM "user" u
       JOIN user_role ur ON ur.user_id = u.id
         AND ur.role IN ('lead', 'institution_admin')
         AND ur.is_active = TRUE
       LEFT JOIN email_log  el ON el.sent_by    = u.id
         AND el.sent_at::date BETWEEN $1 AND $2
       LEFT JOIN status_event se ON se.changed_by = u.id
         AND se.created_at::date BETWEEN $1 AND $2
       LEFT JOIN audit_log  al ON al.changed_by  = u.id
         AND al.created_at::date BETWEEN $1 AND $2
       GROUP BY u.id, u.first_name, u.last_name, u.email
       ORDER BY emails_sent DESC, status_changes DESC`,
      [from, to]
    );

    res.json({ ok: true, leads: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/email ──────────────────────────────────────────────────
router.get('/email', async (req, res, next) => {
  try {
    const { from, to } = getDateRange(req.query);

    // Emails per day
    const dailyResult = await tenantQuery(req.tenantSchema,
      `SELECT
         sent_at::date AS date,
         COUNT(*)      AS sent,
         COUNT(*) FILTER (WHERE delivery_status = 'delivered') AS delivered
       FROM email_log
       WHERE sent_at::date BETWEEN $1 AND $2
       GROUP BY sent_at::date
       ORDER BY date`,
      [from, to]
    );

    // Response time — exams where email was sent then received
    // (time between emailed status and received status)
    const responseResult = await tenantQuery(req.tenantSchema,
      `SELECT
         AVG(
           EXTRACT(EPOCH FROM (
             r.created_at - s.created_at
           )) / 3600
         )::numeric(10,1) AS avg_response_hours,
         COUNT(*)          AS exams_with_response
       FROM status_event s
       JOIN status_event r ON r.exam_id = s.exam_id
         AND r.to_status = 'received'
         AND r.created_at > s.created_at
       WHERE s.to_status = 'emailed'
         AND s.created_at::date BETWEEN $1 AND $2`,
      [from, to]
    );

    res.json({
      ok:           true,
      daily:        dailyResult.rows,
      responseTime: responseResult.rows[0],
    });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/accommodations ────────────────────────────────────────
router.get('/accommodations', async (req, res, next) => {
  try {
    const { from, to } = getDateRange(req.query);

    const result = await tenantQuery(req.tenantSchema,
      `SELECT
         ac.code, ac.label, ac.triggers_rwg_flag,
         COUNT(*)                              AS usage_count,
         COUNT(DISTINCT a.student_profile_id) AS student_count
       FROM appointment_accommodation aa
       JOIN accommodation_code ac ON ac.id = aa.code_id
       JOIN appointment        a  ON a.id  = aa.appointment_id
       JOIN exam_room          er ON er.id = a.exam_room_id
       JOIN exam               e  ON e.id  = er.exam_id
       JOIN exam_day           ed ON ed.id = e.exam_day_id
       WHERE ed.date BETWEEN $1 AND $2
         AND a.is_cancelled = FALSE
       GROUP BY ac.id
       ORDER BY usage_count DESC`,
      [from, to]
    );

    res.json({ ok: true, accommodations: result.rows });
  } catch (err) { next(err); }
});

export default router;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateRange(query) {
  const today = new Date().toISOString().split('T')[0];
  // Default: current academic year (Sep 1 → Aug 31)
  const now   = new Date();
  const year  = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const defaultFrom = `${year}-09-01`;
  const defaultTo   = today;

  return {
    from: query.from || defaultFrom,
    to:   query.to   || defaultTo,
  };
}
