import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

import { 
  register, 
  login, 
  getMe, 
  logout,
  uploadProfileImage,
  getAllUsers,
  updateUserProfile,
  deactivateUser,
  deleteUser
} from '../controllers/userController.js';

import { protectRoute } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ─── Multer Configuration for User Profiles ──────────────────────────────────
const uploadDir = 'uploads/user_profile';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // e.g. "profile-1681234567-filename.jpg"
    cb(null, `profile-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // limit to 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// Public
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

// Protected
router.get('/', protectRoute, getAllUsers);
router.get('/me', protectRoute, getMe);
router.post('/upload-image', protectRoute, upload.single('profile_image'), uploadProfileImage);
router.put('/:id', protectRoute, updateUserProfile);
router.put('/deactivate/:id', protectRoute, deactivateUser);
router.delete('/:id', protectRoute, deleteUser);

export default router;
