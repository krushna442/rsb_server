// routes/controlPlanRoutes.js
import express from 'express';
import { uploadControlPlan } from '../middlewares/uploadFiles.js';
import { protectRoute } from '../middlewares/authMiddleware.js';
import {
  listControlPlans, getControlPlan, getControlPlanVersions,
  addControlPlan, editControlPlan, addControlPlanVersion,
  deleteControlPlan, toggleActiveControlPlan,
} from '../controllers/controlPlanController.js';

const router = express.Router();

router.get('/',                   protectRoute, listControlPlans);
router.get('/:id',                protectRoute, getControlPlan);
router.get('/:id/versions',       protectRoute, getControlPlanVersions);
router.post('/',                  protectRoute, uploadControlPlan.single('file'), addControlPlan);
router.put('/:id',                protectRoute, editControlPlan);
router.post('/:id/new-version',   protectRoute, uploadControlPlan.single('file'), addControlPlanVersion);
router.delete('/:id',             protectRoute, deleteControlPlan);
router.patch('/:id/toggle-active',protectRoute, toggleActiveControlPlan);

export default router;
