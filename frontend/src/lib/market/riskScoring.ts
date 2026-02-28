/**
 * Pure risk scoring functions — deterministic, zero I/O.
 * Exported for use by the risk-pulse API route and unit tests.
 */

import type { RiskFactor, RiskPulseSnapshot, RiskRegime } from "./types";

// ── Calibrated baselines (2024-2026 market data) ──────────────────────────────
export const FACTOR_BASELINES = {
  vix:        { mean: 18.5, std: 5.5  },
  us10y:      { mean: 3.8,  std: 0.7  },
  dxy:        { mean: 103,  std: 4.0  },
  brent:      { mean: 78,   std: 9.0  },
  gold:       { mean: 2250, std: 210  },
  vix_vol:    { mean: 3.0,  std: 2.0  },  // realized stdev of VIX sample window
  news_score: { mean: 10,   std: 6.0  },  // weighted news + event count
} as const;

// ── Statistics helpers ────────────────────────────────────────────────────────

function rollingMean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function rollingStd(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

export function rollingStats(
  history: number[],
  baseline: { mean: number; std: number },
): { mean: number; std: number } {
  if (history.length < 3) return baseline;
  const m = rollingMean(history);
  const s = Math.max(rollingStd(history, m), baseline.std * 0.15);  // floor at 15%
  return { mean: m, std: s };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Impact functions ──────────────────────────────────────────────────────────

/**
 * Directional impact: positive z = higher stress.
 * z=0  → 0.25 (baseline stress)
 * z=+3 → 1.00 (max stress)
 * z≤-1 → 0.00 (calm)
 */
export function directionalImpact(z: number): number {
  return clamp((z + 1) / 4, 0, 1);
}

/**
 * Shock impact: absolute deviation — both sides signal stress.
 * z=0 → 0.00 (no shock)
 * z=3 → 1.00 (extreme shock)
 */
export function shockImpact(z: number): number {
  return clamp(Math.abs(z) / 3, 0, 1);
}

// ── Regime classification ─────────────────────────────────────────────────────

export function scoreToRegime(score: number): RiskRegime {
  if (score < 2) return "Low";
  if (score < 4) return "Guarded";
  if (score < 6) return "Elevated";
  if (score < 8) return "High";
  return "Crisis";
}

// ── Raw inputs type ───────────────────────────────────────────────────────────

export interface RawMacroInputs {
  vix:        number;
  us10y:      number;
  dxy:        number;
  brent:      number;
  gold:       number;
  vix_vol:    number;  // realized vol-of-VIX (or vix/20 proxy)
  news_score: number;  // newsCount24h×1 + highEvents×3 + medEvents×1.5
}

export interface FactorHistorySeries {
  vix:   number[];
  us10y: number[];
  dxy:   number[];
  brent: number[];
  gold:  number[];
}

// ── Factor definitions ────────────────────────────────────────────────────────

interface FactorDef {
  id:          string;
  label:       string;
  source:      string;
  weight:      number;
  getValue:    (inputs: RawMacroInputs) => number;
  getDisplay:  (value: number) => string;
  histKey:     keyof FactorHistorySeries | null;
  baselineKey: keyof typeof FACTOR_BASELINES;
  impactType:  "directional" | "shock";
}

const FACTOR_DEFS: FactorDef[] = [
  {
    id: "equity_stress", label: "EQUITY STRESS", source: "VIX",
    weight: 0.25, impactType: "directional",
    getValue:   (i) => i.vix,
    getDisplay: (v) => v.toFixed(1),
    histKey: "vix", baselineKey: "vix",
  },
  {
    id: "rates_stress", label: "RATES STRESS", source: "US 10Y",
    weight: 0.20, impactType: "directional",
    getValue:   (i) => i.us10y,
    getDisplay: (v) => v.toFixed(2) + "%",
    histKey: "us10y", baselineKey: "us10y",
  },
  {
    id: "usd_strength", label: "USD STRENGTH", source: "DXY",
    weight: 0.15, impactType: "directional",
    getValue:   (i) => i.dxy,
    getDisplay: (v) => v.toFixed(2),
    histKey: "dxy", baselineKey: "dxy",
  },
  {
    id: "vol_proxy", label: "VOL PROXY", source: "VIX σ",
    weight: 0.15, impactType: "directional",
    getValue:   (i) => i.vix_vol,
    getDisplay: (v) => v.toFixed(2),
    histKey: null, baselineKey: "vix_vol",
  },
  {
    id: "credit_risk", label: "CREDIT RISK", source: "GOLD",
    weight: 0.10, impactType: "directional",
    getValue:   (i) => i.gold,
    getDisplay: (v) => "$" + Math.round(v).toLocaleString("en-US"),
    histKey: "gold", baselineKey: "gold",
  },
  {
    id: "oil_shock", label: "OIL SHOCK", source: "BRENT",
    weight: 0.10, impactType: "shock",
    getValue:   (i) => i.brent,
    getDisplay: (v) => "$" + v.toFixed(1),
    histKey: "brent", baselineKey: "brent",
  },
  {
    id: "geo_news", label: "GEO / NEWS", source: "PRESS",
    weight: 0.05, impactType: "directional",
    getValue:   (i) => i.news_score,
    getDisplay: (v) => v.toFixed(0),
    histKey: null, baselineKey: "news_score",
  },
];

export { FACTOR_DEFS };

// ── Main scoring function ─────────────────────────────────────────────────────

export function computeRiskPulse(
  inputs: RawMacroInputs,
  history: FactorHistorySeries,
  prevScores: number[],
  opts: {
    newsCount24h:      number;
    highImpactEvents:  number;
    mediumImpactEvents: number;
    quality:           RiskPulseSnapshot["quality"];
    computedAt:        number;
    dataAge_ms:        number;
  },
  macroTrends: Partial<Record<string, "up" | "down" | "flat">>,
): RiskPulseSnapshot {
  const factors: RiskFactor[] = FACTOR_DEFS.map((def) => {
    const value     = def.getValue(inputs);
    const histArr   = def.histKey ? (history[def.histKey] ?? []) : [];
    const baseline  = FACTOR_BASELINES[def.baselineKey];
    const stats     = rollingStats(histArr, baseline);
    const rawZ      = (value - stats.mean) / (stats.std || baseline.std);
    const z         = clamp(rawZ, -3, 3);
    const impact    = def.impactType === "directional" ? directionalImpact(z) : shockImpact(z);
    const contribution = def.weight * impact;

    return {
      id:           def.id,
      label:        def.label,
      source:       def.source,
      value,
      display:      def.getDisplay(value),
      zscore:       parseFloat(z.toFixed(2)),
      impact:       parseFloat(impact.toFixed(3)),
      weight:       def.weight,
      contribution: parseFloat(contribution.toFixed(4)),
      trend:        macroTrends[def.source] ?? "flat",
    };
  });

  const scoreRaw = factors.reduce((s, f) => s + f.contribution, 0);
  const score    = parseFloat(clamp(scoreRaw * 10, 0, 10).toFixed(1));
  const regime   = scoreToRegime(score);

  const sparkline  = [...prevScores.slice(-19), score];
  const deltaScore =
    prevScores.length >= 1
      ? parseFloat((score - prevScores[prevScores.length - 1]).toFixed(1))
      : null;

  return {
    score,
    regime,
    factors,
    newsCount24h:       opts.newsCount24h,
    highImpactEvents:   opts.highImpactEvents,
    mediumImpactEvents: opts.mediumImpactEvents,
    quality:            opts.quality,
    dataAge_ms:         opts.dataAge_ms,
    computedAt:         opts.computedAt,
    sparkline,
    deltaScore,
  };
}
