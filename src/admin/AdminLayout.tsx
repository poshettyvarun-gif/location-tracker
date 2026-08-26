import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ClipboardList, LayoutDashboard, LogOut, MapPinned, Menu, Shield, Users, X } from "lucide-react";
import { useAuth, RANK_LABEL, type PersonnelRank } from "../auth/AuthContext";

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
  }`;

const DASHBOARD_SHELL: Record<PersonnelRank, { title: string; subtitle: string; employees: string; personnel: string; map: string; brand: string }> = {
  cp: {
    title: "Commissioner Command Centre",
    subtitle: "Force-wide command view",
    employees: "Command Overview",
    personnel: "Command Structure",
    map: "Operations Map",
    brand: "bg-[#061d3b]",
  },
  dcp: {
    title: "Deputy Command Desk",
    subtitle: "Deployment and workforce control",
    employees: "Deployment Overview",
    personnel: "Workforce Registry",
    map: "Situation Map",
    brand: "bg-[#0b3158]",
  },
  acp: {
    title: "ACP Operations Briefing",
    subtitle: "Read-only operational visibility",
    employees: "Operational Briefing",
    personnel: "Personnel Directory",
    map: "Live Operations Map",
    brand: "bg-[#27364a]",
  },
  si: {
    title: "Sub-Inspector Monitoring Desk",
    subtitle: "Read-only constable monitoring",
    employees: "Constable Updates",
    personnel: "Personnel Directory",
    map: "Live Updates Map",
    brand: "bg-[#304050]",
  },
  ci: {
    title: "Circle Inspector Monitoring Desk",
    subtitle: "Read-only constable monitoring",
    employees: "Constable Updates",
    personnel: "Personnel Directory",
    map: "Live Updates Map",
    brand: "bg-[#3a344f]",
  },
  inspector: {
    title: "Inspector Field Desk",
    subtitle: "Your assigned constables",
    employees: "My Constables",
    personnel: "",
    map: "My Patrol Map",
    brand: "bg-[#123d35]",
  },
};

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the drawer on every navigation so it doesn't stay open after
  // tapping a link on a phone.
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  // AdminLayout only ever renders for the admin area (RequireRole guards
  // this), so role here is always a PersonnelRank at runtime even though the
  // union type also includes "employee".
  const rank = user && user.role !== "employee" ? (user.role as PersonnelRank) : null;
  const rankLabel = rank ? RANK_LABEL[rank] : "";
  const shell = rank ? DASHBOARD_SHELL[rank] : DASHBOARD_SHELL.cp;
  // Inspectors only ever see their own constables — the personnel directory
  // (the org chart itself) is invisible to them, same as the API enforces.
  const showPersonnelLink = !["si", "ci"].includes(rank ?? "");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Mobile top bar — only the hamburger + title below lg, where the
          sidebar isn't statically visible. */}
      <div className={`fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 px-4 text-white lg:hidden ${shell.brand}`}>
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-1.5 hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Shield className="h-5 w-5 text-gold" />
        <p className="font-display text-sm font-semibold">{shell.title}</p>
      </div>

      {sidebarOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-white/10 text-white transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${shell.brand} ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-gold" />
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold">{shell.title}</p>
              <p className="text-[11px] text-white/60">{shell.subtitle} · {rankLabel}</p>
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
            {shell.employees}
          </NavLink>
          {showPersonnelLink && (
            <NavLink to="/admin/personnel" className={NAV_LINK_CLASS}>
              <Users className="h-4 w-4 shrink-0" />
              {shell.personnel}
            </NavLink>
          )}
          <NavLink to="/admin/attendance" className={NAV_LINK_CLASS}>
            <ClipboardList className="h-4 w-4 shrink-0" />
            Attendance report
          </NavLink>
          <NavLink to="/admin/map" className={NAV_LINK_CLASS}>
            <MapPinned className="h-4 w-4 shrink-0" />
            {shell.map}
          </NavLink>
        </nav>

        <div className="mx-3 mb-4 space-y-2">
          <p className="truncate px-1 text-[11px] text-white/60">
            Signed in as {user?.name} ({rankLabel})
          </p>
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
        <section className="border-b border-border bg-card px-4 py-4 sm:px-6 md:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Signed in as</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">{rankLabel}</h1>
            <p className="text-sm text-muted-foreground">{user?.name}</p>
          </div>
        </section>
        <Outlet />
      </main>
    </div>
  );
}
