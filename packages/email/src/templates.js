/**
 * Email templates for Clearpath.
 *
 * All templates are plain functions — no template engine dependency.
 * Returns { subject, html, text } so we always send both formats.
 *
 * Institution-specific overrides (sender name, reply-to, custom footer)
 * are passed in via `context`.
 */

/**
 * Professor exam notification email.
 * Sent by leads to notify professors about their exam and collect materials/passwords.
 *
 * @param {Object} exam     - exam record from DB
 * @param {Object} context  - institution context
 */
export function professorExamEmail(exam, context) {
  const {
    courseCode, crossListedCode, durationMins,
    examType, delivery, materials, rooms,
    totalStudents, rwgFlag, date,
  } = exam;

  const {
    senderName   = 'Accessibility Centre',
    replyTo      = '',
    institutionName = 'the institution',
  } = context;

  const crossNote  = crossListedCode ? ` / ${crossListedCode}` : '';
  const dateStr    = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-CA', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : 'the upcoming exam date';

  const roomLines = (rooms ?? [])
    .map(r => `  • ${r.room_name ?? r.roomName} at ${formatTime(r.start_time ?? r.startTime)} — ${r.student_count ?? r.studentCount} student(s)`)
    .join('\n');

  const needsPassword = examType === 'brightspace' || examType === 'crowdmark';

  const subject = `Exam Accommodation Request — ${courseCode}${crossNote} — ${dateStr}`;

  const text = `
Dear Professor,

We are writing to inform you that students registered with the ${senderName} at ${institutionName} will be writing the ${courseCode}${crossNote} exam on ${dateStr} with accommodations.

EXAM DETAILS
─────────────────────────────────────
Course:       ${courseCode}${crossNote}
Date:         ${dateStr}
Duration:     ${durationMins ? durationMins + ' minutes' : 'Please confirm'}
Format:       ${examType === 'brightspace' ? 'Brightspace (online)' : examType === 'crowdmark' ? 'Crowdmark' : 'Paper'}
Delivery:     ${formatDelivery(delivery)}
Students:     ${totalStudents ?? 0}
${rwgFlag ? '\n⚠ Some students require a Word (.docx) file for Read/Write/Graph (RWG) accommodation.\n' : ''}
ROOM ASSIGNMENTS
─────────────────────────────────────
${roomLines || '  (Rooms to be confirmed)'}

MATERIALS PERMITTED
─────────────────────────────────────
${materials || 'Please reply with permitted materials for this exam.'}

${needsPassword ? `EXAM FILE / PASSWORD\n─────────────────────────────────────\nPlease reply with the exam file and password (if applicable) as soon as possible.\n` : ''}
ACTION REQUIRED
─────────────────────────────────────
Please reply to this email to confirm the above details, provide any missing materials information${needsPassword ? ', and send the exam file' : ''}.

If you have any questions or need to make changes, please reply to this email.

Thank you,
${senderName}
${replyTo ? replyTo : ''}
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           font-size: 14px; color: #1a1a1a; line-height: 1.6; margin: 0; padding: 0; }
    .container { max-width: 580px; margin: 0 auto; padding: 32px 24px; }
    .header { border-bottom: 2px solid #534AB7; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 18px; font-weight: 600; color: #26215C; margin: 0 0 4px; }
    .header p  { font-size: 13px; color: #666; margin: 0; }
    .section   { margin-bottom: 24px; }
    .section h2 { font-size: 12px; font-weight: 600; color: #534AB7;
                  text-transform: uppercase; letter-spacing: 0.05em;
                  margin: 0 0 8px; }
    .detail-row { display: flex; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
    .detail-label { width: 120px; font-size: 13px; color: #666; flex-shrink: 0; }
    .detail-value { font-size: 13px; color: #1a1a1a; }
    .room-row   { padding: 4px 0; font-size: 13px; }
    .alert      { background: #FFF3CD; border: 1px solid #FBBF24;
                  border-radius: 6px; padding: 10px 14px;
                  font-size: 13px; color: #92400E; margin: 16px 0; }
    .action     { background: #EEEDFE; border-radius: 8px; padding: 16px;
                  margin-top: 24px; }
    .action p   { margin: 0; font-size: 13px; color: #26215C; }
    .footer     { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee;
                  font-size: 12px; color: #999; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${senderName}</h1>
    <p>Exam Accommodation Notification</p>
  </div>

  <p>Dear Professor,</p>
  <p>Students registered with the ${senderName} will be writing the
     <strong>${courseCode}${crossNote}</strong> exam on
     <strong>${dateStr}</strong> with accommodations.</p>

  <div class="section">
    <h2>Exam details</h2>
    ${detailRow('Course', `${courseCode}${crossNote}`)}
    ${detailRow('Date', dateStr)}
    ${detailRow('Duration', durationMins ? `${durationMins} minutes` : '⚠ Please confirm')}
    ${detailRow('Format', examType === 'brightspace' ? 'Brightspace (online)' : examType === 'crowdmark' ? 'Crowdmark' : 'Paper')}
    ${detailRow('Delivery', formatDelivery(delivery))}
    ${detailRow('Students', String(totalStudents ?? 0))}
  </div>

  ${rwgFlag ? `<div class="alert">⚠ Some students require a Word (.docx) file for the Read/Write/Graph (RWG) accommodation.</div>` : ''}

  <div class="section">
    <h2>Room assignments</h2>
    ${(rooms ?? []).map(r =>
      `<div class="room-row">• ${r.room_name ?? r.roomName} at ${formatTime(r.start_time ?? r.startTime)} — ${r.student_count ?? r.studentCount} student(s)</div>`
    ).join('') || '<p style="color:#666;font-size:13px;">Rooms to be confirmed</p>'}
  </div>

  <div class="section">
    <h2>Materials permitted</h2>
    <p style="font-size:13px;">${materials || '<em style="color:#999">Please reply with permitted materials for this exam.</em>'}</p>
  </div>

  ${needsPassword ? `
  <div class="section">
    <h2>Exam file &amp; password</h2>
    <p style="font-size:13px;color:#dc2626;">
      Please reply with the exam file and password as soon as possible.
    </p>
  </div>` : ''}

  <div class="action">
    <p><strong>Action required:</strong> Please reply to confirm these details${needsPassword ? ', provide the exam file,' : ''}
    and let us know if anything needs to be updated.</p>
  </div>

  <div class="footer">
    <p>${senderName}${replyTo ? ` · ${replyTo}` : ''}</p>
    <p style="color:#ccc;font-size:11px;">Sent via Clearpath</p>
  </div>
</div>
</body>
</html>
`.trim();

  return { subject, html, text };
}

/**
 * Password reset email.
 */
export function passwordResetEmail(user, resetUrl, context) {
  const { senderName = 'Clearpath' } = context;
  const subject = 'Reset your Clearpath password';

  const text = `
Hi ${user.firstName},

You requested a password reset for your Clearpath account.

Click the link below to set a new password (expires in 1 hour):
${resetUrl}

If you didn't request this, you can safely ignore this email.

${senderName}
`.trim();

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, sans-serif; font-size:14px; color:#1a1a1a; }
  .container { max-width:480px; margin:0 auto; padding:32px 24px; }
  .btn { display:inline-block; background:#534AB7; color:#fff;
         text-decoration:none; padding:10px 24px; border-radius:6px;
         font-size:14px; font-weight:500; margin:16px 0; }
  .footer { margin-top:32px; font-size:12px; color:#999; }
</style>
</head><body>
<div class="container">
  <h2 style="color:#26215C;">Reset your password</h2>
  <p>Hi ${user.firstName},</p>
  <p>Click the button below to reset your password. This link expires in 1 hour.</p>
  <a href="${resetUrl}" class="btn">Reset password</a>
  <p style="font-size:12px;color:#999;">Or copy this link: ${resetUrl}</p>
  <p style="font-size:13px;color:#666;">If you didn't request this, ignore this email.</p>
  <div class="footer">${senderName}</div>
</div>
</body></html>
`.trim();

  return { subject, html, text };
}

/**
 * User invitation email.
 */
export function inviteEmail(user, loginUrl, temporaryPassword, context) {
  const { senderName = 'Clearpath', institutionName = '' } = context;
  const subject = `You've been invited to Clearpath${institutionName ? ` — ${institutionName}` : ''}`;

  const text = `
Hi ${user.firstName},

You've been invited to Clearpath${institutionName ? ` at ${institutionName}` : ''}.

Login:    ${loginUrl}
Email:    ${user.email}
Password: ${temporaryPassword}

Please log in and change your password immediately.

${senderName}
`.trim();

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family:-apple-system,sans-serif; font-size:14px; color:#1a1a1a; }
  .container { max-width:480px; margin:0 auto; padding:32px 24px; }
  .cred { background:#f8f7ff; border:1px solid #CECBF6; border-radius:8px;
          padding:16px; margin:16px 0; font-family:monospace; font-size:13px; }
  .btn { display:inline-block; background:#534AB7; color:#fff;
         text-decoration:none; padding:10px 24px; border-radius:6px;
         font-weight:500; margin:16px 0; }
  .footer { margin-top:32px; font-size:12px; color:#999; }
</style>
</head><body>
<div class="container">
  <h2 style="color:#26215C;">Welcome to Clearpath</h2>
  <p>Hi ${user.firstName},</p>
  <p>You've been invited to Clearpath${institutionName ? ` at <strong>${institutionName}</strong>` : ''}.</p>
  <div class="cred">
    <div><strong>Email:</strong> ${user.email}</div>
    <div><strong>Temporary password:</strong> ${temporaryPassword}</div>
  </div>
  <a href="${loginUrl}" class="btn">Log in to Clearpath</a>
  <p style="font-size:13px;color:#dc2626;">Please change your password immediately after logging in.</p>
  <div class="footer">${senderName}</div>
</div>
</body></html>
`.trim();

  return { subject, html, text };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detailRow(label, value) {
  return `<div class="detail-row">
    <span class="detail-label">${label}</span>
    <span class="detail-value">${value}</span>
  </div>`;
}

function formatDelivery(delivery) {
  const map = {
    pickup:   'Pickup by lead',
    dropped:  'Dropped off by professor',
    delivery: 'Delivery to exam room',
    pending:  'To be confirmed',
  };
  return map[delivery] ?? delivery ?? 'To be confirmed';
}

function formatTime(t) {
  if (!t) return '';
  // Convert HH:MM:SS or HH:MM to 12-hour format
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour  = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}
