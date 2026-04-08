import multer from "multer";
import path from "path";
import fs from "fs";

const uploadPath = "uploads/product_images";

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + "_" + file.fieldname + ext;
    cb(null, name);
  },
});

// Allow images and PDF only (no Word docs for part images)
const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "application/pdf",
];

const fileFilter = (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPG, PNG, SVG, WEBP, and PDF are allowed."));
  }
};

export const uploadProductImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
});
