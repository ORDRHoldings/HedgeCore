"use client";

import type { LucideIcon } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  tertiary: "var(--text-tertiary)",
  secondary: "var(--text-secondary)",
  rim: "var(--border-rim)",
  cyan: "var(--accent-cyan)",
  bgSub: "var(--bg-sub)",
} as const;

interface GuidedEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  cta?: { label: string; onClick: () => void };
  positive?: boolean;
}

export default function GuidedEmptyState({
  icon: Icon,
  title,
  description,
  cta,
  positive,
}: GuidedEmptyStateProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 10, padding: "28px 20px",
      height: "100%", textAlign: "center",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: positive ? "rgba(16,185,129,0.08)" : S.bgSub,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon
          size={16} strokeWidth={1.5}
          style={{ color: positive ? "var(--status-pass)" : S.tertiary }}
        />
      </div>
      <span style={{
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
        letterSpacing: "0.06em", color: S.secondary,
      }}>
        {title}
      </span>
      <span style={{
        fontFamily: S.fontUI, fontSize: 12, lineHeight: 1.6,
        color: S.tertiary, maxWidth: 260,
      }}>
        {description}
      </span>
      {cta && (
        <button
          onClick={cta.onClick}
          style={{
            marginTop: 4,
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
            letterSpacing: "0.1em", textTransform: "uppercase",
            color: S.cyan, background: "transparent",
            border: `1px solid ${S.cyan}`, padding: "5px 14px",
            cursor: "pointer", transition: "all 120ms",
          }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
