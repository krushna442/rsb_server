// routes/bearingCupRoutes.js
import express from 'express';
import { protectRoute } from '../middlewares/authMiddleware.js';
import {
  getPlanByDate, getAvailableDates, upsertPlan, getPlanSummary, exportPlan
} from '../controllers/bearingCupController.js';

const router = express.Router();

router.get('/dates',    protectRoute, getAvailableDates);
router.get('/summary',  protectRoute, getPlanSummary);
router.get('/export',   protectRoute, exportPlan);
router.get('/',         protectRoute, getPlanByDate);
router.put('/',         protectRoute, upsertPlan);

export default router;
