// routes/despatchPlanRoutes.js
import express from 'express';
import { protectRoute } from '../middlewares/authMiddleware.js';
import {
  getPlanByDate, savePlan, updateScanData,
  markVehicleComplete, triggerDailyReport, exportPlan,
  updateVehiclePriority, getDespatchGraphData, exportDateRangePlan, updateSingleVehicle
} from '../controllers/despatchPlanController.js';

const router = express.Router();

const productionOrAbove = (req, res, next) => {
  if (!['admin', 'super admin', 'production'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Production access required' });
  }
  next();
};

router.get('/',                               protectRoute, getPlanByDate);
router.get('/export',                         protectRoute, exportPlan);
router.get('/export-range',                   protectRoute, exportDateRangePlan);
router.get('/graph',                          protectRoute, getDespatchGraphData);
router.post('/save',                          protectRoute, productionOrAbove, savePlan);
router.post('/sync-scan',                     protectRoute, productionOrAbove, updateScanData);
router.patch('/vehicles/:vehicleId/complete', protectRoute, productionOrAbove, markVehicleComplete);
router.patch('/vehicles/:vehicleId/priority', protectRoute, updateVehiclePriority); // all users can set priority
router.put('/vehicles/:vehicleId', protectRoute, productionOrAbove, updateSingleVehicle);
router.post('/send-daily-report',             protectRoute, triggerDailyReport);

export default router;
