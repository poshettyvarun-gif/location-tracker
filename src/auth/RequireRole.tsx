import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * CP/DCP use the monitor console. Every field officer uses the employee
 * check-in screen, regardless of their designation.
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
