import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local dev (no env vars set): a plain SQLite file next to this code.
// Production (Turso): set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
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
  joining_date  TEXT NOT NULL,
  rent_amount   REAL NOT NULL,
  next_due_date TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_label   TEXT NOT NULL,
  due_date      TEXT NOT NULL,
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

// Migration: add the "role" column for databases created before read-only
// accounts existed. Ignored if it's already there (re-running is safe).
try {
  await db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
} catch (e) {
  if (!/duplicate column/i.test(e.message)) throw e;
}

// Seed the default admin on first run.
const userCountResult = await db.execute("SELECT COUNT(*) AS n FROM users");
const userCount = Number(userCountResult.rows[0].n);
if (userCount === 0) {
  const hash = bcrypt.hashSync("admin123", 10);
  await db.execute({
    sql: "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
    args: ["admin", hash],
  });
  console.log('Seeded default login -> username: "Admin"  password: "admin@123" );
}

// Seed a read-only account, if it doesn't exist yet — separately from the
// admin seed above, so it also gets created for databases that already had
// an admin user before this feature existed.
const viewerExists = await db.execute("SELECT id FROM users WHERE username = ?", ["viewer"]);
if (viewerExists.rows.length === 0) {
  const hash = bcrypt.hashSync("viewer123", 10);
  await db.execute({
    sql: "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'viewer')",
    args: ["viewer", hash],
  });
  console.log('Seeded read-only login -> username: "admin"  password: "admin123" );
}

export default db;
