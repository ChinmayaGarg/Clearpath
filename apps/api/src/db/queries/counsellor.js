/**
 * Counsellor query functions — all tenant-scoped.
 */
import { tenantQuery } from "../tenantPool.js";

/**
 * Get the counsellor_profile id for a given user id.
 * Returns null if the user has no counsellor profile (e.g. admin).
 */
export async function getCounsellorProfileId(schema, userId) {
  const result = await tenantQuery(
    schema,
    `SELECT id FROM counsellor_profile WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * List all active accommodation codes.
 */
export async function listAccommodationCodes(schema) {
  const result = await tenantQuery(
    schema,
    `SELECT id, code, label, triggers_rwg_flag
     FROM accommodation_code
     WHERE is_active = TRUE
     ORDER BY code`,
  );
  return result.rows;
}

/**
 * Search students by name, email, or student number.
 */
export async function searchStudents(schema, query) {
  const result = await tenantQuery(
    schema,
    `SELECT
       sp.id, u.first_name, u.last_name, u.email,
       sp.student_number, sp.phone
     FROM student_profile sp
     JOIN "user" u ON u.id = sp.user_id
     WHERE u.is_active = TRUE
       AND (
         u.first_name ILIKE $1 OR
         u.last_name  ILIKE $1 OR
         u.email      ILIKE $1 OR
         sp.student_number ILIKE $1 OR
         (u.first_name || ' ' || u.last_name) ILIKE $1
       )
     ORDER BY u.last_name, u.first_name
     LIMIT 20`,
    [`%${query}%`],
  );
  return result.rows;
}

/**
 * Get a single student with accommodations and recent exam history.
 */
export async function getStudentDetail(schema, studentProfileId) {
  const [profileResult, accResult, examsResult] = await Promise.all([
    tenantQuery(
      schema,
      `SELECT
         sp.id, sp.student_number, sp.phone, sp.do_not_call, sp.notes,
         u.first_name, u.last_name, u.email
       FROM student_profile sp
       JOIN "user" u ON u.id = sp.user_id
       WHERE sp.id = $1`,
      [studentProfileId],
    ),
    tenantQuery(
      schema,
      `SELECT
         sa.id, sa.term, sa.notes, sa.created_at,
         ac.code, ac.label, ac.triggers_rwg_flag,
         sa.counsellor_profile_id,
         u.first_name || ' ' || u.last_name AS added_by_name
       FROM student_accommodation sa
       JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
       LEFT JOIN counsellor_profile cp ON cp.id = sa.counsellor_profile_id
       LEFT JOIN "user" u ON u.id = cp.user_id
       WHERE sa.student_profile_id = $1
       ORDER BY sa.term DESC, ac.code`,
      [studentProfileId],
    ),
    tenantQuery(
      schema,
      `SELECT
         e.id, e.course_code, e.exam_type, e.status,
         ed.date,
         er.room_name,
         a.id AS appointment_id,
         a.start_time, a.duration_mins, a.is_cancelled
       FROM appointment a
       JOIN exam_room er ON er.id = a.exam_room_id
       JOIN exam      e  ON e.id  = er.exam_id
       JOIN exam_day  ed ON ed.id = e.exam_day_id
       WHERE a.student_profile_id = $1
       ORDER BY ed.date DESC`,
      [studentProfileId],
    ),
  ]);

  if (!profileResult.rows.length) return null;

  return {
    ...profileResult.rows[0],
    accommodations: accResult.rows,
    recentExams: examsResult.rows,
  };
}

/**
 * Get all exams a student is booked into.
 */
export async function getStudentExams(schema, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT
       e.id, e.course_code, e.exam_type, e.status,
       ed.date,
       er.room_name,
       a.id AS appointment_id,
       a.start_time, a.duration_mins, a.is_cancelled
     FROM appointment a
     JOIN exam_room er ON er.id = a.exam_room_id
     JOIN exam      e  ON e.id  = er.exam_id
     JOIN exam_day  ed ON ed.id = e.exam_day_id
     WHERE a.student_profile_id = $1
     ORDER BY ed.date DESC`,
    [studentProfileId],
  );
  return result.rows;
}

/**
 * Get accommodation codes on a specific appointment.
 */
export async function getAppointmentAccommodations(schema, appointmentId) {
  const result = await tenantQuery(
    schema,
    `SELECT aa.id, ac.code, ac.label, ac.triggers_rwg_flag, aa.raw_text
     FROM appointment_accommodation aa
     JOIN accommodation_code ac ON ac.id = aa.code_id
     WHERE aa.appointment_id = $1
     ORDER BY ac.code`,
    [appointmentId],
  );
  return result.rows;
}

/**
 * List all accommodations for a student, optionally filtered by term.
 */
export async function listStudentAccommodations(
  schema,
  studentProfileId,
  term = null,
) {
  const params = [studentProfileId];
  let termClause = "";
  if (term) {
    params.push(term);
    termClause = `AND sa.term = $2`;
  }

  const result = await tenantQuery(
    schema,
    `SELECT
       sa.id, sa.term, sa.notes, sa.created_at,
       ac.code, ac.label, ac.triggers_rwg_flag,
       sa.counsellor_profile_id,
       u.first_name || ' ' || u.last_name AS added_by_name
     FROM student_accommodation sa
     JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
     LEFT JOIN counsellor_profile cp ON cp.id = sa.counsellor_profile_id
     LEFT JOIN "user" u ON u.id = cp.user_id
     WHERE sa.student_profile_id = $1
     ${termClause}
     ORDER BY sa.term DESC, ac.code`,
    params,
  );
  return result.rows;
}

/**
 * Add (or upsert) an accommodation for a student.
 * Conflicts on (student_profile_id, accommodation_code_id, term) — updates notes.
 */
export async function addStudentAccommodation(
  schema,
  { studentProfileId, counsellorProfileId, accommodationCodeId, term, notes },
) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO student_accommodation
       (student_profile_id, counsellor_profile_id, accommodation_code_id, term, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (student_profile_id, accommodation_code_id, term)
     DO UPDATE SET
       notes      = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING id, term, notes, created_at`,
    [
      studentProfileId,
      counsellorProfileId ?? null,
      accommodationCodeId,
      term,
      notes ?? null,
    ],
  );
  return result.rows[0];
}

/**
 * Remove an accommodation.
 * Counsellors can only remove their own; pass null counsellorProfileId to bypass (admin).
 */
export async function removeStudentAccommodation(
  schema,
  accId,
  counsellorProfileId,
) {
  const result = await tenantQuery(
    schema,
    counsellorProfileId
      ? `DELETE FROM student_accommodation WHERE id = $1 AND counsellor_profile_id = $2 RETURNING id`
      : `DELETE FROM student_accommodation WHERE id = $1 RETURNING id`,
    counsellorProfileId ? [accId, counsellorProfileId] : [accId],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * List manually-added course codes for a student (admin-assigned).
 */
export async function listStudentCourses(schema, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT id, course_code, created_at
     FROM student_course
     WHERE student_profile_id = $1
     ORDER BY course_code`,
    [studentProfileId],
  );
  return result.rows;
}

/**
 * Manually assign a course code to a student (admin only).
 * Normalises courseCode to UPPER. Throws pg error 23505 on duplicate.
 */
export async function addStudentCourse(schema, { studentProfileId, courseCode, addedBy }) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO student_course (student_profile_id, course_code, added_by)
     VALUES ($1, $2, $3)
     RETURNING id, course_code, created_at`,
    [studentProfileId, courseCode.trim().toUpperCase(), addedBy],
  );
  return result.rows[0];
}

/**
 * Remove a manually-assigned course code from a student.
 * Returns the deleted id, or null if not found.
 */
export async function removeStudentCourse(schema, studentProfileId, courseCode) {
  const result = await tenantQuery(
    schema,
    `DELETE FROM student_course
     WHERE student_profile_id = $1 AND course_code = $2
     RETURNING id`,
    [studentProfileId, courseCode],
  );
  return result.rows[0]?.id ?? null;
}
