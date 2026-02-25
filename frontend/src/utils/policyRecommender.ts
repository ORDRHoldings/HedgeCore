/**
 * policyRecommender.ts — Deterministic rule-based policy recommender.
 *
 * NO ML. Rules score each template based on position characteristics.
 * Returns the best-matching policy with a confidence level and reason.
 *
 * Architecture constraint (v1): no auto-learning, no stateful logic.
 */

import type { PolicyTemplate } from "@/api/policyClient";

// EM currencies that require NDF instruments
const EM_NDF_CURRENCIES = new Set([
  "MXN", "BRL", "INR", "KRW", "IDR", "PHP", "THB",
  "TRY", "ZAR", "CLP", "COP", "PEN", "ARS", "EGP",
]);

export interface PolicyRecommendation {
  templateId:  string;
  shortName:   string;
  name:        string;
  reason:      string;
  confidence:  "HIGH" | "MEDIUM" | "LOW";
}

export function recommendPolicyForPosition(
  position: {
    currency?:        string;
    amount?:          number;
    status?:          string;
    execution_status?: string;
  },
  templates:     PolicyTemplate[],
  favoriteIds:   Set<string>,
): PolicyRecommendation | null {
  if (!templates.length) return null;

  const currency   = (position.currency ?? "").toUpperCase();
  const amount     = position.amount ?? 0;
  const isEM       = EM_NDF_CURRENCIES.has(currency);
  const isLarge    = amount > 1_000_000;
  const isForecast = (position.status ?? "").toUpperCase() === "FORECAST";

  const scored = templates.map(t => {
    let score = 0;
    const config   = t.config;
    const conf     = config?.hedge_ratios?.confirmed ?? 0;
    const fcst     = config?.hedge_ratios?.forecast  ?? 0;
    const spread   = config?.cost_assumptions?.spread_bps ?? 999;
    const product  = config?.execution_product ?? "NDF";
    const minSize  = config?.min_trade_size_usd ?? 0;

    // Rule 1: Currency / instrument matching
    if (isEM  && product === "NDF") score += 30;
    if (!isEM && product === "FWD") score += 20;

    // Rule 2: Trade size accessibility
    if (isLarge  && minSize >= 100_000) score += 10;
    if (!isLarge && minSize <= 50_000)  score += 15;
    if (amount > 0 && amount >= minSize) score += 5;

    // Rule 3: Forecast flow handling
    if (isForecast && fcst >= 0.5) score += 20;
    if (!isForecast && conf >= 0.9) score += 10;

    // Rule 4: IFRS 9 compliance bonus
    if (fcst <= conf) score += 10;

    // Rule 5: Cost efficiency
    if (spread <= 5)       score += 8;
    else if (spread <= 10) score += 4;

    // Rule 6: User's favorites get a significant boost
    if (favoriteIds.has(t.id)) score += 25;

    return { template: t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;

  const confidence: PolicyRecommendation["confidence"] =
    best.score >= 60 ? "HIGH"   :
    best.score >= 40 ? "MEDIUM" : "LOW";

  const reason = buildReason(best.template, isEM, isLarge, isForecast, currency);

  return {
    templateId: best.template.id,
    shortName:  best.template.short_name,
    name:       best.template.name,
    reason,
    confidence,
  };
}

function buildReason(
  template: PolicyTemplate,
  isEM:       boolean,
  isLarge:    boolean,
  isForecast: boolean,
  currency:   string,
): string {
  const parts: string[] = [];
  const product = template.config?.execution_product ?? "NDF";
  const conf    = Math.round((template.config?.hedge_ratios?.confirmed ?? 0) * 100);

  if (isEM && product === "NDF") parts.push(`NDF product matches ${currency} settlement requirements`);
  if (!isEM && product === "FWD") parts.push(`FWD instrument optimal for ${currency} delivery`);
  if (isLarge) parts.push(`min size aligned to large-notional trade`);
  if (isForecast) parts.push(`${conf}% confirmed coverage for forecast exposure`);
  if (parts.length === 0) parts.push(`best coverage/cost ratio for ${currency} exposure`);

  return parts.slice(0, 2).join("; ");
}
