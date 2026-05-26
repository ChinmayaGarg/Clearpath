/**
 * Analytics routes
 *
 * GET /api/analytics/overview          Season-level summary stats
 * GET /api/analytics/daily?from&to     Day-by-day exam + student counts
 * GET /api/analytics/leads             Per-lead activity breakdown
 * GET /api/analytics/accommodations    Most common accommodation codes
 * GET /api/analytics/types             Exam type breakdown
 * GET /api/analytics/requests          Detailed request list (filterable by status/rwg)
 * GET /api/analytics/students          Per-student request breakdown
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

    const [mainStats, statusStats] = await Promise.all([

      // Main aggregate over exam_booking_request
      tenantQuery(req.tenantSchema,
        `WITH rwg_students AS (
           SELECT DISTINCT sa.student_profile_id
           FROM student_accommodation sa
           JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
           WHERE ac.triggers_rwg_flag = TRUE
         )
         SELECT
           COUNT(DISTINCT ebr.exam_date)                                   AS total_days,
           COUNT(*)                                                        AS total_exams,
           COUNT(DISTINCT ebr.student_profile_id)                         AS unique_students,
           COUNT(*) FILTER (WHERE ebr.status = 'pending')                 AS pending_exams,
           COUNT(*) FILTER (WHERE ebr.status = 'professor_approved')      AS professor_approved_exams,
           COUNT(*) FILTER (WHERE ebr.status = 'professor_rejected')      AS professor_rejected_exams,
           COUNT(*) FILTER (WHERE ebr.status = 'confirmed')               AS confirmed_exams,
           COUNT(*) FILTER (WHERE ebr.status = 'cancelled')               AS cancelled_exams,
           COUNT(*) FILTER (WHERE ebr.attendance_status = 'show')         AS shows,
           COUNT(*) FILTER (WHERE ebr.attendance_status = 'no_show')      AS no_shows,
           COUNT(DISTINCT ebr.confirmed_by)                               AS active_leads,
           COUNT(*) FILTER (WHERE rs.student_profile_id IS NOT NULL)      AS rwg_exams
         FROM exam_booking_request ebr
         LEFT JOIN rwg_students rs ON rs.student_profile_id = ebr.student_profile_id
         WHERE ebr.exam_date BETWEEN $1 AND $2`,
        [from, to]
      ),

      // Status breakdown
      tenantQuery(req.tenantSchema,
        `SELECT status, COUNT(*) AS count
         FROM exam_booking_request
         WHERE exam_date BETWEEN $1 AND $2
         GROUP BY status`,
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
        ...mainStats.rows[0],
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
         exam_date AS date,
         COUNT(*)                                             AS exam_count,
         COUNT(DISTINCT student_profile_id)                   AS student_count,
         COUNT(*) FILTER (WHERE status = 'confirmed')         AS confirmed_count,
         COUNT(*) FILTER (WHERE status = 'pending')           AS pending_count,
         COUNT(*) FILTER (WHERE status = 'cancelled')         AS cancelled_count
       FROM exam_booking_request
       WHERE exam_date BETWEEN $1 AND $2
       GROUP BY exam_date
       ORDER BY exam_date`,
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
         u.first_name || ' ' || u.last_name                     AS lead_name,
         u.email,
         COUNT(DISTINCT ebr.id)                                 AS bookings_confirmed,
         COUNT(DISTINCT cr.id)                                  AS cancellations_reviewed,
         GREATEST(MAX(ebr.confirmed_at), MAX(cr.reviewed_at))   AS last_active
       FROM "user" u
       JOIN user_role ur ON ur.user_id = u.id
         AND ur.role IN ('lead', 'institution_admin')
         AND ur.is_active = TRUE
       LEFT JOIN exam_booking_request ebr ON ebr.confirmed_by = u.id
         AND ebr.exam_date BETWEEN $1 AND $2
       LEFT JOIN cancellation_request cr ON cr.admin_profile_id = u.id
         AND cr.reviewed_at::date BETWEEN $1 AND $2
       GROUP BY u.id, u.first_name, u.last_name, u.email
       ORDER BY bookings_confirmed DESC, cancellations_reviewed DESC`,
      [from, to]
    );

    res.json({ ok: true, leads: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/accommodations ────────────────────────────────────────
router.get('/accommodations', async (req, res, next) => {
  try {
    const { from, to } = getDateRange(req.query);

    const result = await tenantQuery(req.tenantSchema,
      `SELECT
         ac.code, ac.label, ac.triggers_rwg_flag,
         COUNT(*)                               AS usage_count,
         COUNT(DISTINCT sa.student_profile_id)  AS student_count
       FROM student_accommodation sa
       JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id AND ac.is_active = TRUE
       WHERE EXISTS (
         SELECT 1 FROM exam_booking_request ebr
         WHERE ebr.student_profile_id = sa.student_profile_id
           AND ebr.exam_date BETWEEN $1 AND $2
           AND ebr.status != 'cancelled'
       )
       GROUP BY ac.id, ac.code, ac.label, ac.triggers_rwg_flag
       ORDER BY usage_count DESC`,
      [from, to]
    );

    res.json({ ok: true, accommodations: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/requests ──────────────────────────────────────────────
router.get('/requests', async (req, res, next) => {
  try {
    const { from, to } = getDateRange(req.query);
    const { status, rwg } = req.query;

    const params = [from, to];
    const conditions = ['ebr.exam_date BETWEEN $1 AND $2'];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`ebr.status = $${params.length}`);
    }

    if (rwg === 'true') {
      conditions.push(
        `EXISTS (
           SELECT 1 FROM student_accommodation sa
           JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
           WHERE sa.student_profile_id = ebr.student_profile_id
             AND ac.triggers_rwg_flag = TRUE
         )`
      );
    }

    const result = await tenantQuery(req.tenantSchema,
      `SELECT
         u.first_name || ' ' || u.last_name    AS student_name,
         sp.student_number,
         ebr.id, c.code AS course_code, ebr.exam_date, ebr.exam_time, ebr.exam_type,
         ebr.status, ebr.created_at, ebr.confirmed_at,
         pu.first_name || ' ' || pu.last_name  AS professor_name,
         cu.first_name || ' ' || cu.last_name  AS confirmed_by_name,
         br.name                               AS room_name,
         EXISTS (
           SELECT 1 FROM student_accommodation sa2
           JOIN accommodation_code ac2 ON ac2.id = sa2.accommodation_code_id
           WHERE sa2.student_profile_id = ebr.student_profile_id
             AND ac2.triggers_rwg_flag = TRUE
         )                                     AS is_rwg
       FROM exam_booking_request ebr
       JOIN student_profile sp ON sp.id = ebr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       JOIN course c ON c.id = ebr.course_id
       LEFT JOIN professor_profile pp ON pp.id = ebr.professor_profile_id
       LEFT JOIN "user" pu ON pu.id = pp.user_id
       LEFT JOIN "user" cu ON cu.id = ebr.confirmed_by
       LEFT JOIN booking_assignment ba ON ba.exam_booking_request_id = ebr.id
       LEFT JOIN booking_schedule_room bsr ON bsr.id = ba.schedule_room_id
       LEFT JOIN booking_room br ON br.id = bsr.booking_room_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ebr.exam_date DESC, ebr.created_at DESC
       LIMIT 200`,
      params
    );

    res.json({ ok: true, requests: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/students ───────────────────────────────────────────────
router.get('/students', async (req, res, next) => {
  try {
    const { from, to } = getDateRange(req.query);

    const result = await tenantQuery(req.tenantSchema,
      `SELECT
         u.first_name || ' ' || u.last_name            AS student_name,
         sp.student_number,
         COUNT(ebr.id)                                 AS request_count,
         COUNT(ebr.id) FILTER (WHERE ebr.status = 'confirmed') AS confirmed_count,
         COALESCE((
           SELECT STRING_AGG(ac.code, ', ' ORDER BY ac.code)
           FROM student_accommodation sa
           JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
           WHERE sa.student_profile_id = sp.id AND ac.is_active = TRUE
         ), '—')                                       AS accommodation_codes
       FROM exam_booking_request ebr
       JOIN student_profile sp ON sp.id = ebr.student_profile_id
       JOIN "user" u ON u.id = sp.user_id
       WHERE ebr.exam_date BETWEEN $1 AND $2
       GROUP BY sp.id, u.first_name, u.last_name, sp.student_number
       ORDER BY request_count DESC`,
      [from, to]
    );

    res.json({ ok: true, students: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/analytics/types ──────────────────────────────────────────────────
router.get('/types', async (req, res, next) => {
  try {
    const { from, to } = getDateRange(req.query);

    const result = await tenantQuery(req.tenantSchema,
      `SELECT
         exam_type,
         COUNT(*)                            AS count,
         COUNT(DISTINCT student_profile_id)  AS student_count
       FROM exam_booking_request
       WHERE exam_date BETWEEN $1 AND $2
       GROUP BY exam_type
       ORDER BY count DESC`,
      [from, to]
    );

    res.json({ ok: true, types: result.rows });
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
