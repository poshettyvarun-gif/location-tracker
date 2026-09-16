import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "node:crypto";
import {
  findUserByPhone,
  findUserById,
  createSession,
  listSessionsForAttendance,
  getSessionUser,
  destroySession,
  listEmployees,
  getEmployee,
  updateEmployee,
  savePhoto,
  loadPhotoUrl,
  loadPhotoBuffer,
  deletePhoto,
  getShiftHandover,
  releaseShiftHandover,
  resetShiftHandover,
} from "./db.js";
import { DEPLOYMENT_SHIFT_DETAILS, deploymentForPhone } from "./pdfDeploymentRoster.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" }));
// Duty, camera, and GPS data must always be read live. A cached monitor
// response can otherwise show an old "Off duty" state after a worker checks in.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  next();
});

const SHIFT_A_CONSTABLE_ID = "worker-constable-1";
const SHIFT_B_CONSTABLE_ID = "worker-constable-shift-b-1";
const LEGACY_HANDOVER_POSTING = "legacy::constable-shifts";
// Attendance is a daily proof-of-presence, not a permanent account state.
// A worker remains on duty for 24 hours after a successful camera check-in;
// then a new photo + GPS check-in is required for the next attendance day.
const ATTENDANCE_VALIDITY_MS = 24 * 60 * 60 * 1000;

// Serverless filesystems are read-only, so photos are held in memory and
// persisted to the key/value store as data URLs rather than written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

function publicPersonnel(p) {
  return { id: p.id, code: p.code, name: p.name, phone: p.phone, role: p.role };
}

function publicEmployee(e) {
  const deployment = deploymentForPhone(e.phone);
  const plannedShift = deployment ? DEPLOYMENT_SHIFT_DETAILS[deployment.shift] : null;
  const nextShift = deployment?.shift === "A" ? "B" : deployment?.shift === "B" ? "C" : null;
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    phone: e.phone,
    role: e.role,
    designation: e.designation ?? null,
    profilePhotoUrl: e.profilePhotoId ? `/api/photos/${e.profilePhotoId}` : null,
    shiftSlot: e.shiftSlot,
    shiftLabel: e.id === SHIFT_A_CONSTABLE_ID ? "Shift A" : e.id === SHIFT_B_CONSTABLE_ID ? "Shift B" : plannedShift?.label ?? null,
    shiftTime: plannedShift?.time ?? null,
    sector: deployment?.sector ?? e.assignedPlace ?? null,
    placeOfPosting: deployment?.posting ?? null,
    canRevealNextShift: Boolean(nextShift) || e.id === SHIFT_A_CONSTABLE_ID,
    nextShiftLabel: nextShift ? `Shift ${nextShift}` : e.id === SHIFT_A_CONSTABLE_ID ? "Shift B" : null,
    assignedPlace: e.assignedPlace,
    onDuty: hasActiveAttendance(e),
    lastLocation: e.lastLocation,
    lastCheckIn: e.lastCheckIn,
  };
}

function hasActiveAttendance(employee, now = Date.now()) {
  const value = employee.lastCheckIn?.at;
  // New records use an epoch timestamp, but parsing ISO values as well keeps
  // attendance reliable for older records that may have been stored that way.
  const checkedInAt = typeof value === "number" ? value : Date.parse(String(value || ""));
  return Boolean(
    Number.isFinite(checkedInAt) &&
      checkedInAt <= now &&
      now - checkedInAt < ATTENDANCE_VALIDITY_MS,
  );
}

/** Wraps async handlers so a rejected promise becomes a 500 instead of hanging. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const auth = wrap(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const user = token ? await getSessionUser(token) : null;
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  req.user = user;
  req.token = token;
  next();
});

function requireEmployee(req, res, next) {
  if (req.user.role !== "employee") return res.status(403).json({ error: "Employee only" });
  next();
}

/** The two command officers are monitors; field officers use the check-in screen. */
function requireAdminArea(req, res, next) {
  if (!["cp", "dcp"].includes(req.user.role)) return res.status(403).json({ error: "Monitoring is restricted to CP and DCP" });
  next();
}

function localDateKey(at) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.SHIFT_TIME_ZONE || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

function localHour(at) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: process.env.SHIFT_TIME_ZONE || "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(new Date(at)));
}

/** Shift C runs past midnight, so its 00:00–01:00 work remains in the prior A→B→C duty cycle. */
function deploymentDutyDate(shift, now = Date.now()) {
  if (shift !== "C" || localHour(now) >= 3) return localDateKey(now);
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  return localDateKey(yesterday);
}

function deploymentPostingKey(deployment) {
  return `${deployment.sector}::${deployment.posting}`;
}

async function getDeploymentShiftAccess(user) {
  const deployment = deploymentForPhone(user.phone);
  if (!deployment && user.id === SHIFT_B_CONSTABLE_ID) {
    const dutyDate = localDateKey(Date.now());
    const handover = await getShiftHandover(LEGACY_HANDOVER_POSTING, dutyDate);
    return {
      allowed: handover?.unlockedThrough === "B",
      deployment: null,
      dutyDate,
      handover,
      error: "Shift B is locked. Shift A must complete attendance and reveal Shift B first.",
    };
  }
  if (!deployment || !["B", "C"].includes(deployment.shift)) return { allowed: true, deployment };
  const dutyDate = deploymentDutyDate(deployment.shift);
  const handover = await getShiftHandover(deploymentPostingKey(deployment), dutyDate);
  const allowed = deployment.shift === "B" ? ["B", "C"].includes(handover?.unlockedThrough) : handover?.unlockedThrough === "C";
  return { allowed, deployment, dutyDate, handover, error: allowed ? null : lockedShiftMessage(deployment) };
}

async function requireCurrentShiftAccess(user) {
  const access = await getDeploymentShiftAccess(user);
  if (!access.allowed) throw Object.assign(new Error(access.error || lockedShiftMessage(access.deployment)), { status: 403 });
  return access;
}

function readCoordinates({ lat, lng, accuracy }, { required = false } = {}) {
  const hasLatitude = lat !== undefined && lat !== null && lat !== "";
  const hasLongitude = lng !== undefined && lng !== null && lng !== "";
  if (!hasLatitude && !hasLongitude) {
    if (required) throw Object.assign(new Error("lat/lng required"), { status: 400 });
    return null;
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  const locationAccuracy = accuracy === undefined || accuracy === null || accuracy === "" ? null : Number(accuracy);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw Object.assign(new Error("Enter valid latitude and longitude values"), { status: 400 });
  }
  if (locationAccuracy !== null && (!Number.isFinite(locationAccuracy) || locationAccuracy < 0)) {
    throw Object.assign(new Error("Enter a valid location accuracy"), { status: 400 });
  }
  return { lat: latitude, lng: longitude, accuracy: locationAccuracy };
}

function lockedShiftMessage(deployment) {
  const previous = deployment.shift === "B" ? "Shift A" : "Shift B";
  const timing = DEPLOYMENT_SHIFT_DETAILS[deployment.shift]?.time;
  return `${deployment.shift === "B" ? "Shift B" : "Shift C"} is locked at ${deployment.posting}. ${previous} must complete attendance and explicitly reveal this shift first. Its scheduled time (${timing}) does not unlock access by itself.`;
}

function reportRange(period, date) {
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : localDateKey(Date.now());
  const start = period === "month" ? `${selected.slice(0, 7)}-01` : selected;
  const end = new Date(`${period === "month" ? `${selected.slice(0, 7)}-01` : selected}T00:00:00Z`);
  if (period === "month") end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCDate(end.getUTCDate() + 1);
  return { start, end: end.toISOString().slice(0, 10) };
}

// ---- Auth ----

app.post(
  "/api/auth/login",
  wrap(async (req, res) => {
    const phone = String(req.body?.phone || "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: "Enter a valid 10-digit mobile number" });
    }
    const user = await findUserByPhone(phone);
    if (!user) {
      return res.status(401).json({ error: "This mobile number is not registered" });
    }
    const deploymentAccess = await getDeploymentShiftAccess(user);
    // Deployment Shift B/C access is never based on clock time alone. The
    // preceding shift must explicitly release the exact place of posting.
    if (!deploymentAccess.allowed) return res.status(403).json({ error: deploymentAccess.error || lockedShiftMessage(deploymentAccess.deployment) });

    // Phone login only opens the field dashboard. Attendance begins only
    // after the worker submits a fresh camera photo and GPS location.
    const token = await createSession(user.id, user.role);
    const current = user;
    res.json({
      token,
      user: current.role === "employee" ? publicEmployee(current) : publicPersonnel(current),
    });
  }),
);

async function revealNextShift(req, res) {
  await requireCurrentShiftAccess(req.user);
  if (!hasActiveAttendance(req.user)) {
    return res.status(409).json({ error: "Complete your camera and GPS check-in before revealing the next shift." });
  }

  const deployment = deploymentForPhone(req.user.phone);
  if (deployment && ["A", "B"].includes(deployment.shift)) {
    const nextShift = deployment.shift === "A" ? "B" : "C";
    const dutyDate = deploymentDutyDate(deployment.shift);
    await releaseShiftHandover({
      postingKey: deploymentPostingKey(deployment),
      dutyDate,
      unlockedThrough: nextShift,
      releasedBy: req.user.id,
    });
    return res.json({ ok: true, nextShift, message: `${nextShift === "B" ? "Shift B" : "Shift C"} is now unlocked at ${deployment.posting}.` });
  }

  // The original two-constable pair uses the same persisted handover record.
  if (req.user.id === SHIFT_A_CONSTABLE_ID) {
    await releaseShiftHandover({
      postingKey: LEGACY_HANDOVER_POSTING,
      dutyDate: localDateKey(Date.now()),
      unlockedThrough: "B",
      releasedBy: req.user.id,
    });
    return res.json({ ok: true, nextShift: "B", message: "Shift B is now unlocked and can log in." });
  }

  return res.status(403).json({ error: "Only Shift A or Shift B at an assigned posting can reveal the next shift." });
}

app.post("/api/duty/reveal-next-shift", auth, requireEmployee, wrap(revealNextShift));

app.post(
  "/api/auth/logout",
  auth,
  wrap(async (req, res) => {
    // Attendance is the daily camera/GPS proof, not a browser session. A
    // worker can safely leave a shared device after checking in and remains
    // present until that check-in reaches its 24-hour expiry.
    await destroySession(req.token);
    res.json({ ok: true });
  }),
);

app.get(
  "/api/me",
  auth,
  wrap(async (req, res) => {
    const fresh = await findUserById(req.user.id);
    res.json(fresh.role === "employee" ? publicEmployee(fresh) : publicPersonnel(fresh));
  }),
);

// ---- Check-in photos ----

app.get(
  "/api/photos/:id",
  wrap(async (req, res) => {
    // Supabase Storage path: redirect to a short-lived signed URL rather than
    // proxying the bytes through this function.
    const signedUrl = await loadPhotoUrl(req.params.id);
    if (signedUrl) return res.redirect(signedUrl);

    // In-memory fallback (no Supabase configured): serve the buffer directly.
    const raw = await loadPhotoBuffer(req.params.id);
    if (!raw) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Type", raw.mime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(raw.buffer);
  }),
);

// ---- Employee duty actions ----

app.post(
  "/api/duty/checkin",
  auth,
  requireEmployee,
  upload.single("photo"),
  wrap(async (req, res) => {
    const { lat, lng, accuracy, locationError } = req.body || {};
    if (!req.file) return res.status(400).json({ error: "Photo is required" });
    await requireCurrentShiftAccess(req.user);
    const coordinates = readCoordinates({ lat, lng, accuracy });

    const photoId = `${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const mime = req.file.mimetype || "image/jpeg";
    await savePhoto(photoId, req.file.buffer, mime);

    // Replace any previous photo so the store doesn't grow without bound.
    const previous = req.user.lastCheckIn?.photoId;
    if (previous) await deletePhoto(previous);

    const hasLocation = Boolean(coordinates);
    // A check-in without GPS is accepted but permanently marked unverified, so
    // admin can tell it apart from a location-confirmed one rather than it
    // silently looking the same.
    const checkIn = {
      photoId,
      photoUrl: `/api/photos/${photoId}`,
      lat: coordinates?.lat ?? null,
      lng: coordinates?.lng ?? null,
      accuracy: coordinates?.accuracy ?? null,
      locationVerified: hasLocation,
      locationError: hasLocation ? null : locationError || "Location unavailable",
      at: Date.now(),
      employeeCode: req.user.code,
      employeeName: req.user.name,
    };

    const patch = { onDuty: true, lastCheckIn: checkIn };
    if (hasLocation) {
      patch.lastLocation = { lat: checkIn.lat, lng: checkIn.lng, accuracy: checkIn.accuracy, at: checkIn.at };
    }
    const emp = await updateEmployee(req.user.id, patch);
    // A fresh A check-in starts a new A→B→C cycle for that exact posting.
    // Any earlier B/C release is cancelled until A explicitly reveals again.
    const deployment = deploymentForPhone(req.user.phone);
    if (deployment?.shift === "A") {
      await resetShiftHandover(deploymentPostingKey(deployment), deploymentDutyDate("A"));
    }
    // A new Shift A check-in also begins a new legacy two-shift cycle.
    if (req.user.id === SHIFT_A_CONSTABLE_ID) {
      await resetShiftHandover(LEGACY_HANDOVER_POSTING, localDateKey(Date.now()));
    }
    res.json(publicEmployee(emp));
  }),
);

app.post(
  "/api/duty/location",
  auth,
  requireEmployee,
  wrap(async (req, res) => {
    const { lat, lng, accuracy } = req.body || {};
    const coordinates = readCoordinates({ lat, lng, accuracy }, { required: true });
    await requireCurrentShiftAccess(req.user);
    if (!hasActiveAttendance(req.user)) {
      return res.status(409).json({ error: "A new camera and GPS check-in is required before sharing live location" });
    }
    const emp = await updateEmployee(req.user.id, {
      lastLocation: {
        lat: coordinates.lat,
        lng: coordinates.lng,
        accuracy: coordinates.accuracy,
        at: Date.now(),
      },
    });
    res.json({ ok: true, lastLocation: emp.lastLocation });
  }),
);

// ---- CP/DCP monitoring reports ----

app.get(
  "/api/admin/reports/attendance",
  auth,
  requireAdminArea,
  wrap(async (req, res) => {
    const period = req.query.period === "month" ? "month" : "day";
    const { start, end } = reportRange(period, String(req.query.date || ""));
    const [allEmployees, sessions] = await Promise.all([listEmployees(), listSessionsForAttendance(Date.parse(`${start}T00:00:00Z`), Date.parse(`${end}T00:00:00Z`))]);
    const sessionsByEmployee = new Map();
    for (const session of sessions) {
      const current = sessionsByEmployee.get(session.userId);
      if (!current || current.createdAt < session.createdAt) sessionsByEmployee.set(session.userId, session);
    }
    const today = localDateKey(Date.now());
    res.json(allEmployees.map((employee) => {
      const deployment = deploymentForPhone(employee.phone);
      const plannedShift = deployment ? DEPLOYMENT_SHIFT_DETAILS[deployment.shift] : null;
      const session = sessionsByEmployee.get(employee.id);
      const checkIn = employee.lastCheckIn && localDateKey(employee.lastCheckIn.at) >= start && localDateKey(employee.lastCheckIn.at) < end ? employee.lastCheckIn : null;
      const location = employee.lastLocation && localDateKey(employee.lastLocation.at) >= start && localDateKey(employee.lastLocation.at) < end ? employee.lastLocation : null;
      const missed = !checkIn && start < today;
      const activeToday = start === today && hasActiveAttendance(employee);
      return { id: employee.id, name: employee.name, code: employee.code, designation: employee.designation || "Field worker", phone: employee.phone, sector: deployment?.sector ?? employee.assignedPlace ?? null, shift: deployment?.shift ?? employee.shiftSlot, shiftWindow: plannedShift?.time ?? (employee.shiftSlot === "morning" ? "06:00–14:00" : employee.shiftSlot === "afternoon" ? "14:00–22:00" : employee.shiftSlot === "night" ? "22:00–06:00" : "Not assigned"), loginAt: session?.createdAt || null, checkInAt: checkIn?.at || null, lastLocation: location ? { lat: location.lat, lng: location.lng, at: location.at } : null, status: missed ? "Missed" : activeToday ? "On duty" : checkIn ? "Completed" : "No attendance" };
    }));
  }),
);

// ---- Monitored field workers ----

app.get(
  "/api/admin/employees",
  auth,
  requireAdminArea,
  wrap(async (req, res) => {
    const employees = await listEmployees();
    res.json(employees.map(publicEmployee));
  }),
);

app.get(
  "/api/admin/employees/:id",
  auth,
  requireAdminArea,
  wrap(async (req, res) => {
    const emp = await getEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: "Not found" });
    res.json(publicEmployee(emp));
  }),
);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err?.message || "Server error" });
});

export default app;
