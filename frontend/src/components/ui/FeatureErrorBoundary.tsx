"use client";

/**
 * FeatureErrorBoundary — page/feature-scoped error boundary.
 *
 * Differs from WidgetErrorBoundary: intended to wrap an entire feature
 * (page, tab, or large subtree) and emit a Sentry event tagged with
 * `feature`, so crashes show up grouped per-feature in triage.
 *
 * Sentry is loaded dynamically and best-effort: missing DSN or import
 * failure never blocks the fallback UI.
 */

import { Component, type ReactNode, type ErrorInfo } from "react";
import { logger } from "@/lib/logger";

interface Props {
  feature: string;
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class FeatureErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(`[FeatureErrorBoundary] ${this.props.feature} crashed:`, error, info);
    // Best-effort Sentry emission, tagged by feature.
    import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.withScope((scope) => {
          scope.setTag("feature", this.props.feature);
          scope.setContext("react", {
            componentStack: info.componentStack,
          });
          Sentry.captureException(error);
        });
      })
      .catch(() => {
        // Sentry not configured — logger.error already captured locally.
      });
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return (
      <div
        style={{
          minHeight: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-panel)",
          border: "1px solid var(--border-rim)",
          fontFamily: "'IBM Plex Mono','JetBrains Mono',monospace",
          padding: 32,
          margin: 16,
          borderRadius: 4,
        }}
      >
        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--accent-red,#B91C1C)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          {this.props.feature} — Error
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
            maxWidth: 520,
            textAlign: "center",
            lineHeight: 1.6,
            marginBottom: 18,
          }}
        >
          Something went wrong loading this section. The error has been
          reported. You can try again, or navigate elsewhere and come back.
        </div>
        <div
          style={{
            fontSize: "0.65rem",
            color: "var(--text-tertiary)",
            fontFamily: "'JetBrains Mono',monospace",
            maxWidth: 600,
            textAlign: "center",
            marginBottom: 18,
            opacity: 0.7,
          }}
        >
          {this.state.error?.message ?? "Unknown error"}
        </div>
        <button
          onClick={this.reset}
          style={{
            fontSize: "0.7rem",
            fontFamily: "'IBM Plex Mono',monospace",
            color: "var(--accent-cyan)",
            background: "transparent",
            border: "1px solid var(--accent-cyan)",
            padding: "6px 18px",
            cursor: "pointer",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Retry
        </button>
      </div>
    );
  }
}
