/**
 * Email service — compose and send professor exam emails.
 */
import { professorExamEmail } from '@clearpath/email';
import { sendEmail }          from '@clearpath/email';
import { logEmail,
         updateEmailStatus,
         emailSentTodayForExam,
         getEmailLogForExam }  from '../db/queries/emailLog.js';
import { logAction }          from '../db/queries/audit.js';
import { tenantQuery }        from '../db/tenantPool.js';
import pool                   from '../db/pool.js';
import { logger }             from '../utils/logger.js';

/**
 * Build the email body for a professor exam notification.
 * Does NOT send — just generates the preview.
 * Used by the frontend to show a draft before sending.
 */
export async function composeExamEmail(schema, examId, institutionId) {
  const exam    = await getExamWithContext(schema, examId);
  const context = await getInstitutionContext(institutionId);

  if (!exam) throw Object.assign(new Error('Exam not found'), { status: 404 });

  return professorExamEmail(exam, context);
}

/**
 * Send the professor exam email.
 * Checks for duplicate sends before sending.
 * Logs the email regardless of delivery status.
 */
export async function sendExamEmail(schema, institutionId, {
  examId, toEmail, subject, htmlBody, textBody, sentBy,
}) {
  // Duplicate check — same exam, same address, sent today
  const alreadySent = await emailSentTodayForExam(schema, examId, toEmail);
  if (alreadySent) {
    throw Object.assign(
      new Error('An email was already sent to this address for this exam today'),
      { status: 409 }
    );
  }

  const context    = await getInstitutionContext(institutionId);
  const fromAddress = buildFromAddress(context);

  // Log before sending — captures intent even if send fails
  const emailLogId = await logEmail(schema, {
    examId,
    sentBy,
    toEmail,
    subject,
    bodySnapshot: textBody,
    deliveryStatus: 'queued',
  });

  try {
    const result = await sendEmail({
      from:    fromAddress,
      to:      toEmail,
      replyTo: context.replyTo,
      subject,
      html:    htmlBody,
      text:    textBody,
    });

    // Update delivery status
    await updateEmailStatus(
      schema,
      emailLogId,
      result.delivered ? 'sent' : 'queued'
    );

    // Advance exam status to 'emailed' if still pending
    await tenantQuery(schema,
      `UPDATE exam
       SET status = 'emailed', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [examId]
    );

    // Audit log
    await logAction(schema, {
      entityType: 'exam',
      entityId:   examId,
      action:     'email_sent',
      newValue:   toEmail,
      changedBy:  sentBy,
    });

    logger.info('Exam email sent', { examId, toEmail, schema });

    return { emailLogId, delivered: result.delivered };

  } catch (err) {
    await updateEmailStatus(schema, emailLogId, 'failed');
    throw err;
  }
}

/**
 * Get the email log for an exam.
 */
export async function getExamEmailLog(schema, examId) {
  return getEmailLogForExam(schema, examId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetch exam with all fields needed for email composition.
 */
async function getExamWithContext(schema, examId) {
  const result = await tenantQuery(schema,
    `SELECT
       e.id, e.course_code, e.cross_listed_code,
       e.duration_mins, e.exam_type, e.delivery,
       e.materials, e.password, e.status, e.rwg_flag,
       ed.date,
       COALESCE(
         json_agg(
           json_build_object(
             'room_name',     er.room_name,
             'start_time',    er.start_time,
             'student_count', er.student_count
           ) ORDER BY er.start_time
         ) FILTER (WHERE er.id IS NOT NULL),
         '[]'
       ) AS rooms,
       COALESCE(SUM(er.student_count), 0) AS total_students,
       pp.user_id                         AS professor_user_id,
       u.email                            AS professor_email
     FROM exam e
     JOIN exam_day ed ON ed.id = e.exam_day_id
     LEFT JOIN exam_room      er ON er.exam_id = e.id
     LEFT JOIN professor_profile pp ON pp.id = e.professor_id
     LEFT JOIN "user"            u  ON u.id = pp.user_id
     WHERE e.id = $1
     GROUP BY e.id, ed.date, pp.user_id, u.email`,
    [examId]
  );
  return result.rows[0] ?? null;
}

/**
 * Fetch institution context for email personalisation.
 */
async function getInstitutionContext(institutionId) {
  const result = await pool.query(
    `SELECT name, email_sender_name, email_reply_to, timezone
     FROM public.institution WHERE id = $1`,
    [institutionId]
  );
  const inst = result.rows[0];
  if (!inst) return {};

  return {
    institutionName: inst.name,
    senderName:      inst.email_sender_name ?? `${inst.name} Accessibility Centre`,
    replyTo:         inst.email_reply_to,
    timezone:        inst.timezone,
  };
}

function buildFromAddress(context) {
  const name    = context.senderName ?? 'Clearpath';
  const address = process.env.EMAIL_FROM ?? 'noreply@clearpath.dev';
  return `${name} <${address}>`;
}
