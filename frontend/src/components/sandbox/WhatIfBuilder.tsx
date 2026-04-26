"use client";

import { useState, useMemo, useCallback } from "react";
import type { SandboxCalculateResponse } from "../../api/pipelineTypes";
import type { PolicyConfig } from "../../api/types";
import { HedgeGauge, ScenarioHeatmap, type HeatmapCell } from "./VisualizationSuite";

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

function fmt(n: number): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  if (abs >= 1_000_000) return sign + "$" + (abs / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return sign + "$" + (abs / 1_000).toFixed(1) + "K";
  return sign + "$" + abs.toFixed(0);
}

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradeScenario {
  id: string;
  label: string;
  notional: number;        // local currency
  spot: number;
  hedgeRatio: number;      // 0–1
  spreadBps: number;
  confirmRatio: number;    // fraction confirmed vs forecast (0–1)
  buckets: number;         // number of monthly buckets
  carryBpsPerMonth: number;
}

interface ScenarioResult {
  label: string;
  coverageRatio: number;     // 0–1
  hedgeCost: number;         // USD
  residualRisk: number;      // unhedged USD loss @-10% shock
  carryIncome: number;       // forward premium/discount income
  ifrs9Effective: boolean;   // 80–125% band
  netBenefit: number;        // risk reduced − cost
  policyCompliant: boolean;
}

function computeScenario(s: TradeScenario, policy: PolicyConfig): ScenarioResult {
  const usdNotional = s.notional / s.spot;
  const confirmedFraction = s.confirmRatio;
  const effectiveRatio = confirmedFraction * policy.hedge_ratios.confirmed
    + (1 - confirmedFraction) * policy.hedge_ratios.forecast;
  const coverageRatio = Math.min(1, s.hedgeRatio);
  const hedgeNotionalUSD = usdNotional * coverageRatio;
  const spreadCostUSD = hedgeNotionalUSD * (s.spreadBps / 10000);
  const carryIncome = usdNotional * coverageRatio * (s.carryBpsPerMonth / 10000) * s.buckets;
  const hedgeCost = spreadCostUSD - carryIncome;
  // Residual P&L at -10% spot shock (unhedged portion)
  const residualRisk = usdNotional * (1 - coverageRatio) * (-0.10);
  // IFRS 9: effectiveness = hedge_offset / risk_offset ∈ [0.80, 1.25]
  const effectiveness = coverageRatio / effectiveRatio;
  const ifrs9Effective = effectiveness >= 0.80 && effectiveness <= 1.25;
  const netBenefit = -residualRisk - hedgeCost;
  const policyCompliant = s.hedgeRatio >= effectiveRatio - 0.05 && s.hedgeRatio <= 1.0;
  return { label: s.label, coverageRatio, hedgeCost, residualRisk, carryIncome, ifrs9Effective, netBenefit, policyCompliant };
}

// ─── Build heatmap cells ──────────────────────────────────────────────────────

function buildHeatmapCells(notional: number, spot: number): HeatmapCell[] {
  const spotShocks = [-30, -20, -10, -5, 0, 10, 20];
  const carryShocks = [-80, -50, 0, 50, 80];
  const cells: HeatmapCell[] = [];
  for (const ss of spotShocks) {
    for (const cs of carryShocks) {
      const shockedSpot = spot * (1 + ss / 100);
      const carryMod = 1 + cs / 100;
      const carryBps = 48 * carryMod;
      const usdNotional = notional / spot;
      const spreadCost = usdNotional * 0.8 * 0.0005;
      const carryBenefit = usdNotional * 0.8 * carryBps / 10000 * 3;
      const residual = usdNotional * 0.2 * (spot / shockedSpot - 1);
      const pnl = -(spreadCost - carryBenefit) + residual;
      cells.push({ spotShock: ss, carryShock: cs, pnl });
    }
  }
  return cells;
}

// ─── Constraint Checker ───────────────────────────────────────────────────────

interface PolicyCheck {
  rule: string;
  pass: boolean;
  value: string;
  threshold: string;
  severity: "ERROR" | "WARN" | "INFO";
}

function checkPolicyConstraints(scenario: TradeScenario, policy: PolicyConfig): PolicyCheck[] {
  const usd = scenario.notional / scenario.spot;
  return [
    {
      rule: "Confirmed Hedge Ratio",
      pass: scenario.hedgeRatio >= policy.hedge_ratios.confirmed - 0.05,
      value: fmtPct(scenario.hedgeRatio),
      threshold: `Min ${fmtPct(policy.hedge_ratios.confirmed)} confirmed`,
      severity: "ERROR",
    },
    {
      rule: "IFRS 9 Effectiveness Band",
      pass: scenario.hedgeRatio >= 0.80 && scenario.hedgeRatio <= 1.25,
      value: fmtPct(scenario.hedgeRatio),
      threshold: "80% – 125% offset required",
      severity: "ERROR",
    },
    {
      rule: "Min Trade Size",
      pass: usd * scenario.hedgeRatio >= (policy.min_trade_size_usd || 0),
      value: fmt(usd * scenario.hedgeRatio),
      threshold: `Min ${fmt(policy.min_trade_size_usd || 0)}`,
      severity: "WARN",
    },
    {
      rule: "Spread Budget",
      pass: scenario.spreadBps <= 20,
      value: `${scenario.spreadBps.toFixed(1)} bps`,
      threshold: "< 20 bps institutional",
      severity: "WARN",
    },
    {
      rule: "Forecast Hedge Ratio",
      pass: scenario.hedgeRatio * (1 - scenario.confirmRatio) <= policy.hedge_ratios.forecast + 0.05,
      value: fmtPct(scenario.hedgeRatio * (1 - scenario.confirmRatio)),
      threshold: `Max ${fmtPct(policy.hedge_ratios.forecast)} forecast`,
      severity: "WARN",
    },
    {
      rule: "Execution Product",
      pass: policy.execution_product === "NDF" || policy.execution_product === "FWD",
      value: policy.execution_product,
      threshold: "NDF or FWD required",
      severity: "INFO",
    },
  ];
}

// ─── Default policy ───────────────────────────────────────────────────────────

const DEFAULT_POLICY: PolicyConfig = {
  bucket_mode: "CALENDAR_MONTH",
  hedge_ratios: { confirmed: 0.80, forecast: 0.50 },
  cost_assumptions: { spread_bps: 5.0 },
  execution_product: "NDF",
  min_trade_size_usd: 0,
};

// ─── Input component ─────────────────────────────────────────────────────────

function SliderInput({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {label}
        </label>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: S.cyan }}
      />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{format(min)}</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{format(max)}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface WhatIfBuilderProps {
  sandboxResult: SandboxCalculateResponse | null;
  defaultPolicy?: PolicyConfig;
  defaultSpot?: number;
}

export default function WhatIfBuilder({ sandboxResult, defaultPolicy = DEFAULT_POLICY, defaultSpot = 18.97 }: WhatIfBuilderProps) {

  // Derive initial state from sandboxResult or defaults
  const initNotional = useMemo(() => {
    const plan = sandboxResult?.calculate_response?.hedge_plan;
    const summary = plan?.summary as Record<string, number> | undefined;
    return summary?.total_commercial_exposure_mxn ?? 10_000_000;
  }, [sandboxResult]);

  const [scenario, setScenario] = useState<TradeScenario>({
    id: "A",
    label: "Scenario A",
    notional: initNotional,
    spot: defaultSpot,
    hedgeRatio: defaultPolicy.hedge_ratios.confirmed,
    spreadBps: defaultPolicy.cost_assumptions.spread_bps,
    confirmRatio: 0.70,
    buckets: 4,
    carryBpsPerMonth: 48,
  });

  const [compareMode, setCompareMode] = useState(false);
  const [compareScenario, _setCompareScenario] = useState<TradeScenario>({
    id: "B",
    label: "Scenario B — Aggressive",
    notional: initNotional,
    spot: defaultSpot,
    hedgeRatio: 1.0,
    spreadBps: 8.0,
    confirmRatio: 0.50,
    buckets: 6,
    carryBpsPerMonth: 48,
  });

  const [activeTab, setActiveTab] = useState<"builder" | "constraints" | "heatmap">("builder");

  const setField = useCallback((field: keyof TradeScenario) => (v: number) => {
    setScenario(prev => ({ ...prev, [field]: v }));
  }, []);

  const result = useMemo(() => computeScenario(scenario, defaultPolicy), [scenario, defaultPolicy]);
  const compareResult = useMemo(() => computeScenario(compareScenario, defaultPolicy), [compareScenario, defaultPolicy]);
  const constraints = useMemo(() => checkPolicyConstraints(scenario, defaultPolicy), [scenario, defaultPolicy]);
  const heatmapCells = useMemo(() => buildHeatmapCells(scenario.notional, scenario.spot), [scenario.notional, scenario.spot]);

  const TABS = [
    { id: "builder" as const, label: "What-If Builder" },
    { id: "constraints" as const, label: "Policy Constraints" },
    { id: "heatmap" as const, label: "Scenario Heatmap" },
  ];

  function ResultCard({ r, label }: { r: ScenarioResult; label: string }) {
    return (
      <div style={{ flex: 1, background: S.sub, border: `1px solid ${r.policyCompliant ? S.soft : S.amber}`, borderRadius: 4, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan }}>{label}</span>
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            padding: "2px 6px", borderRadius: 2,
            background: `color-mix(in srgb, ${r.policyCompliant ? S.green : S.amber} 15%, transparent)`,
            color: r.policyCompliant ? S.green : S.amber,
          }}>{r.policyCompliant ? "POLICY OK" : "REVIEW"}</span>
        </div>
        <HedgeGauge ratio={r.coverageRatio} label="Coverage" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            ["Hedge Cost", fmt(r.hedgeCost), r.hedgeCost > 0 ? S.red : S.green],
            ["Carry Income", fmt(r.carryIncome), S.green],
            ["Residual Risk", fmt(r.residualRisk), S.red],
            ["Net Benefit", fmt(r.netBenefit), r.netBenefit > 0 ? S.green : S.red],
            ["IFRS 9", r.ifrs9Effective ? "EFFECTIVE" : "FAIL", r.ifrs9Effective ? S.green : S.red],
          ].map(([k, v, c]) => (
            <div key={k as string} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 8px", background: S.panel, borderRadius: 2, border: `1px solid ${S.soft}` }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textTransform: "uppercase" }}>{k}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: c as string }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px", borderBottom: `1px solid ${S.rim}`,
        background: `color-mix(in srgb, ${S.sub} 60%, transparent)`,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.cyan }}>
          ◈ WHAT-IF BUILDER
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setCompareMode(!compareMode)}
            style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
              padding: "3px 10px", borderRadius: 2,
              border: `1px solid ${compareMode ? S.green : S.rim}`,
              background: compareMode ? `color-mix(in srgb, ${S.green} 10%, transparent)` : S.sub,
              color: compareMode ? S.green : S.tertiary,
              cursor: "pointer",
            }}
          >{compareMode ? "⊠ A/B Active" : "⊟ Compare A/B"}</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${S.rim}`, background: S.sub }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            padding: "7px 14px", border: "none",
            borderBottom: activeTab === t.id ? `2px solid ${S.cyan}` : "2px solid transparent",
            background: "transparent",
            color: activeTab === t.id ? S.cyan : S.tertiary,
            cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 14 }}>

        {/* BUILDER TAB */}
        {activeTab === "builder" && (
          <div style={{ display: "flex", gap: 16 }}>
            {/* Controls */}
            <div style={{ flex: "0 0 240px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.08em" }}>SCENARIO PARAMETERS</div>
              <SliderInput label="Net Notional (M)" value={scenario.notional} min={1_000_000} max={100_000_000} step={1_000_000}
                onChange={setField("notional")} format={v => "$" + (v / 1e6).toFixed(0) + "M"} />
              <SliderInput label="Spot Rate" value={scenario.spot} min={1} max={200} step={0.01}
                onChange={setField("spot")} format={v => v.toFixed(2)} />
              <SliderInput label="Hedge Ratio" value={scenario.hedgeRatio} min={0} max={1} step={0.01}
                onChange={setField("hedgeRatio")} format={v => (v * 100).toFixed(0) + "%"} />
              <SliderInput label="Spread (bps)" value={scenario.spreadBps} min={0.5} max={30} step={0.5}
                onChange={setField("spreadBps")} format={v => v.toFixed(1) + " bps"} />
              <SliderInput label="Confirm % of Exposure" value={scenario.confirmRatio} min={0} max={1} step={0.05}
                onChange={setField("confirmRatio")} format={v => (v * 100).toFixed(0) + "% confirmed"} />
              <SliderInput label="Carry (bps/month)" value={scenario.carryBpsPerMonth} min={-50} max={200} step={1}
                onChange={setField("carryBpsPerMonth")} format={v => v.toFixed(0) + " bps/mo"} />
              <SliderInput label="# Buckets" value={scenario.buckets} min={1} max={12} step={1}
                onChange={setField("buckets")} format={v => v.toFixed(0) + " months"} />
            </div>

            {/* Results */}
            <div style={{ flex: 1, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <ResultCard r={result} label="SCENARIO A" />
              {compareMode && <ResultCard r={compareResult} label="SCENARIO B" />}
            </div>
          </div>
        )}

        {/* CONSTRAINTS TAB */}
        {activeTab === "constraints" && (
          <div>
            <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, margin: "0 0 12px", lineHeight: 1.6 }}>
              Policy compliance checklist for current scenario parameters. All ERROR-level rules must pass before execution tickets can be generated.
              WARN-level items require confirmation. Based on ISDA SIMM v2.6 and internal policy limits.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {constraints.map((c, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "200px 1fr 200px 60px",
                  gap: 12, padding: "8px 12px", borderRadius: 3,
                  background: c.pass ? "transparent" : `color-mix(in srgb, ${c.severity === "ERROR" ? S.red : S.amber} 6%, transparent)`,
                  border: `1px solid ${c.pass ? S.soft : (c.severity === "ERROR" ? S.red : S.amber)}`,
                  alignItems: "center",
                }}>
                  <span style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 500, color: S.primary }}>{c.rule}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{c.threshold}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: c.pass ? S.green : (c.severity === "ERROR" ? S.red : S.amber) }}>
                    Value: {c.value}
                  </span>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                    padding: "2px 6px", borderRadius: 2, textAlign: "center",
                    background: `color-mix(in srgb, ${c.pass ? S.green : (c.severity === "ERROR" ? S.red : S.amber)} 15%, transparent)`,
                    color: c.pass ? S.green : (c.severity === "ERROR" ? S.red : S.amber),
                  }}>
                    {c.pass ? "PASS" : c.severity}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", background: S.sub, borderRadius: 3, border: `1px solid ${S.soft}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                Policy rules per: IFRS 9.6.4.1 (effectiveness) · Board mandate (hedge ratios) · ISDA SIMM v2.6 (min size) · Internal treasury policy (spread budget)
              </div>
            </div>
          </div>
        )}

        {/* HEATMAP TAB */}
        {activeTab === "heatmap" && (
          <div>
            <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, margin: "0 0 12px", lineHeight: 1.6 }}>
              Two-dimensional scenario matrix: spot shock (rows) × carry shock (columns). Shows net portfolio P&L for each combination.
              Red = losses, Green = gains. Current exposure: {(scenario.notional / 1e6).toFixed(1)}M at spot {scenario.spot.toFixed(2)}.
            </p>
            <ScenarioHeatmap
              cells={heatmapCells}
              title="Net P&L Heatmap — 80% Hedge Coverage"
              spotLabel="SPOT SHOCK %"
              carryLabel="CARRY SHOCK %"
            />
            <div style={{ marginTop: 10, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
              Assumes: {(scenario.hedgeRatio * 100).toFixed(0)}% hedge ratio · {scenario.spreadBps.toFixed(1)} bps spread · {scenario.carryBpsPerMonth} bps/month carry · {scenario.buckets} buckets
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
