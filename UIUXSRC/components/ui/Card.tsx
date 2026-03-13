"use client";

import { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}

/**
 * Theme-aware Card container using CSS variables.
 */
export default function Card({ title, children, style }: CardProps) {
  return (
    <div
      style={{
        borderRadius: 6,
        border: "1px solid var(--border-rim)",
        background: "var(--bg-panel)",
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            borderBottom: "1px solid var(--border-rim)",
            padding: "12px 16px",
          }}
        >
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--font-terminal, 'IBM Plex Sans', sans-serif)",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {title}
          </h3>
        </div>
      )}
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
