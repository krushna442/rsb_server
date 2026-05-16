// controllers/standardController.js
import { query, queryOne, execute } from '../db/db.js';
import fs from 'fs';
import path from 'path';

const parseUser = (req) => req.user?.username || req.user?.name || 'system';

export const listStandards = async (req, res) => {
  try {
    const role = req.user?.role || 'viewer';
    const isAdmin = ['admin', 'super admin'].includes(role);
    const rows = await query(`SELECT * FROM standards WHERE is_latest = 1 ORDER BY category ASC, standard_no ASC`);
    let versionMap = {};
    if (isAdmin) {
      const allRows = await query(`SELECT id, standard_no, version, rev_number, rev_date, created_at FROM standards ORDER BY standard_no ASC, version ASC`);
      allRows.forEach(r => {
        if (!versionMap[r.standard_no]) versionMap[r.standard_no] = [];
        versionMap[r.standard_no].push(r);
      });
    }
    res.json({ success: true, data: rows, versionMap: isAdmin ? versionMap : {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getStandard = async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM standards WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getStandardVersions = async (req, res) => {
  try {
    const base = await queryOne('SELECT standard_no FROM standards WHERE id = ?', [req.params.id]);
    if (!base) return res.status(404).json({ success: false, message: 'Not found' });
    const rows = await query(`SELECT * FROM standards WHERE standard_no = ? ORDER BY version DESC`, [base.standard_no]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const addStandard = async (req, res) => {
  try {
    const { standard_no, description, rev_number, rev_date, comment, category, remarks, file_path_from_chunks } = req.body;
    if (!standard_no) return res.status(400).json({ success: false, message: 'standard_no is required' });
    let file_path = req.file ? `uploads/standards/${req.file.filename}` : null;
    if (file_path_from_chunks) file_path = file_path_from_chunks;
    const createdBy = parseUser(req);
    const validCats = ['SS/TS', 'ISO', 'DIN', 'MANUAL'];
    const cat = validCats.includes(category) ? category : 'MANUAL';
    const existing = await queryOne('SELECT id, version FROM standards WHERE standard_no = ? AND is_latest = 1', [standard_no]);
    let newVersion = 1;
    if (existing) {
      await execute('UPDATE standards SET is_latest = 0 WHERE standard_no = ? AND is_latest = 1', [standard_no]);
      newVersion = existing.version + 1;
    }
    const result = await execute(
      `INSERT INTO standards (standard_no, description, rev_number, rev_date, comment, file_path, category, version, is_latest, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [standard_no, description || null, rev_number || null, rev_date || null, comment || null, file_path, cat, newVersion, remarks || null, createdBy]
    );
    const newRow = await queryOne('SELECT * FROM standards WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: newRow });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const editStandard = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, rev_number, rev_date, comment, category, remarks } = req.body;
    const updatedBy = parseUser(req);
    const validCats = ['SS/TS', 'ISO', 'DIN', 'MANUAL'];
    const updates = [];
    const vals = [];
    if (description !== undefined) { updates.push('description=?'); vals.push(description); }
    if (rev_number !== undefined)  { updates.push('rev_number=?');  vals.push(rev_number); }
    if (rev_date !== undefined)    { updates.push('rev_date=?');    vals.push(rev_date); }
    if (comment !== undefined)     { updates.push('comment=?');     vals.push(comment); }
    if (remarks !== undefined)     { updates.push('remarks=?');     vals.push(remarks); }
    if (validCats.includes(category)) { updates.push('category=?'); vals.push(category); }
    if (req.body.file_path_from_chunks) { updates.push('file_path=?'); vals.push(req.body.file_path_from_chunks); }
    updates.push('updated_by=?'); vals.push(updatedBy);
    vals.push(id);
    await execute(`UPDATE standards SET ${updates.join(',')} WHERE id=?`, vals);
    const row = await queryOne('SELECT * FROM standards WHERE id = ?', [id]);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const addStandardVersion = async (req, res) => {
  try {
    const { id } = req.params;
    const { rev_number, rev_date, comment, remarks, file_path_from_chunks } = req.body;
    const createdBy = parseUser(req);
    const existing = await queryOne('SELECT * FROM standards WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    let file_path = req.file ? `uploads/standards/${req.file.filename}` : null;
    if (file_path_from_chunks) file_path = file_path_from_chunks;
    await execute('UPDATE standards SET is_latest = 0 WHERE standard_no = ? AND is_latest = 1', [existing.standard_no]);
    const maxVer = await queryOne('SELECT MAX(version) as mv FROM standards WHERE standard_no = ?', [existing.standard_no]);
    const newVersion = (maxVer?.mv || 0) + 1;
    const result = await execute(
      `INSERT INTO standards (standard_no, description, rev_number, rev_date, comment, file_path, category, version, parent_id, is_latest, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [existing.standard_no, existing.description, rev_number || existing.rev_number, rev_date || new Date().toISOString().slice(0, 10), comment || existing.comment, file_path || existing.file_path, existing.category, newVersion, existing.id, remarks || null, createdBy]
    );
    const newRow = await queryOne('SELECT * FROM standards WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: newRow });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteStandard = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryOne('SELECT * FROM standards WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    if (row.file_path) {
      const fullPath = path.join(process.cwd(), row.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    await execute('DELETE FROM standards WHERE id = ?', [id]);
    if (row.is_latest) {
      const prev = await queryOne('SELECT id FROM standards WHERE standard_no = ? ORDER BY version DESC LIMIT 1', [row.standard_no]);
      if (prev) await execute('UPDATE standards SET is_latest = 1 WHERE id = ?', [prev.id]);
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/standards/chunk (Chunked Upload) ─────────────────────────────
export const uploadStandardChunk = async (req, res) => {
  try {
    const uploadId = req.query.uploadId || req.body.uploadId;
    const chunkIndex = req.query.chunkIndex || req.body.chunkIndex;
    const { totalChunks, fileName } = req.body;

    if (!req.file) return res.status(400).json({ success: false, message: 'Chunk file missing' });

    const cIdx = parseInt(chunkIndex);
    const tChunks = parseInt(totalChunks);

    if (cIdx === tChunks - 1) {
      const finalDir = 'uploads/standards';
      if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
      const finalName = `${Date.now()}_${fileName}`;
      const finalPath = path.join(finalDir, finalName);
      
      const writeStream = fs.createWriteStream(finalPath);
      const tempDir = `uploads/temp_chunks/${uploadId}`;
      
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

      return res.json({ success: true, message: 'Upload complete', file_path: `uploads/standards/${finalName}` });
    }

    res.json({ success: true, message: 'Chunk uploaded' });
  } catch (err) {
    console.error('uploadStandardChunk error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
