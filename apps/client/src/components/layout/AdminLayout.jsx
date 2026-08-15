import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  LayoutDashboard,
  Building2,
  FileText,
  Bell,
  TrendingDown,
  TrendingUp,
  ArrowUpCircle,
  Heart,
  Server,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import { logout } from "../../store/authSlice.js";
import NotificationBell from "../notifications/NotificationBell.jsx";
import ThemeToggle from "../common/ThemeToggle.jsx";

const SIDEBAR_W = "w-[240px]";
const SIDEBAR_W_COL = "w-[68px]";

const navItems = [
  { to: "/admin",              icon: LayoutDashboard, label: "Dashboard",    end: true },
  { to: "/admin/tenants",      icon: Building2,       label: "Tenants" },
  { to: "/admin/revenue",      icon: TrendingUp,      label: "Revenue Intel" },
  { to: "/admin/health-scores",icon: Heart,           label: "Health Scores" },
  { to: "/admin/expansion",    icon: ArrowUpCircle,   label: "Expansion" },
  { to: "/admin/invoices",     icon: FileText,        label: "Invoices" },
  { to: "/admin/dunning",      icon: Bell,            label: "Dunning" },
  { to: "/admin/churn-risk",   icon: TrendingDown,    label: "Churn Risk" },
  { to: "/admin/queues",       icon: Server,          label: "Queues" },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ collapsed, onToggle }) {
  const widthClass = collapsed ? SIDEBAR_W_COL : SIDEBAR_W;

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-50 flex flex-col bg-surface border-r border-border shadow-sm transition-all duration-200 ${widthClass} overflow-hidden`}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border min-h-[64px]">
        <div className="w-9 h-9 rounded-lg shrink-0 bg-gradient-to-br from-warning to-amber-400 flex items-center justify-center shadow-sm">
          <ShieldCheck size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="m-0 text-[15px] font-bold text-text-primary leading-tight whitespace-nowrap">TenantFlow</p>
            <p className="m-0 text-[10px] font-semibold text-warning tracking-[0.08em] uppercase">Super Admin</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) => 
              `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap overflow-hidden ${
                isActive 
                  ? "bg-warning/10 text-warning" 
                  : "text-text-muted hover:bg-surface-secondary hover:text-text-primary"
              }`
            }
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-border">
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-full py-2.5 rounded-lg border-none bg-surface-secondary text-text-muted hover:bg-border hover:text-text-primary flex items-center justify-center transition-colors cursor-pointer"
        >
          {collapsed ? <Menu size={18} /> : <X size={18} />}
        </button>
      </div>
    </aside>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function TopBar({ sidebarWidth }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);

  function handleLogout() {
    dispatch(logout());
    navigate("/login", { replace: true });
  }

  return (
    <header
      className="fixed top-0 right-0 h-16 z-40 flex items-center justify-between px-6 bg-surface/90 backdrop-blur-md border-b border-border transition-all duration-200"
      style={{ left: sidebarWidth === SIDEBAR_W_COL ? 68 : 240 }}
    >
      {/* Title */}
      <div className="flex items-center gap-2.5">
        <ShieldCheck size={20} className="text-warning" />
        <div>
          <p className="m-0 text-base font-bold text-text-primary tracking-tight">Super Admin</p>
          <p className="m-0 text-xs text-text-muted">Platform Control Panel</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <NotificationBell />

        <div className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-full bg-surface-secondary border border-border">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-warning to-amber-400 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {(user?.name ?? "A")[0].toUpperCase()}
          </div>
          <span className="text-sm font-medium text-text-primary">
            {user?.name ?? "Admin"}
          </span>
        </div>

        <button
          onClick={handleLogout}
          title="Sign out"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger text-sm font-medium transition-colors border-none cursor-pointer ml-1"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </header>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────
export default function AdminLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const widthClass = collapsed ? SIDEBAR_W_COL : SIDEBAR_W;

  return (
    <div className="min-h-screen bg-background text-text-primary font-sans">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <TopBar sidebarWidth={widthClass} />

      <main
        className="min-h-screen pt-16 transition-all duration-200"
        style={{ marginLeft: collapsed ? 68 : 240 }}
      >
        <div className="max-w-[1400px] mx-auto px-7 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
