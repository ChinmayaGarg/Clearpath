/**
 * Prep portal routes — for leads and institution admins to prepare exam day materials.
 *
 * GET /api/prep/students?date=YYYY-MM-DD  — confirmed students grouped by room
 * GET /api/prep/ede?date=YYYY-MM-DD       — print-ready EDE HTML (one per student)
 * GET /api/prep/labels?date=YYYY-MM-DD    — print-ready Avery-5160 label sheet
 */
import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { tenantQuery } from '../db/tenantPool.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('lead', 'institution_admin'));

// ── Shared data fetcher ───────────────────────────────────────────────────────

async function fetchPrepData(schema, date) {
  // 1. Confirmed bookings with room assignment + professor info
  const bookingsResult = await tenantQuery(
    schema,
    `SELECT
       ebr.id AS booking_id,
       ebr.course_code, ebr.exam_date, ebr.exam_time, ebr.exam_type,
       ebr.special_materials_note,
       ebr.base_duration_mins, ebr.extra_mins, ebr.stb_mins, ebr.computed_duration_mins,
       ebr.student_duration_mins,
       sp.id AS student_profile_id, sp.student_number,
       u.first_name, u.last_name,
       br.name AS room_name,
       pu.first_name AS prof_first_name, pu.last_name AS prof_last_name,
       pu.email AS prof_email, pp.phone AS prof_phone,
       eu.exam_format AS prof_exam_format
     FROM exam_booking_request ebr
     JOIN student_profile sp ON sp.id = ebr.student_profile_id
     JOIN "user" u ON u.id = sp.user_id
     LEFT JOIN booking_assignment ba ON ba.exam_booking_request_id = ebr.id
     LEFT JOIN booking_schedule_room bsr ON bsr.id = ba.schedule_room_id
     LEFT JOIN booking_schedule bs
            ON bs.id = bsr.schedule_id AND bs.date = ebr.exam_date
     LEFT JOIN booking_room br ON br.id = bsr.booking_room_id
     LEFT JOIN professor_profile pp ON pp.id = ebr.professor_profile_id
     LEFT JOIN "user" pu ON pu.id = pp.user_id
     LEFT JOIN LATERAL (
       SELECT eu2.exam_format
       FROM exam_upload eu2
       JOIN exam_upload_date eud ON eud.exam_upload_id = eu2.id
       WHERE UPPER(eu2.course_code) = UPPER(ebr.course_code)
         AND eud.exam_date = ebr.exam_date
         AND eu2.status = 'submitted'
       ORDER BY eu2.submitted_at DESC
       LIMIT 1
     ) eu ON TRUE
     WHERE ebr.exam_date = $1 AND ebr.status = 'confirmed'
     ORDER BY br.name ASC NULLS LAST, ebr.exam_time ASC NULLS LAST, u.last_name ASC`,
    [date],
  );

  const rows = bookingsResult.rows;
  if (!rows.length) return [];

  // 2. Fetch accommodation codes for all students
  const profileIds = [...new Set(rows.map(r => r.student_profile_id))];
  const accomResult = await tenantQuery(
    schema,
    `SELECT sa.student_profile_id, ac.code, ac.label
     FROM student_accommodation sa
     JOIN accommodation_code ac ON ac.id = sa.accommodation_code_id
     WHERE sa.student_profile_id = ANY($1) AND ac.is_active = TRUE
     ORDER BY ac.code`,
    [profileIds],
  );

  const accomMap = {};
  for (const a of accomResult.rows) {
    (accomMap[a.student_profile_id] ??= []).push({ code: a.code, label: a.label });
  }

  // 3. Merge into student objects
  const fmtTime = mins => mins == null ? null
    : `${Math.floor(mins / 60).toString().padStart(2, '0')}:${(mins % 60).toString().padStart(2, '0')}`;

  return rows.map(r => {
    const accoms = accomMap[r.student_profile_id] ?? [];

    // base: prefer DB-stored value, fall back to what student submitted
    const base = r.base_duration_mins ?? r.student_duration_mins ?? null;

    // Compute extra_mins and stb_mins from accommodation code strings
    // if they haven't been stored on the row yet (or are zero).
    let computedExtra = 0;
    let computedStb   = 0;
    if (base) {
      for (const a of accoms) {
        const extraMatch = a.code.match(/^(\d+)MIN\/HR$/);
        if (extraMatch) computedExtra += Math.ceil(base * parseInt(extraMatch[1]) / 60);

        const stbMatch = a.code.match(/^(\d+)MIN\/HR STB$/);
        if (stbMatch) computedStb += Math.ceil(base * parseInt(stbMatch[1]) / 60);
      }
    }

    const extraMins = (r.extra_mins > 0 ? r.extra_mins : computedExtra);
    const stbMins   = (r.stb_mins   > 0 ? r.stb_mins   : computedStb);

    const totalWritingMins = base != null ? base + extraMins : null;

    const examTimeMins = r.exam_time
      ? (() => { const [h, m] = r.exam_time.slice(0, 5).split(':').map(Number); return h * 60 + m; })()
      : null;
    const estFinishMins = examTimeMins != null && totalWritingMins
      ? examTimeMins + totalWritingMins
      : null;

    return {
      bookingId:            r.booking_id,
      courseCode:           r.course_code,
      examDate:             r.exam_date,
      examTime:             r.exam_time ? r.exam_time.slice(0, 5) : null,
      examType:             r.exam_type,
      specialMaterialsNote: r.special_materials_note,
      baseDurationMins:     base,
      extraMins,
      stbMins,
      totalWritingMins,
      estimatedFinish:      fmtTime(estFinishMins),
      studentProfileId:     r.student_profile_id,
      studentNumber:        r.student_number,
      firstName:            r.first_name,
      lastName:             r.last_name,
      roomName:             r.room_name,
      profFirstName:        r.prof_first_name,
      profLastName:         r.prof_last_name,
      profEmail:            r.prof_email,
      profPhone:            r.prof_phone,
      profExamFormat:       r.prof_exam_format,
      accommodations:       accoms,
    };
  });
}

// ── GET /api/prep/students ────────────────────────────────────────────────────
router.get('/students', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: 'date query param required (YYYY-MM-DD)' });
    }
    const students = await fetchPrepData(req.tenantSchema, date);
    res.json({ ok: true, data: students });
  } catch (err) { next(err); }
});

// ── GET /api/prep/ede ─────────────────────────────────────────────────────────
router.get('/ede', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: 'date query param required (YYYY-MM-DD)' });
    }

    const students = await fetchPrepData(req.tenantSchema, date);
    if (!students.length) {
      return res.status(404).json({ ok: false, error: 'No confirmed students for this date' });
    }

    const printedAt = new Date().toLocaleString('en-CA', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const edePages = students.map(s => renderEDE(s, printedAt)).join('\n');
    const html = wrapHTML(`EDE Sheets — ${date}`, edePages);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="ede-${date}.html"`);
    res.send(html);
  } catch (err) { next(err); }
});

// ── GET /api/prep/labels ──────────────────────────────────────────────────────
router.get('/labels', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: 'date query param required (YYYY-MM-DD)' });
    }

    const students = await fetchPrepData(req.tenantSchema, date);
    if (!students.length) {
      return res.status(404).json({ ok: false, error: 'No confirmed students for this date' });
    }

    const html = renderLabels(students, date);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="labels-${date}.html"`);
    res.send(html);
  } catch (err) { next(err); }
});

export default router;

// ── HTML rendering helpers ────────────────────────────────────────────────────

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function wrapHTML(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; background: #fff; }
  .page { width: 8.5in; min-height: 11in; padding: 0.4in 0.45in; page-break-after: always; }
  @media print {
    .page { page-break-after: always; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  .section-header {
    background: #555; color: #fff;
    text-align: center; font-weight: bold; font-size: 10pt;
    padding: 4px; border: 1px solid #000;
  }
  .field-label { font-weight: bold; white-space: nowrap; font-size: 9pt; }
  .field-val { font-size: 10pt; }
  .course-big { font-size: 16pt; font-weight: bold; text-align: center; padding: 4px; }
  .checkbox-row { display: flex; flex-wrap: wrap; gap: 6px 20px; margin-top: 6px; }
  .checkbox-item { display: flex; align-items: center; gap: 4px; font-size: 9.5pt; }
  .box { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #000; }
  .print-stamp { text-align: right; font-size: 8pt; color: #555; margin-top: 4px; }
  .stb-table th { background: #eee; font-size: 9pt; text-align: center; }
  .stb-table td { height: 22px; font-size: 9pt; }
  .notes-cell { min-height: 60px; vertical-align: top; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function renderEDE(s, printedAt) {
  const accomText = s.accommodations.length
    ? s.accommodations.map(a => `${a.code} — ${a.label}`).join('<br>')
    : '<em>None</em>';

  const profName = (s.profFirstName || s.profLastName)
    ? `${s.profFirstName ?? ''} ${s.profLastName ?? ''}`.trim()
    : '—';
  const profContact = [profName, s.profEmail, s.profPhone].filter(Boolean).join(' · ');

  const stbRows = (s.stbMins ?? 0) > 20 ? 5 : 3;
  const stbTableRows = Array.from({ length: stbRows }, () =>
    `<tr><td></td><td></td><td></td><td></td></tr>`,
  ).join('');

  const totalWriting = s.totalWritingMins != null ? `${s.totalWritingMins} min` : '—';
  const estFinish   = s.estimatedFinish ?? '—';
  const stbAvail    = (s.stbMins ?? 0) > 0 ? `${s.stbMins} min` : 'None';
  const examTypeFmt = s.profExamFormat ? cap(s.profExamFormat) : '—';

  return `<div class="page">

<!-- Row 1: Student ID + right-side exam info -->
<table style="margin-bottom:0">
  <tr>
    <td style="width:50%">
      <table style="border:none">
        <tr>
          <td class="field-label" style="border:none;width:120px">Student ID</td>
          <td class="field-val" style="border:none;font-size:13pt;font-weight:bold">${s.studentNumber ?? '—'}</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none">Name</td>
          <td class="field-val" style="border:none;font-size:12pt">${s.firstName} ${s.lastName}</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none;vertical-align:top;padding-top:6px">Accommodation<br>Needed</td>
          <td style="border:none;font-size:9.5pt;padding-top:6px">${accomText}</td>
        </tr>
      </table>
    </td>
    <td style="width:50%;padding:0">
      <table style="border:none;width:100%">
        <tr>
          <td class="field-label" style="border:none;width:110px">Test Date</td>
          <td class="field-val" style="border:none">${fmtDate(s.examDate)}</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none">Test Time</td>
          <td class="field-val" style="border:none">${s.examTime ?? '—'}</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none">Test Length</td>
          <td class="field-val" style="border:none">${s.baseDurationMins ? `${s.baseDurationMins} min` : '—'}</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none">Test Location</td>
          <td class="field-val" style="border:none">${s.roomName ?? '—'}</td>
        </tr>
        <tr>
          <td colspan="2" class="course-big" style="border-top:1px solid #000">${s.courseCode}</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none">Exam Type</td>
          <td class="field-val" style="border:none">${examTypeFmt}</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none">Exam Booklet</td>
          <td class="field-val" style="border:none">&nbsp;</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none;vertical-align:top">Professor</td>
          <td class="field-val" style="border:none;font-size:9pt">${profContact}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Invigilator Information header -->
<div class="section-header" style="margin-top:6px">Invigilator Information</div>

<table>
  <tr>
    <td style="width:50%">
      <table style="border:none;width:100%">
        <tr>
          <td class="field-label" style="border:none;width:150px">Total Writing Time</td>
          <td class="field-val" style="border:none">${totalWriting}</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none">Estimated Finish Time</td>
          <td class="field-val" style="border:none">${estFinish}</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none">Actual Start Time</td>
          <td class="field-val" style="border:none">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
        </tr>
      </table>
    </td>
    <td style="width:50%">
      <table style="border:none;width:100%">
        <tr>
          <td class="field-label" style="border:none;width:140px">Lead Invigilator</td>
          <td class="field-val" style="border:none">&nbsp;</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none">Invigilator</td>
          <td class="field-val" style="border:none">&nbsp;</td>
        </tr>
        <tr>
          <td class="field-label" style="border:none">Actual Finish Time</td>
          <td class="field-val" style="border:none">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Stop Time Breaks + Notes -->
<table style="margin-top:6px">
  <tr>
    <td style="width:60%;padding:0;vertical-align:top">
      <div style="padding:4px 6px;font-weight:bold;font-size:9.5pt">Stop Time Breaks</div>
      <div style="padding:2px 6px;font-size:9.5pt">
        Total Available Stop Time: <strong>${stbAvail}</strong>
      </div>
      <table class="stb-table" style="margin:4px 6px;width:calc(100% - 12px)">
        <tr>
          <th>Start</th><th>Stop</th><th>Length</th><th>Remaining</th>
        </tr>
        ${stbTableRows}
      </table>
    </td>
    <td style="width:40%;vertical-align:top" class="notes-cell">
      <div style="font-weight:bold;font-size:9.5pt;margin-bottom:4px">Notes</div>
      <div style="font-size:9.5pt">${s.specialMaterialsNote ?? ''}</div>
    </td>
  </tr>
</table>

<!-- Tick questions -->
<div style="border:1px solid #000;padding:6px;margin-top:6px">
  <div style="font-weight:bold;font-size:9.5pt;margin-bottom:6px">Tick questions you have asked:</div>
  <div class="checkbox-row">
    <div class="checkbox-item"><span class="box"></span> Do you have a cell phone?</div>
    <div class="checkbox-item"><span class="box"></span> Did I confirm the accommodations?</div>
    <div class="checkbox-item"><span class="box"></span> Do you have a smart watch?</div>
    <div class="checkbox-item"><span class="box"></span> Did I recalculate the writing time?</div>
    <div class="checkbox-item"><span class="box"></span> Do you have any unauthorized items?</div>
    <div class="checkbox-item"><span class="box"></span> Did I ask about reminders?</div>
  </div>
</div>

<div class="print-stamp">Printed: ${printedAt}</div>
</div>`;
}

function renderLabels(students, date) {
  // Avery 5160 — 3 columns × 10 rows, each label 1" × 2.625"
  const labelHTML = students.map(s => `
    <div class="label">
      <div class="lname">${s.firstName} ${s.lastName}</div>
      <div class="lrow">ID: ${s.studentNumber ?? '—'}</div>
      <div class="lrow">${fmtDate(s.examDate)}${s.examTime ? `  ${s.examTime}` : ''}</div>
      <div class="lrow" style="font-weight:bold">${s.courseCode}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Labels — ${date}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; }
  .sheet {
    display: grid;
    grid-template-columns: repeat(3, 2.625in);
    grid-template-rows: repeat(10, 1in);
    column-gap: 0.125in;
    row-gap: 0;
    padding: 0.5in 0.1875in;
    width: 8.5in;
  }
  .label {
    width: 2.625in;
    height: 1in;
    padding: 4px 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .lname { font-size: 11pt; font-weight: bold; line-height: 1.2; }
  .lrow  { font-size: 8.5pt; line-height: 1.3; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; size: 8.5in 11in; }
  }
</style>
</head>
<body>
<div class="sheet">
${labelHTML}
</div>
</body>
</html>`;
}
