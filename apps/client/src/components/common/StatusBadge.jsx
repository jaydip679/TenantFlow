const STATUS_CONFIG = {
  active: {
    label: "Active",
    bg: "rgba(16,185,129,0.15)",
    border: "rgba(16,185,129,0.4)",
    text: "#34d399",
    dot: "#10b981",
    glow: "rgba(16,185,129,0.25)",
  },
  trialing: {
    label: "Trialing",
    bg: "rgba(59,130,246,0.15)",
    border: "rgba(59,130,246,0.4)",
    text: "#60a5fa",
    dot: "#3b82f6",
    glow: "rgba(59,130,246,0.25)",
  },
  past_due: {
    label: "Past Due",
    bg: "rgba(249,115,22,0.15)",
    border: "rgba(249,115,22,0.4)",
    text: "#fb923c",
    dot: "#f97316",
    glow: "rgba(249,115,22,0.25)",
  },
  suspended: {
    label: "Suspended",
    bg: "rgba(239,68,68,0.15)",
    border: "rgba(239,68,68,0.4)",
    text: "#f87171",
    dot: "#ef4444",
    glow: "rgba(239,68,68,0.25)",
  },
  cancelled: {
    label: "Cancelled",
    bg: "rgba(107,114,128,0.15)",
    border: "rgba(107,114,128,0.35)",
    text: "#9ca3af",
    dot: "#6b7280",
    glow: "transparent",
  },
};

const pulseKeyframes = `
@keyframes tf-status-pulse {
  0%, 100% { opacity: 1; transform: scale(1);   box-shadow: 0 0 0 0 var(--dot-color); }
  50%       { opacity: 0.7; transform: scale(1.2); box-shadow: 0 0 0 4px transparent; }
}
`;

let styleInjected = false;
function injectStyles() {
  if (!styleInjected && typeof document !== "undefined") {
    const el = document.createElement("style");
    el.textContent = pulseKeyframes;
    document.head.appendChild(el);
    styleInjected = true;
  }
}

/**
 * StatusBadge
 *
 * Props:
 *  - status  {string}  one of: active | trialing | past_due | suspended | cancelled
 *  - size    {"sm"|"md"|"lg"}  optional, defaults to "md"
 */
export default function StatusBadge({ status, size = "md" }) {
  injectStyles();

  const cfg = STATUS_CONFIG[status] ?? {
    label: status ?? "Unknown",
    bg: "rgba(107,114,128,0.15)",
    border: "rgba(107,114,128,0.35)",
    text: "#9ca3af",
    dot: "#6b7280",
    glow: "transparent",
  };

  const sizeMap = {
    sm: { fontSize: 10, padding: "2px 8px",  dotSize: 5, gap: 5 },
    md: { fontSize: 12, padding: "4px 10px", dotSize: 6, gap: 6 },
    lg: { fontSize: 13, padding: "5px 13px", dotSize: 7, gap: 7 },
  };
  const s = sizeMap[size] ?? sizeMap.md;
  const isPulsing = ["active", "trialing"].includes(status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        padding: s.padding,
        borderRadius: 999,
        fontSize: s.fontSize,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: cfg.text,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 0 12px ${cfg.glow}`,
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: s.dotSize,
          height: s.dotSize,
          borderRadius: "50%",
          background: cfg.dot,
          boxShadow: `0 0 6px ${cfg.dot}`,
          flexShrink: 0,
          "--dot-color": cfg.dot,
          animation: isPulsing ? "tf-status-pulse 2s ease-in-out infinite" : "none",
        }}
      />
      {cfg.label}
    </span>
  );
}
