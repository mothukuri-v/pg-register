const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

function Stat({ label, value, accent }) {
  return (
    <div className="flex-1 min-w-[150px] bg-ink-800 border border-ink-600/40 rounded-lg px-5 py-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-paper/50 font-body mb-1.5">{label}</p>
      <p className={`font-mono text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

export default function Dashboard({ data }) {
  if (!data) return null;
  return (
    <div className="flex flex-wrap gap-3">
      <Stat label="Tenants" value={data.total_tenants} accent="text-paper" />
      <Stat label="Collected this cycle" value={fmt(data.collected_this_cycle)} accent="text-sage-light" />
      <Stat label="Outstanding" value={fmt(data.pending_amount)} accent="text-rust-light" />
      <Stat label="Paid" value={data.paid_count} accent="text-sage-light" />
      <Stat label="Pending / Partial" value={data.pending_count + data.partial_count} accent="text-brass-light" />
      <Stat label="Overdue" value={data.overdue_count} accent="text-rust-light" />
      <Stat label="Due within 7 days" value={data.due_within_7_days} accent="text-brass-light" />
    </div>
  );
}
