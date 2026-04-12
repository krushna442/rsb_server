/**
 * pdiReportRoutes.js
 *
 * Mount under your main Express app, e.g.:
 *   import pdiReportRoutes from './routes/pdiReportRoutes.js';
 *   app.use('/api/reports', pdiReportRoutes);
 *
 * Endpoints exposed:
 *   POST /api/reports/pdi-part
 */

import { Router }           from 'express';
import { getPDIPartReport } from '../controllers/Pdireportcontroller.js';

const router = Router();

/**
 * POST /api/reports/pdi-part
 *
 * Body (JSON):
 * {
 *   "partNumber" : "FEA73900",
 *   "fromDate"   : "2026-04-01",
 *   "toDate"     : "2026-04-10"
 * }
 *
 * Success 200 – see controller JSDoc for full response shape.
 * Error   400 – missing / invalid fields.
 * Error   500 – DB or unexpected error.
 */
router.post('/pdi-part', getPDIPartReport);

export default router;