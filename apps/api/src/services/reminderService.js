/**
 * Upload reminder service.
 *
 * For each confirmed exam booking that has no submitted exam_upload for that
 * course + date, sends the professor an 'upload_reminder' notification at:
 *   - 7 days before the exam
 *   - 3 days before the exam
 *   - 1 day before the exam
 *
 * De-duplicated: one notification per (professor_profile_id, course_code,
 * exam_date, interval_days) — uses the message field prefix as the key since
 * we don't have a separate reminders table.
 *
 * Called once on server startup and then every 24 hours.
 */
import pool from '../db/pool.js';
import { tenantQuery } from '../db/tenantPool.js';

const REMINDER_DAYS = [7, 3, 1];

export async function runUploadReminders() {
  let schemas;
  try {
    const res = await pool.query(
      `SELECT slug FROM public.institution WHERE is_active = TRUE`,
    );
    schemas = res.rows.map(r => r.slug);
  } catch (err) {
    console.error('[reminders] Failed to fetch tenant schemas:', err.message);
    return;
  }

  for (const schema of schemas) {
    try {
      await remindSchema(schema);
    } catch (err) {
      console.error(`[reminders] Error processing schema ${schema}:`, err.message);
    }
  }
}

async function remindSchema(schema) {
  // Find all confirmed bookings that have no submitted upload for course+date,
  // and whose exam_date is exactly 7, 3, or 1 days from today.
  const result = await tenantQuery(
    schema,
    `SELECT
       ebr.professor_profile_id,
       ebr.course_code,
       ebr.exam_date,
       ebr.exam_time,
       (ebr.exam_date::date - CURRENT_DATE) AS days_until,
       COUNT(*) AS student_count,
       u.first_name AS prof_first, u.last_name AS prof_last
     FROM exam_booking_request ebr
     JOIN professor_profile pp ON pp.id = ebr.professor_profile_id
     JOIN "user" u ON u.id = pp.user_id
     WHERE ebr.status = 'confirmed'
       AND ebr.professor_profile_id IS NOT NULL
       AND (ebr.exam_date::date - CURRENT_DATE) = ANY($1)
       AND NOT EXISTS (
         SELECT 1 FROM exam_upload eu
         JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
         WHERE UPPER(eu.course_code) = UPPER(ebr.course_code)
           AND eud.exam_date = ebr.exam_date
           AND eu.professor_profile_id = ebr.professor_profile_id
           AND eu.status = 'submitted'
       )
     GROUP BY ebr.professor_profile_id, ebr.course_code, ebr.exam_date,
              ebr.exam_time, u.first_name, u.last_name`,
    [REMINDER_DAYS],
  );

  for (const row of result.rows) {
    const days     = parseInt(row.days_until, 10);
    const dateStr  = new Date(row.exam_date).toLocaleDateString('en-CA', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const timeStr  = row.exam_time ? ` at ${row.exam_time.slice(0, 5)}` : '';
    const count    = row.student_count;
    const prefix   = `[Reminder-${days}d]`;
    const message  = `${prefix} ${count} student${count !== 1 ? 's' : ''} confirmed for ${row.course_code} on ${dateStr}${timeStr} — please upload the exam file. (${days} day${days !== 1 ? 's' : ''} until exam)`;

    // Insert only if no identical reminder already sent today (ON CONFLICT DO NOTHING
    // won't work without a unique index, so we check for the prefix in the message).
    await tenantQuery(
      schema,
      `INSERT INTO upload_notification (professor_profile_id, type, message)
       SELECT $1, 'upload_reminder', $2
       WHERE NOT EXISTS (
         SELECT 1 FROM upload_notification
         WHERE professor_profile_id = $1
           AND type = 'upload_reminder'
           AND message LIKE $3
           AND created_at::date = CURRENT_DATE
       )`,
      [row.professor_profile_id, message, `${prefix} %${row.course_code}% on ${dateStr}%`],
    ).catch(() => {});
  }
}
