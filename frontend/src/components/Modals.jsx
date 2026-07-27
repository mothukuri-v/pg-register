import { useState } from "react";

function Overlay({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-ink-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-paper rounded-lg border border-paper-line w-full max-w-md shadow-2xl">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3.5">
      <span className="block text-[11px] uppercase tracking-[0.1em] text-ink-700/60 font-body mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full bg-white border border-paper-line rounded-md px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-brass";

export function TenantFormModal({ initial, onClose, onSubmit }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    initial || { name: "", phone: "", room_no: "", joining_date: new Date().toISOString().slice(0, 10), rent_amount: "" }
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.room_no || !form.joining_date || !form.rent_amount) {
      setError("Please fill in all required fields.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ ...form, rent_amount: Number(form.rent_amount) });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="p-6">
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-0.5">
          {isEdit ? "Edit tenant" : "New tenant entry"}
        </h2>
        <p className="text-xs text-ink-700/60 mb-5 font-body">
          {isEdit ? "Update this tenant's details." : "Adds a new row to the register with the first rent cycle."}
        </p>

        <Field label="Full name">
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder="e.g. Anita Sharma" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Room no.">
            <input className={inputCls} value={form.room_no} onChange={set("room_no")} placeholder="A101" required />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="9876543210" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={isEdit ? "Joining date" : "Joining date"}>
            <input
              type="date"
              className={inputCls}
              value={form.joining_date}
              onChange={set("joining_date")}
              disabled={isEdit}
              required
            />
          </Field>
          <Field label="Monthly rent (₹)">
            <input
              type="number"
              min="0"
              className={inputCls}
              value={form.rent_amount}
              onChange={set("rent_amount")}
              placeholder="8000"
              required
            />
          </Field>
        </div>

        {error && <p className="text-rust text-xs font-body mb-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md text-ink-700 hover:bg-ink-700/10">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-md bg-brass hover:bg-brass-light text-ink-900 disabled:opacity-50"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add tenant"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

export function PayModal({ tenant, onClose, onSubmit }) {
  const balance = tenant.current_payment?.balance || 0;
  const [amount, setAmount] = useState(balance);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(amt);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="p-6">
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-0.5">Record payment</h2>
        <p className="text-xs text-ink-700/60 mb-5 font-body">
          {tenant.name} · Room {tenant.room_no} · balance ₹{balance.toLocaleString("en-IN")}
        </p>

        <Field label="Amount received (₹)">
          <input
            type="number"
            min="0"
            max={balance}
            autoFocus
            className={inputCls}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        {error && <p className="text-rust text-xs font-body mb-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md text-ink-700 hover:bg-ink-700/10">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-md bg-sage hover:bg-sage-light text-white disabled:opacity-50"
          >
            {saving ? "Recording…" : "Record payment"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

export function ChangePasswordModal({ onClose, onSubmit }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(currentPassword, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="p-6">
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-0.5">Change password</h2>
        <p className="text-xs text-ink-700/60 mb-5 font-body">Update the login password for this account.</p>

        {success ? (
          <div>
            <p className="text-sage text-sm font-body mb-5">Password changed successfully.</p>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md bg-brass hover:bg-brass-light text-ink-900">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <Field label="Current password">
              <input
                type="password"
                autoFocus
                className={inputCls}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                className={inputCls}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                className={inputCls}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Field>

            {error && <p className="text-rust text-xs font-body mb-3">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md text-ink-700 hover:bg-ink-700/10">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold rounded-md bg-brass hover:bg-brass-light text-ink-900 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Change password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Overlay>
  );
}

export function ConfirmDialog({ title, message, onCancel, onConfirm }) {
  return (
    <Overlay onClose={onCancel}>
      <div className="p-6">
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-1.5">{title}</h2>
        <p className="text-sm text-ink-700/70 font-body mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold rounded-md text-ink-700 hover:bg-ink-700/10">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-semibold rounded-md bg-rust hover:bg-rust-light text-white">
            Delete
          </button>
        </div>
      </div>
    </Overlay>
  );
}
