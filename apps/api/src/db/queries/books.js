/**
 * ExamDay (book) query functions — all tenant-scoped.
 */
import { tenantQuery, tenantTransaction } from '../tenantPool.js';

/**
 * List all exam days with summary counts — for calendar view.
 */
export async function listExamDays(schema) {
  const result = await tenantQuery(schema,
    `SELECT
       ed.id, ed.date, ed.is_published, ed.notes,
       COUNT(DISTINCT e.id)                            AS exam_count,
       COALESCE(SUM(er.student_count), 0)              AS student_count,
       COUNT(DISTINCT e.id) FILTER (
         WHERE e.status = 'pending'
       )                                               AS pending_count
     FROM exam_day ed
     LEFT JOIN exam     e  ON e.exam_day_id = ed.id
     LEFT JOIN exam_room er ON er.exam_id   = e.id
     GROUP BY ed.id
     ORDER BY ed.date DESC`
  );
  return result.rows;
}

/**
 * Get a single exam day with all exams, rooms, and appointments.
 * This is the full daily book payload.
 */
export async function getExamDay(schema, date) {
  const result = await tenantQuery(schema,
    `SELECT
       ed.id, ed.date, ed.is_published, ed.notes,
       ed.created_at,
       u.first_name || ' ' || u.last_name AS created_by_name
     FROM exam_day ed
     LEFT JOIN "user" u ON u.id = ed.created_by
     WHERE ed.date = $1`,
    [date]
  );
  return result.rows[0] ?? null;
}

/**
 * Get all exams for an exam day with rooms, student counts, and flags.
 */
export async function getExamsForDay(schema, examDayId) {
  const result = await tenantQuery(schema,
    `SELECT
       e.id, e.course_code, e.cross_listed_code,
       e.duration_mins, e.exam_type, e.delivery,
       e.materials, e.password, e.status, e.rwg_flag,
       e.created_at, e.updated_at,
       pp.id                                   AS professor_id,
       pp.user_id                              AS professor_user_id,
       u.first_name || ' ' || u.last_name      AS professor_name,
       u.email                                 AS professor_email,
       pp.phone                                AS professor_phone,
       pp.department                           AS professor_department,
       COALESCE(
         json_agg(
           json_build_object(
             'id',            er.id,
             'room_name',     er.room_name,
             'start_time',    er.start_time,
             'student_count', er.student_count
           ) ORDER BY er.start_time
         ) FILTER (WHERE er.id IS NOT NULL),
         '[]'
       ) AS rooms,
       COALESCE(SUM(er.student_count), 0)     AS total_students
     FROM exam e
     LEFT JOIN professor_profile pp ON pp.id = e.professor_id
     LEFT JOIN "user"            u  ON u.id  = pp.user_id
     LEFT JOIN exam_room         er ON er.exam_id = e.id
     WHERE e.exam_day_id = $1
     GROUP BY e.id, pp.id, pp.user_id, u.first_name, u.last_name,
              u.email, pp.phone, pp.department
     ORDER BY MIN(er.start_time), e.course_code`,
    [examDayId]
  );
  return result.rows;
}

/**
 * Create a new exam day (book) for a date.
 * Fails cleanly if a book already exists for that date (unique constraint).
 */
export async function createExamDay(schema, { date, createdBy, notes }) {
  const result = await tenantQuery(schema,
    `INSERT INTO exam_day (date, created_by, notes)
     VALUES ($1, $2, $3)
     RETURNING id, date, is_published, created_at`,
    [date, createdBy, notes ?? null]
  );
  return result.rows[0];
}

/**
 * Update exam day notes or published state.
 */
export async function updateExamDay(schema, id, { notes, isPublished }) {
  const result = await tenantQuery(schema,
    `UPDATE exam_day
     SET notes        = COALESCE($1, notes),
         is_published = COALESCE($2, is_published),
         updated_at   = NOW()
     WHERE id = $3
     RETURNING id, date, notes, is_published`,
    [notes ?? null, isPublished ?? null, id]
  );
  return result.rows[0] ?? null;
}
