// controllers/bearingCupController.js
import { query, queryOne, execute } from '../db/db.js';
import ExcelJS from 'exceljs';
import { emitToAll } from '../utils/socket.js';

const parseUser = (req) => req.user?.username || req.user?.name || 'system';

// ── GET /api/bearing-cup-plans?date=YYYY-MM-DD ────────────────────────────────
export const getPlanByDate = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date is required (YYYY-MM-DD)' });
    const rows = await query(
      `SELECT * FROM bearing_cup_plans WHERE plan_date = ? ORDER BY jt_type ASC, type ASC`,
      [date]
    );

    // Fetch previous day's plan to compute carry overs (previous_diff)
    const lastDateRow = await queryOne(
      `SELECT plan_date FROM bearing_cup_plans WHERE plan_date < ? ORDER BY plan_date DESC LIMIT 1`,
      [date]
    );

    let lastDayRows = [];
    if (lastDateRow) {
      lastDayRows = await query(
        `SELECT * FROM bearing_cup_plans WHERE plan_date = ?`,
        [lastDateRow.plan_date]
      );
    }

    const carryOvers = [];
    lastDayRows.forEach(lr => {
      const diff = lr.total_qty - lr.target; // total products made - target
      if (diff !== 0) {
        const exists = rows.find(r => r.jt_type === lr.jt_type && r.type === lr.type);
        if (exists) {
          // Only set it if it's not already set in DB, or we can always override to keep it synced
          exists.previous_diff = diff;
        } else {
          // If not in today's rows, create synthetic row
          carryOvers.push({
            id: null,
            plan_date: date,
            jt_type: lr.jt_type,
            type: lr.type,
            target: 0,
            total_qty: 0,
            shift1_qty: 0, shift2_qty: 0, shift3_qty: 0,
            previous_diff: diff,
            is_synthetic: true
          });
        }
      }
    });

    const finalRows = [...rows, ...carryOvers].sort((a, b) => {
      if (a.jt_type === b.jt_type) return a.type.localeCompare(b.type);
      return a.jt_type.localeCompare(b.jt_type);
    });

    res.json({ success: true, data: finalRows, date });
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
      const { jt_type, type, target = 0, total_qty = 0, previous_diff = 0, employee_count = 1 } = row;
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
        let updateSql = `UPDATE bearing_cup_plans SET target=?, total_qty=?, previous_diff=?, employee_count=?, updated_by=?`;
        const params = [target, total_qty, previous_diff, employee_count, updatedBy];
        
        shiftKeys.forEach(k => {
          updateSql += `, ${k}=?`;
          params.push(shiftValues[k]);
        });
        
        updateSql += ` WHERE id=?`;
        params.push(existing.id);
        await execute(updateSql, params);
      } else {
        let cols = 'plan_date, jt_type, type, target, total_qty, previous_diff, employee_count, created_by, updated_by';
        let placeholders = '?, ?, ?, ?, ?, ?, ?, ?, ?';
        const params = [date, jt_type, type, target, total_qty, previous_diff, employee_count, updatedBy, updatedBy];
        
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
    emitToAll('bearing-cup:changed', { action: 'upsert', date });
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
    const headers = ['JT Type', 'Type', 'Previous Diff', 'Shift 1', 'Shift 2', 'Shift 3', 'Actual', 'Total Target'];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    headerRow.alignment = { horizontal: 'center' };

    ws.columns = [
      { width: 20 }, { width: 10 }, { width: 15 }, { width: 12 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 15 },
    ];

    rows.forEach(r => {
      const row = ws.addRow([
        r.jt_type, r.type, r.previous_diff || 0, r.shift1_qty, r.shift2_qty, r.shift3_qty, r.target, r.total_qty
      ]);
      
      const diff = r.total_qty - r.target;
      const color = diff < 0 ? 'FFFEE2E2' : (diff === 0 ? 'FFD1FAE5' : 'FFDBEAFE');
      
      row.eachCell((cell) => {
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.alignment = { horizontal: 'center' };
      });
      
      // Highlight the Actual column based on comparison with Total Target
      const actualCell = row.getCell(7); // Actual
      const totalCell = row.getCell(8); // Total Target
      if (r.target > r.total_qty) {
        actualCell.font = { color: { argb: 'FF008000' }, bold: true }; // Green if exceeded
      } else if (r.target < r.total_qty && r.target > 0) {
        actualCell.font = { color: { argb: 'FFFF0000' }, bold: true }; // Red if shortfall
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

// ── GET /api/bearing-cup-plans/jt-summary?from=YYYY-MM-DD&to=YYYY-MM-DD ──────
// Returns per JT type: G qty, NG qty, Total qty — for a date range
export const getJtTypeSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: 'from and to dates are required' });

    // Detailed rows: each day's breakdown per jt_type and type (G/NG)
    const rows = await query(
      `SELECT plan_date, jt_type, type, total_qty
       FROM bearing_cup_plans
       WHERE plan_date BETWEEN ? AND ?
         AND jt_type IS NOT NULL AND jt_type != ''
       ORDER BY plan_date ASC, jt_type ASC, type ASC`,
      [from, to]
    );

    // byDate: { 'YYYY-MM-DD': { 'JT_TYPE': { G: 0, NG: 0 } } }
    const byDate = {};
    // totalsMap: { 'JT_TYPE': { G: 0, NG: 0 } }
    const totalsMap = {};

    rows.forEach(r => {
      const d = r.plan_date instanceof Date
        ? r.plan_date.toISOString().slice(0, 10)
        : String(r.plan_date).slice(0, 10);
      const jt = r.jt_type;
      const type = r.type; // 'G' or 'NG'
      const qty = Number(r.total_qty) || 0;

      if (!byDate[d]) byDate[d] = {};
      if (!byDate[d][jt]) byDate[d][jt] = { G: 0, NG: 0 };
      byDate[d][jt][type] = (byDate[d][jt][type] || 0) + qty;

      if (!totalsMap[jt]) totalsMap[jt] = { G: 0, NG: 0 };
      totalsMap[jt][type] = (totalsMap[jt][type] || 0) + qty;
    });

    // Flatten totals into array sorted by jt_type
    const totals = Object.entries(totalsMap)
      .map(([jt_type, v]) => ({
        jt_type,
        G: v.G || 0,
        NG: v.NG || 0,
        total: (v.G || 0) + (v.NG || 0),
      }))
      .sort((a, b) => a.jt_type.localeCompare(b.jt_type));

    res.json({ success: true, byDate, totals, from, to });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
