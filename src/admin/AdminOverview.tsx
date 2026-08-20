import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MapPin, Trash2, UserPlus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../auth/AuthContext";
import type { EmployeeUser } from "../auth/AuthContext";

const SHIFT_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
};

const POLL_MS = 8000;

export default function AdminOverview() {
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
          <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">Employees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {onDutyCount} of {employees.length} on duty right now.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground sm:shrink-0"
        >
          <UserPlus className="h-4 w-4" />
          Add employee
        </button>
      </header>

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
          No employees yet — click "Add employee" to create the first account.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Employee ID</th>
                <th className="px-4 py-3 font-medium">Designation</th>
                <th className="px-4 py-3 font-medium">Shift</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link to={`/admin/employees/${e.id}`} className="flex items-center gap-3">
                      <Avatar url={e.profilePhotoUrl} name={e.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-card-foreground">{e.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{e.username}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{e.code}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.designation || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {e.shiftSlot ? SHIFT_LABEL[e.shiftSlot] : "Unassigned"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        e.onDuty ? "text-[#265c3b]" : "text-muted-foreground"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${e.onDuty ? "bg-[#3f8f5f]" : "bg-muted-foreground/40"}`} />
                      {e.onDuty ? "On duty" : "Off duty"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {e.assignedPlace ? (
                      <span className="flex items-center gap-1 text-azure">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{e.assignedPlace}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => resetEmployee(e)}
                        disabled={resettingId === e.id}
                        title="Clear history and end shift"
                        aria-label={`Clear history and end shift for ${e.name}`}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
    return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-azure/15 text-xs font-semibold text-azure">
      {initials || <UserRound className="h-4 w-4" />}
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
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [designation, setDesignation] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        it to them directly; there's no separate invite step.
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
          placeholder="Designation (e.g. Sub-Inspector)"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <input
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          placeholder="Employee ID (leave blank to auto-generate)"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoCapitalize="off"
          autoCorrect="off"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <input
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (6+ characters)"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground sm:col-span-2"
        />
      </div>
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
