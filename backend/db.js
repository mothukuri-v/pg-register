import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local dev (no env vars set): a plain SQLite file next to this code, same as before.
// Production (Turso): set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN and it talks to your
// hosted database instead — same SQL, same schema, data now survives redeploys/restarts.
const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, "pg_rent.db")}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient(authToken ? { url, authToken } : { url });

// ---------- SCHEMA (raw SQL) ----------
await db.executeMultiple(`
CREATE TABLE IF NOT EXISTS tenants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT,
  room_no       TEXT NOT NULL,
  joining_date  TEXT NOT NULL,          -- YYYY-MM-DD
  rent_amount   REAL NOT NULL,
  next_due_date TEXT NOT NULL,          -- YYYY-MM-DD, rolls forward every cycle
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_label   TEXT NOT NULL,          -- e.g. 2026-07 (the month this rent covers)
  due_date      TEXT NOT NULL,          -- YYYY-MM-DD
  amount_due    REAL NOT NULL,
  amount_paid   REAL NOT NULL DEFAULT 0,
  paid_date     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, cycle_label)
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Seed a default admin user on first run so the app is usable immediately.
// The owner should change this password after first login (see PUT /api/auth/password).
const userCountResult = await db.execute("SELECT COUNT(*) AS n FROM users");
const userCount = Number(userCountResult.rows[0].n);
if (userCount === 0) {
  const hash = bcrypt.hashSync("admin123", 10);
  await db.execute({
    sql: "INSERT INTO users (username, password_hash) VALUES (?, ?)",
    args: ["admin", hash],
  });
  console.log('Seeded default login -> username: "admin"  password: "admin123" );
}

export default db;
