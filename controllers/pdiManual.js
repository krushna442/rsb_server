import {
  findAllPDIReports,
  findPDIReportById,
  createPDIReport,
} from '../models/pdiManual.js';

// ─── GET ALL ─────────────────────────────────────────────
export const listPDIReports = async (req, res) => {
  try {
    const user_id = req.query.user_id || null;

    const data = await findAllPDIReports(user_id);

    res.json({ success: true, data });
  } catch (error) {
    console.error('listPDIReports error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET BY ID ───────────────────────────────────────────
export const getPDIReport = async (req, res) => {
  try {
    const data = await findPDIReportById(req.params.id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Record not found',
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('getPDIReport error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── CREATE ──────────────────────────────────────────────
export const createPDIReportHandler = async (req, res) => {
  try {
    const name = (req.body.name || '').trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'name is required',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'file is required',
      });
    }

    const filePath = req.file.path.replace(/\\/g, '/');

    const data = await createPDIReport(
      name,
      filePath,
      req.user?.id ?? null
    );

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('createPDIReportHandler error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};