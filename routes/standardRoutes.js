// routes/standardRoutes.js
import express from 'express';
import { uploadStandard } from '../middlewares/uploadFiles.js';
import { protectRoute } from '../middlewares/authMiddleware.js';
import {
  listStandards, getStandard, getStandardVersions,
  addStandard, editStandard, addStandardVersion, deleteStandard,
} from '../controllers/standardController.js';

const router = express.Router();

router.get('/',                  protectRoute, listStandards);
router.get('/:id',               protectRoute, getStandard);
router.get('/:id/versions',      protectRoute, getStandardVersions);
router.post('/',                 protectRoute, uploadStandard.single('file'), addStandard);
router.put('/:id',               protectRoute, editStandard);
router.post('/:id/new-version',  protectRoute, uploadStandard.single('file'), addStandardVersion);
router.delete('/:id',            protectRoute, deleteStandard);

export default router;
