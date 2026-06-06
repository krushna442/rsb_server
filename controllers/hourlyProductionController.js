// controllers/hourlyProductionController.js
import { query, queryOne, execute } from '../db/db.js';
import { emitToAll } from '../utils/socket.js';

const parseUser = (req) => req.user?.username || req.user?.name || 'system';
const PART_TYPES = ['front', 'rear', 'ia'];

// hour_slot 6–29: slot 6 = 06:00, slot 29 = 05:00 next day (24 hours from 6am)
const validSlot = (s) => {
  const n = parseInt(s, 10);
  return !isNaN(n) && n >= 6 && n <= 29;
};

// ── GET /api/hourly-production?date=YYYY-MM-DD ────────────────────────────────
export const getByDate = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date is required' });
    const rows = await query(
      `SELECT * FROM hourly_production WHERE production_date = ? ORDER BY hour_slot ASC, part_type ASC, id ASC`,
      [date]
    );
    res.json({ success: true, data: rows, date });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/hourly-production  (add one row) ────────────────────────────────
export const addRecord = async (req, res) => {
  try {
    const { production_date, hour_slot, part_type, tube_length, part_number, quantity, remarks } = req.body;
    if (!production_date || !validSlot(hour_slot) || !PART_TYPES.includes(part_type)) {
      return res.status(400).json({ success: false, message: 'production_date, hour_slot(6-29), part_type(front/rear/ia) required' });
    }
    const createdBy = parseUser(req);
    const result = await execute(
      `INSERT INTO hourly_production (production_date, hour_slot, part_type, tube_length, part_number, quantity, remarks, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [production_date, parseInt(hour_slot), part_type, tube_length || null, part_number || null, parseInt(quantity) || 0, remarks || null, createdBy, createdBy]
    );
    const newRow = await queryOne('SELECT * FROM hourly_production WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: newRow });
    emitToAll('hourly-production:changed', { action: 'create', date: production_date });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/hourly-production/:id  (update one row) ─────────────────────────
export const updateRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { tube_length, part_number, quantity, remarks } = req.body;
    const updatedBy = parseUser(req);
    await execute(
      `UPDATE hourly_production SET tube_length=?, part_number=?, quantity=?, remarks=?, updated_by=? WHERE id=?`,
      [tube_length || null, part_number || null, parseInt(quantity) || 0, remarks || null, updatedBy, id]
    );
    const row = await queryOne('SELECT * FROM hourly_production WHERE id = ?', [id]);
    res.json({ success: true, data: row });
    if (row) emitToAll('hourly-production:changed', { action: 'update', date: row.production_date instanceof Date ? row.production_date.toISOString().slice(0,10) : String(row.production_date).slice(0,10) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/hourly-production/:id ────────────────────────────────────────
export const deleteRecord = async (req, res) => {
  try {
    // Fetch date before deleting so we can include it in the event payload
    const existing = await queryOne('SELECT production_date FROM hourly_production WHERE id = ?', [req.params.id]);
    await execute('DELETE FROM hourly_production WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Deleted' });
    if (existing) {
      const date = existing.production_date instanceof Date ? existing.production_date.toISOString().slice(0,10) : String(existing.production_date).slice(0,10);
      emitToAll('hourly-production:changed', { action: 'delete', date });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/hourly-production/monthly?year=YYYY&month=MM ─────────────────────
export const getMonthlySummary = async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year and month required' });
    const paddedMonth = String(month).padStart(2, '0');
    const from = `${year}-${paddedMonth}-01`;
    // Last day of month
    const to = new Date(parseInt(year), parseInt(month), 0).toISOString().slice(0, 10);
    const rows = await query(
      `SELECT production_date,
              part_type,
              SUM(quantity) as total_qty
       FROM hourly_production
       WHERE production_date BETWEEN ? AND ?
       GROUP BY production_date, part_type
       ORDER BY production_date ASC, part_type ASC`,
      [from, to]
    );
    // Build day-wise matrix: { date: { front, rear, ia } }
    const matrix = {};
    rows.forEach(r => {
      const d = r.production_date instanceof Date
        ? r.production_date.toISOString().slice(0, 10)
        : String(r.production_date).slice(0, 10);
      if (!matrix[d]) matrix[d] = { front: 0, rear: 0, ia: 0 };
      matrix[d][r.part_type] = Number(r.total_qty) || 0;
    });
    // Compute cumulative
    let cumFront = 0, cumRear = 0, cumIa = 0;
    const daily = Object.entries(matrix).map(([date, v]) => {
      cumFront += v.front;
      cumRear  += v.rear;
      cumIa    += v.ia;
      return { date, front: v.front, rear: v.rear, ia: v.ia };
    });
    res.json({ success: true, data: daily, cumulative: { front: cumFront, rear: cumRear, ia: cumIa } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/hourly-production/available-dates ────────────────────────────────
export const getAvailableDates = async (req, res) => {
  try {
    const rows = await query(`SELECT DISTINCT production_date FROM hourly_production ORDER BY production_date DESC LIMIT 60`);
    res.json({ success: true, data: rows.map(r => {
      const d = r.production_date instanceof Date ? r.production_date.toISOString().slice(0,10) : String(r.production_date).slice(0,10);
      return d;
    })});
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/hourly-production/tube-length-summary?from=YYYY-MM-DD&to=YYYY-MM-DD ──
// Returns per-day, per-tube_length quantity aggregated; also includes a grand total
export const getTubeLengthSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: 'from and to dates are required' });

    // Row-level detail: date + tube_length + part_type + total qty
    const rows = await query(
      `SELECT
         production_date,
         COALESCE(NULLIF(TRIM(tube_length), ''), '(blank)') AS tube_length,
         SUM(quantity) AS qty
       FROM hourly_production
       WHERE production_date BETWEEN ? AND ?
         AND tube_length IS NOT NULL AND TRIM(tube_length) != ''
       GROUP BY production_date, tube_length
       ORDER BY production_date ASC, tube_length ASC`,
      [from, to]
    );

    // Shape: { byDate: { 'YYYY-MM-DD': [{ tube_length, qty }] }, totals: [{ tube_length, qty }] }
    const byDate = {};
    const totalsMap = {};

    rows.forEach(r => {
      const d = r.production_date instanceof Date
        ? r.production_date.toISOString().slice(0, 10)
        : String(r.production_date).slice(0, 10);
      const tl = r.tube_length;
      const qty = Number(r.qty) || 0;

      if (!byDate[d]) byDate[d] = [];
      byDate[d].push({ tube_length: tl, qty });

      totalsMap[tl] = (totalsMap[tl] || 0) + qty;
    });

    const totals = Object.entries(totalsMap)
      .map(([tube_length, qty]) => ({ tube_length, qty }))
      .sort((a, b) => a.tube_length.localeCompare(b.tube_length));

    res.json({ success: true, byDate, totals, from, to });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
