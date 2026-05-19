// routes/drawingRoutes.js
import express from 'express';
import { uploadDrawingWithBom, uploadSopVideoChunk } from '../middlewares/uploadFiles.js';
import { protectRoute } from '../middlewares/authMiddleware.js';
import {
  listDrawings, getDrawing, getDrawingVersions,
  addDrawing, editDrawing, addDrawingVersion, deleteDrawing,
  uploadDrawingChunk, deleteDrawingsByCustomer,
} from '../controllers/drawingController.js';

const router = express.Router();

// Multi-field upload: accepts 'file' (drawing) and 'bom_file' (BOM document)
const uploadFields = uploadDrawingWithBom.fields([
  { name: 'file',     maxCount: 1 },
  { name: 'bom_file', maxCount: 1 },
]);

// ── Chunked upload MUST be before /:id routes ──────────────────────────────
router.post('/upload-chunk', uploadSopVideoChunk.single('chunk'), uploadDrawingChunk);

// ── Standard CRUD routes ───────────────────────────────────────────────────
router.delete('/customer/:customer', deleteDrawingsByCustomer);
router.get('/',                 listDrawings);
router.post('/',                uploadFields, addDrawing);
router.get('/:id',              getDrawing);
router.get('/:id/versions',     getDrawingVersions);
router.put('/:id',              uploadFields, editDrawing);
router.post('/:id/new-version', uploadFields, addDrawingVersion);
router.delete('/:id',           deleteDrawing);

export default router;
