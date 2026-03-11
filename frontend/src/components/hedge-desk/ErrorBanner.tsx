"use client";

import type { TranslatedError, ErrorAction } from "@/lib/errors/hedgeErrors";
import { AlertCircleIcon, RefreshCwIcon, LogInIcon, ArrowLeftIcon, ClockIcon } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  amber: "var(--accent-amber)",
  red: "var(--accent-red)",
  cyan: "var(--accent-cyan)",
  bgPanel: "var(--bg-panel)",
  rim: "var(--border-rim)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
} as const;

interface Props {
  error: TranslatedError;
  onRetry?: () => void;
  onReconnect?: () => void;
  onGoBack?: () => void;
  onDismiss?: () => void;
}

const ACTION_ICONS: Record<ErrorAction, typeof AlertCircleIcon> = {
  retry: RefreshCwIcon,
  reconnect: LogInIcon,
  go_back: ArrowLeftIcon,
  resume_draft: RefreshCwIcon,
  add_positions: ArrowLeftIcon,
  assign_policy: ArrowLeftIcon,
  contact_support: AlertCircleIcon,
  wait: ClockIcon,
};

/**
 * Inline error banner for Hedge Desk pipeline phases.
 * Displays a calm, business-safe error with a clear next action.
 * Replaces raw HTTP error messages throughout the pipeline.
 */
export default function HedgeErrorBanner({ error, onRetry, onReconnect, onGoBack, onDismiss }: Props) {
  const borderColor = error.severity === "critical" ? S.red : S.amber;
  const bgTint = error.severity === "critical"
    ? "rgba(220,38,38,0.04)"
    : "rgba(217,119,6,0.04)";

  const ActionIcon = ACTION_ICONS[error.actionType] ?? AlertCircleIcon;

  const handleAction = () => {
    switch (error.actionType) {
      case "retry":
      case "resume_draft":
        onRetry?.();
        break;
      case "reconnect":
        onReconnect?.();
        break;
      case "go_back":
      case "add_positions":
      case "assign_policy":
        onGoBack?.();
        break;
      case "wait":
        // Auto-retry after 5s
        setTimeout(() => onRetry?.(), 5000);
        break;
      default:
        onRetry?.();
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 16px",
      background: bgTint,
      border: `1px solid color-mix(in srgb, ${borderColor} 30%, transparent)`,
      borderRadius: 3,
      borderLeft: `3px solid ${borderColor}`,
    }}>
      <AlertCircleIcon
        size={16}
        style={{ color: borderColor, flexShrink: 0 }}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: S.primary,
        }}>
          {error.title.toUpperCase()}
        </span>
        <span style={{
          fontFamily: S.fontUI,
          fontSize: 12,
          color: S.secondary,
          lineHeight: 1.5,
        }}>
          {error.message}
        </span>
      </div>

      <button
        onClick={handleAction}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: S.cyan,
          background: "rgba(28,98,242,0.06)",
          border: `1px solid rgba(28,98,242,0.25)`,
          padding: "5px 12px",
          cursor: "pointer",
          borderRadius: 2,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <ActionIcon size={12} />
        {error.actionLabel.toUpperCase()}
      </button>

      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: S.tertiary,
            fontSize: 14,
            padding: "0 2px",
            lineHeight: 1,
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
