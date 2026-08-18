import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import db from "./db.js";
import { addOneMonth, cycleLabelFromDue, computeStatus, todayStr, daysUntil } from "./dateUtils.js";
import { signToken, authMiddleware, requireWrite } from "./auth.js";

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

const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) : "*";
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// Auth (public route)
// ---------------------------------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await get("SELECT * FROM users WHERE username = ?", [username]);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  res.json({ token: signToken(user), username: user.username, role: user.role });
});

// Everything below this line requires a valid login.
app.use("/api", authMiddleware);

// Password changes are allowed for any logged-in account, including
// read-only ones — that's an account-security action, not a data write.
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
// Rollover logic (unchanged)
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

  await insertCycle(dueDate);

  while (dueDate < today) {
    dueDate = addOneMonth(dueDate);
    await insertCycle(dueDate);
    await run("UPDATE tenants SET next_due_date = ? WHERE id = ?", [dueDate, tenantId]);
  }
}

async function ensureAllCycles() {
  const rows = await all("SELECT id FROM tenants WHERE is_active = 1");
  await Promise.all(rows.map(({ id }) => ensureCurrentCycle(id)));
}

let lastEnsuredDate = null;
async function ensureAllCyclesIfNeeded() {
  const today = todayStr();
  if (lastEnsuredDate === today) return;
  await ensureAllCycles();
  lastEnsuredDate = today;
}

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
// Routes: Tenants — reads are open to any logged-in user, writes require
// requireWrite (blocks "viewer" accounts).
// ---------------------------------------------------------------------------
app.get("/api/tenants", async (req, res) => {
  await ensureAllCyclesIfNeeded();
  const { status, search, upcomingDays, room } = req.query;

  const tenantRows = await all("SELECT * FROM tenants WHERE is_active = 1 ORDER BY room_no COLLATE NOCASE, name COLLATE NOCASE");
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

app.post("/api/tenants", requireWrite, async (req, res) => {
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

app.post("/api/tenants/bulk-import", requireWrite, async (req, res) => {
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

app.put("/api/tenants/:id", requireWrite, async (req, res) => {
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

  const payment = await currentPaymentFor(id);
  if (payment && payment.amount_paid === 0 && rent_amount) {
    await run("UPDATE payments SET amount_due = ? WHERE id = ?", [rent_amount, payment.id]);
  }

  res.json(await serializeTenant(await get("SELECT * FROM tenants WHERE id = ?", [id])));
});

app.delete("/api/tenants/:id", requireWrite, async (req, res) => {
  const { id } = req.params;
  const info = await run("DELETE FROM tenants WHERE id = ?", [id]);
  if (info.changes === 0) return res.status(404).json({ error: "Tenant not found" });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Routes: Payments
// ---------------------------------------------------------------------------
app.post("/api/payments/:paymentId/pay", requireWrite, async (req, res) => {
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
// Dashboard summary (read-only, open to any logged-in user)
// ---------------------------------------------------------------------------
app.get("/api/dashboard", async (req, res) => {
  await ensureAllCyclesIfNeeded();
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

export default app;
