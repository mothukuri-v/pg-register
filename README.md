# PG Rent Register

A full-stack rent management app for a PG (paying-guest) house: React frontend, Node/Express backend, SQLite-compatible database (plain SQL — runs on a local file for development, and on [Turso](https://turso.tech) for production so data survives redeploys; see [DEPLOY.md](./DEPLOY.md)).

## What it does

- **Login**: the app is behind a sign-in screen. Default login is `admin` / `admin123`, seeded automatically on first run — change it via the password endpoint (see below) after you're in.
- **Import from Excel**: paste rows copied straight from Excel (Ctrl/Cmd+C → paste into the app), or upload a `.xlsx`/`.xls`/`.csv` file. Expected columns are Name, Phone, Room No, Joining Date, Rent Amount, in any order — the app recognises common header names and falls back to that column order if there's no header row. You get a preview with bad rows flagged before anything is saved.
- **Tenant records**: name, phone, room no., joining date, monthly rent
- **Payment tracking** per rent cycle: amount paid, balance, status (`paid` / `pending` / `partial` / `overdue`)
- **Auto-rollover**: the day after a due date passes, the app automatically opens a fresh "pending" cycle for the next month and advances the tenant's next due date — last month's record stays in history untouched. Runs on every page load and via a daily cron job (00:05) so it stays correct even if the server was off.
- **Add / edit / delete tenants**
- **Record a payment** (full or partial) against the current cycle
- **Filters**: search by name/phone/room, filter by status, filter by room, filter by "due within N days"
- **Dashboard**: total tenants, collected this cycle, outstanding amount, counts by status, due-within-7-days

## Project structure

```
pg-rent-manager/
├── backend/            Express API + libSQL (SQLite-compatible; local file or Turso)
│   ├── server.js        routes, auto-rollover logic
│   ├── db.js             SQL schema (tenants, payments tables)
│   └── dateUtils.js     date/status helpers
└── frontend/            React (Vite) + Tailwind
    └── src/
        ├── App.jsx
        ├── api.js        talks to the backend
        └── components/
```

## Database schema (SQL)

```sql
CREATE TABLE tenants (
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

CREATE TABLE payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_label   TEXT NOT NULL,       -- e.g. 2026-08
  due_date      TEXT NOT NULL,
  amount_due    REAL NOT NULL,
  amount_paid   REAL NOT NULL DEFAULT 0,
  paid_date     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, cycle_label)
);
```

Every tenant has one row per month in `payments`. Status is derived, not stored, from `amount_due`, `amount_paid` and `due_date` (see `computeStatus` in `dateUtils.js`), so it's always accurate for "today."

## Deploying it live

See [DEPLOY.md](./DEPLOY.md) for step-by-step instructions to push this to GitHub and deploy the backend (Render) + frontend (Vercel) for free.

## Run it locally

**Backend**
```bash
cd backend
npm install
npm start        # http://localhost:4000
```
The SQLite file `pg_rent.db` is created automatically on first run — no separate database setup needed for local development. In production, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (see [DEPLOY.md](./DEPLOY.md)) and it talks to a hosted Turso database instead, so data survives redeploys.

**Frontend** (in a second terminal)
```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

The frontend reads the API URL from `frontend/.env` (`VITE_API_URL`), already set to `http://localhost:4000/api`.

## API reference

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → `{token}` (public, no login required) |
| PUT | `/api/auth/password` | Change password `{currentPassword, newPassword}` |
| GET | `/api/tenants?status=&search=&room=&upcomingDays=` | List tenants with current cycle + filters |
| POST | `/api/tenants` | Add tenant `{name, phone, room_no, joining_date, rent_amount}` |
| POST | `/api/tenants/bulk-import` | Import many at once: `{rows: [{name, phone, room_no, joining_date, rent_amount}, ...]}` |
| PUT | `/api/tenants/:id` | Edit tenant details |
| DELETE | `/api/tenants/:id` | Remove tenant (cascades payment history) |
| POST | `/api/payments/:paymentId/pay` | Record a payment `{amount}` |
| GET | `/api/tenants/:id/history` | Full payment history for one tenant |
| GET | `/api/dashboard` | Summary totals |

All routes except `/api/auth/login` require `Authorization: Bearer <token>`, obtained from the login response and sent automatically by the frontend once you sign in.

## Where tenant data lives

Locally, it's a plain SQLite file at `backend/pg_rent.db`. In production (see [DEPLOY.md](./DEPLOY.md)), it's a [Turso](https://turso.tech) database — same schema, same SQL, just accessed over the network instead of a local file, via `@libsql/client`. This is what keeps tenant data intact across backend redeploys and restarts on free hosting tiers that don't offer persistent disks.
