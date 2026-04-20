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
  // 1. Confirmed bookings with room assignment + professor info (from exam_upload, with fallback)
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
       eu.exam_format           AS prof_exam_format,
       eu.student_instructions  AS student_instructions,
       eu.exam_collection_method AS exam_collection_method,
       eu.calculator_type       AS calculator_type,
       eu.password              AS exam_password,
       eu.scantron_needed       AS scantron_needed
     FROM exam_booking_request ebr
     JOIN student_profile sp ON sp.id = ebr.student_profile_id
     JOIN "user" u ON u.id = sp.user_id
     LEFT JOIN booking_assignment ba ON ba.exam_booking_request_id = ebr.id
     LEFT JOIN booking_schedule_room bsr ON bsr.id = ba.schedule_room_id
     LEFT JOIN booking_schedule bs
            ON bs.id = bsr.schedule_id AND bs.date = ebr.exam_date
     LEFT JOIN booking_room br ON br.id = bsr.booking_room_id
     LEFT JOIN LATERAL (
       SELECT eu2.exam_format, eu2.professor_profile_id,
              eu2.student_instructions, eu2.exam_collection_method,
              eu2.calculator_type, eu2.password, eu2.scantron_needed
       FROM exam_upload eu2
       JOIN exam_upload_date eud ON eud.exam_upload_id = eu2.id
       WHERE UPPER(eu2.course_code) = UPPER(ebr.course_code)
         AND eud.exam_date = ebr.exam_date
         AND eu2.status = 'submitted'
       ORDER BY eu2.submitted_at DESC
       LIMIT 1
     ) eu ON TRUE
     LEFT JOIN professor_profile pp
            ON pp.id = COALESCE(eu.professor_profile_id, ebr.professor_profile_id)
     LEFT JOIN "user" pu ON pu.id = pp.user_id
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
        const extraMatch = a.code.match(/^(\d+)MIN\/HR$/i);
        if (extraMatch) computedExtra += Math.ceil(base * parseInt(extraMatch[1]) / 60);

        const stbMatch = a.code.match(/^(\d+)MIN\/HR STB$/i);
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
      studentInstructions:  r.student_instructions,
      examCollectionMethod: r.exam_collection_method,
      calculatorType:       r.calculator_type,
      examPassword:         r.exam_password,
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

function fmtDate(d) {
  // d may be a JS Date object from Postgres or a YYYY-MM-DD string
  const s = (d instanceof Date) ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const dt = new Date(s + 'T12:00:00');
  return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
}

function fmt12(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
}

function fmtWritingTime(mins) {
  if (mins == null) return '—';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}hr ${m}min` : `${h}hr`;
}

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

const CALCULATOR_LABELS = {
  scientific:       'Scientific calculator allowed',
  non_programmable: 'Non-programmable & non-communicable calculator allowed',
  financial:        'Financial calculator allowed',
  basic:            'Basic calculator allowed',
  none:             'No calculator',
};

const COLLECTION_LABELS = {
  delivery:       'Deliver completed exams to room',
  pickup_mah:     'Pickup from MAH (Studley Campus)',
  pickup_sexton:  'Pickup from Sexton Campus',
};

function wrapHTML(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; background: #fff; color: #000; }
  .page {
    width: 8.5in; height: 11in;
    padding: 0.4in 0.45in;
    page-break-after: always;
    display: flex; flex-direction: column;
  }
  @media print {
    .page { page-break-after: always; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  .lbl { font-weight: bold; font-size: 9pt; white-space: nowrap; }
  .val { font-size: 10pt; }
  .invigi-header {
    background: #666; color: #fff;
    text-align: center; font-weight: bold; font-size: 10pt;
    padding: 4px 6px; border: 1px solid #000;
  }
  .box { display: inline-block; width: 12px; height: 12px; border: 1.5px solid #000; vertical-align: middle; margin-right: 5px; }
  .print-stamp {
    display: inline-block;
    border: 1px solid #000;
    padding: 2px 7px;
    font-size: 8pt;
    color: #333;
  }
  .grow { flex: 1; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function buildNotesHtml(s) {
  const lines = [];

  // Calculator
  if (s.calculatorType) {
    lines.push(CALCULATOR_LABELS[s.calculatorType] ?? s.calculatorType);
  }

  // Password (only if Brightspace)
  if (s.profExamFormat === 'brightspace') {
    lines.push(s.examPassword ? `Password: ${s.examPassword}` : 'Password:');
  }

  // Student instructions
  if (s.studentInstructions) {
    lines.push(s.studentInstructions);
  }

  return lines;
}

function renderEDE(s, printedAt) {
  const accomText = s.accommodations.length
    ? s.accommodations.map(a => a.label || a.code).join(', ')
    : '';

  const profName = (s.profFirstName || s.profLastName)
    ? `${s.profFirstName ?? ''} ${s.profLastName ?? ''}`.trim()
    : null;
  const profDisplay = profName
    ? `${profName}${s.profEmail ? ` (${s.profEmail})` : ''}`
    : (s.profEmail ?? '—');

  const stbRows = (s.stbMins ?? 0) > 20 ? 5 : 3;
  const stbTableRows = Array.from({ length: stbRows }, () =>
    `<tr><td style="height:28px"></td><td></td><td></td><td></td></tr>`,
  ).join('');

  const totalWriting = fmtWritingTime(s.totalWritingMins);
  const estFinish    = fmt12(s.estimatedFinish) ?? '—';
  const testTime12   = fmt12(s.examTime) ?? '—';
  const stbAvail     = (s.stbMins ?? 0) > 0 ? `${s.stbMins} min` : '—';
  const examTypeFmt  = s.profExamFormat ? cap(s.profExamFormat) : '';
  const testLength   = s.baseDurationMins ? `${s.baseDurationMins}` : '—';

  const notesLines   = buildNotesHtml(s);
  const notesHtml    = notesLines.length
    ? notesLines.map(l => `<div style="font-size:${notesLines.length === 1 && l.length < 80 ? '13pt' : '10pt'};font-weight:bold;margin-bottom:4px">${l}</div>`).join('')
    : '';

  const collectionLabel = COLLECTION_LABELS[s.examCollectionMethod] ?? '';

  return `<div class="page">

<!-- ── Top info table ──────────────────────────────────────────── -->
<table>
  <tr>
    <!-- LEFT: student info -->
    <td style="width:48%;vertical-align:top;padding:0">
      <table style="border:none;width:100%">
        <tr>
          <td class="lbl" style="border:none;width:110px;padding:5px 6px">Student ID</td>
          <td class="val" style="border:none;font-size:12pt;font-weight:bold;padding:5px 6px">${s.studentNumber ?? '—'}</td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:5px 6px">Name</td>
          <td class="val" style="border:none;font-size:11pt;padding:5px 6px">${s.firstName} ${s.lastName}</td>
        </tr>
        <tr>
          <td colspan="2" class="lbl" style="border:none;padding:8px 6px 2px">Accommodation Needed</td>
        </tr>
        <tr>
          <td colspan="2" style="border:none;font-size:9.5pt;padding:2px 6px 10px">${accomText || '<em style="color:#888">None</em>'}</td>
        </tr>
      </table>
    </td>

    <!-- RIGHT: exam details -->
    <td style="width:52%;padding:0;vertical-align:top">
      <table style="border:none;width:100%">
        <tr>
          <td class="lbl" style="border:none;width:105px;padding:5px 6px">Test Date</td>
          <td class="val" style="border:none;padding:5px 6px">${fmtDate(s.examDate)}</td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:5px 6px">Test Time</td>
          <td class="val" style="border:none;padding:5px 6px">${testTime12}</td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:5px 6px">Test Length</td>
          <td class="val" style="border:none;padding:5px 6px">${testLength}</td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:5px 6px">Test Location</td>
          <td class="val" style="border:none;padding:5px 6px">${s.roomName ?? '—'}</td>
        </tr>
        <tr>
          <td colspan="2" style="border:none;border-top:1px solid #000;
               text-align:center;font-size:16pt;font-weight:bold;padding:6px 0">
            ${s.courseCode}
          </td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:5px 6px">Exam Type</td>
          <td class="val" style="border:none;padding:5px 6px">${examTypeFmt}</td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:5px 6px">Exam Booklet</td>
          <td class="val" style="border:none;padding:5px 6px">&nbsp;</td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:5px 6px;vertical-align:top">Professor</td>
          <td class="val" style="border:none;font-size:9pt;padding:5px 6px">${profDisplay}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- ── Invigilator Information header ─────────────────────────── -->
<div class="invigi-header" style="margin-top:6px">Invigilator Information</div>

<!-- ── Invigilator fields ─────────────────────────────────────── -->
<table>
  <tr>
    <td style="width:50%;padding:0;vertical-align:top">
      <table style="border:none;width:100%">
        <tr>
          <td class="lbl" style="border:none;width:148px;padding:6px">Total Writing<br>Time</td>
          <td class="val" style="border:none;padding:6px">${totalWriting}</td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:6px">Estimated Finish<br>Time</td>
          <td class="val" style="border:none;padding:6px">${estFinish}</td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:6px">Actual Start Time</td>
          <td class="val" style="border:none;padding:6px">&nbsp;</td>
        </tr>
      </table>
    </td>
    <td style="width:50%;padding:0;vertical-align:top">
      <table style="border:none;width:100%">
        <tr>
          <td class="lbl" style="border:none;width:135px;padding:6px">Lead Invigilator</td>
          <td style="border:none;padding:6px">&nbsp;</td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:6px">Invigilator</td>
          <td style="border:none;padding:6px">&nbsp;</td>
        </tr>
        <tr>
          <td class="lbl" style="border:none;padding:6px">Actual Finish Time</td>
          <td style="border:none;padding:6px">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- ── Stop Time Breaks + Notes (flex-grow to fill page) ──────── -->
<table class="grow" style="margin-top:0">
  <tr>
    <!-- Stop Time Breaks -->
    <td style="width:58%;vertical-align:top;padding:0">
      <div style="padding:5px 6px;font-weight:bold;font-size:9.5pt;border-bottom:1px solid #000">Stop Time Breaks</div>
      <table style="border:none;width:100%;margin:0">
        <tr>
          <td class="lbl" style="border:none;width:148px;padding:5px 6px">Total Available<br>Stop Time</td>
          <td style="border:none;padding:5px 6px">${stbAvail}</td>
        </tr>
      </table>
      <table>
        <tr>
          <th style="font-size:9pt;background:#f0f0f0;text-align:center">Start</th>
          <th style="font-size:9pt;background:#f0f0f0;text-align:center">Stop</th>
          <th style="font-size:9pt;background:#f0f0f0;text-align:center">Length</th>
          <th style="font-size:9pt;background:#f0f0f0;text-align:center">Remaining</th>
        </tr>
        ${stbTableRows}
      </table>
    </td>
    <!-- Notes -->
    <td style="width:42%;vertical-align:top;padding:6px">
      <div style="font-weight:bold;font-size:9.5pt;margin-bottom:6px">Notes</div>
      ${notesHtml}
    </td>
  </tr>
</table>

<!-- ── Tick questions ─────────────────────────────────────────── -->
<table style="margin-top:6px">
  <tr>
    <td colspan="2" style="font-weight:bold;font-size:9.5pt;border-bottom:1px solid #ccc;padding-bottom:4px">
      Tick questions you have asked.
    </td>
  </tr>
  <tr>
    <td style="width:50%;border-top:none;padding:6px 8px">
      <div style="margin-bottom:6px"><span class="box"></span>Do you have a cell phone?</div>
      <div style="margin-bottom:6px"><span class="box"></span>Do you have a smart watch?</div>
      <div><span class="box"></span>Do you have any unauthorized items?</div>
    </td>
    <td style="width:50%;border-top:none;padding:6px 8px">
      <div style="margin-bottom:6px"><span class="box"></span>Did I confirm the accommodations?</div>
      <div style="margin-bottom:6px"><span class="box"></span>Did I recalculate the writing time?</div>
      <div><span class="box"></span>Did I ask about reminders?</div>
    </td>
  </tr>
</table>

${collectionLabel ? `<!-- ── Collection method ────────────────────────────────────── -->
<table style="margin-top:4px">
  <tr>
    <td style="padding:5px 8px;font-size:9.5pt">
      <strong>Preferred exam collection:</strong> ${collectionLabel}
    </td>
  </tr>
</table>` : ''}

<!-- ── Print timestamp ────────────────────────────────────────── -->
<div style="text-align:right;margin-top:6px">
  <span class="print-stamp">${printedAt}</span>
</div>

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
