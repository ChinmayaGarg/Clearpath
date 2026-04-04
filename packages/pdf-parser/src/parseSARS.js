/**
 * Core SARS PDF parser.
 * Extracted from the original server.js — same logic, now modular and testable.
 *
 * Parses Dalhousie SARS "All Appointments for a Day" PDF reports into
 * structured appointment data ready for database insertion.
 */
import { PdfReader }            from 'pdfreader';
import { normalizeRoom }        from './normalizeRoom.js';
import { extractCourse,
         parseCourseToken }     from './extractCourse.js';
import { detectAccommodations } from './detectAccommodations.js';

/**
 * Parse a SARS PDF buffer into structured appointment data.
 *
 * @param {Buffer} buffer           - PDF file buffer
 * @param {string} filename         - original filename (for logging/audit)
 * @param {Object} roomMap          - institution custom room name map (from DB)
 * @returns {Promise<ParseResult>}
 */
export function parseSARSPdf(buffer, filename, roomMap = {}) {
  return new Promise((resolve, reject) => {
    const reader = new PdfReader();
    const items  = [];

    reader.parseBuffer(buffer, (err, item) => {
      if (err) return reject(err);

      if (!item) {
        // End of file — process all collected items
        try {
          resolve(processSARSItems(items, filename, roomMap));
        } catch (e) {
          reject(e);
        }
        return;
      }

      // Track page numbers
      if (item.page) {
        items._currentPage = (items._currentPage || 0) + 1;
        return;
      }

      // Collect text items with position data
      if (item.text !== undefined && item.text.trim()) {
        items.push({
          text: item.text.trim(),
          x:    Math.round(item.x * 10) / 10,
          y:    Math.round(item.y * 10) / 10,
          page: items._currentPage || 1,
        });
      }
    });
  });
}

/**
 * Process raw PDF text items into structured appointment data.
 * @private
 */
function processSARSItems(items, filename, roomMap) {
  const allText = items.map(i => i.text).join(' ');

  // ── Extract exam date ─────────────────────────────────────────────────────
  let date = null;
  const dtM = allText.match(/Scheduled\s+on\s+\w+,?\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (dtM) {
    const d = new Date(`${dtM[1]} ${dtM[2]} ${dtM[3]}`);
    if (!isNaN(d)) date = d.toISOString().split('T')[0];
  }

  // ── Detect PDF location type ──────────────────────────────────────────────
  let pdfLocation = 'ALTLOC';
  if (/EXAM-SCHEDULING-MAH/i.test(allText))      pdfLocation = 'MAH';
  else if (/EXAM-SCHEDULING-G28/i.test(allText)) pdfLocation = 'G28';

  // ── Find the "reason" column X position ──────────────────────────────────
  // The reason column header tells us where course codes will appear
  let colX = null;
  const sorted = [...items].sort((a, b) =>
    a.page !== b.page ? a.page - b.page :
    a.y    !== b.y    ? a.y - b.y : a.x - b.x
  );

  const headerItem = sorted.find(i =>
    /Reason Code|Reason\s*Code/i.test(i.text)
  );
  if (headerItem) colX = headerItem.x;

  // ── Group items into rows by Y position ───────────────────────────────────
  const rows = groupByY(sorted);

  // ── Parse student rows ────────────────────────────────────────────────────
  const students = [];
  let cur = null;

  for (const row of rows) {
    // Student ID pattern: B0XXXXXXX
    const idCell = row.find(c => /^B0\d{7}$/.test(c.text));

    if (idCell) {
      if (cur) students.push(cur);

      // Extract fields from this row by X position
      const byX = row.sort((a, b) => a.x - b.x);
      cur = {
        id:     idCell.text,
        name:   '',
        phone:  '',
        time:   '',
        dur:    '',
        room:   '',
        reason: '',
      };

      for (const cell of byX) {
        if (cell.text === cur.id) continue;
        if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(cell.text) && !cur.time) {
          cur.time = cell.text;
        } else if (/^\d{2,4}$/.test(cell.text) && !cur.dur && cur.time) {
          cur.dur = cell.text;
        } else if (/C:/.test(cell.text) || /No Number/i.test(cell.text)) {
          cur.phone = cell.text;
        }
      }
    } else if (cur) {
      // Continuation row — append to reason or extract room
      for (const cell of row) {
        const t = cell.text.trim();
        if (!t || t === cur.id) continue;

        // Room detection for ALTLOC PDFs
        if (pdfLocation === 'ALTLOC' && !cur.room && colX !== null) {
          if (cell.x < colX - 1) {
            cur.room = cur.room ? cur.room + ' ' + t : t;
            continue;
          }
        }

        // Accumulate reason text
        cur.reason = cur.reason ? cur.reason + ' ' + t : t;
      }
    }
  }
  if (cur) students.push(cur);

  // ── Build appointments from parsed student rows ───────────────────────────
  const appointments = [];
  const unmatched    = [];

  for (const s of students) {
    const studentId = (s.id.match(/B0\d{7}/) || [])[0] || '';

    const tM = s.time.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    if (!tM) continue;

    // Normalize time to HH:MM:SS for Postgres TIME column
    const timeRaw = tM[1].toUpperCase().replace(/\s+/, '');
    const startTime = normalizeTimeString(timeRaw);
    const durationMins = parseInt(s.dur) || 0;

    // Determine room
    let roomName;
    if (pdfLocation === 'MAH')      roomName = 'MAH';
    else if (pdfLocation === 'G28') roomName = 'G28';
    else                            roomName = normalizeRoom(s.room, '', roomMap);

    // Extract course
    const extracted = extractCourse(s.reason);
    if (!extracted) {
      unmatched.push({ studentId, startTime, durationMins, roomName, reason: s.reason });
      continue;
    }

    const [firstCourse] = extracted.split(' ; ');
    if (!firstCourse) {
      unmatched.push({ studentId, startTime, durationMins, roomName, reason: s.reason });
      continue;
    }

    const { course, cross }    = parseCourseToken(firstCourse);
    if (!course) {
      unmatched.push({ studentId, startTime, durationMins, roomName, reason: s.reason });
      continue;
    }

    const accommodations = detectAccommodations(s.reason);

    appointments.push({
      studentId,
      startTime,
      durationMins,
      roomName,
      courseCode:      course,
      crossListedCode: cross || null,
      rwg:             accommodations.rwg,
      dragon:          accommodations.dragon,
      brightspace:     accommodations.brightspace,
      cancelled:       accommodations.cancelled,
      rawCodes:        accommodations.rawCodes,
      rawReason:       s.reason,
      doNotCall:       s.phone?.includes('†') ?? false,
      phone:           cleanPhone(s.phone),
    });
  }

  return {
    filename,
    date,
    pdfLocation,
    appointments,
    unmatched,
    meta: { colX, totalRows: students.length },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByY(items, tolerance = 0.5) {
  const rows  = [];
  let curY    = null;
  let curRow  = [];
  let curPage = null;

  for (const item of items) {
    if (
      curY === null ||
      curPage !== item.page ||
      Math.abs(item.y - curY) > tolerance
    ) {
      if (curRow.length) rows.push(curRow);
      curRow  = [item];
      curY    = item.y;
      curPage = item.page;
    } else {
      curRow.push(item);
    }
  }
  if (curRow.length) rows.push(curRow);
  return rows;
}

/**
 * Convert "10:30AM" or "2:00PM" to "10:30:00" or "14:00:00"
 * for insertion into a Postgres TIME column.
 */
function normalizeTimeString(timeStr) {
  const m = timeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!m) return timeStr;

  let hours   = parseInt(m[1]);
  const mins  = m[2];
  const ampm  = m[3].toUpperCase();

  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours  = 0;

  return `${String(hours).padStart(2, '0')}:${mins}:00`;
}

/**
 * Strip the dagger (†) do-not-call marker from phone strings.
 */
function cleanPhone(phone) {
  if (!phone) return null;
  return phone.replace('†', '').replace('C:', '').trim() || null;
}
