/**
 * Exam upload query functions — all tenant-scoped.
 */
import { tenantQuery, tenantTransaction } from "../tenantPool.js";

/**
 * Get the professor_profile id for a given user id.
 */
export async function getProfessorProfileId(schema, userId) {
  const result = await tenantQuery(
    schema,
    `SELECT id FROM professor_profile WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Update file info for an upload.
 */
export async function updateUploadFile(
  schema,
  uploadId,
  professorProfileId,
  { filePath, fileOriginalName, fileSize },
) {
  const result = await tenantQuery(
    schema,
    `UPDATE exam_upload
     SET file_path = $3,
         file_original_name = $4,
         file_size = $5,
         file_uploaded_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND professor_profile_id = $2
     RETURNING id, file_path, file_original_name, file_uploaded_at`,
    [uploadId, professorProfileId, filePath, fileOriginalName, fileSize],
  );
  return result.rows[0] ?? null;
}

/**
 * Get file info for an upload (for download).
 */
export async function getUploadFileInfo(schema, uploadId, professorProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT file_path, file_original_name, file_size, file_uploaded_at
     FROM exam_upload
     WHERE id = $1
       AND professor_profile_id = $2`,
    [uploadId, professorProfileId],
  );
  return result.rows[0] ?? null;
}

/**
 * Get the allowed course codes for a professor based on their course_dossier entries.
 */
export async function getAllowedCoursesForProfessor(
  schema,
  professorProfileId,
) {
  const result = await tenantQuery(
    schema,
    `SELECT DISTINCT UPPER(course_code) AS course_code
     FROM course_dossier
     WHERE professor_id = $1
     ORDER BY UPPER(course_code)`,
    [professorProfileId],
  );
  return result.rows.map((r) => r.course_code);
}

/**
 * List all uploads for a professor — their dashboard view.
 */
export async function listUploadsForProfessor(schema, professorProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT
       eu.id, eu.course_code, eu.exam_type_label, eu.version_label,
       eu.delivery, eu.materials, eu.password, eu.rwg_flag,
       eu.is_makeup, eu.makeup_notes, eu.status, eu.submitted_at,
       eu.created_at, eu.updated_at,
       eu.file_path, eu.file_original_name, eu.file_uploaded_at,
       COALESCE(
         json_agg(
           json_build_object(
             'id',           eud.id,
             'exam_date',    eud.exam_date,
             'time_slot',    eud.time_slot,
             'match_status', eud.match_status,
             'matched_exam_id', eud.matched_exam_id
           ) ORDER BY eud.exam_date
         ) FILTER (WHERE eud.id IS NOT NULL),
         '[]'
       ) AS dates
     FROM exam_upload eu
     LEFT JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
     WHERE eu.professor_profile_id = $1
     GROUP BY eu.id
     ORDER BY eu.updated_at DESC`,
    [professorProfileId],
  );
  return result.rows;
}

/**
 * Get a single upload with dates and custom field values.
 */
export async function getUpload(schema, uploadId, professorProfileId) {
  const [uploadResult, datesResult, valuesResult] = await Promise.all([
    tenantQuery(
      schema,
      `SELECT eu.*
       FROM exam_upload eu
       WHERE eu.id = $1
         AND eu.professor_profile_id = $2`,
      [uploadId, professorProfileId],
    ),
    tenantQuery(
      schema,
      `SELECT id, exam_date, time_slot, match_status, matched_exam_id
       FROM exam_upload_date
       WHERE exam_upload_id = $1
       ORDER BY exam_date`,
      [uploadId],
    ),
    tenantQuery(
      schema,
      `SELECT euv.field_id, ff.key, ff.label, euv.value
       FROM exam_upload_value euv
       JOIN form_field ff ON ff.id = euv.field_id
       WHERE euv.exam_upload_id = $1`,
      [uploadId],
    ),
  ]);

  if (!uploadResult.rows.length) return null;

  const upload = uploadResult.rows[0];

  // Build file URL if file exists
  let fileUrl = null;
  if (upload.file_path) {
    const { getFileUrl } = await import("../../services/fileStorage.js");
    fileUrl = getFileUrl(upload.file_path);
  }

  return {
    ...upload,
    dates: datesResult.rows,
    values: valuesResult.rows,
    file_url: fileUrl,
  };
}

/**
 * Create a new exam upload (draft).
 */
export async function createUpload(
  schema,
  {
    professorProfileId,
    courseCode,
    examTypeLabel,
    versionLabel,
    delivery,
    materials,
    password,
    rwgFlag,
    isMakeup,
    makeupNotes,
  },
) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO exam_upload
       (professor_profile_id, course_code, exam_type_label, version_label,
        delivery, materials, password, rwg_flag, is_makeup, makeup_notes,
        status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft')
     RETURNING id`,
    [
      professorProfileId,
      courseCode,
      examTypeLabel,
      versionLabel ?? null,
      delivery ?? "pending",
      materials ?? null,
      password ?? null,
      rwgFlag ?? false,
      isMakeup ?? false,
      makeupNotes ?? null,
    ],
  );
  return result.rows[0].id;
}

/**
 * Update an existing draft upload.
 */
export async function updateUpload(
  schema,
  uploadId,
  professorProfileId,
  fields,
) {
  const allowed = [
    "course_code",
    "exam_type_label",
    "version_label",
    "delivery",
    "materials",
    "password",
    "rwg_flag",
    "is_makeup",
    "makeup_notes",
  ];
  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key) || value === undefined) continue;
    setClauses.push(`${key} = $${idx++}`);
    values.push(value);
  }
  if (!setClauses.length) return;

  setClauses.push(`updated_at = NOW()`);
  values.push(uploadId, professorProfileId);

  await tenantQuery(
    schema,
    `UPDATE exam_upload
     SET ${setClauses.join(", ")}
     WHERE id = $${idx++} AND professor_profile_id = $${idx}`,
    values,
  );
}

/**
 * Submit an upload — transitions from draft to submitted.
 * Requires at least one date to be set.
 */
export async function submitUpload(schema, uploadId, professorProfileId) {
  const result = await tenantQuery(
    schema,
    `UPDATE exam_upload
     SET status       = 'submitted',
         submitted_at = NOW(),
         updated_at   = NOW()
     WHERE id = $1
       AND professor_profile_id = $2
       AND EXISTS (
         SELECT 1 FROM exam_upload_date
         WHERE exam_upload_id = $1
       )
     RETURNING id`,
    [uploadId, professorProfileId],
  );
  if (!result.rows.length) {
    throw Object.assign(
      new Error("Please add at least one exam date before saving"),
      { status: 400 },
    );
  }
}

/**
 * Add a date to an upload.
 */
export async function addUploadDate(schema, uploadId, { examDate, timeSlot }) {
  const result = await tenantQuery(
    schema,
    `INSERT INTO exam_upload_date (exam_upload_id, exam_date, time_slot)
     VALUES ($1, $2, $3)
     ON CONFLICT (exam_upload_id, exam_date, time_slot) DO NOTHING
     RETURNING id`,
    [uploadId, examDate, timeSlot ?? null],
  );
  return result.rows[0]?.id;
}

/**
 * Remove a date from an upload.
 */
export async function removeUploadDate(schema, dateId, uploadId) {
  await tenantQuery(
    schema,
    `DELETE FROM exam_upload_date
     WHERE id = $1 AND exam_upload_id = $2`,
    [dateId, uploadId],
  );
}

/**
 * Get pending reuse requests for a professor.
 */
export async function getPendingReuseRequests(schema, professorProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT
       err.id, err.status, err.professor_note, err.requested_at,
       eu.course_code, eu.exam_type_label, eu.version_label,
       ed.date     AS makeup_date,
       u.first_name || ' ' || u.last_name AS requested_by_name
     FROM exam_reuse_request err
     JOIN exam_upload eu ON eu.id = err.original_upload_id
       AND eu.professor_profile_id = $1
     JOIN exam      e  ON e.id  = err.makeup_exam_id
     JOIN exam_day  ed ON ed.id = e.exam_day_id
     LEFT JOIN "user" u ON u.id = err.requested_by
     WHERE err.status = 'pending'
     ORDER BY err.requested_at DESC`,
    [professorProfileId],
  );
  return result.rows;
}

/**
 * Respond to a reuse request — approve or deny.
 */
export async function respondToReuseRequest(
  schema,
  requestId,
  { status, professorNote, professorProfileId },
) {
  return tenantTransaction(schema, async (client) => {
    // Verify the request belongs to this professor
    const check = await client.query(
      `SELECT err.id, err.original_upload_id, err.makeup_exam_id
       FROM exam_reuse_request err
       JOIN exam_upload eu ON eu.id = err.original_upload_id
         AND eu.professor_profile_id = $1
       WHERE err.id = $2 AND err.status = 'pending'`,
      [professorProfileId, requestId],
    );

    if (!check.rows.length) {
      throw Object.assign(new Error("Request not found"), { status: 404 });
    }

    const { original_upload_id, makeup_exam_id } = check.rows[0];

    // Update request status
    await client.query(
      `UPDATE exam_reuse_request
       SET status         = $1,
           professor_note = $2,
           responded_at   = NOW()
       WHERE id = $3`,
      [status, professorNote ?? null, requestId],
    );

    // If approved, link the makeup exam to the original upload
    if (status === "approved") {
      await client.query(`UPDATE exam SET exam_upload_id = $1 WHERE id = $2`, [
        original_upload_id,
        makeup_exam_id,
      ]);
    }
  });
}

/**
 * Get unread notifications for a professor.
 */
export async function getProfessorNotifications(schema, professorProfileId) {
  const result = await tenantQuery(
    schema,
    `SELECT id, type, message, is_read, created_at, exam_upload_id, exam_id
     FROM upload_notification
     WHERE professor_profile_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [professorProfileId],
  );
  return result.rows;
}

/**
 * Mark notifications as read.
 */
export async function markNotificationsRead(schema, professorProfileId) {
  await tenantQuery(
    schema,
    `UPDATE upload_notification
     SET is_read = TRUE, read_at = NOW()
     WHERE professor_profile_id = $1 AND is_read = FALSE`,
    [professorProfileId],
  );
}
