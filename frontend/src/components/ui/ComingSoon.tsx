"use client";

import { Construction } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgDeep: "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  rim: "var(--border-rim)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  accentCyan: "var(--accent-cyan)",
} as const;

export default function ComingSoon({ title }: { title: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        fontFamily: S.fontUI,
        color: S.textPrimary,
        gap: "1rem",
      }}
    >
      <Construction size={48} style={{ color: S.accentCyan, opacity: 0.7 }} />
      <h1
        style={{
          fontFamily: S.fontMono,
          fontSize: "1.25rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </h1>
      <p style={{ color: S.textSecondary, fontSize: "0.875rem" }}>
        This feature is under development and will be available in a future release.
      </p>
    </div>
  );
}
