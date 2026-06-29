import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications.js";
import NotificationList from "./NotificationList.jsx";

/**
 * NotificationBell
 * Props:
 *  - accentColor  {string}  optional accent override (default #6c63ff)
 */
export default function NotificationBell({ accentColor = "#6c63ff" }) {
  const { unreadCount } = useNotifications();
  const [open, setOpen]    = useState(false);
  const containerRef       = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const hasUnread = unreadCount > 0;
  const badgeCount = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={`Notifications${hasUnread ? ` (${badgeCount} unread)` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative",
          width: 40, height: 40, borderRadius: "50%", border: "none",
          background: open
            ? `rgba(108,99,255,0.22)`
            : "rgba(255,255,255,0.05)",
          color: open ? accentColor : "#8b8bad",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.18s, color 0.18s, box-shadow 0.18s",
          boxShadow: open ? `0 0 0 2px ${accentColor}44` : "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          e.currentTarget.style.color = "#f0f0ff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = open ? "rgba(108,99,255,0.22)" : "rgba(255,255,255,0.05)";
          e.currentTarget.style.color = open ? accentColor : "#8b8bad";
        }}
      >
        <Bell
          size={18}
          style={{
            transition: "transform 0.3s",
            transform: open ? "rotate(-15deg)" : "rotate(0deg)",
          }}
        />

        {/* Unread badge */}
        {hasUnread && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 4, right: 4,
              minWidth: 16, height: 16,
              padding: "0 3px",
              borderRadius: 999,
              background: "#ef4444",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              lineHeight: "16px",
              textAlign: "center",
              boxShadow: "0 0 8px rgba(239,68,68,0.6)",
              border: "1.5px solid rgba(15,15,26,0.9)",
              letterSpacing: 0,
              userSelect: "none",
            }}
          >
            {badgeCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            zIndex: 200,
          }}
        >
          <NotificationList onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
