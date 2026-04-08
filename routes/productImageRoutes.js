import express from "express";
import { uploadProductImage as uploadMiddleware } from "../middlewares/uploadProductImages.js";
import {
  listProductImages,
  uploadProductImage,
  removeProductImage,
} from "../controllers/productImageController.js";

const router = express.Router();

/**
 * GET  /api/product-images/:id
 * Returns all product_images entries for a product
 * Response: { success: true, data: { "Label": "uploads/product_images/xxx.png", ... } }
 */
router.get("/:id", listProductImages);

/**
 * POST /api/product-images/:id
 * Upload (or replace) one image/PDF for a product part label.
 * Content-Type: multipart/form-data
 * Fields:
 *   - label  (string, required) — e.g. "Tube Dia & Thickness"
 *   - file   (file, required)   — JPG | PNG | SVG | WEBP | PDF  (max 20 MB)
 * Response: { success: true, data: { ...updated product_images object } }
 */
router.post(
  "/:id",
  uploadMiddleware.single("file"),
  uploadProductImage
);

/**
 * DELETE /api/product-images/:id/:label
 * Remove one entry by label and delete the file from disk.
 * :label must be URI-encoded if it contains special characters.
 * Response: { success: true, data: { ...remaining product_images object } }
 */
router.delete("/:id/:label", removeProductImage);

export default router;
