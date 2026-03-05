"use client";
/**
 * PageHeader — standard page header with breadcrumb + primary action slot.
 */

import type { ReactNode } from "react";

interface Props {
  label?: string;    // section label (e.g. "AUDIT LAB")
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
        marginBottom: 28,
        gap: 16,
      }}
    >
      <div>
        {label && (
          <div
            style={{
              fontFamily: "var(--font-terminal-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {label}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p
            style={{
              fontFamily: "var(--font-terminal)",
              fontSize: 13,
              color: "var(--text-secondary)",
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

export default PageHeader;
