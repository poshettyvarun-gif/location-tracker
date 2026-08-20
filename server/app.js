import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  findUserByUsername,
  findUserById,
  createSession,
  getSessionUser,
  destroySession,
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  nextSlotOccupantOnDuty,
  employeeForSlot,
  savePhoto,
  loadPhotoUrl,
  loadPhotoBuffer,
  deletePhoto,
  SHIFT_SLOTS,
} from "./db.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" }));

// Serverless filesystems are read-only, so photos are held in memory and
// persisted to the key/value store as data URLs rather than written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
});

function publicEmployee(e) {
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    username: e.username,
    role: e.role,
    designation: e.designation ?? null,
    profilePhotoUrl: e.profilePhotoId ? `/api/photos/${e.profilePhotoId}` : null,
    shiftSlot: e.shiftSlot,
    assignedPlace: e.assignedPlace,
    onDuty: e.onDuty,
    lastLocation: e.lastLocation,
    lastCheckIn: e.lastCheckIn,
  };
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

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

function requireEmployee(req, res, next) {
  if (req.user.role !== "employee") return res.status(403).json({ error: "Employee only" });
  next();
}

// ---- Auth ----

app.post(
  "/api/auth/login",
  wrap(async (req, res) => {
    const { username, password } = req.body || {};
    const user = username ? await findUserByUsername(username) : null;
    if (!user || !bcrypt.compareSync(password || "", user.passwordHash)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const token = await createSession(user.id, user.role);
    // Logging in starts the shift — this is the event that relieves the previous
    // shift's officer to log out (see the handover check in /api/auth/logout).
    const current =
      user.role === "employee" && user.shiftSlot ? await updateEmployee(user.id, { onDuty: true }) : user;
    res.json({
      token,
      user: current.role === "admin" ? { id: current.id, name: current.name, role: "admin" } : publicEmployee(current),
    });
  }),
);

app.post(
  "/api/auth/logout",
  auth,
  wrap(async (req, res) => {
    if (req.user.role === "employee") {
      const emp = req.user;
      if (emp.onDuty && !(await nextSlotOccupantOnDuty(emp.shiftSlot))) {
        return res.status(409).json({
          error: "You can't log out until the next shift's officer has logged in.",
        });
      }
      await updateEmployee(emp.id, { onDuty: false });
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
    res.json(fresh.role === "admin" ? { id: fresh.id, name: fresh.name, role: "admin" } : publicEmployee(fresh));
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

// ---- Admin ----

app.get(
  "/api/admin/employees",
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const employees = await listEmployees();
    res.json(employees.map(publicEmployee));
  }),
);

/**
 * Admin creates an employee account directly — no env vars, no seed list, no
 * redeploy. Multipart because the profile photo (optional) rides along with
 * the form fields in one request.
 */
app.post(
  "/api/admin/employees",
  auth,
  requireAdmin,
  upload.single("photo"),
  wrap(async (req, res) => {
    const { name, username, password, code, designation } = req.body || {};
    if (!name?.trim() || !username?.trim() || !password) {
      return res.status(400).json({ error: "Name, username, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    let emp;
    try {
      emp = await createEmployee({ name, username, password, code, designation });
    } catch (err) {
      return res.status(409).json({ error: err.message });
    }

    if (req.file) {
      const photoId = `profile-${emp.id}-${Date.now()}`;
      await savePhoto(photoId, req.file.buffer, req.file.mimetype || "image/jpeg");
      emp = await updateEmployee(emp.id, { profilePhotoId: photoId });
    }

    res.status(201).json(publicEmployee(emp));
  }),
);

app.get(
  "/api/admin/employees/:id",
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const emp = await getEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: "Not found" });
    res.json(publicEmployee(emp));
  }),
);

app.post(
  "/api/admin/employees/:id/assign-place",
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const { place } = req.body || {};
    const emp = await updateEmployee(req.params.id, { assignedPlace: place || null });
    if (!emp) return res.status(404).json({ error: "Not found" });
    res.json(publicEmployee(emp));
  }),
);

app.post(
  "/api/admin/employees/:id/assign-shift",
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const { shiftSlot } = req.body || {};
    if (shiftSlot !== null && shiftSlot !== undefined && shiftSlot !== "" && !SHIFT_SLOTS.includes(shiftSlot)) {
      return res.status(400).json({ error: "Invalid shift slot" });
    }
    if (shiftSlot) {
      const holder = await employeeForSlot(shiftSlot);
      if (holder && holder.id !== req.params.id) {
        return res.status(409).json({ error: `${holder.name} already holds the ${shiftSlot} shift` });
      }
    }
    const emp = await updateEmployee(req.params.id, { shiftSlot: shiftSlot || null });
    if (!emp) return res.status(404).json({ error: "Not found" });
    res.json(publicEmployee(emp));
  }),
);

/** Admin override for emergencies (lost phone, employee left, etc.) — bypasses the handover lock. */
app.post(
  "/api/admin/employees/:id/force-end-shift",
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const emp = await updateEmployee(req.params.id, { onDuty: false });
    if (!emp) return res.status(404).json({ error: "Not found" });
    res.json(publicEmployee(emp));
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
  requireAdmin,
  wrap(async (req, res) => {
    const emp = await clearEmployeeStatus(req.params.id);
    if (!emp) return res.status(404).json({ error: "Not found" });
    res.json(publicEmployee(emp));
  }),
);

/** One-click reset from the employee list: clear history AND end the shift. */
app.post(
  "/api/admin/employees/:id/reset",
  auth,
  requireAdmin,
  wrap(async (req, res) => {
    const emp = await clearEmployeeStatus(req.params.id, { alsoEndShift: true });
    if (!emp) return res.status(404).json({ error: "Not found" });
    res.json(publicEmployee(emp));
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
  requireAdmin,
  wrap(async (req, res) => {
    const removed = await deleteEmployee(req.params.id);
    if (!removed) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }),
);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || "Server error" });
});

export default app;
