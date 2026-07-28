// All dates are stored/compared as YYYY-MM-DD strings.

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addOneMonth(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDate();
  d.setMonth(d.getMonth() + 1);
  // handle month-length overflow (e.g. Jan 31 -> Feb 28)
  if (d.getDate() !== day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

export function cycleLabelFromDue(dueDateStr) {
  return dueDateStr.slice(0, 7); // YYYY-MM
}

// Derives a live status for a payment row given today's date.
export function computeStatus(payment, today = todayStr()) {
  const { amount_due, amount_paid, due_date } = payment;
  if (amount_paid >= amount_due) return "paid";
  if (amount_paid > 0) return due_date < today ? "overdue" : "partial";
  return due_date < today ? "overdue" : "pending";
}

export function daysUntil(dateStr, today = todayStr()) {
  const a = new Date(today + "T00:00:00");
  const b = new Date(dateStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
