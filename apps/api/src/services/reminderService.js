/**
 * Upload reminder service.
 *
 * For each confirmed exam booking that has not been satisfied (no submitted
 * digital upload, no confirmed physical drop-off, and not a Brightspace exam),
 * sends the professor an email + in-portal 'upload_reminder' notification at:
 *   - 7 days before the exam
 *   - 3 days before the exam
 *   - 1 day before the exam
 *
 * Skip conditions (no reminder sent):
 *   - exam_upload exists with status = 'submitted'           (digital upload done)
 *   - exam_upload exists with exam_format = 'brightspace'   (no file needed)
 *   - exam_upload exists with delivery = 'dropped'
 *     AND dropoff_confirmed_at IS NOT NULL                  (lead confirmed receipt)
 *
 * Keep sending if:
 *   - delivery = 'dropped' but dropoff_confirmed_at IS NULL  (promised but not confirmed)
 *   - delivery = 'file_upload' / 'pending' with no submission
 *
 * De-duplicated: one notification + one email per (professor, course, date,
 * interval_day) per calendar day.
 *
 * Called once on server startup and then every 24 hours.
 */
import pool from '../db/pool.js';
import { tenantQuery } from '../db/tenantPool.js';
import { sendEmail, uploadReminderEmail } from '@clearpath/email';

const REMINDER_DAYS = [7, 3, 1];

export async function runUploadReminders() {
  let institutions;
  try {
    const res = await pool.query(
      `SELECT slug, name, email_sender_name, email_reply_to
       FROM public.institution WHERE is_active = TRUE`,
    );
    institutions = res.rows;
  } catch (err) {
    console.error('[reminders] Failed to fetch tenant schemas:', err.message);
    return;
  }

  for (const inst of institutions) {
    try {
      await remindSchema(inst.slug, inst);
    } catch (err) {
      console.error(`[reminders] Error processing schema ${inst.slug}:`, err.message);
    }
  }
}

async function remindSchema(schema, inst) {
  const result = await tenantQuery(
    schema,
    `SELECT
       ebr.professor_profile_id,
       ebr.course_code,
       ebr.exam_date,
       ebr.exam_time,
       (ebr.exam_date::date - CURRENT_DATE) AS days_until,
       COUNT(*) AS student_count,
       u.first_name AS prof_first, u.last_name AS prof_last,
       u.email AS prof_email,
       eu_latest.delivery AS upload_delivery
     FROM exam_booking_request ebr
     JOIN professor_profile pp ON pp.id = ebr.professor_profile_id
     JOIN "user" u ON u.id = pp.user_id
     -- grab the most recent upload draft (any status) to know the delivery method
     LEFT JOIN LATERAL (
       SELECT eu.delivery
       FROM exam_upload eu
       JOIN exam_upload_date eud ON eud.exam_upload_id = eu.id
       WHERE UPPER(eu.course_code) = UPPER(ebr.course_code)
         AND eud.exam_date = ebr.exam_date
         AND eu.professor_profile_id = ebr.professor_profile_id
       ORDER BY eu.created_at DESC
       LIMIT 1
     ) eu_latest ON TRUE
     WHERE ebr.status = 'confirmed'
       AND ebr.professor_profile_id IS NOT NULL
       AND (ebr.exam_date::date - CURRENT_DATE) = ANY($1)
       -- skip if already satisfied: submitted upload OR brightspace OR confirmed drop-off
       AND NOT EXISTS (
         SELECT 1 FROM exam_upload eu2
         JOIN exam_upload_date eud2 ON eud2.exam_upload_id = eu2.id
         WHERE UPPER(eu2.course_code) = UPPER(ebr.course_code)
           AND eud2.exam_date = ebr.exam_date
           AND eu2.professor_profile_id = ebr.professor_profile_id
           AND (
             eu2.status = 'submitted'
             OR eu2.exam_format = 'brightspace'
             OR (eu2.delivery = 'dropped' AND eu2.dropoff_confirmed_at IS NOT NULL)
           )
       )
     GROUP BY ebr.professor_profile_id, ebr.course_code, ebr.exam_date,
              ebr.exam_time, u.first_name, u.last_name, u.email, eu_latest.delivery`,
    [REMINDER_DAYS],
  );

  for (const row of result.rows) {
    const days      = parseInt(row.days_until, 10);
    const isDropoff = row.upload_delivery === 'dropped';
    const dateStr   = new Date(row.exam_date).toLocaleDateString('en-CA', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const timeStr   = row.exam_time ? ` at ${row.exam_time.slice(0, 5)}` : '';
    const count     = row.student_count;
    const prefix    = `[Reminder-${days}d]`;

    const message = isDropoff
      ? `${prefix} ${count} student${count !== 1 ? 's' : ''} confirmed for ${row.course_code} on ${dateStr}${timeStr} — exam not yet received (physical drop-off pending). (${days} day${days !== 1 ? 's' : ''} until exam)`
      : `${prefix} ${count} student${count !== 1 ? 's' : ''} confirmed for ${row.course_code} on ${dateStr}${timeStr} — please upload the exam file. (${days} day${days !== 1 ? 's' : ''} until exam)`;

    // Insert in-portal notification — only if not already sent today
    const notifResult = await tenantQuery(
      schema,
      `INSERT INTO upload_notification (professor_profile_id, type, message)
       SELECT $1, 'upload_reminder', $2
       WHERE NOT EXISTS (
         SELECT 1 FROM upload_notification
         WHERE professor_profile_id = $1
           AND type = 'upload_reminder'
           AND message LIKE $3
           AND created_at::date = CURRENT_DATE
       )
       RETURNING id`,
      [row.professor_profile_id, message, `${prefix} %${row.course_code}% on ${dateStr}%`],
    ).catch(() => null);

    // Send email only when the notification was freshly inserted (dedup via rowCount)
    if (notifResult?.rowCount > 0 && row.prof_email) {
      const context = {
        senderName:      inst.email_sender_name ?? `${inst.name} Accessibility Centre`,
        replyTo:         inst.email_reply_to,
        institutionName: inst.name,
      };
      const { subject, html, text } = uploadReminderEmail(
        { firstName: row.prof_first, lastName: row.prof_last },
        { courseCode: row.course_code, dateStr, timeStr, days, studentCount: count, isDropoff },
        context,
      );
      await sendEmail({
        from:    process.env.EMAIL_FROM ?? 'noreply@clearpath.dev',
        to:      row.prof_email,
        replyTo: inst.email_reply_to,
        subject, html, text,
      }).catch(err =>
        console.error(`[reminders] Email failed for ${row.prof_email}:`, err.message),
      );
    }
  }
}
