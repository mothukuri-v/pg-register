import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "pg-rent-register-dev-secret-change-me";

export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: "7d" });
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

// Blocks any request from a "viewer" (read-only) account. Apply this to
// every route that creates, edits, or deletes data. GET routes don't need it.
export function requireWrite(req, res, next) {
  if (req.user?.role === "viewer") {
    return res.status(403).json({ error: "This is a read-only account and can't make changes." });
  }
  next();
}
