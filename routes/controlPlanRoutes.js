// routes/controlPlanRoutes.js
import express from 'express';
import { uploadControlPlan, uploadControlPlanChunk } from '../middlewares/uploadFiles.js';
import { protectRoute } from '../middlewares/authMiddleware.js';
import {
  listControlPlans, getControlPlan, getControlPlanVersions,
  addControlPlan, editControlPlan, addControlPlanVersion,
  deleteControlPlan, toggleActiveControlPlan, deleteControlPlansByLine,
  uploadControlPlanChunkFile, uploadControlPlanVersionChunkFile
} from '../controllers/controlPlanController.js';

const router = express.Router();

router.delete('/line/:line',       protectRoute, deleteControlPlansByLine);
router.get('/',                   protectRoute, listControlPlans);
router.get('/:id',                protectRoute, getControlPlan);
router.get('/:id/versions',       protectRoute, getControlPlanVersions);
router.post('/',                  protectRoute, uploadControlPlan.single('file'), addControlPlan);
router.post('/chunk',             protectRoute, uploadControlPlanChunk.single('chunk'), uploadControlPlanChunkFile);
router.put('/:id',                protectRoute, editControlPlan);
router.post('/:id/new-version',   protectRoute, uploadControlPlan.single('file'), addControlPlanVersion);
router.post('/:id/new-version/chunk', protectRoute, uploadControlPlanChunk.single('chunk'), uploadControlPlanVersionChunkFile);
router.delete('/:id',             protectRoute, deleteControlPlan);
router.patch('/:id/toggle-active',protectRoute, toggleActiveControlPlan);

export default router;
