import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { AlertTriangle, ArrowLeft, MapPin, Power, Radio, Trash2 } from "lucide-react";
import { apiFetch } from "../auth/AuthContext";
import type { EmployeeUser } from "../auth/AuthContext";

const SHIFT_OPTIONS = [
  { value: "", label: "Unassigned" },
  { value: "morning", label: "Morning (06:00–14:00)" },
  { value: "afternoon", label: "Afternoon (14:00–22:00)" },
  { value: "night", label: "Night (22:00–06:00)" },
];

const POLL_MS = 5000;

export default function AdminEmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [emp, setEmp] = useState<EmployeeUser | null>(null);
  const [place, setPlace] = useState("");
  const [savingPlace, setSavingPlace] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch(`/api/admin/employees/${id}`);
        if (cancelled) return;
        setEmp(data);
        setPlace((prev) => (document.activeElement?.id === "place-input" ? prev : data.assignedPlace ?? ""));
      } catch {
        /* transient network error, next poll will retry */
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  async function savePlace() {
    setSavingPlace(true);
    try {
      const data = await apiFetch(`/api/admin/employees/${id}/assign-place`, {
        method: "POST",
        body: JSON.stringify({ place: place.trim() || null }),
      });
      setEmp(data);
      toast.success("Location assigned");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign location");
    } finally {
      setSavingPlace(false);
    }
  }

  async function setShift(shiftSlot: string) {
    setSavingShift(true);
    try {
      const data = await apiFetch(`/api/admin/employees/${id}/assign-shift`, {
        method: "POST",
        body: JSON.stringify({ shiftSlot: shiftSlot || null }),
      });
      setEmp(data);
      toast.success("Shift updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update shift");
    } finally {
      setSavingShift(false);
    }
  }

  async function forceEndShift() {
    if (!emp) return;
    if (!confirm(`End ${emp.name}'s shift now? Use this only for emergencies — it bypasses the handover rule.`)) return;
    try {
      const data = await apiFetch(`/api/admin/employees/${id}/force-end-shift`, { method: "POST" });
      setEmp(data);
      toast.success("Shift ended");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to end shift");
    }
  }

  async function clearStatus() {
    if (!emp) return;
    if (!confirm(`Clear ${emp.name}'s last check-in and location history? This deletes their check-in photo and can't be undone.`)) return;
    try {
      const data = await apiFetch(`/api/admin/employees/${id}/clear-status`, { method: "POST" });
      setEmp(data);
      toast.success("Check-in and location history cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear history");
    }
  }

  async function deleteEmployee() {
    if (!emp || confirmName.trim() !== emp.name) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/employees/${id}`, { method: "DELETE" });
      toast.success(`${emp.name} deleted permanently`);
      navigate("/admin", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete employee");
      setDeleting(false);
    }
  }

  if (!emp) {
    return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  }

  const loc = emp.lastLocation;
  const staleMs = loc ? Date.now() - loc.at : null;
  const isLive = staleMs !== null && staleMs < 30000;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <Link to="/admin" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to employees
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words font-display text-xl font-semibold text-foreground sm:text-2xl">{emp.name}</h1>
          <p className="text-sm text-muted-foreground">{emp.code} · {emp.username}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            emp.onDuty ? "bg-[#3f8f5f]/15 text-[#265c3b]" : "bg-muted text-muted-foreground"
          }`}
        >
          {emp.onDuty ? "On duty" : "Off duty"}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-card-foreground">
            <Radio className={`h-4 w-4 ${isLive ? "text-[#3f8f5f]" : "text-muted-foreground"}`} />
            Live location
          </h2>
          {loc ? (
            <>
              <div className="mb-3 h-56 overflow-hidden rounded-xl">
                <MapContainer center={[loc.lat, loc.lng]} zoom={16} className="h-full w-full">
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {loc.accuracy && (
                    <Circle
                      center={[loc.lat, loc.lng]}
                      radius={loc.accuracy}
                      pathOptions={{ color: "#3f8f5f", fillColor: "#3f8f5f", fillOpacity: 0.12, weight: 1 }}
                    />
                  )}
                  <Marker position={[loc.lat, loc.lng]}>
                    <Popup>{emp.name}</Popup>
                  </Marker>
                </MapContainer>
              </div>
              <p className="text-xs text-muted-foreground">
                {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                {loc.accuracy ? ` (±${Math.round(loc.accuracy)}m)` : ""} —{" "}
                {isLive ? "updated moments ago" : `last updated ${new Date(loc.at).toLocaleTimeString()}`}
              </p>
              {loc.accuracy != null && loc.accuracy > 100 && (
                <p className="mt-1 text-xs text-gold">
                  Low-precision fix — this device is likely reporting Wi-Fi/IP-based location
                  rather than GPS. Accuracy improves outdoors or on a phone with GPS enabled.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No location reported yet.</p>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-card-foreground">
              <MapPin className="h-4 w-4 text-azure" />
              Assigned location
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Tell {emp.name.split(" ")[0]} where to go over radio, then record it here.
            </p>
            <textarea
              id="place-input"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              rows={2}
              className="mb-3 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
              placeholder="e.g. MG Road Junction, Zone A"
            />
            <button
              onClick={savePlace}
              disabled={savingPlace}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {savingPlace ? "Saving…" : "Save location"}
            </button>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-display text-sm font-semibold text-card-foreground">Shift</h2>
            <select
              value={emp.shiftSlot ?? ""}
              onChange={(e) => setShift(e.target.value)}
              disabled={savingShift}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              {SHIFT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {emp.onDuty && (
              <button
                onClick={forceEndShift}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <Power className="h-4 w-4" />
                Force end shift (emergency override)
              </button>
            )}
          </section>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-card-foreground">Last check-in</h2>
          {(emp.lastCheckIn || emp.lastLocation) && (
            <button
              onClick={clearStatus}
              className="flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear history
            </button>
          )}
        </div>
        {emp.lastCheckIn ? (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <img src={emp.lastCheckIn.photoUrl} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
            <div className="text-sm text-muted-foreground">
              <p>{new Date(emp.lastCheckIn.at).toLocaleString()}</p>
              {emp.lastCheckIn.locationVerified && emp.lastCheckIn.lat != null && emp.lastCheckIn.lng != null ? (
                <p>
                  {emp.lastCheckIn.lat.toFixed(5)}, {emp.lastCheckIn.lng.toFixed(5)}
                  {emp.lastCheckIn.accuracy ? ` (±${Math.round(emp.lastCheckIn.accuracy)}m)` : ""}
                </p>
              ) : (
                <div className="mt-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                  <p className="font-semibold">⚠ Location unverified</p>
                  <p className="mt-0.5">
                    {emp.lastCheckIn.locationError ?? "No location was captured for this check-in."}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No check-in submitted yet.</p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-sm font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Danger zone
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Permanently deletes {emp.name}'s account, login, and check-in photo. Unlike "Clear
          history" above, this can't be undone and the record will not come back on its own —
          type their name to confirm.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={`Type "${emp.name}" to confirm`}
            className="w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground sm:flex-1"
          />
          <button
            onClick={deleteEmployee}
            disabled={confirmName.trim() !== emp.name || deleting}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "Deleting…" : "Delete employee permanently"}
          </button>
        </div>
      </section>
    </div>
  );
}
