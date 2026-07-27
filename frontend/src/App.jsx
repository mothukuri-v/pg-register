import { useEffect, useMemo, useState, useCallback } from "react";
import { api, auth, setUnauthorizedHandler } from "./api.js";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Filters from "./components/Filters.jsx";
import TenantTable from "./components/TenantTable.jsx";
import BulkImportModal from "./components/BulkImportModal.jsx";
import { TenantFormModal, PayModal, ConfirmDialog, ChangePasswordModal } from "./components/Modals.jsx";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!auth.getToken());

  useEffect(() => {
    setUnauthorizedHandler(() => {
      auth.logout();
      setLoggedIn(false);
    });
  }, []);

  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />;
  return <Ledger onLogout={() => { auth.logout(); setLoggedIn(false); }} />;
}

function Ledger({ onLogout }) {
  const [tenants, setTenants] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [filters, setFilters] = useState({ search: "", status: "all", room: "", upcomingDays: "" });

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editTenant, setEditTenant] = useState(null);
  const [payTenant, setPayTenant] = useState(null);
  const [deleteTenant, setDeleteTenant] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [list, dash] = await Promise.all([api.listTenants(filters), api.dashboard()]);
      setTenants(list);
      setSummary(dash);
    } catch (e) {
      setErr(e.message || "Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 200); // debounce search typing
    return () => clearTimeout(t);
  }, [load]);

  const rooms = useMemo(() => [...new Set(tenants.map((t) => t.room_no))].sort(), [tenants]);

  const handleCreate = async (data) => {
    await api.createTenant(data);
    setShowForm(false);
    load();
  };

  const handleUpdate = async (data) => {
    await api.updateTenant(editTenant.id, data);
    setEditTenant(null);
    load();
  };

  const handlePay = async (amount) => {
    await api.recordPayment(payTenant.current_payment.id, amount);
    setPayTenant(null);
    load();
  };

  const handleDelete = async () => {
    await api.deleteTenant(deleteTenant.id);
    setDeleteTenant(null);
    load();
  };

  const handleChangePassword = async (currentPassword, newPassword) => {
    await auth.changePassword(currentPassword, newPassword);
  };

  return (
    <div className="min-h-screen bg-ink-900">
      <header className="border-b border-ink-600/40">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold text-paper tracking-tight">
              Narayana PG Rent Register
            </h1>
            <p className="text-paper/50 text-xs font-body mt-1">
              A running ledger of every tenant's rent, dues and payment history
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="hidden sm:block font-mono text-xs text-paper/40">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-paper/60 text-xs font-body">{auth.getUsername()}</span>
              <button
                onClick={() => setShowPassword(true)}
                className="text-xs font-semibold px-2.5 py-1.5 rounded bg-paper/10 text-paper/70 hover:bg-paper/20 transition-colors"
              >
                Change password
              </button>
              <button
                onClick={onLogout}
                className="text-xs font-semibold px-2.5 py-1.5 rounded bg-paper/10 text-paper/70 hover:bg-paper/20 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        {err && (
          <div className="bg-rust/10 border border-rust/30 text-rust text-sm font-body px-4 py-3 rounded-md">{err}</div>
        )}

        <Dashboard data={summary} />

        <Filters
          filters={filters}
          setFilters={setFilters}
          onAdd={() => setShowForm(true)}
          onImport={() => setShowImport(true)}
          rooms={rooms}
        />

        <TenantTable
          tenants={tenants}
          loading={loading}
          onPay={setPayTenant}
          onEdit={setEditTenant}
          onDelete={setDeleteTenant}
        />

        <p className="text-paper/30 text-xs font-body text-center pt-2">
          Rent cycles roll over automatically the day after each due date — a fresh pending entry appears while the
          last cycle stays on record.
        </p>
      </main>

      {showForm && <TenantFormModal onClose={() => setShowForm(false)} onSubmit={handleCreate} />}
      {showImport && <BulkImportModal onClose={() => setShowImport(false)} onDone={load} />}
      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} onSubmit={handleChangePassword} />}
      {editTenant && (
        <TenantFormModal initial={editTenant} onClose={() => setEditTenant(null)} onSubmit={handleUpdate} />
      )}
      {payTenant && <PayModal tenant={payTenant} onClose={() => setPayTenant(null)} onSubmit={handlePay} />}
      {deleteTenant && (
        <ConfirmDialog
          title="Remove tenant?"
          message={`This deletes ${deleteTenant.name} and their entire payment history. This can't be undone.`}
          onCancel={() => setDeleteTenant(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
