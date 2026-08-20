import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface EmployeeUser {
  id: string;
  code: string;
  name: string;
  username: string;
  role: "employee";
  designation: string | null;
  profilePhotoUrl: string | null;
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

export interface AdminUser {
  id: string;
  name: string;
  role: "admin";
}

export type CurrentUser = EmployeeUser | AdminUser;

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
