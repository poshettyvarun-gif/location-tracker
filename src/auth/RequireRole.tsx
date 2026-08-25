import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * "admin" area now covers 4 distinct ranks (CP/DCP/ACP/Inspector) with
 * different permissions enforced by the API — this gate only decides which
 * shell (admin dashboard vs employee check-in) a signed-in user lands in.
 */
export default function RequireRole({
  area,
  children,
}: {
  area: "admin" | "employee";
  children: ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  const userArea = user.role === "employee" ? "employee" : "admin";
  if (userArea !== area) return <Navigate to={userArea === "admin" ? "/admin" : "/employee"} replace />;
  return <>{children}</>;
}
