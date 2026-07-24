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

// ── Shared design tokens ─────────────────────────────────────────────────────
const SIDEBAR_W       = 240;
const SIDEBAR_W_COL   = 68;
const ACCENT          = "#6c63ff";
const BG_DEEP         = "#0f0f1a";
const BG_CARD         = "rgba(255,255,255,0.035)";
const BORDER          = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY    = "#f0f0ff";
const TEXT_MUTED      = "#8b8bad";

const dropItemStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  width: '100%', padding: '9px 16px', border: 'none',
  background: 'transparent', color: '#c4c4d4', cursor: 'pointer',
  fontSize: 13, fontWeight: 500, textAlign: 'left',
  transition: 'background 0.15s',
};


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

// inject global CSS once
const GLOBAL_CSS = `
@keyframes tf-dash-glow {
  0%,100% { box-shadow: 0 0 18px rgba(108,99,255,0.18); }
  50%      { box-shadow: 0 0 30px rgba(108,99,255,0.38); }
}
.tf-navlink {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 10px;
  text-decoration: none; color: ${TEXT_MUTED};
  font-size: 14px; font-weight: 500; letter-spacing: 0.01em;
  transition: background 0.18s, color 0.18s, box-shadow 0.18s;
  white-space: nowrap; overflow: hidden;
}
.tf-navlink:hover { background: rgba(108,99,255,0.1); color: ${TEXT_PRIMARY}; }
.tf-navlink.active {
  background: rgba(108,99,255,0.18);
  color: #a78bfa;
  box-shadow: inset 2px 0 0 ${ACCENT};
  animation: tf-dash-glow 3s ease-in-out infinite;
}
.tf-navlink-icon { flex-shrink: 0; }
`;

let cssInjected = false;
function injectCSS() {
  if (!cssInjected && typeof document !== "undefined") {
    const el = document.createElement("style");
    el.textContent = GLOBAL_CSS;
    document.head.appendChild(el);
    cssInjected = true;
  }
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ collapsed, onToggle, role }) {
  injectCSS();
  const w        = collapsed ? SIDEBAR_W_COL : SIDEBAR_W;
  const navItems = getNavItems(role);

  return (
    <aside
      style={{
        position: "fixed",
        top: 0, left: 0, bottom: 0,
        width: w,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        background: "rgba(15,15,26,0.75)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRight: `1px solid ${BORDER}`,
        boxShadow: "4px 0 40px rgba(0,0,0,0.4)",
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
      }}
    >
      {/* Logo / brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "20px 16px 18px",
          borderBottom: `1px solid ${BORDER}`,
          minHeight: 64,
        }}
      >
        <div
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${ACCENT}, #a78bfa)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 16px rgba(108,99,255,0.5)`,
          }}
        >
          <Zap size={18} color="#fff" />
        </div>
        {!collapsed && (
          <span style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
            TenantFlow
          </span>
        )}
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/dashboard"}
            className={({ isActive }) => `tf-navlink${isActive ? " active" : ""}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="tf-navlink-icon" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle at bottom */}
      <div style={{ padding: "12px 8px", borderTop: `1px solid ${BORDER}` }}>
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            width: "100%", padding: "9px 0", borderRadius: 9, border: "none",
            background: BG_CARD, color: TEXT_MUTED, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(108,99,255,0.12)"; e.currentTarget.style.color = TEXT_PRIMARY; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BG_CARD; e.currentTarget.style.color = TEXT_MUTED; }}
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
      style={{
        position: "fixed",
        top: 0, left: sidebarWidth, right: 0,
        height: 64,
        zIndex: 99,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: "rgba(15,15,26,0.6)",
        backdropFilter: "blur(20px)",
        borderBottom: `1px solid ${BORDER}`,
        transition: "left 0.22s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Tenant name */}
      <div>
        <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, fontWeight: 400 }}>Welcome back,</p>
        <p style={{ margin: 0, fontSize: 16, color: TEXT_PRIMARY, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
          {user?.tenantName ?? user?.firstName ?? user?.name ?? "Tenant"}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <NotificationBell />

        {/* Avatar chip — clickable dropdown */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px 6px 6px", borderRadius: 50,
              background: BG_CARD, border: `1px solid ${menuOpen ? 'rgba(108,99,255,0.5)' : BORDER}`,
              cursor: 'pointer', transition: 'border-color 0.15s',
            }}
            aria-label="User menu"
          >
            <div
              style={{
                width: 28, height: 28, borderRadius: "50%",
                background: `linear-gradient(135deg, ${ACCENT}, #a78bfa)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#fff",
              }}
            >
              {initials}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY }}>
              {user?.firstName || user?.name || "User"}
            </span>
            <ChevronDown size={14} color={TEXT_MUTED} style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              minWidth: 180, borderRadius: 12, overflow: 'hidden',
              background: '#1a1a2e', border: `1px solid ${BORDER}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              zIndex: 200,
            }}>
              {/* User info header */}
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>{user?.firstName} {user?.lastName}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: TEXT_MUTED }}>{user?.email}</p>
              </div>

              {/* Menu items */}
              <div style={{ padding: '6px 0' }}>
                <button
                  onClick={() => { setMenuOpen(false); navigate('/dashboard/profile'); }}
                  style={dropItemStyle}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(108,99,255,0.12)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <User size={14} />
                  View Profile
                </button>
                <div style={{ height: 1, background: BORDER, margin: '4px 0' }} />
                <button
                  onClick={handleLogout}
                  style={{ ...dropItemStyle, color: '#f87171' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
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
  const sidebarWidth = collapsed ? SIDEBAR_W_COL : SIDEBAR_W;
  const { user }     = useSelector((s) => s.auth);

  return (
    <div style={{ minHeight: "100vh", background: BG_DEEP, color: TEXT_PRIMARY, fontFamily: "system-ui, sans-serif" }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} role={user?.role} />
      <TopBar sidebarWidth={sidebarWidth} />

      <main
        style={{
          marginLeft: sidebarWidth,
          paddingTop: 64,
          minHeight: "100vh",
          transition: "margin-left 0.22s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "32px 28px",
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
