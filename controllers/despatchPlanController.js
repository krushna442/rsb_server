// controllers/despatchPlanController.js
import { query } from '../db/db.js';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Return the "plan date" for a given JS Date.
 *  One plan-day = 06:00 today → 05:59 tomorrow.
 *  If current time is before 06:00, the plan date is yesterday. */
function getPlanDate(d = new Date()) {
  const utcMs = d.getTime();
  // IST = UTC+5:30
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  const istDate = new Date(istMs);
  if (istDate.getHours() < 6) {
    istDate.setDate(istDate.getDate() - 1);
  }
  return istDate.toISOString().slice(0, 10); // YYYY-MM-DD
}

function buildTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function getAdminEmails() {
  const rows = await query(
    `SELECT email FROM users WHERE role IN ('admin','super admin') AND is_active=1`
  );
  return rows.map(r => r.email).filter(Boolean);
}

/** Fetch full plan data for a given plan_date */
async function fetchFullPlan(plan_date) {
  const [plan] = await query(`SELECT * FROM despatch_plans WHERE plan_date = ?`, [plan_date]);
  if (!plan) return null;
  const vehicles = await query(
    `SELECT * FROM despatch_vehicles WHERE plan_id = ? ORDER BY vehicle_label`, [plan.id]
  );
  for (const v of vehicles) {
    v.pallets = await query(
      `SELECT * FROM despatch_pallets WHERE vehicle_id = ? ORDER BY pallet_label`, [v.id]
    );
  }
  plan.vehicles = vehicles;
  return plan;
}

/** Check if all pallets of a vehicle are fulfilled */
function isVehicleFulfilled(vehicle) {
  if (!vehicle.pallets || vehicle.pallets.length === 0) return false;
  return vehicle.pallets.every(p => p.is_fulfilled);
}

/** Send vehicle completion mail */
async function sendCompletionMail(completedVehicles, plan_date) {
  const emails = await getAdminEmails();
  if (!emails.length) return;

  const rows = completedVehicles.flatMap(v =>
    v.pallets.map(p => ({
      vehicle: v.vehicle_label,
      customer: v.customer || '—',
      pallet: p.pallet_label,
      target: p.target_qty,
      scanned: p.scanned_qty,
    }))
  );

  const tableRows = rows.map(r => `
    <tr style="border-bottom:1px solid #ddd;">
      <td style="padding:8px 12px;background:${r.scanned >= r.target ? '#d4edda' : '#fff3cd'}">${r.vehicle}</td>
      <td style="padding:8px 12px">${r.customer}</td>
      <td style="padding:8px 12px">${r.pallet}</td>
      <td style="padding:8px 12px;text-align:right">${r.target}</td>
      <td style="padding:8px 12px;text-align:right;background:${r.scanned >= r.target ? '#d4edda' : '#fff3cd'}">${r.scanned}</td>
    </tr>`
  ).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
      <h2 style="background:#1e293b;color:white;padding:16px 20px;margin:0;border-radius:8px 8px 0 0;">
        🚛 Despatch Plan — Vehicle Completion Report
      </h2>
      <p style="padding:12px 20px;background:#f8fafc;margin:0;color:#475569;">
        Date: <strong>${plan_date}</strong> &nbsp;|&nbsp;
        Completed vehicles: <strong>${completedVehicles.map(v => v.vehicle_label).join(', ')}</strong>
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
        <thead>
          <tr style="background:#334155;color:white;">
            <th style="padding:10px 12px;text-align:left">Vehicle</th>
            <th style="padding:10px 12px;text-align:left">Customer</th>
            <th style="padding:10px 12px;text-align:left">Pallet</th>
            <th style="padding:10px 12px;text-align:right">Target Qty</th>
            <th style="padding:10px 12px;text-align:right">Scanned Qty</th>
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
    subject: `Despatch Report — ${completedVehicles.map(v => v.vehicle_label).join(', ')} Completed (${plan_date})`,
    html,
  });
}

/** Build and send the daily 6:05am Excel report */
export async function sendDailyExcelReport(plan_date) {
  const plan = await fetchFullPlan(plan_date);
  const emails = await getAdminEmails();
  if (!emails.length) return;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Despatch Report');

  // Header
  ws.mergeCells('A1:H1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Despatch Report — ${plan_date}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center' };
  ws.getRow(1).height = 28;

  // Column headers
  const headers = ['Vehicle', 'Customer', 'Pallet', 'Target Qty', 'Scanned Qty', 'Fulfilled', 'Status'];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  headerRow.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 20;

  ws.columns = [
    { width: 12 }, { width: 20 }, { width: 10 }, { width: 20 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 },
  ];

  const GREEN  = 'FFD4EDDA';
  const YELLOW = 'FFFFF3CD';

  if (plan) {
    for (const v of plan.vehicles) {
      const isComplete = v.is_completed;
      for (const p of v.pallets) {
        const row = ws.addRow([
          v.vehicle_label, v.customer || '—', p.pallet_label,
          p.target_qty, p.scanned_qty,
          p.is_fulfilled ? 'Yes' : 'No', isComplete ? 'Complete' : 'Incomplete'
        ]);
        const rowBg = isComplete
          ? 'FFD4EDDA' // green-50
          : p.is_fulfilled
          ? 'FFC3E6CB' // green-100
          : p.scanned_qty > 0
          ? 'FFFFF3CD' // yellow-50
          : 'FFFFFFFF'; // white
          
        row.eachCell(cell => {
          if (rowBg !== 'FFFFFFFF') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
          }
          cell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' },
          };
        });
      }
    }
  } else {
    ws.addRow(['No plan data found for this date']);
  }

  const tmpPath = path.join(os.tmpdir(), `despatch_${plan_date}.xlsx`);
  await wb.xlsx.writeFile(tmpPath);

  const transporter = buildTransporter();
  await transporter.sendMail({
    from: `"RSB Despatch" <${process.env.SMTP_USER}>`,
    to: emails.join(','),
    subject: `Daily Despatch Report — ${plan_date}`,
    html: `<p style="font-family:Arial;font-size:14px;">Please find attached the daily despatch report for <strong>${plan_date}</strong>.<br/>
      Green = Complete &nbsp;|&nbsp; Yellow = Incomplete.</p>`,
    attachments: [{ filename: `despatch_${plan_date}.xlsx`, path: tmpPath }],
  });
  fs.unlinkSync(tmpPath);
}

// ── Plan CRUD ─────────────────────────────────────────────────────────────────

export async function getPlanByDate(req, res) {
  try {
    const plan_date = req.query.date || getPlanDate();
    const plan = await fetchFullPlan(plan_date);

    // Also fetch yesterday's incomplete vehicles
    const prevDate = new Date(plan_date + 'T00:00:00');
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().slice(0, 10);
    const prevPlan = await fetchFullPlan(prevDateStr);
    const incompleteFromPrev = prevPlan
      ? prevPlan.vehicles.filter(v => !v.is_completed)
      : [];

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
    // Upsert plan
    await query(
      `INSERT INTO despatch_plans (plan_date, created_by) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE updated_at=NOW()`,
      [plan_date, req.user?.name || '']
    );
    const [plan] = await query(`SELECT id FROM despatch_plans WHERE plan_date = ?`, [plan_date]);

    // Clear existing vehicles and pallets for this plan (full replace strategy)
    const existingVehicles = await query(`SELECT id FROM despatch_vehicles WHERE plan_id = ?`, [plan.id]);
    for (const v of existingVehicles) {
      await query(`DELETE FROM despatch_pallets WHERE vehicle_id = ?`, [v.id]);
    }
    await query(`DELETE FROM despatch_vehicles WHERE plan_id = ?`, [plan.id]);

    // Re-insert
    for (const v of vehicles) {
      const vResult = await query(
        `INSERT INTO despatch_vehicles (plan_id, vehicle_label, customer, is_completed) VALUES (?, ?, ?, ?)`,
        [plan.id, v.vehicle_label, v.customer || null, v.is_completed ? 1 : 0]
      );
      const vehicleId = vResult.insertId;
      for (const p of (v.pallets || [])) {
        let tube_length = p.tube_length || null;
        
        // Auto-fetch tube_length if part_number is provided and tube_length is missing
        if (p.part_number && !tube_length) {
          const [prod] = await query(`SELECT specification FROM products WHERE part_number = ?`, [p.part_number]);
          if (prod && prod.specification) {
            try {
              const spec = typeof prod.specification === 'string' ? JSON.parse(prod.specification) : prod.specification;
              tube_length = spec.tubeLength || null;
            } catch (e) { /* ignore parse error */ }
          }
        }

        await query(
          `INSERT INTO despatch_pallets (vehicle_id, pallet_label, part_number, tube_length, target_qty, scanned_qty, is_fulfilled)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [vehicleId, p.pallet_label, p.part_number || null, tube_length,
           parseInt(p.target_qty) || 0, parseInt(p.scanned_qty) || 0, p.is_fulfilled ? 1 : 0]
        );
      }
    }

    res.json({ success: true, message: 'Plan saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateScanData(req, res) {
  /** Called when frontend wants to sync today's scan data into pallets */
  const { plan_date, scannedData } = req.body;
  // scannedData: [{ part_number, quantity }]
  if (!plan_date) return res.status(400).json({ success: false, message: 'plan_date required' });

  try {
    const plan = await fetchFullPlan(plan_date);
    if (!plan) return res.status(404).json({ success: false, message: 'No plan found for this date' });

    const previouslyCompleted = plan.vehicles.filter(v => v.is_completed).map(v => v.id);
    const newlyCompleted = [];

    // Build a map of remaining scan quantities
    const remainingScans = {};
    (scannedData || []).forEach(s => {
      const key = `${(s.customer || '').trim()}||${(s.part_number || '').trim()}`;
      remainingScans[key] = parseInt(s.quantity) || 0;
    });

    // Pass 1: Distribute up to target_qty for each pallet
    for (const v of plan.vehicles) {
      for (const p of v.pallets) {
        p.scanned_qty = 0; // reset
        const key = `${(v.customer || '').trim()}||${(p.part_number || '').trim()}`;
        if (remainingScans[key] > 0 && p.target_qty > 0) {
          const assign = Math.min(remainingScans[key], p.target_qty);
          p.scanned_qty = assign;
          remainingScans[key] -= assign;
        }
      }
    }

    // Pass 2: Dump any over-production into the first pallet that matches
    for (const v of plan.vehicles) {
      for (const p of v.pallets) {
        const key = `${(v.customer || '').trim()}||${(p.part_number || '').trim()}`;
        if (remainingScans[key] > 0) {
          p.scanned_qty += remainingScans[key];
          remainingScans[key] = 0;
        }
        
        const isFulfilled = p.target_qty > 0 && p.scanned_qty >= p.target_qty ? 1 : 0;
        await query(
          `UPDATE despatch_pallets SET scanned_qty=?, is_fulfilled=? WHERE id=?`,
          [p.scanned_qty, isFulfilled, p.id]
        );
        p.is_fulfilled = isFulfilled;
      }

      // Check if vehicle is now complete
      if (!v.is_completed && isVehicleFulfilled({ ...v, pallets: v.pallets })) {
        await query(
          `UPDATE despatch_vehicles SET is_completed=1, completed_at=NOW() WHERE id=?`, [v.id]
        );
        v.is_completed = 1;
        newlyCompleted.push(v);
      }
    }

    // Send mail for all newly completed vehicles + all previously completed
    if (newlyCompleted.length > 0) {
      const allCompleted = plan.vehicles.filter(v => v.is_completed || newlyCompleted.find(nc => nc.id === v.id));
      sendCompletionMail(allCompleted, plan_date).catch(console.error);
    }

    const updatedPlan = await fetchFullPlan(plan_date);
    res.json({ success: true, plan: updatedPlan, newlyCompleted: newlyCompleted.map(v => v.vehicle_label) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function markVehicleComplete(req, res) {
  const { vehicleId } = req.params;
  try {
    await query(
      `UPDATE despatch_vehicles SET is_completed=1, completed_at=NOW() WHERE id=?`, [vehicleId]
    );
    // Find the plan_date for mailing
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
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// Called by cron at 6:05am
export async function triggerDailyReport(req, res) {
  try {
    const yesterday = getPlanDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await sendDailyExcelReport(yesterday);
    res.json({ success: true, message: `Report sent for ${yesterday}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/** GET /api/despatch-plan/export?date=YYYY-MM-DD — returns Excel file download */
export async function exportPlan(req, res) {
  try {
    const plan_date = req.query.date || getPlanDate();
    const plan = await fetchFullPlan(plan_date);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Despatch Plan');

    // Title
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `Despatch Plan — ${plan_date}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    titleCell.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    // Column headers
    const headers = ['Vehicle', 'Customer', 'Pallet', 'Part Number', 'Tube Length', 'Target Qty', 'Scanned Qty', 'Fulfilled', 'Status'];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    headerRow.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 20;

    ws.columns = [
      { width: 12 }, { width: 18 }, { width: 10 }, { width: 16 },
      { width: 14 }, { width: 12 }, { width: 13 }, { width: 11 }, { width: 13 },
    ];

    const GREEN  = 'FFD4EDDA';
    const YELLOW = 'FFFFF3CD';

    if (plan) {
      for (const v of plan.vehicles) {
        const isComplete = v.is_completed;
        for (const p of v.pallets) {
          const isFulfilled = p.is_fulfilled;
          const row = ws.addRow([
            v.vehicle_label, v.customer || '—', p.pallet_label,
            p.part_number || '—', p.tube_length || '—',
            p.target_qty, p.scanned_qty,
            isFulfilled ? 'Yes' : 'No',
            isComplete ? 'Complete' : 'Incomplete'
          ]);
          const rowBg = isComplete
            ? 'FFD4EDDA' // green-50 eq
            : isFulfilled
            ? 'FFC3E6CB' // green-100 eq
            : p.scanned_qty > 0
            ? 'FFFFF3CD' // yellow-50 eq
            : 'FFFFFFFF'; // white
            
          row.eachCell(cell => {
            if (rowBg !== 'FFFFFFFF') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
            }
            cell.border = {
              top: { style: 'thin' }, bottom: { style: 'thin' },
              left: { style: 'thin' }, right: { style: 'thin' },
            };
            cell.alignment = { horizontal: 'center' };
          });
        }
      }
    } else {
      ws.addRow(['No plan data found for this date']);
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
