import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, LogOut, MapPinned, Shield } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border surface-navy text-white">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
          <Shield className="h-7 w-7 text-gold" />
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold">Command Dashboard</p>
            <p className="text-[11px] text-white/60">Admin</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Employees
          </NavLink>
          <NavLink
            to="/admin/map"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <MapPinned className="h-4 w-4 shrink-0" />
            Live Map
          </NavLink>
        </nav>

        <div className="mx-3 mb-4 space-y-2">
          <p className="px-1 text-[11px] text-white/60">Signed in as {user?.name}</p>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/15"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
