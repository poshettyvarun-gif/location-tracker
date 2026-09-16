import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MapPin, Search, UserRound } from "lucide-react";
import { apiFetch } from "../auth/api";
import type { EmployeeUser } from "../auth/types";
import { useAuth } from "../auth/useAuth";

const POLL_MS = 8000;

export default function AdminOverview() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeUser[]>([]);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [shift, setShift] = useState("all");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch("/api/admin/employees");
        if (!cancelled) setEmployees(data);
      } catch {
        // The next scheduled refresh will retry.
      }
    };
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const onDutyCount = employees.filter((employee) => employee.onDuty).length;
  const title = user?.role === "dcp" ? "Deputy Commissioner monitoring" : "Command monitoring";
  const sectors = [...new Set(employees.map((employee) => employee.sector).filter((item): item is string => Boolean(item)))].sort();
  const shiftOrder = ["Shift A", "Shift B", "Shift C", "Night shift"];
  const shifts = [...new Set(employees.map((employee) => employee.shiftLabel).filter((item): item is string => Boolean(item)))].sort(
    (a, b) => {
      const aIndex = shiftOrder.indexOf(a);
      const bIndex = shiftOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    },
  );
  const visibleEmployees = employees.filter((employee) => {
    const haystack = `${employee.name} ${employee.code} ${employee.phone} ${employee.designation || ""} ${employee.sector || ""} ${employee.placeOfPosting || ""}`.toLowerCase();
    return (sector === "all" || employee.sector === sector) &&
      (shift === "all" || employee.shiftLabel === shift) &&
      haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only live view of every deployed worker. Search by name, phone, designation, sector, or place of posting. {onDutyCount} of {employees.length} on duty now.
        </p>
      </header>

      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">No worker records are available yet.</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search deployed employees" className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none focus:border-azure" />
            </label>
            <select value={sector} onChange={(event) => setSector(event.target.value)} aria-label="Filter by sector" className="h-10 min-w-0 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-azure lg:min-w-64">
              <option value="all">All sectors</option>
              {sectors.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={shift} onChange={(event) => setShift(event.target.value)} aria-label="Filter by shift" className="h-10 min-w-0 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-azure lg:min-w-40">
              <option value="all">All shifts</option>
              {shifts.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full min-w-[1240px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Worker</th>
                <th className="px-4 py-3 font-medium">Designation</th>
                <th className="px-4 py-3 font-medium">Phone number</th>
                <th className="px-4 py-3 font-medium">Deployment</th>
                <th className="px-4 py-3 font-medium">Place of posting</th>
                <th className="px-4 py-3 font-medium">Attendance</th>
                <th className="px-4 py-3 font-medium">Last location</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((employee) => (
                <tr key={employee.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-4">
                    <Link to={`/admin/employees/${employee.id}`} className="flex items-center gap-3">
                      <Avatar url={employee.profilePhotoUrl} name={employee.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-card-foreground">{employee.name}</p>
                        <p className="text-xs text-muted-foreground">{employee.code}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{employee.designation || "Field worker"}</td>
                  <td className="px-4 py-4 text-muted-foreground">{employee.phone}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-card-foreground">{employee.sector || "Not assigned"}</p>
                    <p className="text-xs text-muted-foreground">{employee.shiftLabel ? `${employee.shiftLabel}${employee.shiftTime ? ` · ${employee.shiftTime}` : ""}` : "Shift not assigned"}</p>
                  </td>
                  <td className="max-w-64 px-4 py-4 text-muted-foreground">{employee.placeOfPosting || "Not assigned"}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${employee.onDuty ? "text-[#265c3b]" : "text-muted-foreground"}`}>
                      <span className={`h-2 w-2 rounded-full ${employee.onDuty ? "bg-[#3f8f5f]" : "bg-muted-foreground/40"}`} />
                      {employee.onDuty ? "On duty" : "Off duty"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {employee.lastLocation ? (
                      <span className="flex items-center gap-1 text-azure"><MapPin className="h-3.5 w-3.5" />{employee.lastLocation.lat.toFixed(5)}, {employee.lastLocation.lng.toFixed(5)}</span>
                    ) : "No location yet"}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link to={`/admin/employees/${employee.id}`} aria-label={`View ${employee.name}`} className="inline-flex rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><ChevronRight className="h-4 w-4" /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleEmployees.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No deployed employees match this filter.</p>}
        </>
      )}
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) return <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  const initials = name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-azure/15 text-sm font-semibold text-azure">{initials || <UserRound className="h-5 w-5" />}</div>;
}
