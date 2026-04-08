// routes/productRoutes.js
import express from 'express';
import { uploadDocument } from "../middlewares/uploadDocuments.js";
import {
  listProducts,
  productCounts,
  getProduct,
  getProductByPartNumber,
  addProduct,
  editProduct,
  approveProduct,
  qualityVerifyProduct,
  importProducts,
  removeProduct,
  addDocument,
  deleteDocument,
  productDropdownOptions,
  inactiveProduct,
  markDocumentNotRequired,
} from '../controllers/productController.js';
import { protectRoute } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ── Stats / special ──────────────────────────────────────────────────────────
router.get('/counts',             productCounts);
router.get('/by-part/:partNumber', getProductByPartNumber);
router.post('/import',            importProducts);

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.get('/',       listProducts);
router.post('/', protectRoute, addProduct);
router.get('/:id',    getProduct);
router.put('/:id', protectRoute, editProduct);

router.delete('/:id', protectRoute, removeProduct);

// ── Workflow ─────────────────────────────────────────────────────────────────
router.put('/:id/approval', protectRoute, approveProduct);          // { status: 'approved'|'rejected'|'pending' }
router.put('/:id/quality', protectRoute, qualityVerifyProduct);    // { status: 'approved'|'rejected'|'pending' }

// ── Documents (categorized: individual / ppap) ──────────────────────────────
// Upload:  PUT  /products/:id/documents   body: { name, category }  + file
// Delete:  DEL  /products/:id/documents/:category/:name
router.put(
  "/:id/documents",
  uploadDocument.any(),
  addDocument
);
router.delete("/:id/documents/:category/:name", deleteDocument);
// ── Mark document as not required ──────────────────────────────────────────
// PATCH /products/:id/documents/:category/:name/not-required
router.patch("/:id/documents/:category/:name/not-required", markDocumentNotRequired);

router.put('/:id/inactive', protectRoute, inactiveProduct);

router.get("/dropdown/options", productDropdownOptions);

export default router;