import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MapPin, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, useAuth, isReadOnly } from "../auth/AuthContext";
import type { EmployeeUser } from "../auth/AuthContext";

const SHIFT_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
};

const POLL_MS = 8000;

const OVERVIEW_COPY = {
  cp: { title: "Command overview", description: "Force-wide employee readiness and field assignments." },
  dcp: { title: "Deployment overview", description: "Workforce deployment, attendance, and assigned posts." },
  acp: { title: "Operational briefing", description: "Read-only view of constable assignments and duty status." },
  si: { title: "Constable updates", description: "Read-only view of constable attendance, locations, and assignments." },
  ci: { title: "Constable updates", description: "Read-only view of constable attendance, locations, and assignments." },
  inspector: { title: "My constables", description: "Manage the constables assigned to your field unit." },
} as const;

export default function AdminOverview() {
  const { user } = useAuth();
  const readOnly = isReadOnly(user?.role ?? "");
  const role = user?.role === "employee" ? "inspector" : user?.role ?? "inspector";
  const copy = OVERVIEW_COPY[role as keyof typeof OVERVIEW_COPY] ?? OVERVIEW_COPY.inspector;
  const [employees, setEmployees] = useState<EmployeeUser[]>([]);
  const [resettingId, setResettingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch("/api/admin/employees");
        if (!cancelled) setEmployees(data);
      } catch {
        /* transient network error, next poll will retry */
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const onDutyCount = employees.filter((e) => e.onDuty).length;

  /** Clears the employee's check-in/location history and ends their shift. */
  async function resetEmployee(emp: EmployeeUser) {
    if (
      !confirm(
        `Reset ${emp.name}?\n\nThis clears their last check-in (photo included) and location history, and ends their shift. It can't be undone.`,
      )
    ) {
      return;
    }
    setResettingId(emp.id);
    try {
      const updated = await apiFetch(`/api/admin/employees/${emp.id}/reset`, { method: "POST" });
      setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      toast.success(`${emp.name} reset — history cleared and shift ended`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset employee");
    } finally {
      setResettingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.description} {onDutyCount} of {employees.length} on duty right now.
          </p>
        </div>
      </header>

      {readOnly && (
        <p className="mb-6 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs text-foreground">
          Read-only access — you can view every employee and who manages them, but can't add, edit, or
          remove anyone.
        </p>
      )}
      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No approved constables yet. Constables register using email OTP and are approved by ACP.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Employee ID</th>
                <th className="px-4 py-3 font-medium">Designation</th>
                <th className="px-4 py-3 font-medium">Inspector</th>
                <th className="px-4 py-3 font-medium">Shift</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-4">
                    <Link to={`/admin/employees/${e.id}`} className="flex items-center gap-4">
                      <Avatar url={e.profilePhotoUrl} name={e.name} />
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-card-foreground">{e.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{e.username}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{e.code}</td>
                  <td className="px-4 py-4 text-muted-foreground">{e.designation || "—"}</td>
                  <td className="px-4 py-4 text-muted-foreground">{e.inspectorName || "Unassigned"}</td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {e.shiftSlot ? SHIFT_LABEL[e.shiftSlot] : "Unassigned"}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        e.onDuty ? "text-[#265c3b]" : "text-muted-foreground"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${e.onDuty ? "bg-[#3f8f5f]" : "bg-muted-foreground/40"}`} />
                      {e.onDuty ? "On duty" : "Off duty"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {e.assignedPlace ? (
                      <span className="flex items-center gap-1 text-azure">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{e.assignedPlace}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {!readOnly && (
                        <button
                          onClick={() => resetEmployee(e)}
                          disabled={resettingId === e.id}
                          title="Clear history and end shift"
                          aria-label={`Clear history and end shift for ${e.name}`}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      <Link
                        to={`/admin/employees/${e.id}`}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                        aria-label={`View ${e.name}`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
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
  if (url) {
    return <img src={url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />;
  }
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-azure/15 text-base font-semibold text-azure">
      {initials || <UserRound className="h-6 w-6" />}
    </div>
  );
}
