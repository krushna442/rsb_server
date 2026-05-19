// routes/standardRoutes.js
import express from 'express';
import { uploadStandard, uploadSopVideoChunk } from '../middlewares/uploadFiles.js';
import { protectRoute } from '../middlewares/authMiddleware.js';
import {
  listStandards, getStandard, getStandardVersions,
  addStandard, editStandard, addStandardVersion, deleteStandard,
  uploadStandardChunk, deleteStandardsByCategory,
} from '../controllers/standardController.js';

const router = express.Router();

// ── Chunked upload MUST be before /:id routes ──────────────────────────────
router.post('/upload-chunk', uploadSopVideoChunk.single('chunk'), uploadStandardChunk);

// ── Standard CRUD routes ───────────────────────────────────────────────────
router.delete('/category/:category', protectRoute, deleteStandardsByCategory);
router.get('/',                  protectRoute, listStandards);
router.post('/',                 protectRoute, uploadStandard.single('file'), addStandard);
router.get('/:id',               protectRoute, getStandard);
router.get('/:id/versions',      protectRoute, getStandardVersions);
router.put('/:id',               protectRoute, editStandard);
router.post('/:id/new-version',  protectRoute, uploadStandard.single('file'), addStandardVersion);
router.delete('/:id',            protectRoute, deleteStandard);

export default router;
