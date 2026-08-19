import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { kvGet, kvSet, kvDel, kvExists } from "./store.js";

/** Shift slots form a fixed relief cycle: morning -> afternoon -> night -> morning (next day). */
export const SHIFT_SLOTS = ["morning", "afternoon", "night"];

export function nextSlot(slot) {
  const i = SHIFT_SLOTS.indexOf(slot);
  return i === -1 ? null : SHIFT_SLOTS[(i + 1) % SHIFT_SLOTS.length];
}

const SEED_FLAG = "seeded";
const ADMIN_KEY = "admin";
const EMPLOYEE_IDS = ["emp-1", "emp-2", "emp-3", "emp-4", "emp-5"];

const empKey = (id) => `employee:${id}`;
const sessionKey = (token) => `session:${token}`;
export const photoKey = (id) => `photo:${id}`;

/** Sessions expire on their own so stale tokens can't linger indefinitely. */
const SESSION_TTL_SECONDS = 60 * 60 * 12;

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

let seeding = null;

async function seed() {
  const admin = {
    id: "admin-1",
    code: "ADMIN",
    name: "Administrator",
    username: process.env.ADMIN_USERNAME || "admin",
    passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || "Admin#2026", 10),
    role: "admin",
  };
  await kvSet(ADMIN_KEY, admin);

  await Promise.all(
    SEED_EMPLOYEES.map((e) =>
      kvSet(empKey(e.id), {
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
      }),
    ),
  );

  await kvSet(SEED_FLAG, true);
}

/**
 * Serverless instances start cold, so every entry point has to make sure the
 * store is populated. The in-flight promise is cached so concurrent requests
 * on one instance don't each re-seed.
 */
export async function ensureSeeded() {
  if (await kvExists(SEED_FLAG)) return;
  if (!seeding) seeding = seed().finally(() => (seeding = null));
  await seeding;
}

export async function findUserByUsername(username) {
  await ensureSeeded();
  const admin = await kvGet(ADMIN_KEY);
  if (admin?.username === username) return admin;
  const employees = await listEmployees();
  return employees.find((e) => e.username === username) || null;
}

export async function findUserById(id) {
  await ensureSeeded();
  if (id === "admin-1") return await kvGet(ADMIN_KEY);
  return await kvGet(empKey(id));
}

export async function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  await kvSet(sessionKey(token), { userId, createdAt: Date.now() }, { ttlSeconds: SESSION_TTL_SECONDS });
  return token;
}

export async function getSessionUser(token) {
  const session = await kvGet(sessionKey(token));
  if (!session) return null;
  return await findUserById(session.userId);
}

export async function destroySession(token) {
  await kvDel(sessionKey(token));
}

export async function listEmployees() {
  await ensureSeeded();
  const all = await Promise.all(EMPLOYEE_IDS.map((id) => kvGet(empKey(id))));
  return all.filter(Boolean);
}

export async function getEmployee(id) {
  await ensureSeeded();
  return await kvGet(empKey(id));
}

export async function updateEmployee(id, patch) {
  const existing = await kvGet(empKey(id));
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await kvSet(empKey(id), updated);
  return updated;
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

// ---- Check-in photos (stored as data URLs alongside the records) ----

export async function savePhoto(id, dataUrl) {
  await kvSet(photoKey(id), dataUrl);
}

export async function loadPhoto(id) {
  return await kvGet(photoKey(id));
}

export async function deletePhoto(id) {
  await kvDel(photoKey(id));
}
