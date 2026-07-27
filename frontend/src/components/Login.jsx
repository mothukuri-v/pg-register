import { useState } from "react";
import { auth } from "../api.js";

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, username: u } = await auth.login(username.trim(), password);
      auth.saveToken(token);
      auth.saveUsername(u);
      onLoggedIn();
    } catch (err) {
      setError(err.message || "Could not log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-brass/15 border border-brass/30 mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C89B3C" strokeWidth="1.6">
              <path d="M4 19.5V5.6c0-.9.7-1.6 1.6-1.6h9.8c.9 0 1.6.7 1.6 1.6v13.9M4 19.5h13M4 19.5H2.5M17 19.5h1.5M8 7.5h5M8 10.5h5M8 13.5h5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold text-paper tracking-tight">Narayana PG Rent Register</h1>
          <p className="text-paper/45 text-xs font-body mt-1.5">Sign in to open the ledger</p>
        </div>

        <form onSubmit={submit} className="bg-paper rounded-lg border border-paper-line p-6 shadow-xl">
          <label className="block mb-3.5">
            <span className="block text-[11px] uppercase tracking-[0.1em] text-ink-700/60 font-body mb-1.5">
              Username
            </span>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-white border border-paper-line rounded-md px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-brass"
              placeholder="admin"
              required
            />
          </label>
          <label className="block mb-4">
            <span className="block text-[11px] uppercase tracking-[0.1em] text-ink-700/60 font-body mb-1.5">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white border border-paper-line rounded-md px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-brass"
              placeholder="••••••••"
              required
            />
          </label>

          {error && <p className="text-rust text-xs font-body mb-3">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brass hover:bg-brass-light text-ink-900 font-semibold text-sm px-4 py-2.5 rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
