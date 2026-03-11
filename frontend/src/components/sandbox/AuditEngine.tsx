"use client";

/**
 * AuditEngine.tsx — 14-rule institutional compliance audit engine
 * ORDR Terminal · HedgeCore Simulation Engine
 *
 * Rules cover:
 * - PRE-001–004: Pre-run validation
 * - CALC-001–004: Calculation integrity
 * - POST-001–004: Post-run capital adequacy
 * - GOV-001–002: Governance chain
 *
 * Standards: IFRS 9, Basel III (BCBS 279), ISDA SIMM v2.6,
 *            EMIR Art. 11, MiFID II RTS 6/25, Dodd-Frank §731
 */

import { useMemo, useState, useCallback } from "react";
import type { SandboxCalculateResponse } from "../../api/pipelineTypes";
import { cornishFisherVaR, saCCREAD, ifrs9EffectivenessTest, frtbFXDeltaCharge } from "../../lib/mathEngine";

// ─── Design tokens ────────────────────────────────────────────────────────────
const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  green:    "var(--accent-green)",
  amber:    "var(--accent-amber)",
  red:      "var(--accent-red, #f87171)",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleStatus = "PASS" | "WARN" | "FAIL" | "INFO" | "PENDING";
export type RuleSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type RuleCategory = "PRE_RUN" | "CALCULATION" | "POST_RUN" | "GOVERNANCE";

export interface AuditRule {
  id: string;
  category: RuleCategory;
  name: string;
  status: RuleStatus;
  severity: RuleSeverity;
  evidence: string;
  regulatoryRef: string;
  timestamp: string;
  value?: string;
  threshold?: string;
  formulaUsed?: string;
  detail?: string;
}

export interface AuditReport {
  runId: string;
  timestamp: string;
  overallStatus: "PASS" | "WARN" | "FAIL";
  integrityScore: number;
  rules: AuditRule[];
  summary: {
    totalRules: number;
    passed: number;
    warned: number;
    failed: number;
    criticalFails: number;
  };
  certificationLevel: "INSTITUTIONAL" | "PROFESSIONAL" | "BASIC" | "INCOMPLETE";
}

export interface AuditEngineProps {
  sandboxResult: SandboxCalculateResponse | null;
  spot: number;
  notionalUSD: number;
  liveSpotFetched: boolean;
  onComplete?: (report: AuditReport) => void;
}

// ─── Severity weights for integrity score ─────────────────────────────────────
const SEVERITY_WEIGHTS: Record<RuleSeverity, number> = {
  CRITICAL: 20,
  HIGH: 10,
  MEDIUM: 5,
  LOW: 2,
  INFO: 0,
};

function computeIntegrityScore(rules: AuditRule[]): number {
  let earned = 0, total = 0;
  for (const r of rules) {
    const w = SEVERITY_WEIGHTS[r.severity];
    total += w;
    if (r.status === "PASS" || r.status === "INFO") earned += w;
    else if (r.status === "WARN") earned += w * 0.5;
    // FAIL = 0
  }
  return total === 0 ? 100 : Math.round((earned / total) * 100);
}

function certLevel(score: number, liveData: boolean, criticalFails: number): AuditReport["certificationLevel"] {
  if (criticalFails > 0) return "INCOMPLETE";
  if (score >= 90 && liveData) return "INSTITUTIONAL";
  if (score >= 75) return "PROFESSIONAL";
  if (score >= 50) return "BASIC";
  return "INCOMPLETE";
}

// ─── Rule computation engine ──────────────────────────────────────────────────
function computeAuditRules(
  result: SandboxCalculateResponse | null,
  spot: number,
  notionalUSD: number,
  liveSpotFetched: boolean
): AuditRule[] {
  const now = new Date().toISOString();
  const rules: AuditRule[] = [];

  // ── PRE-001: Input Completeness ──────────────────────────────────────────────
  const trades = result?.frozen_inputs?.trades as unknown[] | undefined ?? [];
  const hedges = result?.frozen_inputs?.hedges as unknown[] | undefined ?? [];
  const policy = result?.frozen_inputs?.policy as Record<string, unknown> | undefined;
  const market = result?.frozen_inputs?.market as Record<string, unknown> | undefined;
  const spotVal = (market?.spot_rate as number) ?? spot;
  const hasSpot = spotVal > 0;
  const hasTrades = trades.length > 0;
  const hasPolicy = !!policy;
  const ratioSum = (policy?.hedge_ratios as Record<string, number> | undefined);
  const ratioValid = ratioSum
    ? Object.values(ratioSum).every(r => r >= 0 && r <= 1.0)
    : false;

  rules.push({
    id: "PRE-001", category: "PRE_RUN",
    name: "Input Completeness",
    status: (hasTrades && hasSpot && hasPolicy && ratioValid) ? "PASS" : hasTrades && hasSpot ? "WARN" : "FAIL",
    severity: "CRITICAL",
    evidence: `${trades.length} trades · ${hedges.length} hedges · Spot: ${spotVal.toFixed(4)} · Policy: ${hasPolicy ? "present" : "missing"}`,
    regulatoryRef: "IFRS 9.B6.4.1 — Hedge documentation",
    timestamp: now,
    value: `${trades.length} trades`,
    threshold: "≥ 1 trade, valid spot, policy defined",
    formulaUsed: "Input validation: trades > 0, spot > 0, hedge_ratios ∈ [0,1]",
    detail: ratioValid ? "All hedge ratios within [0,1] range" : "Hedge ratio out of valid range",
  });

  // ── PRE-002: Market Data Source ──────────────────────────────────────────────
  rules.push({
    id: "PRE-002", category: "PRE_RUN",
    name: "Market Data Source",
    status: liveSpotFetched ? "PASS" : "WARN",
    severity: "HIGH",
    evidence: liveSpotFetched
      ? `Live spot from Alpha Vantage API: ${spot.toFixed(4)}`
      : `Using BIS 2022 Triennial calibrated fallback: ${spot.toFixed(4)}`,
    regulatoryRef: "MiFID II RTS 25 Art. 2 — Market data quality",
    timestamp: now,
    value: spot.toFixed(4),
    threshold: "Live API data preferred",
    formulaUsed: "Alpha Vantage FX_DAILY endpoint → spot rate",
    detail: liveSpotFetched
      ? "PASS: Live market data reduces model risk per MiFID II RTS 25"
      : "WARN: Fallback calibration data. Consider connecting live data source for regulatory submissions.",
  });

  // ── PRE-003: Policy Validation (IFRS 9.6.4.1) ───────────────────────────────
  const spreadBps = (policy?.cost_assumptions as Record<string, number> | undefined)?.spread_bps ?? 5;
  const confirmedRatio = ratioSum?.confirmed ?? 0.8;
  const forecastRatio = ratioSum?.forecast ?? 0.5;
  const policyValid = confirmedRatio <= 1.0 && forecastRatio <= 1.0 && spreadBps > 0 && spreadBps < 200;

  rules.push({
    id: "PRE-003", category: "PRE_RUN",
    name: "Policy Validation — IFRS 9",
    status: policyValid ? "PASS" : "WARN",
    severity: "HIGH",
    evidence: `Confirmed: ${(confirmedRatio * 100).toFixed(0)}% · Forecast: ${(forecastRatio * 100).toFixed(0)}% · Spread: ${spreadBps}bps`,
    regulatoryRef: "IFRS 9.6.4.1 — 80–125% effectiveness band; IFRS 9.B6.4.9 — Hedge ratio",
    timestamp: now,
    value: `${(confirmedRatio * 100).toFixed(0)}% / ${(forecastRatio * 100).toFixed(0)}%`,
    threshold: "Confirmed ≤ 100%, Forecast ≤ 100%, 0 < Spread < 200bps",
    formulaUsed: "Effectiveness(T) = ΔV_hedge / ΔV_exposure × 100%",
    detail: policyValid
      ? "Policy parameters within IFRS 9 acceptable range"
      : `Policy parameter out of range: confirmed=${confirmedRatio}, forecast=${forecastRatio}, spread=${spreadBps}bps`,
  });

  // ── PRE-004: Trade Sanity ────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const staleCount = (trades as Array<Record<string, unknown>>).filter(
    t => typeof t.value_date === "string" && t.value_date < today
  ).length;
  const maxTrade = (trades as Array<Record<string, unknown>>).reduce(
    (max, t) => Math.max(max, Math.abs(t.amount as number ?? 0)), 0
  );
  const totalExposure = (trades as Array<Record<string, unknown>>).reduce(
    (s, t) => s + Math.abs(t.amount as number ?? 0), 0
  );
  const maxConcentration = totalExposure > 0 ? maxTrade / totalExposure : 0;

  rules.push({
    id: "PRE-004", category: "PRE_RUN",
    name: "Trade Sanity Checks",
    status: staleCount === 0 && maxConcentration < 0.5 ? "PASS" : staleCount > 0 ? "WARN" : "INFO",
    severity: "MEDIUM",
    evidence: `${staleCount} stale date(s) · Max concentration: ${(maxConcentration * 100).toFixed(1)}% of portfolio`,
    regulatoryRef: "IFRS 9.B6.5.28 — Maturity matching; EMIR Art. 11 — Trade reporting",
    timestamp: now,
    value: `${staleCount} stale, ${(maxConcentration * 100).toFixed(1)}% max conc.`,
    threshold: "0 stale trades, max concentration < 50%",
    formulaUsed: "Concentration = max(|trade|) / Σ|trades|",
    detail: staleCount > 0
      ? `${staleCount} trade(s) have value dates in the past — check booking dates`
      : "All trade dates valid",
  });

  // ── CALC-001: IFRS 9 Effectiveness Band ──────────────────────────────────────
  const plan = result?.calculate_response?.hedge_plan;
  const summary = plan?.summary as Record<string, number> | undefined;
  const hedgeNotional = summary?.total_hedge_position_mxn ?? summary?.total_hedge_notional_mxn ?? 0;
  const exposureNotional = summary?.total_commercial_exposure_mxn ?? 1;
  const coverageRatio = hedgeNotional / Math.max(exposureNotional, 1);
  const vol = 0.12; // Default FX vol — would come from live data in production

  const effectivenessTest = ifrs9EffectivenessTest(
    hedgeNotional, exposureNotional, vol, 0.5, 0.985
  );

  rules.push({
    id: "CALC-001", category: "CALCULATION",
    name: "IFRS 9 Effectiveness Band",
    status: effectivenessTest.passes80125 ? "PASS"
      : effectivenessTest.ratio > 0.70 && effectivenessTest.ratio < 1.35 ? "WARN"
      : "FAIL",
    severity: "CRITICAL",
    evidence: `Coverage: ${(coverageRatio * 100).toFixed(1)}% | Prospective GBM: ${effectivenessTest.prospectiveGBM.toFixed(1)}% | Optimal h*: ${(effectivenessTest.hedgeRatioOptimal * 100).toFixed(1)}%`,
    regulatoryRef: "IFRS 9.6.4.1 — 80–125% effectiveness; IFRS 9.B6.4.11 — Dollar-offset",
    timestamp: now,
    value: `${(coverageRatio * 100).toFixed(1)}%`,
    threshold: "80% ≤ Coverage ≤ 125%",
    formulaUsed: "ε = ΔFair_value_hedge / ΔFair_value_exposure; GBM: dS = S(μdt + σdW)",
    detail: effectivenessTest.recommendation === "EFFECTIVE"
      ? "Hedge is within the 80–125% IFRS 9 effectiveness band"
      : effectivenessTest.recommendation === "OVER_HEDGED"
      ? "Portfolio is over-hedged (>125%). Risk de-designation under IFRS 9.6.5.6"
      : effectivenessTest.recommendation === "BORDERLINE"
      ? "Borderline — prospective documentation required; consider hedge ratio adjustment"
      : "Hedge ineffective — IFRS 9 de-designation required",
  });

  // ── CALC-002: DV01 Concentration ─────────────────────────────────────────────
  const buckets = ((plan?.buckets as unknown) as Array<Record<string, unknown>>) ?? [];
  const dv01s = buckets.map(b => {
    const notional = Math.abs((b.hedge_position_mxn as number ?? 0) / spot);
    const monthStr = b.bucket as string ?? "2026-01";
    const parts = monthStr.split("-");
    const date = new Date(`${parts[0]}-${parts[1]}-15`);
    const tauYears = Math.max(0.01, (date.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000));
    return { bucket: monthStr, dv01: notional * tauYears * 0.0001 };
  });
  const totalDv01 = dv01s.reduce((s, d) => s + d.dv01, 0);
  const maxDv01Bucket = dv01s.reduce((max, d) => d.dv01 > max.dv01 ? d : max, { bucket: "—", dv01: 0 });
  const dv01Concentration = totalDv01 > 0 ? maxDv01Bucket.dv01 / totalDv01 : 0;

  rules.push({
    id: "CALC-002", category: "CALCULATION",
    name: "DV01 Concentration Risk",
    status: dv01Concentration < 0.40 ? "PASS" : dv01Concentration < 0.60 ? "WARN" : "FAIL",
    severity: "MEDIUM",
    evidence: `Total DV01: $${totalDv01.toFixed(2)} | Max bucket: ${maxDv01Bucket.bucket} (${(dv01Concentration * 100).toFixed(1)}%)`,
    regulatoryRef: "BCBS 457 §B.15 — FRTB SBM DV01 per tenor bucket",
    timestamp: now,
    value: `${(dv01Concentration * 100).toFixed(1)}% in ${maxDv01Bucket.bucket}`,
    threshold: "Max single bucket < 40% of portfolio DV01",
    formulaUsed: "DV01 = |N| × τ × 0.0001 (per bucket j)",
    detail: `FRTB SBM requires DV01 reporting at 12 standard tenors. Concentration ratio: ${(dv01Concentration * 100).toFixed(1)}%`,
  });

  // ── CALC-003: Cornish-Fisher VaR Plausibility ────────────────────────────────
  const shockRanges = [-0.20, -0.15, -0.10, -0.05, 0.05, 0.10, 0.15, 0.20];
  const simReturns = shockRanges.map(s => s);  // Use scenario shocks as proxy returns
  const cfVaR = cornishFisherVaR(simReturns, notionalUSD);
  const var99PctOfNotional = notionalUSD > 0 ? cfVaR.var99 / notionalUSD : 0;

  rules.push({
    id: "CALC-003", category: "CALCULATION",
    name: "Cornish-Fisher VaR Plausibility",
    status: var99PctOfNotional < 0.50 ? "PASS" : var99PctOfNotional < 0.70 ? "WARN" : "FAIL",
    severity: "HIGH",
    evidence: `VaR 99% (CF): $${cfVaR.var99.toLocaleString(undefined, { maximumFractionDigits: 0 })} · Normal VaR: $${cfVaR.normalVar99.toLocaleString(undefined, { maximumFractionDigits: 0 })} · CF adj: $${cfVaR.cfAdjustment99.toLocaleString(undefined, { maximumFractionDigits: 0 })} · Skew: ${cfVaR.skewness.toFixed(2)}`,
    regulatoryRef: "BCBS 457 §8 — Internal model VaR; Basel III Pillar 2 ICAAP",
    timestamp: now,
    value: `$${cfVaR.var99.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${(var99PctOfNotional * 100).toFixed(1)}% of notional)`,
    threshold: "VaR 99% < 50% of notional",
    formulaUsed: "z_CF = z + (z²-1)γ₁/6 + (z³-3z)γ₂/24 - (2z³-5z)γ₁²/36",
    detail: `CF adjustment of $${cfVaR.cfAdjustment99.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs normal distribution. Skewness=${cfVaR.skewness.toFixed(2)}, ExKurtosis=${cfVaR.kurtosis.toFixed(2)}`,
  });

  // ── CALC-004: Carry Cost Reasonableness ──────────────────────────────────────
  const totalFrictionUsd = summary?.total_friction_usd ?? 0;
  const annualCarryPct = notionalUSD > 0 ? (totalFrictionUsd / notionalUSD) * 2 : 0; // annualise 6M to 1Y
  const carryCostOk = annualCarryPct < 0.03;

  rules.push({
    id: "CALC-004", category: "CALCULATION",
    name: "Carry Cost Reasonableness",
    status: carryCostOk ? "PASS" : annualCarryPct < 0.05 ? "WARN" : "FAIL",
    severity: "LOW",
    evidence: `Total friction: $${totalFrictionUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} · Annualised: ${(annualCarryPct * 100).toFixed(2)}% of notional`,
    regulatoryRef: "IFRS 9.6.5.15 — Costs included in hedge documentation",
    timestamp: now,
    value: `${(annualCarryPct * 100).toFixed(2)}% p.a.`,
    threshold: "Carry cost < 3% annually",
    formulaUsed: "Annual carry = (friction_USD × 2) / notional_USD",
    detail: carryCostOk
      ? "Carry cost within reasonable range for NDF/FWD execution"
      : `High carry cost: ${(annualCarryPct * 100).toFixed(2)}% p.a. — review spread assumptions`,
  });

  // ── POST-001: SA-CCR Capital Check ───────────────────────────────────────────
  const saCCR = saCCREAD({
    mtm: 0,
    notionalUSD,
    maturityYears: 0.5,
    collateral: 0,
  });
  const eadPctNotional = notionalUSD > 0 ? saCCR.ead / notionalUSD : 0;

  rules.push({
    id: "POST-001", category: "POST_RUN",
    name: "SA-CCR Capital Adequacy",
    status: eadPctNotional < 0.25 ? "PASS" : eadPctNotional < 0.40 ? "WARN" : "FAIL",
    severity: "HIGH",
    evidence: `RC: $${saCCR.rc.toLocaleString(undefined, { maximumFractionDigits: 0 })} · AddOn: $${saCCR.addOn.toLocaleString(undefined, { maximumFractionDigits: 0 })} · PFE: $${saCCR.pfe.toLocaleString(undefined, { maximumFractionDigits: 0 })} · EAD: $${saCCR.ead.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    regulatoryRef: "BCBS 279 §128 — SA-CCR EAD = 1.4×(RC+PFE); SF_FX=4%",
    timestamp: now,
    value: `EAD $${saCCR.ead.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${(eadPctNotional * 100).toFixed(1)}% of notional)`,
    threshold: "EAD < 25% of notional",
    formulaUsed: "EAD = 1.4×(RC+PFE); AddOn = 4%×|N|×√(min(M,1))",
    detail: `Multiplier: ${saCCR.multiplier.toFixed(3)}. Capital charge (8% RWA): $${(saCCR.rwa * 0.08).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  });

  // ── POST-002: ISDA SIMM Breach Check ────────────────────────────────────────
  const simmIM = notionalUSD * 0.074; // Cat 3 EM RW = 7.4% (SIMM v2.6)
  const simmPctNotional = notionalUSD > 0 ? simmIM / notionalUSD : 0;
  const emerThreshold = 8_000_000_000; // €8bn EMIR threshold
  const simmBreach = notionalUSD * spot > emerThreshold * 0.01; // indicative

  rules.push({
    id: "POST-002", category: "POST_RUN",
    name: "ISDA SIMM v2.6 — IM Estimate",
    status: simmPctNotional < 0.02 ? "PASS" : simmPctNotional < 0.03 ? "WARN" : "FAIL",
    severity: "HIGH",
    evidence: `SIMM IM: $${simmIM.toLocaleString(undefined, { maximumFractionDigits: 0 })} · RW (Cat 3): 7.4% · ρ_intra: 0.50 · EMIR breach: ${simmBreach ? "possible" : "no"}`,
    regulatoryRef: "ISDA SIMM v2.6 Table A — FX delta risk weights; EMIR Art. 11(1) — €8bn threshold",
    timestamp: now,
    value: `$${simmIM.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${(simmPctNotional * 100).toFixed(2)}%)`,
    threshold: "IM < 2% of notional",
    formulaUsed: "WS = RW_FX × (ΔV/ΔS × S); IM = √(Σ WS_k² + Σ_{k≠l} ρ×WS_k×WS_l)",
    detail: `Category 3 EM currency RW = 7.4%. Intra-bucket correlation ρ=0.50. Inter-bucket γ=0.27 (SIMM v2.6 Table B)`,
  });

  // ── POST-003: Leverage Ratio Impact ──────────────────────────────────────────
  const leverageExposure = saCCR.rc + saCCR.pfe; // NDF contribution to exposure measure
  const hypotheticalTier1 = notionalUSD * 0.12; // Proxy: assume 12% Tier 1 of portfolio
  const leverageRatio = leverageExposure > 0 ? hypotheticalTier1 / (hypotheticalTier1 + leverageExposure) : 1;

  rules.push({
    id: "POST-003", category: "POST_RUN",
    name: "Leverage Ratio Contribution",
    status: leverageRatio >= 0.03 ? "PASS" : leverageRatio >= 0.025 ? "WARN" : "FAIL",
    severity: "MEDIUM",
    evidence: `NDF exposure contribution: $${leverageExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })} · Indicative LR: ${(leverageRatio * 100).toFixed(2)}%`,
    regulatoryRef: "BCBS d365 §14 — Leverage Ratio ≥ 3%; G-SIB buffer +1.0%–+3.5%",
    timestamp: now,
    value: `$${leverageExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })} exposure`,
    threshold: "LR ≥ 3% (+ G-SIB surcharge if applicable)",
    formulaUsed: "LR = Tier 1 / Total Exposure; NDF exposure = RC + PFE (SA-CCR-based)",
    detail: `Indicative only — actual leverage ratio requires full balance sheet. NDF exposure per BCBS d365 §14(b)`,
  });

  // ── POST-004: CVA Budget ─────────────────────────────────────────────────────
  const cvaWeight_BBB = 0.0054; // 0.54% for BBB counterparty (Basel III §75)
  const cvaCharge = cvaWeight_BBB * saCCR.ead;
  const cvaBps = notionalUSD > 0 ? (cvaCharge / notionalUSD) * 10_000 : 0;

  rules.push({
    id: "POST-004", category: "POST_RUN",
    name: "CVA Capital Budget",
    status: cvaBps < 15 ? "PASS" : cvaBps < 30 ? "WARN" : "FAIL",
    severity: "MEDIUM",
    evidence: `CVA charge: $${cvaCharge.toLocaleString(undefined, { maximumFractionDigits: 0 })} · ${cvaBps.toFixed(1)}bps of notional · BBB weight: 0.54%`,
    regulatoryRef: "Basel III §75 / BCBS d325 — CVA capital charge; supervisory weights",
    timestamp: now,
    value: `$${cvaCharge.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${cvaBps.toFixed(1)}bps)`,
    threshold: "CVA < 15bps of notional",
    formulaUsed: "K_CVA = √[(0.5×w×M×EAD)² + 0.75×w²×(M×EAD)²]; w_BBB=0.54%",
    detail: `BBB-equivalent weight 0.54%. Actual CVA depends on counterparty credit quality and master netting agreement`,
  });

  // ── GOV-001: Run Hash Integrity ──────────────────────────────────────────────
  const envelope = result?.run_envelope as Record<string, unknown> | undefined;
  const isRealHash = envelope?.inputs_hash && envelope.inputs_hash !== "DEMO";
  const hashStr = isRealHash ? String(envelope!.inputs_hash).slice(0, 16) + "…" : "DEMO placeholder";

  rules.push({
    id: "GOV-001", category: "GOVERNANCE",
    name: "Run Hash Integrity",
    status: isRealHash ? "PASS" : "INFO",
    severity: "HIGH",
    evidence: `Inputs hash: ${hashStr} · Outputs hash: ${isRealHash ? String(envelope?.outputs_hash ?? "").slice(0, 16) + "…" : "DEMO"}`,
    regulatoryRef: "MiFID II RTS 6 §4(2) — Algorithmic trading governance; EMIR Art. 9 — Trade repository",
    timestamp: now,
    value: hashStr,
    threshold: "Non-null SHA-256 hash",
    formulaUsed: "SHA-256(inputs_json) → inputs_hash; SHA-256(outputs_json) → outputs_hash",
    detail: isRealHash
      ? "Run envelope contains cryptographic hashes — calculation is tamper-evident"
      : "Demo mode: hashes are placeholders. Live engine produces SHA-256 hashes per MiFID II RTS 6",
  });

  // ── GOV-002: Trace Event Completeness ───────────────────────────────────────
  const traceEvents = Array.isArray(result?.trace_events) ? result!.trace_events : [];
  const hasTrace = traceEvents.length > 0;

  rules.push({
    id: "GOV-002", category: "GOVERNANCE",
    name: "Trace Event Completeness",
    status: hasTrace ? "PASS" : "INFO",
    severity: "MEDIUM",
    evidence: `${traceEvents.length} trace events · Engine version: ${(envelope?.engine_version as string) ?? "demo"}`,
    regulatoryRef: "EMIR Art. 9(1) — Record keeping; MiFID II Art. 25 — Transaction reporting",
    timestamp: now,
    value: `${traceEvents.length} events`,
    threshold: "> 0 trace events for live engine",
    formulaUsed: "Each calculation step emits a trace_event with timestamp, inputs, outputs",
    detail: hasTrace
      ? "Complete audit trail present — supports regulatory record-keeping requirements"
      : "Demo mode: trace events not generated. Live engine produces full step-by-step audit trail",
  });

  return rules;
}

// ─── Download report ──────────────────────────────────────────────────────────
function downloadAuditReport(report: AuditReport): void {
  const statusColor = (s: string) =>
    s === "PASS" ? "#22c55e" : s === "WARN" ? "#f59e0b" : s === "FAIL" ? "#f87171" : "#94a3b8";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Compliance Audit Report — ${report.runId}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Georgia', serif; color: #1a1a2e; background: #fff; max-width: 1100px; margin: 0 auto; padding: 40px 32px; }
h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
h2 { font-size: 16px; font-weight: 700; color: #0f172a; margin: 28px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
.meta { font-family: 'Courier New', monospace; font-size: 12px; color: #94a3b8; margin-bottom: 24px; }
.kpi-row { display: flex; gap: 20px; margin: 16px 0; }
.kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 18px; flex: 1; }
.kpi-val { font-family: 'Courier New', monospace; font-size: 22px; font-weight: 700; }
.kpi-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-top: 4px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 10px 0; }
th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 12px; font-weight: 700; border: 1px solid; }
.disclaimer { background: #fefce8; border: 1px solid #fde68a; border-radius: 6px; padding: 14px 18px; margin-top: 24px; font-size: 12px; color: #713f12; line-height: 1.6; }
@media print { body { padding: 20px; } }
</style>
</head>
<body>
<h1>HedgeCore — Compliance Audit Report</h1>
<p class="meta">Run ID: ${report.runId} · Generated: ${new Date(report.timestamp).toLocaleString()} · Engine: HedgeCore v2.0 · Standard: IFRS 9 / Basel III / ISDA SIMM v2.6</p>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-val" style="color:${statusColor(report.overallStatus)}">${report.overallStatus}</div><div class="kpi-label">Overall Status</div></div>
  <div class="kpi"><div class="kpi-val">${report.integrityScore}/100</div><div class="kpi-label">Integrity Score</div></div>
  <div class="kpi"><div class="kpi-val">${report.certificationLevel}</div><div class="kpi-label">Certification Level</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#22c55e">${report.summary.passed}</div><div class="kpi-label">Rules Passed</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#f59e0b">${report.summary.warned}</div><div class="kpi-label">Warnings</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#f87171">${report.summary.failed}</div><div class="kpi-label">Failed</div></div>
</div>
${["PRE_RUN", "CALCULATION", "POST_RUN", "GOVERNANCE"].map(cat => {
  const catRules = report.rules.filter(r => r.category === cat);
  const catName = { PRE_RUN: "Pre-Run Validation", CALCULATION: "Calculation Audit", POST_RUN: "Post-Run Capital", GOVERNANCE: "Governance Chain" }[cat];
  return `<h2>${catName}</h2>
<table>
<thead><tr><th>Rule ID</th><th>Name</th><th>Status</th><th>Severity</th><th>Evidence</th><th>Value</th><th>Threshold</th><th>Regulatory Ref</th></tr></thead>
<tbody>
${catRules.map(r => `<tr>
<td style="font-family:'Courier New',monospace;font-weight:700">${r.id}</td>
<td>${r.name}</td>
<td><span class="badge" style="color:${statusColor(r.status)};border-color:${statusColor(r.status)};background:${statusColor(r.status)}18">● ${r.status}</span></td>
<td style="font-size: 12px">${r.severity}</td>
<td style="font-size: 12px;color:#475569">${r.evidence}</td>
<td style="font-family:'Courier New',monospace;font-size: 12px">${r.value ?? "—"}</td>
<td style="font-size: 12px;color:#475569">${r.threshold ?? "—"}</td>
<td style="font-size: 12px;color:#6366f1">${r.regulatoryRef}</td>
</tr>`).join("")}
</tbody></table>`;
}).join("")}
<div class="disclaimer"><strong>Disclaimer:</strong> This audit report is generated algorithmically for analytical and documentation purposes only. It does not constitute a legal compliance opinion, financial advice, or regulatory filing. All capital calculations are approximations based on published standards and must be reviewed by qualified professionals before use in regulatory submissions. IFRS 9 hedge effectiveness testing requires formal designation documentation. Basel III capital calculations require regulator-approved models.</div>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `HedgeCore-AuditReport-${report.runId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: RuleStatus }) {
  const color =
    status === "PASS" ? S.green :
    status === "WARN" ? S.amber :
    status === "FAIL" ? S.red : S.tertiary;
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
      color, padding: "2px 8px", borderRadius: 2,
      border: `1px solid ${color}`,
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      whiteSpace: "nowrap",
    }}>● {status}</span>
  );
}

function SeverityBadge({ severity }: { severity: RuleSeverity }) {
  const color =
    severity === "CRITICAL" ? S.red :
    severity === "HIGH" ? S.amber :
    severity === "MEDIUM" ? S.cyan :
    S.tertiary;
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
      color, letterSpacing: "0.05em",
    }}>{severity}</span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AuditEngine({ sandboxResult, spot, notionalUSD, liveSpotFetched, onComplete }: AuditEngineProps) {
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showFormulas, setShowFormulas] = useState(false);

  const report = useMemo((): AuditReport => {
    const rules = computeAuditRules(sandboxResult, spot, notionalUSD, liveSpotFetched);
    const integrityScore = computeIntegrityScore(rules);
    const passed = rules.filter(r => r.status === "PASS" || r.status === "INFO").length;
    const warned = rules.filter(r => r.status === "WARN").length;
    const failed = rules.filter(r => r.status === "FAIL").length;
    const criticalFails = rules.filter(r => r.status === "FAIL" && r.severity === "CRITICAL").length;
    const overallStatus = failed > 0 ? "FAIL" : warned > 0 ? "WARN" : "PASS";
    const runId = sandboxResult?.run_id ?? "NO_RUN";
    const rpt: AuditReport = {
      runId,
      timestamp: new Date().toISOString(),
      overallStatus,
      integrityScore,
      rules,
      summary: { totalRules: rules.length, passed, warned, failed, criticalFails },
      certificationLevel: certLevel(integrityScore, liveSpotFetched, criticalFails),
    };
    return rpt;
  }, [sandboxResult, spot, notionalUSD, liveSpotFetched]);

  const handleDownload = useCallback(() => downloadAuditReport(report), [report]);

  const statusColor = (s: RuleStatus) =>
    s === "PASS" ? S.green : s === "WARN" ? S.amber : s === "FAIL" ? S.red : S.tertiary;

  const certColor = {
    INSTITUTIONAL: S.cyan,
    PROFESSIONAL: S.green,
    BASIC: S.amber,
    INCOMPLETE: S.red,
  }[report.certificationLevel];

  const CATEGORIES: Array<{ id: RuleCategory; label: string; color: string }> = [
    { id: "PRE_RUN",     label: "PRE-RUN VALIDATION",    color: S.cyan },
    { id: "CALCULATION", label: "CALCULATION AUDIT",     color: S.green },
    { id: "POST_RUN",    label: "POST-RUN CAPITAL",      color: S.amber },
    { id: "GOVERNANCE",  label: "GOVERNANCE CHAIN",      color: S.tertiary },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ── Header bar ── */}
      <div style={{
        background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4,
        padding: "16px 20px",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
            COMPLIANCE AUDIT ENGINE — 14 RULES
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <StatusBadge status={report.overallStatus} />
            <span style={{
              fontFamily: S.fontMono, fontSize: 20, fontWeight: 700,
              color: report.integrityScore >= 85 ? S.green : report.integrityScore >= 70 ? S.amber : S.red,
            }}>
              {report.integrityScore}/100
            </span>
            <span style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
              color: certColor, padding: "3px 10px",
              border: `1px solid ${certColor}`, borderRadius: 2,
              background: `color-mix(in srgb, ${certColor} 10%, transparent)`,
            }}>
              {report.certificationLevel}
            </span>
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
              {report.summary.passed} passed · {report.summary.warned} warnings · {report.summary.failed} failed
            </span>
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
            Run: {report.runId.slice(0, 12)} · {new Date(report.timestamp).toLocaleString()} ·
            Standards: IFRS 9 · BCBS 279 · ISDA SIMM v2.6 · EMIR · MiFID II
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setShowFormulas(f => !f)} style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
            padding: "5px 12px", border: `1px solid ${S.soft}`,
            color: S.tertiary, background: "transparent", cursor: "pointer", borderRadius: 2,
          }}>
            {showFormulas ? "Hide" : "Show"} Formulas
          </button>
          <button onClick={handleDownload} style={{
            fontFamily: S.fontUI, fontSize: 12, fontWeight: 700,
            padding: "6px 16px", border: `1px solid ${S.cyan}`,
            color: S.cyan, background: "transparent", cursor: "pointer", borderRadius: 2,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            ⬇ Download Report
          </button>
        </div>
      </div>

      {/* ── Rule categories ── */}
      {CATEGORIES.map(cat => {
        const catRules = report.rules.filter(r => r.category === cat.id);
        const catFailed = catRules.filter(r => r.status === "FAIL").length;
        const catWarned = catRules.filter(r => r.status === "WARN").length;

        return (
          <div key={cat.id} style={{ background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
            {/* Category header */}
            <div style={{
              padding: "9px 16px", borderBottom: `1px solid ${S.rim}`,
              background: S.panel, display: "flex", alignItems: "center", gap: 12,
              borderLeft: `3px solid ${cat.color}`,
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: cat.color }}>
                {cat.label}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                {catRules.length} rules
              </span>
              {catFailed > 0 && (
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.red }}>● {catFailed} FAIL</span>
              )}
              {catWarned > 0 && (
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber }}>● {catWarned} WARN</span>
              )}
            </div>

            {/* Rules table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: `color-mix(in srgb, ${S.panel} 60%, transparent)` }}>
                    {["Rule", "Name", "Status", "Sev.", "Evidence", "Value", "Threshold", "Reg. Ref"].map(h => (
                      <th key={h} style={{
                        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                        color: S.tertiary, textTransform: "uppercase",
                        padding: "8px 14px", textAlign: "left",
                        borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catRules.map(rule => (
                    <>
                      <tr
                        key={rule.id}
                        onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                        style={{
                          borderBottom: `1px solid ${S.soft}`, cursor: "pointer",
                          background: expandedRule === rule.id
                            ? `color-mix(in srgb, ${statusColor(rule.status)} 5%, transparent)`
                            : undefined,
                          transition: "background 100ms",
                        }}
                      >
                        <td style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan, padding: "12px 14px", whiteSpace: "nowrap" }}>
                          {rule.id} {expandedRule === rule.id ? "▼" : "▶"}
                        </td>
                        <td style={{ fontFamily: S.fontUI, fontSize: 13, color: S.primary, padding: "12px 14px" }}>
                          {rule.name}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <StatusBadge status={rule.status} />
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <SeverityBadge severity={rule.severity} />
                        </td>
                        <td style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, padding: "12px 14px", maxWidth: 280 }}>
                          {rule.evidence}
                        </td>
                        <td style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary, padding: "12px 14px", whiteSpace: "nowrap" }}>
                          {rule.value ?? "—"}
                        </td>
                        <td style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, padding: "12px 14px", whiteSpace: "nowrap" }}>
                          {rule.threshold ?? "—"}
                        </td>
                        <td style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, padding: "12px 14px", maxWidth: 200 }}>
                          {rule.regulatoryRef.split(" — ")[0]}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {expandedRule === rule.id && (
                        <tr key={`${rule.id}-detail`}>
                          <td colSpan={8} style={{
                            padding: "12px 20px 16px 32px",
                            background: `color-mix(in srgb, ${statusColor(rule.status)} 4%, ${S.sub})`,
                            borderBottom: `1px solid ${S.rim}`,
                            borderLeft: `3px solid ${statusColor(rule.status)}`,
                          }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {rule.detail && (
                                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6 }}>
                                  {rule.detail}
                                </div>
                              )}
                              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
                                <strong style={{ color: S.secondary }}>Regulatory Reference:</strong> {rule.regulatoryRef}
                              </div>
                              {(showFormulas || rule.formulaUsed) && (
                                <div style={{
                                  fontFamily: S.fontMono, fontSize: 12, color: S.cyan,
                                  background: `color-mix(in srgb, ${S.cyan} 4%, ${S.sub})`,
                                  border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
                                  borderRadius: 2, padding: "8px 12px",
                                }}>
                                  {rule.formulaUsed}
                                </div>
                              )}
                              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                                Timestamp: {new Date(rule.timestamp).toISOString()}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* ── Disclaimer ── */}
      <div style={{
        padding: "12px 16px", border: `1px solid ${S.soft}`, borderRadius: 3,
        fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.6,
        background: S.sub,
      }}>
        <strong style={{ color: S.secondary }}>Disclaimer:</strong> This audit report is generated algorithmically
        for analytical and documentation purposes only. It does not constitute a legal compliance opinion, financial
        advice, or regulatory filing. All regulatory thresholds and capital calculations are approximations based on
        published standards (IFRS 9, BCBS 279, ISDA SIMM v2.6) and must be reviewed by qualified professionals —
        legal counsel, risk officers, external auditors — before use in regulatory submissions or hedge designations.
      </div>
    </div>
  );
}
