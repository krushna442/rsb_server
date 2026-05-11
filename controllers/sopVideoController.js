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

/** POST /api/sop-videos/chunk */
export const uploadChunkFile = async (req, res) => {
  try {
    const uploadId = req.query.uploadId || req.body.uploadId;
    const chunkIndex = req.query.chunkIndex || req.body.chunkIndex;
    const { totalChunks, title, fileName, mimeType } = req.body;

    if (!req.file) return res.status(400).json({ success: false, message: 'Chunk file missing' });

    const cIdx = parseInt(chunkIndex);
    const tChunks = parseInt(totalChunks);

    if (cIdx === tChunks - 1) {
      const finalDir = 'uploads/sop-videos';
      if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
      const finalName = `${Date.now()}_${fileName}`;
      const finalPath = path.join(finalDir, finalName);
      
      const writeStream = fs.createWriteStream(finalPath);
      const tempDir = `uploads/temp_chunks/${uploadId}`;
      let fileSize = 0;

      const finishPromise = new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const appendChunk = (index) => {
        return new Promise((resolve, reject) => {
          if (index >= tChunks) {
            writeStream.end();
            return resolve();
          }
          const chunkPath = path.join(tempDir, `chunk_${index}`);
          if (!fs.existsSync(chunkPath)) return reject(new Error(`Missing chunk ${index}`));
          
          fileSize += fs.statSync(chunkPath).size;
          
          const readStream = fs.createReadStream(chunkPath);
          readStream.pipe(writeStream, { end: false });
          readStream.on('end', () => {
            fs.unlinkSync(chunkPath);
            resolve(appendChunk(index + 1));
          });
          readStream.on('error', reject);
        });
      };

      await appendChunk(0);
      await finishPromise;

      fs.rmdirSync(tempDir);

      const createdBy = req.user?.username || 'system';

      await execute(
        'INSERT INTO sop_videos (title, file_path, mime_type, file_size, created_by) VALUES (?, ?, ?, ?, ?)',
        [title, finalPath, mimeType || 'video/mp4', fileSize, createdBy]
      );

      return res.json({ success: true, message: 'Upload complete' });
    }

    res.json({ success: true, message: 'Chunk uploaded' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
