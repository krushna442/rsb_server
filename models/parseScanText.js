/**
 * parseScanText.js
 * Parses scanned barcode text into structured fields.
 *
 * Supported formats:
 *  F1 – "FEA73900Rev No# 72057610426002246"
 *       PART_NO + "Rev No#" + REV(variable) + VENDOR(8) + MM(2) + YY(2) + SL(6)
 *
 *  F2 – "$"-delimited
 *       "7205761$FEA73900$002246$07.04.2026$NA$NA$REV$..."
 *        [0]=VENDOR [1]=PART_NO [2]=SL [3]=DATE [4..5]=NA [6]=REV
 *
 *  F3 – Fixed-width numeric block (no spaces / delimiters)
 *       00 + PART_NO(12) + REV(2) + VENDOR(6|7|8) + MM(2) + YY(2) + SL(6)
 *       Leading "00" is stripped from the 14-char block to get the real 12-digit part number.
 */

/**
 * @typedef {Object} ParsedScan
 * @property {'F1'|'F2'|'F3'} format
 * @property {string} partNo
 * @property {string} revNo        – normalised to "#", "#1", "#A", etc.
 * @property {string} vendorCode
 * @property {string} partSlNo
 * @property {string|null} dispatchDate  – "YYYY-MM-DD" when parseable, else null
 */

/**
 * Normalise a raw rev token so different representations compare equal.
 *  "Rev No# " → "#"
 *  "#1"       → "#1"
 *  "# "       → "#"
 */
function normaliseRev(raw = '') {
  // Strip leading "Rev No" / "Rev No#" noise, then trim
  let s = raw.replace(/rev\s*no\s*/i, '').trim();
  // Ensure it starts with '#'
  if (!s.startsWith('#')) s = '#' + s;
  return s.toUpperCase().replace(/\s+/g, '');
}

// ---------------------------------------------------------------------------
// Format detectors
// ---------------------------------------------------------------------------

/** F2: contains '$' delimiters */
function isF2(text) {
  return text.includes('$');
}

/**
 * F1: contains "Rev No#" (case-insensitive) but NOT '$'
 * Allows optional space between "Rev No" and "#"
 */
function isF1(text) {
  return /rev\s*no\s*#/i.test(text) && !text.includes('$');
}

/**
 * F3: everything else that looks like a long numeric+alpha fixed block.
 * We accept it as F3 when length is 30-36 and no spaces.
 */
function isF3(text) {
  return /^[A-Z0-9]+$/i.test(text.trim()) && text.trim().length >= 30;
}

// ---------------------------------------------------------------------------
// Individual parsers
// ---------------------------------------------------------------------------

function parseF1(text) {
  // Match: PART_NO + "Rev No#" + optional_rev_digits + space? + REST
  // REST = VENDOR(7 or 8) + MM(2) + YY(2) + SL(6)
  const match = text.match(/^(.+?)\s*[Rr]ev\s*[Nn]o\s*#([^\s]*)\s*(.+)$/);
  if (!match) return null;

  const partNo = match[1].trim();
  const revSuffix = match[2].trim();          // e.g. "" | "1" | "A" | "2"
  const rest   = match[3].trim();             // e.g. "72057610426002246" or "7205761 0426002246"
  // Collapse any spaces inside rest (some scanners insert spaces)
  const restClean = rest.replace(/\s+/g, '');

  // Read from the right: SL=6, YY=2, MM=2 → fixed 10 chars from right
  // Everything left of that is the vendor code
  if (restClean.length < 12) return null;

  const sl     = restClean.slice(-6);
  const year   = '20' + restClean.slice(-8, -6);
  const month  = restClean.slice(-10, -8);
  const vendor = restClean.slice(0, restClean.length - 10);

  const rev = revSuffix ? normaliseRev('#' + revSuffix) : '#';
  const dispatchDate = buildDate(year, month, null);

  return { format: 'F1', partNo, revNo: rev, vendorCode: vendor, partSlNo: sl, dispatchDate };
}

function parseF2(text) {
  const parts = text.split('$').map(s => s.trim());
  // [0]=VENDOR [1]=PART_NO [2]=SL [3]=DATE [4..5]=NA [6]=REV ...
  if (parts.length < 4) return null;

  const vendor  = parts[0];
  const partNo  = parts[1];
  const sl      = parts[2];
  const dateRaw = parts[3]; // "07.04.2026" or "NA"
  // REV is typically at index 6, but fall back to first '#'-containing token
  let revRaw = parts[6] ?? '';
  if (!revRaw || revRaw.toUpperCase() === 'NA') {
    revRaw = parts.find(p => p.includes('#')) ?? '#';
  }
  const rev = normaliseRev(revRaw);

  let dispatchDate = null;
  if (dateRaw && dateRaw.toUpperCase() !== 'NA') {
    // Expect "DD.MM.YYYY"
    const [dd, mm, yyyy] = dateRaw.split('.');
    dispatchDate = buildDate(yyyy, mm, dd);
  }

  return { format: 'F2', partNo, revNo: rev, vendorCode: vendor, partSlNo: sl, dispatchDate };
}

function parseF3(text) {
  const t = text.trim();

  /**
   * Supported fixed-width layouts (all numeric+alpha, no delimiters):
   *   Layout A: 00+partNo(12) + rev(2) + vendor(6) + MM(2) + YY(2) + SL(6)  = 32  ← confirmed
   *   Layout B: 00+partNo(12) + rev(2) + vendor(7) + MM(2) + YY(2) + SL(6)  = 33
   *   Layout C: 00+partNo(12) + rev(2) + vendor(8) + MM(2) + YY(2) + SL(6)  = 34
   *
   * The first 14 chars are consumed as a block; the leading "00" is then
   * stripped to yield the real 12-digit part number.
   */
  const layouts = [
    { partLen: 14, vendorLen: 6 },  // total 32 – confirmed from real sample
    { partLen: 14, vendorLen: 7 },  // total 33
    { partLen: 14, vendorLen: 8 },  // total 34
  ];

  for (const { partLen, vendorLen } of layouts) {
    const total = partLen + 2 + vendorLen + 2 + 2 + 6;
    if (t.length !== total) continue;

    let offset = 0;
    // Consume 14 chars but strip the leading "00" to get the real 12-digit part number
    const partNo = t.slice(offset, offset + partLen).replace(/^00/, ''); offset += partLen;
    const revRaw = t.slice(offset, offset + 2);         offset += 2;
    const vendor = t.slice(offset, offset + vendorLen); offset += vendorLen;
    const month  = t.slice(offset, offset + 2);         offset += 2;
    const year   = '20' + t.slice(offset, offset + 2);  offset += 2;
    const sl     = t.slice(offset, offset + 6);

    const rev = normaliseRev(revRaw);
    const dispatchDate = buildDate(year, month, null);

    return {
      format: 'F3',
      partNo: partNo.trim(),
      revNo: rev,
      vendorCode: vendor,
      partSlNo: sl,
      dispatchDate,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Date helper
// ---------------------------------------------------------------------------
function buildDate(year, month, day) {
  try {
    const y = String(year).padStart(4, '20');
    const m = String(month).padStart(2, '0');
    const d = day ? String(day).padStart(2, '0') : '01';
    if (isNaN(new Date(`${y}-${m}-${d}`))) return null;
    return `${y}-${m}-${d}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a scanned barcode string into structured fields.
 * Returns null if no format matched.
 *
 * @param {string} scannedText
 * @returns {ParsedScan|null}
 */
export function parseScanText(scannedText) {
  if (!scannedText) return null;
  const text = scannedText.trim();

  if (isF2(text)) return parseF2(text);
  if (isF1(text)) return parseF1(text);
  if (isF3(text)) return parseF3(text);

  return null;
}