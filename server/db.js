import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { supabase, isSupabaseConfigured, PHOTO_BUCKET } from "./supabaseClient.js";

/** Shift slots form a fixed relief cycle: morning -> afternoon -> night -> morning (next day). */
export const SHIFT_SLOTS = ["morning", "afternoon", "night"];

export function nextSlot(slot) {
  const i = SHIFT_SLOTS.indexOf(slot);
  return i === -1 ? null : SHIFT_SLOTS[(i + 1) % SHIFT_SLOTS.length];
}

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Three fixed admin accounts, seeded once. Employees are NOT seeded from env
 * vars at all — an admin creates them on demand from the dashboard, choosing
 * the username/password right there. That's the whole point of this design:
 * it doesn't matter how many employees exist, nothing about adding one
 * touches environment variables or a redeploy.
 */
const SEED_ADMINS = [
  { id: "admin-1", name: "Administrator One", usernameEnv: "ADMIN_USERNAME", usernameFallback: "admin", passwordEnv: "ADMIN_PASSWORD", passwordFallback: "Admin#2026" },
  { id: "admin-2", name: "Administrator Two", usernameEnv: "ADMIN2_USERNAME", usernameFallback: "admin2", passwordEnv: "ADMIN2_PASSWORD", passwordFallback: "Admin2#2026" },
  { id: "admin-3", name: "Administrator Three", usernameEnv: "ADMIN3_USERNAME", usernameFallback: "admin3", passwordEnv: "ADMIN3_PASSWORD", passwordFallback: "Admin3#2026" },
];

function freshAdmins() {
  return SEED_ADMINS.map((a) => ({
    id: a.id,
    code: "ADMIN",
    name: a.name,
    username: process.env[a.usernameEnv] || a.usernameFallback,
    passwordHash: bcrypt.hashSync(process.env[a.passwordEnv] || a.passwordFallback, 10),
    role: "admin",
  }));
}

// snake_case (Postgres columns) <-> camelCase (the rest of the app) mapping.
const COLUMN_MAP = {
  passwordHash: "password_hash",
  shiftSlot: "shift_slot",
  assignedPlace: "assigned_place",
  onDuty: "on_duty",
  lastLocation: "last_location",
  lastCheckIn: "last_check_in",
  profilePhotoId: "profile_photo_id",
};

// `role` is implied by which table a row lives in (admins vs employees), so
// there is no such column — the in-memory objects carry it, the rows don't.
const NON_COLUMN_FIELDS = new Set(["role"]);

function toRow(obj) {
  const row = {};
  for (const [k, v] of Object.entries(obj)) {
    if (NON_COLUMN_FIELDS.has(k)) continue;
    row[COLUMN_MAP[k] || k] = v;
  }
  return row;
}

function fromEmployeeRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    username: row.username,
    passwordHash: row.password_hash,
    role: "employee",
    designation: row.designation,
    profilePhotoId: row.profile_photo_id,
    shiftSlot: row.shift_slot,
    assignedPlace: row.assigned_place,
    onDuty: row.on_duty,
    lastLocation: row.last_location,
    lastCheckIn: row.last_check_in,
  };
}

function fromAdminRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    username: row.username,
    passwordHash: row.password_hash,
    role: "admin",
  };
}

function isUniqueViolation(error) {
  return error?.code === "23505";
}

// ---------------------------------------------------------------------------
// In-memory fallback — used only when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// aren't set, so `npm run server` still works with zero setup. Nothing here
// persists across a restart; the real, permanent store is Postgres.
// ---------------------------------------------------------------------------
const mem = {
  seeded: false,
  admins: new Map(),
  employees: new Map(),
  sessions: new Map(),
  photos: new Map(),
};

function memSeed() {
  if (mem.seeded) return;
  for (const a of freshAdmins()) mem.admins.set(a.id, a);
  mem.seeded = true;
}

// ---------------------------------------------------------------------------
// Seeding — runs at most once per project, ever. Whether an admin exists
// right now is irrelevant to this check: it's gated on a single "has this
// project ever been seeded" flag, not "is the table empty" — so a later cold
// start never resurrects an account someone deleted on purpose.
// ---------------------------------------------------------------------------
let seeding = null;

async function seedSupabase() {
  const { data } = await supabase.from("meta").select("value").eq("key", "seeded").maybeSingle();
  if (data?.value) return;

  const { error: adminErr } = await supabase.from("admins").upsert(freshAdmins().map(toRow));
  if (adminErr) throw new Error(`Supabase seed (admins): ${adminErr.message}`);

  const { error: metaErr } = await supabase.from("meta").upsert({ key: "seeded", value: true });
  if (metaErr) throw new Error(`Supabase seed (meta): ${metaErr.message}`);
}

export async function ensureSeeded() {
  if (!isSupabaseConfigured) return memSeed();
  if (!seeding) seeding = seedSupabase().finally(() => (seeding = null));
  await seeding;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function findUserByUsername(username) {
  await ensureSeeded();
  if (!isSupabaseConfigured) {
    const admin = [...mem.admins.values()].find((a) => a.username === username);
    if (admin) return admin;
    return [...mem.employees.values()].find((e) => e.username === username) || null;
  }

  const { data: admin } = await supabase.from("admins").select("*").eq("username", username).maybeSingle();
  if (admin) return fromAdminRow(admin);
  const { data: emp } = await supabase.from("employees").select("*").eq("username", username).maybeSingle();
  return emp ? fromEmployeeRow(emp) : null;
}

export async function findUserById(id) {
  await ensureSeeded();
  if (!isSupabaseConfigured) {
    return mem.admins.get(id) || mem.employees.get(id) || null;
  }

  const { data: admin } = await supabase.from("admins").select("*").eq("id", id).maybeSingle();
  if (admin) return fromAdminRow(admin);
  const { data: emp } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  return emp ? fromEmployeeRow(emp) : null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(userId, role) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;

  if (!isSupabaseConfigured) {
    mem.sessions.set(token, { userId, role, expiresAt });
    return token;
  }
  const { error } = await supabase
    .from("sessions")
    .insert({ token, user_id: userId, role, expires_at: new Date(expiresAt).toISOString() });
  if (error) throw new Error(`Supabase: ${error.message}`);
  return token;
}

export async function getSessionUser(token) {
  if (!isSupabaseConfigured) {
    const session = mem.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) return null;
    return await findUserById(session.userId);
  }

  const { data } = await supabase.from("sessions").select("*").eq("token", token).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return await findUserById(data.user_id);
}

export async function destroySession(token) {
  if (!isSupabaseConfigured) return void mem.sessions.delete(token);
  await supabase.from("sessions").delete().eq("token", token);
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function listEmployees() {
  await ensureSeeded();
  if (!isSupabaseConfigured) return [...mem.employees.values()];
  const { data, error } = await supabase.from("employees").select("*").order("code");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (data || []).map(fromEmployeeRow);
}

export async function getEmployee(id) {
  await ensureSeeded();
  if (!isSupabaseConfigured) return mem.employees.get(id) || null;
  const { data } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  return data ? fromEmployeeRow(data) : null;
}

/**
 * Admin-initiated: creates one employee with a username/password chosen at
 * creation time. This is the only way employees come into existence now —
 * no seed list, no per-employee env vars, no fixed count.
 */
export async function createEmployee({ name, username, password, code, designation }) {
  await ensureSeeded();
  const employee = {
    id: `emp-${crypto.randomUUID()}`,
    code: code?.trim() || `PC-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
    name: name.trim(),
    username: username.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: "employee",
    designation: designation?.trim() || null,
    profilePhotoId: null,
    shiftSlot: null,
    assignedPlace: null,
    onDuty: false,
    lastLocation: null,
    lastCheckIn: null,
  };

  if (!isSupabaseConfigured) {
    if ([...mem.employees.values()].some((e) => e.username === employee.username)) {
      throw new Error("That username is already taken");
    }
    mem.employees.set(employee.id, employee);
    return employee;
  }

  const { data, error } = await supabase.from("employees").insert(toRow(employee)).select().maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) throw new Error("That username is already taken");
    throw new Error(`Supabase: ${error.message}`);
  }
  return fromEmployeeRow(data);
}

export async function updateEmployee(id, patch) {
  if (!isSupabaseConfigured) {
    const existing = mem.employees.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    mem.employees.set(id, updated);
    return updated;
  }

  const { data, error } = await supabase.from("employees").update(toRow(patch)).eq("id", id).select().maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ? fromEmployeeRow(data) : null;
}

/** Permanently removes the employee's account, session, check-in photo, and profile photo. Cannot be undone. */
export async function deleteEmployee(id) {
  const existing = await getEmployee(id);
  if (!existing) return false;
  if (existing.lastCheckIn?.photoId) await deletePhoto(existing.lastCheckIn.photoId);
  if (existing.profilePhotoId) await deletePhoto(existing.profilePhotoId);

  if (!isSupabaseConfigured) {
    mem.employees.delete(id);
    for (const [token, s] of mem.sessions) if (s.userId === id) mem.sessions.delete(token);
    return true;
  }

  await supabase.from("sessions").delete().eq("user_id", id);
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return true;
}

/** Who currently occupies the slot after `slot` in the relief cycle, and are they on duty? */
export async function nextSlotOccupantOnDuty(slot) {
  const target = nextSlot(slot);
  if (!target) return false;
  const employees = await listEmployees();
  return Boolean(employees.find((e) => e.shiftSlot === target)?.onDuty);
}

export async function employeeForSlot(slot) {
  const employees = await listEmployees();
  return employees.find((e) => e.shiftSlot === slot) || null;
}

// ---------------------------------------------------------------------------
// Check-in photos
// ---------------------------------------------------------------------------

/** Uploads a photo and returns its storage id. `id` should already be unique. */
export async function savePhoto(id, buffer, mime) {
  if (!isSupabaseConfigured) {
    mem.photos.set(id, { buffer, mime });
    return;
  }
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(`${id}.jpg`, buffer, { contentType: mime, upsert: true });
  if (error) throw new Error(`Supabase storage: ${error.message}`);
}

/** A short-lived URL to redirect to, or null when running on the in-memory fallback. */
export async function loadPhotoUrl(id) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(`${id}.jpg`, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

/** Raw bytes for the in-memory fallback path (no Storage service to redirect to). */
export async function loadPhotoBuffer(id) {
  if (isSupabaseConfigured) return null;
  return mem.photos.get(id) || null;
}

export async function deletePhoto(id) {
  if (!isSupabaseConfigured) return void mem.photos.delete(id);
  await supabase.storage.from(PHOTO_BUCKET).remove([`${id}.jpg`]);
}
