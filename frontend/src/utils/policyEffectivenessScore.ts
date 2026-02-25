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
  components: {
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

  // Efficiency: tiered on spread_bps
  const efficiency =
    spread <= 3  ? 25 :
    spread <= 6  ? 20 :
    spread <= 10 ? 15 :
    spread <= 20 ? 8  : 0;

  // IFRS 9: forecast ≤ confirmed (20 points for compliance, 0 for violation)
  const ifrs9 = forecast <= confirmed ? 20 : 0;

  // Product/posture alignment
  const productScore = (() => {
    const posture = riskPosture.toUpperCase();
    if (product === "FWD" && posture === "CONSERVATIVE") return 15;
    if (product === "NDF" && (posture === "MODERATE" || posture === "AGGRESSIVE")) return 15;
    if (product === "FWD" && posture === "MODERATE") return 12;
    if (product === "NDF" && posture === "CONSERVATIVE") return 8;
    return 10;
  })();

  // Size accessibility (lower min = more accessible = higher score)
  const sizeAccess =
    minSize === 0       ? 10 :
    minSize <= 25000    ? 8  :
    minSize <= 100000   ? 6  :
    minSize <= 500000   ? 4  : 2;

  const score = coverage + efficiency + ifrs9 + productScore + sizeAccess;
  const badge: PolicyEffectivenessResult["badge"] =
    score >= 85 ? "INSTITUTIONAL" :
    score >= 70 ? "STRONG"        :
    score >= 50 ? "MODERATE"      : "BASIC";

  return {
    score,
    badge,
    components: { coverage, efficiency, ifrs9, product: productScore, sizeAccess },
  };
}

export function getEffectivenessColor(score: number, S: Record<string, string>): string {
  if (score >= 85) return S.cyan   ?? "#22d3ee";
  if (score >= 70) return S.pass   ?? "#4ade80";
  if (score >= 50) return S.amber  ?? "#fbbf24";
  return S.fail ?? "#f87171";
}
