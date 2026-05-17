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
 * Returns latest registration_status so the UI can gate unapproved students.
 */
export async function searchStudents(schema, query) {
  const result = await tenantQuery(
    schema,
    `SELECT
       sp.id, u.first_name, u.last_name, u.email,
       sp.student_number, sp.phone,
       (SELECT status FROM student_registration_request
        WHERE student_profile_id = sp.id
        ORDER BY created_at DESC LIMIT 1) AS registration_status
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
         sa.id, sa.source, sa.term_id, t.label AS term, sa.notes, sa.created_at, sa.expires_at,
         ac.code, ac.label, ac.triggers_rwg_flag,
         sa.counsellor_profile_id,
         CASE
           WHEN sa.source = 'manual'  THEN uc.first_name || ' ' || uc.last_name
           WHEN sa.source = 'granted' THEN ug.first_name || ' ' || ug.last_name
         END AS added_by_name
       FROM student_accommodation sa
       JOIN term t ON t.id = sa.term_id
       JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
       LEFT JOIN counsellor_profile cp ON cp.id = sa.counsellor_profile_id
       LEFT JOIN "user" uc ON uc.id = cp.user_id
       LEFT JOIN "user" ug ON ug.id = sa.granted_by
       WHERE sa.student_profile_id = $1
         AND sa.is_active = TRUE
       ORDER BY sa.source DESC, t.start_date DESC NULLS FIRST, ac.code`,
      [studentProfileId],
    ),
  ]);

  if (!profileResult.rows.length) return null;

  return {
    ...profileResult.rows[0],
    accommodations: accResult.rows,
    recentExams: [],
  };
}

/**
 * Get all exams a student is booked into.
 */
export async function getStudentExams() {
  return [];
}

/**
 * Get accommodation codes on a specific appointment.
 */
export async function getAppointmentAccommodations() {
  return [];
}

/**
 * List all accommodations for a student, optionally filtered by term_id.
 */
export async function listStudentAccommodations(
  schema,
  studentProfileId,
  termId = null,
) {
  const params = [studentProfileId];
  let termClause = "";
  if (termId) {
    params.push(termId);
    termClause = `AND sa.term_id = $2`;
  }

  const result = await tenantQuery(
    schema,
    `SELECT
       sa.id, sa.term_id, t.label AS term_label, sa.notes, sa.created_at,
       ac.code, ac.label, ac.triggers_rwg_flag,
       sa.counsellor_profile_id,
       u.first_name || ' ' || u.last_name AS added_by_name
     FROM student_accommodation sa
     JOIN term t ON t.id = sa.term_id
     JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
     LEFT JOIN counsellor_profile cp ON cp.id = sa.counsellor_profile_id
     LEFT JOIN "user" u ON u.id = cp.user_id
     WHERE sa.student_profile_id = $1
     ${termClause}
     ORDER BY t.start_date DESC NULLS LAST, ac.code`,
    params,
  );
  return result.rows;
}

/**
 * Add (or upsert) an accommodation for a student.
 * Conflicts on (student_profile_id, accommodation_code_id, term_id) — updates notes.
 */
export async function addStudentAccommodation(
  schema,
  { studentProfileId, counsellorProfileId, accommodationCodeId, termId, notes },
) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO student_accommodation
       (student_profile_id, counsellor_profile_id, accommodation_code_id, source, term_id, notes)
     VALUES ($1, $2, $3, 'manual', $4, $5)
     ON CONFLICT (student_profile_id, accommodation_code_id, term_id)
     DO UPDATE SET
       notes      = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING id, term_id, notes, created_at`,
    [
      studentProfileId,
      counsellorProfileId ?? null,
      accommodationCodeId,
      termId,
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
      ? `DELETE FROM student_accommodation WHERE id = $1 AND source = 'manual' AND counsellor_profile_id = $2 RETURNING id`
      : `DELETE FROM student_accommodation WHERE id = $1 AND source = 'manual' RETURNING id`,
    counsellorProfileId ? [accId, counsellorProfileId] : [accId],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * List course offerings a student is enrolled in.
 */
export async function listStudentCourses(schema, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT sc.id, sc.course_offering_id, co.course_id,
            c.code AS course_code, t.label AS term_label,
            t.id AS term_id, sc.created_at,
            pp.id   AS professor_id,
            u.first_name AS prof_first_name,
            u.last_name  AS prof_last_name
     FROM student_course sc
     JOIN course_offering co ON co.id = sc.course_offering_id
     JOIN course c ON c.id = co.course_id
     JOIN term t ON t.id = co.term_id
     LEFT JOIN LATERAL (
       SELECT cd.professor_id
       FROM course_dossier cd
       WHERE cd.course_offering_id = sc.course_offering_id
       ORDER BY cd.updated_at DESC
       LIMIT 1
     ) latest_cd ON TRUE
     LEFT JOIN professor_profile pp ON pp.id = latest_cd.professor_id
     LEFT JOIN "user" u ON u.id = pp.user_id
     WHERE sc.student_profile_id = $1
     ORDER BY t.start_date DESC NULLS LAST, c.code`,
    [studentProfileId],
  );
  return result.rows;
}

/**
 * Manually assign a student to a course offering.
 * Throws pg error 23505 on duplicate.
 */
export async function addStudentCourse(schema, { studentProfileId, courseOfferingId, addedBy }) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO student_course (student_profile_id, course_offering_id, added_by)
     VALUES ($1, $2, $3)
     RETURNING id, course_offering_id, created_at`,
    [studentProfileId, courseOfferingId, addedBy],
  );
  return result.rows[0];
}

/**
 * Remove a student from a course offering.
 * Returns the deleted id, or null if not found.
 */
export async function removeStudentCourse(schema, studentProfileId, courseOfferingId) {
  const result = await tenantQuery(
    schema,
    `DELETE FROM student_course
     WHERE student_profile_id = $1 AND course_offering_id = $2
     RETURNING id`,
    [studentProfileId, courseOfferingId],
  );
  return result.rows[0]?.id ?? null;
}
