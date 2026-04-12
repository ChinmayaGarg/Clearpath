/**
 * Student registration query functions — all tenant-scoped.
 */
import { tenantQuery, tenantTransaction } from '../tenantPool.js';

/**
 * Create a new student_registration_request row.
 */
export async function createRegistrationRequest(schema, {
  studentProfileId,
  email,
  firstName,
  lastName,
  studentNumber,
  phone,
  studentStatusFlags,
  disabilityCategories,
  onMedication,
  medicationDetails,
  academicImpact,
  pastAccommodations,
  requestedAccommodations,
  providerName,
  providerPhone,
}) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO student_registration_request (
       student_profile_id, email, first_name, last_name,
       student_number, phone,
       student_status_flags, disability_categories,
       on_medication, medication_details, academic_impact,
       past_accommodations, requested_accommodations,
       provider_name, provider_phone
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6,
       $7, $8,
       $9, $10, $11,
       $12, $13,
       $14, $15
     ) RETURNING id`,
    [
      studentProfileId ?? null,
      email.toLowerCase(),
      firstName,
      lastName,
      studentNumber ?? null,
      phone ?? null,
      JSON.stringify(studentStatusFlags ?? []),
      disabilityCategories ?? [],
      onMedication ?? false,
      medicationDetails ?? null,
      academicImpact ?? null,
      pastAccommodations ?? [],
      requestedAccommodations ?? [],
      providerName ?? null,
      providerPhone ?? null,
    ],
  );
  return result.rows[0].id;
}

/**
 * Link a registration request to a student_profile after account creation.
 */
export async function linkRegistrationToProfile(schema, requestId, studentProfileId) {
  await tenantQuery(
    schema,
    `UPDATE student_registration_request
     SET student_profile_id = $2, updated_at = NOW()
     WHERE id = $1`,
    [requestId, studentProfileId],
  );
}

/**
 * Create a provider_form_request row tied to a registration.
 */
export async function createProviderFormRequest(schema, {
  studentRegistrationRequestId,
  providerName,
  providerPhone,
}) {
  await tenantQuery(
    schema,
    `INSERT INTO provider_form_request
       (student_registration_request_id, provider_name, provider_phone)
     VALUES ($1, $2, $3)`,
    [studentRegistrationRequestId, providerName ?? null, providerPhone ?? null],
  );
}

/**
 * Get a single registration request by id (full detail).
 */
export async function getRegistrationRequest(schema, id) {
  const result = await tenantQuery(
    schema,
    `SELECT srr.*,
            pfr.id              AS provider_form_id,
            pfr.status          AS provider_form_status,
            pfr.sent_at         AS provider_form_sent_at,
            pfr.received_at     AS provider_form_received_at
     FROM student_registration_request srr
     LEFT JOIN provider_form_request pfr
       ON pfr.student_registration_request_id = srr.id
     WHERE srr.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/**
 * List pending/under_review registrations for the counsellor queue.
 */
export async function listPendingRegistrations(schema) {
  const result = await tenantQuery(
    schema,
    `SELECT
       srr.id, srr.email, srr.first_name, srr.last_name,
       srr.student_number, srr.status, srr.created_at, srr.updated_at,
       srr.disability_categories, srr.requested_accommodations,
       pfr.status AS provider_form_status
     FROM student_registration_request srr
     LEFT JOIN provider_form_request pfr
       ON pfr.student_registration_request_id = srr.id
     WHERE srr.status IN ('submitted', 'under_review')
     ORDER BY srr.created_at ASC`,
  );
  return result.rows;
}

/**
 * Approve a registration: update status, create accommodation_grant rows.
 * grantedCodes: [{ accommodationCodeId, notes?, expiresAt? }]
 */
export async function approveRegistration(schema, requestId, { reviewedBy, grantedCodes }) {
  return tenantTransaction(schema, async (client) => {
    // Get the student_profile_id from the request
    const reqResult = await client.query(
      `SELECT student_profile_id FROM student_registration_request WHERE id = $1`,
      [requestId],
    );
    const row = reqResult.rows[0];
    if (!row) throw new Error('Registration request not found');
    const { student_profile_id: studentProfileId } = row;

    // Update status
    await client.query(
      `UPDATE student_registration_request
       SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [requestId, reviewedBy],
    );

    // Insert accommodation grants
    for (const grant of grantedCodes ?? []) {
      await client.query(
        `INSERT INTO accommodation_grant
           (student_profile_id, accommodation_code_id, approved_by, notes, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (student_profile_id, accommodation_code_id) DO UPDATE
           SET is_active = TRUE,
               approved_by = EXCLUDED.approved_by,
               notes = EXCLUDED.notes,
               expires_at = EXCLUDED.expires_at,
               approved_at = NOW()`,
        [
          studentProfileId,
          grant.accommodationCodeId,
          reviewedBy,
          grant.notes ?? null,
          grant.expiresAt ?? null,
        ],
      );
    }
  });
}

/**
 * Reject a registration request.
 */
export async function rejectRegistration(schema, requestId, { reviewedBy, reason }) {
  await tenantQuery(
    schema,
    `UPDATE student_registration_request
     SET status = 'rejected',
         reviewed_by = $2,
         reviewed_at = NOW(),
         rejection_reason = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [requestId, reviewedBy, reason ?? null],
  );
}

/**
 * Update status to 'under_review'.
 */
export async function markUnderReview(schema, requestId, reviewedBy) {
  await tenantQuery(
    schema,
    `UPDATE student_registration_request
     SET status = 'under_review', reviewed_by = $2, updated_at = NOW()
     WHERE id = $1`,
    [requestId, reviewedBy],
  );
}

/**
 * Update the provider_form_request status (received / waived).
 */
export async function updateProviderFormStatus(schema, registrationRequestId, status) {
  await tenantQuery(
    schema,
    `UPDATE provider_form_request
     SET status      = $2,
         received_at = CASE WHEN $2 = 'received' THEN NOW() ELSE received_at END
     WHERE student_registration_request_id = $1`,
    [registrationRequestId, status],
  );
}

/**
 * Get all active accommodation grants for a student.
 * Used for auto-applying to appointments and student portal display.
 */
export async function getStudentGrants(schema, studentProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT
       ag.id, ag.accommodation_code_id, ag.approved_at, ag.expires_at,
       ag.notes, ag.is_active,
       ac.code, ac.label, ac.triggers_rwg_flag
     FROM accommodation_grant ag
     JOIN accommodation_code ac ON ac.id = ag.accommodation_code_id
     WHERE ag.student_profile_id = $1
       AND ag.is_active = TRUE
     ORDER BY ac.code`,
    [studentProfileId],
  );
  return result.rows;
}
