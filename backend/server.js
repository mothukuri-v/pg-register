import express from "express";
import cors from "cors";
import cron from "node-cron";
import bcrypt from "bcryptjs";
import db from "./db.js";
import { addOneMonth, cycleLabelFromDue, computeStatus, todayStr, daysUntil } from "./dateUtils.js";
import { signToken, authMiddleware } from "./auth.js";

// ---------------------------------------------------------------------------
// Small helpers around @libsql/client so route code reads like plain SQL.
// ---------------------------------------------------------------------------
async function get(sql, args = []) {
  const rs = await db.execute({ sql, args });
  return rs.rows[0] || null;
}
async function all(sql, args = []) {
  const rs = await db.execute({ sql, args });
  return rs.rows;
}
async function run(sql, args = []) {
  const rs = await db.execute({ sql, args });
  return { lastInsertRowid: Number(rs.lastInsertRowid ?? 0), changes: Number(rs.rowsAffected ?? 0) };
}

const app = express();

// In production, set CORS_ORIGIN to your deployed frontend URL (comma-separate
// multiple). Left unset, it allows any origin, which is fine for local dev.
const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) : "*";
app.use(cors({ origin: corsOrigin }));

app.use(express.json({ limit: "5mb" })); // higher limit to accept pasted/bulk-imported spreadsheet data

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// Auth (public routes)
// ---------------------------------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await get("SELECT * FROM users WHERE username = ?", [username]);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  res.json({ token: signToken(user), username: user.username });
});

// Everything below this line requires a valid login.
app.use("/api", authMiddleware);

app.put("/api/auth/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await get("SELECT * FROM users WHERE id = ?", [req.user.sub]);
  if (!bcrypt.compareSync(currentPassword || "", user.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [bcrypt.hashSync(newPassword, 10), user.id]);
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Core logic: make sure every active tenant has a payment row for the cycle
// they are currently in. If today has rolled past a tenant's next_due_date,
// a fresh "pending" cycle is auto-created and next_due_date advances one
// month. This is the "auto reset" behaviour: last cycle's paid/pending
// record stays in history untouched, a brand-new pending row appears for
// the new month.
// ---------------------------------------------------------------------------
async function ensureCurrentCycle(tenantId) {
  const tenant = await get("SELECT * FROM tenants WHERE id = ?", [tenantId]);
  if (!tenant || !tenant.is_active) return;

  const today = todayStr();
  let dueDate = tenant.next_due_date;

  const insertCycle = (due) =>
    run(
      `INSERT OR IGNORE INTO payments (tenant_id, cycle_label, due_date, amount_due, amount_paid)
       VALUES (?, ?, ?, ?, 0)`,
      [tenantId, cycleLabelFromDue(due), due, tenant.rent_amount]
    );

  // Make sure a row exists for the current due date.
  await insertCycle(dueDate);

  // Roll forward while the due date is in the past (covers server downtime).
  while (dueDate < today) {
    dueDate = addOneMonth(dueDate);
    await insertCycle(dueDate);
    await run("UPDATE tenants SET next_due_date = ? WHERE id = ?", [dueDate, tenantId]);
  }
}

async function ensureAllCycles() {
  const rows = await all("SELECT id FROM tenants WHERE is_active = 1");
  for (const { id } of rows) await ensureCurrentCycle(id);
}

// Run once at boot, then every day just after midnight.
await ensureAllCycles();
cron.schedule("5 0 * * *", ensureAllCycles);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function currentPaymentFor(tenantId) {
  return get(`SELECT * FROM payments WHERE tenant_id = ? ORDER BY due_date DESC LIMIT 1`, [tenantId]);
}

async function serializeTenant(tenant) {
  const payment = await currentPaymentFor(tenant.id);
  const status = payment ? computeStatus(payment) : "pending";
  return {
    id: tenant.id,
    name: tenant.name,
    phone: tenant.phone,
    room_no: tenant.room_no,
    joining_date: tenant.joining_date,
    rent_amount: tenant.rent_amount,
    next_due_date: tenant.next_due_date,
    is_active: !!tenant.is_active,
    current_payment: payment
      ? {
          id: payment.id,
          cycle_label: payment.cycle_label,
          due_date: payment.due_date,
          amount_due: payment.amount_due,
          amount_paid: payment.amount_paid,
          balance: Math.max(0, payment.amount_due - payment.amount_paid),
          paid_date: payment.paid_date,
          status,
          days_until_due: daysUntil(payment.due_date),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Routes: Tenants
// ---------------------------------------------------------------------------
app.get("/api/tenants", async (req, res) => {
  await ensureAllCycles();
  const { status, search, upcomingDays, room } = req.query;

  const tenantRows = await all("SELECT * FROM tenants WHERE is_active = 1 ORDER BY name COLLATE NOCASE");
  let tenants = await Promise.all(tenantRows.map(serializeTenant));

  if (search) {
    const s = search.toLowerCase();
    tenants = tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(s) ||
        (t.phone || "").toLowerCase().includes(s) ||
        t.room_no.toLowerCase().includes(s)
    );
  }
  if (room) tenants = tenants.filter((t) => t.room_no === room);
  if (status && status !== "all") {
    tenants = tenants.filter((t) => t.current_payment && t.current_payment.status === status);
  }
  if (upcomingDays) {
    const n = Number(upcomingDays);
    tenants = tenants.filter(
      (t) => t.current_payment && t.current_payment.days_until_due <= n && t.current_payment.days_until_due >= 0
    );
  }

  res.json(tenants);
});

app.post("/api/tenants", async (req, res) => {
  const { name, phone, room_no, joining_date, rent_amount } = req.body;
  if (!name || !room_no || !joining_date || !rent_amount) {
    return res.status(400).json({ error: "name, room_no, joining_date and rent_amount are required" });
  }

  const firstDueDate = addOneMonth(joining_date);

  const info = await run(
    `INSERT INTO tenants (name, phone, room_no, joining_date, rent_amount, next_due_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, phone || "", room_no, joining_date, rent_amount, firstDueDate]
  );

  await run(
    `INSERT INTO payments (tenant_id, cycle_label, due_date, amount_due, amount_paid)
     VALUES (?, ?, ?, ?, 0)`,
    [info.lastInsertRowid, cycleLabelFromDue(firstDueDate), firstDueDate, rent_amount]
  );

  const tenant = await get("SELECT * FROM tenants WHERE id = ?", [info.lastInsertRowid]);
  res.status(201).json(await serializeTenant(tenant));
});

// Accepts rows already parsed on the frontend (from a pasted Excel selection
// or an uploaded .xlsx/.csv file): [{ name, phone, room_no, joining_date, rent_amount }, ...]
app.post("/api/tenants/bulk-import", async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (rows.length === 0) return res.status(400).json({ error: "No rows to import" });

  const results = { created: 0, failed: [] };

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 1;
    const name = String(row.name || "").trim();
    const room_no = String(row.room_no || "").trim();
    const joining_date = String(row.joining_date || "").trim();
    const rent_amount = Number(row.rent_amount);
    const phone = row.phone ? String(row.phone).trim() : "";

    if (!name) { results.failed.push({ row: rowNum, reason: "Missing name" }); continue; }
    if (!room_no) { results.failed.push({ row: rowNum, reason: "Missing room no." }); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(joining_date)) {
      results.failed.push({ row: rowNum, reason: `Bad joining date "${row.joining_date}" (expected YYYY-MM-DD)` });
      continue;
    }
    if (!rent_amount || rent_amount <= 0) {
      results.failed.push({ row: rowNum, reason: `Bad rent amount "${row.rent_amount}"` });
      continue;
    }

    try {
      const firstDueDate = addOneMonth(joining_date);
      const info = await run(
        `INSERT INTO tenants (name, phone, room_no, joining_date, rent_amount, next_due_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, phone, room_no, joining_date, rent_amount, firstDueDate]
      );
      await run(
        `INSERT INTO payments (tenant_id, cycle_label, due_date, amount_due, amount_paid)
         VALUES (?, ?, ?, ?, 0)`,
        [info.lastInsertRowid, cycleLabelFromDue(firstDueDate), firstDueDate, rent_amount]
      );
      results.created += 1;
    } catch (e) {
      results.failed.push({ row: rowNum, reason: e.message });
    }
  }

  res.json(results);
});

app.put("/api/tenants/:id", async (req, res) => {
  const { id } = req.params;
  const tenant = await get("SELECT * FROM tenants WHERE id = ?", [id]);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  const { name, phone, room_no, rent_amount } = req.body;
  await run(`UPDATE tenants SET name = ?, phone = ?, room_no = ?, rent_amount = ? WHERE id = ?`, [
    name ?? tenant.name,
    phone ?? tenant.phone,
    room_no ?? tenant.room_no,
    rent_amount ?? tenant.rent_amount,
    id,
  ]);

  // Keep the open (unpaid) current cycle's amount_due in sync with a rent change.
  const payment = await currentPaymentFor(id);
  if (payment && payment.amount_paid === 0 && rent_amount) {
    await run("UPDATE payments SET amount_due = ? WHERE id = ?", [rent_amount, payment.id]);
  }

  res.json(await serializeTenant(await get("SELECT * FROM tenants WHERE id = ?", [id])));
});

app.delete("/api/tenants/:id", async (req, res) => {
  const { id } = req.params;
  const info = await run("DELETE FROM tenants WHERE id = ?", [id]);
  if (info.changes === 0) return res.status(404).json({ error: "Tenant not found" });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Routes: Payments
// ---------------------------------------------------------------------------
app.post("/api/payments/:paymentId/pay", async (req, res) => {
  const { paymentId } = req.params;
  const { amount } = req.body;
  const payment = await get("SELECT * FROM payments WHERE id = ?", [paymentId]);
  if (!payment) return res.status(404).json({ error: "Payment record not found" });

  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });

  const newPaid = Math.min(payment.amount_due, payment.amount_paid + amt);
  await run(`UPDATE payments SET amount_paid = ?, paid_date = ? WHERE id = ?`, [newPaid, todayStr(), paymentId]);

  res.json(await serializeTenant(await get("SELECT * FROM tenants WHERE id = ?", [payment.tenant_id])));
});

app.get("/api/tenants/:id/history", async (req, res) => {
  const rows = await all("SELECT * FROM payments WHERE tenant_id = ? ORDER BY due_date DESC", [req.params.id]);
  res.json(rows.map((p) => ({ ...p, status: computeStatus(p) })));
});

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------
app.get("/api/dashboard", async (req, res) => {
  await ensureAllCycles();
  const tenantRows = await all("SELECT * FROM tenants WHERE is_active = 1");
  const tenants = await Promise.all(tenantRows.map(serializeTenant));

  const summary = {
    total_tenants: tenants.length,
    collected_this_cycle: 0,
    pending_amount: 0,
    paid_count: 0,
    pending_count: 0,
    partial_count: 0,
    overdue_count: 0,
    due_within_7_days: 0,
  };

  for (const t of tenants) {
    const p = t.current_payment;
    if (!p) continue;
    summary.collected_this_cycle += p.amount_paid;
    summary.pending_amount += p.balance;
    summary[`${p.status}_count`] = (summary[`${p.status}_count`] || 0) + 1;
    if (p.days_until_due >= 0 && p.days_until_due <= 7) summary.due_within_7_days += 1;
  }

  res.json(summary);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`PG Rent Manager API running on http://localhost:${PORT}`));
