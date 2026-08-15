import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Repeat,
  Users,
  LogOut,
  Menu,
  X,
  Zap,
  User,
  ChevronDown,
} from "lucide-react";
import { logout } from "../../store/authSlice.js";
import NotificationBell from "../notifications/NotificationBell.jsx";
import ThemeToggle from "../common/ThemeToggle.jsx";

const SIDEBAR_W = "w-[240px]";
const SIDEBAR_W_COL = "w-[68px]";

// All possible nav items — filtered per role below
const ALL_NAV_ITEMS = [
  { to: "/dashboard",              icon: LayoutDashboard, label: "Dashboard",    roles: ['tenant_admin', 'tenant_member'] },
  { to: "/dashboard/invoices",     icon: FileText,        label: "Invoices",     roles: ['tenant_admin', 'tenant_member', 'finance_member'] },
  { to: "/dashboard/payments",     icon: CreditCard,      label: "Payments",     roles: ['tenant_admin', 'tenant_member', 'finance_member'] },
  { to: "/dashboard/subscription", icon: Repeat,          label: "Subscription", roles: ['tenant_admin'] },
  { to: "/dashboard/members",      icon: Users,           label: "Members",      roles: ['tenant_admin'] },
];

function getNavItems(role) {
  return ALL_NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role));
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ collapsed, onToggle, role }) {
  const widthClass = collapsed ? SIDEBAR_W_COL : SIDEBAR_W;
  const navItems = getNavItems(role);

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-50 flex flex-col bg-surface border-r border-border shadow-sm transition-all duration-200 ${widthClass} overflow-hidden`}
    >
      {/* Logo / brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border min-h-[64px]">
        <div className="w-9 h-9 rounded-lg shrink-0 bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shadow-sm">
          <Zap size={18} className="text-white" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold text-text-primary tracking-tight whitespace-nowrap">
            TenantFlow
          </span>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/dashboard"}
            title={collapsed ? label : undefined}
            className={({ isActive }) => 
              `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap overflow-hidden ${
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-text-muted hover:bg-surface-secondary hover:text-text-primary"
              }`
            }
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle at bottom */}
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

// ── Top bar ──────────────────────────────────────────────────────────────────
function TopBar({ sidebarWidth }) {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const { user }  = useSelector((s) => s.auth);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleLogout() {
    dispatch(logout());
    navigate("/login", { replace: true });
  }

  const initials = `${(user?.firstName || user?.name || 'U')[0]}${(user?.lastName || '')[0] || ''}`.toUpperCase();

  return (
    <header
      className="fixed top-0 right-0 h-16 z-40 flex items-center justify-between px-6 bg-surface/90 backdrop-blur-md border-b border-border transition-all duration-200"
      style={{ left: sidebarWidth === SIDEBAR_W_COL ? 68 : 240 }}
    >
      {/* Tenant name */}
      <div>
        <p className="m-0 text-sm text-text-muted font-normal">Welcome back,</p>
        <p className="m-0 text-base text-text-primary font-bold leading-tight tracking-tight">
          {user?.tenantName ?? user?.firstName ?? user?.name ?? "Tenant"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <NotificationBell />

        {/* Avatar chip — clickable dropdown */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-surface-secondary border transition-colors cursor-pointer ${
              menuOpen ? 'border-primary/50' : 'border-border hover:border-border'
            }`}
            aria-label="User menu"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {initials}
            </div>
            <span className="text-sm font-medium text-text-primary hidden sm:block">
              {user?.firstName || user?.name || "User"}
            </span>
            <ChevronDown size={14} className={`text-text-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute top-[calc(100%+8px)] right-0 min-w-[180px] rounded-xl overflow-hidden bg-surface border border-border shadow-md z-50">
              {/* User info header */}
              <div className="px-4 py-3 border-b border-border">
                <p className="m-0 text-sm font-semibold text-text-primary">{user?.firstName} {user?.lastName}</p>
                <p className="mt-0.5 mb-0 text-xs text-text-muted truncate">{user?.email}</p>
              </div>

              {/* Menu items */}
              <div className="py-1.5">
                <button
                  onClick={() => { setMenuOpen(false); navigate('/dashboard/profile'); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-transparent hover:bg-surface-secondary text-text-secondary hover:text-text-primary text-sm font-medium transition-colors text-left"
                >
                  <User size={14} />
                  View Profile
                </button>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-transparent hover:bg-danger/10 text-danger text-sm font-medium transition-colors text-left"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const widthClass = collapsed ? SIDEBAR_W_COL : SIDEBAR_W;
  const { user }     = useSelector((s) => s.auth);

  return (
    <div className="min-h-screen bg-background text-text-primary font-sans">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} role={user?.role} />
      <TopBar sidebarWidth={widthClass} />

      <main
        className="min-h-screen pt-16 transition-all duration-200"
        style={{ marginLeft: collapsed ? 68 : 240 }}
      >
        <div className="max-w-7xl mx-auto px-7 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
