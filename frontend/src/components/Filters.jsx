export default function Filters({ filters, setFilters, onAdd, onImport, rooms }) {
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const selectCls =
    "bg-paper border border-paper-line rounded-md px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-brass min-w-0";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2.5">
        <input
          value={filters.search}
          onChange={set("search")}
          placeholder="Search name, phone, room…"
          className={`${selectCls} flex-1 min-w-[160px] sm:min-w-[220px] sm:flex-none sm:w-56`}
        />

        <select value={filters.status} onChange={set("status")} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="overdue">Overdue</option>
        </select>

        <select value={filters.room} onChange={set("room")} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="">All rooms</option>
          {rooms.map((r) => (
            <option key={r} value={r}>
              Room {r}
            </option>
          ))}
        </select>

        <select value={filters.upcomingDays} onChange={set("upcomingDays")} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="">Any due date</option>
          <option value="3">Due within 3 days</option>
          <option value="7">Due within 7 days</option>
          <option value="15">Due within 15 days</option>
          <option value="30">Due within 30 days</option>
        </select>
      </div>

      <div className="flex gap-2.5">
        <button
          onClick={onImport}
          className="flex-1 sm:flex-none bg-paper border border-paper-line hover:bg-paper-dark text-ink-800 font-semibold text-sm px-4 py-2 rounded-md transition-colors"
        >
          Import from Excel
        </button>
        <button
          onClick={onAdd}
          className="flex-1 sm:flex-none sm:ml-auto bg-brass hover:bg-brass-light text-ink-900 font-semibold text-sm px-4 py-2 rounded-md transition-colors shadow-sm"
        >
          + Add Tenant
        </button>
      </div>
    </div>
  );
}
