const BASE = import.meta.env.VITE_API_URL || "/api";

function getToken() {
  return localStorage.getItem("pg_token") || "";
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, options = {}, { skipAuth = false } = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (!skipAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && !skipAuth) {
    onUnauthorized();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const auth = {
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }, { skipAuth: true }),
  changePassword: (currentPassword, newPassword) =>
    request("/auth/password", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) }),
  getToken,
  saveToken: (token) => localStorage.setItem("pg_token", token),
  saveUsername: (u) => localStorage.setItem("pg_username", u),
  getUsername: () => localStorage.getItem("pg_username") || "",
  logout: () => {
    localStorage.removeItem("pg_token");
    localStorage.removeItem("pg_username");
  },
};

export const api = {
  listTenants: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== "" && v != null)
    ).toString();
    return request(`/tenants${qs ? `?${qs}` : ""}`);
  },
  createTenant: (data) => request("/tenants", { method: "POST", body: JSON.stringify(data) }),
  bulkImport: (rows) => request("/tenants/bulk-import", { method: "POST", body: JSON.stringify({ rows }) }),
  updateTenant: (id, data) => request(`/tenants/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTenant: (id) => request(`/tenants/${id}`, { method: "DELETE" }),
  recordPayment: (paymentId, amount) =>
    request(`/payments/${paymentId}/pay`, { method: "POST", body: JSON.stringify({ amount }) }),
  history: (id) => request(`/tenants/${id}/history`),
  dashboard: () => request("/dashboard"),
};
