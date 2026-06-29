import { useEffect, useRef } from "react";

const keyframes = `
@keyframes tf-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes tf-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
@keyframes tf-orbit {
  0%   { transform: rotate(0deg)   translateX(18px) rotate(0deg); }
  100% { transform: rotate(360deg) translateX(18px) rotate(-360deg); }
}
`;

function injectStyles() {
  if (typeof document !== "undefined" && !document.getElementById("tf-spinner-styles")) {
    const style = document.createElement("style");
    style.id = "tf-spinner-styles";
    style.textContent = keyframes;
    document.head.appendChild(style);
  }
}

/**
 * LoadingSpinner
 * @param {number}  size     - outer diameter in px (default 48)
 * @param {string}  color    - primary accent colour (default #6c63ff)
 * @param {string}  label    - accessible screen-reader label
 * @param {boolean} overlay  - when true, renders a full-screen overlay
 */
export default function LoadingSpinner({
  size = 48,
  color = "#6c63ff",
  label = "Loading…",
  overlay = false,
}) {
  const injected = useRef(false);
  if (!injected.current) {
    injectStyles();
    injected.current = true;
  }

  const thickness = Math.max(3, Math.round(size * 0.08));
  const orbitSize = Math.round(size * 0.18);

  const spinnerEl = (
    <div
      role="status"
      aria-label={label}
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      {/* Outer track */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `${thickness}px solid rgba(108,99,255,0.15)`,
        }}
      />

      {/* Primary spinning arc */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `${thickness}px solid transparent`,
          borderTopColor: color,
          borderRightColor: `${color}88`,
          animation: "tf-spin 0.85s cubic-bezier(0.4,0,0.2,1) infinite",
        }}
      />

      {/* Secondary counter-spinning arc */}
      <div
        style={{
          position: "absolute",
          inset: thickness * 2.5,
          borderRadius: "50%",
          border: `${Math.max(2, thickness - 1)}px solid transparent`,
          borderBottomColor: "#a78bfa",
          borderLeftColor: "#a78bfa66",
          animation: "tf-spin 1.3s cubic-bezier(0.4,0,0.6,1) reverse infinite",
        }}
      />

      {/* Orbiting dot */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          marginTop: -orbitSize / 2,
          marginLeft: -orbitSize / 2,
          width: orbitSize,
          height: orbitSize,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 35%, #ffffff, ${color})`,
          boxShadow: `0 0 ${orbitSize * 1.5}px ${color}`,
          animation: "tf-orbit 0.85s linear infinite",
        }}
      />

      {/* Glowing centre dot */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: Math.round(size * 0.15),
          height: Math.round(size * 0.15),
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 ${size * 0.25}px ${color}`,
          animation: "tf-pulse 1.4s ease-in-out infinite",
        }}
      />

      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
        {label}
      </span>
    </div>
  );

  if (overlay) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          background: "rgba(15,15,26,0.85)",
          backdropFilter: "blur(8px)",
        }}
      >
        {spinnerEl}
        <p style={{ color: "#a78bfa", fontSize: 14, fontWeight: 500, letterSpacing: "0.05em", margin: 0 }}>
          {label}
        </p>
      </div>
    );
  }

  return spinnerEl;
}
