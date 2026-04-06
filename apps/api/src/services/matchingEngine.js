/**
 * Matching engine — links professor exam uploads to book exams.
 *
 * Runs automatically after every PDF import.
 * Also runs on-demand when a professor submits a new upload.
 *
 * Match key: course_code + exam_date + time_slot (null = wildcard)
 *
 * Priority:
 *   1. Exact match:    course_code + date + time_slot
 *   2. Wildcard match: course_code + date + time_slot IS NULL
 *   3. Cross-listed:   cross_listed_code matches course_code on upload
 *
 * Conflict: multiple uploads match the same exam → flagged, lead resolves.
 *
 * Makeup detection: after matching, checks each new appointment against
 * prior appointments for the same student + course within the configured
 * window (default 20 days). Sets is_makeup = TRUE if found.
 */
import { tenantQuery, tenantTransaction } from '../db/tenantPool.js';
import pool   from '../db/pool.js';
import { logger } from '../utils/logger.js';

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the full matching engine for a given exam day date.
 * Called after PDF import and after a professor submits an upload.
 *
 * @param {string} schema       - tenant schema
 * @param {string} date         - YYYY-MM-DD
 * @param {string} institutionId
 * @returns {Promise<MatchSummary>}
 */
export async function runMatchingEngine(schema, date, institutionId) {
  const config       = await getConfig(institutionId);
  const results      = { matched: 0, conflicts: 0, unmatched: 0, makeups: 0 };

  // Get all exams for this date
  const examsResult = await tenantQuery(schema,
    `SELECT
       e.id, e.course_code, e.cross_listed_code, e.exam_upload_id,
       json_agg(
         json_build_object('id', er.id, 'start_time', er.start_time)
         ORDER BY er.start_time
       ) AS rooms
     FROM exam e
     JOIN exam_day ed ON ed.id = e.exam_day_id AND ed.date = $1
     LEFT JOIN exam_room er ON er.exam_id = e.id
     WHERE e.status NOT IN ('cancelled', 'dropped')
     GROUP BY e.id`,
    [date]
  );

  for (const exam of examsResult.rows) {
    const matchResult = await matchExamToUpload(schema, exam, date);

    if (matchResult.status === 'matched') {
      results.matched++;
      // Pre-fill exam fields from upload if they're still empty
      await applyUploadToExam(schema, exam.id, matchResult.uploadId);
    } else if (matchResult.status === 'conflict') {
      results.conflicts++;
      logger.warn('Match conflict', {
        examId: exam.id, course: exam.course_code, date, schema,
      });
    } else {
      results.unmatched++;
      // Notify linked professor that upload is needed
      if (exam.professor_id) {
        await createUploadNeededNotification(schema, exam, date);
      }
    }
  }

  // Run makeup detection for new appointments on this date
  results.makeups = await detectMakeups(schema, date, config.makeupWindowDays ?? 20);

  logger.info('Matching engine complete', { date, schema, ...results });
  return results;
}

/**
 * Run matching for a single newly-submitted upload.
 * Called when a professor submits via the portal.
 */
export async function matchUpload(schema, uploadId, institutionId) {
  // Get all dates on this upload
  const datesResult = await tenantQuery(schema,
    `SELECT eud.id, eud.exam_date, eud.time_slot,
            eu.course_code, eu.professor_profile_id
     FROM exam_upload_date eud
     JOIN exam_upload eu ON eu.id = eud.exam_upload_id
     WHERE eud.exam_upload_id = $1`,
    [uploadId]
  );

  let matched = 0;
  for (const dateRow of datesResult.rows) {
    const examResult = await tenantQuery(schema,
      `SELECT e.id, e.course_code, e.cross_listed_code, e.exam_upload_id,
              json_agg(
                json_build_object('id', er.id, 'start_time', er.start_time)
              ) AS rooms
       FROM exam e
       JOIN exam_day ed ON ed.id = e.exam_day_id AND ed.date = $1
       LEFT JOIN exam_room er ON er.exam_id = e.id
       WHERE (e.course_code = $2 OR e.cross_listed_code = $2)
         AND e.status NOT IN ('cancelled', 'dropped')
       GROUP BY e.id`,
      [dateRow.exam_date, dateRow.course_code]
    );

    for (const exam of examResult.rows) {
      const matches = timeSlotMatches(
        exam.rooms.map(r => r.start_time),
        dateRow.time_slot
      );
      if (!matches) continue;

      // Link exam to upload
      await tenantQuery(schema,
        `UPDATE exam SET exam_upload_id = $1 WHERE id = $2`,
        [uploadId, exam.id]
      );

      // Update date row match status
      await tenantQuery(schema,
        `UPDATE exam_upload_date
         SET match_status = 'matched', matched_exam_id = $1
         WHERE id = $2`,
        [exam.id, dateRow.id]
      );

      await applyUploadToExam(schema, exam.id, uploadId);
      matched++;

      // Notify leads that upload was received
      await createUploadReceivedNotification(schema, exam.id, uploadId);
    }
  }

  return { matched };
}

// ── Matching logic ────────────────────────────────────────────────────────────

async function matchExamToUpload(schema, exam, date) {
  // Find candidate uploads for this course + date
  const candidatesResult = await tenantQuery(schema,
    `SELECT eu.id AS upload_id, eud.id AS date_id, eud.time_slot
     FROM exam_upload eu
     JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
       AND eud.exam_date = $1
     WHERE (eu.course_code = $2 OR eu.course_code = $3)
       AND eu.status = 'submitted'
     ORDER BY
       -- Prefer exact time slot matches over wildcards
       CASE WHEN eud.time_slot IS NULL THEN 1 ELSE 0 END`,
    [date, exam.course_code, exam.cross_listed_code ?? exam.course_code]
  );

  const candidates = candidatesResult.rows;
  if (!candidates.length) return { status: 'unmatched' };

  const roomTimes = (exam.rooms ?? []).map(r => r.start_time);

  // Filter candidates by time slot match
  const matching = candidates.filter(c =>
    timeSlotMatches(roomTimes, c.time_slot)
  );

  if (!matching.length) return { status: 'unmatched' };

  // Conflict: multiple distinct uploads match
  const uniqueUploads = [...new Set(matching.map(c => c.upload_id))];
  if (uniqueUploads.length > 1) {
    // Mark all date rows as conflict
    for (const c of matching) {
      await tenantQuery(schema,
        `UPDATE exam_upload_date SET match_status = 'conflict' WHERE id = $1`,
        [c.date_id]
      );
    }
    return { status: 'conflict' };
  }

  // Single match — link it
  const winner = matching[0];
  await tenantTransaction(schema, async (client) => {
    await client.query(
      `UPDATE exam SET exam_upload_id = $1 WHERE id = $2`,
      [winner.upload_id, exam.id]
    );
    await client.query(
      `UPDATE exam_upload_date
       SET match_status = 'matched', matched_exam_id = $1
       WHERE id = $2`,
      [exam.id, winner.date_id]
    );
  });

  return { status: 'matched', uploadId: winner.upload_id };
}

/**
 * time_slot = null means "matches all times on this date".
 * time_slot = HH:MM:SS means "only matches rooms starting at that time".
 */
function timeSlotMatches(roomStartTimes, timeSlot) {
  if (!timeSlot) return true; // wildcard
  return roomStartTimes.some(t => t === timeSlot || t?.startsWith(timeSlot.slice(0, 5)));
}

/**
 * Copy upload fields onto the exam if the exam fields are still empty.
 * Never overwrites data a lead has manually set.
 */
async function applyUploadToExam(schema, examId, uploadId) {
  await tenantQuery(schema,
    `UPDATE exam e
     SET
       delivery   = CASE WHEN e.delivery = 'pending' AND u.delivery != 'pending'
                         THEN u.delivery ELSE e.delivery END,
       materials  = CASE WHEN e.materials IS NULL THEN u.materials ELSE e.materials END,
       password   = CASE WHEN e.password  IS NULL THEN u.password  ELSE e.password  END,
       rwg_flag   = CASE WHEN u.rwg_flag = TRUE    THEN TRUE       ELSE e.rwg_flag  END,
       -- exam_type only updated from upload if it's a brightspace/crowdmark type
       -- Skip this for now to avoid enum cast issues
       updated_at = NOW()
     FROM exam_upload u
     WHERE e.id = $1 AND u.id = $2`,
    [examId, uploadId]
  );
}

// ── Makeup detection ──────────────────────────────────────────────────────────

/**
 * For every appointment on this date, check if the same student
 * had a prior appointment for the same course within windowDays.
 * If so, mark as makeup.
 */
async function detectMakeups(schema, date, windowDays) {
  const result = await tenantQuery(schema,
    `WITH new_appts AS (
       SELECT DISTINCT
         a.id             AS appointment_id,
         a.student_profile_id,
         e.course_code,
         e.cross_listed_code,
         ed.date          AS exam_date
       FROM appointment a
       JOIN exam_room      er ON er.id  = a.exam_room_id
       JOIN exam           e  ON e.id   = er.exam_id
       JOIN exam_day       ed ON ed.id  = e.exam_day_id
       WHERE ed.date = $1
         AND a.is_makeup = FALSE
         AND a.makeup_of_appointment_id IS NULL
     )
     UPDATE appointment a
     SET
       is_makeup                 = TRUE,
       makeup_of_appointment_id  = prior.id
     FROM new_appts na
     JOIN appointment prior ON prior.student_profile_id = na.student_profile_id
     JOIN exam_room      per ON per.id  = prior.exam_room_id
     JOIN exam           pe  ON pe.id   = per.exam_id
     JOIN exam_day       ped ON ped.id  = pe.exam_day_id
       AND ped.date < na.exam_date
       AND ped.date >= na.exam_date - ($2 || ' days')::interval
     WHERE a.id = na.appointment_id
       AND (
         pe.course_code = na.course_code
         OR pe.course_code = na.cross_listed_code
         OR pe.cross_listed_code = na.course_code
       )
     RETURNING a.id`,
    [date, String(windowDays)]
  );

  return result.rowCount;
}

// ── Notifications ─────────────────────────────────────────────────────────────

async function createUploadNeededNotification(schema, exam, date) {
  // Get professor profile id from exam
  const profResult = await tenantQuery(schema,
    `SELECT professor_id FROM exam WHERE id = $1`, [exam.id]
  );
  const professorId = profResult.rows[0]?.professor_id;
  if (!professorId) return;

  await tenantQuery(schema,
    `INSERT INTO upload_notification
       (professor_profile_id, exam_id, type, message)
     VALUES ($1, $2, 'upload_needed', $3)
     ON CONFLICT DO NOTHING`,
    [
      professorId,
      exam.id,
      `Upload needed for ${exam.course_code} on ${date}`,
    ]
  );
}

async function createUploadReceivedNotification(schema, examId, uploadId) {
  // Notify leads via audit log — persistent notifications for leads
  // come in a future iteration; for now just log
  logger.info('Upload received and matched', { examId, uploadId, schema });
}

// ── Config ────────────────────────────────────────────────────────────────────

async function getConfig(institutionId) {
  try {
    const result = await pool.query(
      `SELECT config FROM public.institution WHERE id = $1`,
      [institutionId]
    );
    return result.rows[0]?.config ?? {};
  } catch {
    return {};
  }
}
