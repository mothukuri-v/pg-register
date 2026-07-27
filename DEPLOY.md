# Deploying PG Rent Register

Two parts to put online: the **backend** (API + SQLite database) and the **frontend** (the React app). This guide uses **Render** for the backend (free tier, supports a persistent disk so your tenant data survives redeploys) and **Vercel** for the frontend (free tier, great for Vite apps). Run all commands below on your own machine, in the unzipped project folder.

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

Your `.env` files and the SQLite database are already excluded via `.gitignore`, so no real tenant data or secrets get committed.

---

## 2. Deploy the backend (Render)

1. Go to [render.com](https://render.com) → sign in with GitHub → **New** → **Blueprint**.
2. Pick your `pg-rent-manager` repo. Render will read `render.yaml` at the repo root and pre-fill everything: Node web service, root dir `backend`, a free persistent disk mounted at `/data` for the database, and a random `JWT_SECRET`.
3. Click **Apply** / **Create**. First deploy takes a couple of minutes.
4. Once live, copy the service URL, e.g. `https://pg-rent-manager-api.onrender.com`.

No blueprint support, or you'd rather click through manually: **New → Web Service**, connect the repo, set **Root Directory** to `backend`, **Build Command** `npm install`, **Start Command** `npm start`, then add environment variables `JWT_SECRET` (any long random string) and `DB_PATH=/data/pg_rent.db`, and add a **Disk** mounted at `/data` (1 GB is plenty).

> Render's free tier spins the service down after inactivity — the first request after a while takes ~30s to wake up. Fine for a small PG, but worth knowing.

---

## 3. Deploy the frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → pick `pg-rent-manager`.
2. Set **Root Directory** to `frontend` (Vercel auto-detects the Vite framework preset).
3. Add an environment variable: `VITE_API_URL` = `https://pg-rent-manager-api.onrender.com/api` (your Render URL from step 2, with `/api` on the end).
4. Click **Deploy**. You'll get a URL like `https://pg-rent-manager.vercel.app`.

---

## 4. Connect the two

Go back to Render → your backend service → **Environment** → set `CORS_ORIGIN` to your Vercel URL (e.g. `https://pg-rent-manager.vercel.app`, no trailing slash) → save, which triggers a redeploy.

Now open your Vercel URL — you should see the login screen, and it'll be able to reach the backend.

---

## 5. First login, then lock it down

Sign in with the seeded default (`admin` / `admin123`), then change the password from the app (or `curl`, if you haven't wired up a password-change UI button yet):

```bash
curl -X PUT https://pg-rent-manager-api.onrender.com/api/auth/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"currentPassword":"admin123","newPassword":"something-only-you-know"}'
```

(Get `YOUR_TOKEN` from the browser's dev tools → Application → Local Storage → `pg_token`, after logging in.)

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

If you'd rather not juggle two platforms, **Railway** (railway.app) can host both the Node backend and a static build of the frontend as two services in one project, with a persistent volume for the backend the same way. The steps are the same shape as above — connect the repo, set root directories, add the same environment variables, attach a volume for `DB_PATH`.
