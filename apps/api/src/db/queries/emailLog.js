/**
 * Email log query functions — all tenant-scoped.
 * Every email ever sent through Clearpath is logged here.
 */
import { tenantQuery } from '../tenantPool.js';

/**
 * Create an email log entry.
 */
export async function logEmail(schema, {
  examId, sentBy, toEmail, subject, bodySnapshot, deliveryStatus = 'queued',
}) {
  const result = await tenantQuery(schema,
    `INSERT INTO email_log
       (exam_id, sent_by, to_email, subject, body_snapshot, delivery_status, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id`,
    [examId, sentBy, toEmail, subject, bodySnapshot, deliveryStatus]
  );
  return result.rows[0].id;
}

/**
 * Update delivery status of a logged email.
 * Called via webhook from Resend when delivery is confirmed or bounced.
 */
export async function updateEmailStatus(schema, emailLogId, deliveryStatus) {
  await tenantQuery(schema,
    `UPDATE email_log SET delivery_status = $1 WHERE id = $2`,
    [deliveryStatus, emailLogId]
  );
}

/**
 * Get email log for a specific exam.
 */
export async function getEmailLogForExam(schema, examId) {
  const result = await tenantQuery(schema,
    `SELECT
       el.id, el.to_email, el.subject, el.delivery_status, el.sent_at,
       u.first_name || ' ' || u.last_name AS sent_by_name
     FROM email_log el
     LEFT JOIN "user" u ON u.id = el.sent_by
     WHERE el.exam_id = $1
     ORDER BY el.sent_at DESC`,
    [examId]
  );
  return result.rows;
}

/**
 * Check if an email has already been sent to a professor for this exam today.
 * Used for deduplication — prevents double-sending.
 */
export async function emailSentTodayForExam(schema, examId, toEmail) {
  const result = await tenantQuery(schema,
    `SELECT 1 FROM email_log
     WHERE exam_id = $1
       AND to_email = $2
       AND sent_at >= CURRENT_DATE
       AND delivery_status NOT IN ('failed', 'bounced')
     LIMIT 1`,
    [examId, toEmail]
  );
  return result.rows.length > 0;
}

/**
 * Get all emails sent on a given date — for analytics.
 */
export async function getEmailLogForDate(schema, date) {
  const result = await tenantQuery(schema,
    `SELECT
       el.id, el.to_email, el.subject, el.delivery_status, el.sent_at,
       e.course_code,
       u.first_name || ' ' || u.last_name AS sent_by_name
     FROM email_log el
     JOIN exam      e ON e.id = el.exam_id
     JOIN exam_day ed ON ed.id = e.exam_day_id AND ed.date = $1
     LEFT JOIN "user" u ON u.id = el.sent_by
     ORDER BY el.sent_at DESC`,
    [date]
  );
  return result.rows;
}
