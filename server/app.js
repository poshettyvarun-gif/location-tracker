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
  listPersonnel,
  listPersonnelByInspector,
  getPersonnel,
  createPersonnel,
  deletePersonnel,
  listEmployees,
  listEmployeesByInspector,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  savePhoto,
  loadPhotoUrl,
  loadPhotoBuffer,
  deletePhoto,
  SHIFT_SLOTS,
  currentShiftEndsAt,
  CREATABLE_RANKS,
} from "./db.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" }));

const MAX_CONSTABLES_PER_INSPECTOR = 10;

// Serverless filesystems are read-only, so photos are held in memory and
// persisted to the key/value store as data URLs rather than written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

function publicPersonnel(p, extra = {}) {
  return { id: p.id, code: p.code, name: p.name, phone: p.phone, role: p.role, ...extra };
}

function publicEmployee(e, extra = {}) {
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    phone: e.phone,
    role: e.role,
    designation: e.designation ?? null,
    profilePhotoUrl: e.profilePhotoId ? `/api/photos/${e.profilePhotoId}` : null,
    inspectorId: e.inspectorId ?? null,
    shiftSlot: e.shiftSlot,
    assignedPlace: e.assignedPlace,
    onDuty: e.onDuty,
    lastLocation: e.lastLocation,
    lastCheckIn: e.lastCheckIn,
    ...extra,
  };
}

async function publicEmployeeWithInspector(e) {
  const inspectorName = e.inspectorId ? (await getPersonnel(e.inspectorId))?.name ?? null : null;
  return publicEmployee(e, { inspectorName });
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

/** This deployment is monitor-only: staff records are not managed in the app. */
function requireNotReadOnly(req, res, _next) {
  return res.status(403).json({ error: "Staff records are managed outside this dashboard" });
}

/** The personnel directory itself is invisible to Inspectors — they only ever see their own constables. */
function requireOrgVisibility(req, res, next) {
  if (["si", "ci"].includes(req.user.role)) return res.status(403).json({ error: "Not authorized" });
  next();
}

/** An Inspector may only see/act on constables where inspector_id is themselves. CP/DCP/ACP are unrestricted here. */
function inspectorOwns(user, employee) {
  return user.role !== "inspector" || employee.inspectorId === user.id;
}

function allowedPersonnelRanks(user) {
  if (["cp", "dcp", "acp"].includes(user.role)) return ["inspector", "si", "ci"];
  if (user.role === "inspector") return ["si", "ci"];
  return [];
}

async function inspectorHasCapacity(inspectorId, excludingEmployeeId = null) {
  if (!inspectorId) return true;
  const assigned = await listEmployeesByInspector(inspectorId);
  return assigned.filter((employee) => employee.id !== excludingEmployeeId).length < MAX_CONSTABLES_PER_INSPECTOR;
}

function localDateKey(at) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.SHIFT_TIME_ZONE || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
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

    // Employee sessions end exactly when their active shift ends. Unassigned
    // employees retain the standard short admin-style session for account setup.
    const shiftExpiry = user.role === "employee" && user.shiftSlot ? currentShiftEndsAt() : undefined;
    const token = await createSession(user.id, user.role, shiftExpiry);
    const current = user.role === "employee" && user.shiftSlot ? await updateEmployee(user.id, { onDuty: true }) : user;
    res.json({
      token,
      user: current.role === "employee" ? publicEmployee(current) : publicPersonnel(current),
    });
  }),
);

app.post(
  "/api/auth/logout",
  auth,
  wrap(async (req, res) => {
    if (req.user.role === "employee") {
      await updateEmployee(req.user.id, { onDuty: false });
    }
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

    const photoId = `${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const mime = req.file.mimetype || "image/jpeg";
    await savePhoto(photoId, req.file.buffer, mime);

    // Replace any previous photo so the store doesn't grow without bound.
    const previous = req.user.lastCheckIn?.photoId;
    if (previous) await deletePhoto(previous);

    const hasLocation = Boolean(lat && lng);
    // A check-in without GPS is accepted but permanently marked unverified, so
    // admin can tell it apart from a location-confirmed one rather than it
    // silently looking the same.
    const checkIn = {
      photoId,
      photoUrl: `/api/photos/${photoId}`,
      lat: hasLocation ? Number(lat) : null,
      lng: hasLocation ? Number(lng) : null,
      accuracy: hasLocation && accuracy ? Number(accuracy) : null,
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
    res.json(publicEmployee(emp));
  }),
);

app.post(
  "/api/duty/location",
  auth,
  requireEmployee,
  wrap(async (req, res) => {
    const { lat, lng, accuracy } = req.body || {};
    if (!lat || !lng) return res.status(400).json({ error: "lat/lng required" });
    const emp = await updateEmployee(req.user.id, {
      lastLocation: {
        lat: Number(lat),
        lng: Number(lng),
        accuracy: accuracy ? Number(accuracy) : null,
        at: Date.now(),
      },
    });
    res.json({ ok: true, lastLocation: emp.lastLocation });
  }),
);

// ---- Personnel directory (CP / DCP / ACP / Inspector) ----
// Invisible to Inspectors — they only ever see their own constables.

app.get(
  "/api/admin/reports/attendance",
  auth,
  requireAdminArea,
  wrap(async (req, res) => {
    const period = req.query.period === "month" ? "month" : "day";
    const { start, end } = reportRange(period, String(req.query.date || ""));
    const [allEmployees, sessions] = await Promise.all([req.user.role === "inspector" ? listEmployeesByInspector(req.user.id) : listEmployees(), listSessionsForAttendance(Date.parse(`${start}T00:00:00Z`), Date.parse(`${end}T00:00:00Z`))]);
    const sessionsByEmployee = new Map();
    for (const session of sessions) {
      const current = sessionsByEmployee.get(session.userId);
      if (!current || current.createdAt < session.createdAt) sessionsByEmployee.set(session.userId, session);
    }
    const today = localDateKey(Date.now());
    res.json(allEmployees.map((employee) => {
      const session = sessionsByEmployee.get(employee.id);
      const checkIn = employee.lastCheckIn && localDateKey(employee.lastCheckIn.at) >= start && localDateKey(employee.lastCheckIn.at) < end ? employee.lastCheckIn : null;
      const location = employee.lastLocation && localDateKey(employee.lastLocation.at) >= start && localDateKey(employee.lastLocation.at) < end ? employee.lastLocation : null;
      const missed = !session && start < today;
      return { id: employee.id, name: employee.name, code: employee.code, designation: employee.designation || "Field worker", phone: employee.phone, shift: employee.shiftSlot, shiftWindow: employee.shiftSlot === "morning" ? "06:00–14:00" : employee.shiftSlot === "afternoon" ? "14:00–22:00" : employee.shiftSlot === "night" ? "22:00–06:00" : "Not assigned", loginAt: session?.createdAt || null, checkInAt: checkIn?.at || null, lastLocation: location ? { lat: location.lat, lng: location.lng, at: location.at } : null, status: missed ? "Missed" : employee.onDuty && start === today ? "On duty" : session ? "Completed" : "No attendance" };
    }));
  }),
);

app.get(
  "/api/admin/personnel",
  auth,
  requireAdminArea,
  requireOrgVisibility,
  wrap(async (req, res) => {
    if (req.user.role === "inspector") {
      const people = await listPersonnelByInspector(req.user.id);
      return res.json(people.map((person) => publicPersonnel(person)));
    }
    const [people, employees] = await Promise.all([listPersonnel(), listEmployees()]);
    const countByInspector = new Map();
    for (const e of employees) {
      if (!e.inspectorId) continue;
      countByInspector.set(e.inspectorId, (countByInspector.get(e.inspectorId) || 0) + 1);
    }
    res.json(
      people.map((p) =>
        publicPersonnel(p, p.role === "inspector" ? {
          constableCount: countByInspector.get(p.id) || 0,
          teamMembers: [
            ...people.filter((member) => member.supervisorInspectorId === p.id && ["si", "ci"].includes(member.role)).map((member) => ({ id: member.id, name: member.name, role: member.role })),
            ...employees.filter((employee) => employee.inspectorId === p.id).map((employee) => ({ id: employee.id, name: employee.name, role: "employee" })),
          ],
        } : {}),
      ),
    );
  }),
);

/** CP/DCP/ACP create Inspectors, SI and CI; Inspectors create SI/CI. */
app.post(
  "/api/admin/personnel",
  auth,
  requireAdminArea,
  requireNotReadOnly,
  wrap(async (req, res) => {
    const { name, username, password, rank } = req.body || {};
    if (!name?.trim() || !username?.trim() || !password) {
      return res.status(400).json({ error: "Name, username, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (!CREATABLE_RANKS.includes(rank) || !allowedPersonnelRanks(req.user).includes(rank)) {
      return res.status(403).json({ error: "You are not allowed to create this rank" });
    }
    try {
      const person = await createPersonnel({ name, username, password, rank, supervisorInspectorId: req.user.role === "inspector" ? req.user.id : null });
      res.status(201).json(publicPersonnel(person));
    } catch (err) {
      res.status(409).json({ error: err.message });
    }
  }),
);

/** Permanently removes an ACP/Inspector account. CP/DCP are fixed and protected from this route. */
app.delete(
  "/api/admin/personnel/:id",
  auth,
  requireAdminArea,
  requireNotReadOnly,
  wrap(async (req, res) => {
    const person = await getPersonnel(req.params.id);
    if (!person) return res.status(404).json({ error: "Not found" });
    if (["cp", "dcp", "acp"].includes(person.role) && /^((cp|dcp|acp)-\d+)$/.test(person.id)) {
      return res.status(403).json({ error: "Fixed command accounts can't be deleted" });
    }
    if (req.user.role === "inspector" && (person.supervisorInspectorId !== req.user.id || !["si", "ci"].includes(person.role))) {
      return res.status(403).json({ error: "You can only remove SI or CI accounts you created" });
    }
    if (!["cp", "dcp", "inspector"].includes(req.user.role)) {
      return res.status(403).json({ error: "Not authorized to remove this account" });
    }
    if (person.role === "inspector") {
      const owned = await listEmployeesByInspector(person.id);
      if (owned.length > 0) {
        return res.status(409).json({
          error: `${person.name} still has ${owned.length} constable${owned.length === 1 ? "" : "s"} assigned. Reassign or delete them first.`,
        });
      }
    }
    await deletePersonnel(req.params.id);
    res.json({ ok: true });
  }),
);

// ---- Employees (constables) ----

app.get(
  "/api/admin/employees",
  auth,
  requireAdminArea,
  wrap(async (req, res) => {
    if (req.user.role === "inspector") {
      const mine = await listEmployeesByInspector(req.user.id);
      return res.json(mine.map((e) => publicEmployee(e, { inspectorName: req.user.name })));
    }
    const [employees, people] = await Promise.all([listEmployees(), listPersonnel()]);
    const nameById = new Map(people.map((p) => [p.id, p.name]));
    res.json(employees.map((e) => publicEmployee(e, { inspectorName: e.inspectorId ? nameById.get(e.inspectorId) ?? null : null })));
  }),
);

/**
 * Creates a constable account. CP/DCP may assign any Inspector (or leave
 * unassigned); an Inspector creating one always has it forced to themselves.
 * ACP cannot create anything.
 */
app.post(
  "/api/admin/employees",
  auth,
  requireAdminArea,
  requireNotReadOnly,
  upload.single("photo"),
  wrap(async (req, res) => {
    const { name, username, password, code, designation, shiftSlot, assignedPlace } = req.body || {};
    let { inspectorId } = req.body || {};
    if (!name?.trim() || !username?.trim() || !password) {
      return res.status(400).json({ error: "Name, username, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (shiftSlot && !SHIFT_SLOTS.includes(shiftSlot)) {
      return res.status(400).json({ error: "Invalid shift slot" });
    }

    if (req.user.role === "inspector") {
      inspectorId = req.user.id;
    } else if (inspectorId) {
      const target = await getPersonnel(inspectorId);
      if (!target || target.role !== "inspector") {
        return res.status(400).json({ error: "inspectorId must refer to an Inspector" });
      }
    }
    if (inspectorId && !(await inspectorHasCapacity(inspectorId))) {
      return res.status(409).json({ error: `An Inspector can manage at most ${MAX_CONSTABLES_PER_INSPECTOR} constables` });
    }

    let emp;
    try {
      emp = await createEmployee({ name, username, password, code, designation, inspectorId, shiftSlot, assignedPlace });
    } catch (err) {
      return res.status(409).json({ error: err.message });
    }

    if (req.file) {
      const photoId = `profile-${emp.id}-${Date.now()}`;
      await savePhoto(photoId, req.file.buffer, req.file.mimetype || "image/jpeg");
      emp = await updateEmployee(emp.id, { profilePhotoId: photoId });
    }

    res.status(201).json(await publicEmployeeWithInspector(emp));
  }),
);

app.get(
  "/api/admin/employees/:id",
  auth,
  requireAdminArea,
  wrap(async (req, res) => {
    const emp = await getEmployee(req.params.id);
    if (!emp || !inspectorOwns(req.user, emp)) return res.status(404).json({ error: "Not found" });
    res.json(await publicEmployeeWithInspector(emp));
  }),
);

app.post(
  "/api/admin/employees/:id/assign-inspector",
  auth,
  requireNotReadOnly,
  wrap(async (req, res) => {
    const existing = await getEmployee(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const { inspectorId } = req.body || {};
    if (inspectorId) {
      const target = await getPersonnel(inspectorId);
      if (!target || target.role !== "inspector") {
        return res.status(400).json({ error: "inspectorId must refer to an Inspector" });
      }
      if (!(await inspectorHasCapacity(inspectorId, existing.id))) {
        return res.status(409).json({ error: `An Inspector can manage at most ${MAX_CONSTABLES_PER_INSPECTOR} constables` });
      }
    }
    const emp = await updateEmployee(req.params.id, { inspectorId: inspectorId || null });
    res.json(await publicEmployeeWithInspector(emp));
  }),
);

app.post(
  "/api/admin/employees/:id/assign-place",
  auth,
  requireAdminArea,
  requireNotReadOnly,
  wrap(async (req, res) => {
    const existing = await getEmployee(req.params.id);
    if (!existing || !inspectorOwns(req.user, existing)) return res.status(404).json({ error: "Not found" });
    const { place } = req.body || {};
    const emp = await updateEmployee(req.params.id, { assignedPlace: place || null });
    res.json(await publicEmployeeWithInspector(emp));
  }),
);

app.post(
  "/api/admin/employees/:id/assign-shift",
  auth,
  requireAdminArea,
  requireNotReadOnly,
  wrap(async (req, res) => {
    const existing = await getEmployee(req.params.id);
    if (!existing || !inspectorOwns(req.user, existing)) return res.status(404).json({ error: "Not found" });
    const { shiftSlot } = req.body || {};
    if (shiftSlot !== null && shiftSlot !== undefined && shiftSlot !== "" && !SHIFT_SLOTS.includes(shiftSlot)) {
      return res.status(400).json({ error: "Invalid shift slot" });
    }
    // A shift can have multiple constables. Changing an assignment ends any
    // active duty so the constable must sign in again under the new schedule.
    const emp = await updateEmployee(req.params.id, { shiftSlot: shiftSlot || null, onDuty: false });
    res.json(await publicEmployeeWithInspector(emp));
  }),
);

/** Admin override for emergencies (lost phone, employee left, etc.) — bypasses the handover lock. */
app.post(
  "/api/admin/employees/:id/force-end-shift",
  auth,
  requireAdminArea,
  requireNotReadOnly,
  wrap(async (req, res) => {
    const existing = await getEmployee(req.params.id);
    if (!existing || !inspectorOwns(req.user, existing)) return res.status(404).json({ error: "Not found" });
    const emp = await updateEmployee(req.params.id, { onDuty: false });
    res.json(await publicEmployeeWithInspector(emp));
  }),
);

/**
 * Wipes an employee's recorded status — last check-in (photo included) and
 * last known location. `alsoEndShift` additionally takes them off duty, which
 * is the one-click reset used from the employee tiles.
 */
async function clearEmployeeStatus(id, { alsoEndShift = false } = {}) {
  const existing = await getEmployee(id);
  if (!existing) return null;
  if (existing.lastCheckIn?.photoId) await deletePhoto(existing.lastCheckIn.photoId);

  const patch = { lastCheckIn: null, lastLocation: null };
  if (alsoEndShift) patch.onDuty = false;
  return await updateEmployee(id, patch);
}

app.post(
  "/api/admin/employees/:id/clear-status",
  auth,
  requireAdminArea,
  requireNotReadOnly,
  wrap(async (req, res) => {
    const existing = await getEmployee(req.params.id);
    if (!existing || !inspectorOwns(req.user, existing)) return res.status(404).json({ error: "Not found" });
    const emp = await clearEmployeeStatus(req.params.id);
    res.json(await publicEmployeeWithInspector(emp));
  }),
);

/** One-click reset from the employee list: clear history AND end the shift. */
app.post(
  "/api/admin/employees/:id/reset",
  auth,
  requireAdminArea,
  requireNotReadOnly,
  wrap(async (req, res) => {
    const existing = await getEmployee(req.params.id);
    if (!existing || !inspectorOwns(req.user, existing)) return res.status(404).json({ error: "Not found" });
    const emp = await clearEmployeeStatus(req.params.id, { alsoEndShift: true });
    res.json(await publicEmployeeWithInspector(emp));
  }),
);

/**
 * Permanently removes the employee's account, login, session, and check-in
 * photo. Unlike /reset, this is not recoverable and the record does not come
 * back on a future cold start — seeding only ever runs once per project.
 */
app.delete(
  "/api/admin/employees/:id",
  auth,
  requireAdminArea,
  requireNotReadOnly,
  wrap(async (req, res) => {
    const existing = await getEmployee(req.params.id);
    if (!existing || !inspectorOwns(req.user, existing)) return res.status(404).json({ error: "Not found" });
    await deleteEmployee(req.params.id);
    res.json({ ok: true });
  }),
);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || "Server error" });
});

export default app;
