import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Radio } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { apiFetch } from "../auth/AuthContext";
import type { EmployeeUser } from "../auth/AuthContext";

const POLL_MS = 5000;

export default function AdminEmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const [employee, setEmployee] = useState<EmployeeUser | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch(`/api/admin/employees/${id}`);
        if (!cancelled) setEmployee(data);
      } catch (error) {
        if (!cancelled && error instanceof Error && error.message.toLowerCase().includes("not found")) setNotFound(true);
      }
    };
    void load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id]);

  if (notFound) return <EmptyState message="This worker record was not found." />;
  if (!employee) return <div className="p-10 text-sm text-muted-foreground">Loading worker details…</div>;

  const location = employee.lastLocation;
  const isLive = Boolean(location && Date.now() - location.at < 30_000);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <Link to="/admin" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to monitoring</Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {employee.profilePhotoUrl ? <img src={employee.profilePhotoUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-azure/15 text-lg font-semibold text-azure">{employee.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>}
          <div className="min-w-0"><h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">{employee.name}</h1><p className="text-sm text-muted-foreground">{employee.designation || "Field worker"} · {employee.phone}</p><p className="text-xs text-muted-foreground">{employee.code}</p></div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${employee.onDuty ? "bg-[#3f8f5f]/15 text-[#265c3b]" : "bg-muted text-muted-foreground"}`}>{employee.onDuty ? "On duty" : "Off duty"}</span>
      </header>

      <p className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Monitoring only — worker accounts and check-in records cannot be edited or deleted from this dashboard.</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold"><Radio className={`h-4 w-4 ${isLive ? "text-[#3f8f5f]" : "text-muted-foreground"}`} />Live location</h2>
          {location ? <><div className="h-56 overflow-hidden rounded-xl"><MapContainer center={[location.lat, location.lng]} zoom={16} className="h-full w-full"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{location.accuracy && <Circle center={[location.lat, location.lng]} radius={location.accuracy} pathOptions={{ color: "#3f8f5f", fillColor: "#3f8f5f", fillOpacity: 0.12, weight: 1 }} />}<Marker position={[location.lat, location.lng]}><Popup>{employee.name}</Popup></Marker></MapContainer></div><p className="mt-3 text-sm text-muted-foreground">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}{location.accuracy ? ` (±${Math.round(location.accuracy)}m)` : ""}</p><p className="text-xs text-muted-foreground">{isLive ? "Live now" : `Last updated ${new Date(location.at).toLocaleString()}`}</p></> : <p className="text-sm text-muted-foreground">No GPS location has been shared yet.</p>}
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft"><h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold"><MapPin className="h-4 w-4 text-azure" />Assigned location</h2><p className="text-sm text-muted-foreground">{employee.assignedPlace || "No assigned location."}</p><h2 className="mb-2 mt-6 font-display text-sm font-semibold">Shift</h2><p className="text-sm text-muted-foreground">{employee.shiftSlot || "Not assigned"}</p></section>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft"><h2 className="mb-3 font-display text-sm font-semibold">Latest camera check-in</h2>{employee.lastCheckIn ? <div className="flex flex-col gap-4 sm:flex-row sm:items-center"><img src={employee.lastCheckIn.photoUrl} alt="Latest check-in" className="h-28 w-28 rounded-xl object-cover" /><div className="text-sm text-muted-foreground"><p>{new Date(employee.lastCheckIn.at).toLocaleString()}</p>{employee.lastCheckIn.locationVerified && employee.lastCheckIn.lat != null && employee.lastCheckIn.lng != null ? <p>{employee.lastCheckIn.lat.toFixed(5)}, {employee.lastCheckIn.lng.toFixed(5)}</p> : <p className="text-destructive">Location unverified</p>}</div></div> : <p className="text-sm text-muted-foreground">No check-in submitted yet.</p>}</section>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="p-10 text-center"><p className="text-sm text-muted-foreground">{message}</p><Link to="/admin" className="mt-3 inline-flex text-sm font-medium text-azure hover:underline">Back to monitoring</Link></div>;
}
