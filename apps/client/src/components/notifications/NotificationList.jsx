import { useRef, useEffect } from "react";
import { BellOff, CheckCheck, Check, X } from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications.js";

// ── Utility: time-ago ─────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BORDER   = "rgba(255,255,255,0.08)";
const BG_CARD  = "rgba(255,255,255,0.04)";
const TEXT_PRI = "#f0f0ff";
const TEXT_MUT = "#8b8bad";

const PANEL_CSS = `
@keyframes tf-list-in {
  from { opacity:0; transform: translateY(-8px) scale(0.97); }
  to   { opacity:1; transform: translateY(0)    scale(1);    }
}
.tf-notif-item {
  display: flex;
  gap: 12px;
  padding: 13px 16px;
  border-bottom: 1px solid ${BORDER};
  cursor: default;
  transition: background 0.15s;
}
.tf-notif-item:last-child { border-bottom: none; }
.tf-notif-item:hover { background: rgba(255,255,255,0.04); }
.tf-notif-item.unread { background: rgba(108,99,255,0.07); }
.tf-notif-item.unread:hover { background: rgba(108,99,255,0.12); }
.tf-mark-btn {
  background: transparent; border: none; cursor: pointer;
  padding: 4px; border-radius: 6px; color: ${TEXT_MUT};
  display: flex; align-items: center; transition: background 0.15s, color 0.15s;
}
.tf-mark-btn:hover { background: rgba(108,99,255,0.18); color: #a78bfa; }
.tf-mark-all-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 8px; border: none;
  background: rgba(108,99,255,0.12); color: #a78bfa;
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: background 0.15s;
}
.tf-mark-all-btn:hover { background: rgba(108,99,255,0.22); }
.tf-close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 8px; border: none;
  background: transparent; color: ${TEXT_MUT}; cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.tf-close-btn:hover { background: rgba(255,255,255,0.08); color: ${TEXT_PRI}; }
`;

let cssInjected = false;
function injectCSS() {
  if (!cssInjected && typeof document !== "undefined") {
    const el = document.createElement("style");
    el.textContent = PANEL_CSS;
    document.head.appendChild(el);
    cssInjected = true;
  }
}

// ── Single notification item ──────────────────────────────────────────────────
function NotifItem({ notif, onMark }) {
  const isUnread = !notif.isRead;

  // Icon colour by category
  const dotColor =
    notif.category === "payment"      ? "#10b981" :
    notif.category === "subscription" ? "#6c63ff" :
    notif.category === "dunning"      ? "#f59e0b" :
    notif.category === "alert"        ? "#ef4444" : "#8b8bad";

  return (
    <div className={`tf-notif-item${isUnread ? " unread" : ""}`}>
      {/* Status dot */}
      <div style={{ paddingTop: 4, flexShrink: 0 }}>
        <div
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isUnread ? dotColor : "transparent",
            border: `1.5px solid ${isUnread ? dotColor : "rgba(255,255,255,0.15)"}`,
            boxShadow: isUnread ? `0 0 6px ${dotColor}` : "none",
            transition: "all 0.2s",
          }}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: "0 0 3px",
            fontSize: 13,
            fontWeight: isUnread ? 600 : 500,
            color: isUnread ? TEXT_PRI : "#c4c4d4",
            lineHeight: 1.35,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {notif.title}
        </p>
        <p
          style={{
            margin: "0 0 5px",
            fontSize: 12,
            color: TEXT_MUT,
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {notif.body ?? notif.message ?? ""}
        </p>
        <span style={{ fontSize: 11, color: isUnread ? "#a78bfa" : TEXT_MUT, fontWeight: isUnread ? 500 : 400 }}>
          {timeAgo(notif.createdAt)}
        </span>
      </div>

      {/* Mark-read button (only if unread) */}
      {isUnread && (
        <button
          className="tf-mark-btn"
          aria-label="Mark as read"
          title="Mark as read"
          onClick={() => onMark(notif._id ?? notif.id)}
        >
          <Check size={14} />
        </button>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
/**
 * NotificationList
 * Props:
 *  - onClose  {function}  callback to close the panel
 */
export default function NotificationList({ onClose }) {
  injectCSS();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const panelRef = useRef(null);

  // Scroll to top when opened
  useEffect(() => {
    panelRef.current?.scrollTo(0, 0);
  }, []);

  const displayed = notifications.slice(0, 10);
  const hasUnread = unreadCount > 0;

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      style={{
        width: 360,
        maxHeight: 520,
        borderRadius: 14,
        background: "rgba(18,18,30,0.92)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        border: `1px solid ${BORDER}`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.05)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "tf-list-in 0.2s cubic-bezier(0.4,0,0.2,1) forwards",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 12px",
          borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRI }}>Notifications</span>
          {hasUnread && (
            <span
              style={{
                fontSize: 11, fontWeight: 700,
                padding: "2px 7px", borderRadius: 999,
                background: "rgba(239,68,68,0.18)", color: "#f87171",
                border: "1px solid rgba(239,68,68,0.3)",
              }}
            >
              {unreadCount} new
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {hasUnread && (
            <button
              className="tf-mark-all-btn"
              onClick={markAllRead}
              title="Mark all as read"
            >
              <CheckCheck size={13} />
              Mark all read
            </button>
          )}
          <button className="tf-close-btn" onClick={onClose} aria-label="Close notifications">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* List */}
      <div
        ref={panelRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(108,99,255,0.3) transparent",
        }}
      >
        {displayed.length === 0 ? (
          /* Empty state */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "48px 24px",
            }}
          >
            <div
              style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "rgba(108,99,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <BellOff size={24} color="#6c63ff" />
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT_PRI }}>All caught up!</p>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_MUT, textAlign: "center", lineHeight: 1.5 }}>
              No notifications yet. We'll let you know when something needs your attention.
            </p>
          </div>
        ) : (
          displayed.map((n) => (
            <NotifItem
              key={n._id ?? n.id ?? n.title}
              notif={n}
              onMark={markRead}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 10 && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: `1px solid ${BORDER}`,
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, color: TEXT_MUT }}>
            Showing 10 of {notifications.length} notifications
          </span>
        </div>
      )}
    </div>
  );
}
