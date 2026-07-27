import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// On most hosts the app's code directory is wiped/replaced on every deploy,
// so in production point DB_PATH at a mounted persistent disk (e.g. Render
// disks, Railway volumes) so tenant data survives redeploys.
const dbPath = process.env.DB_PATH || path.join(__dirname, "pg_rent.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------- SCHEMA (raw SQL) ----------
db.exec(`
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
import bcrypt from "bcryptjs";
const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
if (userCount === 0) {
  const hash = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run("admin", hash);
  console.log('Seeded default login -> username: "admin"  password: "admin123" (please change this)');
}

export default db;
