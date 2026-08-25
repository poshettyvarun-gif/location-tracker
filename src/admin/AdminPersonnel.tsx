import { useEffect, useState, type FormEvent } from "react";
import { Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, useAuth, hasFullAccess, isReadOnly, RANK_LABEL } from "../auth/AuthContext";
import type { PersonnelUser, PersonnelRank } from "../auth/AuthContext";

const POLL_MS = 10000;
const CREATABLE_RANKS: PersonnelRank[] = ["acp", "inspector"];

export default function AdminPersonnel() {
  const { user } = useAuth();
  const canManage = hasFullAccess(user?.role ?? "");
  const readOnly = isReadOnly(user?.role ?? "");
  const [people, setPeople] = useState<PersonnelUser[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch("/api/admin/personnel");
        if (!cancelled) setPeople(data);
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

  async function removePerson(person: PersonnelUser) {
    if (!confirm(`Remove ${person.name} (${RANK_LABEL[person.role]})? This can't be undone.`)) return;
    setDeletingId(person.id);
    try {
      await apiFetch(`/api/admin/personnel/${person.id}`, { method: "DELETE" });
      setPeople((prev) => prev.filter((p) => p.id !== person.id));
      toast.success(`${person.name} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setDeletingId(null);
    }
  }

  const ranked = [...people].sort((a, b) => {
    const order: Record<PersonnelRank, number> = { cp: 0, dcp: 1, acp: 2, inspector: 3 };
    return order[a.role] - order[b.role] || a.name.localeCompare(b.name);
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">Personnel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The command structure — who reports where, and how many constables each Inspector runs.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground sm:shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            Add personnel
          </button>
        )}
      </header>

      {readOnly && (
        <p className="mb-6 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs text-foreground">
          Read-only access — you can see the full command structure, but can't add or remove anyone.
        </p>
      )}

      {showAddForm && (
        <AddPersonnelForm
          onClose={() => setShowAddForm(false)}
          onCreated={(person) => {
            setPeople((prev) => [...prev, person]);
            setShowAddForm(false);
          }}
        />
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Constables</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {ranked.map((p) => {
              const fixed = p.role === "cp" || p.role === "dcp";
              return (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3.5 font-medium text-card-foreground">{p.name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{p.username}</td>
                  <td className="px-4 py-3.5">
                    <span className="rounded-full bg-azure/15 px-2.5 py-1 text-xs font-semibold text-azure">
                      {RANK_LABEL[p.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {p.role === "inspector" ? (p.constableCount ?? 0) : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    {canManage && !fixed && (
                      <button
                        onClick={() => removePerson(p)}
                        disabled={deletingId === p.id}
                        title={`Remove ${p.name}`}
                        aria-label={`Remove ${p.name}`}
                        className="ml-auto flex rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {fixed && <span className="block text-right text-xs text-muted-foreground">Fixed</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddPersonnelForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (person: PersonnelUser) => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rank, setRank] = useState<PersonnelRank>("inspector");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const person = await apiFetch("/api/admin/personnel", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), username: username.trim(), password, rank }),
      });
      toast.success(`${person.name} added as ${RANK_LABEL[person.role as PersonnelRank]} — username "${person.username}"`);
      onCreated(person);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add personnel");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-card-foreground">New personnel</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Choose their username and password now — this is exactly what they'll use to sign in.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <select
          value={rank}
          onChange={(e) => setRank(e.target.value as PersonnelRank)}
          className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
        >
          {CREATABLE_RANKS.map((r) => (
            <option key={r} value={r}>
              {RANK_LABEL[r]}
            </option>
          ))}
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
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto"
      >
        <UserPlus className="h-4 w-4" />
        {submitting ? "Adding…" : "Add personnel"}
      </button>
    </form>
  );
}
