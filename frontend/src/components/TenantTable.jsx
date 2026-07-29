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

function EmptyState() {
  return (
    <div className="bg-paper rounded-lg border border-paper-line py-16 text-center">
      <p className="font-display text-xl text-ink-800 mb-1">No entries match this view</p>
      <p className="text-ink-700/60 text-sm font-body">Try clearing a filter, or add a new tenant to the register.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile: one card per tenant. A wide table forced onto a phone means
// horizontal scrolling with columns sliced off — a card stacks everything
// vertically instead, so nothing gets cut off and every action is a full-width
// tap target.
// ---------------------------------------------------------------------------
function TenantCard({ tenant, onPay, onEdit, onDelete }) {
  const p = tenant.current_payment;
  return (
    <div className="bg-paper rounded-lg border border-paper-line p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-display font-semibold text-ink-900 leading-tight truncate">{tenant.name}</p>
          <p className="text-xs text-ink-700/60 font-mono mt-0.5 truncate">
            Room {tenant.room_no}
            {tenant.phone && ` · ${tenant.phone}`}
          </p>
        </div>
        <StampBadge status={p?.status || "pending"} />
      </div>

      <div className="flex items-center justify-between gap-3 text-xs font-body mb-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] text-ink-700/45 mb-0.5">Due</p>
          <p className="font-mono text-ink-900">{fmtDate(p?.due_date)}</p>
          <DueLabel days={p?.days_until_due} />
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.1em] text-ink-700/45 mb-0.5">Rent</p>
          <p className="font-mono text-ink-900">{fmt(tenant.rent_amount)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs font-mono border-t border-paper-line pt-2.5 mb-3">
        <span className="text-sage">{fmt(p?.amount_paid)} paid</span>
        <span className="text-rust">{fmt(p?.balance)} due</span>
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={() => onPay(tenant)}
          disabled={!p || p.balance <= 0}
          className="flex-1 text-xs font-semibold py-2.5 rounded bg-sage/10 text-sage disabled:opacity-30 disabled:cursor-not-allowed active:bg-sage/20"
        >
          Record payment
        </button>
        <button
          onClick={() => onEdit(tenant)}
          className="text-xs font-semibold px-3.5 py-2.5 rounded bg-ink-700/10 text-ink-800 active:bg-ink-700/20"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(tenant)}
          className="text-xs font-semibold px-3.5 py-2.5 rounded bg-rust/10 text-rust active:bg-rust/20"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop: the ledger-style table.
// ---------------------------------------------------------------------------
function TenantDesktopTable({ tenants, onPay, onEdit, onDelete }) {
  return (
    <div className="bg-paper rounded-lg border border-paper-line overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm font-body border-collapse min-w-[880px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-ink-700/60 border-b-2 border-ink-700/20">
              <th className="px-5 py-3 font-semibold whitespace-nowrap">Tenant</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Joined</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Rent</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Next due</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Paid / Balance</th>
              <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">Actions</th>
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
                  <td className="px-4 py-3.5 font-mono text-xs text-ink-700/80 whitespace-nowrap">{fmtDate(t.joining_date)}</td>
                  <td className="px-4 py-3.5 font-mono text-right text-ink-900 whitespace-nowrap">{fmt(t.rent_amount)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <p className="font-mono text-xs text-ink-900">{fmtDate(p?.due_date)}</p>
                    <DueLabel days={p?.days_until_due} />
                  </td>
                  <td className="px-4 py-3.5">
                    <StampBadge status={p?.status || "pending"} />
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <p className="font-mono text-sage text-xs">{fmt(p?.amount_paid)} paid</p>
                    <p className="font-mono text-rust text-xs">{fmt(p?.balance)} due</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => onPay(t)}
                        disabled={!p || p.balance <= 0}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded bg-sage/10 text-sage hover:bg-sage/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
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

export default function TenantTable({ tenants, onPay, onEdit, onDelete, loading }) {
  if (loading) {
    return <div className="text-paper/60 text-sm py-10 text-center font-body">Loading ledger…</div>;
  }

  if (tenants.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-3">
        {tenants.map((t) => (
          <TenantCard key={t.id} tenant={t} onPay={onPay} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>

      {/* Desktop / tablet: table */}
      <div className="hidden md:block">
        <TenantDesktopTable tenants={tenants} onPay={onPay} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </>
  );
}
