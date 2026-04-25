"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { logger } from "@/lib/logger";

interface Props {
  widgetId: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(`[WidgetErrorBoundary] ${this.props.widgetId} crashed:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-panel)",
            border: "1px solid var(--border-rim)",
            fontFamily: "'IBM Plex Mono','JetBrains Mono',monospace",
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: "0.6rem",
              color: "var(--accent-red,#B91C1C)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Widget Error — {this.props.widgetId}
          </div>
          <div
            style={{
              fontSize: "0.6rem",
              color: "var(--text-tertiary)",
              maxWidth: 240,
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            {this.state.error?.message ?? "Unknown error"}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 14,
              fontSize: "0.6rem",
              fontFamily: "'IBM Plex Mono',monospace",
              color: "var(--accent-cyan)",
              background: "transparent",
              border: "1px solid var(--accent-cyan)",
              padding: "4px 12px",
              cursor: "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
