"use client";

import type { TranslatedError } from "@/lib/errors/hedgeErrors";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  type: "empty" | "loading" | "error" | "session-expired" | "network" | "no-permission";
  title?: string;
  message?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
  /** Pass a TranslatedError to auto-populate title, message, and action label. */
  translatedError?: TranslatedError;
}

const defaults: Record<string, { title: string; message: string }> = {
  empty: { title: "No data", message: "There is nothing to display here yet." },
  loading: { title: "Loading", message: "Fetching data\u2026" },
  error: { title: "Something went wrong", message: "An unexpected error occurred. Please try again." },
  "session-expired": { title: "Session expired", message: "Your session has expired. Reconnect to continue. No data was lost." },
  network: { title: "Connection issue", message: "Unable to reach the server. Check your network and retry." },
  "no-permission": { title: "Insufficient permissions", message: "You don't have permission for this action. Contact your administrator." },
};

export default function EmptyState({
  type,
  title,
  message,
  action,
  secondaryAction,
  className = "",
  translatedError,
}: EmptyStateProps) {
  const t = title ?? translatedError?.title ?? defaults[type]?.title ?? defaults.error.title;
  const m = message ?? translatedError?.message ?? defaults[type]?.message ?? defaults.error.message;

  if (type === "loading") {
    return (
      <div className={`flex flex-col items-center justify-center py-12 gap-3 ${className}`}>
        <div
          className="w-6 h-6 rounded-full border-2 border-[var(--border-rim)] border-t-[var(--accent-cyan)] animate-spin"
          role="status"
          aria-label="Loading"
        />
        <p className="text-sm text-[var(--text-secondary)]">{m}</p>
      </div>
    );
  }

  // Session-expired: amber, calm, with reconnect CTA
  if (type === "session-expired") {
    return (
      <div className={[
        "flex flex-col items-center justify-center py-12 gap-3",
        "border border-[var(--accent-amber)]/20 rounded bg-amber-50/40",
        className,
      ].join(" ")}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-amber)]">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7v4l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{t}</span>
        <p className="text-sm text-[var(--text-secondary)] text-center max-w-md leading-relaxed">{m}</p>
        <div className="flex gap-2 mt-1">
          {action && (
            <button
              onClick={action.onClick}
              className="px-4 py-2 text-sm font-semibold rounded bg-[var(--accent-amber)] text-white hover:opacity-90 transition-opacity"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-3 py-2 text-sm font-medium rounded border border-[var(--border-rim)] text-[var(--text-secondary)] hover:bg-[var(--bg-sub)] transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Network error: gray, with retry CTA
  if (type === "network") {
    return (
      <div className={[
        "flex flex-col items-center justify-center py-12 gap-3",
        "border border-[var(--border-rim)] rounded bg-[var(--bg-sub)]",
        className,
      ].join(" ")}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-[var(--text-tertiary)]">
          <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-3.63M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{t}</span>
        <p className="text-sm text-[var(--text-secondary)] text-center max-w-md leading-relaxed">{m}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-1 px-4 py-2 text-sm font-semibold rounded border border-[var(--accent-cyan)] text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/5 transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
    );
  }

  // Permission error: subtle, no-alarm
  if (type === "no-permission") {
    return (
      <div className={[
        "flex flex-col items-center justify-center py-12 gap-3",
        "border border-[var(--border-rim)] rounded bg-[var(--bg-sub)]",
        className,
      ].join(" ")}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-[var(--text-tertiary)]">
          <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{t}</span>
        <p className="text-sm text-[var(--text-secondary)] text-center max-w-md leading-relaxed">{m}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-1 px-3 py-1.5 text-sm font-medium rounded border border-[var(--border-rim)] text-[var(--text-secondary)] hover:bg-[var(--bg-sub)] transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
    );
  }

  if (type === "error") {
    return (
      <div className={[
        "flex flex-col items-center justify-center py-12 gap-2",
        "border border-[var(--accent-red)]/20 rounded bg-red-50/40",
        className,
      ].join(" ")}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-red)]">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="12" cy="16.5" r="0.75" fill="currentColor" />
        </svg>
        <span className="text-sm font-medium text-[var(--text-primary)]">{t}</span>
        <p className="text-sm text-[var(--text-secondary)] text-center max-w-sm">{m}</p>
        <div className="flex gap-2 mt-1">
          {action && (
            <button
              onClick={action.onClick}
              className="px-3 py-1.5 text-sm font-medium rounded border border-[var(--accent-red)]/30 text-[var(--accent-red)] hover:bg-red-50 transition-colors"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-3 py-1.5 text-sm font-medium rounded border border-[var(--border-rim)] text-[var(--text-secondary)] hover:bg-[var(--bg-sub)] transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={[
      "flex flex-col items-center justify-center py-12 gap-2",
      "border border-dashed border-[var(--border-rim)] rounded",
      className,
    ].join(" ")}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--text-tertiary)]">
        <rect x="3" y="7" width="18" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 12h18" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7V5a1.5 1.5 0 011.5-1.5h5A1.5 1.5 0 0116 5v2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="text-sm font-medium text-[var(--text-secondary)]">{t}</span>
      <p className="text-sm text-[var(--text-tertiary)] text-center max-w-sm">{m}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 px-3 py-1.5 text-sm font-medium rounded border border-[var(--border-rim)] text-[var(--text-secondary)] hover:bg-[var(--bg-sub)] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
