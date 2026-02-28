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
