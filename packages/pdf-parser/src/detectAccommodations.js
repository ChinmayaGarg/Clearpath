/**
 * Accommodation code detection from SARS reason strings.
 *
 * Extracts structured accommodation codes from raw reason text.
 * The accommodation codes table in each tenant's schema is the
 * authoritative source — this function does the raw text parsing.
 */

/**
 * Detect known accommodation flags from a reason string.
 * Returns an object of detected flags.
 *
 * @param {string} reason - raw reason text from SARS PDF
 * @returns {{ rwg: boolean, dragon: boolean, brightspace: boolean, cancelled: boolean, rawCodes: string[] }}
 */
export function detectAccommodations(reason) {
  const r = reason || '';

  return {
    rwg:        /\bRWG\b/.test(r),
    dragon:     /\bDRAGON\b/i.test(r),
    brightspace:/BRIGHTSPACE/i.test(r),
    cancelled:  /cancelled\s*by\s*prof/i.test(r),
    rawCodes:   extractRawCodes(r),
  };
}

/**
 * Extract all accommodation code strings from reason text.
 * Used to match against the tenant's AccommodationCode table.
 *
 * @param {string} reason
 * @returns {string[]} array of raw code strings found
 */
function extractRawCodes(reason) {
  const codes = [];
  const patterns = [
    /\b(\d+\s*MIN\/HR(?:\s+EXTRA\s+TIME)?)\b/gi,    // 20MIN/HR, 30 MIN/HR EXTRA TIME
    /\b(\d+\s*MIN\s+STB)\b/gi,                       // 10 MIN STB
    /\bSTB\b/g,
    /\bRWG\b/g,
    /\bDRAGON\b/gi,
    /\bWP\b/g,
    /\bOR\b/g,
    /\bBRIGHTSPACE\b/gi,
    /\bREADER\/SCRIBE\b/gi,
    /\bREADER\b/gi,
    /\bSCRIBE\b/gi,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(reason)) !== null) {
      const code = (m[1] || m[0]).toUpperCase().replace(/\s+/g, ' ').trim();
      if (!codes.includes(code)) codes.push(code);
    }
  }

  return codes;
}
