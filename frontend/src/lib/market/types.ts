export interface FxRateEntry {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
}

export interface FxNewsArticle {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  category: string;
}

export interface EconEvent {
  time: string;
  country: string;
  event: string;
  impact: "high" | "medium" | "low";
  actual: string | null;
  estimate: string | null;
  prev: string | null;
}

export interface RiskScore {
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH";
  newsCount24h: number;
  highImpact: number;
  mediumImpact: number;
}

// ── Institutional Risk Pulse ──────────────────────────────────────────────────

export type RiskRegime = "Low" | "Guarded" | "Elevated" | "High" | "Crisis";

export interface RiskFactor {
  id: string;
  label: string;
  source: string;
  value: number;
  display: string;
  zscore: number;        // clamped [-3, +3]
  impact: number;        // 0.0–1.0
  weight: number;
  contribution: number;  // weight × impact
  trend: "up" | "down" | "flat";
}

export interface RiskPulseSnapshot {
  score: number;               // 0.0–10.0
  regime: RiskRegime;
  factors: RiskFactor[];
  newsCount24h: number;
  highImpactEvents: number;
  mediumImpactEvents: number;
  quality: "LIVE" | "PARTIAL" | "STALE" | "FALLBACK";
  dataAge_ms: number;
  computedAt: number;
  sparkline: number[];         // last ≤20 scores
  deltaScore: number | null;   // change from previous snapshot
}

export interface PulseNewsItem {
  id: number;
  headline: string;
  source: string;
  url: string;
  datetime: number;
  tab: "geo" | "macro" | "cb";
}

export interface RiskInsight {
  summary: string;
  rationale: string;
  watchlist: string[];
  ai_assisted: boolean;
  generatedAt: number;
}
