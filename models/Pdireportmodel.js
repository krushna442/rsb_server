/**
 * pdiReportModel.js
 *
 * Low-level DB helpers used by pdiReportController.
 * All heavy SQL lives here so the controller stays clean.
 */

import { query } from '../db/db.js';

/**
 * Fetch all scanned_products rows for a given part number
 * within an inclusive date range.
 *
 * @param {string} partNumber
 * @param {Date}   from        – start of window (00:00:00)
 * @param {Date}   to          – end   of window (23:59:59)
 * @returns {Promise<object[]>}
 */
export async function fetchScannedByPartAndRange(partNumber, from, to) {
  const sql = `
    SELECT
      id,
      dispatch_date,
      shift,
      part_no,
      customer_name,
      product_type,
      validation_status,
      remarks,
      part_sl_no,
      sl_no,
      scanned_text,
      plant_location,
      vendorCode,
      is_rejected,
      created_by,
      modified_by,
      created_at,
      updated_at
    FROM scanned_products
    WHERE part_no  = ?
      AND created_at >= ?
      AND created_at <= ?
    ORDER BY created_at ASC
  `;
  const rows = await query(sql, [partNumber, from, to]);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Fetch scanned_products rows for multiple part numbers
 * within an inclusive date range.
 * Useful for bulk / comparison reports.
 *
 * @param {string[]} partNumbers
 * @param {Date}     from
 * @param {Date}     to
 * @returns {Promise<object[]>}
 */
export async function fetchScannedByPartsAndRange(partNumbers, from, to) {
  if (!partNumbers.length) return [];
  const placeholders = partNumbers.map(() => '?').join(', ');
  const sql = `
    SELECT
      id,
      dispatch_date,
      shift,
      part_no,
      customer_name,
      product_type,
      validation_status,
      remarks,
      part_sl_no,
      sl_no,
      scanned_text,
      plant_location,
      vendorCode,
      is_rejected,
      created_by,
      modified_by,
      created_at,
      updated_at
    FROM scanned_products
    WHERE part_no IN (${placeholders})
      AND created_at >= ?
      AND created_at <= ?
    ORDER BY part_no ASC, created_at ASC
  `;
  const rows = await query(sql, [...partNumbers, from, to]);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Return a frequency map of { created_by → count } for a part number
 * in a date range. Useful for determining the top scanner.
 *
 * @param {string} partNumber
 * @param {Date}   from
 * @param {Date}   to
 * @returns {Promise<Array<{ created_by: string, scan_count: number }>>}
 */
export async function fetchScannerFrequency(partNumber, from, to) {
  const sql = `
    SELECT
      created_by,
      COUNT(*) AS scan_count
    FROM scanned_products
    WHERE part_no   = ?
      AND created_at >= ?
      AND created_at <= ?
      AND created_by IS NOT NULL
    GROUP BY created_by
    ORDER BY scan_count DESC, created_by ASC
  `;
  const rows = await query(sql, [partNumber, from, to]);
  return Array.isArray(rows) ? rows : [];
}