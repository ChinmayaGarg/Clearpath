/**
 * AC Exam Manager — SARS PDF Parser
 * Extracted from the original server.js for testability and reuse.
 * All parsing logic for Dalhousie SARS PDF format lives here.
 */
export { parseSARSPdf }           from './parseSARS.js';
export { normalizeRoom }          from './normalizeRoom.js';
export { extractCourse }          from './extractCourse.js';
export { detectAccommodations }   from './detectAccommodations.js';
