"use client";

import { useState, useMemo } from "react";
import type { SandboxCalculateResponse } from "../../api/pipelineTypes";
import type { PolicyConfig } from "../../api/types";

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

interface ScenarioDef {
  id: string;
  label: string;
  shock: number;   // percentage, e.g. -25 for -25%
  tooltip: string;
  group: "move" | "crash" | "custom";
}

interface OverrideConfig {
  spot: number;
  notional: number;
  hedgeRatio: number;  // 0–1
  spreadBps: number;
}

interface StressResult {
  id: string;
  label: string;
  shock: number;
  shockedRate: number;
  unhedgedPnl: number;
  hedgedPnl: number;
  hedgeBenefit: number;
  efficiency: number;
}

interface ScenarioStressTesterProps {
  sandboxResult: SandboxCalculateResponse | null;
  defaultPolicy: PolicyConfig;
  defaultSpot: number;
}

// ─── Scenario Library ─────────────────────────────────────────────────────────

const MOVE_SCENARIOS: ScenarioDef[] = [
  { id: "m-20", label: "−20%", shock: -20, tooltip: "Spot rate falls 20%", group: "move" },
  { id: "m-15", label: "−15%", shock: -15, tooltip: "Spot rate falls 15%", group: "move" },
  { id: "m-10", label: "−10%", shock: -10, tooltip: "Spot rate falls 10%", group: "move" },
  { id: "m-5",  label: "−5%",  shock: -5,  tooltip: "Spot rate falls 5%",  group: "move" },
  { id: "p5",   label: "+5%",  shock: +5,  tooltip: "Spot rate rises 5%",  group: "move" },
  { id: "p10",  label: "+10%", shock: +10, tooltip: "Spot rate rises 10%", group: "move" },
  { id: "p15",  label: "+15%", shock: +15, tooltip: "Spot rate rises 15%", group: "move" },
  { id: "p20",  label: "+20%", shock: +20, tooltip: "Spot rate rises 20%", group: "move" },
];

const CRASH_SCENARIOS: ScenarioDef[] = [
  {
    id: "tequila-94",
    label: "MXN '94",
    shock: -48,
    tooltip: "Tequila Crisis — Peso devalued Dec 1994, USD/MXN 3.4 → 6.5 (−48%)",
    group: "crash",
  },
  {
    id: "gfc-2008",
    label: "GFC '08",
    shock: -30,
    tooltip: "Global Financial Crisis — peak EM selloff, USD surge (−30%)",
    group: "crash",
  },
  {
    id: "eurozone-11",
    label: "EZ Debt '11",
    shock: -20,
    tooltip: "Eurozone Debt Crisis — EM capital flight, USD/EM stress (−20%)",
    group: "crash",
  },
  {
    id: "cn-2015",
    label: "China '15",
    shock: -15,
    tooltip: "PBoC CNY surprise devaluation Aug 2015, EM contagion (−15%)",
    group: "crash",
  },
  {
    id: "brexit-16",
    label: "Brexit '16",
    shock: -12,
    tooltip: "Brexit referendum — GBP −10%, EM FX −8–12% (−12%)",
    group: "crash",
  },
  {
    id: "covid-20",
    label: "COVID '20",
    shock: -25,
    tooltip: "March 2020 pandemic panic — MXN lost 25%, worst since '94",
    group: "crash",
  },
  {
    id: "try-2018",
    label: "TRY '18",
    shock: -40,
    tooltip: "Turkey currency crisis Aug 2018 — USD/TRY doubled (−40%)",
    group: "crash",
  },
  {
    id: "zar-2020",
    label: "ZAR '20",
    shock: -22,
    tooltip: "South African Rand worst quarter on record — COVID lockdown (−22%)",
    group: "crash",
  },
  {
    id: "fed-hike-22",
    label: "Fed Hike '22",
    shock: -18,
    tooltip: "2022 Fed rate hike cycle — EM capital flight, USD strength (−18%)",
    group: "crash",
  },
];

// ─── Math engine (pure client-side) ──────────────────────────────────────────

function computeStress(scenario: ScenarioDef, cfg: OverrideConfig): StressResult {
  const { spot, notional, hedgeRatio, spreadBps } = cfg;
  const shockedRate = spot * (1 + scenario.shock / 100);
  // If the base currency is quote (MXN), a higher USD/MXN rate = MXN weakens
  // A MXN exporter (AP) benefits if MXN weakens; AP hedger tries to sell MXN
  // Using generic P&L: net exposure in MXN → USD conversion difference
  const unhedgedPnl = notional * (1 / shockedRate - 1 / spot);
  const frictionalCost = (notional * hedgeRatio) / spot * (spreadBps / 10000);
  const hedgedPnl = unhedgedPnl * (1 - hedgeRatio) - frictionalCost;
  const hedgeBenefit = hedgedPnl - unhedgedPnl;
  const efficiency =
    Math.abs(unhedgedPnl) > 0.01
      ? (hedgeBenefit / Math.abs(unhedgedPnl)) * 100
      : 0;
  return {
    id: scenario.id,
    label: scenario.label,
    shock: scenario.shock,
    shockedRate,
    unhedgedPnl,
    hedgedPnl,
    hedgeBenefit,
    efficiency,
  };
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  return sign + "$" + abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function pnlColor(n: number): string {
  if (n < -500) return S.red;
  if (n < 0) return S.amber;
  if (n > 0) return S.green;
  return S.secondary;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConfigInput({
  label,
  value,
  onChange,
  step,
  min,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: S.tertiary,
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {prefix && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          step={step ?? 1}
          min={min ?? 0}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 600,
            color: S.primary,
            background: S.sub,
            border: `1px solid ${S.rim}`,
            borderRadius: 2,
            padding: "3px 6px",
            width: 90,
            outline: "none",
          }}
        />
        {suffix && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function ScenarioChip({
  scenario,
  active,
  onClick,
}: {
  scenario: ScenarioDef;
  active: boolean;
  onClick: () => void;
}) {
  const isCrash = scenario.group === "crash";
  const isNeg = scenario.shock < 0;

  return (
    <button
      title={scenario.tooltip}
      onClick={onClick}
      style={{
        fontFamily: S.fontMono,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "3px 9px",
        borderRadius: 2,
        border: active
          ? `1px solid ${isCrash ? S.amber : isNeg ? S.red : S.green}`
          : `1px solid ${S.soft}`,
        background: active
          ? isCrash
            ? `color-mix(in srgb, ${S.amber} 15%, transparent)`
            : isNeg
              ? `color-mix(in srgb, ${S.red} 12%, transparent)`
              : `color-mix(in srgb, ${S.green} 12%, transparent)`
          : "transparent",
        color: active
          ? isCrash
            ? S.amber
            : isNeg
              ? S.red
              : S.green
          : S.tertiary,
        cursor: "pointer",
        transition: "all 100ms",
        whiteSpace: "nowrap",
      }}
    >
      {scenario.label}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ScenarioStressTester({
  sandboxResult,
  defaultPolicy,
  defaultSpot,
}: ScenarioStressTesterProps) {
  // Derive initial values from sandboxResult or defaults
  const initialSpot = (() => {
    const marketSpot =
      (sandboxResult?.frozen_inputs?.market as Record<string, unknown> | undefined)
        ?.spot_rate as number | undefined;
    return marketSpot ?? defaultSpot;
  })();

  const initialNotional = (() => {
    const plan = sandboxResult?.calculate_response?.hedge_plan;
    return (plan?.summary?.total_commercial_exposure_mxn as number | undefined) ?? 10_000_000;
  })();

  const initialHedgeRatio = (() => {
    const policy = sandboxResult?.frozen_inputs?.policy as Record<string, unknown> | undefined;
    const ratios = policy?.hedge_ratios as Record<string, number> | undefined;
    return ratios?.confirmed ?? defaultPolicy.hedge_ratios.confirmed;
  })();

  const initialSpreadBps = (() => {
    const policy = sandboxResult?.frozen_inputs?.policy as Record<string, unknown> | undefined;
    const costs = policy?.cost_assumptions as Record<string, number> | undefined;
    return costs?.spread_bps ?? defaultPolicy.cost_assumptions.spread_bps;
  })();

  const [overrides, setOverrides] = useState<OverrideConfig>({
    spot: initialSpot,
    notional: initialNotional,
    hedgeRatio: initialHedgeRatio,
    spreadBps: initialSpreadBps,
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customPct, setCustomPct] = useState("");
  const [customScenarios, setCustomScenarios] = useState<ScenarioDef[]>([]);

  const allScenarios: ScenarioDef[] = useMemo(
    () => [...MOVE_SCENARIOS, ...CRASH_SCENARIOS, ...customScenarios],
    [customScenarios]
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addCustom = () => {
    const pct = parseFloat(customPct);
    if (isNaN(pct) || pct === 0) return;
    const id = `custom-${Date.now()}`;
    const label = pct > 0 ? `+${pct}%` : `${pct}%`;
    const newScenario: ScenarioDef = {
      id,
      label,
      shock: pct,
      tooltip: `Custom shock: ${label}`,
      group: "custom",
    };
    setCustomScenarios((prev) => [...prev, newScenario]);
    setSelectedIds((prev) => new Set(prev).add(id));
    setCustomPct("");
  };

  const results: StressResult[] = useMemo(
    () =>
      allScenarios
        .filter((s) => selectedIds.has(s.id))
        .map((s) => computeStress(s, overrides))
        .sort((a, b) => a.shock - b.shock),
    [allScenarios, selectedIds, overrides]
  );

  const setField = (field: keyof OverrideConfig) => (v: number) =>
    setOverrides((prev) => ({ ...prev, [field]: v }));

  return (
    <div
      style={{
        background: S.panel,
        border: `1px solid ${S.rim}`,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: `1px solid ${S.rim}`,
          background: `color-mix(in srgb, ${S.sub} 60%, transparent)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: S.cyan,
              textTransform: "uppercase",
            }}
          >
            ◈ Scenario Stress Tester
          </span>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.tertiary,
              letterSpacing: "0.06em",
            }}
          >
            — client-side P&amp;L simulation
          </span>
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.tertiary,
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Clear all ×
          </button>
        )}
      </div>

      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Config Strip ── */}
        <div
          style={{
            display: "flex",
            gap: 20,
            alignItems: "flex-end",
            flexWrap: "wrap",
            padding: "10px 12px",
            background: S.sub,
            borderRadius: 3,
            border: `1px solid ${S.soft}`,
          }}
        >
          <ConfigInput
            label="Spot Rate"
            value={overrides.spot}
            onChange={setField("spot")}
            step={0.01}
            min={0.001}
            suffix="USD/MXN"
          />
          <ConfigInput
            label="Net Exposure"
            value={overrides.notional}
            onChange={setField("notional")}
            step={100000}
            prefix="MXN"
          />
          <ConfigInput
            label="Hedge Ratio"
            value={Math.round(overrides.hedgeRatio * 100)}
            onChange={(v) => setField("hedgeRatio")(Math.max(0, Math.min(100, v)) / 100)}
            step={5}
            min={0}
            suffix="%"
          />
          <ConfigInput
            label="Spread"
            value={overrides.spreadBps}
            onChange={setField("spreadBps")}
            step={0.5}
            min={0}
            suffix="bps"
          />
        </div>

        {/* ── % Move Scenarios ── */}
        <div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: S.tertiary,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Spot % Moves
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {MOVE_SCENARIOS.map((s) => (
              <ScenarioChip
                key={s.id}
                scenario={s}
                active={selectedIds.has(s.id)}
                onClick={() => toggle(s.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Historic Crash Scenarios ── */}
        <div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: S.tertiary,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Historic Market Crises
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {CRASH_SCENARIOS.map((s) => (
              <ScenarioChip
                key={s.id}
                scenario={s}
                active={selectedIds.has(s.id)}
                onClick={() => toggle(s.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Custom Shock ── */}
        <div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: S.tertiary,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Custom Shock
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <input
              type="number"
              placeholder="e.g. -33"
              value={customPct}
              onChange={(e) => setCustomPct(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.primary,
                background: S.sub,
                border: `1px solid ${S.rim}`,
                borderRadius: 2,
                padding: "4px 8px",
                width: 100,
                outline: "none",
              }}
            />
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>%</span>
            <button
              onClick={addCustom}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                padding: "4px 12px",
                borderRadius: 2,
                border: `1px solid ${S.cyan}`,
                background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
                color: S.cyan,
                cursor: "pointer",
              }}
            >
              ADD
            </button>
            {/* Show existing custom chips */}
            {customScenarios.map((s) => (
              <ScenarioChip
                key={s.id}
                scenario={s}
                active={selectedIds.has(s.id)}
                onClick={() => toggle(s.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Results Table ── */}
        {results.length > 0 && (
          <div
            style={{
              background: S.sub,
              border: `1px solid ${S.rim}`,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 70px 110px 130px 130px 130px 90px",
                padding: "6px 12px",
                borderBottom: `1px solid ${S.rim}`,
                background: `color-mix(in srgb, ${S.rim} 30%, transparent)`,
              }}
            >
              {[
                "Scenario",
                "Shock %",
                "Shocked Rate",
                "Unhedged P&L",
                "Hedged P&L",
                "Hedge Benefit",
                "Efficiency",
              ].map((h) => (
                <span
                  key={h}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: S.tertiary,
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Table rows */}
            {results.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 70px 110px 130px 130px 130px 90px",
                  padding: "7px 12px",
                  borderBottom: i < results.length - 1 ? `1px solid ${S.soft}` : "none",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: S.fontUI,
                    fontSize: 12,
                    fontWeight: 500,
                    color: S.primary,
                  }}
                >
                  {/* Find full tooltip-based tooltip */}
                  {allScenarios.find((s) => s.id === r.id)?.tooltip.split("—")[0]?.trim() ?? r.label}
                </span>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: r.shock < 0 ? S.red : S.green,
                  }}
                >
                  {r.shock > 0 ? "+" : ""}
                  {r.shock}%
                </span>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.secondary,
                  }}
                >
                  {r.shockedRate.toFixed(4)}
                </span>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    color: pnlColor(r.unhedgedPnl),
                  }}
                >
                  {fmt(r.unhedgedPnl)}
                </span>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    color: pnlColor(r.hedgedPnl),
                  }}
                >
                  {fmt(r.hedgedPnl)}
                </span>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    color: r.hedgeBenefit > 0 ? S.green : S.amber,
                  }}
                >
                  {fmt(r.hedgeBenefit)}
                </span>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color:
                      r.efficiency >= 70
                        ? S.green
                        : r.efficiency >= 40
                        ? S.amber
                        : S.red,
                  }}
                >
                  {r.efficiency.toFixed(1)}%
                </span>
              </div>
            ))}

            {/* Summary footer */}
            {results.length > 1 && (
              <div
                style={{
                  padding: "6px 12px",
                  borderTop: `1px solid ${S.rim}`,
                  display: "flex",
                  gap: 20,
                  background: `color-mix(in srgb, ${S.rim} 20%, transparent)`,
                }}
              >
                <span
                  style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.06em" }}
                >
                  WORST UNHEDGED:{" "}
                  <span style={{ color: pnlColor(Math.min(...results.map((r) => r.unhedgedPnl))), fontWeight: 700 }}>
                    {fmt(Math.min(...results.map((r) => r.unhedgedPnl)))}
                  </span>
                </span>
                <span
                  style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.06em" }}
                >
                  WORST HEDGED:{" "}
                  <span style={{ color: pnlColor(Math.min(...results.map((r) => r.hedgedPnl))), fontWeight: 700 }}>
                    {fmt(Math.min(...results.map((r) => r.hedgedPnl)))}
                  </span>
                </span>
                <span
                  style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.06em" }}
                >
                  AVG EFFICIENCY:{" "}
                  <span style={{ color: S.cyan, fontWeight: 700 }}>
                    {(results.reduce((a, r) => a + r.efficiency, 0) / results.length).toFixed(1)}%
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        {selectedIds.size === 0 && (
          <p
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.tertiary,
              letterSpacing: "0.04em",
              textAlign: "center",
              padding: "8px 0",
            }}
          >
            Select scenarios above to see P&amp;L impact →
          </p>
        )}
      </div>
    </div>
  );
}
