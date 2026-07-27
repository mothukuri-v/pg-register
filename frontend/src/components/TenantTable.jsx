import StampBadge from "./StampBadge.jsx";

const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const fmtDate = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function DueLabel({ days }) {
  if (days == null) return null;
  if (days < 0) return <span className="text-rust font-mono text-xs">{Math.abs(days)}d overdue</span>;
  if (days === 0) return <span className="text-rust font-mono text-xs font-semibold">due today</span>;
  if (days <= 7) return <span className="text-brass-dark font-mono text-xs">in {days}d</span>;
  return <span className="text-ink-700/60 font-mono text-xs">in {days}d</span>;
}

export default function TenantTable({ tenants, onPay, onEdit, onDelete, loading }) {
  if (loading) {
    return <div className="text-paper/60 text-sm py-10 text-center font-body">Loading ledger…</div>;
  }

  if (tenants.length === 0) {
    return (
      <div className="bg-paper rounded-lg border border-paper-line py-16 text-center">
        <p className="font-display text-xl text-ink-800 mb-1">No entries match this view</p>
        <p className="text-ink-700/60 text-sm font-body">Try clearing a filter, or add a new tenant to the register.</p>
      </div>
    );
  }

  return (
    <div className="bg-paper rounded-lg border border-paper-line overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm font-body border-collapse min-w-[900px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-ink-700/60 border-b-2 border-ink-700/20">
              <th className="px-5 py-3 font-semibold">Tenant</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold text-right">Rent</th>
              <th className="px-4 py-3 font-semibold">Next due</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Paid / Balance</th>
              <th className="px-5 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t, i) => {
              const p = t.current_payment;
              return (
                <tr
                  key={t.id}
                  className={`border-b border-paper-line ${i % 2 === 1 ? "bg-paper-dark/40" : ""} hover:bg-brass/10 transition-colors`}
                >
                  <td className="px-5 py-3.5">
                    <p className="font-display font-semibold text-ink-900 leading-tight">{t.name}</p>
                    <p className="text-xs text-ink-700/60 font-mono mt-0.5">
                      Room {t.room_no} {t.phone && `· ${t.phone}`}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-ink-700/80">{fmtDate(t.joining_date)}</td>
                  <td className="px-4 py-3.5 font-mono text-right text-ink-900">{fmt(t.rent_amount)}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-mono text-xs text-ink-900">{fmtDate(p?.due_date)}</p>
                    <DueLabel days={p?.days_until_due} />
                  </td>
                  <td className="px-4 py-3.5">
                    <StampBadge status={p?.status || "pending"} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="font-mono text-sage text-xs">{fmt(p?.amount_paid)} paid</p>
                    <p className="font-mono text-rust text-xs">{fmt(p?.balance)} due</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => onPay(t)}
                        disabled={p?.balance <= 0}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded bg-sage/10 text-sage hover:bg-sage/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Record payment
                      </button>
                      <button
                        onClick={() => onEdit(t)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded bg-ink-700/10 text-ink-800 hover:bg-ink-700/20 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(t)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded bg-rust/10 text-rust hover:bg-rust/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
