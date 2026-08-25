import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import {
  findUserByUsername,
  findUserById,
  findUserByAuthUserId,
  createSession,
  getSessionUser,
  destroySession,
  listPersonnel,
  getPersonnel,
  createPersonnel,
  deletePersonnel,
  listEmployees,
  listEmployeesByInspector,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  savePhoto,
  loadPhotoUrl,
  loadPhotoBuffer,
  deletePhoto,
  SHIFT_SLOTS,
  isShiftActive,
  currentShiftEndsAt,
  CREATABLE_RANKS,
  SELF_REGISTRATION_ROLES,
  createRegistrationRequest,
  listRegistrationRequests,
  reviewRegistrationRequest,
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
  return { id: p.id, code: p.code, name: p.name, username: p.username, role: p.role, ...extra };
}

function publicEmployee(e, extra = {}) {
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    username: e.username,
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

/** CP, DCP, ACP, or Inspector — i.e. anyone who isn't a constable. */
function requireAdminArea(req, res, next) {
  if (req.user.role === "employee") return res.status(403).json({ error: "Not authorized" });
  next();
}

/** CP/DCP only — full read/write across the whole force. */
function requireFullAccess(req, res, next) {
  if (req.user.role !== "cp" && req.user.role !== "dcp") {
    return res.status(403).json({ error: "Restricted to CP/DCP" });
  }
  next();
}

/** Blocks ACP from any route that changes data. ACP sees everything, changes nothing. */
function requireNotReadOnly(req, res, next) {
  if (["acp", "si", "ci"].includes(req.user.role)) return res.status(403).json({ error: "This role has read-only access" });
  next();
}

/** The personnel directory itself is invisible to Inspectors — they only ever see their own constables. */
function requireOrgVisibility(req, res, next) {
  if (["inspector", "si", "ci"].includes(req.user.role)) return res.status(403).json({ error: "Not authorized" });
  next();
}

function requireRegistrationApprover(req, res, next) {
  if (req.user.role !== "acp") return res.status(403).json({ error: "ACP approval required" });
  next();
}

/** An Inspector may only see/act on constables where inspector_id is themselves. CP/DCP/ACP are unrestricted here. */
function inspectorOwns(user, employee) {
  return user.role !== "inspector" || employee.inspectorId === user.id;
}

async function inspectorHasCapacity(inspectorId, excludingEmployeeId = null) {
  if (!inspectorId) return true;
  const assigned = await listEmployeesByInspector(inspectorId);
  return assigned.filter((employee) => employee.id !== excludingEmployeeId).length < MAX_CONSTABLES_PER_INSPECTOR;
}

// ---- Auth ----

function dashboardOrigin(req) {
  const configured = process.env.APP_URL || process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`;
  return (configured || req.get("origin") || "http://127.0.0.1:5174").replace(/\/$/, "");
}

async function sendEmailLink(email, shouldCreateUser, redirectTo) {
  if (!isSupabaseConfigured) throw new Error("Email sign-in links require Supabase configuration");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser, emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(error.message);
}

app.post(
  "/api/auth/registration/send-link",
  wrap(async (req, res) => {
    const { email, name, code, requestedRole } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !name?.trim() || !SELF_REGISTRATION_ROLES.includes(requestedRole)) {
      return res.status(400).json({ error: "Name, email, and registration role are required" });
    }
    const callback = new URL(`${dashboardOrigin(req)}/login`);
    callback.search = new URLSearchParams({
      email_link: "registration",
      registration_name: name.trim(),
      registration_code: code?.trim() || "",
      registration_role: requestedRole,
    }).toString();
    await sendEmailLink(normalizedEmail, true, callback.toString());
    res.json({ ok: true });
  }),
);

app.post(
  "/api/auth/registration/verify-link",
  wrap(async (req, res) => {
    const { accessToken, name, code, requestedRole } = req.body || {};
    if (!accessToken || !name?.trim() || !SELF_REGISTRATION_ROLES.includes(requestedRole)) {
      return res.status(400).json({ error: "Name, role, and verification link are required" });
    }
    if (!isSupabaseConfigured) return res.status(503).json({ error: "Email registration is not configured" });
    const { data, error } = await supabase.auth.getUser(accessToken);
    const normalizedEmail = data?.user?.email?.toLowerCase();
    if (error || !data?.user || !normalizedEmail) {
      return res.status(401).json({ error: "Invalid or expired email link" });
    }
    const request = await createRegistrationRequest({
      authUserId: data.user.id,
      email: normalizedEmail,
      name,
      code,
      requestedRole,
    });
    res.status(201).json({ id: request.id, status: request.status });
  }),
);

app.post(
  "/api/auth/email/send-link",
  wrap(async (req, res) => {
    const normalizedEmail = String(req.body?.email || "").trim().toLowerCase();
    if (!normalizedEmail) return res.status(400).json({ error: "Email is required" });
    await sendEmailLink(normalizedEmail, false, `${dashboardOrigin(req)}/login?email_link=login`);
    res.json({ ok: true });
  }),
);

app.post(
  "/api/auth/email/verify-link",
  wrap(async (req, res) => {
    const accessToken = String(req.body?.accessToken || "").trim();
    if (!accessToken) return res.status(400).json({ error: "Email verification link is required" });
    if (!isSupabaseConfigured) return res.status(503).json({ error: "Email login is not configured" });
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid or expired email link" });
    }
    const user = await findUserByAuthUserId(data.user.id);
    if (!user) return res.status(403).json({ error: "Your verified registration is awaiting ACP approval" });
    const shiftExpiry = user.role === "employee" && user.shiftSlot ? currentShiftEndsAt() : undefined;
    const appToken = await createSession(user.id, user.role, shiftExpiry);
    const current = user.role === "employee" && user.shiftSlot ? await updateEmployee(user.id, { onDuty: true }) : user;
    res.json({ token: appToken, user: current.role === "employee" ? publicEmployee(current) : publicPersonnel(current) });
  }),
);

app.post(
  "/api/auth/login",
  wrap(async (req, res) => {
    const { username, password } = req.body || {};
    const user = username ? await findUserByUsername(username) : null;
    if (!user || !bcrypt.compareSync(password || "", user.passwordHash)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (user.role === "employee" && user.shiftSlot && !isShiftActive(user.shiftSlot)) {
      return res.status(403).json({ error: "You can only sign in during your assigned shift." });
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
  "/api/admin/registration-requests",
  auth,
  requireRegistrationApprover,
  wrap(async (_req, res) => {
    const requests = await listRegistrationRequests();
    res.json(requests.map((request) => ({
      id: request.id,
      email: request.email,
      name: request.name,
      code: request.code,
      requestedRole: request.requested_role,
      status: request.status,
      createdAt: request.created_at,
      reviewedAt: request.reviewed_at,
    })));
  }),
);

app.post(
  "/api/admin/registration-requests/:id/review",
  auth,
  requireRegistrationApprover,
  wrap(async (req, res) => {
    const { decision } = req.body || {};
    if (decision !== "approved" && decision !== "rejected") {
      return res.status(400).json({ error: "Decision must be approved or rejected" });
    }
    const result = await reviewRegistrationRequest(req.params.id, decision, req.user.id);
    if (!result) return res.status(404).json({ error: "Registration not found" });
    res.json({ id: result.request.id, status: result.request.status });
  }),
);

app.get(
  "/api/admin/personnel",
  auth,
  requireAdminArea,
  requireOrgVisibility,
  wrap(async (req, res) => {
    const [people, employees] = await Promise.all([listPersonnel(), listEmployees()]);
    const countByInspector = new Map();
    for (const e of employees) {
      if (!e.inspectorId) continue;
      countByInspector.set(e.inspectorId, (countByInspector.get(e.inspectorId) || 0) + 1);
    }
    res.json(
      people.map((p) =>
        publicPersonnel(p, p.role === "inspector" ? { constableCount: countByInspector.get(p.id) || 0 } : {}),
      ),
    );
  }),
);

/** CP/DCP create an ACP or Inspector account. CP/DCP themselves are fixed — never created here. */
app.post(
  "/api/admin/personnel",
  auth,
  requireFullAccess,
  wrap(async (req, res) => {
    const { name, username, password, rank } = req.body || {};
    if (!name?.trim() || !username?.trim() || !password) {
      return res.status(400).json({ error: "Name, username, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (!CREATABLE_RANKS.includes(rank)) {
      return res.status(400).json({ error: "Rank must be ACP or Inspector" });
    }
    try {
      const person = await createPersonnel({ name, username, password, rank });
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
  requireFullAccess,
  wrap(async (req, res) => {
    const person = await getPersonnel(req.params.id);
    if (!person) return res.status(404).json({ error: "Not found" });
    if (person.role === "cp" || person.role === "dcp") {
      return res.status(403).json({ error: "CP and DCP are fixed accounts and can't be deleted" });
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

/** Constable accounts are created only after email-OTP registration and ACP approval. */
app.post(
  "/api/admin/employees",
  auth,
  requireAdminArea,
  requireNotReadOnly,
  upload.single("photo"),
  wrap(async (req, res) => {
    return res.status(403).json({
      error: "Constables must register with email OTP and receive ACP approval before accessing the dashboard.",
    });
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
  requireFullAccess,
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
