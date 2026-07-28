import app from "./_lib/app.js";

// Every request under /api/* is forced here by the rewrite rule in
// frontend/vercel.json — Vercel preserves the ORIGINAL request URL when
// invoking the function after a rewrite, so Express still sees the real
// path (e.g. "/api/auth/login") and routes it normally. This sidesteps a
// known unreliability with bracket-based catch-all files ([...slug].js) on
// non-Next.js Vercel projects, which can silently fail to match multi-segment
// paths.
export default app;
