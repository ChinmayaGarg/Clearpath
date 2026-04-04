/**
 * Export routes
 *
 * GET /api/export/book/:date        Export daily book as HTML (print-ready)
 * GET /api/export/book/:date/json   Export daily book as JSON
 */
import { Router }         from 'express';
import { requireAuth }    from '../middleware/auth.js';
import { requireFeature } from '../middleware/feature.js';
import { tenantQuery }    from '../db/tenantPool.js';
import pool               from '../db/pool.js';

const router = Router();
router.use(requireAuth);
router.use(requireFeature('export_print'));

// ── GET /api/export/book/:date ────────────────────────────────────────────────
router.get('/book/:date', async (req, res, next) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: 'Invalid date format' });
    }

    const book = await buildBookExport(req.tenantSchema, date, req.institutionId);
    if (!book) {
      return res.status(404).json({ ok: false, error: 'No book found for this date' });
    }

    const html = renderBookHTML(book);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition',
      `inline; filename="clearpath-book-${date}.html"`);
    res.send(html);
  } catch (err) { next(err); }
});

// ── GET /api/export/book/:date/json ───────────────────────────────────────────
router.get('/book/:date/json', async (req, res, next) => {
  try {
    const { date } = req.params;
    const book = await buildBookExport(req.tenantSchema, date, req.institutionId);
    if (!book) {
      return res.status(404).json({ ok: false, error: 'No book found for this date' });
    }
    res.json({ ok: true, book });
  } catch (err) { next(err); }
});

export default router;

// ── Data builder ──────────────────────────────────────────────────────────────

async function buildBookExport(schema, date, institutionId) {
  // Get institution name
  const instResult = await pool.query(
    `SELECT name, email_sender_name FROM public.institution WHERE id = $1`,
    [institutionId]
  );
  const institution = instResult.rows[0];

  // Get exam day
  const dayResult = await tenantQuery(schema,
    `SELECT id, date, notes FROM exam_day WHERE date = $1`,
    [date]
  );
  if (!dayResult.rows.length) return null;
  const examDay = dayResult.rows[0];

  // Get all exams with rooms, appointments, accommodations
  const examsResult = await tenantQuery(schema,
    `SELECT
       e.id, e.course_code, e.cross_listed_code,
       e.duration_mins, e.exam_type, e.delivery,
       e.materials, e.password, e.status, e.rwg_flag,
       u.first_name || ' ' || u.last_name AS professor_name,
       u.email                             AS professor_email,
       pp.phone                            AS professor_phone,
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
       COALESCE(SUM(er.student_count), 0) AS total_students
     FROM exam e
     LEFT JOIN professor_profile pp ON pp.id = e.professor_id
     LEFT JOIN "user"            u  ON u.id  = pp.user_id
     LEFT JOIN exam_room         er ON er.exam_id = e.id
     WHERE e.exam_day_id = $1
       AND e.status NOT IN ('cancelled', 'dropped')
     GROUP BY e.id, u.first_name, u.last_name,
              u.email, pp.phone
     ORDER BY MIN(er.start_time), e.course_code`,
    [examDay.id]
  );

  const exams = examsResult.rows;

  // Summary stats
  const stats = {
    total:    exams.length,
    students: exams.reduce((s, e) => s + Number(e.total_students), 0),
    rwg:      exams.filter(e => e.rwg_flag).length,
    pending:  exams.filter(e => e.status === 'pending').length,
  };

  return {
    institution,
    date,
    notes: examDay.notes,
    exams,
    stats,
    exportedAt: new Date().toISOString(),
  };
}

// ── HTML renderer ─────────────────────────────────────────────────────────────

function renderBookHTML(book) {
  const { institution, date, exams, stats, notes } = book;

  const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const institutionName = institution?.email_sender_name
    ?? institution?.name
    ?? 'Accessibility Centre';

  function formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour  = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  function deliveryLabel(d) {
    return { pickup: 'Pickup', dropped: 'Dropped off',
             delivery: 'Delivery', pending: 'TBC' }[d] ?? d;
  }

  const examRows = exams.map(e => {
    const rooms = e.rooms.map(r =>
      `<span class="room-chip">${r.room_name} ${formatTime(r.start_time)} (${r.student_count})</span>`
    ).join(' ');

    const flags = [];
    if (e.rwg_flag)  flags.push('<span class="flag rwg">RWG</span>');
    if (e.exam_type === 'brightspace') flags.push('<span class="flag bs">Brightspace</span>');
    if (e.exam_type === 'crowdmark')   flags.push('<span class="flag cm">Crowdmark</span>');
    if (e.status === 'pending')        flags.push('<span class="flag pending">Not emailed</span>');

    return `
    <tr class="${e.rwg_flag ? 'rwg-row' : ''}">
      <td class="course">
        <strong>${e.course_code}</strong>
        ${e.cross_listed_code ? `<br><span class="cross">${e.cross_listed_code}</span>` : ''}
        ${flags.length ? `<div class="flags">${flags.join('')}</div>` : ''}
      </td>
      <td class="rooms">${rooms || '—'}</td>
      <td class="students">${e.total_students}</td>
      <td class="prof">
        ${e.professor_name ?? '<span class="muted">—</span>'}
        ${e.professor_email ? `<br><span class="muted small">${e.professor_email}</span>` : ''}
      </td>
      <td class="delivery">${deliveryLabel(e.delivery)}</td>
      <td class="materials">${e.materials ?? '<span class="muted">—</span>'}</td>
      <td class="duration">${e.duration_mins ? e.duration_mins + ' min' : '—'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Book — ${dateFormatted}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      font-size: 11px;
      color: #1a1a1a;
      background: white;
      padding: 20px;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 12px;
      border-bottom: 2px solid #26215C;
      margin-bottom: 16px;
    }
    .header-left h1 { font-size: 18px; font-weight: 700; color: #26215C; }
    .header-left p  { font-size: 12px; color: #666; margin-top: 2px; }
    .header-right   { text-align: right; font-size: 10px; color: #999; }

    /* Stats bar */
    .stats {
      display: flex;
      gap: 24px;
      padding: 10px 14px;
      background: #f8f7ff;
      border: 1px solid #CECBF6;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    .stat-item { display: flex; flex-direction: column; gap: 1px; }
    .stat-value { font-size: 18px; font-weight: 700; color: #26215C; }
    .stat-label { font-size: 9px; text-transform: uppercase;
                  letter-spacing: 0.05em; color: #888; }

    /* Notes */
    .notes {
      padding: 8px 12px;
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 6px;
      margin-bottom: 14px;
      font-size: 11px;
      color: #78350f;
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    thead th {
      background: #26215C;
      color: white;
      text-align: left;
      padding: 6px 8px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    tbody tr { border-bottom: 1px solid #e5e7eb; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr.rwg-row { background: #fff1f2 !important; }
    td { padding: 6px 8px; vertical-align: top; }

    /* Columns */
    .course   { width: 14%; font-weight: 600; }
    .rooms    { width: 22%; }
    .students { width: 5%;  text-align: center; font-weight: 600; }
    .prof     { width: 16%; }
    .delivery { width: 9%;  }
    .materials{ width: 22%; color: #555; }
    .duration { width: 7%;  text-align: center; }

    .cross  { font-size: 9px; color: #888; font-weight: 400; }
    .muted  { color: #999; }
    .small  { font-size: 9px; }

    .room-chip {
      display: inline-block;
      background: #ede9fe;
      color: #4c1d95;
      padding: 1px 5px;
      border-radius: 3px;
      margin: 1px 2px 1px 0;
      font-size: 9.5px;
      white-space: nowrap;
    }

    .flags  { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 3px; }
    .flag   {
      display: inline-block;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8.5px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .flag.rwg     { background: #fee2e2; color: #991b1b; }
    .flag.bs      { background: #dbeafe; color: #1e40af; }
    .flag.cm      { background: #d1fae5; color: #065f46; }
    .flag.pending { background: #fef3c7; color: #92400e; }

    /* Footer */
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #bbb;
    }

    /* Print */
    @media print {
      body { padding: 10px; font-size: 10px; }
      .header { padding-bottom: 8px; margin-bottom: 10px; }
      .no-print { display: none !important; }
      thead th { background: #26215C !important; -webkit-print-color-adjust: exact; }
      tbody tr.rwg-row { background: #fff1f2 !important; -webkit-print-color-adjust: exact; }
      tbody tr:nth-child(even) { background: #f9fafb !important; -webkit-print-color-adjust: exact; }
      .room-chip { background: #ede9fe !important; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Print button (hidden when printing) -->
  <div class="no-print" style="text-align:right; margin-bottom:12px;">
    <button onclick="window.print()" style="
      padding: 8px 18px;
      background: #534AB7;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    ">🖨 Print / Save as PDF</button>
  </div>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>${dateFormatted}</h1>
      <p>${institutionName} — Daily Exam Book</p>
    </div>
    <div class="header-right">
      <div>Clearpath</div>
      <div>Printed ${new Date().toLocaleString('en-CA', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })}</div>
    </div>
  </div>

  <!-- Stats -->
  <div class="stats">
    <div class="stat-item">
      <span class="stat-value">${stats.total}</span>
      <span class="stat-label">Exams</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">${stats.students}</span>
      <span class="stat-label">Students</span>
    </div>
    ${stats.rwg > 0 ? `
    <div class="stat-item">
      <span class="stat-value" style="color:#dc2626">${stats.rwg}</span>
      <span class="stat-label">RWG</span>
    </div>` : ''}
    ${stats.pending > 0 ? `
    <div class="stat-item">
      <span class="stat-value" style="color:#d97706">${stats.pending}</span>
      <span class="stat-label">Not emailed</span>
    </div>` : ''}
  </div>

  ${notes ? `<div class="notes"><strong>Notes:</strong> ${notes}</div>` : ''}

  <!-- Exam table -->
  <table>
    <thead>
      <tr>
        <th>Course</th>
        <th>Rooms &amp; Times</th>
        <th>Students</th>
        <th>Professor</th>
        <th>Delivery</th>
        <th>Materials permitted</th>
        <th>Duration</th>
      </tr>
    </thead>
    <tbody>
      ${examRows || `
        <tr>
          <td colspan="7" style="text-align:center;padding:20px;color:#999;">
            No exams for this date
          </td>
        </tr>`}
    </tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    <span>${institutionName}</span>
    <span>Generated by Clearpath · ${date}</span>
  </div>

</body>
</html>`;
}
