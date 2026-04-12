import express from 'express';
import { uploadFieldImage } from '../middlewares/uploadFieldImages.js';
import {
  listFields,
  listFieldImages,
  getByField,
  getFieldImage,
  uploadFieldImageHandler,
  removeFieldImage,
} from '../controllers/fieldImageController.js';
import { protectRoute } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ── Get all valid fields + their available dropdown options ───────────────────
// GET /api/field-images/fields
router.get('/fields', listFields);

// ── Get all records for a specific field_name ─────────────────────────────────
// GET /api/field-images/by-field/:fieldName
// e.g. GET /api/field-images/by-field/mountingDetailsFlangeYoke
router.get('/by-field/:fieldName', getByField);

// ── List all records (optional ?field_name= filter) ──────────────────────────
// GET /api/field-images
// GET /api/field-images?field_name=mountingDetailsFlangeYoke
router.get('/', listFieldImages);

// ── Get a single record by id ─────────────────────────────────────────────────
// GET /api/field-images/:id
router.get('/:id', getFieldImage);

// ── Upload a field image / PDF (upsert) ───────────────────────────────────────
// POST /api/field-images
// multipart/form-data: { field_name, option_value, file }
router.post(
  '/',
  protectRoute,
  uploadFieldImage.single('file'),
  uploadFieldImageHandler
);

// ── Delete a record by id ─────────────────────────────────────────────────────
// DELETE /api/field-images/:id
router.delete('/:id', protectRoute, removeFieldImage);

export default router;
