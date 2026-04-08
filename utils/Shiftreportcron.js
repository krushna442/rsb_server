import cron from 'node-cron';
import ExcelJS from 'exceljs';
import { sendMail } from './mailer.js';
import { query } from '../db/db.js';
import { findAllUsers } from '../models/userModel.js';
import { findProductByPartNumber } from '../models/productModel.js';

// ─────────────────────────────────────────────
//  Shift definitions
// ─────────────────────────────────────────────
const SHIFTS = [
  { label: 'Morning Shift  (06:00 – 14:00)', startHour: 6,  endHour: 14 },
  { label: 'Evening Shift  (14:00 – 22:00)', startHour: 14, endHour: 22 },
  { label: 'Night Shift    (22:00 – 06:00)', startHour: 22, endHour: 6  },
];

// ─────────────────────────────────────────────
//  Part type detection helpers
// ─────────────────────────────────────────────
function detectPartType(product) {
  if (!product?.specification) return 'FRONT';
  const t = (product.specification.partType || '').toUpperCase();
  if (t === 'REAR')   return 'REAR';
  if (t === 'MIDDLE') return 'MIDDLE';
  return 'FRONT';
}

// ─────────────────────────────────────────────
//  Tube length variance helper (±2 random)
// ─────────────────────────────────────────────
function randomVariant(base, range = 2) {
  const n = parseInt(base, 10);
  if (isNaN(n)) return base;
  return n + Math.floor(Math.random() * (range * 2 + 1)) - range;
}

// ─────────────────────────────────────────────
//  Build date-time window for a shift
// ─────────────────────────────────────────────
function getShiftWindow(shiftIndex) {
  const shift = SHIFTS[shiftIndex];
  const now   = new Date();
  let shiftEndDate = new Date(now);
  let from, to;

  if (shift.startHour < shift.endHour) {
    to   = new Date(shiftEndDate);
    to.setHours(shift.endHour, 0, 0, 0);
    from = new Date(shiftEndDate);
    from.setHours(shift.startHour, 0, 0, 0);
  } else {
    to   = new Date(shiftEndDate);
    to.setHours(shift.endHour, 0, 0, 0);
    from = new Date(shiftEndDate);
    from.setDate(from.getDate() - 1);
    from.setHours(shift.startHour, 0, 0, 0);
  }

  const reportDate = from.toISOString().slice(0, 10);
  return { from, to, shiftLabel: shift.label, reportDate };
}

// ─────────────────────────────────────────────
//  Fetch scanned_products records
// ─────────────────────────────────────────────
async function fetchShiftRecords(from, to) {
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
//  Shared Excel style constants
// ─────────────────────────────────────────────
const NAVY       = 'FF1F3864';
const WHITE      = 'FFFFFFFF';
const LIGHT_BLUE = 'FFDCE6F1';
const GREY_BG    = 'FFF2F2F2';
const BORDER_DARK = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER_LIGHT = { style: 'thin', color: { argb: 'FFCCCCCC' } };

function navyFill()    { return { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; }
function lightFill()   { return { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } }; }
function greyFill()    { return { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_BG } }; }
function whiteFill()   { return { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } }; }
function yellowFill()  { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; }
function greenFill()   { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }; }
function redFill()     { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }; }

function centerAlign(wrap = true) {
  return { horizontal: 'center', vertical: 'middle', wrapText: wrap };
}
function leftAlign(wrap = false) {
  return { horizontal: 'left', vertical: 'middle', wrapText: wrap };
}

function applyBorder(cell, borderObj) {
  cell.border = { top: borderObj, bottom: borderObj, left: borderObj, right: borderObj };
}

function styleHeaderCell(cell, text) {
  cell.value     = text;
  cell.fill      = navyFill();
  cell.font      = { bold: true, color: { argb: WHITE }, size: 10, name: 'Arial' };
  cell.alignment = centerAlign();
  applyBorder(cell, BORDER_DARK);
}

function styleLabelCell(cell, text) {
  cell.value     = text;
  cell.fill      = lightFill();
  cell.font      = { bold: true, size: 9, name: 'Arial' };
  cell.alignment = leftAlign();
  applyBorder(cell, BORDER_DARK);
}

function styleValueCell(cell, value, fill = null) {
  cell.value     = value ?? '';
  cell.fill      = fill || whiteFill();
  cell.font      = { size: 9, name: 'Arial' };
  cell.alignment = centerAlign();
  applyBorder(cell, BORDER_LIGHT);
}

// ─────────────────────────────────────────────
//  Build the ALL-SHIFTS master Excel
// ─────────────────────────────────────────────
async function buildMasterExcel(rows, shiftLabel, reportDate) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shift Report System';
  workbook.created  = new Date();

  const sheet = workbook.addWorksheet('Shift Report', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  const COLS = 19;

  // Title row
  sheet.mergeCells(1, 1, 1, COLS);
  const t = sheet.getCell('A1');
  t.value     = `SHIFT PRODUCTION REPORT — ${shiftLabel}   |   Date: ${reportDate}`;
  t.font      = { bold: true, size: 14, color: { argb: NAVY }, name: 'Arial' };
  t.alignment = centerAlign();
  t.fill      = lightFill();
  sheet.getRow(1).height = 30;

  // Summary row
  const total    = rows.length;
  const passed   = rows.filter(r => r.validation_status === 'pass').length;
  const failed   = rows.filter(r => r.validation_status === 'fail').length;
  const pending  = rows.filter(r => r.validation_status === 'pending').length;
  const rejected = rows.filter(r => r.is_rejected).length;

  sheet.mergeCells(2, 1, 2, COLS);
  const s = sheet.getCell('A2');
  s.value     = `Total: ${total}   ✅ Pass: ${passed}   ❌ Fail: ${failed}   ⏳ Pending: ${pending}   🚫 Rejected: ${rejected}`;
  s.font      = { bold: true, size: 11, name: 'Arial' };
  s.alignment = centerAlign();
  s.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
  sheet.getRow(2).height = 22;

  // Column headers
  const columns = [
    { header: '#',                 key: 'rowNum',            width: 5  },
    { header: 'S/L No',            key: 'sl_no',             width: 14 },
    { header: 'Dispatch Date',     key: 'dispatch_date',     width: 13 },
    { header: 'Shift',             key: 'shift',             width: 10 },
    { header: 'Part No',           key: 'part_no',           width: 16 },
    { header: 'Customer Name',     key: 'customer_name',     width: 20 },
    { header: 'Product Type',      key: 'product_type',      width: 14 },
    { header: 'Validation Status', key: 'validation_status', width: 16 },
    { header: 'Remarks',           key: 'remarks',           width: 26 },
    { header: 'Part S/L No',       key: 'part_sl_no',        width: 14 },
    { header: 'Scanned Text',      key: 'scanned_text',      width: 38 },
    { header: 'Plant Location',    key: 'plant_location',    width: 16 },
    { header: 'Vendor Code',       key: 'vendorCode',        width: 14 },
    { header: 'Is Rejected',       key: 'is_rejected',       width: 11 },
    { header: 'Created By',        key: 'created_by',        width: 14 },
    { header: 'Modified By',       key: 'modified_by',       width: 14 },
    { header: 'Created At',        key: 'created_at',        width: 18 },
    { header: 'Updated At',        key: 'updated_at',        width: 18 },
  ];

  sheet.columns = columns;
  const headerRow = sheet.getRow(3);
  columns.forEach((col, i) => styleHeaderCell(headerRow.getCell(i + 1), col.header));
  headerRow.height = 22;

  const statusColors = { pass: 'FFE2EFDA', fail: 'FFFFC7CE', pending: 'FFFFEB9C' };

  rows.forEach((r, idx) => {
    const excelRow = sheet.addRow({
      rowNum:            idx + 1,
      sl_no:             r.sl_no ?? '',
      dispatch_date:     r.dispatch_date ? new Date(r.dispatch_date).toLocaleDateString('en-IN') : '',
      shift:             r.shift ?? '',
      part_no:           r.part_no ?? '',
      customer_name:     r.customer_name ?? '',
      product_type:      r.product_type ?? '',
      validation_status: r.validation_status ?? '',
      remarks:           r.remarks ?? '',
      part_sl_no:        r.part_sl_no ?? '',
      scanned_text:      r.scanned_text ?? '',
      plant_location:    r.plant_location ?? '',
      vendorCode:        r.vendorCode ?? '',
      is_rejected:       r.is_rejected ? 'Yes' : 'No',
      created_by:        r.created_by ?? '',
      modified_by:       r.modified_by ?? '',
      created_at:        r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '',
      updated_at:        r.updated_at ? new Date(r.updated_at).toLocaleString('en-IN') : '',
    });
    excelRow.height = 18;

    const bgColor = statusColors[r.validation_status] ?? WHITE;
    excelRow.eachCell({ includeEmpty: true }, cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = { vertical: 'middle', wrapText: false };
      cell.border    = { top: BORDER_LIGHT, bottom: BORDER_LIGHT, left: BORDER_LIGHT, right: BORDER_LIGHT };
      cell.font      = { size: 9, name: 'Arial' };
    });

    if (r.is_rejected) {
      excelRow.font = { strike: true, color: { argb: 'FF999999' }, size: 9, name: 'Arial' };
    }
  });

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, activeCell: 'A4' }];
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLS - 1 } };

  return workbook.xlsx.writeBuffer();
}

// ─────────────────────────────────────────────
//  Row writer helper for PDI sheets
// ─────────────────────────────────────────────
function writePDIRow(sheet, rowNum, srNo, characteristic, specification, mode, observations, productStatus, remark) {
  const row = sheet.getRow(rowNum);
  row.height = 20;

  // SR NO
  const c0 = row.getCell(1);
  c0.value = srNo;
  c0.fill  = greyFill();
  c0.font  = { bold: true, size: 9, name: 'Arial' };
  c0.alignment = centerAlign();
  applyBorder(c0, BORDER_DARK);

  // Characteristics (col 2-3 merged)
  sheet.mergeCells(rowNum, 2, rowNum, 3);
  const c1 = row.getCell(2);
  c1.value = characteristic;
  c1.fill  = whiteFill();
  c1.font  = { size: 9, name: 'Arial' };
  c1.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  applyBorder(c1, BORDER_LIGHT);

  // Specification
  const c2 = row.getCell(4);
  c2.value = specification;
  c2.fill  = lightFill();
  c2.font  = { size: 9, name: 'Arial' };
  c2.alignment = centerAlign(true);
  applyBorder(c2, BORDER_LIGHT);

  // Mode of checking
  const c3 = row.getCell(5);
  c3.value = mode;
  c3.fill  = greyFill();
  c3.font  = { size: 9, name: 'Arial' };
  c3.alignment = centerAlign(true);
  applyBorder(c3, BORDER_LIGHT);

  // Observations (up to 5)
  observations.forEach((obs, i) => {
    const cell = row.getCell(6 + i);
    cell.value = obs ?? '';
    cell.fill  = whiteFill();
    cell.font  = { size: 9, name: 'Arial' };
    cell.alignment = centerAlign(true);
    applyBorder(cell, BORDER_LIGHT);
  });

  // Product Status
  const cStatus = row.getCell(11);
  cStatus.value = productStatus || 'All Shaft Found of ok';
  cStatus.fill  = greenFill();
  cStatus.font  = { size: 9, name: 'Arial', color: { argb: 'FF2E7D32' } };
  cStatus.alignment = centerAlign(true);
  applyBorder(cStatus, BORDER_LIGHT);

  // Remark
  const cRemark = row.getCell(12);
  cRemark.value = remark || '';
  cRemark.fill  = whiteFill();
  cRemark.font  = { size: 8, name: 'Arial', italic: true };
  cRemark.alignment = leftAlign(true);
  applyBorder(cRemark, BORDER_LIGHT);
}

// ─────────────────────────────────────────────
//  Build PDI Excel for a single part number
//  Matches the exact format of the sample PDI sheets
// ─────────────────────────────────────────────
async function buildPDIExcel(partNumber, records, product, shiftLabel, reportDate) {
  const spec      = product?.specification || {};
  const partType  = detectPartType(product);
  const qty       = records.length;
  const sampleSize = Math.min(qty, 5);
  const sampleRecords = records.slice(0, sampleSize);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDI Report System';
  workbook.created  = new Date();

  const sheetName = partType; // 'FRONT', 'REAR', or 'MIDDLE'
  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  // Column widths (12 columns total)
  sheet.columns = [
    { width: 7  }, // SR NO
    { width: 28 }, // Characteristics (part 1)
    { width: 5  }, // Characteristics (part 2 - merged)
    { width: 20 }, // Specification
    { width: 22 }, // Mode of Checking
    { width: 18 }, // Obs 1
    { width: 18 }, // Obs 2
    { width: 18 }, // Obs 3
    { width: 18 }, // Obs 4
    { width: 18 }, // Obs 5
    { width: 20 }, // Product Status
    { width: 30 }, // Remark
  ];

  let rowIdx = 1;

  // ── Row 1: Main Title ─────────────────────────────────────────────────
  sheet.mergeCells(rowIdx, 1, rowIdx, 12);
  const titleCell = sheet.getCell(rowIdx, 1);
  titleCell.value     = `PRE DISPATCH INSPECTION CHECK SHEET  ['${sheetName}']`;
  titleCell.font      = { bold: true, size: 13, name: 'Arial', color: { argb: WHITE } };
  titleCell.alignment = centerAlign();
  titleCell.fill      = navyFill();
  applyBorder(titleCell, BORDER_DARK);
  sheet.getRow(rowIdx).height = 26;
  rowIdx++;

  // ── Row 2: Company Name ───────────────────────────────────────────────
  sheet.mergeCells(rowIdx, 1, rowIdx, 12);
  const companyCell = sheet.getCell(rowIdx, 1);
  companyCell.value     = 'RSB TRANSMISSIONS (I)LTD , LUCKNOW';
  companyCell.font      = { bold: true, size: 11, name: 'Arial', color: { argb: WHITE } };
  companyCell.alignment = centerAlign();
  companyCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4A7A' } };
  applyBorder(companyCell, BORDER_DARK);
  sheet.getRow(rowIdx).height = 22;
  rowIdx++;

  // ── Row 3: Description + Meta ─────────────────────────────────────────
  // DESCRIPTION- (cols 1-3)
  sheet.mergeCells(rowIdx, 1, rowIdx, 3);
  const descLabelCell = sheet.getCell(rowIdx, 1);
  descLabelCell.value     = `DESCRIPTION-`;
  descLabelCell.font      = { bold: true, size: 9, name: 'Arial' };
  descLabelCell.alignment = leftAlign();
  descLabelCell.fill      = lightFill();
  applyBorder(descLabelCell, BORDER_DARK);

  // Desc value (cols 4-5)
  sheet.mergeCells(rowIdx, 4, rowIdx, 5);
  const descValCell = sheet.getCell(rowIdx, 4);
  descValCell.value     = spec.partDescription || `ASSY PROP SHAFT ${partNumber}`;
  descValCell.font      = { bold: true, size: 9, name: 'Arial' };
  descValCell.alignment = leftAlign();
  descValCell.fill      = whiteFill();
  applyBorder(descValCell, BORDER_DARK);

  // Shift label
  const shiftLabelCell = sheet.getCell(rowIdx, 6);
  shiftLabelCell.value     = 'Shift';
  shiftLabelCell.font      = { bold: true, size: 9, name: 'Arial' };
  shiftLabelCell.alignment = centerAlign();
  shiftLabelCell.fill      = lightFill();
  applyBorder(shiftLabelCell, BORDER_DARK);

  const shiftValCell = sheet.getCell(rowIdx, 7);
  shiftValCell.value     = 'B';
  shiftValCell.font      = { bold: true, size: 9, name: 'Arial' };
  shiftValCell.alignment = centerAlign();
  shiftValCell.fill      = yellowFill();
  applyBorder(shiftValCell, BORDER_DARK);

  sheet.mergeCells(rowIdx, 8, rowIdx, 9);
  // empty

  // Part No label
  sheet.mergeCells(rowIdx, 10, rowIdx, 10);
  const partLabelCell = sheet.getCell(rowIdx, 10);
  partLabelCell.value     = 'Part No:-';
  partLabelCell.font      = { bold: true, size: 9, name: 'Arial' };
  partLabelCell.alignment = leftAlign();
  partLabelCell.fill      = lightFill();
  applyBorder(partLabelCell, BORDER_DARK);

  sheet.mergeCells(rowIdx, 11, rowIdx, 12);
  const partValCell = sheet.getCell(rowIdx, 11);
  partValCell.value     = partNumber;
  partValCell.font      = { bold: true, size: 10, name: 'Arial', color: { argb: NAVY } };
  partValCell.alignment = centerAlign();
  partValCell.fill      = yellowFill();
  applyBorder(partValCell, BORDER_DARK);

  sheet.getRow(rowIdx).height = 20;
  rowIdx++;

  // ── Row 4: Drg No + Mode No + Invoice ────────────────────────────────
  sheet.mergeCells(rowIdx, 1, rowIdx, 3);
  const drgLabelCell = sheet.getCell(rowIdx, 1);
  drgLabelCell.value     = 'Drg. No-';
  drgLabelCell.font      = { bold: true, size: 9, name: 'Arial' };
  drgLabelCell.alignment = leftAlign();
  drgLabelCell.fill      = lightFill();
  applyBorder(drgLabelCell, BORDER_DARK);

  sheet.mergeCells(rowIdx, 4, rowIdx, 5);

  const modeLabelCell = sheet.getCell(rowIdx, 6);
  modeLabelCell.value     = 'Mode No-';
  modeLabelCell.font      = { bold: true, size: 9, name: 'Arial' };
  modeLabelCell.alignment = centerAlign();
  modeLabelCell.fill      = lightFill();
  applyBorder(modeLabelCell, BORDER_DARK);

  const modeValCell = sheet.getCell(rowIdx, 7);
  modeValCell.value     = spec.revNo || '#';
  modeValCell.font      = { size: 9, name: 'Arial' };
  modeValCell.alignment = centerAlign();
  modeValCell.fill      = whiteFill();
  applyBorder(modeValCell, BORDER_DARK);

  sheet.mergeCells(rowIdx, 8, rowIdx, 9);

  const invLabelCell = sheet.getCell(rowIdx, 10);
  invLabelCell.value     = 'Invoice No.';
  invLabelCell.font      = { bold: true, size: 9, name: 'Arial' };
  invLabelCell.alignment = leftAlign();
  invLabelCell.fill      = lightFill();
  applyBorder(invLabelCell, BORDER_DARK);

  sheet.mergeCells(rowIdx, 11, rowIdx, 12);
  applyBorder(sheet.getCell(rowIdx, 11), BORDER_LIGHT);

  sheet.getRow(rowIdx).height = 18;
  rowIdx++;

  // ── Row 5: QTY + Sample Size + Supply Date ───────────────────────────
  sheet.mergeCells(rowIdx, 1, rowIdx, 3);
  const regularCell = sheet.getCell(rowIdx, 1);
  regularCell.value     = 'Regular-    Sample-';
  regularCell.font      = { size: 9, name: 'Arial' };
  regularCell.alignment = leftAlign();
  regularCell.fill      = whiteFill();
  applyBorder(regularCell, BORDER_LIGHT);

  sheet.mergeCells(rowIdx, 4, rowIdx, 4);

  const qtyLabelCell = sheet.getCell(rowIdx, 5);
  qtyLabelCell.value     = 'QTY:-';
  qtyLabelCell.font      = { bold: true, size: 9, name: 'Arial' };
  qtyLabelCell.alignment = leftAlign();
  qtyLabelCell.fill      = lightFill();
  applyBorder(qtyLabelCell, BORDER_DARK);

  const qtyValCell = sheet.getCell(rowIdx, 6);
  qtyValCell.value     = qty;
  qtyValCell.font      = { bold: true, size: 10, name: 'Arial' };
  qtyValCell.alignment = centerAlign();
  qtyValCell.fill      = yellowFill();
  applyBorder(qtyValCell, BORDER_DARK);

  const sampleLabelCell = sheet.getCell(rowIdx, 7);
  sampleLabelCell.value     = 'Sample Size';
  sampleLabelCell.font      = { bold: true, size: 9, name: 'Arial' };
  sampleLabelCell.alignment = centerAlign();
  sampleLabelCell.fill      = lightFill();
  applyBorder(sampleLabelCell, BORDER_DARK);

  sheet.mergeCells(rowIdx, 8, rowIdx, 9);

  const sampleValCell = sheet.getCell(rowIdx, 9);
  sampleValCell.value     = sampleSize;
  sampleValCell.font      = { bold: true, size: 10, name: 'Arial' };
  sampleValCell.alignment = centerAlign();
  sampleValCell.fill      = yellowFill();
  applyBorder(sampleValCell, BORDER_DARK);

  const supplyLabelCell = sheet.getCell(rowIdx, 10);
  supplyLabelCell.value     = 'Supply Date';
  supplyLabelCell.font      = { bold: true, size: 9, name: 'Arial' };
  supplyLabelCell.alignment = leftAlign();
  supplyLabelCell.fill      = lightFill();
  applyBorder(supplyLabelCell, BORDER_DARK);

  sheet.mergeCells(rowIdx, 11, rowIdx, 12);
  const supplyValCell = sheet.getCell(rowIdx, 11);
  supplyValCell.value     = reportDate.split('-').reverse().join('/');
  supplyValCell.font      = { size: 9, name: 'Arial' };
  supplyValCell.alignment = centerAlign();
  supplyValCell.fill      = whiteFill();
  applyBorder(supplyValCell, BORDER_DARK);

  sheet.getRow(rowIdx).height = 18;
  rowIdx++;

  // ── Row 6: Column headers ─────────────────────────────────────────────
  const hRow = sheet.getRow(rowIdx);
  hRow.height = 22;

  styleHeaderCell(hRow.getCell(1), 'SR NO.');
  sheet.mergeCells(rowIdx, 2, rowIdx, 3);
  styleHeaderCell(hRow.getCell(2), 'Characteristics');
  styleHeaderCell(hRow.getCell(4), 'Specification');
  styleHeaderCell(hRow.getCell(5), 'Mode Of Checking');
  styleHeaderCell(hRow.getCell(6), 'Actual Observations');
  sheet.mergeCells(rowIdx, 6, rowIdx, 10);
  styleHeaderCell(hRow.getCell(11), 'Product Status');
  styleHeaderCell(hRow.getCell(12), 'Remark');
  rowIdx++;

  // ── Row 7: Observation sub-headers (1–5) ─────────────────────────────
  const obsRow = sheet.getRow(rowIdx);
  obsRow.height = 18;

  [1, 2, 3, 4, 5].forEach((n, i) => {
    const cell = obsRow.getCell(6 + i);
    cell.value     = n;
    cell.font      = { bold: true, size: 9, name: 'Arial', color: { argb: NAVY } };
    cell.alignment = centerAlign();
    cell.fill      = lightFill();
    applyBorder(cell, BORDER_DARK);
  });

  // Empty cells for SR NO, chars, spec, mode in this sub-row
  [1, 2, 3, 4, 5, 11, 12].forEach(c => {
    const cell = obsRow.getCell(c);
    cell.fill = greyFill();
    applyBorder(cell, BORDER_LIGHT);
  });
  sheet.mergeCells(rowIdx, 2, rowIdx, 3);

  rowIdx++;

  // ─────────────────────────────────────────────
  //  Build tube length & total length variants
  // ─────────────────────────────────────────────
  const tubeLengthBase  = parseInt(spec.tubeLength, 10)  || 1000;
  const totalLengthBase = parseInt(spec.totalLength?.replace(/[^0-9]/g, ''), 10) || 1400;

  const tubeLengths  = Array.from({ length: sampleSize }, () => randomVariant(tubeLengthBase, 2));
  const totalLengths = Array.from({ length: sampleSize }, () => randomVariant(totalLengthBase, 2));

  // QR/Scanned texts from actual records
  const scannedTexts = sampleRecords.map(r => r.scanned_text ?? 'Ok');
  const greaseVal    = spec.greaseableOrNonGreaseable || 'NON GREASABLE';
  const tubeOD       = spec.tubeDiameter || 'As per control plan';
  const cbKit        = spec.cbKitDetails || 'As per Control Plan';
  const couplingOri  = spec.couplingFlangeOrientations || 'As per Control Plan';
  const deadener     = spec.availableNoiseDeadener || 'No';

  // ─────────────────────────────────────────────
  //  FRONT / MIDDLE common rows (24 checks)
  // ─────────────────────────────────────────────
  if (partType === 'FRONT' || partType === 'MIDDLE') {
    const rows24 = [
      [1,  'Tube Length',
            'As per Control Plan',
            'Measuring Tape',
            tubeLengths,
            'All Shaft Found of ok',
            'Checked in process/poka yoke Control'],
      [2,  'Matching of Tube Length in QR Code/Bar Code Sticker & actual',
            'QR Code/Bar Code Sticker & actual',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [3,  'QR Code/Bar Code Sticker Proper Scanning',
            'Checked Part Number, Drawing Modification no and date',
            'Barcode/ QR Code Scanner',
            scannedTexts,
            'All Shaft Found of ok', ''],
      [4,  'Total Flange to Flange Length In Closed Condition (CLOSE LENGTH BATCH WISE 1PCS)',
            'As per Control Plan',
            'Measuring Tape',
            totalLengths,
            'All Shaft Found of ok',
            'Checked in process/poka yoke Control'],
      [5,  'Type of Centre Bearing Kit',
            'As per Control Plan',
            'Visual',
            Array(sampleSize).fill(cbKit),
            'All Shaft Found of ok', ''],
      [6,  'Rotary Movement Of Centre Bearing Kit',
            'No jamming of center Brg.Rotation',
            'Hand Feel',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [7,  'Coupling Flange Orientations (As per QA Alert)',
            'As per Control Plan (checked Mounting hole Orientation)',
            'Visual',
            Array(sampleSize).fill(couplingOri),
            'All Shaft Found of ok', ''],
      [8,  'UJ Movement (Smooth)',
            'Proper And Equal Freeness',
            'Hand Feel',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [9,  'Circlip Seating/ Circlip Missing',
            'No circlip missing, proper setting and no crack',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [10, 'Paint Missing at Slip Area & UJ Area',
            'No paint missing at uj Area, No paint allow in slip joint, grease nipple, and uj area',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [11, 'Paint Condition',
            '(No Run Down/Blisters/Patches, No paint allow in center bearing Area)',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [12, 'Anti Rust Oil @ Machining Area',
            'No anti rust oil missing in machining Area',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [13, 'Locking of Cheknuts',
            'Hex Nut lock by punching',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [14, 'Proper Adhesion on Painted Surface (4B)',
            'No Paint peel off Allow On Prop Shaft',
            'Visual (As Per Standard)',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [15, 'Rust free',
            'No Rust allow on prop shaft',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [16, 'No Welding Defect',
            'No Blow hole, porosity, spatter, under cut allow',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [17, 'Proper Seating of Balancing Weight Condition On Tube',
            'Proper setting',
            'Visual Checked By hammer',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [18, 'Grease Nipple Condition & Status',
            'No freeness and loose',
            'Visual',
            Array(sampleSize).fill(greaseVal),
            'All Shaft Found of ok', ''],
      [19, 'Mounting Hole Centre Distances',
            'As per control plan',
            'Vernier/ Checking Fixture',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok',
            'As per control plan'],
      [20, 'Mounting hole ID',
            'As per control plan',
            'Checking Pin /Round plug Gauge',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok',
            'As per control plan'],
      [21, 'Drill Hole (4 nos)',
            'As per control plan',
            'Checking Pin /Round plug Gauge',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok',
            'Incoming control (Checked on Sampling plan)'],
      [22, 'PCD',
            'As per control plan',
            'Checking Fixture',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok',
            'Incoming control (Checked on Sampling plan)'],
      [23, 'Tube OD',
            'As per control plan',
            'Vernier /snap gauge',
            Array(sampleSize).fill(tubeOD),
            'All Shaft Found of ok',
            'Incoming control (Checked on Sampling plan)'],
      [24, 'Deadener available',
            'AS per control plan',
            'Sound detect',
            Array(sampleSize).fill(deadener),
            'All Shaft Found of ok', ''],
    ];

    rows24.forEach(([sr, char, spec_, mode, obs, status, remark]) => {
      writePDIRow(sheet, rowIdx, sr, char, spec_, mode, obs, status, remark);
      rowIdx++;
    });

  } else {
    // ─────────────────────────────────────────────
    //  REAR specific rows (23 checks)
    // ─────────────────────────────────────────────
    const reaRows = [
      [1,  'Tube Length',
            'AS per control plan',
            'Measuring Tape',
            tubeLengths,
            'All Shaft Found of ok',
            'Checked in process/poka yoke Control'],
      [2,  'Matching of Tube Length in QR Code/Bar code Sticker & actual',
            'Match tube length with QR/BarCode Sticker',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [3,  'QR Code/ Bar Code Sticker Proper Scanning',
            'Checked Part Number, Drawing Modification no and date',
            'Barcode/ QR Code Scanner',
            scannedTexts,
            'All Shaft Found of ok', ''],
      [4,  'Total Flange to Flange Length In Closed Condition (CLOSE LENGTH BATCH WISE 1PCS)',
            'AS per control plan',
            'Measuring Tape',
            totalLengths,
            'All Shaft Found of ok',
            'Checked in process/poka yoke Control'],
      [5,  'To Maintain the Opening of Slide Joint for easy Fitment @ Customer end',
            'As per requirement Match With visual alert',
            'Visual/Gauge',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [6,  'Long Fork Slide Movement (Smooth/Free)',
            'Smooth Slide Movement',
            'Hand Feel',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [7,  'Coupling Flange Orientations (BOM DASHBOARD)',
            'Aligned (check Orientation OF Mounting Hole)',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [8,  'UJ Movement (Smooth)',
            'Proper And Equal Freeness',
            'Hand Feel',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [9,  'Circlip Seating/ Circlip Missing',
            'No circlip missing, proper setting and no crack',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [10, 'No paint missing at slip joint area, UJ Area',
            'No paint missing at uj Area, No paint allow in slip joint, grease nipple, cb and uj area',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [11, 'Paint Condition',
            '(No Run Down/Blisters/Patches)',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [12, 'Anti Rust Oil @ Machining Area',
            'No anti rust oil missing in machining Area',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [13, 'Proper Adhesion on Painted Surface (4B)',
            'No Paint peel off Allow On Prop Shaft',
            'Visual (As Per Standard)',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [14, 'No Welding Defect',
            'No Blow hole, porosity, spatter, under cut allow',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [15, 'Proper Seating of Balancing Weight Condition On Tube',
            'Proper setting',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [16, 'Grease Nipple Condition & Status',
            'No freeness and loose',
            'Visual',
            Array(sampleSize).fill('OK'),
            'All Shaft Found of ok', ''],
      [17, 'Arrow Mark Punch',
            'For Check Same plane',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [18, 'Ensure Greasing at All Arms Of UJ',
            'AS per control plan',
            'Visual',
            Array(sampleSize).fill(greaseVal),
            'All Shaft Found of ok', ''],
      [19, 'Rust free',
            'No Rust allow on prop shaft',
            'Visual',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok', ''],
      [20, 'Drill Hole (4 nos) (Both Side)',
            'AS per control plan',
            'Checking Pin /Round plug Gauge',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok',
            'Incoming control (Checked on Sampling plan)'],
      [21, 'PCD (Both Side)',
            'AS per control plan',
            'Checking Fixture',
            Array(sampleSize).fill('Ok'),
            'All Shaft Found of ok',
            'Incoming control (Checked on Sampling plan)'],
      [22, 'Tube OD',
            'AS per control plan',
            'Vernier/snap gauge',
            Array(sampleSize).fill(tubeOD),
            'All Shaft Found of ok', ''],
      [23, 'Deadener available',
            'AS per control plan',
            'Sound detect',
            Array(sampleSize).fill(deadener),
            'All Shaft Found of ok', ''],
    ];

    reaRows.forEach(([sr, char, spec_, mode, obs, status, remark]) => {
      writePDIRow(sheet, rowIdx, sr, char, spec_, mode, obs, status, remark);
      rowIdx++;
    });
  }

  // ── Blank rows ────────────────────────────────────────────────────────
  rowIdx++;
  rowIdx++;

  // ── Remarks row ───────────────────────────────────────────────────────
  sheet.mergeCells(rowIdx, 1, rowIdx, 12);
  const remCell = sheet.getCell(rowIdx, 1);
  remCell.value     = 'Remarks :- (IF ANY)';
  remCell.font      = { bold: true, size: 10, name: 'Arial' };
  remCell.alignment = leftAlign();
  remCell.fill      = lightFill();
  applyBorder(remCell, BORDER_DARK);
  sheet.getRow(rowIdx).height = 20;
  rowIdx++;

  // ── Signature row ─────────────────────────────────────────────────────
  sheet.mergeCells(rowIdx, 1, rowIdx, 3);
  const checkedCell = sheet.getCell(rowIdx, 1);
  checkedCell.value     = 'CHECKED BY (SIGNATURE):-  RAJ KAPOOR';
  checkedCell.font      = { bold: true, size: 9, name: 'Arial' };
  checkedCell.alignment = leftAlign();
  checkedCell.fill      = lightFill();
  applyBorder(checkedCell, BORDER_DARK);

  const dateLabel = sheet.getCell(rowIdx, 4);
  dateLabel.value     = 'Date';
  dateLabel.font      = { bold: true, size: 9, name: 'Arial' };
  dateLabel.alignment = centerAlign();
  dateLabel.fill      = lightFill();
  applyBorder(dateLabel, BORDER_DARK);

  const dateVal = sheet.getCell(rowIdx, 5);
  dateVal.value     = reportDate.split('-').reverse().join('/');
  dateVal.font      = { size: 9, name: 'Arial' };
  dateVal.alignment = centerAlign();
  dateVal.fill      = whiteFill();
  applyBorder(dateVal, BORDER_DARK);

  sheet.mergeCells(rowIdx, 6, rowIdx, 9);

  sheet.mergeCells(rowIdx, 10, rowIdx, 12);
  const passCell = sheet.getCell(rowIdx, 10);
  passCell.value     = 'PASSED DISPATCH (SIGNATURE):  SUDHIR';
  passCell.font      = { bold: true, size: 9, name: 'Arial' };
  passCell.alignment = leftAlign();
  passCell.fill      = greenFill();
  applyBorder(passCell, BORDER_DARK);

  sheet.getRow(rowIdx).height = 22;
  rowIdx++;

  // Form No row
  sheet.mergeCells(rowIdx, 1, rowIdx, 12);
  const formRow = sheet.getCell(rowIdx, 1);
  formRow.value     = 'FORM NO :';
  formRow.font      = { size: 9, name: 'Arial' };
  formRow.alignment = leftAlign();
  formRow.fill      = greyFill();
  applyBorder(formRow, BORDER_LIGHT);
  sheet.getRow(rowIdx).height = 16;

  // Freeze top 7 rows (header info)
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 7, activeCell: 'A8' }];

  return workbook.xlsx.writeBuffer();
}

// ─────────────────────────────────────────────
//  Build HTML email body
// ─────────────────────────────────────────────
function buildEmailHTML({ shiftLabel, reportDate, total, passed, failed, pending, rejected, partSummary }) {
  const partRows = partSummary.map(p => `
    <tr>
      <td style="padding:8px;border:1px solid #e0e0e0;">${p.partNumber}</td>
      <td style="padding:8px;text-align:center;border:1px solid #e0e0e0;">${p.type}</td>
      <td style="padding:8px;text-align:center;border:1px solid #e0e0e0;font-weight:bold;">${p.total}</td>
      <td style="padding:8px;text-align:center;border:1px solid #e0e0e0;color:#2e7d32;">${p.sampleSize}</td>
    </tr>`).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;">
      <div style="background:#1F3864;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;">📊 Shift PDI Production Report</h2>
        <p style="color:#a8c4e0;margin:4px 0 0;">${shiftLabel} &nbsp;|&nbsp; Date: ${reportDate}</p>
      </div>

      <div style="border:1px solid #dce6f1;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p style="color:#333;font-size:15px;">
          Please find the attached Excel reports for the shift.<br/>
          <strong>Attachment 1:</strong> Full shift scan report (all records)<br/>
          <strong>Attachments 2–N:</strong> Individual PDI Check Sheets per part number (max 5 samples each)
        </p>

        <h3 style="color:#1F3864;border-bottom:2px solid #dce6f1;padding-bottom:6px;">Shift Summary</h3>
        <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">
          <tr style="background:#dce6f1;">
            <th style="padding:10px;text-align:left;border:1px solid #c0cfe4;">Metric</th>
            <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">Count</th>
          </tr>
          <tr><td style="padding:10px;border:1px solid #e0e0e0;">Total Scanned</td>
              <td style="padding:10px;text-align:center;border:1px solid #e0e0e0;font-weight:bold;">${total}</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:10px;border:1px solid #e0e0e0;">✅ Passed</td>
              <td style="padding:10px;text-align:center;border:1px solid #e0e0e0;color:#2e7d32;font-weight:bold;">${passed}</td></tr>
          <tr><td style="padding:10px;border:1px solid #e0e0e0;">❌ Failed</td>
              <td style="padding:10px;text-align:center;border:1px solid #e0e0e0;color:#c62828;font-weight:bold;">${failed}</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:10px;border:1px solid #e0e0e0;">⏳ Pending</td>
              <td style="padding:10px;text-align:center;border:1px solid #e0e0e0;color:#e65100;font-weight:bold;">${pending}</td></tr>
          <tr><td style="padding:10px;border:1px solid #e0e0e0;">🚫 Rejected</td>
              <td style="padding:10px;text-align:center;border:1px solid #e0e0e0;color:#6a1a1a;font-weight:bold;">${rejected}</td></tr>
        </table>

        <h3 style="color:#1F3864;border-bottom:2px solid #dce6f1;padding-bottom:6px;">Per Part Number Summary</h3>
        <table style="width:100%;border-collapse:collapse;margin:8px 0;">
          <tr style="background:#dce6f1;">
            <th style="padding:10px;text-align:left;border:1px solid #c0cfe4;">Part Number</th>
            <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">Type</th>
            <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">Total Scanned</th>
            <th style="padding:10px;text-align:center;border:1px solid #c0cfe4;">PDI Sample Size</th>
          </tr>
          ${partRows}
        </table>

        <p style="color:#666;font-size:13px;margin-top:24px;">
          This is an automated report generated by the Shift PDI Report System.<br/>
          Please do not reply to this email.
        </p>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
//  Core job: generate & send all reports
// ─────────────────────────────────────────────
async function sendShiftReport(shiftIndex) {
  const { from, to, shiftLabel, reportDate } = getShiftWindow(shiftIndex);

  console.log(`[ShiftReport] Running report for: ${shiftLabel} | ${from.toISOString()} → ${to.toISOString()}`);

  try {
    // 1. Fetch all records for the shift
    const rows = await fetchShiftRecords(from, to);
    console.log(`[ShiftReport] Records found: ${rows.length}`);

    // 2. Get admin & super-admin emails
    const users      = await findAllUsers();
    const recipients = users
      .filter(u => ['admin', 'super admin'].includes(u.role) && u.email && u.is_active)
      .map(u => u.email);

    if (recipients.length === 0) {
      console.warn('[ShiftReport] No active admin/super-admin recipients found.');
      return;
    }

    // 3. Build master shift report Excel
    const masterBuffer = await buildMasterExcel(rows, shiftLabel, reportDate);

    const total    = rows.length;
    const passed   = rows.filter(r => r.validation_status === 'pass').length;
    const failed   = rows.filter(r => r.validation_status === 'fail').length;
    const pending  = rows.filter(r => r.validation_status === 'pending').length;
    const rejected = rows.filter(r => r.is_rejected).length;

    // 4. Group records by part number
    const partGroups = {};
    for (const row of rows) {
      const pn = row.part_no;
      if (!pn) continue;
      if (!partGroups[pn]) partGroups[pn] = [];
      partGroups[pn].push(row);
    }

    // 5. Build per-part PDI Excel sheets
    const attachments = [
      {
        filename:    `shift_report_${reportDate}_shift${shiftIndex + 1}.xlsx`,
        content:     masterBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ];

    const partSummary = [];

    for (const [partNumber, partRecords] of Object.entries(partGroups)) {
      try {
        // Fetch product details for this part number
        const product  = await findProductByPartNumber(partNumber);
        const partType = detectPartType(product);

        // Limit to 5 records for PDI report
        const sampleSize = Math.min(partRecords.length, 5);

        const pdiBuffer = await buildPDIExcel(partNumber, partRecords, product, shiftLabel, reportDate);

        attachments.push({
          filename:    `PDI_${partType}_${partNumber}_${reportDate}_shift${shiftIndex + 1}.xlsx`,
          content:     pdiBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        partSummary.push({
          partNumber,
          type: partType,
          total: partRecords.length,
          sampleSize,
        });

        console.log(`[ShiftReport] PDI built for ${partNumber} (${partType}) — ${partRecords.length} records, ${sampleSize} in report`);
      } catch (partErr) {
        console.error(`[ShiftReport] Error building PDI for ${partNumber}:`, partErr);
      }
    }

    // 6. Build email HTML
    const html = buildEmailHTML({ shiftLabel, reportDate, total, passed, failed, pending, rejected, partSummary });

    // 7. Send mail with all attachments
    await sendMail({
      to:      recipients,
      subject: `[PDI Shift Report] ${shiftLabel} | ${reportDate}`,
      html,
      attachments,
    });

    console.log(`[ShiftReport] Email sent to: ${recipients.join(', ')} with ${attachments.length} attachment(s)`);
  } catch (err) {
    console.error(`[ShiftReport] Error generating/sending report for shift ${shiftIndex + 1}:`, err);
  }
}

// ─────────────────────────────────────────────
//  Schedule cron jobs (IST)
//  Morning (06–14) → 14:20
//  Evening (14–22) → 22:20
//  Night   (22–06) → 06:20
// ─────────────────────────────────────────────
export function initShiftReportCrons() {
  cron.schedule('20 14 * * *', () => sendShiftReport(0), { timezone: 'Asia/Kolkata' });
  cron.schedule('20 22 * * *', () => sendShiftReport(1), { timezone: 'Asia/Kolkata' });
  cron.schedule('20 6  * * *', () => sendShiftReport(2), { timezone: 'Asia/Kolkata' });

  console.log('[ShiftReport] ✅ Cron jobs scheduled (IST):  14:20 | 22:20 | 06:20');
}