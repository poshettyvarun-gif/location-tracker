import { Fragment, useEffect, useMemo, useState } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Radio, Users, X } from "lucide-react";
import { apiFetch } from "../auth/AuthContext";
import type { EmployeeUser } from "../auth/AuthContext";

const HYDERABAD_CENTER: [number, number] = [17.385, 78.4867];
const POLL_MS = 6000;

type WorkerLocation = { lat: number; lng: number; accuracy: number | null; at: number };
type WorkerOnMap = EmployeeUser & { mapLocation: WorkerLocation | null };

function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(frame);
  }, [map]);
  return null;
}

function locationFor(worker: EmployeeUser): WorkerLocation | null {
  if (worker.lastLocation) return worker.lastLocation;
  const checkIn = worker.lastCheckIn;
  if (checkIn?.locationVerified && checkIn.lat != null && checkIn.lng != null) {
    return { lat: checkIn.lat, lng: checkIn.lng, accuracy: checkIn.accuracy, at: checkIn.at };
  }
  return null;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

export default function AdminLiveMap() {
  const [employees, setEmployees] = useState<EmployeeUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch("/api/admin/employees");
        if (!cancelled) setEmployees(data);
      } catch {
        // Keep the last successful view while a network request retries.
      }
    };
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const workers = useMemo<WorkerOnMap[]>(() => employees.map((worker) => ({ ...worker, mapLocation: locationFor(worker) })), [employees]);
  const locatedWorkers = workers.filter((worker) => worker.mapLocation);
  const unlocatedWorkers = workers.filter((worker) => !worker.mapLocation);
  const selected = workers.find((worker) => worker.id === selectedId) || null;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <header className="mb-5">
        <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">Hyderabad Police Locations</h1>
        <p className="mt-1 text-sm text-muted-foreground">CP/DCP live visibility of every worker’s latest shared GPS location, photo, designation, phone number, and duty status.</p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="relative h-[620px] min-h-[440px]">
          <MapContainer center={HYDERABAD_CENTER} zoom={12} className="h-full w-full" scrollWheelZoom>
            <InvalidateOnMount />
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {locatedWorkers.map((worker) => {
              const location = worker.mapLocation!;
              const active = worker.onDuty;
              return <Fragment key={worker.id}>{location.accuracy && <Circle center={[location.lat, location.lng]} radius={location.accuracy} pathOptions={{ color: active ? "#19744b" : "#d43a3a", fillColor: active ? "#19744b" : "#d43a3a", fillOpacity: 0.09, weight: 1 }} />}<CircleMarker center={[location.lat, location.lng]} radius={14} eventHandlers={{ click: () => setSelectedId(worker.id) }} pathOptions={{ color: "#ffffff", fillColor: active ? "#19744b" : "#d43a3a", fillOpacity: 0.98, weight: 3 }} /></Fragment>;
            })}
          </MapContainer>

          <div className="absolute left-4 top-4 z-[500] rounded-xl bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
            <p className="text-sm font-semibold text-slate-800">Live worker visibility</p>
            <p className="mt-0.5 text-xs text-slate-500"><span className="font-semibold text-[#19744b]">{locatedWorkers.filter((worker) => worker.onDuty).length} on duty</span> · {locatedWorkers.length} sharing GPS · {unlocatedWorkers.length} awaiting GPS</p>
          </div>

          {selected && (
            <article className="absolute left-4 top-24 z-[500] w-[min(400px,calc(100%-2rem))] rounded-2xl bg-white p-5 shadow-2xl">
              <button onClick={() => setSelectedId(null)} aria-label="Close worker details" className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              <div className="flex gap-4 pr-6">
                {selected.profilePhotoUrl || selected.lastCheckIn?.photoUrl ? <img src={selected.profilePhotoUrl || selected.lastCheckIn?.photoUrl} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-sky-100 text-lg font-semibold text-sky-700">{initials(selected.name)}</div>}
                <div className="min-w-0 text-sm text-slate-600"><p className="font-semibold text-slate-800">{selected.name}</p><p>{selected.designation || "Field worker"}</p><p>Mobile: {selected.phone}</p><p className={`mt-1 font-medium ${selected.onDuty ? "text-[#19744b]" : "text-red-600"}`}>{selected.onDuty ? "On duty" : "Absent / Off duty"}</p></div>
              </div>
              {selected.mapLocation && <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500"><p>{selected.mapLocation.lat.toFixed(5)}, {selected.mapLocation.lng.toFixed(5)}{selected.mapLocation.accuracy ? ` (±${Math.round(selected.mapLocation.accuracy)}m)` : ""}</p><p className="mt-0.5">Last update: {new Date(selected.mapLocation.at).toLocaleString()}</p></div>}
            </article>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-azure" /><h2 className="font-display text-sm font-semibold">Workers awaiting GPS</h2></div>
        {unlocatedWorkers.length === 0 ? <p className="text-sm text-muted-foreground">Every worker has shared a GPS location.</p> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{unlocatedWorkers.map((worker) => <div key={worker.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{initials(worker.name)}</div><div className="min-w-0"><p className="truncate text-sm font-medium">{worker.name}</p><p className="text-xs text-muted-foreground">{worker.designation || "Field worker"} · {worker.phone}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Radio className="h-3 w-3" />No GPS shared yet</p></div></div>)}</div>}
      </section>
    </div>
  );
}
