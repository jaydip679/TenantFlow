import { useEffect, useRef } from "react";

/**
 * LoadingSpinner
 * @param {number}  size     - outer diameter in px (default 48)
 * @param {string}  label    - accessible screen-reader label
 * @param {boolean} overlay  - when true, renders a full-screen overlay
 */
export default function LoadingSpinner({
  size = 48,
  label = "Loading…",
  overlay = false,
}) {
  const thickness = Math.max(3, Math.round(size * 0.08));
  const orbitSize = Math.round(size * 0.18);

  const spinnerEl = (
    <div
      role="status"
      aria-label={label}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <style>{`
        @keyframes tf-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes tf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes tf-orbit {
          0% { transform: rotate(0deg) translateX(18px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(18px) rotate(-360deg); }
        }
      `}</style>
      
      {/* Outer track */}
      <div
        className="absolute inset-0 rounded-full border-primary/15"
        style={{ borderWidth: thickness }}
      />

      {/* Primary spinning arc */}
      <div
        className="absolute inset-0 rounded-full border-transparent border-t-primary border-r-primary/50"
        style={{
          borderWidth: thickness,
          animation: "tf-spin 0.85s cubic-bezier(0.4,0,0.2,1) infinite",
        }}
      />

      {/* Secondary counter-spinning arc */}
      <div
        className="absolute rounded-full border-transparent border-b-blue-500 border-l-blue-500/40"
        style={{
          inset: thickness * 2.5,
          borderWidth: Math.max(2, thickness - 1),
          animation: "tf-spin 1.3s cubic-bezier(0.4,0,0.6,1) reverse infinite",
        }}
      />

      {/* Orbiting dot */}
      <div
        className="absolute top-1/2 left-1/2 rounded-full shadow-[0_0_12px_var(--color-primary)]"
        style={{
          marginTop: -orbitSize / 2,
          marginLeft: -orbitSize / 2,
          width: orbitSize,
          height: orbitSize,
          background: `radial-gradient(circle at 35% 35%, #ffffff, var(--color-primary, #16a34a))`,
          animation: "tf-orbit 0.85s linear infinite",
        }}
      />

      {/* Glowing centre dot */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_16px_var(--color-primary)]"
        style={{
          width: Math.round(size * 0.15),
          height: Math.round(size * 0.15),
          animation: "tf-pulse 1.4s ease-in-out infinite",
        }}
      />

      <span className="absolute w-px h-px overflow-hidden clip-rect-0">
        {label}
      </span>
    </div>
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 bg-background/80 backdrop-blur-md">
        {spinnerEl}
        <p className="m-0 text-primary text-sm font-medium tracking-wide">
          {label}
        </p>
      </div>
    );
  }

  return spinnerEl;
}
