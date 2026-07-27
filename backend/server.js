import express from "express";
import cors from "cors";
import cron from "node-cron";
import bcrypt from "bcryptjs";
import db from "./db.js";
import { addOneMonth, cycleLabelFromDue, computeStatus, todayStr, daysUntil } from "./dateUtils.js";
import { signToken, authMiddleware } from "./auth.js";

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
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  res.json({ token: signToken(user), username: user.username });
});

// Everything below this line requires a valid login.
app.use("/api", authMiddleware);

app.put("/api/auth/password", (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.sub);
  if (!bcrypt.compareSync(currentPassword || "", user.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(newPassword, 10), user.id);
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
function ensureCurrentCycle(tenantId) {
  const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId);
  if (!tenant || !tenant.is_active) return;

  const today = todayStr();
  let dueDate = tenant.next_due_date;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO payments (tenant_id, cycle_label, due_date, amount_due, amount_paid)
    VALUES (?, ?, ?, ?, 0)
  `);
  const updateNextDue = db.prepare("UPDATE tenants SET next_due_date = ? WHERE id = ?");

  // Make sure a row exists for the current due date.
  insert.run(tenantId, cycleLabelFromDue(dueDate), dueDate, tenant.rent_amount);

  // Roll forward while the due date is in the past (covers server downtime).
  while (dueDate < today) {
    dueDate = addOneMonth(dueDate);
    insert.run(tenantId, cycleLabelFromDue(dueDate), dueDate, tenant.rent_amount);
    updateNextDue.run(dueDate, tenantId);
  }
}

function ensureAllCycles() {
  const ids = db.prepare("SELECT id FROM tenants WHERE is_active = 1").all();
  for (const { id } of ids) ensureCurrentCycle(id);
}

// Run once at boot, then every day just after midnight.
ensureAllCycles();
cron.schedule("5 0 * * *", ensureAllCycles);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function currentPaymentFor(tenantId) {
  return db
    .prepare(
      `SELECT * FROM payments WHERE tenant_id = ? ORDER BY due_date DESC LIMIT 1`
    )
    .get(tenantId);
}

function serializeTenant(tenant) {
  const payment = currentPaymentFor(tenant.id);
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
app.get("/api/tenants", (req, res) => {
  ensureAllCycles();
  const { status, search, upcomingDays, room } = req.query;

  let tenants = db
    .prepare("SELECT * FROM tenants WHERE is_active = 1 ORDER BY name COLLATE NOCASE")
    .all()
    .map(serializeTenant);

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

app.post("/api/tenants", (req, res) => {
  const { name, phone, room_no, joining_date, rent_amount } = req.body;
  if (!name || !room_no || !joining_date || !rent_amount) {
    return res.status(400).json({ error: "name, room_no, joining_date and rent_amount are required" });
  }

  const firstDueDate = addOneMonth(joining_date);

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO tenants (name, phone, room_no, joining_date, rent_amount, next_due_date)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(name, phone || "", room_no, joining_date, rent_amount, firstDueDate);

    db.prepare(
      `INSERT INTO payments (tenant_id, cycle_label, due_date, amount_due, amount_paid)
       VALUES (?, ?, ?, ?, 0)`
    ).run(info.lastInsertRowid, cycleLabelFromDue(firstDueDate), firstDueDate, rent_amount);

    return info.lastInsertRowid;
  });

  const id = tx();
  const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
  res.status(201).json(serializeTenant(tenant));
});

// Accepts rows already parsed on the frontend (from a pasted Excel selection
// or an uploaded .xlsx/.csv file): [{ name, phone, room_no, joining_date, rent_amount }, ...]
app.post("/api/tenants/bulk-import", (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (rows.length === 0) return res.status(400).json({ error: "No rows to import" });

  const insertTenant = db.prepare(
    `INSERT INTO tenants (name, phone, room_no, joining_date, rent_amount, next_due_date)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertPayment = db.prepare(
    `INSERT INTO payments (tenant_id, cycle_label, due_date, amount_due, amount_paid)
     VALUES (?, ?, ?, ?, 0)`
  );

  const results = { created: 0, failed: [] };

  const tx = db.transaction(() => {
    rows.forEach((row, idx) => {
      const name = String(row.name || "").trim();
      const room_no = String(row.room_no || "").trim();
      const joining_date = String(row.joining_date || "").trim();
      const rent_amount = Number(row.rent_amount);
      const phone = row.phone ? String(row.phone).trim() : "";

      const rowNum = idx + 1;
      if (!name) return results.failed.push({ row: rowNum, reason: "Missing name" });
      if (!room_no) return results.failed.push({ row: rowNum, reason: "Missing room no." });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(joining_date)) {
        return results.failed.push({ row: rowNum, reason: `Bad joining date "${row.joining_date}" (expected YYYY-MM-DD)` });
      }
      if (!rent_amount || rent_amount <= 0) {
        return results.failed.push({ row: rowNum, reason: `Bad rent amount "${row.rent_amount}"` });
      }

      try {
        const firstDueDate = addOneMonth(joining_date);
        const info = insertTenant.run(name, phone, room_no, joining_date, rent_amount, firstDueDate);
        insertPayment.run(info.lastInsertRowid, cycleLabelFromDue(firstDueDate), firstDueDate, rent_amount);
        results.created += 1;
      } catch (e) {
        results.failed.push({ row: rowNum, reason: e.message });
      }
    });
  });
  tx();

  res.json(results);
});

app.put("/api/tenants/:id", (req, res) => {
  const { id } = req.params;
  const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  const { name, phone, room_no, rent_amount } = req.body;
  db.prepare(
    `UPDATE tenants SET name = ?, phone = ?, room_no = ?, rent_amount = ? WHERE id = ?`
  ).run(
    name ?? tenant.name,
    phone ?? tenant.phone,
    room_no ?? tenant.room_no,
    rent_amount ?? tenant.rent_amount,
    id
  );

  // Keep the open (unpaid) current cycle's amount_due in sync with a rent change.
  const payment = currentPaymentFor(id);
  if (payment && payment.amount_paid === 0 && rent_amount) {
    db.prepare("UPDATE payments SET amount_due = ? WHERE id = ?").run(rent_amount, payment.id);
  }

  res.json(serializeTenant(db.prepare("SELECT * FROM tenants WHERE id = ?").get(id)));
});

app.delete("/api/tenants/:id", (req, res) => {
  const { id } = req.params;
  const info = db.prepare("DELETE FROM tenants WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Tenant not found" });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Routes: Payments
// ---------------------------------------------------------------------------
app.post("/api/payments/:paymentId/pay", (req, res) => {
  const { paymentId } = req.params;
  const { amount } = req.body;
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
  if (!payment) return res.status(404).json({ error: "Payment record not found" });

  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });

  const newPaid = Math.min(payment.amount_due, payment.amount_paid + amt);
  db.prepare(
    `UPDATE payments SET amount_paid = ?, paid_date = ? WHERE id = ?`
  ).run(newPaid, todayStr(), paymentId);

  res.json(serializeTenant(db.prepare("SELECT * FROM tenants WHERE id = ?").get(payment.tenant_id)));
});

app.get("/api/tenants/:id/history", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM payments WHERE tenant_id = ? ORDER BY due_date DESC")
    .all(req.params.id)
    .map((p) => ({ ...p, status: computeStatus(p) }));
  res.json(rows);
});

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------
app.get("/api/dashboard", (req, res) => {
  ensureAllCycles();
  const tenants = db
    .prepare("SELECT * FROM tenants WHERE is_active = 1")
    .all()
    .map(serializeTenant);

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
