import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MapPin, Trash2, UserPlus, X } from "lucide-react";
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
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {employees.map((e) => (
          /* The reset control is a sibling of the Link, not a child — a button
             nested inside an anchor is invalid and swallows the click. */
          <div key={e.id} className="relative">
            <Link
              to={`/admin/employees/${e.id}`}
              className="flex items-center rounded-2xl border border-border bg-card p-5 pr-24 shadow-soft transition-colors hover:border-azure/40"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-card-foreground">{e.name}</p>
                  <span
                    className={`h-2 w-2 rounded-full ${e.onDuty ? "bg-[#3f8f5f]" : "bg-muted-foreground/40"}`}
                    title={e.onDuty ? "On duty" : "Off duty"}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{e.code}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {e.shiftSlot ? SHIFT_LABEL[e.shiftSlot] + " shift" : "No shift assigned"}
                </p>
                {e.assignedPlace && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-azure">
                    <MapPin className="h-3 w-3" />
                    {e.assignedPlace}
                  </p>
                )}
              </div>
            </Link>

            <div className="absolute right-5 top-1/2 flex -translate-y-1/2 items-center gap-2">
              <button
                onClick={() => resetEmployee(e)}
                disabled={resettingId === e.id}
                title="Clear history and end shift"
                aria-label={`Clear history and end shift for ${e.name}`}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <ChevronRight className="pointer-events-none h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ))}

        {employees.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            No employees yet — click "Add employee" to create the first account.
          </p>
        )}
      </div>
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const emp = await apiFetch("/api/admin/employees", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), username: username.trim(), password }),
      });
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
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
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        <UserPlus className="h-4 w-4" />
        {submitting ? "Creating…" : "Create employee"}
      </button>
    </form>
  );
}
