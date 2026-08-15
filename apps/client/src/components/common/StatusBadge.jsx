const STATUS_CONFIG = {
  active: {
    label: "Active",
    badgeClass: "bg-success/10 border-success/30 text-success shadow-[0_0_12px_rgba(34,197,94,0.2)]",
    dotClass: "bg-success shadow-[0_0_6px_var(--color-success)]",
  },
  trialing: {
    label: "Trialing",
    badgeClass: "bg-primary/10 border-primary/30 text-primary shadow-[0_0_12px_rgba(59,130,246,0.2)]",
    dotClass: "bg-primary shadow-[0_0_6px_var(--color-primary)]",
  },
  past_due: {
    label: "Past Due",
    badgeClass: "bg-warning/10 border-warning/30 text-warning shadow-[0_0_12px_rgba(245,158,11,0.2)]",
    dotClass: "bg-warning shadow-[0_0_6px_var(--color-warning)]",
  },
  suspended: {
    label: "Suspended",
    badgeClass: "bg-danger/10 border-danger/30 text-danger shadow-[0_0_12px_rgba(239,68,68,0.2)]",
    dotClass: "bg-danger shadow-[0_0_6px_var(--color-danger)]",
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-surface-secondary border-border text-text-muted",
    dotClass: "bg-text-muted",
  },
};

/**
 * StatusBadge
 *
 * Props:
 *  - status  {string}  one of: active | trialing | past_due | suspended | cancelled
 *  - size    {"sm"|"md"|"lg"}  optional, defaults to "md"
 */
export default function StatusBadge({ status, size = "md" }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status ?? "Unknown",
    badgeClass: "bg-surface-secondary border-border text-text-muted",
    dotClass: "bg-text-muted",
  };

  const sizeMap = {
    sm: { text: "text-[10px] px-2 py-0.5 gap-1", dot: "w-1.5 h-1.5" },
    md: { text: "text-xs px-2.5 py-1 gap-1.5", dot: "w-[6px] h-[6px]" },
    lg: { text: "text-[13px] px-3.5 py-1.5 gap-2", dot: "w-[7px] h-[7px]" },
  };
  const s = sizeMap[size] ?? sizeMap.md;
  const isPulsing = ["active", "trialing"].includes(status);

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold tracking-wider uppercase whitespace-nowrap border select-none ${s.text} ${cfg.badgeClass}`}
    >
      <style>{`
        @keyframes tf-status-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.2); }
        }
      `}</style>
      <span
        className={`rounded-full shrink-0 ${s.dot} ${cfg.dotClass}`}
        style={{
          animation: isPulsing ? "tf-status-pulse 2s ease-in-out infinite" : "none",
        }}
      />
      {cfg.label}
    </span>
  );
}
