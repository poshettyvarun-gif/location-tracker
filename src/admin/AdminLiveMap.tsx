import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { apiFetch } from "../auth/AuthContext";
import type { EmployeeUser } from "../auth/AuthContext";

const CITY_CENTER: [number, number] = [17.385, 78.4867];
const POLL_MS = 6000;

function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize());
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);
  return null;
}

export default function AdminLiveMap() {
  const [employees, setEmployees] = useState<EmployeeUser[]>([]);
  const navigate = useNavigate();

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

  const withLocation = employees.filter((e) => e.lastLocation);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card px-6 py-4 md:px-10">
        <h1 className="font-display text-2xl font-semibold text-foreground">Live Map</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {withLocation.length} employee{withLocation.length === 1 ? "" : "s"} reporting a location.
        </p>
      </header>

      <div className="relative flex-1">
        <MapContainer center={CITY_CENTER} zoom={12} className="h-full w-full" scrollWheelZoom>
          <InvalidateOnMount />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {withLocation.map((e) => (
            <Fragment key={e.id}>
              {e.lastLocation!.accuracy && (
                <Circle
                  center={[e.lastLocation!.lat, e.lastLocation!.lng]}
                  radius={e.lastLocation!.accuracy}
                  pathOptions={{
                    color: e.onDuty ? "#3f8f5f" : "#8a93a6",
                    fillColor: e.onDuty ? "#3f8f5f" : "#8a93a6",
                    fillOpacity: 0.08,
                    weight: 1,
                  }}
                />
              )}
              <CircleMarker
                center={[e.lastLocation!.lat, e.lastLocation!.lng]}
                radius={9}
                eventHandlers={{ click: () => navigate(`/admin/employees/${e.id}`) }}
                pathOptions={{
                  color: "white",
                  fillColor: e.onDuty ? "#3f8f5f" : "#8a93a6",
                  fillOpacity: 0.9,
                  weight: 2,
                }}
              >
                <Popup>
                  <strong>{e.name}</strong>
                  <br />
                  {e.code}
                  <br />
                  {e.onDuty ? "On duty" : "Off duty"}
                  <br />
                  <span className="text-[11px] text-muted-foreground">
                    updated {new Date(e.lastLocation!.at).toLocaleTimeString()}
                    {e.lastLocation!.accuracy ? ` (±${Math.round(e.lastLocation!.accuracy)}m)` : ""}
                  </span>
                </Popup>
              </CircleMarker>
            </Fragment>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
