// controllers/drawingController.js
import { query, queryOne, execute } from '../db/db.js';
import fs from 'fs';
import path from 'path';
import { parseRemarks, serializeRemarks } from '../utils/remarksHelper.js';

const parseUser = (req) => req.user?.username || req.user?.name || 'system';

// Helper: extract file path for a named field from req.files (fields upload)
const getFilePath = (req, fieldName) => {
  if (!req.files) return null;
  const arr = req.files[fieldName];
  if (arr && arr.length > 0) return `uploads/drawings/${arr[0].filename}`;
  return null;
};

const getCustomerPrefix = (customer) => {
  if (!customer) return "";
  const c = customer.toUpperCase().trim();

  const words = c.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    // Single word: take first 1 letters  e.g. "VECV" → "V", "TML" → "T", "ASL" → "A"
    return words[0].slice(0, 1);
  } else {
    // Multi-word: first letter of each word  e.g. "ALL ALW" → "AA", "SWITCH MOBILITY" → "SM"
    return words.map(w => w[0]).join("");
  }
};

const generateSerialNumber = async (customer) => {
  const prefix = getCustomerPrefix(customer);
  if (!prefix) return null;

  const row = await queryOne(
    `SELECT MAX(CAST(SUBSTRING(serial_number, ${prefix.length + 1}) AS UNSIGNED)) as max_val 
     FROM drawings WHERE serial_number LIKE ?`,
    [`${prefix}%`]
  );
  
  const nextVal = (row?.max_val || 0) + 1;
  return `${prefix}${nextVal}`;
};

// ── GET /api/drawings  (latest only, or all with versions for admin) ───────────
export const listDrawings = async (req, res) => {
  try {
    const role = req.user?.role || 'viewer';
    const isAdmin = ['admin', 'super admin'].includes(role);

    const rows = await query(
      `SELECT * FROM drawings WHERE is_latest = 1 ORDER BY customer ASC, LENGTH(serial_number) ASC, serial_number ASC`
    );
    const parsedRows = rows.map(r => ({ ...r, remarks: parseRemarks(r.remarks) }));

    let versionMap = {};
    if (isAdmin) {
      const allRows = await query(
        `SELECT id, drawing_number, version, modification_number, modification_date, created_at, remarks
         FROM drawings ORDER BY drawing_number ASC, version ASC`
      );
      allRows.forEach(r => {
        if (!versionMap[r.drawing_number]) versionMap[r.drawing_number] = [];
        versionMap[r.drawing_number].push({ ...r, remarks: parseRemarks(r.remarks) });
      });
    }

    res.json({ success: true, data: parsedRows, versionMap: isAdmin ? versionMap : {} });
  } catch (err) {
    console.error('listDrawings error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/drawings/:id  (single drawing) ───────────────────────────────────
export const getDrawing = async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM drawings WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Drawing not found' });
    row.remarks = parseRemarks(row.remarks);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/drawings/:id/versions  (all versions of same drawing_number) ─────
export const getDrawingVersions = async (req, res) => {
  try {
    const base = await queryOne('SELECT drawing_number FROM drawings WHERE id = ?', [req.params.id]);
    if (!base) return res.status(404).json({ success: false, message: 'Drawing not found' });

    const rows = await query(
      `SELECT * FROM drawings WHERE drawing_number = ? ORDER BY version DESC`,
      [base.drawing_number]
    );
    const parsedRows = rows.map(r => ({ ...r, remarks: parseRemarks(r.remarks) }));
    res.json({ success: true, data: parsedRows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/drawings  (create new drawing or new version) ───────────────────
export const addDrawing = async (req, res) => {
  try {
    const {
      drawing_number, shaft, joint, part_number, customer,
      modification_number, remarks
    } = req.body;

    let finalDrawingNumber = drawing_number;
    if (customer?.toUpperCase() === 'RSB') {
      finalDrawingNumber = part_number;
    }

    if (!finalDrawingNumber) {
      return res.status(400).json({ success: false, message: 'drawing_number (or part_number for RSB) is required' });
    }

    // Support both single file upload (req.file) and multi-field upload (req.files)
    let file_path = null;
    let bom_path = null;

    if (req.files) {
      // .fields() mode
      file_path = getFilePath(req, 'file');
      bom_path  = getFilePath(req, 'bom_file');
    } else if (req.file) {
      // .single('file') fallback
      file_path = `uploads/drawings/${req.file.filename}`;
    }

    // Check for chunked upload final path
    if (req.body.file_path_from_chunks) {
      file_path = req.body.file_path_from_chunks;
    }
    if (req.body.bom_path_from_chunks) {
      bom_path = req.body.bom_path_from_chunks;
    }

    const modification_date = new Date().toISOString().slice(0, 10);
    const createdBy = parseUser(req);

    // Check if a drawing with same drawing_number already exists (versioning)
    const existing = await queryOne(
      'SELECT id, version FROM drawings WHERE drawing_number = ? AND is_latest = 1',
      [finalDrawingNumber]
    );

    let newVersion = 1;
    let serial_number = null;
    if (existing) {
      // Mark old as not latest
      await execute(
        'UPDATE drawings SET is_latest = 0 WHERE drawing_number = ? AND is_latest = 1',
        [finalDrawingNumber]
      );
      newVersion = existing.version + 1;
      // Inherit serial number from previous versions
      const prev = await queryOne('SELECT serial_number FROM drawings WHERE drawing_number = ? LIMIT 1', [finalDrawingNumber]);
      serial_number = prev?.serial_number;
    } else {
      serial_number = await generateSerialNumber(customer);
    }

    // RSB Logic: if customer is RSB, BOM is always null (though frontend should also handle it)
    if (customer?.toUpperCase() === 'RSB') {
      bom_path = null;
    }

    const result = await execute(
      `INSERT INTO drawings
        (drawing_number, serial_number, shaft, joint, part_number, customer,
         modification_number, modification_date, bom, file_path,
         version, is_latest, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        finalDrawingNumber, serial_number, shaft || null, joint || null, part_number || null,
        customer || null, modification_number || null, modification_date,
        bom_path || null, file_path, newVersion, serializeRemarks(remarks), createdBy
      ]
    );

    const newRow = await queryOne('SELECT * FROM drawings WHERE id = ?', [result.insertId]);
    newRow.remarks = parseRemarks(newRow.remarks);
    res.status(201).json({ success: true, data: newRow });
  } catch (err) {
    console.error('addDrawing error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/drawings/:id  (edit metadata + optionally replace files) ──────────
export const editDrawing = async (req, res) => {
  try {
    const { id } = req.params;
    const { shaft, joint, part_number, customer, modification_number, remarks } = req.body;
    const updatedBy = parseUser(req);

    // Fetch current row to keep existing file paths if no new file uploaded
    const current = await queryOne('SELECT * FROM drawings WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ success: false, message: 'Drawing not found' });

    let file_path = current.file_path;
    let bom_path  = current.bom;

    if (req.files) {
      const newFile = getFilePath(req, 'file');
      const newBom  = getFilePath(req, 'bom_file');
      if (newFile) file_path = newFile;
      if (newBom)  bom_path  = newBom;
    } else if (req.file) {
      file_path = `uploads/drawings/${req.file.filename}`;
    }

    if (req.body.file_path_from_chunks) file_path = req.body.file_path_from_chunks;
    if (req.body.bom_path_from_chunks)  bom_path = req.body.bom_path_from_chunks;

    const finalCustomer = customer !== undefined ? customer : current.customer;
    const finalPartNumber = part_number !== undefined ? part_number : current.part_number;

    let finalDrawingNumber = current.drawing_number;
    let finalBomPath = bom_path;
    if (finalCustomer?.toUpperCase() === 'RSB') {
      finalDrawingNumber = finalPartNumber;
      finalBomPath = null;
    }

    await execute(
      `UPDATE drawings
       SET drawing_number=?, shaft=?, joint=?, part_number=?, customer=?, modification_number=?,
           bom=?, file_path=?, remarks=?, updated_by=?
       WHERE id = ?`,
      [finalDrawingNumber, shaft || null, joint || null, part_number || null, customer || null,
       modification_number || null, finalBomPath || null, file_path || null, serializeRemarks(remarks), updatedBy, id]
    );

    const row = await queryOne('SELECT * FROM drawings WHERE id = ?', [id]);
    row.remarks = parseRemarks(row.remarks);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/drawings/:id/new-version  (upload new version of a drawing) ─────
export const addDrawingVersion = async (req, res) => {
  try {
    const { id } = req.params;
    const { modification_number, remarks } = req.body;
    const createdBy = parseUser(req);

    const existing = await queryOne('SELECT * FROM drawings WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Drawing not found' });

    let file_path = existing.file_path;
    let bom_path  = existing.bom;

    if (req.files) {
      const newFile = getFilePath(req, 'file');
      const newBom  = getFilePath(req, 'bom_file');
      if (newFile) file_path = newFile;
      if (newBom)  bom_path  = newBom;
    } else if (req.file) {
      file_path = `uploads/drawings/${req.file.filename}`;
    }

    if (req.body.file_path_from_chunks) file_path = req.body.file_path_from_chunks;
    if (req.body.bom_path_from_chunks)  bom_path = req.body.bom_path_from_chunks;

    if (existing.customer?.toUpperCase() === 'RSB') {
      bom_path = null;
    }

    const modification_date = new Date().toISOString().slice(0, 10);

    // Mark current latest as not latest
    await execute(
      'UPDATE drawings SET is_latest = 0 WHERE drawing_number = ? AND is_latest = 1',
      [existing.drawing_number]
    );

    // Get max version
    const maxVer = await queryOne(
      'SELECT MAX(version) as mv FROM drawings WHERE drawing_number = ?',
      [existing.drawing_number]
    );
    const newVersion = (maxVer?.mv || 0) + 1;

    const result = await execute(
      `INSERT INTO drawings
        (drawing_number, serial_number, shaft, joint, part_number, customer,
         modification_number, modification_date, bom, file_path,
         version, parent_id, is_latest, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        existing.drawing_number, existing.serial_number, existing.shaft, existing.joint, existing.part_number,
        existing.customer, modification_number || existing.modification_number,
        modification_date, bom_path, file_path,
        newVersion, existing.id, serializeRemarks(remarks), createdBy
      ]
    );

    const newRow = await queryOne('SELECT * FROM drawings WHERE id = ?', [result.insertId]);
    newRow.remarks = parseRemarks(newRow.remarks);
    res.status(201).json({ success: true, data: newRow });
  } catch (err) {
    console.error('addDrawingVersion error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/drawings/:id ──────────────────────────────────────────────────
export const deleteDrawing = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryOne('SELECT * FROM drawings WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ success: false, message: 'Drawing not found' });

    // Delete drawing file from disk
    if (row.file_path) {
      const fullPath = path.join(process.cwd(), row.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    // Delete BOM file from disk
    if (row.bom) {
      const bomPath = path.join(process.cwd(), row.bom);
      if (fs.existsSync(bomPath)) fs.unlinkSync(bomPath);
    }

    await execute('DELETE FROM drawings WHERE id = ?', [id]);

    // If deleted was latest, promote previous version
    if (row.is_latest) {
      const prev = await queryOne(
        'SELECT id FROM drawings WHERE drawing_number = ? ORDER BY version DESC LIMIT 1',
        [row.drawing_number]
      );
      if (prev) {
        await execute('UPDATE drawings SET is_latest = 1 WHERE id = ?', [prev.id]);
      }
    }

    res.json({ success: true, message: 'Drawing deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/drawings/chunk (Chunked Upload) ─────────────────────────────
export const uploadDrawingChunk = async (req, res) => {
  try {
    const uploadId = req.query.uploadId || req.body.uploadId;
    const chunkIndex = req.query.chunkIndex || req.body.chunkIndex;
    const { totalChunks, fileName, isBom } = req.body;

    if (!req.file) return res.status(400).json({ success: false, message: 'Chunk file missing' });

    const cIdx = parseInt(chunkIndex);
    const tChunks = parseInt(totalChunks);

    if (cIdx === tChunks - 1) {
      const finalDir = 'uploads/drawings';
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

      return res.json({ success: true, message: 'Upload complete', file_path: `uploads/drawings/${finalName}` });
    }

    res.json({ success: true, message: 'Chunk uploaded' });
  } catch (err) {
    console.error('uploadDrawingChunk error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteDrawingsByCustomer = async (req, res) => {
  try {
    const { customer } = req.params;
    // Find all files to delete from disk
    const rows = await query('SELECT file_path, bom FROM drawings WHERE customer = ?', [customer]);
    for (const row of rows) {
      if (row.file_path) {
        const fullPath = path.join(process.cwd(), row.file_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      }
      if (row.bom) {
        const bomPath = path.join(process.cwd(), row.bom);
        if (fs.existsSync(bomPath)) fs.unlinkSync(bomPath);
      }
    }
    await execute('DELETE FROM drawings WHERE customer = ?', [customer]);
    res.json({ success: true, message: `All drawings for customer ${customer} deleted` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
