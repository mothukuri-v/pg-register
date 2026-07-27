import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { api } from "../api.js";

// ---- header + value parsing helpers ------------------------------------

const HEADER_ALIASES = {
  name: ["name", "tenant", "tenant name", "full name"],
  phone: ["phone", "mobile", "contact", "phone no", "mobile no"],
  room_no: ["room", "room no", "room no.", "room number", "room_no"],
  joining_date: ["joining date", "join date", "joined", "date of joining", "joining_date", "date"],
  rent_amount: ["rent", "rent amount", "monthly rent", "amount", "fee", "rent_amount"],
};

function normalize(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function guessColumnMap(headerRow) {
  const map = {}; // field -> column index
  headerRow.forEach((cell, i) => {
    const h = normalize(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] != null) continue;
      if (aliases.includes(h)) map[field] = i;
    }
  });
  return map;
}

const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

function toISODate(value) {
  if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
  const s = String(value || "").trim();
  if (!s) return "";

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/YYYY or DD-MM-YYYY
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    return `${m[3]}-${month}-${day}`;
  }

  m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3,})[- ](\d{4})$/); // 15-Mar-2026 / 15 March 2026
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return "";
}

function rowsFromGrid(grid) {
  if (grid.length === 0) return [];
  const map = guessColumnMap(grid[0]);
  const hasHeader = Object.keys(map).length > 0;
  const dataRows = hasHeader ? grid.slice(1) : grid;

  // fallback column order if headers weren't recognised
  const fallback = { name: 0, phone: 1, room_no: 2, joining_date: 3, rent_amount: 4 };
  const cols = hasHeader ? map : fallback;

  return dataRows
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => ({
      name: r[cols.name] ?? "",
      phone: r[cols.phone] ?? "",
      room_no: r[cols.room_no] ?? "",
      joining_date: toISODate(r[cols.joining_date]),
      rent_amount: Number(String(r[cols.rent_amount] ?? "").replace(/[^\d.]/g, "")),
    }));
}

// ---- component -----------------------------------------------------------

export default function BulkImportModal({ onClose, onDone }) {
  const [tab, setTab] = useState("paste");
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileInput = useRef(null);

  const parsePaste = (text) => {
    setPasteText(text);
    setError("");
    const grid = text
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "")
      .map((line) => line.split("\t"));
    setRows(rowsFromGrid(grid));
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
        setRows(rowsFromGrid(grid));
      } catch (err) {
        setError("Couldn't read that file. Make sure it's a valid .xlsx, .xls or .csv.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const validRows = rows.filter((r) => r.name && r.room_no && r.joining_date && r.rent_amount > 0);
  const invalidCount = rows.length - validRows.length;

  const runImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setError("");
    try {
      const res = await api.bulkImport(validRows);
      setResult(res);
      if (res.created > 0) onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-paper rounded-lg border border-paper-line w-full max-w-3xl shadow-2xl max-h-[88vh] flex flex-col">
        <div className="p-6 pb-0">
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-0.5">Import tenants from Excel</h2>
          <p className="text-xs text-ink-700/60 font-body mb-4">
            Columns expected: <span className="font-mono">Name, Phone, Room No, Joining Date, Rent Amount</span> — in
            any order, headers optional.
          </p>

          <div className="flex gap-1 border-b border-paper-line mb-4">
            {[
              ["paste", "Paste from Excel"],
              ["upload", "Upload file"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-2 text-sm font-semibold font-body border-b-2 -mb-px transition-colors ${
                  tab === key ? "border-brass text-ink-900" : "border-transparent text-ink-700/50 hover:text-ink-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 overflow-y-auto scrollbar-thin flex-1">
          {tab === "paste" && (
            <div>
              <p className="text-xs text-ink-700/60 font-body mb-2">
                Select your rows in Excel (including the header row), copy (Ctrl/Cmd+C), and paste here.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => parsePaste(e.target.value)}
                rows={6}
                placeholder={"Name\tPhone\tRoom No\tJoining Date\tRent Amount\nAnita Sharma\t9812345678\tB204\t10/03/2026\t9500"}
                className="w-full bg-white border border-paper-line rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brass"
              />
            </div>
          )}

          {tab === "upload" && (
            <div>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
                className="hidden"
              />
              <button
                onClick={() => fileInput.current?.click()}
                className="w-full border-2 border-dashed border-paper-line rounded-lg py-8 text-center hover:border-brass hover:bg-brass/5 transition-colors"
              >
                <p className="font-body text-sm font-semibold text-ink-900">
                  {fileName || "Click to choose a .xlsx, .xls or .csv file"}
                </p>
                <p className="font-body text-xs text-ink-700/50 mt-1">First row can be a header, or leave it out</p>
              </button>
            </div>
          )}

          {error && <p className="text-rust text-xs font-body mt-3">{error}</p>}

          {rows.length > 0 && (
            <div className="mt-4 mb-2">
              <p className="text-xs font-body font-semibold text-ink-900 mb-2">
                Preview — {validRows.length} ready to import
                {invalidCount > 0 && <span className="text-rust"> · {invalidCount} row(s) need fixing</span>}
              </p>
              <div className="border border-paper-line rounded-md overflow-hidden max-h-56 overflow-y-auto scrollbar-thin">
                <table className="w-full text-xs font-body">
                  <thead className="bg-paper-dark sticky top-0">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-ink-700/60">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Room</th>
                      <th className="px-3 py-2">Joined</th>
                      <th className="px-3 py-2 text-right">Rent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const ok = r.name && r.room_no && r.joining_date && r.rent_amount > 0;
                      return (
                        <tr key={i} className={`border-t border-paper-line ${ok ? "" : "bg-rust/5"}`}>
                          <td className="px-3 py-1.5">{r.name || <span className="text-rust">missing</span>}</td>
                          <td className="px-3 py-1.5 font-mono">{r.phone}</td>
                          <td className="px-3 py-1.5">{r.room_no || <span className="text-rust">missing</span>}</td>
                          <td className="px-3 py-1.5 font-mono">
                            {r.joining_date || <span className="text-rust">bad date</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {r.rent_amount > 0 ? r.rent_amount : <span className="text-rust">bad amount</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-3 bg-sage/10 border border-sage/30 rounded-md px-3 py-2.5 text-xs font-body">
              <p className="text-sage font-semibold">Imported {result.created} tenant(s).</p>
              {result.failed.length > 0 && (
                <ul className="mt-1 text-rust space-y-0.5">
                  {result.failed.map((f, i) => (
                    <li key={i}>
                      Row {f.row}: {f.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-6 pt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md text-ink-700 hover:bg-ink-700/10">
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={runImport}
              disabled={validRows.length === 0 || importing}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-brass hover:bg-brass-light text-ink-900 disabled:opacity-40"
            >
              {importing ? "Importing…" : `Import ${validRows.length || ""} tenant(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
