import multer from "multer";
import path from "path";
import fs from "fs";

// 📁 Folder: uploads/pdi-manual
const uploadPath = "uploads/pdi-manual";

// Ensure folder exists
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// ─── STORAGE ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + "_pdi_" + file.fieldname + ext;
    cb(null, name);
  },
});

// ─── ALLOWED TYPES ───────────────────────────────────────
// ✅ Images + PDF + Word + Excel
const allowedTypes = [
  // Images
  "image/jpeg",
  "image/png",
  "image/svg+xml",

  // PDF
  "application/pdf",

  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// ─── FILE FILTER ─────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only images, PDF, Word, and Excel files are allowed."
      )
    );
  }
};

// ─── EXPORT ──────────────────────────────────────────────
export const uploadPdiManual = multer({
  storage,
  fileFilter,
});