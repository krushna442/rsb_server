// controllers/bearingCupController.js
import { query, queryOne, execute } from '../db/db.js';
import ExcelJS from 'exceljs';

const parseUser = (req) => req.user?.username || req.user?.name || 'system';

const JT_TYPES = ['14K JT', '17K JT', '225 JT', '325 JT', '490 JT', '590 JT', '590 JT IA', '620 JT'];

// ── GET /api/bearing-cup-plans?date=YYYY-MM-DD ────────────────────────────────
export const getPlanByDate = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date is required (YYYY-MM-DD)' });
    const rows = await query(
      `SELECT * FROM bearing_cup_plans WHERE plan_date = ? ORDER BY jt_type ASC, type ASC`,
      [date]
    );
    // Build a structured map for the frontend
    const planMap = {};
    JT_TYPES.forEach(jt => { planMap[jt] = { G: null, NG: null }; });
    rows.forEach(r => {
      if (planMap[r.jt_type]) planMap[r.jt_type][r.type] = r;
    });
    res.json({ success: true, data: rows, planMap, date });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/bearing-cup-plans/dates ─────────────────────────────────────────
export const getAvailableDates = async (req, res) => {
  try {
    const rows = await query(`SELECT DISTINCT plan_date FROM bearing_cup_plans ORDER BY plan_date DESC`);
    res.json({ success: true, data: rows.map(r => r.plan_date) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/bearing-cup-plans  (upsert entire day's plan) ───────────────────
// Body: { date: 'YYYY-MM-DD', rows: [{ jt_type, type, shift1_qty, shift2_qty, shift3_qty, target, total_qty }] }
export const upsertPlan = async (req, res) => {
  try {
    const { date, rows: planRows } = req.body;
    if (!date || !Array.isArray(planRows)) {
      return res.status(400).json({ success: false, message: 'date and rows[] are required' });
    }
    const updatedBy = parseUser(req);
    for (const row of planRows) {
      const { jt_type, type, target = 0, total_qty = 0 } = row;
      if (!jt_type || !['G', 'NG'].includes(type)) continue;

      // Extract all shiftX_qty keys
      const shiftKeys = Object.keys(row).filter(k => /^shift\d+_qty$/.test(k));
      const shiftValues = {};
      shiftKeys.forEach(k => { shiftValues[k] = parseInt(row[k]) || 0; });

      const existing = await queryOne(
        'SELECT id FROM bearing_cup_plans WHERE plan_date = ? AND jt_type = ? AND type = ?',
        [date, jt_type, type]
      );

      if (existing) {
        let updateSql = `UPDATE bearing_cup_plans SET target=?, total_qty=?, updated_by=?`;
        const params = [target, total_qty, updatedBy];
        
        shiftKeys.forEach(k => {
          updateSql += `, ${k}=?`;
          params.push(shiftValues[k]);
        });
        
        updateSql += ` WHERE id=?`;
        params.push(existing.id);
        await execute(updateSql, params);
      } else {
        let cols = 'plan_date, jt_type, type, target, total_qty, created_by, updated_by';
        let placeholders = '?, ?, ?, ?, ?, ?, ?';
        const params = [date, jt_type, type, target, total_qty, updatedBy, updatedBy];
        
        shiftKeys.forEach(k => {
          cols += `, ${k}`;
          placeholders += `, ?`;
          params.push(shiftValues[k]);
        });
        
        await execute(
          `INSERT INTO bearing_cup_plans (${cols}) VALUES (${placeholders})`,
          params
        );
      }
    }
    const updated = await query('SELECT * FROM bearing_cup_plans WHERE plan_date = ? ORDER BY jt_type ASC, type ASC', [date]);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/bearing-cup-plans/summary  (date range summary) ─────────────────
export const getPlanSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = `SELECT * FROM bearing_cup_plans`;
    const params = [];
    if (from && to) {
      sql += ` WHERE plan_date BETWEEN ? AND ?`;
      params.push(from, to);
    }
    sql += ` ORDER BY plan_date ASC, jt_type ASC, type ASC`;
    const rows = await query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** GET /api/bearing-cup-plans/export?date=YYYY-MM-DD */
export const exportPlan = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date is required' });

    const rows = await query(
      `SELECT * FROM bearing_cup_plans WHERE plan_date = ? ORDER BY jt_type ASC, type ASC`,
      [date]
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bearing Cup Plan');

    // Title
    ws.mergeCells('A1:G1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `Bearing Cup Plan — ${date}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    titleCell.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    // Headers
    const headers = ['JT Type', 'Type', 'Shift 1', 'Shift 2', 'Shift 3', 'Actual', 'Total Target'];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    headerRow.alignment = { horizontal: 'center' };

    ws.columns = [
      { width: 20 }, { width: 10 }, { width: 12 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 15 },
    ];

    rows.forEach(r => {
      const row = ws.addRow([
        r.jt_type, r.type, r.shift1_qty, r.shift2_qty, r.shift3_qty, r.target, r.total_qty
      ]);
      
      const diff = r.total_qty - r.target;
      const color = diff < 0 ? 'FFFEE2E2' : (diff === 0 ? 'FFD1FAE5' : 'FFDBEAFE');
      
      row.eachCell((cell) => {
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.alignment = { horizontal: 'center' };
      });
      
      // Highlight the diff column implicitly by showing total_qty logic
      const targetCell = row.getCell(6); // Actual
      const totalCell = row.getCell(7); // Total Target
      if (r.target < r.total_qty) {
        targetCell.font = { color: { argb: 'FFFF0000' }, bold: true };
      } else if (r.target >= r.total_qty && r.total_qty > 0) {
        targetCell.font = { color: { argb: 'FF008000' }, bold: true };
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bearing_cup_plan_${date}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
