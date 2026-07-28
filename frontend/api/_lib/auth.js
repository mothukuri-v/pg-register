import jwt from "jsonwebtoken";

// JWT_SECRET is injected as an env var at runtime by Firebase (declared as a
// secret in index.js). This fallback only kicks in for local emulator runs.
const SECRET = process.env.JWT_SECRET || "pg-rent-register-dev-secret-change-me";

export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, SECRET, { expiresIn: "7d" });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired, please log in again" });
  }
}
