/**
 * policyEffectivenessScore.ts — Deterministic 0–100 policy effectiveness score.
 *
 * Computed entirely from PolicyConfig fields — no API call needed.
 * Used on PresetCard and saved-policies cards.
 *
 * Scoring components (total = 100):
 *   Coverage   0–30  based on confirmed hedge ratio
 *   Efficiency 0–25  based on spread_bps (lower = better)
 *   IFRS 9     0–20  forecast ≤ confirmed compliance
 *   Product    0–15  product/posture alignment
 *   Access     0–10  min_trade_size accessibility
 */

import type { PolicyConfig } from "@/api/types";

export interface PolicyEffectivenessResult {
  score:    number;  // 0–100 integer
  badge:    "INSTITUTIONAL" | "STRONG" | "MODERATE" | "BASIC";
  grading:  'HEURISTIC';  // transparent label — score is rule-based, not ML
  components: {
    coverage:    { score: number; max: number; rationale: string };
    efficiency:  { score: number; max: number; rationale: string };
    ifrs9:       { score: number; max: number; rationale: string };
    product:     { score: number; max: number; rationale: string };
    sizeAccess:  { score: number; max: number; rationale: string };
  };
  /** @deprecated Use components.coverage.score etc. Kept for backward compat. */
  _legacyComponents: {
    coverage:    number;  // 0–30
    efficiency:  number;  // 0–25
    ifrs9:       number;  // 0–20
    product:     number;  // 0–15
    sizeAccess:  number;  // 0–10
  };
}

export function computeEffectivenessScore(
  config: PolicyConfig,
  riskPosture: string,
): PolicyEffectivenessResult {
  const confirmed = config.hedge_ratios?.confirmed ?? 0;
  const forecast  = config.hedge_ratios?.forecast  ?? 0;
  const spread    = config.cost_assumptions?.spread_bps ?? 999;
  const product   = config.execution_product ?? "NDF";
  const minSize   = config.min_trade_size_usd ?? 0;

  // Coverage: confirmed_ratio * 30 (linear, 0–30)
  const coverage = Math.round(confirmed * 30);
  const coverageRationale = confirmed >= 0.9
    ? `High coverage: ${Math.round(confirmed * 100)}% confirmed ratio provides strong protection`
    : confirmed >= 0.6
    ? `Moderate coverage: ${Math.round(confirmed * 100)}% confirmed ratio balances cost and protection`
    : `Low coverage: ${Math.round(confirmed * 100)}% confirmed ratio leaves significant open exposure`;

  // Efficiency: tiered on spread_bps
  const efficiency =
    spread <= 3  ? 25 :
    spread <= 6  ? 20 :
    spread <= 10 ? 15 :
    spread <= 20 ? 8  : 0;
  const efficiencyRationale =
    spread <= 3  ? `Institutional spread (${spread} bps) — interbank-grade execution`
    : spread <= 6  ? `Competitive spread (${spread} bps) — strong corporate terms`
    : spread <= 10 ? `Standard spread (${spread} bps) — typical mid-market cost`
    : spread <= 20 ? `Wide spread (${spread} bps) — higher execution cost reduces efficiency`
    : `Very wide spread (${spread} bps) — significant cost drag on hedge performance`;

  // IFRS 9: forecast ≤ confirmed (20 points for compliance, 0 for violation)
  const ifrs9 = forecast <= confirmed ? 20 : 0;
  const ifrs9Rationale = forecast <= confirmed
    ? `IFRS 9 compliant: forecast ratio (${Math.round(forecast * 100)}%) does not exceed confirmed (${Math.round(confirmed * 100)}%)`
    : `IFRS 9 violation: forecast ratio (${Math.round(forecast * 100)}%) exceeds confirmed (${Math.round(confirmed * 100)}%) — hedge effectiveness testing will fail`;

  // Product/posture alignment
  const productScore = (() => {
    const posture = riskPosture.toUpperCase();
    if (product === "FWD" && posture === "CONSERVATIVE") return 15;
    if (product === "NDF" && (posture === "MODERATE" || posture === "AGGRESSIVE")) return 15;
    if (product === "FWD" && posture === "MODERATE") return 12;
    if (product === "NDF" && posture === "CONSERVATIVE") return 8;
    return 10;
  })();
  const productRationale = productScore >= 15
    ? `Strong alignment: ${product} product matches ${riskPosture.toLowerCase()} risk posture`
    : productScore >= 12
    ? `Good alignment: ${product} product is acceptable for ${riskPosture.toLowerCase()} posture`
    : `Weak alignment: ${product} product may not be optimal for ${riskPosture.toLowerCase()} posture`;

  // Size accessibility (lower min = more accessible = higher score)
  const sizeAccess =
    minSize === 0       ? 10 :
    minSize <= 25000    ? 8  :
    minSize <= 100000   ? 6  :
    minSize <= 500000   ? 4  : 2;
  const sizeRationale =
    minSize === 0       ? `No minimum trade size — accessible to all company sizes`
    : minSize <= 25000  ? `Low minimum ($${minSize.toLocaleString()}) — accessible to most companies`
    : minSize <= 100000 ? `Moderate minimum ($${minSize.toLocaleString()}) — mid-market and above`
    : minSize <= 500000 ? `High minimum ($${minSize.toLocaleString()}) — institutional only`
    : `Very high minimum ($${minSize.toLocaleString()}) — large institutional only`;

  const score = coverage + efficiency + ifrs9 + productScore + sizeAccess;
  const badge: PolicyEffectivenessResult["badge"] =
    score >= 85 ? "INSTITUTIONAL" :
    score >= 70 ? "STRONG"        :
    score >= 50 ? "MODERATE"      : "BASIC";

  return {
    score,
    badge,
    grading: 'HEURISTIC',
    components: {
      coverage:   { score: coverage,      max: 30, rationale: coverageRationale },
      efficiency: { score: efficiency,    max: 25, rationale: efficiencyRationale },
      ifrs9:      { score: ifrs9,         max: 20, rationale: ifrs9Rationale },
      product:    { score: productScore,  max: 15, rationale: productRationale },
      sizeAccess: { score: sizeAccess,    max: 10, rationale: sizeRationale },
    },
    _legacyComponents: { coverage, efficiency, ifrs9, product: productScore, sizeAccess },
  };
}

export function getEffectivenessColor(score: number, S: Record<string, string>): string {
  if (score >= 85) return S.cyan   ?? "#22d3ee";
  if (score >= 70) return S.pass   ?? "#4ade80";
  if (score >= 50) return S.amber  ?? "#fbbf24";
  return S.fail ?? "#f87171";
}
