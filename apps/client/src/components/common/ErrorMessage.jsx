import { useState } from "react";
import { AlertCircle, X } from "lucide-react";

/**
 * ErrorMessage
 *
 * Props:
 *  - message    {string}   human-readable error text
 *  - errorCode  {string}   optional short error code shown as a pill
 *  - onDismiss  {function} optional callback; if omitted, a local state toggle is used
 */
export default function ErrorMessage({ message, errorCode, onDismiss }) {
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
    <div
      role="alert"
      aria-live="assertive"
      className="relative flex items-start gap-3 px-4 py-3.5 rounded-xl border border-danger/30 bg-danger/10 backdrop-blur-md shadow-[0_4px_24px_rgba(239,68,68,0.08),inset_0_1px_0_rgba(255,255,255,0.04)] animate-[tf-fadeInDown_0.25s_ease-out]"
    >
      <style>{`
        @keyframes tf-fadeInDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      
      <AlertCircle size={18} className="shrink-0 text-danger mt-[1px]" />

      <div className="flex-1 min-w-0">
        {errorCode && (
          <span className="inline-block text-[10px] font-bold tracking-widest uppercase text-danger bg-danger/20 rounded px-1.5 py-0.5 mb-1">
            {errorCode}
          </span>
        )}
        <p className="m-0 text-sm leading-relaxed text-danger font-medium break-words">
          {message}
        </p>
      </div>

      <button
        type="button"
        aria-label="Dismiss error"
        className="shrink-0 flex items-center justify-center p-1 rounded-md bg-transparent border-none cursor-pointer text-danger hover:bg-danger/20 transition-colors"
        onClick={handleDismiss}
      >
        <X size={16} />
      </button>
    </div>
  );
}
