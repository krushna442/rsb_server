import { query, queryOne, execute } from '../db/db.js';
import { parseScanText } from './parseScanText.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const parseJSON = (data, fallback = '{}') => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return JSON.parse(fallback);
    }
  }
  return data ?? JSON.parse(fallback);
};

const parseJsonCols = (row) => {
  if (!row) return null;
  return {
    ...row,
    scanned_specification: parseJSON(row.scanned_specification, '{}'),
    matched_fields:        parseJSON(row.matched_fields, '[]'),
    mismatched_fields:     parseJSON(row.mismatched_fields, '[]'),
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
    const parsedLimit = Math.max(1, Number(limit) || 20);
    const parsedPage = Math.max(1, Number(page) || 1);
    const offsetNum = (parsedPage - 1) * parsedLimit;
    sql += ` ORDER BY created_at DESC LIMIT ${parsedLimit} OFFSET ${offsetNum}`;

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


/**
 * runValidation.js
 *
 * Validates a scanned product against its master record.
 * Now includes revNo and vendorCode checks drawn from the parsed barcode.
 */


// ---------------------------------------------------------------------------
// Field map – extend / adjust to your actual DB column names
// ---------------------------------------------------------------------------
const SCAN_FIELD_MAP = [
  { label: 'Tube Diameter',   masterKey: 'tubeDiameter',                    scanKey: 'tubeDiameter',   isRoot: false, skipIfNotFront: false },
  { label: 'Tube Length',     masterKey: 'tubeLength',                      scanKey: 'tubeLength',     isRoot: false, skipIfNotFront: false },
  { label: 'Series',          masterKey: 'series',                          scanKey: 'series',         isRoot: false, skipIfNotFront: false },
  { label: 'C-Flange Orient', masterKey: 'couplingFlangeOrientations',         scanKey: 'cFlangeOrient',  isRoot: false, skipIfNotFront: true  }, // ← was 'cFlangeOrient'
  { label: 'Flange Yoke',     masterKey: 'mountingDetailsFlangeYoke',       scanKey: 'flangeYoke',     isRoot: false, skipIfNotFront: true  }, // ← was 'flangeYoke'
  { label: 'Coupling Flange', masterKey: 'mountingDetailsCouplingFlange',   scanKey: 'couplingFlange', isRoot: false, skipIfNotFront: true  }, // ← was 'couplingFlange'
  { label: 'Customer',        masterKey: 'customer',                        scanKey: 'customer_name',  isRoot: true,  skipIfNotFront: false },
];

const FRONT_MIDDLE_TYPES = ['FRONT', 'MIDDLE','INTEGRATED'];

// ---------------------------------------------------------------------------
// Vendor code comparison helper
// Handles comma-separated master vendor codes e.g. "7205761,7201012"
// ---------------------------------------------------------------------------
function vendorMatches(masterVendorRaw = '', scannedVendor = '') {
  if (!masterVendorRaw || !scannedVendor) return false;

  const masterCodes = masterVendorRaw
    .split(',')
    .map(v => v.trim().toUpperCase());

  const scanned = scannedVendor.trim().toUpperCase();
  return masterCodes.includes(scanned);
}


// ---------------------------------------------------------------------------
// Resolve the vendor code for the specific scanned customer
// Master stores parallel comma-separated lists:
//   customer:   "ALL ALW,ALL PNR"
//   vendorCode: "7205761,7201012"
// The scanned customer's position in the master customer list
// determines which vendor code to use.
// ---------------------------------------------------------------------------
function resolveVendorCodeForCustomer(masterCustomerRaw = '', masterVendorRaw = '', scannedCustomer = '') {
  if (!masterCustomerRaw || !masterVendorRaw || !scannedCustomer) return masterVendorRaw;

  const customers    = masterCustomerRaw.split(',').map(c => c.trim().toUpperCase());
  const vendorCodes  = masterVendorRaw.split(',').map(v => v.trim());
  const scanned      = scannedCustomer.trim().toUpperCase();

  const index = customers.indexOf(scanned);

  // If found and a vendor code exists at that position, return it
  // Otherwise fall back to the full raw string (safe default)
  if (index !== -1 && vendorCodes[index]) {
    return vendorCodes[index];
  }

  return masterVendorRaw;
}
// ---------------------------------------------------------------------------
// Rev-no comparison helper
// Normalises both sides (strips "Rev No#" prefix, trims spaces)
// ---------------------------------------------------------------------------
function normaliseRev(raw = '') {
  let s = raw.replace(/rev\s*no\s*/i, '').trim();
  if (!s.startsWith('#')) s = '#' + s;
  return s.toUpperCase().replace(/\s+/g, '');
}

function revMatches(masterRev = '', scannedRev = '') {
  if (!masterRev || !scannedRev) return false;
  return normaliseRev(masterRev) === normaliseRev(scannedRev);
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------

/**
 * @param {object} masterSpec      – masterProduct.specification
 * @param {object} masterProduct   – full master record (includes .customer, .vendorCode, .revNo)
 * @param {object} scanData        – request body (includes scanned_text, scanned_specification …)
 * @returns {{ matched: string[], mismatched: string[], status: 'pass'|'fail', remarks: string }}
 */
export const runValidation = (masterSpec, masterProduct, scanData) => {

 const matched    = [];
  const mismatched = [];

  const partType      = (masterSpec?.partType ?? '').toString().trim().toUpperCase();
  const isFrontMiddle = FRONT_MIDDLE_TYPES.includes(partType);

  // ------------------------------------------------------------------
  // 1. Spec-field validation (existing logic, unchanged)
  // ------------------------------------------------------------------
  for (const field of SCAN_FIELD_MAP) {
    if (field.skipIfNotFront && !isFrontMiddle) continue;

    const scannedVal = field.isRoot
      ? scanData[field.scanKey]
      : scanData.scanned_specification?.[field.scanKey];

    if (scannedVal === undefined) continue;

    const masterVal = field.isRoot && field.masterKey === 'customer'
      ? masterProduct.customer
      : masterSpec[field.masterKey];

    if (masterVal === undefined || masterVal === null) continue;

    const masterStr  = String(masterVal).trim().toUpperCase();
    const scannedStr = String(scannedVal).trim().toUpperCase();

// For Customer field, support comma-separated master values
if (field.masterKey === 'customer') {
    const masterValues = masterStr.split(',').map(v => v.trim());
    if (masterValues.includes(scannedStr)) {
        matched.push(field.label);
    } else {
        mismatched.push(field.label);
    }
} else {
    if (masterStr === scannedStr) {
        matched.push(field.label);
    } else {
        mismatched.push(field.label);
    }
}
  }

  // ------------------------------------------------------------------
  // 2. Barcode-level validation: revNo + vendorCode
  //    Parse the raw scanned_text to extract these fields
  // ------------------------------------------------------------------
  const parsed = parseScanText(scanData.scanned_text ?? '');

  if (parsed) {
    // --- Vendor Code ---
      const { reverseMap } = buildCustomerVendorMap(
    masterProduct.customer ?? '',
    masterProduct.specification?.vendorCode ?? ''
  );

  const expectedCustomer = reverseMap[parsed.vendorCode];
  const actualCustomer = scanData.customer_name?.trim().toUpperCase();

if (!expectedCustomer) {
  mismatched.push('Customer');
} else if (expectedCustomer !== actualCustomer) {
  mismatched.push('Customer');
} else {
  matched.push('Customer');
}

    // --- Rev No ---
    const masterRev = (masterProduct.revNo ?? masterSpec?.revNo ?? '').trim();
    if (masterRev && parsed.revNo) {
      if (revMatches(masterRev, parsed.revNo)) {
        matched.push('Rev No');
      } else {
        mismatched.push('Rev No');
      }
    }

    // --- Part Sl No (expose parsed value back to scanData so createScan can use it) ---
    // Only override if frontend didn't send one
    if (!scanData.part_sl_no && parsed.partSlNo) {
      scanData.part_sl_no = parsed.partSlNo;
    }

    // --- Dispatch date fallback from barcode ---
    if (!scanData.dispatch_date && parsed.dispatchDate) {
      scanData.dispatch_date = parsed.dispatchDate;
    }
  }

  // ------------------------------------------------------------------
  // 3. Build result
  // ------------------------------------------------------------------
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


function buildCustomerVendorMap(customersStr, vendorsStr) {
  const customers = customersStr
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(Boolean);

  const vendors = vendorsStr
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  const map = {};
  const reverseMap = {};

  const len = Math.min(customers.length, vendors.length);

  for (let i = 0; i < len; i++) {
    const customer = customers[i];
    const vendor = vendors[i];

    map[customer] = vendor;
    reverseMap[vendor] = customer;
  }

  return { map, reverseMap };
}

function validateCustomerVendorMatch(masterProduct, scannedVendor, payloadCustomer) {
  const { map, reverseMap } = buildCustomerVendorMap(
    masterProduct.customer ?? '',
    masterProduct.specification?.vendorCode ?? ''
  );

  const expectedCustomer = reverseMap[scannedVendor];

  if (!expectedCustomer) {
    throw new Error(`Unknown vendor code: ${scannedVendor}`);
  }

  if (
    expectedCustomer !== payloadCustomer?.trim().toUpperCase()
  ) {
    throw new Error(
      `Mismatch: vendor ${scannedVendor} belongs to ${expectedCustomer}, but got ${payloadCustomer}`
    );
  }

  return true;
}

export const createScan = async (scanData, masterProduct, created_by = null) => {
  try {
    const masterSpec  = masterProduct?.specification ?? {};
    const scannedSpec = scanData.scanned_specification ?? {};

    const { matched, mismatched, status, remarks } = runValidation(
      masterSpec,
      masterProduct,
      scanData
    );

    // 1. Sanitize/Trim fields
    const finalPartNo   = String(scanData.part_no   ?? '').trim();
    const finalPartSlNo = String(scanData.part_sl_no ?? '').trim();



    // 3. Resolve vendor code for the specific scanned customer
    //    e.g. master customer "ALL ALW,ALL PNR" + vendorCode "7205761,7201012"
    //    + scanned customer "ALL PNR" → stores "7201012" only
    const resolvedVendorCode = resolveVendorCodeForCustomer(
      masterProduct.customer           ?? '',   // "ALL ALW,ALL PNR"
      masterSpec.vendorCode            ?? '',   // "7205761,7201012"
      scanData.customer_name           ?? ''    // "ALL PNR"
    );

    const finalRemarks  = scanData.remarks?.trim() || remarks;
    const dispatchDate  = scanData.dispatch_date;
    const slNo          = await generateSlNo(dispatchDate);

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
        finalPartNo,
        scanData.customer_name  ?? null,
        scanData.product_type   ?? null,
        status,
        finalRemarks,
        finalPartSlNo,
        slNo,
        scanData.scanned_text   ?? null,
        scanData.plant_location ?? null,
        resolvedVendorCode,                  // ← was: scanData.vendorCode ?? null
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

export const updateScanRemarks = async (id, admin_remarks, modified_by = null) => {
  try {
    await execute(
      'UPDATE scanned_products SET admin_remarks = ?,is_remarks_edited = 1, modified_by = ?, updated_at = NOW() WHERE id = ?',
      [admin_remarks, modified_by, id]
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