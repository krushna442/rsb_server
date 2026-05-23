// controllers/despatchPlanController.js
import { query } from '../db/db.js';
import { findDespatchMailEmails } from '../models/userModel.js';
import { emitToAll } from '../utils/socket.js';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ── Product type exclusion list ────────────────────────────────────────────────
const EXCLUDED_PRODUCT_TYPES = ['F1', 'F5'];

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

/** Fetch emails of users with despatch_mail = 1 */
async function getDespatchEmails() {
  return await findDespatchMailEmails();
}

/** Fetch full plan (vehicles + pallets) for a given plan_date */
async function fetchFullPlan(plan_date) {
  const [plan] = await query(`SELECT * FROM despatch_plans WHERE plan_date = ?`, [plan_date]);
  if (!plan) return null;
  // Order by is_completed ASC (incomplete first, completed last), then priority_number ASC NULLS LAST, then vehicle_label ASC
  const vehicles = await query(
    `SELECT * FROM despatch_vehicles WHERE plan_id = ?
     ORDER BY is_completed ASC,
              CASE WHEN priority_number IS NULL THEN 1 ELSE 0 END,
              priority_number ASC,
              vehicle_label ASC`,
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

/** Fetch all incomplete vehicles from past plans */
async function fetchPendingVehicles(beforeDate) {
  const vehicles = await query(
    `SELECT dv.*, dp.plan_date 
     FROM despatch_vehicles dv
     JOIN despatch_plans dp ON dp.id = dv.plan_id
     WHERE dp.plan_date < ? AND dv.is_completed = 0
     ORDER BY dp.plan_date ASC, 
              CASE WHEN dv.priority_number IS NULL THEN 1 ELSE 0 END, 
              dv.priority_number ASC, 
              dv.vehicle_label ASC`,
    [beforeDate]
  );
  
  for (const v of vehicles) {
    v.pallets = await query(
      `SELECT * FROM despatch_pallets WHERE vehicle_id = ? ORDER BY pallet_label`, [v.id]
    );
  }
  return vehicles;
}

function isVehicleFulfilled(vehicle) {
  if (!vehicle.pallets || vehicle.pallets.length === 0) return false;
  return vehicle.pallets.every(p => p.is_fulfilled);
}

/** Send completion mail for all completed vehicles on the day */
async function sendCompletionMail(allCompletedVehicles, plan_date) {
  const emails = await getDespatchEmails();
  if (!emails.length) return;

  const rows = allCompletedVehicles.flatMap(v =>
    v.pallets.map(p => ({
      vehicle: v.vehicle_label,
      customer: v.customer || '—',
      pallet: p.pallet_label,
      partNumber: p.part_number || '—',
      tubeLength: p.tube_length || '—',
      target: p.target_qty,
      filled: p.filled_quantity ?? p.scanned_qty,
    }))
  );

  const tableRows = rows.map(r => `
    <tr style="border-bottom:1px solid #ddd;">
      <td style="padding:8px 12px;background:#d4edda">${r.vehicle}</td>
      <td style="padding:8px 12px">${r.customer}</td>
      <td style="padding:8px 12px">${r.pallet}</td>
      <td style="padding:8px 12px">${r.partNumber}</td>
      <td style="padding:8px 12px">${r.tubeLength}</td>
      <td style="padding:8px 12px;text-align:right">${r.target}</td>
      <td style="padding:8px 12px;text-align:right;background:${r.filled >= r.target ? '#d4edda' : '#fff3cd'}">${r.filled}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;">
      <h2 style="background:#1e293b;color:white;padding:16px 20px;margin:0;border-radius:8px 8px 0 0;">
        🚛 Despatch Plan — Vehicle Completion Report
      </h2>
      <p style="padding:12px 20px;background:#f8fafc;margin:0;color:#475569;">
        Date: <strong>${plan_date}</strong> &nbsp;|&nbsp;
        Completed vehicles: <strong>${allCompletedVehicles.map(v => v.vehicle_label).join(', ')}</strong>
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
        <thead>
          <tr style="background:#334155;color:white;">
            <th style="padding:10px 12px;text-align:left">Vehicle</th>
            <th style="padding:10px 12px;text-align:left">Customer</th>
            <th style="padding:10px 12px;text-align:left">Pallet</th>
            <th style="padding:10px 12px;text-align:left">Part Number</th>
            <th style="padding:10px 12px;text-align:left">Tube Length</th>
            <th style="padding:10px 12px;text-align:right">Target Qty</th>
            <th style="padding:10px 12px;text-align:right">Filled Qty</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="padding:12px 20px;font-size:12px;color:#94a3b8;">
        Green = fulfilled &nbsp;|&nbsp; Yellow = incomplete<br/>
        Generated at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
      </p>
    </div>`;

  const transporter = buildTransporter();
  await transporter.sendMail({
    from: `"RSB Despatch" <${process.env.SMTP_USER}>`,
    to: emails.join(','),
    subject: `Despatch Report — ${allCompletedVehicles.map(v => v.vehicle_label).join(', ')} Completed (${plan_date})`,
    html,
  });
}

// ── Core scan-fill logic ──────────────────────────────────────────────────────

/**
 * Distributes scan counts into pallets respecting:
 *  1. Priority number (lower = higher priority, NULL = last)
 *  2. Normal vehicle label order if no priority
 *  3. Pending (incomplete) vehicles from previous day are filled first
 *
 * Increments filled_quantity on each pallet row in the DB.
 * Returns list of newly-completed vehicle labels.
 */
export async function fillPalletsFromScan(part_no, customer_name, scan_qty = 1, product_type = null) {
  try {
    // Exclude F1 and F5 product types from despatch count
    if (product_type && EXCLUDED_PRODUCT_TYPES.includes((product_type || '').trim().toUpperCase())) {
      console.log(`[fillPalletsFromScan] Skipping scan for excluded product_type: ${product_type}`);
      return [];
    }
    const today = getPlanDate();

    // Gather today's plan + all previous pending vehicles
    const plan = await fetchFullPlan(today);
    const prevPendingVehicles = await fetchPendingVehicles(today);

    if (!plan && prevPendingVehicles.length === 0) return [];

    // Build ordered vehicle list: previous pending first, then today's by priority
    const todayVehicles = plan ? plan.vehicles : [];
    const orderedVehicles = [...prevPendingVehicles, ...todayVehicles];

    const normalPn = (part_no || '').trim().toUpperCase();
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
        const target = parseInt(p.target_qty) || 0;
        if (currentFilled >= target && target > 0) continue; // already full

        const canTake = target > 0 ? target - currentFilled : remaining;
        const take = Math.min(remaining, canTake);
        const newFilled = currentFilled + take;
        const isFulfilled = target > 0 && newFilled >= target ? 1 : 0;

        const currentFilledToday = parseInt(p.filled_today) || 0;
        const newFilledToday = currentFilledToday + take;
        await query(
          `UPDATE despatch_pallets SET filled_quantity = ?, filled_today = ?, is_fulfilled = ? WHERE id = ?`,
          [newFilled, newFilledToday, isFulfilled, p.id]
        );
        p.filled_quantity = newFilled;
        p.filled_today = newFilledToday;
        p.is_fulfilled = isFulfilled;
        remaining -= take;
      }

      // Check if vehicle is now fully done
      const freshPallets = await query(
        `SELECT * FROM despatch_pallets WHERE vehicle_id = ?`, [v.id]
      );
      const allFulfilled = freshPallets.length > 0 && freshPallets.every(p => p.is_fulfilled);
      if (allFulfilled && !v.is_completed) {
        await query(
          `UPDATE despatch_vehicles SET is_completed = 1, completed_at = NOW() WHERE id = ?`, [v.id]
        );
        newlyCompletedVehicleIds.push(v.id);
      }
    }

    // Send mail for any newly completed vehicles
    if (newlyCompletedVehicleIds.length > 0) {
      const allCompletedToday = [];
      const freshVehicles = await query(
        `SELECT dv.*, dp.plan_date FROM despatch_vehicles dv JOIN despatch_plans dp ON dp.id = dv.plan_id WHERE dv.id IN (?)`,
        [newlyCompletedVehicleIds]
      );
      for (const fv of freshVehicles) {
        fv.pallets = await query(`SELECT * FROM despatch_pallets WHERE vehicle_id = ?`, [fv.id]);
        allCompletedToday.push(fv);
      }
      sendCompletionMail(allCompletedToday, today).catch(console.error);
    }

    return newlyCompletedVehicleIds;
  } catch (err) {
    console.error('fillPalletsFromScan error:', err);
    return [];
  }
}

// ── Graph / Analytics ─────────────────────────────────────────────────────────

/** GET /api/despatch-plan/graph?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function getDespatchGraphData(req, res) {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: 'from and to query params are required' });

    // Vehicles per day
    const vehiclesPerDay = await query(
      `SELECT dp.plan_date, COUNT(dv.id) AS total_vehicles,
              SUM(dv.is_completed) AS completed_vehicles
       FROM despatch_plans dp
       LEFT JOIN despatch_vehicles dv ON dv.plan_id = dp.id
       WHERE dp.plan_date BETWEEN ? AND ?
       GROUP BY dp.plan_date
       ORDER BY dp.plan_date ASC`,
      [from, to]
    );

    // Part number wise total despatched pieces (from fulfilled pallets)
    const partNumberWise = await query(
      `SELECT dp2.part_number,
              SUM(dp2.filled_quantity) AS total_despatched,
              SUM(dp2.target_qty) AS total_target
       FROM despatch_plans dpln
       JOIN despatch_vehicles dv ON dv.plan_id = dpln.id
       JOIN despatch_pallets dp2 ON dp2.vehicle_id = dv.id
       WHERE dpln.plan_date BETWEEN ? AND ?
         AND dp2.part_number IS NOT NULL AND dp2.part_number != ''
       GROUP BY dp2.part_number
       ORDER BY total_despatched DESC`,
      [from, to]
    );

    res.json({ success: true, vehiclesPerDay, partNumberWise });
  } catch (err) {
    console.error('getDespatchGraphData error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/** GET /api/despatch-plan/export-range?from=YYYY-MM-DD&to=YYYY-MM-DD
 *  Returns an Excel workbook with one sheet per date containing despatch data.
 */
export async function exportDateRangePlan(req, res) {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: 'from and to are required' });

    // Get all plan dates in range
    const dates = await query(
      `SELECT DISTINCT plan_date FROM despatch_plans WHERE plan_date BETWEEN ? AND ? ORDER BY plan_date ASC`,
      [from, to]
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = 'RSB Despatch System';
    wb.created = new Date();

    if (dates.length === 0) {
      const ws = wb.addWorksheet('No Data');
      ws.addRow([`No despatch data found between ${from} and ${to}`]);
    } else {
      for (const { plan_date } of dates) {
        const dateStr = typeof plan_date === 'string' ? plan_date : new Date(plan_date).toISOString().slice(0, 10);
        const plan = await fetchFullPlan(dateStr);
        const ws = wb.addWorksheet(dateStr);

        if (!plan || !plan.vehicles || plan.vehicles.length === 0) {
          ws.addRow([`No plan data for ${dateStr}`]);
          continue;
        }

        const vehicles = plan.vehicles;

        // Header row 1: Vehicle labels spanning 4 cols each
        const row1Data = [];
        const row2Data = [];
        vehicles.forEach(v => {
          const vLabel = `${v.vehicle_label}${v.priority_number != null ? ` (P${v.priority_number})` : ''}`;
          row1Data.push('Part Number', 'Tube Length', vLabel, '');
          row2Data.push('', '', v.customer || '', 'Pallet');
        });

        const hRow1 = ws.addRow(row1Data);
        const hRow2 = ws.addRow(row2Data);

        [hRow1, hRow2].forEach(r => {
          r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
          r.alignment = { horizontal: 'center', wrapText: true };
        });

        const maxPallets = Math.max(...vehicles.map(v => v.pallets.length), 0);
        for (let i = 0; i < maxPallets; i++) {
          const rowData = [];
          for (const v of vehicles) {
            const p = v.pallets[i];
            if (p) {
              rowData.push(p.part_number || '', p.tube_length || '', `${p.filled_quantity ?? 0}/${p.target_qty}`, p.pallet_label || '');
            } else {
              rowData.push('', '', '', '');
            }
          }
          const dataRow = ws.addRow(rowData);
          dataRow.eachCell((cell, colNum) => {
            const vIdx = Math.floor((colNum - 1) / 4);
            const v = vehicles[vIdx];
            const p = v ? v.pallets[i] : null;
            if (v && p) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v.is_completed ? 'FFD4EDDA' : p.is_fulfilled ? 'FFD4EDDA' : 'FFFFF3CD' } };
            }
            cell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
            cell.alignment = { horizontal: 'center' };
          });
        }

        vehicles.forEach((_, vi) => {
          const start = 1 + vi * 4;
          ws.getColumn(start).width = 18;
          ws.getColumn(start + 1).width = 14;
          ws.getColumn(start + 2).width = 12;
          ws.getColumn(start + 3).width = 10;
        });

        // Summary row
        const summaryRow = ws.addRow([`${vehicles.filter(v => v.is_completed).length}/${vehicles.length} vehicles complete`]);
        summaryRow.font = { bold: true, italic: true, color: { argb: 'FF475569' } };
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="despatch_${from}_to_${to}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportDateRangePlan error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── Plan CRUD ─────────────────────────────────────────────────────────────────

export async function getPlanByDate(req, res) {
  try {
    const plan_date = req.query.date || getPlanDate();
    const plan = await fetchFullPlan(plan_date);

    const incompleteFromPrev = await fetchPendingVehicles(plan_date);

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

    // Full replace strategy
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
          if (prod && prod.specification) {
            try {
              const spec = typeof prod.specification === 'string' ? JSON.parse(prod.specification) : prod.specification;
              tube_length = spec.tubeLength || null;
            } catch (e) {}
          }
        }
        await query(
          `INSERT INTO despatch_pallets (vehicle_id, pallet_label, part_number, tube_length, target_qty, filled_quantity, scanned_qty, filled_today, is_fulfilled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [vehicleId, p.pallet_label, p.part_number || null, tube_length,
           parseInt(p.target_qty) || 0, parseInt(p.filled_quantity) || 0,
           parseInt(p.scanned_qty) || 0, 0, p.is_fulfilled ? 1 : 0]
        );
      }
    }

    res.json({ success: true, message: 'Plan saved' });
    emitToAll('despatch-plan:changed', { action: 'save' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/** Update priority number for a vehicle */
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

export async function updateScanData(req, res) {
  const { plan_date, scannedData } = req.body;
  if (!plan_date) return res.status(400).json({ success: false, message: 'plan_date required' });

  try {
    const plan = await fetchFullPlan(plan_date);
    if (!plan) return res.status(404).json({ success: false, message: 'No plan found for this date' });

    const prevPendingVehicles = await fetchPendingVehicles(plan_date);
    const orderedVehicles = [...prevPendingVehicles, ...plan.vehicles];
    const newlyCompleted = [];

    // Reset ONLY today's scans for all ordered vehicles (idempotency reset)
    for (const v of orderedVehicles) {
      const isTodayPlan = v.plan_id === plan.id;
      const hasTodayScans = v.pallets.some(p => (parseInt(p.filled_today) || 0) > 0);
      if (isTodayPlan || hasTodayScans) {
        if (v.is_completed) {
          await query(`UPDATE despatch_vehicles SET is_completed = 0, completed_at = NULL WHERE id = ?`, [v.id]);
          v.is_completed = false;
        }
      }
      for (const p of v.pallets) {
        if (p.filled_today > 0 || isTodayPlan) {
          // If it's a today's vehicle, reset completely. If pending, subtract filled_today.
          const resetQty = isTodayPlan ? 0 : Math.max(0, parseInt(p.filled_quantity) - parseInt(p.filled_today));
          await query(`UPDATE despatch_pallets SET filled_quantity = ?, filled_today = 0, is_fulfilled = 0 WHERE id = ?`, [resetQty, p.id]);
          p.filled_quantity = resetQty;
          p.filled_today = 0;
          p.is_fulfilled = 0;
        }
      }
    }

    // Build scan map keyed by customer||part_number
    const remainingScans = {};
    (scannedData || []).forEach(s => {
      const key = `${(s.customer || '').trim().toUpperCase()}||${(s.part_number || '').trim().toUpperCase()}`;
      remainingScans[key] = (remainingScans[key] || 0) + (parseInt(s.quantity) || 0);
    });

    // Fill pallets in vehicle priority order
    for (const v of orderedVehicles) {
      for (const p of v.pallets) {
        const key = `${(v.customer || '').trim().toUpperCase()}||${(p.part_number || '').trim().toUpperCase()}`;
        if ((remainingScans[key] || 0) > 0 && p.target_qty > 0) {
          const currentFilled = parseInt(p.filled_quantity) || 0;
          const target = parseInt(p.target_qty) || 0;
          if (currentFilled >= target) continue;

          const canTake = target - currentFilled;
          const take = Math.min(remainingScans[key], canTake);
          
          p.filled_quantity = currentFilled + take;
          p.filled_today = (parseInt(p.filled_today) || 0) + take;
          remainingScans[key] -= take;
        }
        
        const isFulfilled = p.target_qty > 0 && p.filled_quantity >= p.target_qty ? 1 : 0;
        if (p.filled_today > 0 || v.plan_id === plan.id) {
          await query(
            `UPDATE despatch_pallets SET filled_quantity = ?, filled_today = ?, scanned_qty = ?, is_fulfilled = ? WHERE id = ?`,
            [p.filled_quantity, p.filled_today, p.filled_quantity, isFulfilled, p.id]
          );
        }
        p.is_fulfilled = isFulfilled;
      }

      if (!v.is_completed && isVehicleFulfilled({ ...v, pallets: v.pallets })) {
        await query(`UPDATE despatch_vehicles SET is_completed=1, completed_at=NOW() WHERE id=?`, [v.id]);
        v.is_completed = 1;
        newlyCompleted.push(v);
      }
    }

    // Overflow pass for today's vehicles
    for (const v of plan.vehicles) {
      for (const p of v.pallets) {
        const key = `${(v.customer || '').trim().toUpperCase()}||${(p.part_number || '').trim().toUpperCase()}`;
        if ((remainingScans[key] || 0) > 0) {
          const take = remainingScans[key];
          p.filled_quantity += take;
          p.filled_today += take;
          remainingScans[key] = 0;
          
          const isFulfilled = p.target_qty > 0 && p.filled_quantity >= p.target_qty ? 1 : 0;
          await query(
            `UPDATE despatch_pallets SET filled_quantity = ?, filled_today = ?, scanned_qty = ?, is_fulfilled = ? WHERE id = ?`,
            [p.filled_quantity, p.filled_today, p.filled_quantity, isFulfilled, p.id]
          );
          p.is_fulfilled = isFulfilled;
        }
      }
    }

    if (newlyCompleted.length > 0) {
      const allCompletedToday = [];
      const newlyCompletedIds = newlyCompleted.map(v => v.id);
      const freshVehicles = await query(
        `SELECT dv.*, dp.plan_date FROM despatch_vehicles dv JOIN despatch_plans dp ON dp.id = dv.plan_id WHERE dv.id IN (?)`,
        [newlyCompletedIds]
      );
      for (const fv of freshVehicles) {
        fv.pallets = await query(`SELECT * FROM despatch_pallets WHERE vehicle_id = ?`, [fv.id]);
        allCompletedToday.push(fv);
      }
      sendCompletionMail(allCompletedToday, plan_date).catch(console.error);
    }

    const updatedPlan = await fetchFullPlan(plan_date);
    res.json({ success: true, plan: updatedPlan, newlyCompleted: newlyCompleted.map(v => v.vehicle_label) });
    emitToAll('despatch-plan:changed', { action: 'update-pallets', plan_date });
  } catch (err) {
    console.error(err);
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
      const plan = await fetchFullPlan(v.plan_date);
      const completedVehicles = plan.vehicles.filter(veh => veh.is_completed);
      sendCompletionMail(completedVehicles, v.plan_date).catch(console.error);
    }
    res.json({ success: true });
    emitToAll('despatch-plan:changed', { action: 'complete-vehicle' });
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

/** Build daily Excel: columns = Part Number, Tube Length, then one col per vehicle */
export async function sendDailyExcelReport(plan_date) {
  const plan = await fetchFullPlan(plan_date);
  const emails = await getDespatchEmails();
  if (!emails.length) return;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Despatch Report');

  if (!plan || !plan.vehicles.length) {
    ws.addRow(['No plan data found for this date']);
  } else {
    const vehicles = plan.vehicles;

    // Row 1: Part number | TUBE LENGTH | V1 | | ...
    const row1 = [];
    const row2 = [];
    vehicles.forEach(v => {
      row1.push('Part number', 'TUBE LENGTH', v.vehicle_label, '');
      row2.push('', '', v.customer || '', 'PALLET');
    });
    ws.addRow(row1);
    ws.addRow(row2);

    // Style header rows
    [ws.getRow(1), ws.getRow(2)].forEach(r => {
      r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      r.alignment = { horizontal: 'center' };
    });

    // Find max pallets
    const maxPallets = Math.max(...vehicles.map(v => v.pallets.length), 0);

    for (let i = 0; i < maxPallets; i++) {
      const rowData = [];
      for (const v of vehicles) {
        const p = v.pallets[i];
        if (p) {
          rowData.push(p.part_number, p.tube_length, `${p.filled_quantity ?? 0} / ${p.target_qty}`, p.pallet_label || '');
        } else {
          rowData.push('', '', '', '');
        }
      }
      const row = ws.addRow(rowData);
      row.eachCell((cell) => {
        cell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
        cell.alignment = { horizontal: 'center' };
      });
    }

    vehicles.forEach((_, vi) => {
      const start = 1 + vi * 4;
      ws.getColumn(start).width = 18;     // PN
      ws.getColumn(start + 1).width = 16; // TL
      ws.getColumn(start + 2).width = 12; // Qty
      ws.getColumn(start + 3).width = 12; // Pallet
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

/** GET /api/despatch-plan/export */
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

      // Row 1: Part number | TUBE LENGTH | V1 | | ...
      const row1 = [];
      const row2 = [];
      vehicles.forEach(v => {
        const vLabel = `${v.vehicle_label}${v.priority_number != null ? ` (P${v.priority_number})` : ''}`;
        row1.push('Part number', 'TUBE LENGTH', vLabel, '');
        row2.push('', '', v.customer || '', 'PALLET');
      });
      ws.addRow(row1);
      ws.addRow(row2);

      // Style header rows
      [ws.getRow(1), ws.getRow(2)].forEach(r => {
        r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        r.alignment = { horizontal: 'center' };
      });

      // Find max pallets
      const maxPallets = Math.max(...vehicles.map(v => v.pallets.length), 0);

      for (let i = 0; i < maxPallets; i++) {
        const rowData = [];
        for (const v of vehicles) {
          const p = v.pallets[i];
          if (p) {
            rowData.push(p.part_number, p.tube_length, `${p.filled_quantity ?? 0} / ${p.target_qty}`, p.pallet_label || '');
          } else {
            rowData.push('', '', '', '');
          }
        }
        const row = ws.addRow(rowData);
        row.eachCell((cell, colNum) => {
          const vIdx = Math.floor((colNum - 1) / 4);
          const v = vehicles[vIdx];
          const p = v ? v.pallets[i] : null;

          if (v && p) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v.is_completed ? 'FFD4EDDA' : 'FFFFF3CD' } };
          }
          cell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
          cell.alignment = { horizontal: 'center' };
        });
      }

      vehicles.forEach((_, vi) => {
        const start = 1 + vi * 4;
        ws.getColumn(start).width = 18;
        ws.getColumn(start + 1).width = 16;
        ws.getColumn(start + 2).width = 12;
        ws.getColumn(start + 3).width = 12;
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

export async function updateSingleVehicle(req, res) {
  const { vehicleId } = req.params;
  const v = req.body;
  try {
    const existing = await query(`SELECT * FROM despatch_pallets WHERE vehicle_id=?`, [vehicleId]);
    await query(`DELETE FROM despatch_pallets WHERE vehicle_id=?`, [vehicleId]);
    
    let allFulfilled = true;
    const processedPallets = [];

    for (const p of (v.pallets || [])) {
      let tube_length = p.tube_length || null;
      if (p.part_number && !tube_length) {
        const [prod] = await query(`SELECT specification FROM products WHERE part_number = ?`, [p.part_number]);
        if (prod && prod.specification) {
          try {
            const spec = typeof prod.specification === 'string' ? JSON.parse(prod.specification) : prod.specification;
            tube_length = spec.tubeLength || null;
          } catch (e) {}
        }
      }
      
      const ex = existing.find(e => e.pallet_label === p.pallet_label);
      
      // Allow editing filled_quantity. If sent from body, parse it; otherwise use DB value or 0.
      const filled_qty = p.filled_quantity !== undefined ? (parseInt(p.filled_quantity) || 0) : (ex ? ex.filled_quantity : 0);
      const filled_today = ex ? ex.filled_today : (parseInt(p.filled_today) || 0);
      const scanned_qty = p.scanned_qty !== undefined ? (parseInt(p.scanned_qty) || 0) : (ex ? ex.scanned_qty : filled_qty);
      
      const target_qty = parseInt(p.target_qty) || 0;
      const is_fulfilled = (target_qty > 0 && filled_qty >= target_qty) ? 1 : 0;

      if (target_qty === 0 || !is_fulfilled) {
        allFulfilled = false;
      }
      
      processedPallets.push({
        pallet_label: p.pallet_label,
        part_number: p.part_number || null,
        tube_length,
        target_qty,
        filled_qty,
        scanned_qty,
        filled_today,
        is_fulfilled
      });
    }

    // If there are no pallets, it's complete if v.is_completed is true
    const isCompleted = processedPallets.length > 0 ? (allFulfilled ? 1 : 0) : (v.is_completed ? 1 : 0);

    // Update the vehicle
    await query(
      `UPDATE despatch_vehicles SET vehicle_label=?, customer=?, priority_number=?, is_completed=? WHERE id=?`,
      [v.vehicle_label, v.customer || null, v.priority_number !== undefined && v.priority_number !== '' && v.priority_number !== null ? parseInt(v.priority_number) : null, isCompleted, vehicleId]
    );

    // Insert the pallets
    for (const p of processedPallets) {
      await query(
        `INSERT INTO despatch_pallets (vehicle_id, pallet_label, part_number, tube_length, target_qty, filled_quantity, scanned_qty, filled_today, is_fulfilled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vehicleId, p.pallet_label, p.part_number, p.tube_length, p.target_qty, p.filled_qty, p.scanned_qty, p.filled_today, p.is_fulfilled]
      );
    }
    
    res.json({ success: true, message: 'Vehicle updated' });
    emitToAll('despatch-plan:changed', { action: 'edit-vehicle' });
  } catch (err) {
    console.error('updateSingleVehicle error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

