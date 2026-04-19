/**
 * PDF service — orchestrates SARS PDF parsing and book population.
 *
 * Flow:
 *   1. Parse PDF buffer → structured appointments (via @clearpath/pdf-parser)
 *   2. For each appointment group (course + room + time):
 *      a. Find or create the Exam row
 *      b. Find or create the ExamRoom row
 *      c. Find or create the Student (user + student_profile)
 *      d. Create the Appointment row
 *      e. Create AppointmentAccommodation rows
 *   3. Return a summary of what was added/merged
 */
import { parseSARSPdf } from '@clearpath/pdf-parser';
import { tenantQuery, tenantTransaction } from '../db/tenantPool.js';
import { logAction }          from '../db/queries/audit.js';
import { runMatchingEngine }  from './matchingEngine.js';
import { logger }      from '../utils/logger.js';
import pool            from '../db/pool.js';

/**
 * Process one or more PDF buffers and merge results into the daily book.
 *
 * @param {string} schema         - tenant schema name
 * @param {string} institutionId  - for fetching room map config
 * @param {Array}  files          - array of { buffer, originalname }
 * @param {string} uploadedBy     - user ID of the lead who uploaded
 * @returns {Promise<ImportSummary>}
 */
export async function importPDFs(schema, institutionId, files, uploadedBy) {
  // Fetch institution room map config for this tenant
  const roomMap = await getRoomMap(institutionId);

  const results = [];

  for (const file of files) {
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9._\-]/g, '_')
      .substring(0, 255);

    try {
      const parsed = await parseSARSPdf(file.buffer, safeName, roomMap);
      const summary = await mergeIntoBook(schema, parsed, uploadedBy);

      results.push({
        filename:    safeName,
        date:        parsed.date,
        location:    parsed.pdfLocation,
        added:       summary.added,
        merged:      summary.merged,
        unmatched:   parsed.unmatched.length,
        unmatchedItems: parsed.unmatched,
      });

      await logAction(schema, {
        entityType: 'exam_day',
        entityId:   summary.examDayId ?? '00000000-0000-0000-0000-000000000000',
        action:     'pdf_imported',
        newValue:   safeName,
        changedBy:  uploadedBy,
      });

    } catch (err) {
      logger.error('PDF parse failed', { file: safeName, err: err.message });
      results.push({
        filename:  safeName,
        error:     err.message,
        added:     0,
        merged:    0,
        unmatched: 0,
      });
    }
  }

  // Run matching engine for each unique date that was affected
  const affectedDates = [...new Set(
    results.filter(r => r.date && !r.error).map(r => r.date)
  )];
  for (const date of affectedDates) {
    runMatchingEngine(schema, date, institutionId).catch(err =>
      logger.warn('Matching engine failed', { date, err: err.message })
    );
  }

  return results;
}

/**
 * Merge parsed appointments into the database book.
 * Groups by course+room+time, creates/updates exams and appointments.
 */
async function mergeIntoBook(schema, parsed, uploadedBy) {
  const { date, appointments } = parsed;
  if (!date || !appointments.length) {
    return { added: 0, merged: 0, examDayId: null };
  }

  return tenantTransaction(schema, async (client) => {
    // Ensure ExamDay exists for this date
    const dayResult = await client.query(
      `INSERT INTO exam_day (date, created_by)
       VALUES ($1, $2)
       ON CONFLICT (date) DO UPDATE SET date = EXCLUDED.date
       RETURNING id`,
      [date, uploadedBy]
    );
    const examDayId = dayResult.rows[0].id;

    // Group appointments by course + room + startTime
    const groups = groupAppointments(appointments);

    let added  = 0;
    let merged = 0;

    for (const group of groups) {
      const { courseCode, crossListedCode, roomName, startTime,
              rwg, brightspace, cancelled, appointments: appts } = group;

      // ── Find or create Exam ───────────────────────────────────────────────
      const examResult = await client.query(
        `SELECT id, rwg_flag FROM exam
         WHERE exam_day_id = $1
           AND (course_code = $2 OR cross_listed_code = $2)
         LIMIT 1`,
        [examDayId, courseCode]
      );

      let examId;
      let isNew = false;

      if (examResult.rows.length) {
        examId = examResult.rows[0].id;
        // Update RWG flag if newly detected
        if (rwg && !examResult.rows[0].rwg_flag) {
          await client.query(
            `UPDATE exam SET rwg_flag = TRUE, updated_at = NOW() WHERE id = $1`,
            [examId]
          );
        }
      } else {
        const newExam = await client.query(
          `INSERT INTO exam
             (exam_day_id, course_code, cross_listed_code,
              exam_type, rwg_flag, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           RETURNING id`,
          [
            examDayId,
            courseCode,
            crossListedCode || null,
            brightspace ? 'brightspace' : 'paper',
            rwg,
          ]
        );
        examId = newExam.rows[0].id;
        isNew  = true;

        // Initial status event
        await client.query(
          `INSERT INTO status_event (exam_id, from_status, to_status)
           VALUES ($1, NULL, 'pending')`,
          [examId]
        );

        if (cancelled) {
          await client.query(
            `UPDATE exam SET status = 'cancelled' WHERE id = $1`,
            [examId]
          );
        }
      }

      // ── Find or create ExamRoom ───────────────────────────────────────────
      const roomResult = await client.query(
        `SELECT id, student_count FROM exam_room
         WHERE exam_id = $1 AND room_name = $2 AND start_time = $3
         LIMIT 1`,
        [examId, roomName, startTime]
      );

      let roomId;

      if (roomResult.rows.length) {
        roomId = roomResult.rows[0].id;
        merged++;
      } else {
        const newRoom = await client.query(
          `INSERT INTO exam_room (exam_id, room_name, start_time, student_count)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [examId, roomName, startTime, appts.length]
        );
        roomId = newRoom.rows[0].id;
        added++;
      }

      // ── Process each student appointment ─────────────────────────────────
      for (const appt of appts) {
        await upsertAppointment(client, {
          examId,
          roomId,
          appt,
          schema,
        });
      }

      // Update room student count to actual count
      await client.query(
        `UPDATE exam_room
         SET student_count = (
           SELECT COUNT(*) FROM appointment
           WHERE exam_room_id = $1 AND is_cancelled = FALSE
         )
         WHERE id = $1`,
        [roomId]
      );
    }

    return { added, merged, examDayId };
  });
}

/**
 * Find or create a student user + profile, then create the appointment.
 */
async function upsertAppointment(client, { examId, roomId, appt }) {
  const {
    studentId, startTime, durationMins, doNotCall,
    phone, cancelled, rawCodes, rawReason,
  } = appt;

  // ── Find or create student user ───────────────────────────────────────────
  // Students imported from SARS may not have a user account yet.
  // We create a minimal placeholder — they can claim it later.
  let studentProfileId;

  const existingProfile = await client.query(
    `SELECT sp.id FROM student_profile sp
     WHERE sp.student_number = $1
     LIMIT 1`,
    [studentId]
  );

  if (existingProfile.rows.length) {
    studentProfileId = existingProfile.rows[0].id;

    // Update phone and do_not_call if new data available
    if (phone || doNotCall) {
      await client.query(
        `UPDATE student_profile
         SET phone       = COALESCE($1, phone),
             do_not_call = $2,
             updated_at  = NOW()
         WHERE id = $3`,
        [phone, doNotCall, studentProfileId]
      );
    }
  } else {
    // Create placeholder user for this student
    // Email is generated from student number — they can update it later
    const placeholderEmail = `${studentId.toLowerCase()}@student.placeholder`;
    const salt             = 'placeholder';
    const passwordHash     = 'placeholder_not_usable';

    const userResult = await client.query(
      `INSERT INTO "user"
         (email, email_domain, first_name, last_name, password_hash, salt, is_active)
       VALUES ($1, 'student.placeholder', $2, '', $3, $4, FALSE)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [placeholderEmail, studentId, passwordHash, salt]
    );
    const userId = userResult.rows[0].id;

    // Grant student role
    await client.query(
      `INSERT INTO user_role (user_id, role)
       VALUES ($1, 'student')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId]
    );

    // Create student profile
    const profileResult = await client.query(
      `INSERT INTO student_profile (user_id, student_number, phone, do_not_call)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         student_number = EXCLUDED.student_number,
         phone          = COALESCE(EXCLUDED.phone, student_profile.phone),
         do_not_call    = EXCLUDED.do_not_call
       RETURNING id`,
      [userId, studentId, phone, doNotCall]
    );
    studentProfileId = profileResult.rows[0].id;
  }

  // ── Create appointment (idempotent) ───────────────────────────────────────
  const apptResult = await client.query(
    `INSERT INTO appointment
       (exam_room_id, student_profile_id, duration_mins, start_time,
        do_not_call, is_cancelled)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (exam_room_id, student_profile_id) DO UPDATE SET
       duration_mins = EXCLUDED.duration_mins,
       do_not_call   = EXCLUDED.do_not_call,
       is_cancelled  = EXCLUDED.is_cancelled
     RETURNING id`,
    [roomId, studentProfileId, durationMins, startTime, doNotCall, cancelled]
  );
  const appointmentId = apptResult.rows[0].id;

  // ── Create accommodation links from PDF codes ────────────────────────────
  if (rawCodes.length) {
    for (const rawCode of rawCodes) {
      // Look up the accommodation code in the tenant's code table
      const codeResult = await client.query(
        `SELECT id FROM accommodation_code
         WHERE UPPER(code) = UPPER($1) AND is_active = TRUE
         LIMIT 1`,
        [rawCode]
      );

      if (codeResult.rows.length) {
        await client.query(
          `INSERT INTO appointment_accommodation
             (appointment_id, code_id, raw_text)
           VALUES ($1, $2, $3)
           ON CONFLICT (appointment_id, code_id) DO NOTHING`,
          [appointmentId, codeResult.rows[0].id, rawReason]
        );
      }
    }
  }

  // ── Auto-apply active accommodation grants ────────────────────────────────
  // Pull any formally approved grants for this student and add them to the
  // appointment so counsellors don't have to manually re-apply them.
  const grantsResult = await client.query(
    `SELECT accommodation_code_id
     FROM accommodation_grant
     WHERE student_profile_id = $1
       AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [studentProfileId]
  );
  for (const grant of grantsResult.rows) {
    await client.query(
      `INSERT INTO appointment_accommodation
         (appointment_id, code_id)
       VALUES ($1, $2)
       ON CONFLICT (appointment_id, code_id) DO NOTHING`,
      [appointmentId, grant.accommodation_code_id]
    );
  }
}

/**
 * Group flat appointment array by course + room + startTime.
 */
function groupAppointments(appointments) {
  const map = new Map();

  for (const appt of appointments) {
    const key = `${appt.courseCode}|${appt.roomName}|${appt.startTime}`;

    if (!map.has(key)) {
      map.set(key, {
        courseCode:      appt.courseCode,
        crossListedCode: appt.crossListedCode,
        roomName:        appt.roomName,
        startTime:       appt.startTime,
        rwg:             appt.rwg,
        brightspace:     appt.brightspace,
        cancelled:       appt.cancelled,
        appointments:    [],
      });
    }

    const group = map.get(key);
    // Propagate flags across the group
    if (appt.rwg)        group.rwg        = true;
    if (appt.brightspace) group.brightspace = true;
    if (appt.cancelled)  group.cancelled  = true;
    group.appointments.push(appt);
  }

  return Array.from(map.values());
}

/**
 * Fetch the institution's custom room name map from the control plane config.
 * Falls back to empty object if no config set.
 */
async function getRoomMap(institutionId) {
  try {
    const result = await pool.query(
      `SELECT config FROM public.institution WHERE id = $1`,
      [institutionId]
    );
    return result.rows[0]?.config?.roomMap ?? {};
  } catch {
    return {};
  }
}
