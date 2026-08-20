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
 * Seed credentials. Overridable by env vars so the deployed instance isn't
 * running the passwords that are committed to the repo.
 */
const SEED_EMPLOYEES = [
  { id: "emp-1", code: "PC-1001", name: "Employee One", username: "employee1", env: "EMP1_PASSWORD", fallback: "Emp1#2026", shiftSlot: "morning" },
  { id: "emp-2", code: "PC-1002", name: "Employee Two", username: "employee2", env: "EMP2_PASSWORD", fallback: "Emp2#2026", shiftSlot: "afternoon" },
  { id: "emp-3", code: "PC-1003", name: "Employee Three", username: "employee3", env: "EMP3_PASSWORD", fallback: "Emp3#2026", shiftSlot: "night" },
  { id: "emp-4", code: "PC-1004", name: "Employee Four", username: "employee4", env: "EMP4_PASSWORD", fallback: "Emp4#2026", shiftSlot: null },
  { id: "emp-5", code: "PC-1005", name: "Employee Five", username: "employee5", env: "EMP5_PASSWORD", fallback: "Emp5#2026", shiftSlot: null },
];

function freshAdmin() {
  return {
    id: "admin-1",
    code: "ADMIN",
    name: "Administrator",
    username: process.env.ADMIN_USERNAME || "admin",
    passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || "Admin#2026", 10),
    role: "admin",
  };
}

function freshEmployees() {
  return SEED_EMPLOYEES.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    username: e.username,
    passwordHash: bcrypt.hashSync(process.env[e.env] || e.fallback, 10),
    role: "employee",
    shiftSlot: e.shiftSlot,
    assignedPlace: null,
    onDuty: false,
    lastLocation: null,
    lastCheckIn: null,
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

function throwIfError({ error }) {
  if (error) throw new Error(`Supabase: ${error.message}`);
}

// ---------------------------------------------------------------------------
// In-memory fallback — used only when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// aren't set, so `npm run server` still works with zero setup. Nothing here
// persists across a restart; the real, permanent store is Postgres.
// ---------------------------------------------------------------------------
const mem = {
  seeded: false,
  admin: null,
  employees: new Map(),
  sessions: new Map(),
  photos: new Map(),
};

function memSeed() {
  if (mem.seeded) return;
  mem.admin = freshAdmin();
  for (const e of freshEmployees()) mem.employees.set(e.id, e);
  mem.seeded = true;
}

// ---------------------------------------------------------------------------
// Seeding — runs at most once per project, ever. Whether an employee exists
// right now is irrelevant to this check: if admin permanently deletes one,
// a later cold start must NOT bring it back, so this is gated on a single
// "has this project ever been seeded" flag rather than "is the table empty".
// ---------------------------------------------------------------------------
let seeding = null;

async function seedSupabase() {
  const { data } = await supabase.from("meta").select("value").eq("key", "seeded").maybeSingle();
  if (data?.value) return;

  const { error: adminErr } = await supabase.from("admins").upsert(toRow(freshAdmin()));
  if (adminErr) throw new Error(`Supabase seed (admin): ${adminErr.message}`);

  const { error: empErr } = await supabase.from("employees").upsert(freshEmployees().map(toRow));
  if (empErr) throw new Error(`Supabase seed (employees): ${empErr.message}`);

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
    if (mem.admin?.username === username) return mem.admin;
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
    if (id === "admin-1") return mem.admin;
    return mem.employees.get(id) || null;
  }

  if (id === "admin-1") {
    const { data } = await supabase.from("admins").select("*").eq("id", id).maybeSingle();
    return data ? fromAdminRow(data) : null;
  }
  const { data } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  return data ? fromEmployeeRow(data) : null;
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
  throwIfError(
    await supabase
      .from("sessions")
      .insert({ token, user_id: userId, role, expires_at: new Date(expiresAt).toISOString() }),
  );
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

/** Permanently removes the employee's account, session, and check-in photo. Cannot be undone. */
export async function deleteEmployee(id) {
  const existing = await getEmployee(id);
  if (!existing) return false;
  if (existing.lastCheckIn?.photoId) await deletePhoto(existing.lastCheckIn.photoId);

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
