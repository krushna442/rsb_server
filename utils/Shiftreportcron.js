import cron from 'node-cron';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendMail } from './mailer.js';
import { query } from '../db/db.js';
import { findAllUsers } from '../models/userModel.js';
import { findProductByPartNumber } from '../models/productModel.js';
import { parseScanText } from '../models/parseScanText.js';

// ─────────────────────────────────────────────
//  Excel storage directory
//  All generated reports are saved under:
//  <project_root>/uploads/excel-records/
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  Excel storage directory
//  File location:  <project_root>/utils/Shiftreportcron.js
//  Uploads target: <project_root>/uploads/excel-records/
//  So we go up one directory from __dirname (utils/) to reach project root.
// ─────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_DIR = path.resolve(__dirname, '../uploads/excel-records');

// Create directory synchronously at startup — log the resolved path so it's
// easy to confirm in the console that the path is correct.
if (!fs.existsSync(EXCEL_DIR)) fs.mkdirSync(EXCEL_DIR, { recursive: true });
console.log(`[ShiftReport] Excel records directory: ${EXCEL_DIR}`);

/**
 * Save an ExcelJS workbook to disk and return the file path.
 * The caller never holds a large Buffer in memory.
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {string} filename  – e.g. "PDI_FRONT_FC361700_A_2026-04-10.xlsx"
 * @returns {Promise<string>} absolute file path
 */
async function saveWorkbook(workbook, filename) {
  const filePath = path.join(EXCEL_DIR, filename);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

/**
 * Build a nodemailer-compatible attachment object from a saved file path.
 *
 * @param {string} filePath
 * @param {string} [filenameOverride]
 */
function attachmentFromPath(filePath, filenameOverride) {
  return {
    filename:    filenameOverride || path.basename(filePath),
    path:        filePath,   // nodemailer streams the file — no Buffer in memory
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

// ─────────────────────────────────────────────
//  Shift definitions
//  A = Morning  06:00–14:00
//  B = Evening  14:00–22:00
//  C = Night    22:00–06:00
// ─────────────────────────────────────────────
const SHIFTS = [
  { label: 'Shift A  (06:00 – 14:00)', shiftLetter: 'A', startHour: 6,  endHour: 14 },
  { label: 'Shift B  (14:00 – 22:00)', shiftLetter: 'B', startHour: 14, endHour: 22 },
  { label: 'Shift C  (22:00 – 06:00)', shiftLetter: 'C', startHour: 22, endHour: 6  },
];

// ─────────────────────────────────────────────
//  Helpers: recipients filtered by mail_type
// ─────────────────────────────────────────────
async function getRecipients(mailType) {
  const users = await findAllUsers();
  return users
    .filter(u =>
      u.is_active &&
      u.email &&
      Array.isArray(u.mail_types) &&
      u.mail_types.includes(mailType)
    )
    .map(u => u.email);
}

// ─────────────────────────────────────────────
//  Part type detection
// ─────────────────────────────────────────────
function detectPartType(product) {
  if (!product?.specification) return 'FRONT';
  const t = (product.specification.partType || '').toUpperCase();
  if (t === 'REAR')   return 'REAR';
  if (t === 'MIDDLE') return 'MIDDLE';
  return 'FRONT';
}

// ─────────────────────────────────────────────
//  Tube / total length random variant.
//  tubeLength  → ±1   (call with range=1)
//  totalLength → ±2   (call with range=2)
//  If base is 0 or not a valid number, returns 0 unchanged.
// ─────────────────────────────────────────────
function randomVariant(base, range = 2) {
  const n = parseInt(base, 10);
  // Do not fabricate a value when the spec field is zero or absent
  if (isNaN(n) || n === 0) return 0;
  const sign  = Math.random() < 0.5 ? -1 : 1;
  const delta = Math.floor(Math.random() * (range + 1));   // 0..range inclusive
  return n + sign * delta;
}

// ─────────────────────────────────────────────
//  Strip ±tolerance from a length string and return the numeric base.
//  e.g. "3392±5"  → 3392
//       "1060±2"  → 1060
//       "1060"    → 1060
//  NOTE: we split ONLY on the ± Unicode character so that a plain dash
//  inside a part-number string (e.g. "FC-361700") is not truncated.
// ─────────────────────────────────────────────
function parseTotalLength(raw) {
  if (!raw) return NaN;
  // Remove the ± tolerance suffix if present, keep the leading numeric value
  const cleaned = String(raw).split('±')[0].replace(/[^0-9]/g, '');
  return parseInt(cleaned, 10);
}

// ─────────────────────────────────────────────
//  Build shift time window
// ─────────────────────────────────────────────
function getShiftWindow(shiftIndex) {
  const shift = SHIFTS[shiftIndex];
  const now   = new Date();
  let from, to;

  if (shift.startHour < shift.endHour) {
    // Same-day shift (A, B)
    from = new Date(now);
    from.setHours(shift.startHour, 0, 0, 0);
    to   = new Date(now);
    to.setHours(shift.endHour, 0, 0, 0);
  } else {
    // Overnight shift (C): started yesterday at 22:00, ends today at 06:00
    to   = new Date(now);
    to.setHours(shift.endHour, 0, 0, 0);
    from = new Date(now);
    from.setDate(from.getDate() - 1);
    from.setHours(shift.startHour, 0, 0, 0);
  }

  const reportDate = from.toISOString().slice(0, 10);
  return { from, to, shiftLabel: shift.label, shiftLetter: shift.shiftLetter, reportDate };
}

// ─────────────────────────────────────────────
//  Fetch scanned_products in a time range
// ─────────────────────────────────────────────
async function fetchRecords(from, to) {
  const sql = `
    SELECT
      id, dispatch_date, shift, part_no, customer_name, product_type,
      validation_status, remarks, part_sl_no, sl_no, scanned_text,
      plant_location, vendorCode, is_rejected, created_by, modified_by,
      created_at, updated_at
    FROM scanned_products
    WHERE created_at >= ? AND created_at < ?
    ORDER BY created_at ASC
  `;
  const rows = await query(sql, [from, to]);
  return Array.isArray(rows) ? rows : [];
}

// ─────────────────────────────────────────────
//  Fetch products created in a month
// ─────────────────────────────────────────────
async function fetchMonthlyProducts(from, to) {
  const sql = `
    SELECT *
    FROM products
    WHERE created_at >= ? AND created_at < ?
    ORDER BY created_at ASC
  `;
  const rows = await query(sql, [from, to]);
  return Array.isArray(rows) ? rows : [];
}

// ─────────────────────────────────────────────
//  Shared Excel style constants
// ─────────────────────────────────────────────
const NAVY        = 'FF1F3864';
const WHITE       = 'FFFFFFFF';
const LIGHT_BLUE  = 'FFDCE6F1';
const GREY_BG     = 'FFF2F2F2';
const BORDER_DARK  = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER_LIGHT = { style: 'thin', color: { argb: 'FFCCCCCC' } };

const navyFill   = () => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } });
const lightFill  = () => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } });
const greyFill   = () => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_BG } });
const whiteFill  = () => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } });
const yellowFill = () => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } });
const greenFill  = () => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } });

const centerAlign = (wrap = true)  => ({ horizontal: 'center', vertical: 'middle', wrapText: wrap });
const leftAlign   = (wrap = false) => ({ horizontal: 'left',   vertical: 'middle', wrapText: wrap });

function applyBorder(cell, b) {
  cell.border = { top: b, bottom: b, left: b, right: b };
}

function styleHeaderCell(cell, text) {
  cell.value     = text;
  cell.fill      = navyFill();
  cell.font      = { bold: true, color: { argb: WHITE }, size: 10, name: 'Arial' };
  cell.alignment = centerAlign();
  applyBorder(cell, BORDER_DARK);
}

// ─────────────────────────────────────────────
//  Build summary stats from a rows array
// ─────────────────────────────────────────────
function calcStats(rows) {
  return {
    total:    rows.length,
    passed:   rows.filter(r => r.validation_status === 'pass').length,
    failed:   rows.filter(r => r.validation_status === 'fail').length,
  };
}

// ─────────────────────────────────────────────
//  Build Scanned PDI Report Excel
//  (matches Scanned_PDI_Report.xlsx format)
// ─────────────────────────────────────────────
/**
 * Build Scanned PDI Report Excel, save to disk, return file path.
 * @param {object[]} rows
 * @param {string} titleLabel
 * @param {string} reportDate  YYYY-MM-DD
 * @param {string} filename    target filename (no directory)
 * @returns {Promise<string>}  absolute file path
 */
async function buildScanExcel(rows, titleLabel, reportDate, filename) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RSB Shift Report System';
  workbook.created  = new Date();

  const sheet = workbook.addWorksheet('Scanned PDI Report', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  const { total, passed, failed } = calcStats(rows);
  const COLS = 12;

  // ── Row 1: Title ──────────────────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, COLS);
  const titleCell = sheet.getCell('A1');
  titleCell.value     = `PRE DISPATCH INSPECTION SCANNED REPORT — ${titleLabel}   |   Date: ${reportDate}`;
  titleCell.font      = { bold: true, size: 13, color: { argb: WHITE }, name: 'Arial' };
  titleCell.alignment = centerAlign();
  titleCell.fill      = navyFill();
  applyBorder(titleCell, BORDER_DARK);
  sheet.getRow(1).height = 28;

  // ── Row 2: Stats bar ──────────────────────────────────────────────────
  sheet.mergeCells(2, 1, 2, COLS);
  const statsCell = sheet.getCell('A2');
  statsCell.value     = `Total: ${total}   ✅ Pass: ${passed}   ❌ Fail: ${failed}`;
  statsCell.font      = { bold: true, size: 11, name: 'Arial' };
  statsCell.alignment = centerAlign();
  statsCell.fill      = lightFill();
  sheet.getRow(2).height = 22;

  // ── Row 3: Company ────────────────────────────────────────────────────
  sheet.mergeCells(3, 1, 3, COLS);
  const compCell = sheet.getCell('A3');
  compCell.value     = 'RSB TRANSMISSIONS (I) LTD , LUCKNOW';
  compCell.font      = { bold: true, size: 11, color: { argb: WHITE }, name: 'Arial' };
  compCell.alignment = centerAlign();
  compCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4A7A' } };
  applyBorder(compCell, BORDER_DARK);
  sheet.getRow(3).height = 20;

  // ── Row 4: Column headers ─────────────────────────────────────────────
  const headers = [
    { header: 'SR.NO',          key: 'sr_no',             width: 8  },
    { header: 'Shift',          key: 'shift',             width: 8  },
    { header: 'Created On',     key: 'created_on',        width: 20 },
    { header: 'Customer Name',  key: 'customer_name',     width: 20 },
    { header: 'Vendor Code',    key: 'vendor_code',       width: 16 },
    { header: 'Plant Code',     key: 'plant_code',        width: 12 },
    { header: 'Part No.',       key: 'part_no',           width: 14 },
    { header: 'Plant Location', key: 'plant_location',    width: 20 },
    { header: 'Scanned Text',   key: 'scanned_text',      width: 50 },
    { header: 'Rejected',       key: 'rejected',          width: 10 },
    { header: 'Remark',         key: 'remark',            width: 28 },
    { header: 'Created By',     key: 'created_by',        width: 16 },
  ];

  sheet.columns = headers;
  const hRow = sheet.getRow(4);
  hRow.height = 22;
  headers.forEach((h, i) => styleHeaderCell(hRow.getCell(i + 1), h.header));

  // ── Data rows ─────────────────────────────────────────────────────────
  const statusColors = { pass: 'FFE2EFDA', fail: 'FFFFC7CE' };

  rows.forEach((r, idx) => {
    const excelRow = sheet.addRow({
      sr_no:          r.sl_no ?? idx + 1,
      shift:          r.shift ?? '',
      created_on:     r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '',
      customer_name:  r.customer_name ?? '',
      vendor_code:    r.vendorCode ?? '',
      plant_code:     r.plant_location?.split('-')[0]?.trim() ?? '',
      part_no:        r.part_no ?? '',
      plant_location: r.plant_location ?? '',
      scanned_text:   r.scanned_text ?? '',
      rejected:       r.is_rejected ? 'Yes' : 'No',
      remark:         r.remarks ?? '',
      created_by:     r.created_by ?? '',
    });
    excelRow.height = 18;

    const bgColor = statusColors[r.validation_status] ?? WHITE;
    excelRow.eachCell({ includeEmpty: true }, cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = { vertical: 'middle', wrapText: false };
      cell.border    = { top: BORDER_LIGHT, bottom: BORDER_LIGHT, left: BORDER_LIGHT, right: BORDER_LIGHT };
      cell.font      = { size: 9, name: 'Arial', color: { argb: 'FF000000' } };
    });

    // Rejected rows: bold red background, clear dark font (no strikethrough)
    if (r.is_rejected) {
      excelRow.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCC' } };
        cell.font = { size: 9, name: 'Arial', bold: true, color: { argb: 'FF8B0000' } };
      });
    }
  });

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 4, activeCell: 'A5' }];
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS } };

  return saveWorkbook(workbook, filename);
}

// ─────────────────────────────────────────────
//  PDI row writer helper
// ─────────────────────────────────────────────
function writePDIRow(sheet, rowNum, srNo, characteristic, specification, mode, observations, productStatus, remark) {
  const row = sheet.getRow(rowNum);
  row.height = 20;

  const c0 = row.getCell(1);
  c0.value     = srNo;
  c0.fill      = greyFill();
  c0.font      = { bold: true, size: 9, name: 'Arial' };
  c0.alignment = centerAlign();
  applyBorder(c0, BORDER_DARK);

  sheet.mergeCells(rowNum, 2, rowNum, 3);
  const c1 = row.getCell(2);
  c1.value     = characteristic;
  c1.fill      = whiteFill();
  c1.font      = { size: 9, name: 'Arial' };
  c1.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  applyBorder(c1, BORDER_LIGHT);

  const c2 = row.getCell(4);
  c2.value     = specification;
  c2.fill      = lightFill();
  c2.font      = { size: 9, name: 'Arial' };
  c2.alignment = centerAlign(true);
  applyBorder(c2, BORDER_LIGHT);

  const c3 = row.getCell(5);
  c3.value     = mode;
  c3.fill      = greyFill();
  c3.font      = { size: 9, name: 'Arial' };
  c3.alignment = centerAlign(true);
  applyBorder(c3, BORDER_LIGHT);

  observations.forEach((obs, i) => {
    const cell = row.getCell(6 + i);
    cell.value     = obs ?? '';
    cell.fill      = whiteFill();
    cell.font      = { size: 9, name: 'Arial' };
    cell.alignment = centerAlign(true);
    applyBorder(cell, BORDER_LIGHT);
  });

  const cStatus = row.getCell(11);
  cStatus.value     = productStatus || 'All Shaft Found of ok';
  cStatus.fill      = greenFill();
  cStatus.font      = { size: 9, name: 'Arial', color: { argb: 'FF2E7D32' } };
  cStatus.alignment = centerAlign(true);
  applyBorder(cStatus, BORDER_LIGHT);

  const cRemark = row.getCell(12);
  cRemark.value     = remark || '';
  cRemark.fill      = whiteFill();
  cRemark.font      = { size: 8, name: 'Arial', italic: true };
  cRemark.alignment = leftAlign(true);
  applyBorder(cRemark, BORDER_LIGHT);
}

// ─────────────────────────────────────────────
//  Build PDI Check Sheet for one part number
//  Matches FRONT / REAR / MIDDLE sample sheets
// ─────────────────────────────────────────────

/**
 * Find the name of the person who scanned the most records for a part number.
 * Falls back to 'RAJ KAPOOR' if created_by is not populated.
 * @param {object[]} records
 * @returns {string}
 */
function topScannerName(records) {
  const counts = {};
  for (const rec of records) {
    const name = (rec.created_by || '').trim();
    if (!name) continue;
    counts[name] = (counts[name] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return 'RAJ KAPOOR';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * Build PDI Check Sheet for one part number, save to disk, return file path.
 * Only F2 / F3 scanned records are included (F1 records are excluded).
 * @param {string} partNumber
 * @param {object[]} records   – already filtered to non-F1 before this call
 * @param {object}  product
 * @param {string}  shiftLetter
 * @param {string}  reportDate  YYYY-MM-DD
 * @param {string}  filename    target filename (no directory)
 * @returns {Promise<string>}   absolute file path
 */
async function buildPDIExcel(partNumber, records, product, shiftLetter, reportDate, filename) {
  const spec      = product?.specification || {};
  const partType  = detectPartType(product);
  const qty       = records.length;
  const sampleSize = Math.min(qty, 5);
  const sampleRecords = records.slice(0, sampleSize);

  // Person who scanned the most records for this part number in this batch
  const checkedByName = topScannerName(records);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RSB PDI Report System';
  workbook.created  = new Date();

  const sheet = workbook.addWorksheet(partType, {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  sheet.columns = [
    { width: 7  },  // SR NO
    { width: 28 },  // Characteristics part 1
    { width: 5  },  // Characteristics part 2 (merged)
    { width: 20 },  // Specification
    { width: 22 },  // Mode of Checking
    { width: 18 },  // Obs 1
    { width: 18 },  // Obs 2
    { width: 18 },  // Obs 3
    { width: 18 },  // Obs 4
    { width: 18 },  // Obs 5
    { width: 20 },  // Product Status
    { width: 30 },  // Remark
  ];

  let r = 1;

  // ── Row 1: Title ──────────────────────────────────────────────────────
  sheet.mergeCells(r, 1, r, 12);
  const tc = sheet.getCell(r, 1);
  tc.value     = `PRE DISPATCH INSPECTION CHECK SHEET  ['${partType}']`;
  tc.font      = { bold: true, size: 13, name: 'Arial', color: { argb: WHITE } };
  tc.alignment = centerAlign();
  tc.fill      = navyFill();
  applyBorder(tc, BORDER_DARK);
  sheet.getRow(r).height = 26;
  r++;

  // ── Row 2: Company ────────────────────────────────────────────────────
  sheet.mergeCells(r, 1, r, 12);
  const cc = sheet.getCell(r, 1);
  cc.value     = 'RSB TRANSMISSIONS (I)LTD , LUCKNOW';
  cc.font      = { bold: true, size: 11, name: 'Arial', color: { argb: WHITE } };
  cc.alignment = centerAlign();
  cc.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4A7A' } };
  applyBorder(cc, BORDER_DARK);
  sheet.getRow(r).height = 22;
  r++;

  // ── Row 3: Description / Shift / Part No ─────────────────────────────
  sheet.mergeCells(r, 1, r, 3);
  const dl = sheet.getCell(r, 1);
  dl.value = 'DESCRIPTION-'; dl.font = { bold: true, size: 9, name: 'Arial' };
  dl.alignment = leftAlign(); dl.fill = lightFill(); applyBorder(dl, BORDER_DARK);

  sheet.mergeCells(r, 4, r, 5);
  const dv = sheet.getCell(r, 4);
  dv.value = spec.partDescription || `ASSY PROP SHAFT ${partNumber}`;
  dv.font = { bold: true, size: 9, name: 'Arial' }; dv.alignment = leftAlign();
  dv.fill = whiteFill(); applyBorder(dv, BORDER_DARK);

  const sl = sheet.getCell(r, 6);
  sl.value = 'Shift'; sl.font = { bold: true, size: 9, name: 'Arial' };
  sl.alignment = centerAlign(); sl.fill = lightFill(); applyBorder(sl, BORDER_DARK);

  const sv = sheet.getCell(r, 7);
  sv.value = shiftLetter; sv.font = { bold: true, size: 9, name: 'Arial' };
  sv.alignment = centerAlign(); sv.fill = yellowFill(); applyBorder(sv, BORDER_DARK);

  sheet.mergeCells(r, 8, r, 9);

  const pl = sheet.getCell(r, 10);
  pl.value = 'Part No:-'; pl.font = { bold: true, size: 9, name: 'Arial' };
  pl.alignment = leftAlign(); pl.fill = lightFill(); applyBorder(pl, BORDER_DARK);

  sheet.mergeCells(r, 11, r, 12);
  const pv = sheet.getCell(r, 11);
  pv.value = partNumber; pv.font = { bold: true, size: 10, name: 'Arial', color: { argb: NAVY } };
  pv.alignment = centerAlign(); pv.fill = yellowFill(); applyBorder(pv, BORDER_DARK);
  sheet.getRow(r).height = 20;
  r++;

  // ── Row 4: Drg No / Mode No / Invoice ────────────────────────────────
  sheet.mergeCells(r, 1, r, 3);
  const drgL = sheet.getCell(r, 1);
  drgL.value = 'Drg. No-'; drgL.font = { bold: true, size: 9, name: 'Arial' };
  drgL.alignment = leftAlign(); drgL.fill = lightFill(); applyBorder(drgL, BORDER_DARK);

  sheet.mergeCells(r, 4, r, 5);
  applyBorder(sheet.getCell(r, 4), BORDER_LIGHT);

  const modeL = sheet.getCell(r, 6);
  modeL.value = 'Mode No-'; modeL.font = { bold: true, size: 9, name: 'Arial' };
  modeL.alignment = centerAlign(); modeL.fill = lightFill(); applyBorder(modeL, BORDER_DARK);

  const modeV = sheet.getCell(r, 7);
  modeV.value = spec.revNo || '#'; modeV.font = { size: 9, name: 'Arial' };
  modeV.alignment = centerAlign(); modeV.fill = whiteFill(); applyBorder(modeV, BORDER_DARK);

  sheet.mergeCells(r, 8, r, 9);

  const invL = sheet.getCell(r, 10);
  invL.value = 'Invoice No.'; invL.font = { bold: true, size: 9, name: 'Arial' };
  invL.alignment = leftAlign(); invL.fill = lightFill(); applyBorder(invL, BORDER_DARK);

  sheet.mergeCells(r, 11, r, 12);
  applyBorder(sheet.getCell(r, 11), BORDER_LIGHT);
  sheet.getRow(r).height = 18;
  r++;

  // ── Row 5: QTY / Sample Size / Supply Date ───────────────────────────
  sheet.mergeCells(r, 1, r, 3);
  const reg = sheet.getCell(r, 1);
  reg.value = 'Regular-    Sample-'; reg.font = { size: 9, name: 'Arial' };
  reg.alignment = leftAlign(); reg.fill = whiteFill(); applyBorder(reg, BORDER_LIGHT);

  applyBorder(sheet.getCell(r, 4), BORDER_LIGHT);

  const qtyL = sheet.getCell(r, 5);
  qtyL.value = 'QTY:-'; qtyL.font = { bold: true, size: 9, name: 'Arial' };
  qtyL.alignment = leftAlign(); qtyL.fill = lightFill(); applyBorder(qtyL, BORDER_DARK);

  const qtyV = sheet.getCell(r, 6);
  qtyV.value = qty; qtyV.font = { bold: true, size: 10, name: 'Arial' };
  qtyV.alignment = centerAlign(); qtyV.fill = yellowFill(); applyBorder(qtyV, BORDER_DARK);

  const sampL = sheet.getCell(r, 7);
  sampL.value = 'Sample Size'; sampL.font = { bold: true, size: 9, name: 'Arial' };
  sampL.alignment = centerAlign(); sampL.fill = lightFill(); applyBorder(sampL, BORDER_DARK);

  sheet.mergeCells(r, 8, r, 9);
  const sampV = sheet.getCell(r, 9);
  sampV.value = sampleSize; sampV.font = { bold: true, size: 10, name: 'Arial' };
  sampV.alignment = centerAlign(); sampV.fill = yellowFill(); applyBorder(sampV, BORDER_DARK);

  const supL = sheet.getCell(r, 10);
  supL.value = 'Supply Date'; supL.font = { bold: true, size: 9, name: 'Arial' };
  supL.alignment = leftAlign(); supL.fill = lightFill(); applyBorder(supL, BORDER_DARK);

  sheet.mergeCells(r, 11, r, 12);
  const supV = sheet.getCell(r, 11);
  supV.value = reportDate.split('-').reverse().join('/');
  supV.font = { size: 9, name: 'Arial' }; supV.alignment = centerAlign();
  supV.fill = whiteFill(); applyBorder(supV, BORDER_DARK);
  sheet.getRow(r).height = 18;
  r++;

  // ── Row 6: Column headers ─────────────────────────────────────────────
  const hRow = sheet.getRow(r);
  hRow.height = 22;
  styleHeaderCell(hRow.getCell(1), 'SR NO.');
  sheet.mergeCells(r, 2, r, 3);
  styleHeaderCell(hRow.getCell(2), 'Characteristics');
  styleHeaderCell(hRow.getCell(4), 'Specification');
  styleHeaderCell(hRow.getCell(5), 'Mode Of Checking');
  sheet.mergeCells(r, 6, r, 10);
  styleHeaderCell(hRow.getCell(6), 'Actual Observations');
  styleHeaderCell(hRow.getCell(11), 'Product Status');
  styleHeaderCell(hRow.getCell(12), 'Remark');
  r++;

  // ── Row 7: Observation sub-headers 1–5 ───────────────────────────────
  const obsRow = sheet.getRow(r);
  obsRow.height = 18;
  sheet.mergeCells(r, 2, r, 3);
  [1, 2, 3, 4, 5].forEach((n, i) => {
    const cell = obsRow.getCell(6 + i);
    cell.value     = n;
    cell.font      = { bold: true, size: 9, name: 'Arial', color: { argb: NAVY } };
    cell.alignment = centerAlign();
    cell.fill      = lightFill();
    applyBorder(cell, BORDER_DARK);
  });
  [1, 2, 3, 4, 5, 11, 12].forEach(c => {
    const cell = obsRow.getCell(c);
    cell.fill = greyFill();
    applyBorder(cell, BORDER_LIGHT);
  });
  r++;

  // ── Build dynamic observation values ─────────────────────────────────
  const tubeLengthBase  = parseInt(spec.tubeLength, 10);
  // Strip ±tolerance suffix (e.g. "3392±5" → 3392) then apply ±1 random
  const totalLengthBase = parseTotalLength(spec.totalLength);

  // For INTEGRATED: tube length is IDENTICAL across all samples (no random variation)
  const isIntegrated = partType === 'INTEGRATED';

  // tubeLength  → ±1  (range 1)
  // totalLength → ±2  (range 2)
  // If the base value is 0 or NaN, randomVariant returns 0 as-is.
  const tubeLengths  = isIntegrated
    ? Array(sampleSize).fill(tubeLengthBase === 0 || isNaN(tubeLengthBase) ? 0 : tubeLengthBase)
    : Array.from({ length: sampleSize }, () => randomVariant(tubeLengthBase, 1));
  const totalLengths = Array.from({ length: sampleSize }, () => randomVariant(totalLengthBase, 2));
  const scannedTexts = sampleRecords.map(rec => rec.scanned_text ?? 'Ok');

  const greaseVal     = spec.greaseableOrNonGreaseable   || 'NON GREASABLE';
  const tubeOD        = spec.tubeDiameter                || 'As per control plan';
  const cbKit         = spec.cbKitDetails                || 'As per Control Plan';
  const couplingOri   = spec.couplingFlangeOrientations  || '90';
  const deadener      = spec.availableNoiseDeadener      || 'No';
  const flangeYoke    = spec.mountingDetailsFlangeYoke   || 'As per control plan';
  const couplingFlange= spec.mountingDetailsCouplingFlange|| 'COUPLING YOKE';

  // helper to pad obs array to sampleSize
  const obs = (val) => Array(sampleSize).fill(val);

  // ── FRONT / MIDDLE: 25 check rows ────────────────────────────────────
  if (partType === 'FRONT' || partType === 'MIDDLE') {
    const checks = [
      [1,  'Tube Length',
            'As per Control Plan', 'Measuring Tape',
            tubeLengths, 'All Shaft Found of ok', 'Checked in process/poka yoke Control'],
      [2,  'Matching of Tube Length in Bar Code /QR Code Sticker & actual',
            'Match tube length with QR Sticker', 'Visual',
            obs('OK'), 'All Shaft Found of ok', ''],
      [3,  'Bar Code / QR Code Sticker Proper Scanning',
            'Checked Part Number, Drawing Modification no and date', 'Barcode/ QR Code Scanner',
            scannedTexts, 'All Shaft Found of ok', ''],
      [4,  'Total Flange to Flange Length In Closed Condition (CLOSE LENGTH BATCH WISE 1PCS)',
            'As per Control Plan', 'Measuring Tape',
            totalLengths, 'All Shaft Found of ok', 'Checked in process/poka yoke Control'],
      [5,  'Type of Centre Bearing Kit',
            'As per Control Plan', 'Visual',
            obs(cbKit), 'All Shaft Found of ok', ''],
      [6,  'Rotary Movement Of Centre Bearing Kit',
            'No jamming of center Brg.Rotation', 'Hand Feel',
            obs('OK'), 'All Shaft Found of ok', ''],
      [7,  'Coupling Flange Orientations (As per QA Alert)',
            'As per Control Plan (checked Mounting hole Orientatio)', 'Visual',
            obs(couplingOri), 'All Shaft Found of ok', ''],
      [8,  'UJ Movement (Smooth)',
            'Proper And Equal Freeness', 'Hand Feel/ Torque gauge',
            obs('OK'), 'All Shaft Found of ok', ''],
      [9,  'Circlip Seating/ Circlip Missing',
            'No circlip missing, proper setting and no crack', 'Visual',
            obs('OK'), 'All Shaft Found of ok', ''],
      [10, 'Paint Missing at Slip Area & UJ Area',
            'No paint missing at uj Area, No paint allow in slip joint, grease nipple, and uj area', 'Visual',
            obs('OK'), 'All Shaft Found of ok', ''],
      [11, 'Paint Condition',
            '(No Run Down/Blisters/Patches, No paint allow in center bearing Area)', 'Visual',
            obs('OK'), 'All Shaft Found of ok', ''],
      [12, 'Anti Rust Oil @ Machining Area',
            'No anti rust oil missing in machining Area', 'Visual',
            obs('OK'), 'All Shaft Found of ok', ''],
      [13, 'Locking of Cheknuts',
            'Hex Nut lock by punching', 'Visual',
            obs('OK'), 'All Shaft Found of ok', ''],
      [14, 'Proper Adhesion on Painted Surface (4B)',
            'No Paint peel off Allow On Prop Shaft', 'Visual (As Per Standard)',
            obs('OK'), 'All Shaft Found of ok', ''],
      [15, 'Rust free',
            'No Rust allow on prop shaft', 'Visual',
            obs('OK'), 'All Shaft Found of ok', ''],
      [16, 'No Welding Defect',
            'No Blow hole, porosity, spatter, under cut allow', 'Visual',
            obs('OK'), 'All Shaft Found of ok', ''],
      [17, 'Proper Seating of Balancing Weight Condition On Tube',
            'Proper setting', 'Visual Checked By hammer',
            obs('OK'), 'All Shaft Found of ok', ''],
      [18, 'Grease Nipple Condition & Status',
            'No freeness and loose', 'Visual',
            obs(greaseVal), 'All Shaft Found of ok', ''],
      [19, 'Ensure Greasing at All Arms Of UJ',
            'As per control plan', 'Visual',
            obs(greaseVal), 'All Shaft Found of ok', ''],
      [20, 'Mounting Hole Centre Distances',
            'As per control plan', 'Vernier/ Checking Fixture',
            obs('OK'), 'All Shaft Found of ok', 'As per control plan'],
      [21, 'Flange yoke Serration teeth (Ø180/Ø150/Ø120, 4-holes)',
            'As per control plan', 'Mating Part',
            obs(flangeYoke), 'All Shaft Found of ok', 'As per control plan'],
      [22, 'PCD (Both Side) Drill Hole (4 nos)',
            'As per control plan', 'Checking Fixture/Round plug Gauge',
            obs('OK'), 'All Shaft Found of ok', 'Incoming control (Checked on Sampling plan)'],
      [23, 'PCD',
            'As per control plan', 'Checking Fixture',
            obs('OK'), 'All Shaft Found of ok', 'Incoming control (Checked on Sampling plan)'],
      [24, 'Tube OD',
            'As per control plan', 'Vernier /snap gauge',
            obs(tubeOD), 'All Shaft Found of ok', ''],
      [25, 'Deadener available',
            'As per control plan', 'Sound detect',
            obs(deadener), 'All Shaft Found of ok', ''],
    ];
    checks.forEach(([sr, char, sp, mode, ob, status, rem]) => {
      writePDIRow(sheet, r, sr, char, sp, mode, ob, status, rem); r++;
    });

  } else if (partType === 'INTEGRATED') {
    // ── INTEGRATED: 27 check rows ─────────────────────────────────────
    // Tube lengths 2 & 3 are individual tube lengths; same value for all samples
    const tubeLenFront = tubeLengthBase;
    const tubeLenRear  = parseInt(spec.tubeLengthRear, 10) || tubeLengthBase;
    const checks = [
      [1,  'Stickering in propeller shaft.',
            'As per control plan', 'Visually',
            obs('ok'), 'All shaft found ok', 'checked in process/poka yoke control'],
      [2,  'Propeller shaft tube Length (Front)',
            'As per control plan', 'Measuring Tape',
            obs(tubeLenFront), 'All shaft found ok', 'checked in process/poka yoke control'],
      [3,  'Propeller shaft tube Length (Rear)',
            'As per control plan', 'Measuring Tape',
            obs(tubeLenRear), 'All shaft found ok', 'checked in process/poka yoke control'],
      [4,  'Total Flange to Flange Length In Closed Condition (CLOSE LENGTH BATCH WISE 1PCS)',
            'As per control plan', 'Measuring Tape',
            totalLengths, 'All shaft found ok', 'checked in process/poka yoke control'],
      [5,  'No jamming of center Brg rotation',
            'As per control plan', 'Hand Feeling',
            obs('ok'), 'All shaft found ok', ''],
      [6,  'Long Fork Sliding movement',
            'Smooth slide movement', 'Hand Feeling',
            obs('ok'), 'All shaft found ok', ''],
      [7,  'No welding defect (Blow hole, porosity, spatters etc)',
            'No Blow hole, porosity, spatter, under cut allow', 'Visually',
            obs('ok'), 'All shaft found ok', ''],
      [8,  'No grease nipple missing, broken, loose',
            'No free ness and loose', 'Hand Feeling, Visual',
            obs('ok'), 'All shaft found ok', ''],
      [9,  'No circlip missing/crack',
            'No circlip missing, proper setting and no crack', 'visual',
            obs('ok'), 'All shaft found ok', ''],
      [10, 'No paint missing at UJ Area',
            'No paint missing at uj Area, No paint allow in slip joint, grease nipple, cb and uj area', 'visual',
            obs('ok'), 'All shaft found ok', ''],
      [11, 'Paint Quality (No rundown, No blister)',
            'No paint missing at uj Area, No Rundown, No Blister', 'visual',
            obs('ok'), 'All shaft found ok', ''],
      [12, 'Antirust at machining area',
            'No anti rust oil missing in machining Area', 'visual',
            obs('ok'), 'All shaft found ok', ''],
      [13, 'Arrow mark punch',
            'for Check Same plane', 'Visual',
            obs('ok'), 'All shaft found ok', ''],
      [14, 'No mismatch of Bracket hole & clamp hole',
            'As per control plan', 'By putting plug gauge',
            obs('ok'), 'All shaft found ok', ''],
      [15, 'Locking of check nut',
            'As per control plan', 'Visual',
            obs('ok'), 'All shaft found ok', ''],
      [16, 'Ensure the same Sl. No, Year and Month code. On both short fork',
            'Checked Part Number Drawing modification no and date', 'visual',
            obs('ok'), 'All shaft found ok', ''],
      [17, 'Coupling flange orientation: change only tube length (See the BOM dashboard software)',
            'As per Control Plan (checked Mounting hole Orientatio)', 'visual',
            obs(couplingOri), 'All shaft found ok', ''],
      [18, 'Ensure Orientation of two hook',
            'As per control plan', 'visual',
            obs('ok'), 'All shaft found ok', ''],
      [19, 'Ensure the Grease nipple cap (U.J)',
            'As per control plan', 'visual',
            obs('OK'), 'All shaft found ok', ''],
      [20, 'Ensure Greasing at All Arms Of UJ',
            'As per control plan', 'Visual',
            obs(greaseVal), 'All shaft found ok', ''],
      [21, 'Ensure Flange yoke dia (150, 120 dia, /4 holes)',
            'As per control plan', 'Matching Part',
            obs(flangeYoke), 'All shaft found ok', 'incoming control (checked on Sampling plan)'],
      [22, 'Coupling Flange Dia (150, 120 dia /4 holes)',
            'As per control plan', 'Matching Part',
            obs(couplingFlange), 'All shaft found ok', 'incoming control (checked on Sampling plan)'],
      [23, 'Rust free',
            'No Rust allow on prop shaft', 'visual',
            obs('OK'), 'All shaft found ok', ''],
      [24, 'Drill Hole (4 nos) (Both Side)',
            'As per control plan', 'Checking Pin /Round plug Gauge',
            obs('ok'), 'All shaft found ok', 'incoming control (checked on Sampling plan)'],
      [25, 'PCD (Both Side)',
            'As per control plan', 'Checking Fixture',
            obs('ok'), 'All shaft found ok', 'incoming control (checked on Sampling plan)'],
      [26, 'Tube OD',
            'As per control plan', 'Vernier/snap gauge',
            obs(tubeOD), 'All shaft found ok', ''],
      [27, 'Deadener available',
            'As per control plan', 'Sound detect',
            obs(deadener), 'All shaft found ok', ''],
    ];
    checks.forEach(([sr, char, sp, mode, ob, status, rem]) => {
      writePDIRow(sheet, r, sr, char, sp, mode, ob, status, rem); r++;
    });

  } else {
    // ── REAR: 23 check rows ───────────────────────────────────────────
    const checks = [
      [1,  'Tube Length',
            'AS per control plan', 'Measuring Tape',
            tubeLengths, 'All Shaft Found of ok', 'Checked in process/poka yoke Control'],
      [2,  'Matching of Tube Length in QR Code Sticker & actual',
            'Match tube length with QR Sticker', 'Visual',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [3,  'QR Code Sticker Proper Scanning',
            'Checked Part Number, Drawing Modification no and date', 'Barcode/ QR Code Scanner',
            scannedTexts, 'All Shaft Found of ok', ''],
      [4,  'Total Flange to Flange Length In Closed Condition (CLOSE LENGTH BATCH WISE 1PCS)',
            'AS per control plan', 'Measuring Tape',
            totalLengths, 'All Shaft Found of ok', 'Checked in process/poka yoke Control'],
      [5,  'To Maintain the Opening of Slide Joint for easy Fitment @ Customer end',
            'As per requirement Match With visual alert', 'Visual/Gauge',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [6,  'Long Fork Slide Movement (Smooth/Free)',
            'Smooth Slide Movement', 'Hand Feel',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [7,  'Position of Both End Eye Hole Centre Line.',
            'Aligned (check Orientation OF Mounting Hole)', 'Visual',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [8,  'UJ Movement (Smooth)',
            'Proper And Equal Freeness', 'Hand Feel',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [9,  'Circlip Seating/ Circlip Missing',
            'No circlip missing, proper setting and no crack', 'Visual',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [10, 'No paint missing at slip joint area, UJ Area',
            'No paint missing at uj Area, No paint allow in slip joint, grease nipple, cb and uj area', 'Visual',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [11, 'Paint Condition',
            '(No Run Down/Blisters/Patches)', 'Visual',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [12, 'Anti Rust Oil @ Machining Area',
            'No anti rust oil missing in machining Area', 'Visual',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [13, 'Proper Adhesion on Painted Surface (4B)',
            'No Paint peel off Allow On Prop Shaft', 'Visual (As Per Standard)',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [14, 'No Welding Defect',
            'No Blow hole, porosity, spatter, under cut allow', 'Visual',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [15, 'Proper Seating of Balancing Weight Condition On Tube',
            'Proper setting', 'Visual',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [16, 'Grease Nipple Condition & Status',
            'No freeness and loose', 'Visual',
            obs('OK'), 'All Shaft Found of ok', ''],
      [17, 'Arrow Mark Punch',
            'For Check Same plane', 'Visual',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [18, 'Ensure Greasing at All Arms Of UJ',
            'AS per control plan', 'Visual',
            obs(greaseVal), 'All Shaft Found of ok', ''],
      [19, 'Rust free',
            'No Rust allow on prop shaft', 'Visual',
            obs('Ok'), 'All Shaft Found of ok', ''],
      [20, 'Flange yoke Serration teeth (Ø180/Ø150/Ø120, 4-holes)',
            'As per control plan', 'Mating Part',
            obs(flangeYoke), 'All Shaft Found of ok', 'As per control plan'],
      [21, 'PCD (Both Side) Drill Hole (4 nos)',
            'AS per control plan', 'Checking Fixture/Round plug Gauge',
            obs('Ok'), 'All Shaft Found of ok', 'Incoming control (Checked on Sampling plan)'],
      [22, 'Tube OD',
            'AS per control plan', 'Vernier/snap gauge',
            obs(tubeOD), 'All Shaft Found of ok', ''],
      [23, 'Deadener available',
            'AS per control plan', 'Sound detect',
            obs(deadener), 'All Shaft Found of ok', ''],
    ];
    checks.forEach(([sr, char, sp, mode, ob, status, rem]) => {
      writePDIRow(sheet, r, sr, char, sp, mode, ob, status, rem); r++;
    });
  }

  // ── Footer rows ───────────────────────────────────────────────────────
  r++; r++;

  sheet.mergeCells(r, 1, r, 12);
  const remCell = sheet.getCell(r, 1);
  remCell.value = 'Remarks :- (IF ANY)'; remCell.font = { bold: true, size: 10, name: 'Arial' };
  remCell.alignment = leftAlign(); remCell.fill = lightFill(); applyBorder(remCell, BORDER_DARK);
  sheet.getRow(r).height = 20; r++;

  sheet.mergeCells(r, 1, r, 3);
  const chkCell = sheet.getCell(r, 1);
  chkCell.value = `CHECKED BY (SIGNATURE):-  ${checkedByName.toUpperCase()}`;
  chkCell.font = { bold: true, size: 9, name: 'Arial' }; chkCell.alignment = leftAlign();
  chkCell.fill = lightFill(); applyBorder(chkCell, BORDER_DARK);

  const dateL = sheet.getCell(r, 4);
  dateL.value = 'Date'; dateL.font = { bold: true, size: 9, name: 'Arial' };
  dateL.alignment = centerAlign(); dateL.fill = lightFill(); applyBorder(dateL, BORDER_DARK);

  const dateV = sheet.getCell(r, 5);
  dateV.value = reportDate.split('-').reverse().join('/');
  dateV.font = { size: 9, name: 'Arial' }; dateV.alignment = centerAlign();
  dateV.fill = whiteFill(); applyBorder(dateV, BORDER_DARK);

  sheet.mergeCells(r, 6, r, 9);

  sheet.mergeCells(r, 10, r, 12);
  const passCell = sheet.getCell(r, 10);
  passCell.value = 'PASSED DISPATCH (SIGNATURE):  SUDHIR';
  passCell.font = { bold: true, size: 9, name: 'Arial' }; passCell.alignment = leftAlign();
  passCell.fill = greenFill(); applyBorder(passCell, BORDER_DARK);
  sheet.getRow(r).height = 22; r++;

  sheet.mergeCells(r, 1, r, 12);
  const formRow = sheet.getCell(r, 1);
  formRow.value = 'FORM NO :'; formRow.font = { size: 9, name: 'Arial' };
  formRow.alignment = leftAlign(); formRow.fill = greyFill();
  applyBorder(formRow, BORDER_LIGHT); sheet.getRow(r).height = 16;

  // No frozen panes — header is NOT sticky per requirement
  // sheet.views intentionally omitted

  return saveWorkbook(workbook, filename);
}


// ─────────────────────────────────────────────
//  Build Monthly Products Excel
// ─────────────────────────────────────────────
async function buildMonthlyProductsExcel(products, monthLabel, filename) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RSB Report System';
  workbook.created  = new Date();

  const sheet = workbook.addWorksheet('Monthly Products', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  const COLS = 12;

  sheet.mergeCells(1, 1, 1, COLS);
  const tc = sheet.getCell('A1');
  tc.value     = `MONTHLY PRODUCT REPORT — ${monthLabel}`;
  tc.font      = { bold: true, size: 13, color: { argb: WHITE }, name: 'Arial' };
  tc.alignment = centerAlign();
  tc.fill      = navyFill();
  applyBorder(tc, BORDER_DARK);
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, COLS);
  const sc = sheet.getCell('A2');
  sc.value     = `Total Products Created: ${products.length}`;
  sc.font      = { bold: true, size: 11, name: 'Arial' };
  sc.alignment = centerAlign();
  sc.fill      = lightFill();
  sheet.getRow(2).height = 22;

  const headers = [
    { header: '#',              key: 'idx',          width: 5  },
    { header: 'Part Number',    key: 'part_number',  width: 16 },
    { header: 'Customer',       key: 'customer',     width: 22 },
    { header: 'Part Type',      key: 'part_type',    width: 10 },
    { header: 'Series',         key: 'series',       width: 12 },
    { header: 'Description',    key: 'description',  width: 30 },
    { header: 'Tube Length',    key: 'tube_length',  width: 12 },
    { header: 'Total Length',   key: 'total_length', width: 14 },
    { header: 'Tube Diameter',  key: 'tube_dia',     width: 14 },
    { header: 'Status',         key: 'status',       width: 12 },
    { header: 'Created By',     key: 'created_by',   width: 16 },
    { header: 'Created At',     key: 'created_at',   width: 20 },
  ];

  sheet.columns = headers;
  const hRow = sheet.getRow(3);
  hRow.height = 22;
  headers.forEach((h, i) => styleHeaderCell(hRow.getCell(i + 1), h.header));

  products.forEach((p, idx) => {
    const spec = p.specification || {};
    const excelRow = sheet.addRow({
      idx:          idx + 1,
      part_number:  p.part_number ?? '',
      customer:     p.customer ?? '',
      part_type:    spec.partType ?? '',
      series:       spec.series ?? '',
      description:  spec.partDescription ?? '',
      tube_length:  spec.tubeLength ?? '',
      total_length: spec.totalLength ?? '',
      tube_dia:     spec.tubeDiameter ?? '',
      status:       p.status ?? '',
      created_by:   p.created_by ?? '',
      created_at:   p.created_at ? new Date(p.created_at).toLocaleString('en-IN') : '',
    });
    excelRow.height = 18;
    const fill = idx % 2 === 0 ? whiteFill() : lightFill();
    excelRow.eachCell({ includeEmpty: true }, cell => {
      cell.fill      = fill;
      cell.alignment = { vertical: 'middle', wrapText: false };
      cell.border    = { top: BORDER_LIGHT, bottom: BORDER_LIGHT, left: BORDER_LIGHT, right: BORDER_LIGHT };
      cell.font      = { size: 9, name: 'Arial' };
    });
  });

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, activeCell: 'A4' }];
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLS } };

  return saveWorkbook(workbook, filename);
}

// ─────────────────────────────────────────────
//  F1 / F5 scan-text detection helpers
//  F1 and F5 records are excluded from part-number PDI sheets.
// ─────────────────────────────────────────────
function isScanTextF1(scannedText) {
  if (!scannedText) return false;
  return /rev\s*no\s*#/i.test(scannedText) && !scannedText.includes('$');
}

function isScanTextF5(scannedText) {
  if (!scannedText) return false;
  const t = scannedText.trim();
  return (
    t.length === 28 &&
    /^[A-Z0-9]+$/i.test(t) &&
    /^[A-Z]/i.test(t[0]) &&
    t[9] === 'V' &&
    !t.startsWith('00')
  );
}

// ─────────────────────────────────────────────
//  Build per-shift attachments (scan report + PDI per part)
//  PDI per-part sheets: F1 scanned records are excluded
// ─────────────────────────────────────────────
async function buildShiftAttachments(rows, shiftLetter, shiftLabel, reportDate) {
  const { total, passed, failed } = calcStats(rows);

  // ── 1. Full scanned report (ALL records, no F1 exclusion) ─────────────
  const scanFilename = `Scanned_PDI_Report_${shiftLetter}_${reportDate}.xlsx`;
  const scanFilePath = await buildScanExcel(rows, shiftLabel, reportDate, scanFilename);
  const attachments = [ attachmentFromPath(scanFilePath) ];

  // ── 2. Group records by part_no, excluding F1 and F5 for PDI sheets ───
  const partGroups = {};
  for (const row of rows) {
    if (!row.part_no) continue;
    // Skip F1 and F5-format scans for part-number PDI sheets
    if (isScanTextF1(row.scanned_text)) continue;
    if (isScanTextF5(row.scanned_text)) continue;
    if (!partGroups[row.part_no]) partGroups[row.part_no] = [];
    partGroups[row.part_no].push(row);
  }

  const partSummary = [];
  for (const [partNumber, partRecords] of Object.entries(partGroups)) {
    try {
      const product    = await findProductByPartNumber(partNumber);
      const partType   = detectPartType(product);
      const sampleSize = Math.min(partRecords.length, 5);

      const pdiFilename = `PDI_${partType}_${partNumber}_${shiftLetter}_${reportDate}.xlsx`;
      const pdiFilePath = await buildPDIExcel(
        partNumber, partRecords, product, shiftLetter, reportDate, pdiFilename
      );
      attachments.push(attachmentFromPath(pdiFilePath));
      partSummary.push({ partNumber, type: partType, total: partRecords.length, sampleSize });
      console.log(`  [PDI] ${partNumber} (${partType}) — qty:${partRecords.length} sample:${sampleSize} (F1 excluded)`);
    } catch (e) {
      console.error(`  [PDI] Error for ${partNumber}:`, e.message);
    }
  }

  return { attachments, partSummary, total, passed, failed };
}

// ─────────────────────────────────────────────
//  HTML email builders
// ─────────────────────────────────────────────
function shiftEmailHTML({ shiftLabel, reportDate, total, passed, failed, partSummary }) {
  const partRows = partSummary.map(p => `
    <tr>
      <td style="padding:8px;border:1px solid #e0e0e0;">${p.partNumber}</td>
      <td style="padding:8px;text-align:center;border:1px solid #e0e0e0;">${p.type}</td>
      <td style="padding:8px;text-align:center;font-weight:bold;border:1px solid #e0e0e0;">${p.total}</td>
      <td style="padding:8px;text-align:center;color:#2e7d32;border:1px solid #e0e0e0;">${p.sampleSize}</td>
    </tr>`).join('');

  return `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;">
    <div style="background:#1F3864;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h2 style="color:#fff;margin:0;">📊 Shift PDI Production Report</h2>
      <p style="color:#a8c4e0;margin:4px 0 0;">${shiftLabel} &nbsp;|&nbsp; Date: ${reportDate}</p>
    </div>
    <div style="border:1px solid #dce6f1;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
      <p style="color:#333;font-size:14px;">
        Dear Sir,<br/><br/>
        Pre dispatch inspection report part details <strong>${shiftLabel}</strong> on Date <strong>${reportDate}</strong>.<br/>
        Please find the attached Excel reports for this shift.
      </p>

      <h3 style="color:#1F3864;border-bottom:2px solid #dce6f1;padding-bottom:6px;">Part Number Summary</h3>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr style="background:#dce6f1;">
          <th style="padding:10px;text-align:left;border:1px solid #c0cfe4;">Part Number</th>
          <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">Type</th>
          <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">Qty Scanned</th>
          <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">PDI Sample</th>
        </tr>
        ${partRows}
        <tr style="background:#dce6f1;font-weight:bold;">
          <td style="padding:10px;border:1px solid #c0cfe4;" colspan="2">Total</td>
          <td style="padding:10px;text-align:center;border:1px solid #c0cfe4;">${total}</td>
          <td style="padding:10px;text-align:center;border:1px solid #c0cfe4;">
            <span style="color:#2e7d32;">✅ ${passed}</span>
            &nbsp;/&nbsp;
            <span style="color:#c62828;">❌ ${failed}</span>
          </td>
        </tr>
      </table>

      <p style="color:#666;font-size:12px;margin-top:24px;">
        Regards,<br/><strong>RSB Lucknow</strong><br/>
        <em>This is an automated report. Please do not reply.</em>
      </p>
    </div>
  </div>`;
}
function dayEmailHTML({ reportDate, shiftsSummary, total, passed, failed, partSummary, customerSummary }) {
  const shiftRows = shiftsSummary.map(s => `
    <tr>
      <td style="padding:8px;border:1px solid #e0e0e0;">${s.label}</td>
      <td style="padding:8px;text-align:center;font-weight:bold;border:1px solid #e0e0e0;">${s.total}</td>
      <td style="padding:8px;text-align:center;color:#2e7d32;border:1px solid #e0e0e0;">${s.passed}</td>
      <td style="padding:8px;text-align:center;color:#c62828;border:1px solid #e0e0e0;">${s.failed}</td>
    </tr>`).join('');

  const partRows = partSummary.map(p => `
    <tr>
      <td style="padding:8px;border:1px solid #e0e0e0;">${p.partNumber}</td>
      <td style="padding:8px;text-align:center;border:1px solid #e0e0e0;">${p.type}</td>
      <td style="padding:8px;text-align:center;font-weight:bold;border:1px solid #e0e0e0;">${p.total}</td>
    </tr>`).join('');

  // Customer breakdown — shift columns are A / B / C
  const custRows = (customerSummary || []).map(c => `
    <tr>
      <td style="padding:8px;border:1px solid #e0e0e0;font-weight:bold;">${c.customer}</td>
      <td style="padding:8px;text-align:center;font-weight:bold;border:1px solid #e0e0e0;">${c.total}</td>
      <td style="padding:8px;text-align:center;border:1px solid #e0e0e0;">${c.shiftA}</td>
      <td style="padding:8px;text-align:center;border:1px solid #e0e0e0;">${c.shiftB}</td>
      <td style="padding:8px;text-align:center;border:1px solid #e0e0e0;">${c.shiftC}</td>
    </tr>`).join('');

  return `
  <div style="font-family:Arial,sans-serif;max-width:900px;margin:auto;">
    <div style="background:#1F3864;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h2 style="color:#fff;margin:0;">📅 Daily PDI Production Report</h2>
      <p style="color:#a8c4e0;padding-top:5px; padding-bottom:5px;">Date: ${reportDate} &nbsp;|&nbsp; Shifts A + B + C</p>
    </div>
    <div style="border:1px solid #dce6f1;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
      <p style="color:#333;font-size:14px;">
        Dear Sir,<br/><br/>
        Daily scan report for <strong>${reportDate}</strong> covering all 3 shifts (A/B/C).
      </p>

      <!-- ═══ ROW 1: Day Totals | Per Shift Breakdown | Customer Breakdown ═══ -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <!-- COL 1: Day Totals -->
          <td style="width:22%;vertical-align:top;padding-right:10px;">
            <h3 style="color:#1F3864;border-bottom:2px solid #dce6f1;padding-bottom:6px;margin-top:0;">Day Totals</h3>
            <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">
              <tr style="background:#dce6f1;">
                <th style="padding:8px;text-align:left;border:1px solid #c0cfe4;">Metric</th>
                <th style="padding:8px;text-align:center;border:1px solid #c0cfe4;">Count</th>
              </tr>
              <tr>
                <td style="padding:8px;border:1px solid #e0e0e0;">Total</td>
                <td style="padding:8px;text-align:center;font-weight:bold;border:1px solid #e0e0e0;">${total}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding:8px;border:1px solid #e0e0e0;">✅ Pass</td>
                <td style="padding:8px;text-align:center;color:#2e7d32;font-weight:bold;border:1px solid #e0e0e0;">${passed}</td>
              </tr>
              <tr>
                <td style="padding:8px;border:1px solid #e0e0e0;">❌ Fail</td>
                <td style="padding:8px;text-align:center;color:#c62828;font-weight:bold;border:1px solid #e0e0e0;">${failed}</td>
              </tr>
            </table>
          </td>

          <!-- COL 2: Per Shift Breakdown -->
          <td style="width:30%;vertical-align:top;padding:0 10px;">
            <h3 style="color:#1F3864;border-bottom:2px solid #dce6f1;padding-bottom:6px;margin-top:0;">Per Shift Breakdown</h3>
            <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">
              <tr style="background:#dce6f1;">
                <th style="padding:8px;text-align:left;border:1px solid #c0cfe4;">Shift</th>
                <th style="padding:8px;text-align:center;border:1px solid #c0cfe4;">Total</th>
                <th style="padding:8px;text-align:center;border:1px solid #c0cfe4;">Pass</th>
                <th style="padding:8px;text-align:center;border:1px solid #c0cfe4;">Fail</th>
              </tr>
              ${shiftRows}
            </table>
          </td>

          <!-- COL 3: Customer Breakdown -->
          <td style="width:48%;vertical-align:top;padding-left:10px;">
            <h3 style="color:#1F3864;border-bottom:2px solid #dce6f1;padding-bottom:6px;margin-top:0;">Customer Breakdown</h3>
            <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">
              <tr style="background:#dce6f1;">
                <th style="padding:8px;text-align:left;border:1px solid #c0cfe4;">Customer</th>
                <th style="padding:8px;text-align:center;border:1px solid #c0cfe4;">Total</th>
                <th style="padding:8px;text-align:center;border:1px solid #c0cfe4;">Shift&nbsp;A</th>
                <th style="padding:8px;text-align:center;border:1px solid #c0cfe4;">Shift&nbsp;B</th>
                <th style="padding:8px;text-align:center;border:1px solid #c0cfe4;">Shift&nbsp;C</th>
              </tr>
              ${custRows}
            </table>
          </td>
        </tr>
      </table>

      <!-- ═══ Part Number Summary ═══ -->
      <h3 style="color:#1F3864;border-bottom:2px solid #dce6f1;padding-bottom:6px;">Part Number Summary</h3>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr style="background:#dce6f1;">
          <th style="padding:10px;text-align:left;border:1px solid #c0cfe4;">Part Number</th>
          <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">Type</th>
          <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">Qty Scanned</th>
        </tr>
        ${partRows}
      </table>

      <p style="color:#666;font-size:12px;margin-top:24px;">
        Regards,<br/><strong>RSB Lucknow</strong><br/>
        <em>This is an automated report. Please do not reply.</em>
      </p>
    </div>
  </div>`;
}

function monthlyEmailHTML({ monthLabel, total, passed, failed, partSummary }) {
  const partRows = partSummary.map(p => `
    <tr>
      <td style="padding:8px;border:1px solid #e0e0e0;">${p.partNumber}</td>
      <td style="padding:8px;text-align:center;border:1px solid #e0e0e0;">${p.type}</td>
      <td style="padding:8px;text-align:center;font-weight:bold;border:1px solid #e0e0e0;">${p.total}</td>
    </tr>`).join('');

  return `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;">
    <div style="background:#1F3864;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h2 style="color:#fff;margin:0;">📆 Monthly Scan Report</h2>
      <p style="color:#a8c4e0;margin:4px 0 0;">Month: ${monthLabel}</p>
    </div>
    <div style="border:1px solid #dce6f1;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
      <p style="color:#333;font-size:14px;">
        Dear Sir,<br/><br/>
        Monthly scan report for <strong>${monthLabel}</strong>.
      </p>
      <h3 style="color:#1F3864;border-bottom:2px solid #dce6f1;padding-bottom:6px;">Monthly Summary</h3>
      <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">
        <tr style="background:#dce6f1;">
          <th style="padding:10px;text-align:left;border:1px solid #c0cfe4;">Metric</th>
          <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">Count</th>
        </tr>
        <tr><td style="padding:10px;border:1px solid #e0e0e0;">Total Scanned</td>
            <td style="padding:10px;text-align:center;font-weight:bold;border:1px solid #e0e0e0;">${total}</td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:10px;border:1px solid #e0e0e0;">✅ Passed</td>
            <td style="padding:10px;text-align:center;color:#2e7d32;font-weight:bold;border:1px solid #e0e0e0;">${passed}</td></tr>
        <tr><td style="padding:10px;border:1px solid #e0e0e0;">❌ Failed</td>
            <td style="padding:10px;text-align:center;color:#c62828;font-weight:bold;border:1px solid #e0e0e0;">${failed}</td></tr>
      </table>
      <h3 style="color:#1F3864;border-bottom:2px solid #dce6f1;padding-bottom:6px;">Part Number Summary</h3>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;">
        <tr style="background:#dce6f1;">
          <th style="padding:10px;text-align:left;border:1px solid #c0cfe4;">Part Number</th>
          <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">Type</th>
          <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">Qty Scanned</th>
        </tr>
        ${partRows}
      </table>
      <p style="color:#666;font-size:12px;margin-top:24px;">
        Regards,<br/><strong>RSB Lucknow</strong><br/>
        <em>This is an automated report. Please do not reply.</em>
      </p>
    </div>
  </div>`;
}

function monthlyProductEmailHTML({ monthLabel, total }) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;">
    <div style="background:#1F3864;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h2 style="color:#fff;margin:0;">🏭 Monthly Product Report</h2>
      <p style="color:#a8c4e0;margin:4px 0 0;">Month: ${monthLabel}</p>
    </div>
    <div style="border:1px solid #dce6f1;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
      <p style="color:#333;font-size:14px;">
        Dear Sir,<br/><br/>
        Monthly product creation report for <strong>${monthLabel}</strong>.<br/>
        <strong>Total new products created: ${total}</strong>
      </p>
      <p style="color:#666;font-size:12px;margin-top:24px;">
        Regards,<br/><strong>RSB Lucknow</strong><br/>
        <em>This is an automated report. Please do not reply.</em>
      </p>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
//  CRON JOB 1: shift_scan_report
//  Shift A (06–14) → send at 14:20
//  Shift B (14–22) → send at 22:20
//  Shift C (22–06) → send at 06:20
// ─────────────────────────────────────────────
async function sendShiftReport(shiftIndex) {
  const { from, to, shiftLabel, shiftLetter, reportDate } = getShiftWindow(shiftIndex);
  console.log(`[ShiftReport] ${shiftLabel} | ${from.toISOString()} → ${to.toISOString()}`);

  try {
    const recipients = await getRecipients('shift_scan_report');
    if (!recipients.length) {
      console.warn('[ShiftReport] No recipients for shift_scan_report'); return;
    }

    const rows = await fetchRecords(from, to);
    console.log(`[ShiftReport] Records: ${rows.length}`);

    const { attachments, partSummary, total, passed, failed } =
      await buildShiftAttachments(rows, shiftLetter, shiftLabel, reportDate);

    const html = shiftEmailHTML({ shiftLabel, reportDate, total, passed, failed, partSummary });

    await sendMail({
      to:      recipients,
      subject: `[PDI Shift Report] ${shiftLabel} | ${reportDate}`,
      html,
      attachments,
    });

    console.log(`[ShiftReport] Sent to: ${recipients.join(', ')} | ${attachments.length} attachment(s)`);
  } catch (err) {
    console.error('[ShiftReport] Error:', err);
  }
}

// ─────────────────────────────────────────────
//  CRON JOB 2: day_scan_report
//  Day = 06:00 today → 06:00 next day (3 shifts)
//  Sent at 06:20 each morning for the previous day
// ─────────────────────────────────────────────
async function sendDayReport() {
  const now = new Date();

  // The day just completed: yesterday 06:00 → today 06:00
  const dayEnd   = new Date(now);
  dayEnd.setHours(6, 0, 0, 0);                         // today 06:00
  const dayStart = new Date(dayEnd);
  dayStart.setDate(dayStart.getDate() - 1);             // yesterday 06:00

  const reportDate = dayStart.toISOString().slice(0, 10);
  console.log(`[DayReport] ${reportDate} | ${dayStart.toISOString()} → ${dayEnd.toISOString()}`);

  try {
    const recipients = await getRecipients('day_scan_report');
    if (!recipients.length) {
      console.warn('[DayReport] No recipients for day_scan_report'); return;
    }

    // Fetch all records for the full day
    const allRows = await fetchRecords(dayStart, dayEnd);

    // Build one combined scan excel for the full day
    const dayFilename = `Daily_Scan_Report_${reportDate}.xlsx`;
    const dayFilePath = await buildScanExcel(allRows, `Daily Report — ${reportDate}`, reportDate, dayFilename);

    const { total, passed, failed } = calcStats(allRows);

    // Per-shift breakdown (for email stats table)
    const shiftsSummary = [];
    for (let i = 0; i < SHIFTS.length; i++) {
      const sh = SHIFTS[i];
      let shFrom, shTo;

      if (sh.startHour < sh.endHour) {
        shFrom = new Date(dayStart);
        shFrom.setHours(sh.startHour, 0, 0, 0);
        shTo   = new Date(dayStart);
        shTo.setHours(sh.endHour, 0, 0, 0);
      } else {
        // Night shift spans two calendar days within our window
        shFrom = new Date(dayStart);
        shFrom.setHours(sh.startHour, 0, 0, 0);      // prev-day 22:00
        shTo   = new Date(dayEnd);
        shTo.setHours(sh.endHour, 0, 0, 0);           // today 06:00
      }

      const shRows = allRows.filter(r => {
        const t = new Date(r.created_at).getTime();
        return t >= shFrom.getTime() && t < shTo.getTime();
      });
      const s = calcStats(shRows);
      shiftsSummary.push({ label: sh.label, ...s });
    }

    // Part summary for email
    const partGroups = {};
    for (const row of allRows) {
      if (!row.part_no) continue;
      if (!partGroups[row.part_no]) partGroups[row.part_no] = [];
      partGroups[row.part_no].push(row);
    }
    const partSummary = [];
    for (const [partNumber, recs] of Object.entries(partGroups)) {
      try {
        const product  = await findProductByPartNumber(partNumber);
        const partType = detectPartType(product);
        partSummary.push({ partNumber, type: partType, total: recs.length });
      } catch {
        partSummary.push({ partNumber, type: '—', total: recs.length });
      }
    }

    // ── Customer breakdown: group allRows by customer_name, count per shift ──
    // shiftsSummary indices: 0=A, 1=B, 2=C  (same order as SHIFTS array)
    const custGroups = {};
    for (const row of allRows) {
      const cust = (row.customer_name || 'Unknown').trim();
      if (!custGroups[cust]) custGroups[cust] = { total: 0, shiftA: 0, shiftB: 0, shiftC: 0 };
      custGroups[cust].total++;

      // Determine which shift this record belongs to by checking created_at
      const t = new Date(row.created_at).getTime();
      // Re-use the already-computed shift time windows stored in shiftsSummary
      // Instead, compute shift membership directly:
      const recHour = new Date(row.created_at).getHours();
      if (recHour >= 6  && recHour < 14) custGroups[cust].shiftA++;
      else if (recHour >= 14 && recHour < 22) custGroups[cust].shiftB++;
      else custGroups[cust].shiftC++;            // 22:00–06:00
    }
    const customerSummary = Object.entries(custGroups)
      .sort((a, b) => b[1].total - a[1].total)   // highest volume first
      .map(([customer, s]) => ({ customer, ...s }));

    const html = dayEmailHTML({ reportDate, shiftsSummary, total, passed, failed, partSummary, customerSummary });

    await sendMail({
      to:      recipients,
      subject: `[Daily Scan Report] ${reportDate}`,
      html,
      attachments: [ attachmentFromPath(dayFilePath) ],
    });

    console.log(`[DayReport] Sent to: ${recipients.join(', ')}`);
  } catch (err) {
    console.error('[DayReport] Error:', err);
  }
}

// ─────────────────────────────────────────────
//  CRON JOB 3: monthly_scan_report
//  Covers the entire previous calendar month
//  Sent on the 1st of each month at 06:20
// ─────────────────────────────────────────────
async function sendMonthlyScanReport() {
  const now = new Date();

  // Previous month
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth(),     1, 0, 0, 0, 0);

  const monthLabel = monthStart.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const reportDate = monthStart.toISOString().slice(0, 7);   // e.g. "2026-03"

  console.log(`[MonthlyScan] ${monthLabel}`);

  try {
    const recipients = await getRecipients('monthly_scan_report');
    if (!recipients.length) {
      console.warn('[MonthlyScan] No recipients'); return;
    }

    const rows = await fetchRecords(monthStart, monthEnd);
    const { total, passed, failed } = calcStats(rows);

    const monthScanFilename = `Monthly_Scan_Report_${reportDate}.xlsx`;
    const monthScanFilePath = await buildScanExcel(rows, `Monthly Report — ${monthLabel}`, reportDate, monthScanFilename);

    // Part summary
    const partGroups = {};
    for (const row of rows) {
      if (!row.part_no) continue;
      if (!partGroups[row.part_no]) partGroups[row.part_no] = [];
      partGroups[row.part_no].push(row);
    }
    const partSummary = [];
    for (const [partNumber, recs] of Object.entries(partGroups)) {
      try {
        const product  = await findProductByPartNumber(partNumber);
        const partType = detectPartType(product);
        partSummary.push({ partNumber, type: partType, total: recs.length });
      } catch {
        partSummary.push({ partNumber, type: '—', total: recs.length });
      }
    }

    const html = monthlyEmailHTML({ monthLabel, total, passed, failed, partSummary });

    await sendMail({
      to:      recipients,
      subject: `[Monthly Scan Report] ${monthLabel}`,
      html,
      attachments: [ attachmentFromPath(monthScanFilePath) ],
    });

    console.log(`[MonthlyScan] Sent to: ${recipients.join(', ')}`);
  } catch (err) {
    console.error('[MonthlyScan] Error:', err);
  }
}

// ─────────────────────────────────────────────
//  CRON JOB 4: monthly_product_report
//  Products created in the previous calendar month
//  Sent on the 1st of each month at 06:20
// ─────────────────────────────────────────────
async function sendMonthlyProductReport() {
  const now = new Date();

  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth(),     1, 0, 0, 0, 0);

  const monthLabel = monthStart.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const reportDate = monthStart.toISOString().slice(0, 7);

  console.log(`[MonthlyProducts] ${monthLabel}`);

  try {
    const recipients = await getRecipients('monthly_product_report');
    if (!recipients.length) {
      console.warn('[MonthlyProducts] No recipients'); return;
    }

    const products      = await fetchMonthlyProducts(monthStart, monthEnd);
    const prodFilename  = `Monthly_Product_Report_${reportDate}.xlsx`;
    const prodFilePath  = await buildMonthlyProductsExcel(products, monthLabel, prodFilename);
    const html          = monthlyProductEmailHTML({ monthLabel, total: products.length });

    await sendMail({
      to:      recipients,
      subject: `[Monthly Product Report] ${monthLabel}`,
      html,
      attachments: [ attachmentFromPath(prodFilePath) ],
    });

    console.log(`[MonthlyProducts] Sent to: ${recipients.join(', ')}`);
  } catch (err) {
    console.error('[MonthlyProducts] Error:', err);
  }
}

// ─────────────────────────────────────────────
//  Init all cron jobs (IST timezone)
//
//  shift_scan_report  — 3 jobs, one per shift end
//    Shift A (06–14) → 14:20
//    Shift B (14–22) → 22:20
//    Shift C (22–06) → 06:20
//
//  day_scan_report    — daily at 06:20
//    (previous day 06:00 → today 06:00)
//    NOTE: runs same time as shift C report; order: shift C fires, then day report
//
//  monthly_scan_report    — 1st of month at 06:20
//  monthly_product_report — 1st of month at 06:20
// ─────────────────────────────────────────────
export function initShiftReportCrons() {
  // Shift A ends → 14:20 IST
  cron.schedule('20 14 * * *', () => sendShiftReport(0), { timezone: 'Asia/Kolkata' });

  // Shift B ends → 22:20 IST
  cron.schedule('03 21 * * *', () => sendShiftReport(1), { timezone: 'Asia/Kolkata' });

  // Shift C ends + Day report + Monthly reports → 06:20 IST
  cron.schedule('56 20 * * *', async () => {
    await sendShiftReport(2);          // shift_scan_report for Shift C
    await sendDayReport();             // day_scan_report
  }, { timezone: 'Asia/Kolkata' });

  // Monthly reports fire on 1st of every month at 06:20 IST
  cron.schedule('20 6 1 * *', async () => {
    await sendMonthlyScanReport();
    await sendMonthlyProductReport();
  }, { timezone: 'Asia/Kolkata' });

  console.log('[ShiftReport] ✅ Cron jobs scheduled (IST):');
  console.log('  → Shift A report : 14:20 daily');
  console.log('  → Shift B report : 22:20 daily');
  console.log('  → Shift C report + Day report : 06:20 daily');
  console.log('  → Monthly scan + product reports : 06:20 on 1st of each month');
}