import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, clearStoredToken, getStoredToken, storeToken } from "./api";
import { AuthContext } from "./authStore";
import type { CurrentUser } from "./types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [loading, setLoading] = useState(() => Boolean(getStoredToken()));

  async function refresh() {
    if (!getStoredToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await apiFetch("/api/me"));
    } catch {
      clearStoredToken();
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Delay bootstrap by one task so this initial server synchronization does
    // not synchronously trigger a second render during the effect itself.
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  async function login(phone: string) {
    const data = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ phone }) });
    storeToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user as CurrentUser;
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    clearStoredToken();
    setToken(null);
    setUser(null);
  }

  function returnToLogin() {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, token, loading, login, logout, returnToLogin, refresh }}>{children}</AuthContext.Provider>;
}
