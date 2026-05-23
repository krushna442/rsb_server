// routes/hourlyProductionRoutes.js
import express from 'express';
import { protectRoute } from '../middlewares/authMiddleware.js';
import {
  getByDate, addRecord, updateRecord, deleteRecord,
  getMonthlySummary, getAvailableDates, getTubeLengthSummary,
} from '../controllers/hourlyProductionController.js';

const router = express.Router();

router.get('/monthly',              protectRoute, getMonthlySummary);
router.get('/available-dates',      protectRoute, getAvailableDates);
router.get('/tube-length-summary',  protectRoute, getTubeLengthSummary);
router.get('/',                     protectRoute, getByDate);
router.post('/',                    protectRoute, addRecord);
router.put('/:id',                  protectRoute, updateRecord);
router.delete('/:id',               protectRoute, deleteRecord);

export default router;
