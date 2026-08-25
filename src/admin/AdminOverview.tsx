import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MapPin, Trash2, UserPlus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, useAuth, hasFullAccess, isReadOnly } from "../auth/AuthContext";
import type { EmployeeUser, PersonnelUser } from "../auth/AuthContext";

const SHIFT_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
};

const POLL_MS = 8000;

const OVERVIEW_COPY = {
  cp: { title: "Command overview", description: "Force-wide employee readiness and field assignments.", add: "Register constable" },
  dcp: { title: "Deployment overview", description: "Workforce deployment, attendance, and assigned posts.", add: "Add deployment officer" },
  acp: { title: "Operational briefing", description: "Read-only view of constable assignments and duty status.", add: "" },
  inspector: { title: "My constables", description: "Manage your registered field constables and their assigned posts.", add: "Register constable" },
} as const;

export default function AdminOverview() {
  const { user } = useAuth();
  const readOnly = isReadOnly(user?.role ?? "");
  const role = user?.role === "employee" ? "inspector" : user?.role ?? "inspector";
  const copy = OVERVIEW_COPY[role as keyof typeof OVERVIEW_COPY] ?? OVERVIEW_COPY.inspector;
  const [employees, setEmployees] = useState<EmployeeUser[]>([]);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

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
  const atInspectorCapacity = user?.role === "inspector" && employees.length >= 10;

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
        {!readOnly && (
          <button
            onClick={() => setShowAddForm(true)}
            disabled={atInspectorCapacity}
            title={atInspectorCapacity ? "An Inspector can manage up to 10 constables" : undefined}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground sm:shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            {copy.add}
          </button>
        )}
      </header>

      {readOnly && (
        <p className="mb-6 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs text-foreground">
          Read-only access — you can view every employee and who manages them, but can't add, edit, or
          remove anyone.
        </p>
      )}
      {atInspectorCapacity && (
        <p className="mb-6 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs text-foreground">
          Your Inspector allocation is full: 10 of 10 registered constables.
        </p>
      )}

      {showAddForm && (
        <AddEmployeeForm
          onClose={() => setShowAddForm(false)}
          onCreated={(emp) => {
            setEmployees((prev) => [...prev, emp]);
            setShowAddForm(false);
          }}
        />
      )}

      {employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {readOnly ? "No employees yet." : 'No employees yet — click "Add employee" to create the first account.'}
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

function AddEmployeeForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (emp: EmployeeUser) => void;
}) {
  const { user } = useAuth();
  // CP/DCP manage the whole force, so they choose which Inspector a new
  // constable reports to. An Inspector creating one always gets themselves —
  // enforced server-side too, this just keeps the picker out of their way.
  const canPickInspector = hasFullAccess(user?.role ?? "");

  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [designation, setDesignation] = useState("");
  const [shiftSlot, setShiftSlot] = useState("");
  const [assignedPlace, setAssignedPlace] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [inspectors, setInspectors] = useState<PersonnelUser[]>([]);
  const [inspectorId, setInspectorId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canPickInspector) return;
    apiFetch("/api/admin/personnel")
      .then((people: PersonnelUser[]) => setInspectors(people.filter((p) => p.role === "inspector")))
      .catch(() => {
        /* non-critical — form still works with no inspector assigned */
      });
  }, [canPickInspector]);

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto({ file, previewUrl: URL.createObjectURL(file) });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("username", username.trim());
      form.append("password", password);
      if (employeeId.trim()) form.append("code", employeeId.trim());
      if (designation.trim()) form.append("designation", designation.trim());
      if (shiftSlot) form.append("shiftSlot", shiftSlot);
      if (assignedPlace.trim()) form.append("assignedPlace", assignedPlace.trim());
      if (canPickInspector && inspectorId) form.append("inspectorId", inspectorId);
      if (photo) form.append("photo", photo.file);

      const emp = await apiFetch("/api/admin/employees", { method: "POST", body: form });
      toast.success(`${emp.name} created — username "${emp.username}"`);
      onCreated(emp);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create employee");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-soft"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-card-foreground">New employee</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Choose their username and password now — this is exactly what they'll use to sign in. Tell
        it to them directly; there's no separate invite step. You can also set their shift and assigned
        location now; several constables may share the same shift.
      </p>

      <div className="mb-3 flex items-center gap-3">
        <label className="cursor-pointer">
          {photo ? (
            <img src={photo.previewUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-input bg-background text-muted-foreground">
              <UserRound className="h-6 w-6" />
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChosen} />
        </label>
        <div className="text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="font-medium text-azure hover:underline"
          >
            {photo ? "Change photo" : "Add profile photo"}
          </button>
          <p>Optional — shown on their tile and profile.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <input
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          placeholder="Designation (e.g. Constable)"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <input
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          placeholder="Employee ID (leave blank to auto-generate)"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <select
          value={shiftSlot}
          onChange={(e) => setShiftSlot(e.target.value)}
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="">Shift: Unassigned</option>
          <option value="morning">Morning (06:00–14:00)</option>
          <option value="afternoon">Afternoon (14:00–22:00)</option>
          <option value="night">Night (22:00–06:00)</option>
        </select>
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoCapitalize="off"
          autoCorrect="off"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        {canPickInspector && (
          <select
            value={inspectorId}
            onChange={(e) => setInspectorId(e.target.value)}
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">Inspector: Unassigned</option>
            {inspectors.map((i) => (
              <option key={i.id} value={i.id}>
                Inspector: {i.name}
              </option>
            ))}
          </select>
        )}
        <input
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (6+ characters)"
          className={`rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground ${canPickInspector ? "" : "sm:col-span-2"}`}
        />
      </div>
      <textarea
        value={assignedPlace}
        onChange={(e) => setAssignedPlace(e.target.value)}
        placeholder="Assigned location (e.g. Kompally Gate 2)"
        rows={2}
        className="mt-3 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
      />
      <button
        type="submit"
        disabled={submitting}
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto"
      >
        <UserPlus className="h-4 w-4" />
        {submitting ? "Creating…" : "Create employee"}
      </button>
    </form>
  );
}
