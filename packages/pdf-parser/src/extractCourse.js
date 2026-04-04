/**
 * Course code extraction and parsing from SARS reason strings.
 *
 * SARS reason strings look like:
 *   "20MIN/HR, RWG - COMM 3402-02"
 *   "30 MIN/HR - PHYL 2044"
 *   "10 MIN STB - BIOL 1010/BIOL 1011"
 */

const COURSE_PATTERN = [
  '[A-Z]{4}\\s\\s?\\d{4}/[A-Z]{4}\\s\\s?\\d{4}', // ABCD 1234/WXYZ 5678
  '[A-Z]{4}/[A-Z]{4}\\s\\s?\\d{4}',               // ABCD/WXYZ 1234
  '[A-Z]{4}\\s\\s?\\d{4}/[A-Z]{4}',               // ABCD 1234/WXYZ
  '[A-Z]{4}\\s\\d{4}-\\s?\\d{2}',                 // ABCD 1234-01
  '[A-Z]{4}\\s?\\s\\d{4}-\\d{2}',                 // ABCD  1234-01
  '[A-Z]{4}\\s?\\s\\d{4}',                         // ABCD 1234
].join('|');

const COURSE_REGEX = new RegExp(`\\b(?:${COURSE_PATTERN})\\b`, 'gi');

function normalizeCourseToken(token) {
  return token.toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extract all course codes from a SARS reason string.
 * Returns a semicolon-separated string of normalized codes.
 * e.g. "COMM 3402-02 ; COMM 3402"
 */
export function extractCourse(reasonText) {
  let courseSegment = reasonText;
  // Course codes appear after ' - ' in the reason string
  const idx = reasonText.indexOf(' - ');
  if (idx !== -1) courseSegment = reasonText.slice(idx + 3);

  const tokens = [];
  const seen   = new Set();
  let m;

  COURSE_REGEX.lastIndex = 0;
  while ((m = COURSE_REGEX.exec(courseSegment)) !== null) {
    const normalized = normalizeCourseToken(m[0]);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      tokens.push(normalized);
    }
  }

  return tokens.join(' ; ');
}

/**
 * Parse a single course token into course + cross-listed code.
 * Handles all SARS cross-listing formats.
 */
export function parseCourseToken(rawCourse) {
  let course = '';
  let cross  = '';
  let m;

  const r = rawCourse
    .toUpperCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // ABCD 1234/WXYZ 5678
  if ((m = r.match(/^([A-Z]{4})\s(\d{4})\/([A-Z]{4})\s(\d{4})$/))) {
    course = `${m[1]} ${m[2]}`;
    cross  = `${m[3]} ${m[4]}`;
  }
  // ABCD/WXYZ 1234
  else if ((m = r.match(/^([A-Z]{4})\/([A-Z]{4})\s(\d{4})$/))) {
    course = `${m[1]} ${m[3]}`;
    cross  = `${m[2]} ${m[3]}`;
  }
  // ABCD 1234/WXYZ
  else if ((m = r.match(/^([A-Z]{4})\s(\d{4})\/([A-Z]{4})$/))) {
    course = `${m[1]} ${m[2]}`;
    cross  = `${m[3]} ${m[2]}`;
  }
  // ABCD 1234 or ABCD 1234-01
  else if ((m = r.match(/^([A-Z]{4})\s(\d{4}(?:-\d{2})?)$/))) {
    course = `${m[1]} ${m[2]}`;
  }
  else {
    course = r;
  }

  return { course, cross };
}
