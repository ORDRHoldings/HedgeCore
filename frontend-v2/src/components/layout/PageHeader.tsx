"use client";
/**
 * PageHeader -- institutional page header. Tight, monospace label + authoritative title.
 */

import type { ReactNode } from "react";

interface Props {
  label?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  badge?: ReactNode;
}

export function PageHeader({ label, title, subtitle, action, badge }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 20,
        gap: 16,
        paddingBottom: 16,
        borderBottom: "1px solid var(--border-rim)",
      }}
    >
      <div>
        {label && (
          <div
            style={{
              fontFamily: "var(--font-terminal-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              marginBottom: 5,
            }}
          >
            {label}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 19,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.025em",
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p style={{ fontFamily: "var(--font-terminal)", fontSize: 12, color: "var(--text-tertiary)", marginTop: 3, marginBottom: 0, lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0, paddingTop: 2 }}>{action}</div>}
    </div>
  );
}

export default PageHeader;
