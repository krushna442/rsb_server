import { query, queryOne, execute } from '../db/db.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const parseJsonCols = (row) => {
  if (!row) return null;
  return {
    ...row,
    scanned_specification: JSON.parse(row.scanned_specification ?? '{}'),
    matched_fields:        JSON.parse(row.matched_fields        ?? '[]'),
    mismatched_fields:     JSON.parse(row.mismatched_fields     ?? '[]'),
  };
};


// ─── READ ─────────────────────────────────────────────────────────────────────

/**
 * Paginated list with filters
 */
export const findAllScans = async (filters = {}) => {
  try {
    const {
      dispatch_date,
      shift,
      part_no,
      customer_name,
      validation_status,
      plant_location,
      is_rejected,
      from_date,
      to_date,
      today,
      this_month,
      page = 1,
      limit = 20,
    } = filters;

    let sql = "SELECT * FROM scanned_products WHERE 1=1";
    const values = [];

    // exact date
    if (dispatch_date) {
      sql += " AND DATE(dispatch_date) = ?";
      values.push(dispatch_date);
    }

    // today filter (UTC safe)
    if (today === "true") {
      sql += " AND DATE(dispatch_date) = DATE(UTC_TIMESTAMP())";
    }

    // this month filter (UTC safe)
    if (this_month === "true") {
      sql += `
        AND MONTH(dispatch_date) = MONTH(UTC_TIMESTAMP())
        AND YEAR(dispatch_date) = YEAR(UTC_TIMESTAMP())
      `;
    }

    // range filter
    if (from_date) {
      sql += " AND DATE(dispatch_date) >= ?";
      values.push(from_date);
    }

    if (to_date) {
      sql += " AND DATE(dispatch_date) <= ?";
      values.push(to_date);
    }

    if (shift) {
      sql += " AND shift = ?";
      values.push(shift);
    }

    if (part_no) {
      sql += " AND part_no = ?";
      values.push(part_no);
    }

    if (customer_name) {
      sql += " AND customer_name = ?";
      values.push(customer_name);
    }

    if (validation_status) {
      sql += " AND validation_status = ?";
      values.push(validation_status);
    }

    if (plant_location) {
      sql += " AND plant_location = ?";
      values.push(plant_location);
    }

    if (is_rejected !== undefined) {
      sql += " AND is_rejected = ?";
      values.push(is_rejected ? 1 : 0);
    }

    // pagination
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    values.push(Number(limit), (Number(page) - 1) * Number(limit));

    const rows = await query(sql, values);

    return rows.map(parseJsonCols);
  } catch (error) {
    console.error("Error in findAllScans:", error);
    throw error;
  }
};

/**
 * Count for pagination
 */
export const countScans = async (filters = {}) => {
  try {
    const {
      dispatch_date,
      shift,
      part_no,
      customer_name,
      validation_status,
      plant_location,
      is_rejected,
      from_date,
      to_date,
      today,
      this_month,
    } = filters;

    let sql = "SELECT COUNT(*) AS cnt FROM scanned_products WHERE 1=1";
    const values = [];

    // exact date
    if (dispatch_date) {
      sql += " AND DATE(dispatch_date) = ?";
      values.push(dispatch_date);
    }

    // today filter
    if (today === "true") {
      sql += " AND DATE(dispatch_date) = DATE(UTC_TIMESTAMP())";
    }

    // this month filter
    if (this_month === "true") {
      sql += `
        AND MONTH(dispatch_date) = MONTH(UTC_TIMESTAMP())
        AND YEAR(dispatch_date) = YEAR(UTC_TIMESTAMP())
      `;
    }

    // range
    if (from_date) {
      sql += " AND DATE(dispatch_date) >= ?";
      values.push(from_date);
    }

    if (to_date) {
      sql += " AND DATE(dispatch_date) <= ?";
      values.push(to_date);
    }

    if (shift) {
      sql += " AND shift = ?";
      values.push(shift);
    }

    if (part_no) {
      sql += " AND part_no = ?";
      values.push(part_no);
    }

    if (customer_name) {
      sql += " AND customer_name = ?";
      values.push(customer_name);
    }

    if (validation_status) {
      sql += " AND validation_status = ?";
      values.push(validation_status);
    }

    if (plant_location) {
      sql += " AND plant_location = ?";
      values.push(plant_location);
    }

    if (is_rejected !== undefined) {
      sql += " AND is_rejected = ?";
      values.push(is_rejected ? 1 : 0);
    }

    const row = await queryOne(sql, values);

    return Number(row.cnt);
  } catch (error) {
    console.error("Error in countScans:", error);
    throw error;
  }
};

export const findScanById = async (id) => {
  try {
    const row = await queryOne('SELECT * FROM scanned_products WHERE id = ?', [id]);
    return parseJsonCols(row);
  } catch (error) {
    console.error('Error in findScanById:', error);
    throw error;
  }
};

// ─── CREATE (with built-in validation) ───────────────────────────────────────
// Part types where C_Flange Orient and Coupling Flange are skipped
// (they will be NA/null in master for REAR and others)

const SCAN_FIELD_MAP = [
  {
    scanKey:   'customer_name',
    masterKey: 'customer',
    label:     'Customer Name',
    isRoot:    true,
  },
  {
    scanKey:   'product_type',
    masterKey: 'partType',
    label:     'Product Type',
    isRoot:    true,
  },
  {
    scanKey:   'tubeDiameter',
    masterKey: 'tubeDiameter',
    label:     'Tube Dia & Thickness',
  },
  {
    scanKey:   'tubeLength',
    masterKey: 'tubeLength',
    label:     'Tube Length',
  },
  {
    scanKey:   'jointType',
    masterKey: 'sfDetails',
    label:     'Joint Type',
  },
  {
    scanKey:        'cFlangeOrient',
    masterKey:      'couplingFlangeOrientations',
    label:          'C_Flange Orient',
    skipIfNotFront: true,
  },
  {
    scanKey:   'flangeYoke',
    masterKey: 'mountingDetailsFlangeYoke',
    label:     'Flange Yoke',
  },
  {
    scanKey:        'couplingFlange',
    masterKey:      'mountingDetailsCouplingFlange',
    label:          'Coupling Flange',
    skipIfNotFront: true,
  },
];

// Part types where C_Flange Orient and Coupling Flange are skipped
const FRONT_MIDDLE_TYPES = ['FRONT', 'MIDDLE'];

export const runValidation = (masterSpec, masterProduct, scanData) => {
  const matched    = [];
  const mismatched = [];

  const partType      = (masterSpec.partType ?? '').toString().trim().toUpperCase();
  const isFrontMiddle = FRONT_MIDDLE_TYPES.includes(partType);

  for (const field of SCAN_FIELD_MAP) {

    // 1. Skip flange fields for non-FRONT/MIDDLE parts
    if (field.skipIfNotFront && !isFrontMiddle) continue;

    // 2. Get the scanned value from payload
    const scannedVal = field.isRoot
      ? scanData[field.scanKey]
      : scanData.scanned_specification?.[field.scanKey];

    // 3. If field was NOT sent in the payload at all → skip it entirely
    if (scannedVal === undefined) continue;

    // 4. Get master value
    const masterVal = field.isRoot && field.masterKey === 'customer'
      ? masterProduct.customer
      : masterSpec[field.masterKey];

    // 5. If master has no value for this field → skip (can't compare)
    if (masterVal === undefined || masterVal === null) continue;

    // 6. Compare — case-insensitive, trimmed strings
    const masterStr  = String(masterVal).trim().toUpperCase();
    const scannedStr = String(scannedVal).trim().toUpperCase();

    if (masterStr === scannedStr) {
      matched.push(field.label);
    } else {
      mismatched.push(field.label);
    }
  }

  const status = mismatched.length === 0 ? 'pass' : 'fail';

  const remarks = status === 'pass'
    ? 'Details matched successfully'
    : `Mismatch found in: ${mismatched.join(', ')}`;

  return { matched, mismatched, status, remarks };
};

/**
 * Generates the next sl_no for the current IST month.
 *
 * Rules:
 *  - Zero-padded to 5 digits: "00001", "00002", ...
 *  - Resets to "00001" on the first scan of each new calendar month (IST).
 *  - Fetches the last record whose dispatch_date falls in the current IST
 *    month (LIKE "YYYY-MM%"), increments its sl_no by 1.
 *  - If no record found for this month → returns "00001".
 */
const generateSlNo = async (currentISTDatetime) => {
  // Extract "YYYY-MM" from "YYYY-MM-DD HH:mm:ss"
  const currentYearMonth = currentISTDatetime.slice(0, 7); // e.g. "2026-03"

  const rows = await execute(
    `SELECT sl_no
     FROM   scanned_products
     WHERE  dispatch_date LIKE ?
     ORDER BY id DESC
     LIMIT 1`,
    [`${currentYearMonth}%`]
  );

  if (!rows || rows.length === 0) {
    return '00001';
  }

  const nextNumber = parseInt(rows[0].sl_no, 10) + 1;
  return String(nextNumber).padStart(5, '0');
};

export const createScan = async (scanData, masterProduct, created_by = null) => {
  try {
    const masterSpec  = masterProduct?.specification ?? {};
    const scannedSpec = scanData.scanned_specification ?? {};

    const { matched, mismatched, status, remarks } = runValidation(
      masterSpec,
      masterProduct,
      scanData
    );

    // Use auto-generated remarks unless operator explicitly provided one
    const finalRemarks = scanData.remarks?.trim() || remarks;

    // dispatch_date is already set to IST by the controller ("YYYY-MM-DD HH:mm:ss")
    const dispatchDate = scanData.dispatch_date;

    // Auto-generate monthly-resetting sl_no
    const slNo = await generateSlNo(dispatchDate);

    const result = await execute(
      `INSERT INTO scanned_products (
        dispatch_date, shift,
        part_no, customer_name, product_type,
        validation_status, remarks,
        part_sl_no, sl_no, scanned_text,
        plant_location, vendorCode,
        is_rejected,
        created_by, modified_by,
        product_id,
        scanned_specification, matched_fields, mismatched_fields
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dispatchDate,
        scanData.shift          ?? null,
        scanData.part_no        ?? null,
        scanData.customer_name  ?? null,
        scanData.product_type   ?? null,
        status,
        finalRemarks,
        scanData.part_sl_no     ?? null,  // <- from frontend, unchanged
        slNo,                             // <- auto-generated monthly serial
        scanData.scanned_text   ?? null,
        scanData.plant_location ?? null,
        scanData.vendorCode     ?? null,
        status === 'fail' ? 1 : 0,
        created_by,
        created_by,
        masterProduct?.id       ?? null,
        JSON.stringify(scannedSpec),
        JSON.stringify(matched),
        JSON.stringify(mismatched),
      ]
    );

    return findScanById(result.insertId);
  } catch (error) {
    console.error('Error in createScan:', error);
    throw error;
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export const updateScanRemarks = async (id, remarks, modified_by = null) => {
  try {
    await execute(
      'UPDATE scanned_products SET remarks = ?, modified_by = ?, updated_at = NOW() WHERE id = ?',
      [remarks, modified_by, id]
    );
    return findScanById(id);
  } catch (error) {
    console.error('Error in updateScanRemarks:', error);
    throw error;
  }
};

export const updateRejectedFlag = async (id, is_rejected, modified_by = null) => {
  try {
    await execute(
      'UPDATE scanned_products SET is_rejected = ?, modified_by = ?, updated_at = NOW() WHERE id = ?',
      [is_rejected ? 1 : 0, modified_by, id]
    );
    return findScanById(id);
  } catch (error) {
    console.error('Error in updateRejectedFlag:', error);
    throw error;
  }
};

// ─── STATS ────────────────────────────────────────────────────────────────────

export const getDailySummary = async (date) => {
  try {
    const row = await queryOne(
      `SELECT
        COUNT(*)                          AS total,
        SUM(validation_status = 'pass')   AS pass,
        SUM(validation_status = 'fail')   AS fail,
        SUM(is_rejected = 1)              AS rejected
       FROM scanned_products
       WHERE DATE(dispatch_date) = ?`,
      [date]
    );
    return row;
  } catch (error) {
    console.error('Error in getDailySummary:', error);
    throw error;
  }
};



export const getCurrentMonthSummary = async () => {
  try {
    const row = await queryOne(
      `SELECT
        COUNT(*) AS total,
        SUM(validation_status = 'pass') AS pass,
        SUM(validation_status = 'fail') AS fail,
        SUM(is_rejected = 1) AS rejected
       FROM scanned_products
       WHERE MONTH(dispatch_date) = MONTH(CURRENT_DATE())
       AND YEAR(dispatch_date) = YEAR(CURRENT_DATE())`
    );

    return row;
  } catch (error) {
    console.error("Error in getCurrentMonthSummary:", error);
    throw error;
  }
};



export const getSummaryBetweenDates = async (fromDate, toDate) => {
  try {
    const row = await queryOne(
      `SELECT
        COUNT(*) AS total,
        SUM(validation_status = 'pass') AS pass,
        SUM(validation_status = 'fail') AS fail,
        SUM(is_rejected = 1) AS rejected
       FROM scanned_products
       WHERE DATE(dispatch_date) BETWEEN ? AND ?`,
      [fromDate, toDate]
    );

    return row;
  } catch (error) {
    console.error("Error in getSummaryBetweenDates:", error);
    throw error;
  }
};    


export const getTodaySummary = async () => {
  try {
    const row = await queryOne(
      `SELECT
        COUNT(*) AS total,
        SUM(validation_status = 'pass') AS pass,
        SUM(validation_status = 'fail') AS fail,
        SUM(is_rejected = 1) AS rejected
       FROM scanned_products
       WHERE DATE(dispatch_date) = CURRENT_DATE()`
    );

    return row;
  } catch (error) {
    console.error("Error in getTodaySummary:", error);
    throw error;
  }
};