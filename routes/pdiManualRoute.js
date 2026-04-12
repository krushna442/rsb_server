import express from 'express';
import { protectRoute } from '../middlewares/authMiddleware.js';
import { uploadPdiManual  } from '../middlewares/uploadPdiManual.js';

import {
  listPDIReports,
  getPDIReport,
  createPDIReportHandler,
} from '../controllers/pdiManual.js';

const router = express.Router();

// ── GET ALL ─────────────────────────────────────────────
// GET /api/pdi-reports
router.get('/', listPDIReports);

// ── GET BY ID ───────────────────────────────────────────
// GET /api/pdi-reports/:id
router.get('/:id', getPDIReport);

// ── CREATE ──────────────────────────────────────────────
// POST /api/pdi-reports
// multipart/form-data: { name, file }
router.post(
  '/',
  protectRoute,
  uploadPdiManual.single('file'),
  createPDIReportHandler
);

export default router;