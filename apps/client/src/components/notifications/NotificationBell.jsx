import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications.js";
import NotificationList from "./NotificationList.jsx";

export default function NotificationBell() {
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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${hasUnread ? ` (${badgeCount} unread)` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`relative w-10 h-10 rounded-full border-none flex items-center justify-center cursor-pointer transition-all duration-200 outline-none
          ${open ? 'bg-primary/20 text-primary shadow-[0_0_0_2px_var(--color-primary-40)]' : 'bg-surface-secondary/50 text-text-muted hover:bg-surface-secondary hover:text-text-primary'}`}
      >
        <Bell
          size={18}
          className="transition-transform duration-300"
          style={{ transform: open ? "rotate(-15deg)" : "rotate(0deg)" }}
        />

        {/* Unread badge */}
        {hasUnread && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold leading-4 text-center shadow-[0_0_8px_rgba(239,68,68,0.6)] border-[1.5px] border-background select-none"
          >
            {badgeCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-[calc(100%+10px)] right-0 z-[200]">
          <NotificationList onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
