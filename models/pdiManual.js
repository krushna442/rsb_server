import { query, queryOne, execute } from '../db/db.js';

// ─── GET ALL ─────────────────────────────────────────────
export const findAllPDIReports = async (user_id = null) => {
  try {
    let sql = 'SELECT * FROM pdi_report WHERE 1=1';
    const values = [];

    if (user_id) {
      sql += ' AND user_id = ?';
      values.push(user_id);
    }

    sql += ' ORDER BY created_at DESC';

    return await query(sql, values);
  } catch (error) {
    console.error('Error in findAllPDIReports:', error);
    throw error;
  }
};

// ─── GET BY ID ───────────────────────────────────────────
export const findPDIReportById = async (id) => {
  try {
    return await queryOne('SELECT * FROM pdi_report WHERE id = ?', [id]);
  } catch (error) {
    console.error('Error in findPDIReportById:', error);
    throw error;
  }
};

// ─── CREATE ──────────────────────────────────────────────
export const createPDIReport = async (name, file_path, user_id = null) => {
  try {
    if (!name) throw new Error('name is required');
    if (!file_path) throw new Error('file_path is required');

    const result = await execute(
      `INSERT INTO pdi_report (name, file_path, user_id)
       VALUES (?, ?, ?)`,
      [name, file_path, user_id]
    );

    return await findPDIReportById(result.insertId);
  } catch (error) {
    console.error('Error in createPDIReport:', error);
    throw error;
  }
};