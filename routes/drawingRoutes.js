// routes/drawingRoutes.js
import express from 'express';
import { uploadDrawingWithBom } from '../middlewares/uploadFiles.js';
import { protectRoute } from '../middlewares/authMiddleware.js';
import {
  listDrawings, getDrawing, getDrawingVersions,
  addDrawing, editDrawing, addDrawingVersion, deleteDrawing,
} from '../controllers/drawingController.js';

const router = express.Router();

// Multi-field upload: accepts 'file' (drawing) and 'bom_file' (BOM document)
const uploadFields = uploadDrawingWithBom.fields([
  { name: 'file',     maxCount: 1 },
  { name: 'bom_file', maxCount: 1 },
]);

router.get('/',                 listDrawings);
router.get('/:id',              getDrawing);
router.get('/:id/versions',     getDrawingVersions);
router.post('/',                uploadFields, addDrawing);
router.put('/:id',              uploadFields, editDrawing);
router.post('/:id/new-version', uploadFields, addDrawingVersion);
router.delete('/:id',           deleteDrawing);

export default router;
