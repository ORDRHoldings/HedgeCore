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
  sidebarHover:   "var(--sidebar-hover)",
  sidebarBorder:  "var(--sidebar-border)",
  sidebarDivider: "var(--sidebar-divider)",

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

  // Data signal palette — for KPI deltas, status pills, chart series.
  // NEVER use these on chrome (sidebar, page header, panel borders) — chrome uses `accent`.
  signalCyan:  "var(--accent-cyan)",
  signalAmber: "var(--accent-amber)",
  signalRed:   "var(--accent-red)",

  // Fonts
  fontUI:   "'IBM Plex Sans', var(--font-terminal, sans-serif)",
  fontMono: "'IBM Plex Mono', var(--font-terminal-mono, monospace)",
} as const;

export type TokenKey = keyof typeof T;

/**
 * Migration note (ADR-0017):
 * Per-page `const S = {...}` objects that mirror these keys are deprecated.
 * Import T directly: `import { T } from "@/lib/design/tokens";`
 * Use `T.bgPanel`, `T.signalCyan`, etc. The ESLint design-system rule blocks
 * new hex literals and sub-12px font sizes; this consolidation closes the loop.
 */
