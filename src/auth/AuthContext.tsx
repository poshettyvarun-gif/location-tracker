import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type PersonnelRank = "cp" | "dcp" | "acp" | "si" | "ci" | "inspector";

export const RANK_LABEL: Record<PersonnelRank, string> = {
  cp: "Commissioner of Police",
  dcp: "Deputy Commissioner of Police",
  acp: "Assistant Commissioner of Police",
  si: "Sub-Inspector",
  ci: "Circle Inspector",
  inspector: "Police Inspector",
};

/** CP/DCP: unrestricted read/write. ACP: read-only. Inspector: scoped to their own constables (checked server-side). */
export function hasFullAccess(role: string): boolean {
  return role === "cp" || role === "dcp";
}

export function isReadOnly(role: string): boolean {
  return role === "si" || role === "ci";
}

export interface EmployeeUser {
  id: string;
  code: string;
  name: string;
  username: string;
  role: "employee";
  designation: string | null;
  profilePhotoUrl: string | null;
  /** Which Inspector manages this constable — null if unassigned. */
  inspectorId: string | null;
  /** Only present on admin-area list/detail responses, resolved server-side for display. */
  inspectorName?: string | null;
  shiftSlot: "morning" | "afternoon" | "night" | null;
  assignedPlace: string | null;
  onDuty: boolean;
  lastLocation: { lat: number; lng: number; accuracy: number | null; at: number } | null;
  lastCheckIn: {
    photoId: string;
    photoUrl: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    locationVerified: boolean;
    locationError: string | null;
    at: number;
    employeeCode: string;
    employeeName: string;
  } | null;
}

export interface PersonnelUser {
  id: string;
  code: string;
  name: string;
  username: string;
  role: PersonnelRank;
  /** Only present on the personnel directory list, Inspector rows only. */
  constableCount?: number;
  teamMembers?: { id: string; name: string; role: PersonnelRank | "employee" }[];
}

export type CurrentUser = EmployeeUser | PersonnelUser;

interface AuthState {
  user: CurrentUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  returnToLogin: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const TOKEN_KEY = "command-dashboard-token";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || "Request failed");
  }
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiFetch("/api/me");
      setUser(me);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // An employee session expires at the scheduled end of their shift. Polling
    // keeps an already-open shared-device screen in sync without a reload.
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(username: string, password: string) {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user as CurrentUser;
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  /**
   * Clears this device's view only — no call to /api/auth/logout, so it
   * can't be blocked by the shift-handover lock and doesn't end the shift.
   * Used after a check-in to return a shared device to the login screen
   * without signing the employee off duty; they (or the next officer) sign
   * back in with their own credentials to pick the device up again.
   */
  function returnToLogin() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, returnToLogin, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
