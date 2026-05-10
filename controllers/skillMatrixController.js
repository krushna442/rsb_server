// controllers/skillMatrixController.js
import { query } from '../db/db.js';
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.API_URL || '';

// ── Machines ──────────────────────────────────────────────────────────────────

export async function listMachines(req, res) {
  try {
    const machines = await query(
      `SELECT m.*, 
        (SELECT COUNT(*) FROM skill_matrix_persons WHERE machine_id = m.id) AS person_count
       FROM skill_matrix_machines m ORDER BY m.machine_name`
    );
    // Fetch persons for each machine
    const result = await Promise.all(machines.map(async m => {
      const persons = await query(
        `SELECT * FROM skill_matrix_persons WHERE machine_id = ? ORDER BY name`, [m.id]
      );
      return { ...m, persons };
    }));
    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function addMachine(req, res) {
  const { machine_name, machine_no } = req.body;
  if (!machine_name) return res.status(400).json({ success: false, message: 'machine_name is required' });
  try {
    const result = await query(
      `INSERT INTO skill_matrix_machines (machine_name, machine_no, created_by) VALUES (?, ?, ?)`,
      [machine_name, machine_no || null, req.user?.name || '']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function editMachine(req, res) {
  const { id } = req.params;
  const { machine_name, machine_no } = req.body;
  try {
    await query(
      `UPDATE skill_matrix_machines SET machine_name=?, machine_no=? WHERE id=?`,
      [machine_name, machine_no || null, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteMachine(req, res) {
  const { id } = req.params;
  try {
    // Delete persons (and their photos) first
    const persons = await query(`SELECT photo_path FROM skill_matrix_persons WHERE machine_id = ?`, [id]);
    for (const p of persons) {
      if (p.photo_path) {
        const fp = path.join(process.cwd(), p.photo_path);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }
    await query(`DELETE FROM skill_matrix_persons WHERE machine_id = ?`, [id]);
    await query(`DELETE FROM skill_matrix_machines WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── Persons ───────────────────────────────────────────────────────────────────

export async function addPerson(req, res) {
  const { machine_id, name, department, date_of_joining, skill_level, last_skill_update_date, authorised_for } = req.body;
  const photo_path = req.file ? req.file.path.replace(/\\/g, '/') : null;
  if (!machine_id || !name) return res.status(400).json({ success: false, message: 'machine_id and name are required' });
  try {
    const result = await query(
      `INSERT INTO skill_matrix_persons 
        (machine_id, name, department, date_of_joining, skill_level, last_skill_update_date, authorised_for, photo_path, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [machine_id, name, department || null, date_of_joining || null, parseInt(skill_level) || 0,
       last_skill_update_date || null, authorised_for || null, photo_path, req.user?.name || '']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (photo_path && fs.existsSync(photo_path)) fs.unlinkSync(photo_path);
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function editPerson(req, res) {
  const { id } = req.params;
  const { name, department, date_of_joining, skill_level, last_skill_update_date, authorised_for } = req.body;
  try {
    const [existing] = await query(`SELECT photo_path FROM skill_matrix_persons WHERE id = ?`, [id]);
    let photo_path = existing?.photo_path || null;

    if (req.file) {
      // Delete old photo
      if (photo_path && fs.existsSync(path.join(process.cwd(), photo_path))) {
        fs.unlinkSync(path.join(process.cwd(), photo_path));
      }
      photo_path = req.file.path.replace(/\\/g, '/');
    }

    await query(
      `UPDATE skill_matrix_persons SET name=?, department=?, date_of_joining=?, skill_level=?,
       last_skill_update_date=?, authorised_for=?, photo_path=? WHERE id=?`,
      [name, department || null, date_of_joining || null, parseInt(skill_level) || 0,
       last_skill_update_date || null, authorised_for || null, photo_path, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deletePerson(req, res) {
  const { id } = req.params;
  try {
    const [existing] = await query(`SELECT photo_path FROM skill_matrix_persons WHERE id = ?`, [id]);
    if (existing?.photo_path) {
      const fp = path.join(process.cwd(), existing.photo_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await query(`DELETE FROM skill_matrix_persons WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
