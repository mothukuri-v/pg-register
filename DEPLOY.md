# Deploying PG Rent Register

Three parts to put online: the **database** (Turso — free, hosted, SQLite-compatible, keeps your data even when the backend restarts), the **backend** (Render, free tier), and the **frontend** (Vercel, free tier). Run all commands below on your own machine, in the unzipped project folder.

---

## 1. Push the code to GitHub

```bash
cd pg-rent-manager
git init
git add .
git commit -m "Initial commit: PG Rent Register"
```

Create an empty repo on GitHub (github.com → **New repository** → don't initialize with a README), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/pg-rent-manager.git
git branch -M main
git push -u origin main
```

(Or use the GitHub CLI instead of the website: `gh repo create pg-rent-manager --public --source=. --push`.)

Your `.env` files and any local SQLite database are already excluded via `.gitignore`, so no real tenant data or secrets get committed.

---

## 2. Create your database (Turso)

Render's free tier has no persistent disk — without a real hosted database, tenant data gets wiped every time the free instance restarts (which happens often, since it sleeps after ~15 min idle). Turso gives you a free, always-persistent, SQLite-compatible database that fixes this.

1. Go to **[turso.tech](https://turso.tech)** → sign up (GitHub login is easiest).
2. In the dashboard, click **Create Database**, give it any name (e.g. `pg-rent-manager`), pick the region closest to you, create it.
3. On the database page, find:
   - The **connection URL** — looks like `libsql://pg-rent-manager-yourname.turso.io`
   - A button to **Create Token** (generates an auth token — a long string, shown once, copy it somewhere safe)
4. Keep both handy — you'll paste them into Render in the next step as `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

*(CLI alternative: `turso auth login`, `turso db create pg-rent-manager`, `turso db show pg-rent-manager --url`, `turso db tokens create pg-rent-manager`.)*

---

## 3. Deploy the backend (Render)

1. Go to [render.com](https://render.com) → sign in with GitHub → **New** → **Blueprint**.
2. Pick your `pg-rent-manager` repo. Render reads `render.yaml` and pre-fills a Node web service, root dir `backend`, and a random `JWT_SECRET`.
3. Click **Apply** / **Create**. First deploy takes a couple of minutes.
4. Once it's deployed, go to the service's **Environment** tab and add two more variables:
   - `TURSO_DATABASE_URL` = the connection URL from step 2
   - `TURSO_AUTH_TOKEN` = the token from step 2
5. Save — Render redeploys automatically. Once live, copy the service URL, e.g. `https://pg-rent-manager-api.onrender.com`.

No blueprint support, or you'd rather click through manually: **New → Web Service**, connect the repo, set **Root Directory** to `backend`, **Build Command** `npm install`, **Start Command** `npm start`, then add environment variables `JWT_SECRET` (any long random string), `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN`.

> Render's free tier spins the service down after inactivity — the first request after a while takes ~30s to wake up. Your data stays intact either way now that it's on Turso, not the local disk.

---

## 4. Deploy the frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → pick `pg-rent-manager`.
2. Set **Root Directory** to `frontend` (Vercel auto-detects the Vite framework preset).
3. Add an environment variable: `VITE_API_URL` = `https://pg-rent-manager-api.onrender.com/api` (your Render URL from step 3, with `/api` on the end).
4. Click **Deploy**. You'll get a URL like `https://pg-rent-manager.vercel.app`.

---

## 5. Connect the two

Go back to Render → your backend service → **Environment** → set `CORS_ORIGIN` to your exact Vercel URL (e.g. `https://pg-rent-manager.vercel.app`, no trailing slash) → save, which triggers a redeploy.

Now open your Vercel URL — you should see the login screen, and it'll be able to reach the backend.

---

## 6. First login, then lock it down

Sign in with the seeded default (`admin` / `admin123`), then use the **Change password** button in the app header to set your own.

---

## Redeploying after changes

Both Render and Vercel auto-deploy on every push to `main`:

```bash
git add .
git commit -m "describe your change"
git push
```

---

## Alternative: one host for everything

If you'd rather not juggle multiple platforms, **Railway** (railway.app) can host the Node backend and a static build of the frontend as two services in one project — the steps are the same shape as above: connect the repo, set root directories, add the same environment variables (including `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`).
