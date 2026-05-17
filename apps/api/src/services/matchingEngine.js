/**
 * Matching engine — links professor exam uploads to Clearpath-native bookings.
 *
 * A match is found when an exam_booking_request exists for the same
 * course_id + exam_date with a compatible time_slot, and the request
 * is in professor_approved or confirmed state.
 */
import { tenantQuery } from "../db/tenantPool.js";
import { persistUploadDossier } from "./dossierService.js";
import { logger } from "../utils/logger.js";

/**
 * Run matching for a single newly-submitted upload.
 * Called when a professor submits via the portal.
 */
export async function matchUpload(
  schema,
  uploadId,
  _institutionId,
  changedBy = null,
) {
  const datesResult = await tenantQuery(
    schema,
    `SELECT eud.id, eud.exam_date, eud.time_slot,
            eu.course_id, eu.professor_profile_id
     FROM exam_upload_date eud
     JOIN exam_upload eu ON eu.id = eud.exam_upload_id
     WHERE eud.exam_upload_id = $1`,
    [uploadId],
  );

  let matched = 0;
  for (const dateRow of datesResult.rows) {
    const bookingResult = await tenantQuery(
      schema,
      `SELECT 1 FROM exam_booking_request
       WHERE course_id = $1
         AND exam_date = $2
         AND (
           $3::time IS NULL
           OR exam_time IS NULL
           OR exam_time = $3::time
         )
         AND status IN ('professor_approved', 'confirmed')
       LIMIT 1`,
      [dateRow.course_id, dateRow.exam_date, dateRow.time_slot],
    );

    if (bookingResult.rows.length > 0) {
      await tenantQuery(
        schema,
        `UPDATE exam_upload_date SET match_status = 'matched' WHERE id = $1`,
        [dateRow.id],
      );
      matched++;
      logger.info("Upload matched to booking request", {
        uploadId,
        courseId: dateRow.course_id,
        examDate: dateRow.exam_date,
        schema,
      });
    }
  }

  await persistUploadDossier(schema, uploadId, changedBy);
  return { matched };
}
