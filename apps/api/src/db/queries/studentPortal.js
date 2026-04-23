/**
 * Student portal query functions — all tenant-scoped.
 */
import { tenantQuery } from "../tenantPool.js";

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
       srr.id                       AS registration_request_id,
       srr.status                   AS registration_status,
       srr.requested_accommodations AS requested_accommodations,
       srr.created_at               AS registration_submitted_at,
       srr.reviewed_at              AS registration_reviewed_at
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
 * Get all active accommodation grants for a student (from registration approval).
 * Kept for backward-compatibility; not used by the student portal accommodations tab.
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
 * Get all counsellor-managed accommodations for a student, grouped by term.
 * Returns [{ term, items: [{ id, code, label, triggers_rwg_flag, notes, created_at }] }]
 * sorted most-recent term first.
 */
export async function getStudentAccommodations(schema, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT
       sa.id, sa.term, sa.notes, sa.created_at,
       ac.code, ac.label, ac.triggers_rwg_flag
     FROM student_accommodation sa
     JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
     WHERE sa.student_profile_id = $1
       AND ac.is_active = TRUE
     ORDER BY sa.term DESC, ac.code`,
    [studentProfileId],
  );

  const byTerm = {};
  for (const row of result.rows) {
    (byTerm[row.term] ??= []).push(row);
  }

  return Object.entries(byTerm)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([term, items]) => ({ term, items }));
}

/**
 * Get all exam booking requests for a student (includes computed duration fields).
 */
export async function getStudentExamBookings(schema, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT
       id, course_code, exam_date, exam_time, exam_type,
       special_materials_note, status,
       base_duration_mins, extra_mins, stb_mins, computed_duration_mins,
       confirmed_at, created_at, updated_at
     FROM exam_booking_request
     WHERE student_profile_id = $1
     ORDER BY exam_date DESC, created_at DESC`,
    [studentProfileId],
  );
  return result.rows;
}

/**
 * Get all active accommodation code strings for a student (across all terms).
 */
export async function getStudentAccommodationCodes(schema, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT DISTINCT ac.code
     FROM student_accommodation sa
     JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
     WHERE sa.student_profile_id = $1
       AND ac.is_active = TRUE`,
    [studentProfileId],
  );
  return result.rows.map((r) => r.code);
}

/**
 * Find the base exam duration (minutes) from the most recently submitted
 * exam_upload matching the given course code and exam type.
 * Returns null if no upload is found.
 */
export async function findExamUploadDuration(schema, courseCode, examType) {
  // exam_type_label uses 'endterm' while booking requests use 'final' — normalise
  const label = examType === "final" ? "endterm" : examType;
  const result = await tenantQuery(
    schema,
    `SELECT exam_duration_mins
     FROM exam_upload
     WHERE UPPER(course_code) = UPPER($1)
       AND exam_type_label    = $2
       AND status             = 'submitted'
     ORDER BY submitted_at DESC
     LIMIT 1`,
    [courseCode, label],
  );
  return result.rows[0]?.exam_duration_mins ?? null;
}

/**
 * Get existing booking requests for a student on a given date that have
 * a time and a computed duration (used for overlap detection).
 */
export async function getStudentBookingsOnDate(
  schema,
  studentProfileId,
  examDate,
) {
  const result = await tenantQuery(
    schema,
    `SELECT exam_time, computed_duration_mins, course_code
     FROM exam_booking_request
     WHERE student_profile_id = $1
       AND exam_date           = $2
       AND status NOT IN ('cancelled', 'professor_rejected')
       AND exam_time IS NOT NULL
       AND computed_duration_mins IS NOT NULL`,
    [studentProfileId, examDate],
  );
  return result.rows;
}

/**
 * Get existing SARS appointments for a student on a given date.
 */
export async function getSarsAppointmentsOnDate(
  schema,
  studentProfileId,
  examDate,
) {
  const result = await tenantQuery(
    schema,
    `SELECT a.start_time, a.duration_mins, e.course_code
     FROM appointment a
     JOIN exam_room er ON er.id = a.exam_room_id
     JOIN exam      e  ON e.id  = er.exam_id
     JOIN exam_day  ed ON ed.id = e.exam_day_id
     WHERE a.student_profile_id = $1
       AND ed.date              = $2
       AND a.is_cancelled       = FALSE
       AND a.start_time IS NOT NULL`,
    [studentProfileId, examDate],
  );
  return result.rows;
}

/**
 * Create a new exam booking request (with precomputed duration fields).
 */
export async function createExamBookingRequest(
  schema,
  {
    studentProfileId,
    courseCode,
    examDate,
    examTime,
    examType,
    specialMaterialsNote,
    studentDurationMins,
    baseDurationMins,
    extraMins,
    stbMins,
    computedDurationMins,
  },
) {
  const normalizedCode = courseCode.toUpperCase().trim();

  // Look up the professor responsible for this course via course_dossier
  const profResult = await tenantQuery(
    schema,
    `SELECT professor_id FROM course_dossier
     WHERE UPPER(course_code) = $1
     LIMIT 1`,
    [normalizedCode],
  );
  const professorProfileId = profResult.rows[0]?.professor_id ?? null;

  const result = await tenantQuery(
    schema,
    `INSERT INTO exam_booking_request
       (student_profile_id, course_code, exam_date, exam_time, exam_type,
        special_materials_note, professor_profile_id,
        student_duration_mins,
        base_duration_mins, extra_mins, stb_mins, computed_duration_mins)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      studentProfileId,
      normalizedCode,
      examDate,
      examTime ?? null,
      examType ?? "midterm",
      specialMaterialsNote ?? null,
      professorProfileId,
      studentDurationMins ?? null,
      baseDurationMins ?? null,
      extraMins ?? 0,
      stbMins ?? 0,
      computedDurationMins ?? null,
    ],
  );
  return result.rows[0].id;
}

/**
 * Cancel an exam booking request (student can only cancel their own).
 */
export async function cancelExamBookingRequest(
  schema,
  requestId,
  studentProfileId,
) {
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

/**
 * Submit a cancellation request for an approved or confirmed booking.
 * Returns the created cancellation_request record or null if failed.
 */
export async function submitCancellationRequest(
  schema,
  examRequestId,
  studentProfileId,
  studentReason,
) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO cancellation_request
       (exam_booking_request_id, student_profile_id, student_reason, request_status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id, exam_booking_request_id, student_profile_id, student_reason, request_status, created_at`,
    [examRequestId, studentProfileId, studentReason],
  );
  return result.rows[0] ?? null;
}

/**
 * Get a specific cancellation request with full details.
 */
export async function getCancellationRequest(schema, requestId) {
  const result = await tenantQuery(
    schema,
    `SELECT
       cr.id, cr.exam_booking_request_id, cr.student_profile_id, cr.student_reason,
       cr.request_status, cr.admin_profile_id, cr.admin_reason, cr.reviewed_at,
       cr.created_at, cr.updated_at,
       ebr.course_code, ebr.exam_date, ebr.exam_time, ebr.exam_type, ebr.status AS exam_status,
       sp.student_number, u.first_name, u.last_name, u.email,
       admin_u.first_name AS admin_first_name, admin_u.last_name AS admin_last_name
     FROM cancellation_request cr
     JOIN exam_booking_request ebr ON ebr.id = cr.exam_booking_request_id
     JOIN student_profile sp ON sp.id = cr.student_profile_id
     JOIN "user" u ON u.id = sp.user_id
     LEFT JOIN "user" admin_u ON admin_u.id = cr.admin_profile_id
     WHERE cr.id = $1`,
    [requestId],
  );
  return result.rows[0] ?? null;
}

/**
 * Get pending cancellation requests for admin review (with optional status filter).
 */
export async function getPendingCancellationRequests(
  schema,
  requestStatus = "pending",
) {
  const result = await tenantQuery(
    schema,
    `SELECT
       cr.id, cr.exam_booking_request_id, cr.student_profile_id, cr.student_reason,
       cr.request_status, cr.admin_profile_id, cr.admin_reason, cr.reviewed_at,
       cr.created_at, cr.updated_at,
       ebr.course_code, ebr.exam_date, ebr.exam_time, ebr.exam_type, ebr.status AS exam_status,
       sp.student_number, u.first_name, u.last_name, u.email,
       admin_u.first_name AS admin_first_name, admin_u.last_name AS admin_last_name
     FROM cancellation_request cr
     JOIN exam_booking_request ebr ON ebr.id = cr.exam_booking_request_id
     JOIN student_profile sp ON sp.id = cr.student_profile_id
     JOIN "user" u ON u.id = sp.user_id
     LEFT JOIN "user" admin_u ON admin_u.id = cr.admin_profile_id
     WHERE cr.request_status = $1
     ORDER BY cr.created_at DESC`,
    [requestStatus],
  );
  return result.rows;
}

/**
 * Check if a cancellation request already exists for an exam (in pending or approved state).
 */
export async function checkExistingCancellationRequest(schema, examRequestId) {
  const result = await tenantQuery(
    schema,
    `SELECT id FROM cancellation_request
     WHERE exam_booking_request_id = $1
       AND request_status IN ('pending', 'approved')
     LIMIT 1`,
    [examRequestId],
  );
  return result.rows[0] ?? null;
}
