import { queryOne, execute } from "../db/db.js";
import fs from "fs";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse product_images column safely.
 * Returns a plain object like { "Tube Dia & Thickness": "uploads/product_images/xxx.png" }
 */
const parseImages = (raw) => {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }
  return raw || {};
};

// ─── READ ─────────────────────────────────────────────────────────────────────

/**
 * Get the product_images JSON for a product.
 * Returns: { "Label": "uploads/product_images/file.png", ... }
 */
export const getProductImages = async (productId) => {
  const row = await queryOne(
    "SELECT product_images FROM products WHERE id = ?",
    [productId]
  );

  if (!row) throw new Error("Product not found");

  return parseImages(row.product_images);
};

// ─── ADD / REPLACE ────────────────────────────────────────────────────────────

/**
 * Add or replace a single image/PDF entry in product_images.
 *
 * @param {number|string} productId
 * @param {string} label       - Key name, e.g. "Tube Dia & Thickness"
 * @param {string} filePath    - Relative path, e.g. "uploads/product_images/xxx.png"
 * @param {string} modified_by
 * @returns updated product_images object
 */
export const addProductImageModel = async (productId, label, filePath, modified_by) => {
  if (!label || !label.trim()) throw new Error("Label is required");
  if (!filePath) throw new Error("File path is required");

  const row = await queryOne(
    "SELECT product_images FROM products WHERE id = ?",
    [productId]
  );
  if (!row) throw new Error("Product not found");

  const images = parseImages(row.product_images);

  // If there's already a file for this label, delete the old file from disk
  if (images[label]) {
    try {
      const oldPath = images[label].replace(/\\/g, "/");
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch (err) {
      console.warn("Could not delete old product image:", err.message);
    }
  }

  images[label] = filePath;

  await execute(
    `UPDATE products
     SET product_images = ?,
         modified_by    = ?,
         updated_at     = NOW()
     WHERE id = ?`,
    [JSON.stringify(images), modified_by, productId]
  );

  return images;
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

/**
 * Remove a single image/PDF entry from product_images and delete the file from disk.
 *
 * @param {number|string} productId
 * @param {string} label       - Key to remove, e.g. "Tube Dia & Thickness"
 * @param {string} modified_by
 * @returns updated product_images object
 */
export const deleteProductImageModel = async (productId, label, modified_by) => {
  if (!label || !label.trim()) throw new Error("Label is required");

  const row = await queryOne(
    "SELECT product_images FROM products WHERE id = ?",
    [productId]
  );
  if (!row) throw new Error("Product not found");

  const images = parseImages(row.product_images);

  if (!images[label]) {
    throw new Error(`No image found for label "${label}"`);
  }

  // Delete file from disk
  try {
    const filePath = images[label].replace(/\\/g, "/");
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("Could not delete product image file:", err.message);
  }

  delete images[label];

  await execute(
    `UPDATE products
     SET product_images = ?,
         modified_by    = ?,
         updated_at     = NOW()
     WHERE id = ?`,
    [JSON.stringify(images), modified_by, productId]
  );

  return images;
};
