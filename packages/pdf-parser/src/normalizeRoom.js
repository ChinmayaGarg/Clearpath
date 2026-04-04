/**
 * Room name normalisation.
 * Converts raw SARS room strings into canonical display names.
 *
 * MAH and G28 PDFs set the room directly from pdfLocation.
 * ALTLOC PDFs carry the room name in the data — this function normalises those.
 *
 * Institution-specific room maps are passed in via `customMap` so each
 * tenant can extend the defaults without touching this code.
 */

const DEFAULT_ALTLOC_MAP = {
  "LIFE SCI 3": "LSC 3", "CHEM 125": "Chem 125",
  "CHEM 226": "Chem 226", "CHEM 327": "Chem 327",
  "CHEB 251": "CHEB 251", "DUNN 221C": "Dunn 221C",
  "DUNN 302": "Dunn 302", "DUNN 304( 60)": "Dunn 304",
  "301A DUNN": "Dunn 301A", "301B DUNN": "Dunn 301B",
  "134 CS": "CS 134", "429 CS": "CS 429", "430 CS": "CS 430",
  "211 GOLDBERG": "Goldberg 211", "MDH": "MDH",
};

/**
 * @param {string} r          - raw room string from SARS PDF
 * @param {string} fullLine   - full line context for better matching
 * @param {Object} customMap  - institution-specific overrides (from DB config)
 * @returns {string}          - canonical room name
 */
export function normalizeRoom(r, fullLine = '', customMap = {}) {
  if (!r) return 'TBD';

  const u    = r.toUpperCase().replace(/\s+/g, ' ').trim();
  const full = (fullLine || '').toUpperCase();

  // Check institution custom map first — allows tenants to add their own rooms
  const merged = { ...DEFAULT_ALTLOC_MAP, ...customMap };
  for (const [shortName, canonical] of Object.entries(merged)) {
    if (u === shortName.toUpperCase().replace(/\s+/g, ' ').trim()) return canonical;
  }

  if (/LORD/.test(u) || /LORD\s*DALHOUSIE/.test(full)) return 'Lord Dalhousie';
  if (/\bMDH\b/.test(u)) return 'MDH';

  if (/MCCAIN/.test(u) || /MCCAIN/.test(full)) {
    const n = u.match(/(\d{3,4})/) || full.match(/(\d{3,4})/);
    return n ? `McCain ${n[1]}` : 'McCain';
  }

  if (/ROWE/.test(u) || /ROWE/.test(full)) {
    const n = u.match(/(\d{3,4})/) || full.match(/(\d{3,4})/);
    return n ? `Rowe ${n[1]}` : 'Rowe';
  }

  // "COMP XXXX" pattern (SARS sometimes writes building as COMP = Rowe)
  if (/^\d{3,4}\s*COMP$/.test(u) || /COMP\s+\d{3,4}/.test(u)) {
    const n = u.match(/(\d{3,4})/);
    return n ? `Rowe ${n[1]}` : r.trim();
  }

  if (/G4?.*28|\b428\b|\bG28\b/.test(u)) return 'G28';
  if (/PLANT/.test(u))                    return 'MAH';
  if (/^-?ER[-. ]?\d+$/.test(u) || /^ER[-.]?\d+$/.test(u)) return 'MAH';

  return r.trim();
}
