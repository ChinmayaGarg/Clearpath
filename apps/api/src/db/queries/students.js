/**
 * Student query functions — all tenant-scoped.
 */
import { tenantQuery, tenantTransaction } from '../tenantPool.js';

/**
 * Search students by name, student number, or email.
 */
export async function searchStudents(schema, query) {
  const result = await tenantQuery(schema,
    `SELECT
       sp.id, sp.student_number, sp.phone, sp.do_not_call,
       u.first_name, u.last_name, u.email,
       COUNT(DISTINCT a.id) AS appointment_count
     FROM student_profile sp
     JOIN "user" u ON u.id = sp.user_id
     LEFT JOIN appointment a ON a.student_profile_id = sp.id
     WHERE u.email NOT LIKE '%@student.placeholder%'
        OR sp.student_number ILIKE $1
        OR (u.first_name || ' ' || u.last_name) ILIKE $1
        OR sp.student_number = $2
     GROUP BY sp.id, u.first_name, u.last_name, u.email
     ORDER BY u.last_name, u.first_name
     LIMIT 30`,
    [`%${query}%`, query]
  );
  return result.rows;
}

/**
 * List all students — for the directory view.
 * Excludes placeholder-only records with no real name.
 */
export async function listStudents(schema, { page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;

  const [countResult, rowsResult] = await Promise.all([
    tenantQuery(schema,
      `SELECT COUNT(*) FROM student_profile sp
       JOIN "user" u ON u.id = sp.user_id
       WHERE sp.student_number IS NOT NULL`,
    ),
    tenantQuery(schema,
      `SELECT
         sp.id, sp.student_number, sp.phone, sp.do_not_call, sp.notes,
         u.first_name, u.last_name, u.email,
         COUNT(DISTINCT a.id)                           AS appointment_count,
         COUNT(DISTINCT aa.code_id)                     AS accommodation_count,
         BOOL_OR(sp.do_not_call)                        AS do_not_call,
         MAX(ed.date)                                   AS last_seen_date
       FROM student_profile sp
       JOIN "user" u ON u.id = sp.user_id
       LEFT JOIN appointment    a  ON a.student_profile_id = sp.id
       LEFT JOIN exam_room      er ON er.id = a.exam_room_id
       LEFT JOIN exam           e  ON e.id  = er.exam_id
       LEFT JOIN exam_day       ed ON ed.id = e.exam_day_id
       LEFT JOIN appointment_accommodation aa ON aa.appointment_id = a.id
       WHERE sp.student_number IS NOT NULL
       GROUP BY sp.id, u.first_name, u.last_name, u.email
       ORDER BY u.last_name, u.first_name
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
  ]);

  return {
    students: rowsResult.rows,
    total:    parseInt(countResult.rows[0].count),
    page,
    limit,
  };
}

/**
 * Get a single student with full accommodation history.
 */
export async function getStudent(schema, studentProfileId) {
  const [profileResult, historyResult, codesResult] = await Promise.all([
    // Profile
    tenantQuery(schema,
      `SELECT
         sp.id, sp.student_number, sp.phone, sp.do_not_call, sp.notes,
         u.first_name, u.last_name, u.email
       FROM student_profile sp
       JOIN "user" u ON u.id = sp.user_id
       WHERE sp.id = $1`,
      [studentProfileId]
    ),
    // Appointment history with accommodation codes
    tenantQuery(schema,
      `SELECT
         a.id             AS appointment_id,
         a.start_time,
         a.duration_mins,
         a.is_cancelled,
         e.course_code,
         e.exam_type,
         ed.date,
         er.room_name,
         COALESCE(
           json_agg(
             json_build_object('code', ac.code, 'label', ac.label)
             ORDER BY ac.code
           ) FILTER (WHERE ac.id IS NOT NULL),
           '[]'
         ) AS accommodations
       FROM appointment a
       JOIN exam_room      er ON er.id  = a.exam_room_id
       JOIN exam           e  ON e.id   = er.exam_id
       JOIN exam_day       ed ON ed.id  = e.exam_day_id
       LEFT JOIN appointment_accommodation aa ON aa.appointment_id = a.id
       LEFT JOIN accommodation_code        ac ON ac.id = aa.code_id
       WHERE a.student_profile_id = $1
       GROUP BY a.id, e.course_code, e.exam_type, ed.date,
                er.room_name, a.start_time, a.duration_mins, a.is_cancelled
       ORDER BY ed.date DESC`,
      [studentProfileId]
    ),
    // All unique accommodation codes this student has ever had
    tenantQuery(schema,
      `SELECT DISTINCT ac.code, ac.label, ac.triggers_rwg_flag
       FROM appointment_accommodation aa
       JOIN appointment        a  ON a.id  = aa.appointment_id
       JOIN accommodation_code ac ON ac.id = aa.code_id
       WHERE a.student_profile_id = $1
       ORDER BY ac.code`,
      [studentProfileId]
    ),
  ]);

  if (!profileResult.rows.length) return null;

  return {
    ...profileResult.rows[0],
    history:        historyResult.rows,
    allAccommodations: codesResult.rows,
  };
}

/**
 * Update student profile — phone, do_not_call, notes.
 */
export async function updateStudent(schema, studentProfileId, {
  phone, doNotCall, notes,
}) {
  const result = await tenantQuery(schema,
    `UPDATE student_profile
     SET phone       = COALESCE($1, phone),
         do_not_call = COALESCE($2, do_not_call),
         notes       = $3,
         updated_at  = NOW()
     WHERE id = $4
     RETURNING id`,
    [phone ?? null, doNotCall ?? null, notes ?? null, studentProfileId]
  );
  return result.rows[0] ?? null;
}

/**
 * Get accommodation code frequency for a student —
 * used to show which accommodations they most commonly have.
 */
export async function getStudentAccommodationSummary(schema, studentProfileId) {
  const result = await tenantQuery(schema,
    `SELECT
       ac.code, ac.label, ac.triggers_rwg_flag,
       COUNT(*) AS times_used
     FROM appointment_accommodation aa
     JOIN appointment        a  ON a.id  = aa.appointment_id
     JOIN accommodation_code ac ON ac.id = aa.code_id
     WHERE a.student_profile_id = $1
     GROUP BY ac.id
     ORDER BY times_used DESC`,
    [studentProfileId]
  );
  return result.rows;
}

/**
 * Get student's active accommodations (per-term) for the side panel.
 */
export async function getStudentAccommodationsForPanel(schema, studentProfileId) {
  const result = await tenantQuery(schema,
    `SELECT sa.id, sa.term, sa.notes,
            ac.code, ac.label, ac.triggers_rwg_flag,
            u.first_name || ' ' || u.last_name AS added_by_name
     FROM student_accommodation sa
     JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
     LEFT JOIN counsellor_profile cp ON cp.id = sa.counsellor_profile_id
     LEFT JOIN "user" u ON u.id = cp.user_id
     WHERE sa.student_profile_id = $1
     ORDER BY sa.term DESC, ac.code`,
    [studentProfileId],
  );
  return result.rows;
}

/**
 * Get student's linked courses with the most-recent professor per course.
 */
export async function getStudentCoursesForPanel(schema, studentProfileId) {
  const result = await tenantQuery(schema,
    `SELECT DISTINCT ON (sc.course_id)
            sc.course_id,
            c.code AS course_code,
            pp.id        AS prof_id,
            u.first_name AS prof_first_name,
            u.last_name  AS prof_last_name,
            u.email      AS prof_email
     FROM student_course sc
     JOIN course c ON c.id = sc.course_id
     LEFT JOIN (
       SELECT DISTINCT ON (course_id)
              course_id, professor_profile_id
       FROM exam_booking_request
       WHERE student_profile_id = $1
       ORDER BY course_id, created_at DESC
     ) latest ON latest.course_id = sc.course_id
     LEFT JOIN professor_profile pp ON pp.id = latest.professor_profile_id
     LEFT JOIN "user" u ON u.id = pp.user_id
     WHERE sc.student_profile_id = $1
     ORDER BY sc.course_id, c.code`,
    [studentProfileId],
  );
  return result.rows;
}

/**
 * Get all exam booking requests for a student with room and professor details.
 */
export async function getStudentExamRequestsForPanel(schema, studentProfileId) {
  const result = await tenantQuery(schema,
    `SELECT
       ebr.id, ebr.course_code, ebr.exam_date, ebr.exam_time,
       ebr.exam_type, ebr.status, ebr.rejection_reason,
       ebr.base_duration_mins, ebr.student_duration_mins, ebr.confirmed_at,
       br.name AS room_name,
       pp.id        AS prof_id,
       u.first_name AS prof_first_name,
       u.last_name  AS prof_last_name,
       u.email      AS prof_email
     FROM exam_booking_request ebr
     LEFT JOIN booking_assignment ba ON ba.exam_booking_request_id = ebr.id
     LEFT JOIN booking_schedule_room bsr ON bsr.id = ba.schedule_room_id
     LEFT JOIN booking_room br ON br.id = bsr.booking_room_id
     LEFT JOIN professor_profile pp ON pp.id = ebr.professor_profile_id
     LEFT JOIN "user" u ON u.id = pp.user_id
     WHERE ebr.student_profile_id = $1
     ORDER BY ebr.exam_date DESC, ebr.exam_time DESC NULLS LAST`,
    [studentProfileId],
  );
  return result.rows;
}

/**
 * Find a student profile by student number.
 */
export async function findStudentByNumber(schema, studentNumber) {
  const result = await tenantQuery(schema,
    `SELECT sp.id FROM student_profile sp
     WHERE sp.student_number = $1 LIMIT 1`,
    [studentNumber]
  );
  return result.rows[0] ?? null;
}
