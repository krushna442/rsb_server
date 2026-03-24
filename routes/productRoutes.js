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
    addPpapDocument,
  deletePpapDocument,
  productDropdownOptions,
} from '../controllers/productController.js';

const router = express.Router();

// ── Stats / special ──────────────────────────────────────────────────────────
router.get('/counts',             productCounts);
router.get('/by-part/:partNumber', getProductByPartNumber);
router.post('/import',            importProducts);

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.get('/',       listProducts);
router.post('/',      addProduct);
router.get('/:id',    getProduct);
router.put('/:id',    editProduct);

router.delete('/:id', removeProduct);

// ── Workflow ─────────────────────────────────────────────────────────────────
router.put('/:id/approval', approveProduct);          // { status: 'approved'|'rejected'|'pending' }
router.put('/:id/quality',  qualityVerifyProduct);    // { status: 'approved'|'rejected'|'pending' }

//ppap documents 
router.put(
  "/:id/ppap",
  uploadDocument.any(),
  addPpapDocument
);

// delete
router.delete("/:id/ppap/:name", deletePpapDocument);


router.get("/dropdown/options", productDropdownOptions);

export default router;