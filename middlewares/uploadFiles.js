// middlewares/uploadFiles.js
// Shared multer config for drawings, standards and control-plan files
import multer from 'multer';
import path from 'path';
import fs from 'fs';

function makeStorage(subfolder) {
  const uploadPath = `uploads/${subfolder}`;
  if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadPath),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  });
}

const ALLOWED = [
  'image/jpeg', 'image/png', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const fileFilter = (_req, file, cb) => {
  if (ALLOWED.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Invalid file type. Allowed: jpg, png, svg, pdf, doc, docx, xls, xlsx'));
};

export const uploadDrawing     = multer({ storage: makeStorage('drawings'),      fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });
export const uploadStandard    = multer({ storage: makeStorage('standards'),     fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });
export const uploadControlPlan = multer({ storage: makeStorage('control-plans'), fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

// Drawing uploader that accepts both the drawing file AND a BOM file
export const uploadDrawingWithBom = multer({ storage: makeStorage('drawings'), fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

// Skill matrix person photo (images only)
const imageFilter = (_req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only jpg, png, webp images are allowed for photos'));
};
export const uploadSkillPhoto = multer({ storage: makeStorage('skill-matrix'), fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// SOP Video uploader
const videoFilter = (_req, file, cb) => {
  if (file.mimetype.startsWith('video/')) cb(null, true);
  else cb(new Error('Only video files are allowed'));
};
export const uploadSopVideo = multer({ 
  storage: makeStorage('sop-videos'), 
  fileFilter: videoFilter, 
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});
