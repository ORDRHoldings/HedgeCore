"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

const HD = {
  navy:    "#0A1F44",
  royal:   "#1C62F2",
  emerald: "#2ECC71",
  crimson: "#E74C3C",
  slate:   "#8A9AB5",
  bgPanel: "var(--bg-panel)",
  bgSub:   "var(--bg-sub)",
  bgDeep:  "var(--bg-deep)",
  rim:     "var(--border-rim)",
  soft:    "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:    "var(--accent-cyan)",
  amber:   "var(--accent-amber)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

interface DisclosurePanelProps {
  title: string;
  level: "L1" | "L2" | "L3";
  children: ReactNode;
  defaultOpen?: boolean;
}

const LEVEL_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  L1: { bg: `color-mix(in srgb,${HD.cyan} 10%,transparent)`,    color: HD.cyan,    label: "L1 — Plain English" },
  L2: { bg: `color-mix(in srgb,${HD.amber} 10%,transparent)`,   color: HD.amber,   label: "L2 — Analysis" },
  L3: { bg: `color-mix(in srgb,${HD.slate} 10%,transparent)`,   color: HD.slate,   label: "L3 — Audit Hash" },
};

export default function DisclosurePanel({
  title,
  level,
  children,
  defaultOpen = false,
}: DisclosurePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const ls = LEVEL_STYLES[level];

  return (
    <div style={{
      border: `1px solid ${HD.soft}`,
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 8,
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: HD.bgSub,
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          borderBottom: open ? `1px solid ${HD.soft}` : "none",
        }}
      >
        {/* Chevron */}
        {open
          ? <ChevronDownIcon  size={14} color={HD.slate} />
          : <ChevronRightIcon size={14} color={HD.slate} />
        }

        {/* Level badge */}
        <span style={{
          fontFamily: HD.fontMono,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: ls.color,
          background: ls.bg,
          border: `1px solid color-mix(in srgb,${ls.color} 30%,transparent)`,
          padding: "1px 6px",
          borderRadius: 2,
          flexShrink: 0,
        }}>
          {ls.label}
        </span>

        {/* Title */}
        <span style={{
          fontFamily: HD.fontUI,
          fontSize: 12,
          fontWeight: 500,
          color: HD.secondary,
          flex: 1,
        }}>
          {title}
        </span>
      </button>

      {/* Body */}
      {open && (
        <div style={{
          padding: "12px 16px",
          background: HD.bgPanel,
        }}>
          {children}
        </div>
      )}
    </div>
  );
}
