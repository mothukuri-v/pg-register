export default function Filters({ filters, setFilters, onAdd, rooms }) {
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const fieldCls =
    "w-full bg-paper border border-paper-line rounded-md px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-brass";

  return (
    <div className="space-y-2.5">
      <input
        value={filters.search}
        onChange={set("search")}
        placeholder="Search name, phone, room…"
        className={fieldCls}
      />

      {/* Each select gets its own row on mobile so the label is never squeezed
          down to a single character — they line up side by side from the sm
          breakpoint up, where there's enough room. */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <select value={filters.building} onChange={set("building")} className={`${fieldCls} sm:w-auto`}>
          <option value="all">All buildings</option>
          <option value="new">New Building (101, 102…)</option>
          <option value="old">Old Building (101A, 102A…)</option>
        </select>

        <select value={filters.status} onChange={set("status")} className={`${fieldCls} sm:w-auto`}>
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="overdue">Overdue</option>
        </select>

        <select value={filters.room} onChange={set("room")} className={`${fieldCls} sm:w-auto`}>
          <option value="">All rooms</option>
          {rooms.map((r) => (
            <option key={r} value={r}>
              Room {r}
            </option>
          ))}
        </select>

        <select value={filters.upcomingDays} onChange={set("upcomingDays")} className={`${fieldCls} sm:w-auto`}>
          <option value="">Any due date</option>
          <option value="3">Due within 3 days</option>
          <option value="7">Due within 7 days</option>
          <option value="15">Due within 15 days</option>
          <option value="30">Due within 30 days</option>
        </select>
      </div>

      <button
        onClick={onAdd}
        className="w-full sm:w-auto sm:ml-auto sm:block bg-brass hover:bg-brass-light text-ink-900 font-semibold text-sm px-4 py-2.5 sm:py-2 rounded-md transition-colors shadow-sm"
      >
        + Add Tenant
      </button>
    </div>
  );
}
