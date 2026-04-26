// ─── Shared Hedge Desk Design Tokens ─────────────────────────────────────────
// Single source of truth for all phase components.
// Uses CSS custom properties so the palette adapts to the active theme.

// ─── CME Contract Specifications ─────────────────────────────────────────────
// Single source of truth for all phase components that reference CME specs.

export interface CmeSpec {
  symbol:        string;
  name:          string;
  contract_size: number;
  currency:      string;
  margin_est:    number;
  tick_size:     number;
  tick_value:    number;
  exchange:      string;
  settle:        string;
}

export const CME_SPECS: Record<string, CmeSpec> = {
  MXN: { symbol: "M6M", name: "Mexican Peso Futures",        contract_size: 500_000,    currency: "MXN", margin_est: 1800, tick_size: 0.000025,  tick_value: 12.50, exchange: "CME", settle: "3rd Wednesday" },
  EUR: { symbol: "6E",  name: "Euro FX Futures",             contract_size: 125_000,    currency: "EUR", margin_est: 2200, tick_size: 0.00005,   tick_value: 6.25,  exchange: "CME", settle: "3rd Wednesday" },
  GBP: { symbol: "6B",  name: "British Pound Futures",       contract_size: 62_500,     currency: "GBP", margin_est: 1900, tick_size: 0.0001,    tick_value: 6.25,  exchange: "CME", settle: "3rd Wednesday" },
  JPY: { symbol: "6J",  name: "Japanese Yen Futures",        contract_size: 12_500_000, currency: "JPY", margin_est: 2000, tick_size: 0.0000005, tick_value: 6.25,  exchange: "CME", settle: "3rd Wednesday" },
  CAD: { symbol: "6C",  name: "Canadian Dollar Futures",     contract_size: 100_000,    currency: "CAD", margin_est: 1500, tick_size: 0.00005,   tick_value: 5.00,  exchange: "CME", settle: "3rd Wednesday" },
  CHF: { symbol: "6S",  name: "Swiss Franc Futures",         contract_size: 125_000,    currency: "CHF", margin_est: 2100, tick_size: 0.0001,    tick_value: 12.50, exchange: "CME", settle: "3rd Wednesday" },
  AUD: { symbol: "6A",  name: "Australian Dollar Futures",   contract_size: 100_000,    currency: "AUD", margin_est: 1400, tick_size: 0.0001,    tick_value: 10.00, exchange: "CME", settle: "3rd Wednesday" },
  NZD: { symbol: "6N",  name: "New Zealand Dollar Futures",  contract_size: 100_000,    currency: "NZD", margin_est: 1300, tick_size: 0.0001,    tick_value: 10.00, exchange: "CME", settle: "3rd Wednesday" },
};

export const DEFAULT_CME_SPEC = CME_SPECS.MXN;

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
  white:      "#fff",
  black:      "#000",
  // Fonts
  fontUI:     "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:   "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;
