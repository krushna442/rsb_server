// routes/scannedProductRoutes.js
import express from 'express';
import {
  listScans,
  getScan,
  dailySummary,
  scan,
  patchRemarks,
  patchRejected,
  todaySummary,
  summaryBetweenDates,
  currentMonthSummary,
} from '../controllers/scannedProductController.js';

const router = express.Router();

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/summary/:date', dailySummary);   // ?date=YYYY-MM-DD

// ── Core ──────────────────────────────────────────────────────────────────────
router.get('/',    listScans);       // ?dispatch_date=&shift=&part_no=&validation_status=&page=&limit=
router.post('/scan', scan);          // Production / QA scan entry point
router.get('/:id', getScan);

// ── Patches ───────────────────────────────────────────────────────────────────
router.patch('/:id/remarks', patchRemarks);   // { remarks }
router.patch('/:id/reject',  patchRejected);  // { is_rejected: true|false }


router.get("/summary/current-month", currentMonthSummary);
router.get("/summary/range/:from/:to", summaryBetweenDates);
router.get("/summary/today", todaySummary);

export default router;