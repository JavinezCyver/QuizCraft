import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

export function Toast({
  id,
  message,
  onDismiss,
}: {
  id: number;
  message: string;
  onDismiss: (id: number) => void;
}) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setClosing(true), 4500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => onDismiss(id),
      reducedMotion ? 0 : 180,
    );
    return () => window.clearTimeout(timer);
  }, [closing, id, onDismiss]);

  return (
    <div
      className={`toast${closing ? " is-leaving" : ""}`}
      role="status"
      aria-atomic="true"
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onDismiss(id);
      }}
    >
      <span className="toast-icon" aria-hidden="true">
        <Check size={13} />
      </span>
      <span className="toast-message">{message}</span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Dismiss notification"
        disabled={closing}
        onClick={() => setClosing(true)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
