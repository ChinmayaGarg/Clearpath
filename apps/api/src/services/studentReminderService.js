/**
 * Student exam reminder service.
 *
 * For each confirmed exam booking, sends the student an email reminder at:
 *   - 7 days before the exam
 *   - 3 days before the exam
 *   - 1 day before the exam
 *
 * De-duplicated: one email per (student email, course, reminder day) per
 * calendar day via email_log lookup.
 *
 * Called once on server startup and then every 24 hours.
 */
import pool           from '../db/pool.js';
import { tenantQuery } from '../db/tenantPool.js';
import { sendEmail, studentExamReminderEmail } from '@clearpath/email';

const REMINDER_DAYS = [7, 3, 1];

export async function runStudentReminders() {
  let institutions;
  try {
    const res = await pool.query(
      `SELECT slug, name, email_sender_name, email_reply_to
       FROM public.institution WHERE is_active = TRUE`,
    );
    institutions = res.rows;
  } catch (err) {
    console.error('[student-reminders] Failed to fetch tenant schemas:', err.message);
    return;
  }

  for (const inst of institutions) {
    try {
      await remindStudentsInSchema(inst.slug, inst);
    } catch (err) {
      console.error(`[student-reminders] Error processing schema ${inst.slug}:`, err.message);
    }
  }
}

async function remindStudentsInSchema(schema, inst) {
  const result = await tenantQuery(
    schema,
    `SELECT
       ebr.id,
       c.code       AS course_code,
       ebr.exam_date,
       ebr.exam_time,
       ebr.exam_type,
       ebr.student_duration_mins,
       (ebr.exam_date::date - CURRENT_DATE) AS days_until,
       u.first_name AS student_first,
       u.last_name  AS student_last,
       u.email      AS student_email
     FROM exam_booking_request ebr
     JOIN course c ON c.id = ebr.course_id
     JOIN student_profile sp ON sp.id = ebr.student_profile_id
     JOIN "user" u ON u.id = sp.user_id
     WHERE ebr.status = 'confirmed'
       AND (ebr.exam_date::date - CURRENT_DATE) = ANY($1)`,
    [REMINDER_DAYS],
  );

  for (const row of result.rows) {
    const days    = parseInt(row.days_until, 10);
    const dateStr = new Date(row.exam_date).toLocaleDateString('en-CA', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const timeStr = row.exam_time ? ` at ${row.exam_time.slice(0, 5)}` : '';

    const context = {
      senderName:      inst.email_sender_name ?? `${inst.name} Accessibility Centre`,
      replyTo:         inst.email_reply_to,
      institutionName: inst.name,
    };

    const { subject, html, text } = studentExamReminderEmail(
      { firstName: row.student_first, lastName: row.student_last },
      {
        courseCode:  row.course_code,
        dateStr,
        timeStr,
        days,
        durationMins: row.student_duration_mins,
        examType:    row.exam_type,
      },
      context,
    );

    // Dedup: skip if already sent today for this student + course + interval
    const alreadySent = await tenantQuery(
      schema,
      `SELECT 1 FROM email_log
       WHERE to_email = $1
         AND subject LIKE $2
         AND sent_at::date = CURRENT_DATE
       LIMIT 1`,
      [row.student_email, `Exam Reminder — ${row.course_code} — %`],
    ).catch(() => null);

    if (alreadySent?.rowCount > 0) continue;

    // Log the send before attempting delivery (mirrors reminderService pattern)
    await tenantQuery(
      schema,
      `INSERT INTO email_log (exam_id, sent_by, to_email, subject, body_snapshot, delivery_status)
       VALUES (NULL, NULL, $1, $2, $3, 'sent')`,
      [row.student_email, subject, text.slice(0, 2000)],
    ).catch(err =>
      console.error(`[student-reminders] Failed to log email for ${row.student_email}:`, err.message),
    );

    await sendEmail({
      from:    process.env.EMAIL_FROM ?? 'noreply@clearpath.dev',
      to:      row.student_email,
      replyTo: inst.email_reply_to,
      subject,
      html,
      text,
    }).catch(err =>
      console.error(`[student-reminders] Email failed for ${row.student_email}:`, err.message),
    );

    console.log(`[student-reminders] Sent ${days}d reminder → ${row.student_email} (${row.course_code} on ${dateStr})`);
  }
}
