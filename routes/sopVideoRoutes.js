import express from 'express';
import { listVideos, uploadVideo, deleteVideo, streamVideo } from '../controllers/sopVideoController.js';
import { protectRoute } from '../middlewares/authMiddleware.js';
import { uploadSopVideo } from '../middlewares/uploadFiles.js';

const router = express.Router();

const isAdmin = (req, res, next) => {
  if (['admin', 'super admin'].includes(req.user?.role)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

router.get('/', protectRoute, listVideos);
router.post('/', protectRoute, isAdmin, uploadSopVideo.single('video'), uploadVideo);
router.delete('/:id', protectRoute, isAdmin, deleteVideo);
router.get('/stream/:id', streamVideo); // Streaming often needs to be accessible without complex auth headers if used in native video tags, but can be protected if needed.

export default router;
