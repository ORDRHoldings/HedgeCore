/**
 * ORDR Terminal Design Tokens — Single source of truth.
 * All values reference CSS variables defined in globals.css :root.
 * Never hardcode hex values here.
 */

export const T = {
  // Surface
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  bgSidebar: "var(--bg-sidebar)",

  // Border
  rim:  "var(--border-rim)",
  soft: "var(--border-soft)",

  // Text
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  disabled:  "var(--text-disabled)",

  // Accent (single blue — no cyan, no amber on chrome)
  accent:    "var(--accent-blue)",
  accentDim: "var(--accent-blue-dim)",

  // Status (data values only — never on UI chrome)
  pass: "var(--status-pass)",
  fail: "var(--status-fail)",
  warn: "var(--status-warn)",

  // Fonts
  fontUI:   "'IBM Plex Sans', var(--font-terminal, sans-serif)",
  fontMono: "'IBM Plex Mono', var(--font-terminal-mono, monospace)",
} as const;

export type TokenKey = keyof typeof T;
