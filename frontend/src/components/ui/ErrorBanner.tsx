"use client";

export interface ErrorBannerProps {
  code: string;
  message?: string;
  onDismiss?: () => void;
  className?: string;
}

const CODE_MAP: Record<string, string> = {
  SNAPSHOT_STALE: "Market snapshot is stale. Re-run with fresh data.",
  POLICY_CHANGED: "Policy has changed since proposal creation.",
  COOLING_OFF_ACTIVE: "Cooling-off period active. Authorization blocked until timer expires.",
  HASH_MISMATCH: "Input hash mismatch detected. The underlying data may have been modified.",
  LIMIT_BREACH: "One or more concentration limits have been breached.",
  MARGIN_INSUFFICIENT: "Insufficient margin to cover the proposed positions.",
  APPROVAL_REQUIRED: "This action requires additional approval before proceeding.",
  SESSION_EXPIRED: "Your session has expired. Please re-authenticate.",
  RATE_LIMITED: "Too many requests. Please wait before retrying.",
  VALIDATION_FAILED: "Input validation failed. Check the highlighted fields.",
};

export default function ErrorBanner({
  code,
  message,
  onDismiss,
  className = "",
}: ErrorBannerProps) {
  const resolved = message ?? CODE_MAP[code] ?? `Rejection: ${code}`;

  return (
    <div
      role="alert"
      className={[
        "flex items-start gap-3 px-4 py-3 rounded",
        "bg-amber-50 border border-[var(--accent-amber)]/25",
        className,
      ].join(" ")}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5 text-[var(--accent-amber)]">
        <path d="M8 1.5L14.5 13H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
        <path d="M8 6v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <circle cx="8" cy="11" r="0.6" fill="currentColor" />
      </svg>
      <div className="flex-1 min-w-0">
        <span className="block text-[0.6875rem] font-mono font-medium text-[var(--accent-amber)] uppercase tracking-wider leading-none mb-1">
          {code.replace(/_/g, " ")}
        </span>
        <p className="text-xs text-[var(--text-primary)] leading-snug">{resolved}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 p-0.5 rounded hover:bg-amber-100 text-[var(--accent-amber)] transition-colors"
          aria-label="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
