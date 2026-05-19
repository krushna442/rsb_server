// controllers/controlPlanController.js
import { query, queryOne, execute } from '../db/db.js';
import fs from 'fs';
import path from 'path';

const parseUser = (req) => req.user?.username || req.user?.name || 'system';

export const listControlPlans = async (req, res) => {
  try {
    const role = req.user?.role || 'viewer';
    const isAdmin = ['admin', 'super admin'].includes(role);
    const { active } = req.query; // ?active=1 filters inactive
    let sql = `SELECT * FROM control_plans WHERE is_latest = 1`;
    if (active === '1') sql += ` AND is_active = 1`;
    sql += ` ORDER BY line ASC, sequence_number ASC, name ASC`;
    const rows = await query(sql);
    let versionMap = {};
    if (isAdmin) {
      const allRows = await query(`SELECT id, name, version, rev_no, rev_date, created_at FROM control_plans ORDER BY name ASC, version ASC`);
      allRows.forEach(r => {
        if (!versionMap[r.name]) versionMap[r.name] = [];
        versionMap[r.name].push(r);
      });
    }
    res.json({ success: true, data: rows, versionMap: isAdmin ? versionMap : {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getControlPlan = async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM control_plans WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getControlPlanVersions = async (req, res) => {
  try {
    const base = await queryOne('SELECT name FROM control_plans WHERE id = ?', [req.params.id]);
    if (!base) return res.status(404).json({ success: false, message: 'Not found' });
    const rows = await query(`SELECT * FROM control_plans WHERE name = ? ORDER BY version DESC`, [base.name]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const addControlPlan = async (req, res) => {
  try {
    const { name, line, rev_no, rev_date, language, sequence_number } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name is required' });
    const file_path = req.file ? `uploads/control-plans/${req.file.filename}` : null;
    const createdBy = parseUser(req);
    const validLang = ['English', 'Hindi'].includes(language) ? language : 'English';
    const existing = await queryOne('SELECT id, version FROM control_plans WHERE name = ? AND is_latest = 1', [name]);
    let newVersion = 1;
    if (existing) {
      await execute('UPDATE control_plans SET is_latest = 0 WHERE name = ? AND is_latest = 1', [name]);
      newVersion = existing.version + 1;
    }
    const result = await execute(
      `INSERT INTO control_plans (name, line, rev_no, rev_date, file_path, language, version, is_latest, is_active, sequence_number, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      [name, line, rev_no || null, rev_date || null, file_path, validLang, newVersion, sequence_number || 0, createdBy]
    );
    const newRow = await queryOne('SELECT * FROM control_plans WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: newRow });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const editControlPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, line, rev_no, rev_date, language, is_active, sequence_number } = req.body;
    const updatedBy = parseUser(req);
    const updates = [];
    const vals = [];
    if (name !== undefined)      { updates.push('name=?');       vals.push(name); }
    if (line !== undefined)      { updates.push('line=?');       vals.push(line); }
    if (rev_no !== undefined)    { updates.push('rev_no=?');     vals.push(rev_no); }
    if (rev_date !== undefined)  { updates.push('rev_date=?');   vals.push(rev_date); }
    if (['English','Hindi'].includes(language)) { updates.push('language=?'); vals.push(language); }
    if (is_active !== undefined) { updates.push('is_active=?');  vals.push(is_active ? 1 : 0); }
    if (sequence_number !== undefined) { updates.push('sequence_number=?'); vals.push(sequence_number); }
    updates.push('updated_by=?'); vals.push(updatedBy);
    vals.push(id);
    await execute(`UPDATE control_plans SET ${updates.join(',')} WHERE id=?`, vals);
    const row = await queryOne('SELECT * FROM control_plans WHERE id = ?', [id]);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const addControlPlanVersion = async (req, res) => {
  try {
    const { id } = req.params;
    const { rev_no, rev_date } = req.body;
    const createdBy = parseUser(req);
    const existing = await queryOne('SELECT * FROM control_plans WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const file_path = req.file ? `uploads/control-plans/${req.file.filename}` : null;
    await execute('UPDATE control_plans SET is_latest = 0 WHERE name = ? AND is_latest = 1', [existing.name]);
    const maxVer = await queryOne('SELECT MAX(version) as mv FROM control_plans WHERE name = ?', [existing.name]);
    const newVersion = (maxVer?.mv || 0) + 1;
    const result = await execute(
      `INSERT INTO control_plans (name, line, rev_no, rev_date, file_path, language, version, parent_id, is_latest, is_active, sequence_number, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      [existing.name, existing.line, rev_no || existing.rev_no, rev_date || new Date().toISOString().slice(0, 10), file_path || existing.file_path, existing.language, newVersion, existing.id, existing.sequence_number || 0, createdBy]
    );
    const newRow = await queryOne('SELECT * FROM control_plans WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: newRow });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteControlPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryOne('SELECT * FROM control_plans WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    if (row.file_path) {
      const fullPath = path.join(process.cwd(), row.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    await execute('DELETE FROM control_plans WHERE id = ?', [id]);
    if (row.is_latest) {
      const prev = await queryOne('SELECT id FROM control_plans WHERE name = ? ORDER BY version DESC LIMIT 1', [row.name]);
      if (prev) await execute('UPDATE control_plans SET is_latest = 1 WHERE id = ?', [prev.id]);
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const toggleActiveControlPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryOne('SELECT id, is_active FROM control_plans WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    await execute('UPDATE control_plans SET is_active = ? WHERE id = ?', [row.is_active ? 0 : 1, id]);
    const updated = await queryOne('SELECT * FROM control_plans WHERE id = ?', [id]);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteControlPlansByLine = async (req, res) => {
  try {
    const { line } = req.params;
    // Find all files to delete from disk
    const rows = await query('SELECT file_path FROM control_plans WHERE line = ?', [line]);
    for (const row of rows) {
      if (row.file_path) {
        const fullPath = path.join(process.cwd(), row.file_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      }
    }
    await execute('DELETE FROM control_plans WHERE line = ?', [line]);
    res.json({ success: true, message: `All control plans for line ${line} deleted` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
