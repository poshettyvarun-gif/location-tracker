import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiFetch } from "../auth/AuthContext";

type Row = {
  id: string; name: string; code: string; designation: string; phone: string; shift: string | null; shiftWindow: string;
  loginAt: number | null; checkInAt: number | null; lastLocation: { lat: number; lng: number; at: number } | null; status: string;
};

const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const stamp = (value: number | null) => value ? new Date(value).toLocaleString() : "—";

export default function AdminAttendanceReport() {
  const [period, setPeriod] = useState<"day" | "month">("day");
  const [selectedDate, setSelectedDate] = useState(date);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    apiFetch(`/api/admin/reports/attendance?period=${period}&date=${selectedDate}`).then(setRows).catch(() => setRows([]));
  }, [period, selectedDate]);

  function exportCsv() {
    const content = [
      ["Worker", "Designation", "Phone", "ID", "Shift", "Shift time", "Login", "Check-in", "Last GPS", "Status"],
      ...rows.map((row) => [row.name, row.designation, row.phone, row.code, row.shift || "Not assigned", row.shiftWindow, stamp(row.loginAt), stamp(row.checkInAt), row.lastLocation ? `${row.lastLocation.lat}, ${row.lastLocation.lng}` : "—", row.status]),
    ].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    link.download = `attendance-${period}-${selectedDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold">Attendance report</h1><p className="mt-1 text-sm text-muted-foreground">Attendance for every worker: ACP, Inspector, SI, CI, and Constable.</p></div>
        <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Download className="h-4 w-4" />Export CSV</button>
      </header>
      <div className="mb-5 flex gap-3"><select value={period} onChange={(event) => setPeriod(event.target.value as "day" | "month")} className="rounded-xl border border-input bg-card px-3 py-2 text-sm"><option value="day">Daily</option><option value="month">Monthly</option></select><input type={period === "month" ? "month" : "date"} value={period === "month" ? selectedDate.slice(0, 7) : selectedDate} onChange={(event) => setSelectedDate(period === "month" ? `${event.target.value}-01` : event.target.value)} className="rounded-xl border border-input bg-card px-3 py-2 text-sm" /></div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft"><table className="w-full min-w-[1120px] text-left text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="px-4 py-3">Worker</th><th className="px-4 py-3">Designation</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Login</th><th className="px-4 py-3">Check-in</th><th className="px-4 py-3">Last GPS</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="px-4 py-3"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.code}</p></td><td className="px-4 py-3">{row.designation}</td><td className="px-4 py-3">{row.phone}</td><td className="px-4 py-3">{row.shift || "Not assigned"}<br /><span className="text-xs text-muted-foreground">{row.shiftWindow}</span></td><td className="px-4 py-3">{stamp(row.loginAt)}</td><td className="px-4 py-3">{stamp(row.checkInAt)}</td><td className="px-4 py-3">{row.lastLocation ? `${row.lastLocation.lat.toFixed(5)}, ${row.lastLocation.lng.toFixed(5)}` : "—"}</td><td className="px-4 py-3">{row.status}</td></tr>)}{rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No worker attendance data for this period.</td></tr>}</tbody></table></div>
    </div>
  );
}
