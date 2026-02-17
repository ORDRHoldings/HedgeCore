"use client";

import type { HedgePlanSummary, ScenarioTotalResult } from '../../api/types';
import { fmtMXN, fmtUSD, fmtPct } from '../../utils/formatters';
import CoverageBar from './CoverageBar';

interface Props {
  summary: HedgePlanSummary;
  totals: ScenarioTotalResult[];
}

function getCoverageRatio(summary: HedgePlanSummary): number {
  const denom = Math.abs(summary.total_commercial_exposure_mxn);
  if (denom === 0) return 0;
  return Math.abs(summary.total_hedge_position_mxn) / denom;
}

function getWorstCaseImpact(totals: ScenarioTotalResult[]): ScenarioTotalResult | null {
  const extreme = totals.filter(t => Math.abs(Math.abs(t.sigma) - 0.10) < 0.001);
  if (extreme.length === 0) return null;
  return extreme.reduce((min, cur) =>
    cur.total_hedge_benefit_usd < min.total_hedge_benefit_usd ? cur : min,
  );
}

export default function OverviewTab({ summary, totals }: Props) {
  const coverageRatio = getCoverageRatio(summary);
  const worstCase = getWorstCaseImpact(totals);

  // Classify coverage health
  const coverageHealth =
    coverageRatio >= 0.95 ? { label: "FULLY COVERED", color: "var(--accent-green)" }
    : coverageRatio >= 0.70 ? { label: "PARTIALLY COVERED", color: "var(--accent-amber)" }
    : { label: "UNDER-HEDGED", color: "var(--accent-red)" };

  const residualHealth =
    summary.total_residual_mxn === 0 ? { label: "ZERO RESIDUAL", color: "var(--accent-green)" }
    : Math.abs(summary.total_residual_mxn) < Math.abs(summary.total_commercial_exposure_mxn) * 0.05
      ? { label: "WITHIN TOLERANCE", color: "var(--accent-amber)" }
      : { label: "RESIDUAL EXISTS", color: "var(--accent-red)" };

  const kpiTiles = [
    {
      label: "Total Exposure",
      value: `${fmtMXN(summary.total_commercial_exposure_mxn)}`,
      sub: "Commercial",
      color: "var(--text-primary)",
    },
    {
      label: "Coverage Ratio",
      value: fmtPct(coverageRatio),
      sub: coverageHealth.label,
      color: coverageHealth.color,
    },
    {
      label: "Net Hedge Position",
      value: `${fmtMXN(summary.total_hedge_position_mxn)}`,
      sub: "Existing + New action",
      color: "var(--accent-cyan)",
    },
    {
      label: "Residual Exposure",
      value: `${fmtMXN(summary.total_residual_mxn)}`,
      sub: residualHealth.label,
      color: residualHealth.color,
    },
    {
      label: "New Action Required",
      value: `${fmtMXN(summary.total_action_mxn)}`,
      sub: "Trade notional",
      color: summary.total_action_mxn !== 0 ? "var(--accent-indigo)" : "var(--accent-green)",
    },
    {
      label: "Total Friction Cost",
      value: fmtUSD(summary.total_friction_usd),
      sub: "Spread estimate",
      color: "var(--accent-amber)",
    },
    {
      label: "Worst-Case Impact",
      value: worstCase ? fmtUSD(worstCase.total_hedge_benefit_usd) : "N/A",
      sub: "±10% FX shock",
      color: "var(--accent-red)",
    },
    {
      label: "Existing Hedges",
      value: `${fmtMXN(summary.total_existing_hedges_mxn)}`,
      sub: "On books",
      color: "var(--text-secondary)",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiTiles.map((tile) => (
          <div
            key={tile.label}
            className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4 kpi-tile-hover transition-all"
          >
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              {tile.label}
            </div>
            <div
              className="text-xl font-mono font-bold leading-tight"
              style={{ color: tile.color }}
            >
              {tile.value}
            </div>
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] mt-1.5">{tile.sub}</div>
          </div>
        ))}
      </div>

      {/* Coverage decomposition */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            Coverage Decomposition
          </h3>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-1.5 py-0.5">
            Deterministic · Snapshot-Bound
          </span>
        </div>
        <CoverageBar
          totalExposure={summary.total_commercial_exposure_mxn}
          existingHedges={summary.total_existing_hedges_mxn}
          newAction={summary.total_action_mxn}
          residual={summary.total_residual_mxn}
        />
      </div>

      {/* Detail table */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded overflow-hidden">
        <div className="px-5 py-3 bg-[var(--bg-deep)] border-b border-[var(--border-soft)]">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            Summary Detail
          </span>
        </div>
        <div className="p-5">
          <div className="space-y-0">
            {[
              { label: "Total Commercial Exposure", value: `${fmtMXN(summary.total_commercial_exposure_mxn)}`, color: "var(--text-primary)" },
              { label: "Existing Hedges On Books",  value: `${fmtMXN(summary.total_existing_hedges_mxn)}`, color: "var(--text-secondary)" },
              { label: "New Hedge Action",           value: `${fmtMXN(summary.total_action_mxn)}`, color: "var(--accent-indigo)" },
              { label: "Net Hedge Position",         value: `${fmtMXN(summary.total_hedge_position_mxn)}`, color: "var(--accent-cyan)", bold: true },
              { label: "Residual Exposure",          value: `${fmtMXN(summary.total_residual_mxn)}`, color: residualHealth.color },
              { label: "Total Friction Cost (USD)",  value: fmtUSD(summary.total_friction_usd), color: "var(--accent-amber)" },
              { label: "Coverage Ratio",             value: fmtPct(coverageRatio), color: coverageHealth.color, bold: true },
              { label: "Worst-Case Hedge Benefit",   value: worstCase ? fmtUSD(worstCase.total_hedge_benefit_usd) : "N/A", color: "var(--accent-red)" },
            ].map(row => (
              <div
                key={row.label}
                className="flex justify-between items-center py-2.5 border-b border-[var(--border-soft)] last:border-0"
              >
                <span className="text-sm text-[var(--text-secondary)]">{row.label}</span>
                <span
                  className={`font-mono text-sm ${row.bold ? "font-bold" : "font-medium"}`}
                  style={{ color: row.color }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scenario context */}
      {worstCase && (
        <div className="bg-[var(--accent-red)]/4 border border-[var(--accent-red)]/20 rounded p-4">
          <div className="text-[10px] font-mono text-[var(--accent-red)] uppercase tracking-wider mb-2">
            Stress Scenario Context — ±10% FX Shock
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-[10px] text-[var(--text-tertiary)]">Shocked Spot Rate</div>
              <div className="font-mono font-semibold text-[var(--text-primary)]">{worstCase.shocked_spot.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--text-tertiary)]">Unhedged Impact (USD)</div>
              <div className="font-mono font-semibold text-[var(--accent-red)]">{fmtUSD(worstCase.total_unhedged_usd)}</div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--text-tertiary)]">Hedged Impact (USD)</div>
              <div className="font-mono font-semibold text-[var(--accent-green)]">{fmtUSD(worstCase.total_hedged_usd)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
