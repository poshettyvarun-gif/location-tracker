import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Camera, CheckCircle2, LogOut, MapPin, RotateCcw, Shield, ShieldCheck, VideoOff } from "lucide-react";
import { useAuth, apiFetch, type EmployeeUser } from "../auth/AuthContext";

const SHIFT_LABEL: Record<string, string> = {
  morning: "Morning (06:00–14:00)",
  afternoon: "Afternoon (14:00–22:00)",
  night: "Night (22:00–06:00)",
};

const LOCATION_PING_MS = 15000;
const MAX_PHOTO_EDGE = 1024;

// GeolocationPositionError isn't a real Error instance, so its message gets
// lost if it isn't converted here — callers would otherwise just see "Check-in
// failed" with no indication of what actually went wrong.
const GEOLOCATION_ERROR_MESSAGES: Record<number, string> = {
  1: "Location permission denied for this site. Click the location icon in the address bar and allow it.",
  2: "Your device couldn't determine a location. On a Mac, check System Settings → Privacy & Security → Location Services is on AND your browser is ticked in the app list below it.",
  3: "Location request timed out. On a Mac this usually means the browser isn't ticked under System Settings → Privacy & Security → Location Services.",
};

function getRawPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => reject(new Error(GEOLOCATION_ERROR_MESSAGES[err.code] || err.message || "Could not get your location")),
      options,
    );
  });
}

// Desktops/laptops without a GPS chip rely on the OS's Wi-Fi-based location
// service, which can be slow to resolve a high-accuracy fix (or stall
// entirely if it's disabled). Try for a precise fix first, then fall back to
// a faster, lower-accuracy read rather than failing outright.
async function getPosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) throw new Error("Geolocation not supported by this browser");
  try {
    return await getRawPosition({ enableHighAccuracy: true, timeout: 8000 });
  } catch {
    return await getRawPosition({ enableHighAccuracy: false, timeout: 15000 });
  }
}

type LocationState =
  | { status: "locating" }
  | { status: "ready"; lat: number; lng: number; accuracy: number }
  | { status: "error"; message: string };

const RETURN_TO_LOGIN_DELAY_MS = 1800;

export default function EmployeeDashboard() {
  const { user, refresh, logout, returnToLogin } = useAuth();
  const navigate = useNavigate();
  const emp = user as EmployeeUser;

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState<{ verified: boolean } | null>(null);
  const [logoutBlocked, setLogoutBlocked] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [location, setLocation] = useState<LocationState>({ status: "locating" });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /** Probes GPS up front so a broken location setup is visible before submitting. */
  async function probeLocation() {
    setLocation({ status: "locating" });
    try {
      const pos = await getPosition();
      setLocation({
        status: "ready",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    } catch (err) {
      setLocation({
        status: "error",
        message: err instanceof Error ? err.message : "Could not get your location",
      });
    }
  }

  useEffect(() => {
    probeLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Could not access the camera");
    }
  }

  // The camera opens as soon as this screen loads — no upload option.
  useEffect(() => {
    startCamera();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While on duty, keep a live GPS lock via watchPosition (more accurate than
  // repeated one-shot reads — the device keeps refining its fix between
  // sends) and report it to admin on a throttled interval.
  useEffect(() => {
    if (!emp.onDuty || !navigator.geolocation) return;

    const send = async (pos: GeolocationPosition) => {
      try {
        await apiFetch("/api/duty/location", {
          method: "POST",
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        });
      } catch {
        /* best-effort; user may have denied location or lost signal */
      }
    };

    let latest: GeolocationPosition | null = null;
    let firstFixSent = false;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latest = pos;
        if (!firstFixSent) {
          firstFixSent = true;
          send(pos);
        }
      },
      () => {
        /* best-effort; keep the last known fix if the watch errors out */
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    const id = setInterval(() => {
      if (latest) send(latest);
    }, LOCATION_PING_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(id);
    };
  }, [emp.onDuty]);

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;

    // Downscale on capture: phone cameras produce multi-megabyte frames, and
    // these are stored as base64 in the key/value store rather than on disk.
    // A long edge of 1024px stays clearly identifiable at ~100KB.
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `checkin-${Date.now()}.jpg`, { type: "image/jpeg" });
        setCapturedPhoto({ file, previewUrl: URL.createObjectURL(blob) });
      },
      "image/jpeg",
      0.75,
    );
  }

  function retake() {
    if (capturedPhoto) URL.revokeObjectURL(capturedPhoto.previewUrl);
    setCapturedPhoto(null);
  }

  async function handleCheckIn() {
    if (!capturedPhoto) {
      toast.error("Capture a photo before submitting");
      return;
    }
    setSubmitting(true);
    try {
      // Prefer a fresh fix at submit time; fall back to whatever the panel
      // already resolved, and only then to an unverified check-in.
      let fix: { lat: number; lng: number; accuracy: number } | null = null;
      let locationError: string | null = null;
      try {
        const pos = await getPosition();
        fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      } catch (err) {
        if (location.status === "ready") {
          fix = { lat: location.lat, lng: location.lng, accuracy: location.accuracy };
        } else {
          locationError = err instanceof Error ? err.message : "Location unavailable";
        }
      }

      if (!fix) {
        const proceed = confirm(
          "Your location could not be captured, so this check-in will be recorded as LOCATION UNVERIFIED and flagged to your admin.\n\nSubmit anyway?",
        );
        if (!proceed) {
          setSubmitting(false);
          return;
        }
      }

      const form = new FormData();
      form.append("photo", capturedPhoto.file);
      if (fix) {
        form.append("lat", String(fix.lat));
        form.append("lng", String(fix.lng));
        form.append("accuracy", String(fix.accuracy));
      } else if (locationError) {
        form.append("locationError", locationError);
      }
      await apiFetch("/api/duty/checkin", { method: "POST", body: form });
      await refresh();
      retake();
      if (fix) {
        setLocation({ status: "ready", ...fix });
      }
      // The success screen itself communicates the outcome, so no toast here
      // — stacking a toast under an overlay that's about to navigate away
      // just gets lost.
      setCheckInSuccess({ verified: Boolean(fix) });
      setTimeout(() => {
        returnToLogin();
        navigate("/login", { replace: true });
      }, RETURN_TO_LOGIN_DELAY_MS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutBlocked(null);
    try {
      await logout();
    } catch (err) {
      setLogoutBlocked(err instanceof Error ? err.message : "Could not log out");
    } finally {
      setLoggingOut(false);
    }
  }

  if (checkInSuccess) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <div className="animate-check-pop flex h-20 w-20 items-center justify-center rounded-full bg-[#3f8f5f]/15">
          <CheckCircle2 className="h-11 w-11 text-[#3f8f5f]" />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold text-foreground">Checked in successfully</h1>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
          {checkInSuccess.verified
            ? "Your photo and location were recorded."
            : "Your photo was recorded — location was flagged as unverified."}
        </p>
        <p className="mt-6 text-xs text-muted-foreground">Returning to sign in…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl surface-navy">
            <Shield className="h-5 w-5 text-gold" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-card-foreground">{emp.name}</p>
            <p className="truncate text-xs text-muted-foreground">{emp.code} · {emp.username}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        {logoutBlocked && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>{logoutBlocked}</span>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <p className="text-xs text-muted-foreground">Shift</p>
            <p className="mt-1 text-sm font-semibold text-card-foreground">
              {emp.shiftSlot ? SHIFT_LABEL[emp.shiftSlot] : "Not assigned"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className={`mt-1 text-sm font-semibold ${emp.onDuty ? "text-[#3f8f5f]" : "text-muted-foreground"}`}>
              {emp.onDuty ? "On duty" : "Off duty"}
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-card-foreground">
            <MapPin className="h-4 w-4 text-azure" />
            Assigned location
          </p>
          <p className="text-sm text-muted-foreground">
            {emp.assignedPlace ?? "Your admin hasn't assigned a location yet — check with them."}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-1 font-display text-sm font-semibold text-card-foreground">
            Check in at your location
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Capture a photo with your camera. Your current GPS location is captured automatically
            when you submit.
          </p>

          <div
            className={`mb-4 rounded-xl border px-3 py-2.5 text-xs ${
              location.status === "ready"
                ? "border-[#3f8f5f]/30 bg-[#3f8f5f]/10 text-[#265c3b]"
                : location.status === "locating"
                  ? "border-border bg-muted text-muted-foreground"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex-1">
                {location.status === "locating" && <span>Getting your location…</span>}
                {location.status === "ready" && (
                  <span>
                    Location ready — {location.lat.toFixed(5)}, {location.lng.toFixed(5)} (±
                    {Math.round(location.accuracy)}m)
                  </span>
                )}
                {location.status === "error" && (
                  <>
                    <p className="font-medium">Location unavailable</p>
                    <p className="mt-0.5 leading-snug">{location.message}</p>
                    <button
                      onClick={probeLocation}
                      className="mt-1.5 rounded-lg border border-destructive/30 px-2 py-1 text-[11px] font-medium hover:bg-destructive/10"
                    >
                      Retry location
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-navy-deep">
            {cameraError ? (
              <div className="flex flex-col items-center gap-2 px-6 text-center">
                <VideoOff className="h-6 w-6 text-white/50" />
                <p className="text-sm text-white/70">{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="mt-1 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
                >
                  Retry camera access
                </button>
              </div>
            ) : capturedPhoto ? (
              <img src={capturedPhoto.previewUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {capturedPhoto ? (
            <button
              onClick={retake}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-card-foreground hover:bg-muted"
            >
              <RotateCcw className="h-4 w-4" />
              Retake photo
            </button>
          ) : (
            <button
              onClick={capturePhoto}
              disabled={!!cameraError}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-card-foreground hover:bg-muted disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              Capture photo
            </button>
          )}

          <button
            onClick={handleCheckIn}
            disabled={submitting || !capturedPhoto}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {submitting ? "Submitting…" : "Submit check-in"}
          </button>

          {emp.lastCheckIn && (
            <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
              <img src={emp.lastCheckIn.photoUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-card-foreground">Last check-in</p>
                <p>{new Date(emp.lastCheckIn.at).toLocaleString()}</p>
                {emp.lastCheckIn.locationVerified && emp.lastCheckIn.lat != null && emp.lastCheckIn.lng != null ? (
                  <p>
                    {emp.lastCheckIn.lat.toFixed(5)}, {emp.lastCheckIn.lng.toFixed(5)}
                  </p>
                ) : (
                  <p className="text-destructive">⚠ Location unverified</p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
