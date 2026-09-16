import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { apiFetch } from "../auth/api";

type Row = {
  id: string; name: string; code: string; designation: string; phone: string; sector: string | null; shift: string | null; shiftWindow: string;
  loginAt: number | null; checkInAt: number | null; lastLocation: { lat: number; lng: number; at: number } | null; status: string;
};

const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const stamp = (value: number | null) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
const periodLabel = (period: "day" | "month", selectedDate: string) => {
  const formatted = new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-IN", {
    month: period === "month" ? "long" : "short",
    year: "numeric",
    ...(period === "day" ? { day: "2-digit" } : {}),
  });
  return period === "day" ? `Daily report - ${formatted}` : `Monthly report - ${formatted}`;
};

export default function AdminAttendanceReport() {
  const [period, setPeriod] = useState<"day" | "month">("day");
  const [selectedDate, setSelectedDate] = useState(date);
  const [rows, setRows] = useState<Row[]>([]);
  const [sector, setSector] = useState("all");

  useEffect(() => {
    apiFetch(`/api/admin/reports/attendance?period=${period}&date=${selectedDate}`).then(setRows).catch(() => setRows([]));
  }, [period, selectedDate]);

  const sectors = [...new Set(rows.map((row) => row.sector).filter((value): value is string => Boolean(value)))].sort();
  const visibleRows = sector === "all" ? rows : rows.filter((row) => row.sector === sector);
  const sectorLabel = sector === "all" ? "All sectors" : sector;

  function downloadPdf() {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    pdf.setFillColor(8, 55, 95);
    pdf.rect(0, 0, pageWidth, 24, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("HYDERABAD CITY POLICE", 14, 10);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Commissionerate - Attendance Report", 14, 16);

    pdf.setTextColor(20, 36, 60);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(periodLabel(period, selectedDate), 14, 34);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(85, 98, 116);
    pdf.text(`Scope: ${sectorLabel} | Generated: ${generatedAt} IST | Workers: ${visibleRows.length}`, 14, 40);

    autoTable(pdf, {
      startY: 46,
      head: [["Worker", "Designation", "Phone", "Place of posting", "Shift", "Login", "Check-in", "Last GPS", "Status"]],
      body: visibleRows.map((row) => [
        `${row.name}\n${row.code}`,
        row.designation,
        row.phone,
        row.sector || "Not assigned",
        `${row.shift || "Not assigned"}\n${row.shiftWindow}`,
        stamp(row.loginAt),
        stamp(row.checkInAt),
        row.lastLocation ? `${row.lastLocation.lat.toFixed(5)}, ${row.lastLocation.lng.toFixed(5)}` : "—",
        row.status,
      ]),
      theme: "grid",
      margin: { left: 10, right: 10, bottom: 16 },
      styles: { font: "helvetica", fontSize: 7, cellPadding: 2, textColor: [31, 41, 55], lineColor: [210, 220, 232], lineWidth: 0.15, valign: "middle" },
      headStyles: { fillColor: [8, 55, 95], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: { 0: { cellWidth: 27 }, 1: { cellWidth: 31 }, 2: { cellWidth: 19 }, 3: { cellWidth: 28 }, 4: { cellWidth: 27 }, 5: { cellWidth: 29 }, 6: { cellWidth: 29 }, 7: { cellWidth: 27 }, 8: { cellWidth: 18 } },
      didDrawPage: (data) => {
        const height = pdf.internal.pageSize.getHeight();
        pdf.setDrawColor(210, 220, 232);
        pdf.line(10, height - 11, pageWidth - 10, height - 11);
        pdf.setFontSize(7);
        pdf.setTextColor(85, 98, 116);
        pdf.text("Hyderabad City Police Commissionerate - Internal attendance record", 10, height - 6);
        pdf.text(`Page ${data.pageNumber}`, pageWidth - 22, height - 6);
      },
    });

    const sectorFilePart = sector === "all" ? "all-sectors" : sector.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
    pdf.save(`hyderabad-police-attendance-${sectorFilePart}-${period}-${selectedDate}.pdf`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div><h1 className="font-display text-2xl font-semibold">Attendance report</h1><p className="mt-1 text-sm text-muted-foreground">Attendance for every worker: ACP, Inspector, SI, CI, and Constable.</p></div>
        <button onClick={downloadPdf} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground sm:w-auto"><Download className="h-4 w-4" />Download PDF</button>
      </header>
      <div className="mb-5 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap"><select value={period} onChange={(event) => setPeriod(event.target.value as "day" | "month")} className="min-w-0 rounded-xl border border-input bg-card px-3 py-2 text-sm"><option value="day">Daily</option><option value="month">Monthly</option></select><input type={period === "month" ? "month" : "date"} value={period === "month" ? selectedDate.slice(0, 7) : selectedDate} onChange={(event) => setSelectedDate(period === "month" ? `${event.target.value}-01` : event.target.value)} className="min-w-0 rounded-xl border border-input bg-card px-3 py-2 text-sm" /><select value={sector} onChange={(event) => setSector(event.target.value)} className="min-w-0 rounded-xl border border-input bg-card px-3 py-2 text-sm"><option value="all">All sectors</option>{sectors.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft"><table className="w-full min-w-[1240px] text-left text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="px-4 py-3">Worker</th><th className="px-4 py-3">Designation</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Sector</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Login</th><th className="px-4 py-3">Check-in</th><th className="px-4 py-3">Last GPS</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="px-4 py-3"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.code}</p></td><td className="px-4 py-3">{row.designation}</td><td className="px-4 py-3">{row.phone}</td><td className="px-4 py-3">{row.sector || "Not assigned"}</td><td className="px-4 py-3">{row.shift || "Not assigned"}<br /><span className="text-xs text-muted-foreground">{row.shiftWindow}</span></td><td className="px-4 py-3">{stamp(row.loginAt)}</td><td className="px-4 py-3">{stamp(row.checkInAt)}</td><td className="px-4 py-3">{row.lastLocation ? `${row.lastLocation.lat.toFixed(5)}, ${row.lastLocation.lng.toFixed(5)}` : "—"}</td><td className="px-4 py-3">{row.status}</td></tr>)}{visibleRows.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No worker attendance data for this sector and period.</td></tr>}</tbody></table></div>
    </div>
  );
}
