// ── Market Intelligence Types & Constants ────────────────────────────────────

export type MarketTab =
  | "OVERVIEW"
  | "HEATMAP"
  | "CALENDAR"
  | "COMPANIES"
  | "WATCHLISTS"
  | "SIGNALS";

export interface TabDef {
  key: MarketTab;
  label: string;
  param: string | null; // null = default tab (no query param)
}

export const TABS: TabDef[] = [
  { key: "OVERVIEW",   label: "Overview",   param: null },
  { key: "HEATMAP",    label: "Heatmap",    param: "heatmap" },
  { key: "CALENDAR",   label: "Calendar",   param: "calendar" },
  { key: "COMPANIES",  label: "Companies",  param: "companies" },
  { key: "WATCHLISTS", label: "Watchlists", param: "watchlists" },
  { key: "SIGNALS",    label: "Signals",    param: "signals" },
];

/** URL query param → MarketTab */
export const HASH_MAP: Record<string, MarketTab> = {
  heatmap:    "HEATMAP",
  calendar:   "CALENDAR",
  companies:  "COMPANIES",
  watchlists: "WATCHLISTS",
  signals:    "SIGNALS",
};

/** MarketTab → URL query param */
export const TAB_TO_PARAM: Record<MarketTab, string | null> = {
  OVERVIEW:   null,
  HEATMAP:    "heatmap",
  CALENDAR:   "calendar",
  COMPANIES:  "companies",
  WATCHLISTS: "watchlists",
  SIGNALS:    "signals",
};

// ── Design tokens ────────────────────────────────────────────────────────────
export const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan,#1C62F2)",
  green:     "var(--accent-green,#059669)",
  red:       "var(--accent-red,#DC2626)",
  amber:     "var(--accent-amber,#D97706)",
  black:     "#000",
} as const;
