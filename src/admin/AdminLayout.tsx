import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, LogOut, MapPinned, Menu, Shield, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
  }`;

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the drawer on every navigation so it doesn't stay open after
  // tapping a link on a phone.
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Mobile top bar — only the hamburger + title below lg, where the
          sidebar isn't statically visible. */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-navy px-4 text-white lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-1.5 hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Shield className="h-5 w-5 text-gold" />
        <p className="font-display text-sm font-semibold">Command Dashboard</p>
      </div>

      {sidebarOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-border surface-navy text-white transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-gold" />
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold">Command Dashboard</p>
              <p className="text-[11px] text-white/60">Admin</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-1 text-white/70 hover:bg-white/10 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <NavLink to="/admin" end className={NAV_LINK_CLASS}>
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Employees
          </NavLink>
          <NavLink to="/admin/map" className={NAV_LINK_CLASS}>
            <MapPinned className="h-4 w-4 shrink-0" />
            Live Map
          </NavLink>
        </nav>

        <div className="mx-3 mb-4 space-y-2">
          <p className="truncate px-1 text-[11px] text-white/60">Signed in as {user?.name}</p>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/15"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
