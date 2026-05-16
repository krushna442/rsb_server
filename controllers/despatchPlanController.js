// controllers/despatchPlanController.js
import { query } from '../db/db.js';
import { findDespatchMailEmails } from '../models/userModel.js';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ── helpers ───────────────────────────────────────────────────────────────────

function getPlanDate(d = new Date()) {
  const utcMs = d.getTime();
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  const istDate = new Date(istMs);
  if (istDate.getHours() < 6) istDate.setDate(istDate.getDate() - 1);
  return istDate.toISOString().slice(0, 10);
}

function buildTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function getDespatchEmails() {
  return await findDespatchMailEmails();
}

/** Fetch full plan (vehicles + pallets) ordered by priority */
async function fetchFullPlan(plan_date) {
  const [plan] = await query(`SELECT * FROM despatch_plans WHERE plan_date = ?`, [plan_date]);
  if (!plan) return null;
  const vehicles = await query(
    `SELECT * FROM despatch_vehicles WHERE plan_id = ?
     ORDER BY CASE WHEN priority_number IS NULL THEN 1 ELSE 0 END, priority_number ASC, vehicle_label ASC`,
    [plan.id]
  );
  for (const v of vehicles) {
    v.pallets = await query(
      `SELECT * FROM despatch_pallets WHERE vehicle_id = ? ORDER BY pallet_label`, [v.id]
    );
  }
  plan.vehicles = vehicles;
  return plan;
}

function isVehicleFulfilled(vehicle) {
  if (!vehicle.pallets || vehicle.pallets.length === 0) return false;
  return vehicle.pallets.every(p => p.is_fulfilled);
}

// ── Email: send per newly-completed vehicle ───────────────────────────────────

async function sendVehicleCompletionMail(vehicle, plan_date) {
  const emails = await getDespatchEmails();
  if (!emails.length) return;

  const rows = (vehicle.pallets || []).map(p => `
    <tr style="border-bottom:1px solid #ddd;">
      <td style="padding:8px 12px;">${p.part_number || '—'}</td>
      <td style="padding:8px 12px;">${p.tube_length || '—'}</td>
      <td style="padding:8px 12px;">${p.pallet_label || '—'}</td>
      <td style="padding:8px 12px;text-align:right;">${p.target_qty}</td>
      <td style="padding:8px 12px;text-align:right;background:${(p.filled_quantity||0) >= p.target_qty ? '#d4edda' : '#fff3cd'}">
        ${p.filled_quantity ?? 0}
      </td>
      <td style="padding:8px 12px;text-align:center;">${p.is_fulfilled ? '✅ Yes' : '⏳ No'}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
      <h2 style="background:#1e293b;color:white;padding:16px 20px;margin:0;border-radius:8px 8px 0 0;">
        🚛 Vehicle Completed — ${vehicle.vehicle_label}
      </h2>
      <p style="padding:12px 20px;background:#f8fafc;margin:0;color:#475569;">
        Date: <strong>${plan_date}</strong> &nbsp;|&nbsp;
        Vehicle: <strong>${vehicle.vehicle_label}</strong> &nbsp;|&nbsp;
        Customer: <strong>${vehicle.customer || '—'}</strong>
        ${vehicle.priority_number != null ? `&nbsp;|&nbsp; Priority: <strong>P${vehicle.priority_number}</strong>` : ''}
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
        <thead>
          <tr style="background:#334155;color:white;">
            <th style="padding:10px 12px;text-align:left;">Part Number</th>
            <th style="padding:10px 12px;text-align:left;">Tube Length</th>
            <th style="padding:10px 12px;text-align:left;">Pallet</th>
            <th style="padding:10px 12px;text-align:right;">Target Qty</th>
            <th style="padding:10px 12px;text-align:right;">Filled Qty</th>
            <th style="padding:10px 12px;text-align:center;">Fulfilled</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="padding:12px 20px;font-size:12px;color:#94a3b8;">
        Generated at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
      </p>
    </div>`;

  const transporter = buildTransporter();
  await transporter.sendMail({
    from: `"RSB Despatch" <${process.env.SMTP_USER}>`,
    to: emails.join(','),
    subject: `✅ ${vehicle.vehicle_label} (${vehicle.customer || ''}) Completed — ${plan_date}`,
    html,
  });
}

// ── Core scan-fill logic ──────────────────────────────────────────────────────

/**
 * On each successful scan:
 *  1. Find today's plan, ordered by priority_number ASC NULLS LAST
 *  2. Fill matching pallet (customer + part_number) up to target_qty
 *  3. NEVER exceed target_qty — stop filling that pallet when full
 *  4. When all pallets of a vehicle are fulfilled, mark vehicle complete & send email
 */
export async function fillPalletsFromScan(part_no, customer_name, scan_qty = 1) {
  try {
    const today = getPlanDate();
    const plan = await fetchFullPlan(today);

    // Also check previous day pending
    const prevDate = new Date(today + 'T00:00:00');
    prevDate.setDate(prevDate.getDate() - 1);
    const prevPlan = await fetchFullPlan(prevDate.toISOString().slice(0, 10));
    const prevPending = prevPlan ? prevPlan.vehicles.filter(v => !v.is_completed) : [];

    if (!plan && prevPending.length === 0) return [];

    const todayVehicles = plan ? plan.vehicles : [];
    // Previous pending vehicles first, then today's sorted by priority
    const orderedVehicles = [...prevPending, ...todayVehicles];

    const normalPn   = (part_no       || '').trim().toUpperCase();
    const normalCust = (customer_name || '').trim().toUpperCase();

    let remaining = scan_qty;
    const newlyCompletedVehicleIds = [];

    for (const v of orderedVehicles) {
      if (remaining <= 0) break;
      const vCust = (v.customer || '').trim().toUpperCase();
      if (vCust !== normalCust) continue;

      for (const p of v.pallets) {
        if (remaining <= 0) break;
        const pPn = (p.part_number || '').trim().toUpperCase();
        if (pPn !== normalPn) continue;

        const currentFilled = parseInt(p.filled_quantity) || 0;
        const target        = parseInt(p.target_qty) || 0;

        // Already full — skip completely, don't overflow
        if (target > 0 && currentFilled >= target) continue;

        const canTake  = target > 0 ? target - currentFilled : remaining;
        const take     = Math.min(remaining, canTake);
        const newFilled    = currentFilled + take;
        const isFulfilled  = target > 0 && newFilled >= target ? 1 : 0;

        await query(
          `UPDATE despatch_pallets SET filled_quantity = ?, is_fulfilled = ? WHERE id = ?`,
          [newFilled, isFulfilled, p.id]
        );
        p.filled_quantity = newFilled;
        p.is_fulfilled    = isFulfilled;
        remaining -= take;
      }

      // Re-check from DB whether vehicle is now complete
      const freshPallets = await query(
        `SELECT * FROM despatch_pallets WHERE vehicle_id = ?`, [v.id]
      );
      const allFulfilled = freshPallets.length > 0 && freshPallets.every(p => p.is_fulfilled);
      if (allFulfilled && !v.is_completed) {
        await query(
          `UPDATE despatch_vehicles SET is_completed = 1, completed_at = NOW() WHERE id = ?`, [v.id]
        );
        v.is_completed = 1;
        v.pallets = freshPallets; // use fresh data for email
        newlyCompletedVehicleIds.push(v.id);

        // Send individual vehicle completion mail
        sendVehicleCompletionMail(v, today).catch(console.error);
      }
    }

    return newlyCompletedVehicleIds;
  } catch (err) {
    console.error('fillPalletsFromScan error:', err);
    return [];
  }
}

// ── Plan CRUD ─────────────────────────────────────────────────────────────────

export async function getPlanByDate(req, res) {
  try {
    const plan_date = req.query.date || getPlanDate();
    const plan = await fetchFullPlan(plan_date);

    const prevDate = new Date(plan_date + 'T00:00:00');
    prevDate.setDate(prevDate.getDate() - 1);
    const prevPlan = await fetchFullPlan(prevDate.toISOString().slice(0, 10));
    const incompleteFromPrev = prevPlan ? prevPlan.vehicles.filter(v => !v.is_completed) : [];

    res.json({ success: true, plan, incompleteFromPrev });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function savePlan(req, res) {
  const { plan_date, vehicles } = req.body;
  if (!plan_date) return res.status(400).json({ success: false, message: 'plan_date required' });
  if (!Array.isArray(vehicles)) return res.status(400).json({ success: false, message: 'vehicles must be array' });

  try {
    await query(
      `INSERT INTO despatch_plans (plan_date, created_by) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE updated_at=NOW()`,
      [plan_date, req.user?.name || '']
    );
    const [plan] = await query(`SELECT id FROM despatch_plans WHERE plan_date = ?`, [plan_date]);

    const existingVehicles = await query(`SELECT id FROM despatch_vehicles WHERE plan_id = ?`, [plan.id]);
    for (const v of existingVehicles) {
      await query(`DELETE FROM despatch_pallets WHERE vehicle_id = ?`, [v.id]);
    }
    await query(`DELETE FROM despatch_vehicles WHERE plan_id = ?`, [plan.id]);

    for (const v of vehicles) {
      const vResult = await query(
        `INSERT INTO despatch_vehicles (plan_id, vehicle_label, customer, priority_number, is_completed) VALUES (?, ?, ?, ?, ?)`,
        [plan.id, v.vehicle_label, v.customer || null,
         v.priority_number !== undefined && v.priority_number !== '' ? parseInt(v.priority_number) : null,
         v.is_completed ? 1 : 0]
      );
      const vehicleId = vResult.insertId;
      for (const p of (v.pallets || [])) {
        let tube_length = p.tube_length || null;
        if (p.part_number && !tube_length) {
          const [prod] = await query(`SELECT specification FROM products WHERE part_number = ?`, [p.part_number]);
          if (prod?.specification) {
            try {
              const spec = typeof prod.specification === 'string' ? JSON.parse(prod.specification) : prod.specification;
              tube_length = spec.tubeLength || null;
            } catch (e) {}
          }
        }
        await query(
          `INSERT INTO despatch_pallets (vehicle_id, pallet_label, part_number, tube_length, target_qty, filled_quantity, scanned_qty, is_fulfilled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [vehicleId, p.pallet_label, p.part_number || null, tube_length,
           parseInt(p.target_qty) || 0, parseInt(p.filled_quantity) || 0,
           parseInt(p.scanned_qty) || 0, p.is_fulfilled ? 1 : 0]
        );
      }
    }

    res.json({ success: true, message: 'Plan saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/** PATCH /api/despatch-plan/vehicles/:vehicleId/priority */
export async function updateVehiclePriority(req, res) {
  const { vehicleId } = req.params;
  const { priority_number } = req.body;
  try {
    await query(
      `UPDATE despatch_vehicles SET priority_number = ? WHERE id = ?`,
      [priority_number !== undefined && priority_number !== '' ? parseInt(priority_number) : null, vehicleId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function markVehicleComplete(req, res) {
  const { vehicleId } = req.params;
  try {
    await query(`UPDATE despatch_vehicles SET is_completed=1, completed_at=NOW() WHERE id=?`, [vehicleId]);
    const [v] = await query(
      `SELECT dv.*, dp.plan_date FROM despatch_vehicles dv
       JOIN despatch_plans dp ON dp.id = dv.plan_id WHERE dv.id=?`, [vehicleId]
    );
    if (v) {
      v.pallets = await query(`SELECT * FROM despatch_pallets WHERE vehicle_id = ?`, [vehicleId]);
      sendVehicleCompletionMail(v, v.plan_date).catch(console.error);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function triggerDailyReport(req, res) {
  try {
    const yesterday = getPlanDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await sendDailyExcelReport(yesterday);
    res.json({ success: true, message: `Report sent for ${yesterday}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── Matrix-style Excel: Part Number | Tube Length | V1 | V2 | ... ─────────────
// Row 1: (blank) | (blank) | V1 label | (blank) | V2 label | ...
// Row 2: Part Number | Tube Length | Customer | Pallet | Customer | Pallet | ...
// Data rows: part_number | tube_length | target_qty | pallet_label | ...

export async function sendDailyExcelReport(plan_date) {
  const plan   = await fetchFullPlan(plan_date);
  const emails = await getDespatchEmails();
  if (!emails.length) return;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Despatch Report');

  if (!plan || !plan.vehicles.length) {
    ws.addRow(['No plan data found for this date']);
  } else {
    const vehicles = plan.vehicles;

    // Row 1: blank, blank, V1, blank, V2, blank ...
    const row1Vals = ['Part Number', 'Tube Length'];
    vehicles.forEach(v => { row1Vals.push(v.vehicle_label, ''); });
    ws.addRow(row1Vals);

    // Row 2: blank, blank, Customer, Pallet, Customer, Pallet ...
    const row2Vals = ['', ''];
    vehicles.forEach(() => { row2Vals.push('Customer', 'Pallet'); });
    ws.addRow(row2Vals);

    // Fill customer name into Row2 customer cols
    vehicles.forEach((v, vi) => {
      const colIdx = 3 + vi * 2;
      ws.getRow(2).getCell(colIdx).value = v.customer || '';
    });

    // Style header rows
    [ws.getRow(1), ws.getRow(2)].forEach(r => {
      r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      r.alignment = { horizontal: 'center' };
    });
    // Merge vehicle label cells on row 1
    vehicles.forEach((_, vi) => {
      const colIdx = 3 + vi * 2;
      ws.mergeCells(1, colIdx, 1, colIdx + 1);
    });

    // Collect all unique part_number + tube_length combos
    const combos = [];
    const comboSet = new Set();
    for (const v of vehicles) {
      for (const p of v.pallets) {
        const key = `${p.part_number || ''}||${p.tube_length || ''}`;
        if (!comboSet.has(key)) {
          comboSet.add(key);
          combos.push({ part_number: p.part_number || '', tube_length: p.tube_length || '' });
        }
      }
    }

    for (const combo of combos) {
      const rowData = [combo.part_number, combo.tube_length];
      for (const v of vehicles) {
        const pallet = v.pallets.find(
          p => (p.part_number||'') === combo.part_number && (p.tube_length||'') === combo.tube_length
        );
        rowData.push(pallet ? pallet.target_qty : 0, pallet ? (pallet.pallet_label || '') : '');
      }
      const row = ws.addRow(rowData);
      row.eachCell(cell => {
        cell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
        cell.alignment = { horizontal: 'center' };
      });
    }

    // Column widths
    ws.getColumn(1).width = 18;
    ws.getColumn(2).width = 14;
    vehicles.forEach((_, vi) => {
      ws.getColumn(3 + vi * 2).width = 15;
      ws.getColumn(4 + vi * 2).width = 12;
    });
  }

  const tmpPath = path.join(os.tmpdir(), `despatch_${plan_date}.xlsx`);
  await wb.xlsx.writeFile(tmpPath);

  const transporter = buildTransporter();
  await transporter.sendMail({
    from: `"RSB Despatch" <${process.env.SMTP_USER}>`,
    to: emails.join(','),
    subject: `Daily Despatch Report — ${plan_date}`,
    html: `<p style="font-family:Arial;font-size:14px;">Please find attached the daily despatch report for <strong>${plan_date}</strong>.</p>`,
    attachments: [{ filename: `despatch_${plan_date}.xlsx`, path: tmpPath }],
  });
  fs.unlinkSync(tmpPath);
}

/** GET /api/despatch-plan/export — same matrix structure */
export async function exportPlan(req, res) {
  try {
    const plan_date = req.query.date || getPlanDate();
    const plan = await fetchFullPlan(plan_date);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Despatch Plan');

    if (!plan || !plan.vehicles.length) {
      ws.addRow(['No plan data found for this date']);
    } else {
      const vehicles = plan.vehicles;

      // Row 1: Part Number | Tube Length | V1 | | V2 | ...
      const row1 = ['Part Number', 'Tube Length'];
      vehicles.forEach(v => {
        row1.push(`${v.vehicle_label}${v.priority_number != null ? ` (P${v.priority_number})` : ''}`, '');
      });
      ws.addRow(row1);

      // Row 2: | | Customer | Pallet | Customer | Pallet ...
      const row2 = ['', ''];
      vehicles.forEach(v => { row2.push(v.customer || '', 'Pallet'); });
      ws.addRow(row2);

      // Style rows
      [ws.getRow(1), ws.getRow(2)].forEach(r => {
        r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        r.alignment = { horizontal: 'center' };
      });
      vehicles.forEach((_, vi) => {
        ws.mergeCells(1, 3 + vi * 2, 1, 4 + vi * 2);
      });

      // Combos
      const combos = [];
      const comboSet = new Set();
      for (const v of vehicles) {
        for (const p of v.pallets) {
          const key = `${p.part_number||''}||${p.tube_length||''}`;
          if (!comboSet.has(key)) {
            comboSet.add(key);
            combos.push({ part_number: p.part_number || '', tube_length: p.tube_length || '' });
          }
        }
      }

      for (const combo of combos) {
        const rowData = [combo.part_number, combo.tube_length];
        for (const v of vehicles) {
          const pallet = v.pallets.find(
            p => (p.part_number||'') === combo.part_number && (p.tube_length||'') === combo.tube_length
          );
          rowData.push(pallet ? pallet.target_qty : 0, pallet ? (pallet.pallet_label || '') : '');
        }
        const row = ws.addRow(rowData);
        row.eachCell((cell, colNum) => {
          if (colNum > 2) {
            const vIdx = Math.floor((colNum - 3) / 2);
            const v = vehicles[vIdx];
            if (v) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v.is_completed ? 'FFD4EDDA' : 'FFFFF3CD' } };
          }
          cell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
          cell.alignment = { horizontal: 'center' };
        });
      }

      ws.getColumn(1).width = 18;
      ws.getColumn(2).width = 14;
      vehicles.forEach((_, vi) => {
        ws.getColumn(3 + vi * 2).width = 15;
        ws.getColumn(4 + vi * 2).width = 12;
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="despatch_plan_${plan_date}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/** DELETE filled data — reset pallets for re-sync (optional utility) */
export async function updateScanData(req, res) {
  res.json({ success: true, message: 'Scan data is auto-synced via fillPalletsFromScan on each scan event.' });
}
