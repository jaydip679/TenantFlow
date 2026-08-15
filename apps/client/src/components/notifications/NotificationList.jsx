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

// ── Single notification item ──────────────────────────────────────────────────
function NotifItem({ notif, onMark }) {
  const isUnread = !notif.isRead;

  // Icon colour by category
  const dotColorClass =
    notif.category === "payment"      ? "bg-success border-success" :
    notif.category === "subscription" ? "bg-primary border-primary" :
    notif.category === "dunning"      ? "bg-warning border-warning" :
    notif.category === "alert"        ? "bg-danger border-danger" : "bg-text-muted border-text-muted";

  const shadowClass =
    notif.category === "payment"      ? "shadow-[0_0_6px_var(--color-success)]" :
    notif.category === "subscription" ? "shadow-[0_0_6px_var(--color-primary)]" :
    notif.category === "dunning"      ? "shadow-[0_0_6px_var(--color-warning)]" :
    notif.category === "alert"        ? "shadow-[0_0_6px_var(--color-danger)]" : "shadow-none";

  return (
    <div className={`flex gap-3 px-4 py-3.5 border-b border-border last:border-b-0 cursor-default transition-colors ${isUnread ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-surface-secondary/50'}`}>
      {/* Status dot */}
      <div className="pt-1 shrink-0">
        <div
          className={`w-2 h-2 rounded-full border-[1.5px] transition-all duration-200 ${isUnread ? `${dotColorClass} ${shadowClass}` : 'bg-transparent border-border'}`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`m-0 mb-[3px] text-[13px] leading-[1.35] overflow-hidden text-ellipsis whitespace-nowrap ${isUnread ? 'font-semibold text-text-primary' : 'font-medium text-text-muted'}`}>
          {notif.title}
        </p>
        <p className="m-0 mb-[5px] text-xs text-text-muted leading-[1.4] line-clamp-2">
          {notif.body ?? notif.message ?? ""}
        </p>
        <span className={`text-[11px] ${isUnread ? 'text-primary font-medium' : 'text-text-muted font-normal'}`}>
          {timeAgo(notif.createdAt)}
        </span>
      </div>

      {/* Mark-read button (only if unread) */}
      {isUnread && (
        <button
          className="p-1 rounded-md border-none bg-transparent text-text-muted hover:bg-primary/20 hover:text-primary cursor-pointer flex items-center transition-colors"
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
      className="w-[360px] max-h-[520px] rounded-[14px] bg-background/95 backdrop-blur-[28px] border border-border shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_0_0.5px_rgba(255,255,255,0.05)] flex flex-col overflow-hidden animate-[tf-list-in_0.2s_cubic-bezier(0.4,0,0.2,1)_forwards]"
    >
      <style>{`
        @keyframes tf-list-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-text-primary">Notifications</span>
          {hasUnread && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-danger/20 text-danger border border-danger/30">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {hasUnread && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-none bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold cursor-pointer transition-colors"
              onClick={markAllRead}
              title="Mark all as read"
            >
              <CheckCheck size={13} />
              Mark all read
            </button>
          )}
          <button className="flex items-center justify-center w-7 h-7 rounded-lg border-none bg-transparent text-text-muted hover:bg-surface-secondary/50 hover:text-text-primary cursor-pointer transition-colors" onClick={onClose} aria-label="Close notifications">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* List */}
      <div
        ref={panelRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(108,99,255,0.3) transparent" }}
      >
        {displayed.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <BellOff size={24} className="text-primary" />
            </div>
            <p className="m-0 text-sm font-semibold text-text-primary">All caught up!</p>
            <p className="m-0 text-xs text-text-muted text-center leading-[1.5]">
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
        <div className="px-4 py-2.5 border-t border-border text-center shrink-0">
          <span className="text-xs text-text-muted">
            Showing 10 of {notifications.length} notifications
          </span>
        </div>
      )}
    </div>
  );
}
