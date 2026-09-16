import { createContext } from "react";
import type { CurrentUser } from "./types";

export interface AuthState {
  user: CurrentUser | null; token: string | null; loading: boolean;
  login: (phone: string) => Promise<CurrentUser>; logout: () => Promise<void>; returnToLogin: () => void; refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
