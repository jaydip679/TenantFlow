import { useState } from "react";
import { AlertCircle, X } from "lucide-react";

const styles = {
  wrapper: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "linear-gradient(135deg,rgba(239,68,68,0.12) 0%,rgba(185,28,28,0.08) 100%)",
    backdropFilter: "blur(8px)",
    boxShadow: "0 4px 24px rgba(239,68,68,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
    position: "relative",
    animation: "tf-fadeInDown 0.25s ease-out",
  },
  icon: {
    flexShrink: 0,
    color: "#f87171",
    marginTop: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  code: {
    display: "inline-block",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#fca5a5",
    background: "rgba(239,68,68,0.2)",
    borderRadius: 4,
    padding: "2px 6px",
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    lineHeight: 1.5,
    color: "#fecaca",
    margin: 0,
    wordBreak: "break-word",
  },
  dismiss: {
    flexShrink: 0,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 4,
    borderRadius: 6,
    color: "#f87171",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s",
  },
};

const fadeKeyframes = `
@keyframes tf-fadeInDown {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0);    }
}
`;

let injected = false;
function injectAnim() {
  if (!injected && typeof document !== "undefined") {
    const el = document.createElement("style");
    el.textContent = fadeKeyframes;
    document.head.appendChild(el);
    injected = true;
  }
}

/**
 * ErrorMessage
 *
 * Props:
 *  - message    {string}   human-readable error text
 *  - errorCode  {string}   optional short error code shown as a pill
 *  - onDismiss  {function} optional callback; if omitted, a local state toggle is used
 */
export default function ErrorMessage({ message, errorCode, onDismiss }) {
  injectAnim();
  const [visible, setVisible] = useState(true);

  if (!visible || !message) return null;

  function handleDismiss() {
    if (onDismiss) {
      onDismiss();
    } else {
      setVisible(false);
    }
  }

  return (
    <div role="alert" aria-live="assertive" style={styles.wrapper}>
      <AlertCircle size={18} style={styles.icon} />

      <div style={styles.body}>
        {errorCode && <span style={styles.code}>{errorCode}</span>}
        <p style={styles.message}>{message}</p>
      </div>

      <button
        type="button"
        aria-label="Dismiss error"
        style={styles.dismiss}
        onClick={handleDismiss}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
