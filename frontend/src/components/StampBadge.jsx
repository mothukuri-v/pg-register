const STYLES = {
  paid: "text-sage bg-sage/10",
  pending: "text-brass-dark bg-brass/10",
  partial: "text-brass-dark bg-brass/10",
  overdue: "text-rust bg-rust/10",
};

const LABELS = {
  paid: "Paid",
  pending: "Pending",
  partial: "Partial",
  overdue: "Overdue",
};

export default function StampBadge({ status }) {
  const cls = STYLES[status] || STYLES.pending;
  return <span className={`stamp ${cls}`}>{LABELS[status] || status}</span>;
}
