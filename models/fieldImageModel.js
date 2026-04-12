import { query, queryOne, execute } from '../db/db.js';
import fs from 'fs';

// ─── Valid field names this table accepts ─────────────────────────────────────
// These correspond to the 4 spec fields the frontend exposes.
export const VALID_FIELD_NAMES = [
  'mountingDetailsFlangeYoke',
  'mountingDetailsCouplingFlange',
  'availableNoiseDeadener',
  'couplingFlangeOrientations',
];

// ─── READ ─────────────────────────────────────────────────────────────────────

/**
 * Get all records (optionally filtered by field_name).
 */
export const findAllFieldImages = async (field_name = null) => {
  try {
    let sql = 'SELECT * FROM field_images WHERE 1=1';
    const values = [];

    if (field_name) {
      sql += ' AND field_name = ?';
      values.push(field_name);
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await query(sql, values);
    return rows;
  } catch (error) {
    console.error('Error in findAllFieldImages:', error);
    throw error;
  }
};

/**
 * Get all records for a specific field_name.
 * Returns an object keyed by option_value → file_path for easy lookup.
 */
export const findFieldImagesByField = async (field_name) => {
  try {
    const rows = await query(
      'SELECT * FROM field_images WHERE field_name = ? ORDER BY option_value ASC',
      [field_name]
    );
    return rows;
  } catch (error) {
    console.error('Error in findFieldImagesByField:', error);
    throw error;
  }
};

/**
 * Get a single record by id.
 */
export const findFieldImageById = async (id) => {
  try {
    return await queryOne('SELECT * FROM field_images WHERE id = ?', [id]);
  } catch (error) {
    console.error('Error in findFieldImageById:', error);
    throw error;
  }
};

// ─── CREATE / UPSERT ──────────────────────────────────────────────────────────

/**
 * Insert or replace a field image record.
 * If a record with the same (field_name, option_value) already exists,
 * the old file is deleted from disk and the record is updated.
 *
 * @param {string} field_name    - e.g. "mountingDetailsFlangeYoke"
 * @param {string} option_value  - e.g. "F/Y 150 DIA 4 HOLES"
 * @param {string} file_path     - relative path saved by multer
 * @param {string|null} created_by
 */
export const upsertFieldImage = async (field_name, option_value, file_path, created_by = null) => {
  try {
    if (!VALID_FIELD_NAMES.includes(field_name)) {
      throw new Error(
        `Invalid field_name "${field_name}". Must be one of: ${VALID_FIELD_NAMES.join(', ')}`
      );
    }
    if (!option_value) throw new Error('option_value is required');
    if (!file_path)    throw new Error('file_path is required');

    // Check if a record already exists for this field + option combo
    const existing = await queryOne(
      'SELECT id, file_path FROM field_images WHERE field_name = ? AND option_value = ? LIMIT 1',
      [field_name, option_value]
    );

    if (existing) {
      // Delete old file from disk
      try {
        if (existing.file_path && fs.existsSync(existing.file_path)) {
          fs.unlinkSync(existing.file_path);
        }
      } catch (err) {
        console.warn('Old file delete warning:', err.message);
      }

      // Update record
      await execute(
        `UPDATE field_images
           SET file_path   = ?,
               modified_by = ?,
               updated_at  = NOW()
         WHERE id = ?`,
        [file_path, created_by, existing.id]
      );

      return findFieldImageById(existing.id);
    }

    // Insert new record
    const result = await execute(
      `INSERT INTO field_images (field_name, option_value, file_path, created_by, modified_by)
       VALUES (?, ?, ?, ?, ?)`,
      [field_name, option_value, file_path, created_by, created_by]
    );

    return findFieldImageById(result.insertId);
  } catch (error) {
    console.error('Error in upsertFieldImage:', error);
    throw error;
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

/**
 * Delete a field image record and the associated file from disk.
 */
export const deleteFieldImage = async (id) => {
  try {
    const record = await findFieldImageById(id);
    if (!record) throw new Error('Record not found');

    // Remove file from disk
    try {
      if (record.file_path && fs.existsSync(record.file_path)) {
        fs.unlinkSync(record.file_path);
      }
    } catch (err) {
      console.warn('File delete warning:', err.message);
    }

    await execute('DELETE FROM field_images WHERE id = ?', [id]);
    return true;
  } catch (error) {
    console.error('Error in deleteFieldImage:', error);
    throw error;
  }
};
