import {
  getProductImages,
  addProductImageModel,
  deleteProductImageModel,
} from "../models/productImageModel.js";

// ─── GET all images for a product ────────────────────────────────────────────
/**
 * GET /api/product-images/:id
 * Returns the product_images JSON object for the given product.
 */
export const listProductImages = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await getProductImages(id);
    res.json({ success: true, data });
  } catch (err) {
    console.error("listProductImages error:", err);
    const status = err.message === "Product not found" ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// ─── UPLOAD / REPLACE one image or PDF ───────────────────────────────────────
/**
 * POST /api/product-images/:id
 * Body (multipart/form-data):
 *   - label  : string  — key name, e.g. "Tube Dia & Thickness"
 *   - file   : file    — the image (jpg/png/svg/webp) or PDF
 *
 * If a file for the same label already exists it is replaced and the old file
 * is deleted from disk.
 */
export const uploadProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const label = (req.body.label || "").trim();

    if (!label) {
      return res
        .status(400)
        .json({ success: false, message: "label is required in the request body" });
    }

    const file = req.file; // single file via multer .single("file")
    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "A file must be attached (field name: file)" });
    }

    // Normalise path separators to forward-slash for cross-platform storage
    const filePath = file.path.replace(/\\/g, "/");

    const data = await addProductImageModel(
      id,
      label,
      filePath,
      req.user?.name ?? null
    );

    res.json({ success: true, data });
  } catch (err) {
    console.error("uploadProductImage error:", err);
    const status = err.message === "Product not found" ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// ─── DELETE one image / PDF entry ────────────────────────────────────────────
/**
 * DELETE /api/product-images/:id/:label
 * :label must be URI-encoded (encodeURIComponent) if it contains special chars.
 *
 * Deletes the file from disk and removes the key from product_images JSON.
 */
export const removeProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    // decode in case client URI-encoded the label
    const label = decodeURIComponent(req.params.label || "").trim();

    if (!label) {
      return res
        .status(400)
        .json({ success: false, message: "label param is required" });
    }

    const data = await deleteProductImageModel(
      id,
      label,
      req.user?.name ?? null
    );

    res.json({ success: true, data });
  } catch (err) {
    console.error("removeProductImage error:", err);
    let status = 500;
    if (err.message === "Product not found") status = 404;
    if (err.message.startsWith("No image found for label")) status = 404;
    res.status(status).json({ success: false, message: err.message });
  }
};
