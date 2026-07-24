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

// ── Design tokens ─────────────────────────────────────────────────────────────
const SIDEBAR_W     = 240;
const SIDEBAR_W_COL = 68;
const ACCENT        = "#f59e0b";          // amber for super-admin flavour
const BG_DEEP       = "#0a0a14";
const BG_CARD       = "rgba(255,255,255,0.03)";
const BORDER        = "rgba(255,255,255,0.07)";
const TEXT_PRIMARY  = "#f0f0ff";
const TEXT_MUTED    = "#8b8bad";

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

const GLOBAL_CSS = `
@keyframes tf-admin-glow {
  0%,100% { box-shadow: 0 0 18px rgba(245,158,11,0.15); }
  50%      { box-shadow: 0 0 28px rgba(245,158,11,0.32); }
}
.tf-admin-navlink {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 10px;
  text-decoration: none; color: ${TEXT_MUTED};
  font-size: 14px; font-weight: 500; letter-spacing: 0.01em;
  transition: background 0.18s, color 0.18s, box-shadow 0.18s;
  white-space: nowrap; overflow: hidden;
}
.tf-admin-navlink:hover { background: rgba(245,158,11,0.09); color: ${TEXT_PRIMARY}; }
.tf-admin-navlink.active {
  background: rgba(245,158,11,0.14);
  color: #fbbf24;
  box-shadow: inset 2px 0 0 ${ACCENT};
  animation: tf-admin-glow 3s ease-in-out infinite;
}
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

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ collapsed, onToggle }) {
  injectCSS();
  const w = collapsed ? SIDEBAR_W_COL : SIDEBAR_W;

  return (
    <aside
      style={{
        position: "fixed",
        top: 0, left: 0, bottom: 0,
        width: w,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        background: "rgba(10,10,20,0.82)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRight: `1px solid ${BORDER}`,
        boxShadow: "4px 0 40px rgba(0,0,0,0.5)",
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
      }}
    >
      {/* Brand */}
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
            background: `linear-gradient(135deg, ${ACCENT}, #f97316)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 16px rgba(245,158,11,0.45)`,
          }}
        >
          <ShieldCheck size={18} color="#fff" />
        </div>
        {!collapsed && (
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1.1, whiteSpace: "nowrap" }}>TenantFlow</p>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "#fbbf24", letterSpacing: "0.08em", textTransform: "uppercase" }}>Super Admin</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `tf-admin-navlink${isActive ? " active" : ""}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} style={{ flexShrink: 0 }} />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
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
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,158,11,0.1)"; e.currentTarget.style.color = TEXT_PRIMARY; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BG_CARD; e.currentTarget.style.color = TEXT_MUTED; }}
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
      style={{
        position: "fixed",
        top: 0, left: sidebarWidth, right: 0,
        height: 64,
        zIndex: 99,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: "rgba(10,10,20,0.65)",
        backdropFilter: "blur(20px)",
        borderBottom: `1px solid ${BORDER}`,
        transition: "left 0.22s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Title */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ShieldCheck size={20} color={ACCENT} />
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: "-0.01em" }}>Super Admin</p>
          <p style={{ margin: 0, fontSize: 11, color: TEXT_MUTED }}>Platform Control Panel</p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <NotificationBell accentColor={ACCENT} />

        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", borderRadius: 50,
            background: BG_CARD, border: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: `linear-gradient(135deg, ${ACCENT}, #f97316)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "#fff",
            }}
          >
            {(user?.name ?? "A")[0].toUpperCase()}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY }}>
            {user?.name ?? "Admin"}
          </span>
        </div>

        <button
          onClick={handleLogout}
          title="Sign out"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 9, border: "none",
            background: "rgba(239,68,68,0.1)",
            color: "#f87171", cursor: "pointer", fontSize: 13, fontWeight: 500,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
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
  const sidebarWidth = collapsed ? SIDEBAR_W_COL : SIDEBAR_W;

  return (
    <div style={{ minHeight: "100vh", background: BG_DEEP, color: TEXT_PRIMARY, fontFamily: "system-ui, sans-serif" }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <TopBar sidebarWidth={sidebarWidth} />

      <main
        style={{
          marginLeft: sidebarWidth,
          paddingTop: 64,
          minHeight: "100vh",
          transition: "margin-left 0.22s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 28px" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
