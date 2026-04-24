/**
 * Exam stage advancement service.
 *
 * Runs every 1 minute. For each tenant schema:
 *
 *  1. prepped → ongoing: when effective start time has elapsed
 *  2. NULL   → ongoing + missed_prep=TRUE: when start time has elapsed without being prepped
 *     → emails all leads & institution_admins in that tenant
 *
 * "Effective start time" for a given exam_upload_date row:
 *  - If time_slot IS NOT NULL: exam_date + time_slot
 *  - If time_slot IS NULL: exam_date + MIN(ebr.exam_time) for confirmed bookings of that course+date
 *    If no confirmed bookings found for a NULL time_slot row → skip (require manual advance)
 *
 * finished stage is NOT auto-advanced — manual only.
 *
 * Called once on server startup, then every 60 seconds.
 */
import pool            from '../db/pool.js';
import { tenantQuery } from '../db/tenantPool.js';
import { sendEmail }   from '@clearpath/email';

export async function runExamStageAdvancement() {
  let institutions;
  try {
    const res = await pool.query(
      `SELECT slug, name, email_sender_name, email_reply_to
       FROM public.institution WHERE is_active = TRUE`,
    );
    institutions = res.rows;
  } catch (err) {
    console.error('[examStage] Failed to fetch tenant schemas:', err.message);
    return;
  }

  for (const inst of institutions) {
    try {
      await advanceSchema(inst.slug, inst);
    } catch (err) {
      console.error(`[examStage] Error processing schema ${inst.slug}:`, err.message);
    }
  }
}

async function advanceSchema(schema, inst) {
  // ── Step 1: prepped → ongoing (start time elapsed) ──────────────────────────
  await tenantQuery(
    schema,
    `UPDATE exam_upload_date eud
     SET session_stage    = 'ongoing',
         stage_updated_at = NOW(),
         stage_updated_by = NULL
     WHERE eud.session_stage = 'prepped'
       AND (
         -- explicit time_slot: use it directly
         (eud.time_slot IS NOT NULL
          AND (eud.exam_date + eud.time_slot)::timestamptz <= NOW())
         OR
         -- no time_slot: derive from min confirmed booking time
         (eud.time_slot IS NULL AND EXISTS (
           SELECT 1
           FROM exam_upload eu2
           WHERE eu2.id = eud.exam_upload_id
         ) AND (
           SELECT (eud.exam_date + MIN(ebr.exam_time))::timestamptz
           FROM exam_booking_request ebr
           JOIN exam_upload eu2 ON eu2.id = eud.exam_upload_id
           WHERE UPPER(ebr.course_code) = UPPER(eu2.course_code)
             AND ebr.exam_date = eud.exam_date
             AND ebr.status = 'confirmed'
         ) <= NOW())
       )`,
  );

  // Log audit for rows just auto-advanced to ongoing from prepped
  await tenantQuery(
    schema,
    `INSERT INTO exam_stage_audit (upload_date_id, from_stage, to_stage, changed_by, note)
     SELECT eud.id, 'prepped', 'ongoing', NULL, 'Auto-advanced at exam start time'
     FROM exam_upload_date eud
     WHERE eud.session_stage = 'ongoing'
       AND eud.stage_updated_by IS NULL
       AND eud.stage_updated_at >= NOW() - interval '2 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM exam_stage_audit esa
         WHERE esa.upload_date_id = eud.id
           AND esa.to_stage = 'ongoing'
           AND esa.changed_by IS NULL
           AND esa.changed_at >= NOW() - interval '2 minutes'
       )`,
  );

  // ── Step 2: NULL → ongoing + missed_prep=TRUE ────────────────────────────────
  const missedResult = await tenantQuery(
    schema,
    `UPDATE exam_upload_date eud
     SET session_stage    = 'ongoing',
         missed_prep      = TRUE,
         stage_updated_at = NOW(),
         stage_updated_by = NULL
     WHERE eud.session_stage IS NULL
       AND (
         (eud.time_slot IS NOT NULL
          AND (eud.exam_date + eud.time_slot)::timestamptz <= NOW())
         OR
         (eud.time_slot IS NULL AND (
           SELECT (eud.exam_date + MIN(ebr.exam_time))::timestamptz
           FROM exam_booking_request ebr
           JOIN exam_upload eu2 ON eu2.id = eud.exam_upload_id
           WHERE UPPER(ebr.course_code) = UPPER(eu2.course_code)
             AND ebr.exam_date = eud.exam_date
             AND ebr.status = 'confirmed'
         ) <= NOW())
       )
       AND EXISTS (
         SELECT 1 FROM exam_upload eu2
         JOIN exam_upload_date eud2 ON eud2.id = eud.id
         WHERE eu2.id = eud.exam_upload_id AND eu2.status = 'submitted'
       )
     RETURNING eud.id AS upload_date_id,
               (SELECT eu.course_code FROM exam_upload eu WHERE eu.id = eud.exam_upload_id) AS course_code,
               eud.exam_date,
               eud.time_slot`,
  );

  if (missedResult.rows.length > 0) {
    // Log audit for each missed-prep row
    for (const row of missedResult.rows) {
      await tenantQuery(
        schema,
        `INSERT INTO exam_stage_audit (upload_date_id, from_stage, to_stage, changed_by, note)
         VALUES ($1, NULL, 'ongoing', NULL, 'Exam went live without being marked Prepped')`,
        [row.upload_date_id],
      ).catch(() => {});
    }

    // Email all leads & institution_admins in this tenant
    await notifyMissedPrep(schema, inst, missedResult.rows);
  }
}

async function notifyMissedPrep(schema, inst, missedRows) {
  // Fetch all leads + institution_admins in this tenant
  let recipients;
  try {
    const res = await tenantQuery(
      schema,
      `SELECT u.email, u.first_name, u.last_name
       FROM "user" u
       WHERE u.role IN ('lead', 'institution_admin')
         AND u.is_active = TRUE
         AND u.email IS NOT NULL`,
    );
    recipients = res.rows;
  } catch (err) {
    console.error(`[examStage] Failed to fetch recipients for ${schema}:`, err.message);
    return;
  }

  if (!recipients.length) return;

  const fromName    = inst.email_sender_name ?? `${inst.name} Accessibility Centre`;
  const fromAddress = `${fromName} <${process.env.EMAIL_FROM ?? 'noreply@clearpath.dev'}>`;

  for (const row of missedRows) {
    const dateStr  = new Date(row.exam_date).toLocaleDateString('en-CA', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    const timeStr  = row.time_slot ? ` at ${String(row.time_slot).slice(0, 5)}` : '';
    const subject  = `⚠ ${row.course_code} exam went live without being marked Prepped`;
    const textBody = `${row.course_code} on ${dateStr}${timeStr} was not marked as Prepped before the exam started. It has been automatically moved to Ongoing. Please review in the Returns tab.`;
    const htmlBody = `<p><strong>⚠ Missed Prep — ${row.course_code}</strong></p>
<p>${row.course_code} on <strong>${dateStr}${timeStr}</strong> was not marked as <em>Prepped</em> before the exam started.</p>
<p>It has been automatically moved to <strong>Ongoing</strong>. Please review in the Prep portal → Returns tab.</p>`;

    for (const recipient of recipients) {
      await sendEmail({
        from:    fromAddress,
        to:      recipient.email,
        replyTo: inst.email_reply_to,
        subject,
        html:    htmlBody,
        text:    textBody,
      }).catch(err =>
        console.error(`[examStage] Email failed for ${recipient.email}:`, err.message),
      );
    }
  }
}
