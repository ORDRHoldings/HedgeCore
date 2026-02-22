"use client";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  type: "empty" | "loading" | "error";
  title?: string;
  message?: string;
  action?: EmptyStateAction;
  className?: string;
}

const defaults: Record<string, { title: string; message: string }> = {
  empty: { title: "No data", message: "There is nothing to display here yet." },
  loading: { title: "Loading", message: "Fetching data\u2026" },
  error: { title: "Something went wrong", message: "An unexpected error occurred. Please try again." },
};

export default function EmptyState({
  type,
  title,
  message,
  action,
  className = "",
}: EmptyStateProps) {
  const t = title ?? defaults[type].title;
  const m = message ?? defaults[type].message;

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
        {action && (
          <button
            onClick={action.onClick}
            className="mt-2 px-3 py-1.5 text-sm font-medium rounded border border-[var(--accent-red)]/30 text-[var(--accent-red)] hover:bg-red-50 transition-colors"
          >
            {action.label}
          </button>
        )}
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
