import app from "./_lib/app.js";

// Vercel's Node.js runtime accepts an Express app directly as the default
// export — it's just a (req, res) request handler under the hood. This one
// file, thanks to the [...slug] catch-all filename, handles every path
// under /api/* (login, tenants, payments, dashboard, etc.) by handing the
// original request straight to Express, which does its own routing exactly
// as it does locally or on Render.
export default app;
