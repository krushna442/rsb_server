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

router.get('/',                      protectRoute, listDrawings);
router.get('/:id',                   protectRoute, getDrawing);
router.get('/:id/versions',          protectRoute, getDrawingVersions);
router.post('/',                     protectRoute, uploadFields, addDrawing);
router.put('/:id',                   protectRoute, uploadFields, editDrawing);
router.post('/:id/new-version',      protectRoute, uploadFields, addDrawingVersion);
router.delete('/:id',                protectRoute, deleteDrawing);

export default router;
