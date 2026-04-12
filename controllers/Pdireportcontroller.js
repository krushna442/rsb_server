/**
 * pdiReportController.js
 *
 * Fetches scanned_products records for a given part number and date range,
 * groups them by shift (A / B / C), computes all fields required to build
 * the PDI Check-Sheet Excel / PDF on the client, including:
 *
 *  • checkedBy  – the operator (created_by) who scanned the most parts in
 *                 that shift group (ties → first alphabetically)
 *  • sampleRecords – up to 5 non-F1 records, carrying the scanned_text and
 *                    other observation values
 *  • stats      – total / passed / failed / pending / rejected per shift
 *  • spec       – full product specification object from the products table
 *
 * POST /api/reports/pdi-part
 * Body: { partNumber: string, fromDate: string, toDate: string }
 *       Dates are ISO strings or "YYYY-MM-DD"; toDate is INCLUSIVE (end of day).
 */

import { query }                  from '../db/db.js';
import { findProductByPartNumber } from '../models/productModel.js';
import { parseScanText }           from '../models/parseScanText.js';

// ─────────────────────────────────────────────
//  Shift definitions (mirror of cronJobs.js)
// ─────────────────────────────────────────────
const SHIFTS = [
  { label: 'Shift A  (06:00 – 14:00)', letter: 'A', startHour: 6,  endHour: 14 },
  { label: 'Shift B  (14:00 – 22:00)', letter: 'B', startHour: 14, endHour: 22 },
  { label: 'Shift C  (22:00 – 06:00)', letter: 'C', startHour: 22, endHour: 6  },
];

// ─────────────────────────────────────────────
//  Helper: determine shift letter from a Date
// ─────────────────────────────────────────────
function getShiftLetter(date) {
  const h = new Date(date).getHours();
  if (h >= 6  && h < 14) return 'A';
  if (h >= 14 && h < 22) return 'B';
  return 'C';   // 22:00–06:00
}

// ─────────────────────────────────────────────
//  Helper: F1 scan detection (same as cronJobs)
//  F1 records are excluded from PDI observation
//  sample rows (but kept in total / stats).
// ─────────────────────────────────────────────
function isScanTextF1(scannedText) {
  if (!scannedText) return false;
  return /rev\s*no\s*#/i.test(scannedText) && !scannedText.includes('$');
}

// ─────────────────────────────────────────────
//  Helper: detect part type from product spec
// ─────────────────────────────────────────────
function detectPartType(product) {
  if (!product?.specification) return 'FRONT';
  const t = (product.specification.partType || '').toUpperCase();
  if (t === 'REAR')   return 'REAR';
  if (t === 'MIDDLE') return 'MIDDLE';
  return 'FRONT';
}

// ─────────────────────────────────────────────
//  Helper: most-frequent creator in a record set
//  Returns the created_by value that appears most.
//  On a tie the name that comes first alphabetically wins.
// ─────────────────────────────────────────────
function mostFrequentCreator(records) {
  const freq = {};
  for (const r of records) {
    if (!r.created_by) continue;
    freq[r.created_by] = (freq[r.created_by] || 0) + 1;
  }
  const entries = Object.entries(freq);
  if (!entries.length) return null;
  entries.sort(([aName, aCount], [bName, bCount]) =>
    bCount - aCount || aName.localeCompare(bName)
  );
  return entries[0][0];
}

// ─────────────────────────────────────────────
//  Helper: compute pass/fail/pending/rejected
// ─────────────────────────────────────────────
function calcStats(rows) {
  return {
    total:    rows.length,
    passed:   rows.filter(r => r.validation_status === 'pass').length,
    failed:   rows.filter(r => r.validation_status === 'fail').length,
    pending:  rows.filter(r => r.validation_status === 'pending').length,
    rejected: rows.filter(r => r.is_rejected).length,
  };
}

// ─────────────────────────────────────────────
//  Helper: build one shift group payload
// ─────────────────────────────────────────────
function buildShiftGroup(shiftDef, allShiftRecords) {
  const { label, letter } = shiftDef;

  // ALL records in this shift (for stats and checkedBy)
  const stats      = calcStats(allShiftRecords);
  const checkedBy  = mostFrequentCreator(allShiftRecords);

  // Non-F1 records for PDI observation columns (up to 5)
  const nonF1Records  = allShiftRecords.filter(r => !isScanTextF1(r.scanned_text));
  const sampleSize    = Math.min(nonF1Records.length, 5);
  const sampleRecords = nonF1Records.slice(0, sampleSize).map(r => ({
    id:               r.id,
    sl_no:            r.sl_no,
    part_sl_no:       r.part_sl_no,
    scanned_text:     r.scanned_text,
    validation_status:r.validation_status,
    is_rejected:      r.is_rejected,
    remarks:          r.remarks,
    plant_location:   r.plant_location,
    created_by:       r.created_by,
    created_at:       r.created_at,
    // Parsed fields (convenience – client can use directly)
    parsed:           parseScanText(r.scanned_text),
  }));

  // Scanned texts for Row 3 "QR Code Scanning" observation column
  const scannedTextObservations = sampleRecords.map(r => r.scanned_text ?? 'Ok');

  return {
    shift: {
      letter,
      label,
    },
    qty:        allShiftRecords.length,   // total parts scanned (incl. F1)
    sampleSize,                            // non-F1 sample count (≤5)
    checkedBy,                             // for "CHECKED BY (SIGNATURE)" cell
    stats,
    sampleRecords,
    scannedTextObservations,               // ready for Excel obs columns
  };
}

// ─────────────────────────────────────────────
//  CONTROLLER
// ─────────────────────────────────────────────

/**
 * POST /api/reports/pdi-part
 *
 * Request body:
 * {
 *   partNumber : "FEA73900",
 *   fromDate   : "2026-04-01",          // inclusive, treated as 00:00:00
 *   toDate     : "2026-04-10"           // inclusive, treated as 23:59:59
 * }
 *
 * Response 200:
 * {
 *   partNumber  : string,
 *   partType    : "FRONT" | "REAR" | "MIDDLE",
 *   product     : { ...full product row, specification: {...} },
 *   dateRange   : { from: string, to: string },
 *   overallStats: { total, passed, failed, pending, rejected },
 *   checkedBy   : string | null,        // top scanner across ALL shifts
 *   shifts      : [
 *     {
 *       shift                  : { letter: "A", label: "Shift A (06:00-14:00)" },
 *       qty                    : number,   // all records in shift
 *       sampleSize             : number,   // non-F1 sample (≤5)
 *       checkedBy              : string | null,   // top scanner THIS shift
 *       stats                  : { total, passed, failed, pending, rejected },
 *       sampleRecords          : [ ...up to 5 non-F1 records ],
 *       scannedTextObservations: [ ...up to 5 scanned_text strings ]
 *     },
 *     ...  (only shifts that have ≥1 record are returned)
 *   ],
 *   allRecords  : [ ...every raw DB row in date range for this part ],
 * }
 */
export async function getPDIPartReport(req, res) {
  try {
    const { partNumber, fromDate, toDate } = req.body;

    // ── Validate input ────────────────────────────────────────────────
    if (!partNumber || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'partNumber, fromDate and toDate are required.',
      });
    }

    // Build inclusive date window: fromDate 00:00:00 → toDate 23:59:59
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);

    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    if (isNaN(from) || isNaN(to) || from > to) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range. fromDate must be before or equal to toDate.',
      });
    }

    // ── Fetch scanned_products records ────────────────────────────────
    const sql = `
      SELECT
        id, dispatch_date, shift, part_no, customer_name, product_type,
        validation_status, remarks, part_sl_no, sl_no, scanned_text,
        plant_location, vendorCode, is_rejected, created_by, modified_by,
        created_at, updated_at
      FROM scanned_products
      WHERE part_no = ?
        AND created_at >= ?
        AND created_at <= ?
      ORDER BY created_at ASC
    `;
    const rows = await query(sql, [partNumber, from, to]);
    const allRecords = Array.isArray(rows) ? rows : [];

    // ── Fetch product master (spec, partType, etc.) ───────────────────
    let product  = null;
    let partType = 'FRONT';
    try {
      product  = await findProductByPartNumber(partNumber);
      partType = detectPartType(product);
    } catch (e) {
      console.warn(`[PDIPartReport] Product not found for ${partNumber}:`, e.message);
    }

    // ── Group records by shift ────────────────────────────────────────
    const shiftBuckets = { A: [], B: [], C: [] };
    for (const row of allRecords) {
      const letter = getShiftLetter(row.created_at);
      shiftBuckets[letter].push(row);
    }

    // Build shift groups (only include shifts with records)
    const shiftGroups = SHIFTS
      .filter(s => shiftBuckets[s.letter].length > 0)
      .map(s => buildShiftGroup(s, shiftBuckets[s.letter]));

    // ── Overall stats and overall checkedBy ───────────────────────────
    const overallStats = calcStats(allRecords);
    const overallCheckedBy = mostFrequentCreator(allRecords);

    // ── Respond ───────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      partNumber,
      partType,
      product,
      dateRange: {
        from: from.toISOString(),
        to:   to.toISOString(),
      },
      overallStats,
      checkedBy: overallCheckedBy,   // top scanner across entire date range
      shifts: shiftGroups,
      allRecords,
    });

  } catch (err) {
    console.error('[PDIPartReport] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while generating PDI part report.',
      error:   err.message,
    });
  }
}