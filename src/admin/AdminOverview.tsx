import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MapPin, UserRound } from "lucide-react";
import { apiFetch, useAuth } from "../auth/AuthContext";
import type { EmployeeUser } from "../auth/AuthContext";

const POLL_MS = 8000;

export default function AdminOverview() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeUser[]>([]);

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
  const title = user?.role === "dcp" ? "Deputy command monitoring" : "Command monitoring";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only live view of worker designation, attendance, camera check-in, GPS location, and phone number. {onDutyCount} of {employees.length} on duty now.
        </p>
      </header>

      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">No worker records are available yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Worker</th>
                <th className="px-4 py-3 font-medium">Designation</th>
                <th className="px-4 py-3 font-medium">Phone number</th>
                <th className="px-4 py-3 font-medium">Attendance</th>
                <th className="px-4 py-3 font-medium">Last location</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
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
      )}
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) return <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  const initials = name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-azure/15 text-sm font-semibold text-azure">{initials || <UserRound className="h-5 w-5" />}</div>;
}
