import { query } from '../db/db.js';
import { findEmailsByRoles } from '../models/userModel.js';
import { sendMail } from './mailer.js';
import { pendingApprovalReminderTemplate } from './emailTemplates.js';

/**
 * Format a date as DD MMM YYYY for display in emails.
 */
const fmtDate = (dateInput) => {
  if (!dateInput) return '—';
  const dateString = dateInput instanceof Date ? dateInput.toISOString() : String(dateInput);
  const cleanDate = dateString.endsWith('Z') ? dateString.slice(0, -1) : dateString;
  const d = new Date(cleanDate);
  if (isNaN(d.getTime())) return dateString;
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * Calculates how many calendar days have elapsed since a given date string.
 */
const daysSince = (dateInput) => {
  if (!dateInput) return 0;
  const dateString = dateInput instanceof Date ? dateInput.toISOString() : String(dateInput);
  const cleanDate = dateString.endsWith('Z') ? dateString.slice(0, -1) : dateString;
  const then = new Date(cleanDate);
  const now = new Date();
  // Use UTC date math to avoid timezone drift
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * sendProductionPendingReminder
 *
 * Finds products where `approved = 'pending'` for more than 3 days
 * and sends a reminder email to all users with role = 'production'.
 */
export const sendProductionPendingReminder = async () => {
  try {
    console.log('[PENDING CRON] Checking production-pending products...');

    // Fetch all products with approved = 'pending' and status != 'rejected'
    const rows = await query(
      `SELECT id, part_number, customer, created_at, updated_at, specification
       FROM products
       WHERE approved = 'pending'
         AND status NOT IN ('rejected', 'inactive')
       ORDER BY created_at ASC`
    );

    if (!rows || rows.length === 0) {
      console.log('[PENDING CRON] No production-pending products found.');
      return;
    }

    // Filter those pending for more than 3 days
    const overdue = rows
      .map((p) => {
        let spec = {};
        try {
          spec = typeof p.specification === 'string' ? JSON.parse(p.specification) : (p.specification || {});
        } catch {}
        const days = daysSince(p.created_at);
        return { ...p, spec, daysPending: days };
      })
      .filter((p) => p.daysPending > 3);

    if (overdue.length === 0) {
      console.log('[PENDING CRON] No production-pending products exceed 3 days.');
      return;
    }

    console.log(`[PENDING CRON] ${overdue.length} product(s) pending production approval >3 days`);

    const emails = await findEmailsByRoles(['production']);
    if (!emails || emails.length === 0) {
      console.log('[PENDING CRON] No production users found to notify.');
      return;
    }

    const products = overdue.map((p) => ({
      partNumber: p.part_number,
      customerName: p.customer,
      createdAt: fmtDate(p.created_at),
      daysPending: p.daysPending,
    }));

    await sendMail({
      to: emails,
      subject: `⏳ Reminder: ${overdue.length} Part(s) Pending Production Approval (>3 days)`,
      html: pendingApprovalReminderTemplate({
        pendingType: 'Production Approval',
        products,
      }),
    });

    console.log(`[PENDING CRON] Production pending reminder sent to ${emails.length} user(s).`);
  } catch (err) {
    console.error('[PENDING CRON] Error in sendProductionPendingReminder:', err);
  }
};

/**
 * sendQualityPendingReminder
 *
 * Finds products where `quality_verified = 'pending'` for more than 3 days
 * (and approved = 'approved', so they genuinely need quality sign-off)
 * and sends a reminder email to all users with role = 'quality'.
 */
export const sendQualityPendingReminder = async () => {
  try {
    console.log('[PENDING CRON] Checking quality-pending products...');

    // Fetch all products with quality_verified = 'pending' and status != 'rejected'
    const rows = await query(
      `SELECT id, part_number, customer, created_at, updated_at, specification
       FROM products
       WHERE quality_verified = 'pending'
         AND status NOT IN ('rejected', 'inactive')
       ORDER BY created_at ASC`
    );

    if (!rows || rows.length === 0) {
      console.log('[PENDING CRON] No quality-pending products found.');
      return;
    }

    // Filter those pending for more than 3 days
    const overdue = rows
      .map((p) => {
        const days = daysSince(p.created_at);
        return { ...p, daysPending: days };
      })
      .filter((p) => p.daysPending > 3);

    if (overdue.length === 0) {
      console.log('[PENDING CRON] No quality-pending products exceed 3 days.');
      return;
    }

    console.log(`[PENDING CRON] ${overdue.length} product(s) pending quality verification >3 days`);

    const emails = await findEmailsByRoles(['quality']);
    if (!emails || emails.length === 0) {
      console.log('[PENDING CRON] No quality users found to notify.');
      return;
    }

    const products = overdue.map((p) => ({
      partNumber: p.part_number,
      customerName: p.customer,
      createdAt: fmtDate(p.created_at),
      daysPending: p.daysPending,
    }));

    await sendMail({
      to: emails,
      subject: `⏳ Reminder: ${overdue.length} Part(s) Pending Quality Verification (>3 days)`,
      html: pendingApprovalReminderTemplate({
        pendingType: 'Quality Verification',
        products,
      }),
    });

    console.log(`[PENDING CRON] Quality pending reminder sent to ${emails.length} user(s).`);
  } catch (err) {
    console.error('[PENDING CRON] Error in sendQualityPendingReminder:', err);
  }
};
