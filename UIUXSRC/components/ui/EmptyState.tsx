"use client";

/**
 * Portable EmptyState component -- 6 state types with custom SVG icons.
 * Uses CSS variables for theming. No external dependencies beyond React.
 */

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
  style?: React.CSSProperties;
}

const defaults: Record<string, { title: string; message: string }> = {
  empty: { title: "No data", message: "There is nothing to display here yet." },
  loading: { title: "Loading", message: "Fetching data\u2026" },
  error: { title: "Something went wrong", message: "An unexpected error occurred. Please try again." },
  "session-expired": { title: "Session expired", message: "Your session has expired. Reconnect to continue. No data was lost." },
  network: { title: "Connection issue", message: "Unable to reach the server. Check your network and retry." },
  "no-permission": { title: "Insufficient permissions", message: "You don't have permission for this action. Contact your administrator." },
};

const S = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 24px",
    gap: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "var(--font-terminal, 'IBM Plex Sans', sans-serif)",
    color: "var(--text-primary)",
    margin: 0,
  },
  message: {
    fontSize: 14,
    fontFamily: "var(--font-terminal, 'IBM Plex Sans', sans-serif)",
    color: "var(--text-secondary)",
    textAlign: "center" as const,
    maxWidth: 400,
    lineHeight: 1.6,
    margin: 0,
  },
  primaryBtn: {
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "var(--font-terminal, 'IBM Plex Sans', sans-serif)",
    borderRadius: 4,
    cursor: "pointer",
    border: "none",
    transition: "opacity 100ms",
  },
  secondaryBtn: {
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "var(--font-terminal, 'IBM Plex Sans', sans-serif)",
    borderRadius: 4,
    cursor: "pointer",
    border: "1px solid var(--border-rim)",
    background: "transparent",
    color: "var(--text-secondary)",
    transition: "background 100ms",
  },
};

export default function EmptyState({
  type,
  title,
  message,
  action,
  secondaryAction,
  style,
}: EmptyStateProps) {
  const t = title ?? defaults[type]?.title ?? defaults.error.title;
  const m = message ?? defaults[type]?.message ?? defaults.error.message;

  if (type === "loading") {
    return (
      <div style={{ ...S.container, ...style }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2px solid var(--border-rim)",
            borderTopColor: "var(--accent-blue)",
            animation: "spin 0.6s linear infinite",
          }}
          role="status"
          aria-label="Loading"
        />
        <p style={S.message}>{m}</p>
      </div>
    );
  }

  if (type === "session-expired") {
    return (
      <div
        style={{
          ...S.container,
          border: "1px solid var(--accent-amber)",
          borderRadius: 6,
          background: "rgba(217, 119, 6, 0.04)",
          ...style,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: "var(--accent-amber)" }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7v4l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={S.title}>{t}</span>
        <p style={S.message}>{m}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {action && (
            <button
              onClick={action.onClick}
              style={{ ...S.primaryBtn, background: "var(--accent-amber)", color: "#FFFFFF" }}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button onClick={secondaryAction.onClick} style={S.secondaryBtn}>
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (type === "network") {
    return (
      <div
        style={{
          ...S.container,
          border: "1px solid var(--border-rim)",
          borderRadius: 6,
          background: "var(--bg-sub)",
          ...style,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-tertiary)" }}>
          <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-3.63M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={S.title}>{t}</span>
        <p style={S.message}>{m}</p>
        {action && (
          <button
            onClick={action.onClick}
            style={{
              ...S.primaryBtn,
              background: "transparent",
              color: "var(--accent-blue)",
              border: "1px solid var(--accent-blue)",
              marginTop: 4,
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    );
  }

  if (type === "no-permission") {
    return (
      <div
        style={{
          ...S.container,
          border: "1px solid var(--border-rim)",
          borderRadius: 6,
          background: "var(--bg-sub)",
          ...style,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-tertiary)" }}>
          <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span style={S.title}>{t}</span>
        <p style={S.message}>{m}</p>
        {action && (
          <button onClick={action.onClick} style={{ ...S.secondaryBtn, marginTop: 4 }}>
            {action.label}
          </button>
        )}
      </div>
    );
  }

  if (type === "error") {
    return (
      <div
        style={{
          ...S.container,
          border: "1px solid var(--accent-red)",
          borderRadius: 6,
          background: "rgba(220, 38, 38, 0.04)",
          ...style,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--accent-red)" }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="12" cy="16.5" r="0.75" fill="currentColor" />
        </svg>
        <span style={S.title}>{t}</span>
        <p style={S.message}>{m}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {action && (
            <button
              onClick={action.onClick}
              style={{
                ...S.primaryBtn,
                background: "transparent",
                color: "var(--accent-red)",
                border: "1px solid var(--accent-red)",
              }}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button onClick={secondaryAction.onClick} style={S.secondaryBtn}>
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Default: "empty" type
  return (
    <div
      style={{
        ...S.container,
        border: "1px dashed var(--border-rim)",
        borderRadius: 6,
        ...style,
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-tertiary)" }}>
        <rect x="3" y="7" width="18" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 12h18" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7V5a1.5 1.5 0 011.5-1.5h5A1.5 1.5 0 0116 5v2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span style={{ ...S.title, fontWeight: 500, color: "var(--text-secondary)" }}>{t}</span>
      <p style={{ ...S.message, color: "var(--text-tertiary)" }}>{m}</p>
      {action && (
        <button onClick={action.onClick} style={{ ...S.secondaryBtn, marginTop: 8 }}>
          {action.label}
        </button>
      )}
    </div>
  );
}
