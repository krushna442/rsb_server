import { query, execute } from '../db/db.js';
import fs from 'fs';
import path from 'path';

/** GET /api/sop-videos */
export const listVideos = async (req, res) => {
  try {
    const rows = await query('SELECT * FROM sop_videos ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** POST /api/sop-videos */
export const uploadVideo = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !req.file) {
      return res.status(400).json({ success: false, message: 'Title and video file are required' });
    }

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    const fileSize = req.file.size;
    const createdBy = req.user?.username || 'system';

    await execute(
      'INSERT INTO sop_videos (title, file_path, mime_type, file_size, created_by) VALUES (?, ?, ?, ?, ?)',
      [title, filePath, mimeType, fileSize, createdBy]
    );

    res.json({ success: true, message: 'Video uploaded successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** DELETE /api/sop-videos/:id */
export const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const [video] = await query('SELECT * FROM sop_videos WHERE id = ?', [id]);
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    // Delete file from disk
    if (fs.existsSync(video.file_path)) {
      fs.unlinkSync(video.file_path);
    }

    await execute('DELETE FROM sop_videos WHERE id = ?', [id]);
    res.json({ success: true, message: 'Video deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** GET /api/sop-videos/stream/:id */
export const streamVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const [video] = await query('SELECT * FROM sop_videos WHERE id = ?', [id]);
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });

    const videoPath = video.file_path;
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ success: false, message: 'Video file missing on server' });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': video.mime_type,
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': video.mime_type,
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
