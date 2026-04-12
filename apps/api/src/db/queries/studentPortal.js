/**
 * Student portal query functions — all tenant-scoped.
 */
import { tenantQuery } from '../tenantPool.js';

/**
 * Get the student_profile id for a given user id.
 */
export async function getStudentProfileId(schema, userId) {
  const result = await tenantQuery(
    schema,
    `SELECT id FROM student_profile WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Get student portal "me" — profile + registration request status.
 */
export async function getStudentPortalMe(schema, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT
       sp.id              AS student_profile_id,
       sp.student_number,
       sp.phone,
       u.id               AS user_id,
       u.first_name,
       u.last_name,
       u.email,
       srr.id             AS registration_request_id,
       srr.status         AS registration_status,
       srr.created_at     AS registration_submitted_at,
       srr.reviewed_at    AS registration_reviewed_at
     FROM student_profile sp
     JOIN "user" u ON u.id = sp.user_id
     LEFT JOIN student_registration_request srr
       ON srr.student_profile_id = sp.id
     WHERE sp.id = $1
     ORDER BY srr.created_at DESC
     LIMIT 1`,
    [studentProfileId],
  );
  return result.rows[0] ?? null;
}

/**
 * Get all active accommodation grants for a student.
 */
export async function getStudentPortalGrants(schema, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT
       ag.id,
       ag.approved_at,
       ag.expires_at,
       ag.notes,
       ac.code,
       ac.label,
       ac.triggers_rwg_flag
     FROM accommodation_grant ag
     JOIN accommodation_code ac ON ac.id = ag.accommodation_code_id
     WHERE ag.student_profile_id = $1
       AND ag.is_active = TRUE
     ORDER BY ac.code`,
    [studentProfileId],
  );
  return result.rows;
}

/**
 * Get all exam booking requests for a student.
 */
export async function getStudentExamBookings(schema, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT
       id, course_code, exam_date, exam_time, exam_type,
       special_materials_note, status,
       confirmed_at, created_at, updated_at
     FROM exam_booking_request
     WHERE student_profile_id = $1
     ORDER BY exam_date DESC, created_at DESC`,
    [studentProfileId],
  );
  return result.rows;
}

/**
 * Create a new exam booking request.
 */
export async function createExamBookingRequest(schema, {
  studentProfileId,
  courseCode,
  examDate,
  examTime,
  examType,
  specialMaterialsNote,
}) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO exam_booking_request
       (student_profile_id, course_code, exam_date, exam_time, exam_type, special_materials_note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      studentProfileId,
      courseCode.toUpperCase().trim(),
      examDate,
      examTime ?? null,
      examType ?? 'midterm',
      specialMaterialsNote ?? null,
    ],
  );
  return result.rows[0].id;
}

/**
 * Cancel an exam booking request (student can only cancel their own).
 */
export async function cancelExamBookingRequest(schema, requestId, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `UPDATE exam_booking_request
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1
       AND student_profile_id = $2
       AND status = 'pending'
     RETURNING id`,
    [requestId, studentProfileId],
  );
  return result.rows[0] ?? null;
}
