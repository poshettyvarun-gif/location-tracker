import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { supabase, isSupabaseConfigured, PHOTO_BUCKET } from "./supabaseClient.js";

/** Shift slots form a fixed relief cycle: morning -> afternoon -> night -> morning (next day). */
export const SHIFT_SLOTS = ["morning", "afternoon", "night"];

export function nextSlot(slot) {
  const i = SHIFT_SLOTS.indexOf(slot);
  return i === -1 ? null : SHIFT_SLOTS[(i + 1) % SHIFT_SLOTS.length];
}

/** The rank hierarchy. CP/DCP are fixed (exactly one each, seeded, never created/deleted
 * through the app). ACP and Inspector are created through the app by CP/DCP. */
export const CREATABLE_RANKS = ["acp", "inspector"];
export const FIXED_RANKS = ["cp", "dcp"];
export const ALL_RANKS = [...FIXED_RANKS, ...CREATABLE_RANKS];

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Exactly two fixed personnel accounts, seeded once: one CP, one DCP. Reuses
 * the same ADMIN_USERNAME/ADMIN_PASSWORD and ADMIN2_USERNAME/ADMIN2_PASSWORD
 * env var names the app already had, so no new Vercel configuration is
 * needed for this to keep working. ACP and Inspector accounts are never
 * seeded — CP/DCP create them through the app (see createPersonnel below).
 */
const SEED_PERSONNEL = [
  { id: "cp-1", rank: "cp", name: "Commissioner of Police", usernameEnv: "ADMIN_USERNAME", usernameFallback: "admin", passwordEnv: "ADMIN_PASSWORD", passwordFallback: "Admin#2026" },
  { id: "dcp-1", rank: "dcp", name: "Deputy Commissioner of Police", usernameEnv: "ADMIN2_USERNAME", usernameFallback: "admin2", passwordEnv: "ADMIN2_PASSWORD", passwordFallback: "Admin2#2026" },
];

function freshPersonnel() {
  return SEED_PERSONNEL.map((p) => ({
    id: p.id,
    code: p.rank.toUpperCase(),
    name: p.name,
    username: process.env[p.usernameEnv] || p.usernameFallback,
    passwordHash: bcrypt.hashSync(process.env[p.passwordEnv] || p.passwordFallback, 10),
    role: p.rank,
    inspectorId: null,
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
  inspectorId: "inspector_id",
};

// `role` on a personnel row IS its rank column — kept as a separate in-memory
// field only so the rest of the app (and the frontend) can treat every
// account the same way (`user.role`) regardless of which table it came from.
const NON_COLUMN_FIELDS = new Set(["role"]);

function toEmployeeRow(obj) {
  const row = {};
  for (const [k, v] of Object.entries(obj)) {
    if (NON_COLUMN_FIELDS.has(k)) continue;
    row[COLUMN_MAP[k] || k] = v;
  }
  return row;
}

function toPersonnelRow(obj) {
  const row = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "role") {
      row.rank = v;
      continue;
    }
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
    inspectorId: row.inspector_id,
    shiftSlot: row.shift_slot,
    assignedPlace: row.assigned_place,
    onDuty: row.on_duty,
    lastLocation: row.last_location,
    lastCheckIn: row.last_check_in,
  };
}

function fromPersonnelRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.rank,
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
  personnel: new Map(),
  employees: new Map(),
  sessions: new Map(),
  photos: new Map(),
};

function memSeed() {
  if (mem.seeded) return;
  for (const p of freshPersonnel()) mem.personnel.set(p.id, p);
  mem.seeded = true;
}

// ---------------------------------------------------------------------------
// Seeding — runs at most once per project, ever. Whether an account exists
// right now is irrelevant to this check: it's gated on a single "has this
// project ever been seeded" flag, not "is the table empty" — so a later cold
// start never resurrects an account someone deleted on purpose.
// ---------------------------------------------------------------------------
let seeding = null;

async function seedSupabase() {
  const { data } = await supabase.from("meta").select("value").eq("key", "seeded").maybeSingle();
  if (data?.value) return;

  const { error: personnelErr } = await supabase.from("personnel").upsert(freshPersonnel().map(toPersonnelRow));
  if (personnelErr) throw new Error(`Supabase seed (personnel): ${personnelErr.message}`);

  const { error: metaErr } = await supabase.from("meta").upsert({ key: "seeded", value: true });
  if (metaErr) throw new Error(`Supabase seed (meta): ${metaErr.message}`);
}

export async function ensureSeeded() {
  if (!isSupabaseConfigured) return memSeed();
  if (!seeding) seeding = seedSupabase().finally(() => (seeding = null));
  await seeding;
}

// ---------------------------------------------------------------------------
// Users (personnel + employees share the login/session flow)
// ---------------------------------------------------------------------------

export async function findUserByUsername(username) {
  await ensureSeeded();
  if (!isSupabaseConfigured) {
    const person = [...mem.personnel.values()].find((p) => p.username === username);
    if (person) return person;
    return [...mem.employees.values()].find((e) => e.username === username) || null;
  }

  const { data: person } = await supabase.from("personnel").select("*").eq("username", username).maybeSingle();
  if (person) return fromPersonnelRow(person);
  const { data: emp } = await supabase.from("employees").select("*").eq("username", username).maybeSingle();
  return emp ? fromEmployeeRow(emp) : null;
}

export async function findUserById(id) {
  await ensureSeeded();
  if (!isSupabaseConfigured) {
    return mem.personnel.get(id) || mem.employees.get(id) || null;
  }

  const { data: person } = await supabase.from("personnel").select("*").eq("id", id).maybeSingle();
  if (person) return fromPersonnelRow(person);
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
// Personnel (CP / DCP / ACP / Inspector)
// ---------------------------------------------------------------------------

export async function listPersonnel() {
  await ensureSeeded();
  if (!isSupabaseConfigured) return [...mem.personnel.values()];
  const { data, error } = await supabase.from("personnel").select("*").order("rank").order("name");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (data || []).map(fromPersonnelRow);
}

export async function getPersonnel(id) {
  await ensureSeeded();
  if (!isSupabaseConfigured) return mem.personnel.get(id) || null;
  const { data } = await supabase.from("personnel").select("*").eq("id", id).maybeSingle();
  return data ? fromPersonnelRow(data) : null;
}

/** CP/DCP-only: creates an ACP or Inspector account. CP/DCP themselves are fixed and never created here. */
export async function createPersonnel({ name, username, password, rank }) {
  await ensureSeeded();
  const person = {
    id: `${rank}-${crypto.randomUUID()}`,
    code: rank.toUpperCase(),
    name: name.trim(),
    username: username.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: rank,
  };

  if (!isSupabaseConfigured) {
    const takenByPerson = [...mem.personnel.values()].some((p) => p.username === person.username);
    const takenByEmployee = [...mem.employees.values()].some((e) => e.username === person.username);
    if (takenByPerson || takenByEmployee) throw new Error("That username is already taken");
    mem.personnel.set(person.id, person);
    return person;
  }

  const { data, error } = await supabase.from("personnel").insert(toPersonnelRow(person)).select().maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) throw new Error("That username is already taken");
    throw new Error(`Supabase: ${error.message}`);
  }
  return fromPersonnelRow(data);
}

/** Permanently removes an ACP/Inspector account and their session. CP/DCP are protected by the route layer. */
export async function deletePersonnel(id) {
  if (!isSupabaseConfigured) {
    if (!mem.personnel.has(id)) return false;
    mem.personnel.delete(id);
    for (const [token, s] of mem.sessions) if (s.userId === id) mem.sessions.delete(token);
    return true;
  }

  await supabase.from("sessions").delete().eq("user_id", id);
  const { error, count } = await supabase.from("personnel").delete({ count: "exact" }).eq("id", id);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Employees (constables)
// ---------------------------------------------------------------------------

export async function listEmployees() {
  await ensureSeeded();
  if (!isSupabaseConfigured) return [...mem.employees.values()];
  const { data, error } = await supabase.from("employees").select("*").order("code");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (data || []).map(fromEmployeeRow);
}

/** Employees managed by one specific Inspector — this is the whole of an Inspector's world. */
export async function listEmployeesByInspector(inspectorId) {
  await ensureSeeded();
  if (!isSupabaseConfigured) {
    return [...mem.employees.values()].filter((e) => e.inspectorId === inspectorId);
  }
  const { data, error } = await supabase.from("employees").select("*").eq("inspector_id", inspectorId).order("code");
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
 * Creates one constable. `inspectorId` is who manages them — CP/DCP may set
 * this to any Inspector (or leave unassigned); an Inspector creating their
 * own constable always has it forced to themselves at the route layer.
 */
export async function createEmployee({ name, username, password, code, designation, inspectorId }) {
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
    inspectorId: inspectorId || null,
    shiftSlot: null,
    assignedPlace: null,
    onDuty: false,
    lastLocation: null,
    lastCheckIn: null,
  };

  if (!isSupabaseConfigured) {
    const takenByEmployee = [...mem.employees.values()].some((e) => e.username === employee.username);
    const takenByPerson = [...mem.personnel.values()].some((p) => p.username === employee.username);
    if (takenByEmployee || takenByPerson) throw new Error("That username is already taken");
    mem.employees.set(employee.id, employee);
    return employee;
  }

  const { data, error } = await supabase.from("employees").insert(toEmployeeRow(employee)).select().maybeSingle();
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

  const { data, error } = await supabase.from("employees").update(toEmployeeRow(patch)).eq("id", id).select().maybeSingle();
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
// Check-in / profile photos
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
