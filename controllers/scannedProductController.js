import {
  findAllScans,
  countScans,
  findScanById,
  createScan,
  updateScanRemarks,
  updateRejectedFlag,
  getDailySummary,
  getTodaySummary,
  getSummaryBetweenDates,
  getCurrentMonthSummary,
} from '../models/scannedProductModel.js';
import { findProductByPartNumber } from '../models/productModel.js';
import { getFieldNamesForStage }   from '../models/dynamicFieldModel.js';

export const listScans = async (req, res) => {
  try {
    const { page = 1, limit = 20, ...filters } = req.query;

    // convert boolean strings
    if (filters.is_rejected !== undefined) {
      filters.is_rejected = filters.is_rejected === "true";
    }

    const [data, total] = await Promise.all([
      findAllScans({ ...filters, page, limit }),
      countScans(filters),
    ]);

    res.json({
      success: true,
      data,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (error) {
    console.error("listScans error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getScan = async (req, res) => {
  try {
    const data = await findScanById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Scan record not found' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('getScan error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const dailySummary = async (req, res) => {
  try {
    const date = req.params.date ?? new Date().toISOString().slice(0, 10);
    const data = await getDailySummary(date);
    res.json({ success: true, data });
  } catch (error) {
    console.error('dailySummary error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/scanned-products/scan
 * Records a new scan with auto-validation against master data.
 */
/**
 * Converts a UTC Date to an IST datetime string.
 * Format: "YYYY-MM-DD HH:mm:ss"  (IST = UTC + 5h 30m)
 */
const toISTString = (utcDate) => {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in ms
  const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);

  const yyyy = istDate.getUTCFullYear();
  const mm   = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(istDate.getUTCDate()).padStart(2, '0');
  const hh   = String(istDate.getUTCHours()).padStart(2, '0');
  const min  = String(istDate.getUTCMinutes()).padStart(2, '0');
  const ss   = String(istDate.getUTCSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
};

export const scan = async (req, res) => {
  try {
    const { part_no } = req.body;

    if (!part_no) {
      return res.status(400).json({ success: false, message: 'part_no is required' });
    }

    // 1. Look up master product
    const masterProduct = await findProductByPartNumber(part_no);
    if (!masterProduct) {
      return res.status(404).json({
        success: false,
        message: `Part number '${part_no}' not found in product master`,
      });
    }

    // 2. Block if product approval is still pending
    if (masterProduct.approved !== 'approved') {
      return res.status(403).json({
        success: false,
        message: `Product with part number '${part_no}' is not verified yet`,
      });
    }

    // 3. Derive dispatch_date from current UTC time → converted to IST
    //    Stored as "YYYY-MM-DD HH:mm:ss" in Indian Standard Time (UTC+5:30)
    const nowIST = toISTString(new Date());

    // 4. Create scan record — validation + auto-remarks + serial number happen inside createScan
    const data = await createScan(
      { ...req.body, dispatch_date: nowIST },
      masterProduct,
      req.user?.name ?? null
    );

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('scan error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const patchRemarks = async (req, res) => {
  try {
    const data = await updateScanRemarks(
      req.params.id,
      req.body.admin_remarks,
      req.user?.name ?? null
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error('patchRemarks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const patchRejected = async (req, res) => {
  try {
    const data = await updateRejectedFlag(
      req.params.id,
      req.body.is_rejected,
      req.user?.name ?? null
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error('patchRejected error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};



export const currentMonthSummary = async (req, res) => {
  try {
    const data = await getCurrentMonthSummary();

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("currentMonthSummary error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const summaryBetweenDates = async (req, res) => {
  try {
    const { from, to } = req.params;

    const data = await getSummaryBetweenDates(from, to);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("summaryBetweenDates error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



export const todaySummary = async (req, res) => {
  try {
    const data = await getTodaySummary();

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("todaySummary error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};