// ─── Shared Hedge Desk Design Tokens ─────────────────────────────────────────
// Single source of truth for all phase components.
// Uses CSS custom properties so the palette adapts to the active theme.

export const T = {
  // Backgrounds
  bgPanel:    "var(--bg-panel)",
  bgSub:      "var(--bg-sub)",
  bgDeep:     "var(--bg-deep)",
  // Borders
  rim:        "var(--border-rim)",
  soft:       "var(--border-soft)",
  // Text
  primary:    "var(--text-primary)",
  secondary:  "var(--text-secondary)",
  tertiary:   "var(--text-tertiary)",
  // Accents
  cyan:       "var(--accent-cyan)",
  amber:      "var(--accent-amber)",
  red:        "var(--accent-red,#DC2626)",
  green:      "var(--status-pass,#22c55e)",
  // Semantic
  royal:      "#1C62F2",
  emerald:    "#2ECC71",
  slate:      "#8A9AB5",
  // Fonts
  fontUI:     "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:   "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;
