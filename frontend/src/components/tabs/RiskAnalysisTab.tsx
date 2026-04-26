"use client";

/**
 * RiskAnalysisTab.tsx
 *
 * Institutional-grade scenario analysis and risk metrics.
 *
 * Sections:
 *   R1  Risk KPI strip — VaR proxy, CVaR proxy, max drawdown, protection ratio
 *   R2  ScenarioChart (existing component)
 *   R3  Per-bucket scenario heat matrix (colour-coded P&L)
 *   R4  IFRS 9 effectiveness band reference
 *   R5  Scenario totals table (existing component)
 *   R6  Risk narrative / interpretation
 */

import type { CSSProperties } from 'react';
import type { ScenarioResults, HedgePlanSummary } from '../../api/types';
import { fmtUSD, fmtPct } from '../../utils/formatters';
import ScenarioChart from '../results/ScenarioChart';
import ScenarioTable from '../results/ScenarioTable';
import RiskMetricsPanel from './RiskMetricsPanel';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  scenarioResults: ScenarioResults;
  summary:         HedgePlanSummary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** VaR proxy: worst hedged P&L across all sigma scenarios. */
function varProxy(scenarioResults: ScenarioResults): number {
  if (!scenarioResults.totals.length) return 0;
  return Math.min(...scenarioResults.totals.map(t => t.total_hedged_usd));
}

/** CVaR proxy: average of worst 25% of hedged P&L values. */
function cvarProxy(scenarioResults: ScenarioResults): number {
  const vals = [...scenarioResults.totals.map(t => t.total_hedged_usd)].sort((a, b) => a - b);
  if (!vals.length) return 0;
  const tail = vals.slice(0, Math.max(1, Math.floor(vals.length * 0.25)));
  return tail.reduce((s, v) => s + v, 0) / tail.length;
}

/** Maximum unhedged drawdown: worst unhedged scenario. */
function maxUnhedgedDrawdown(scenarioResults: ScenarioResults): number {
  if (!scenarioResults.totals.length) return 0;
  return Math.min(...scenarioResults.totals.map(t => t.total_unhedged_usd));
}

/** Protection ratio: avg benefit / avg unhedged loss (negative sigma side). */
function protectionRatio(scenarioResults: ScenarioResults): number | null {
  const adverse = scenarioResults.totals.filter(t => t.total_unhedged_usd < 0);
  if (!adverse.length) return null;
  const avgUnhedged = adverse.reduce((s, t) => s + t.total_unhedged_usd, 0) / adverse.length;
  const avgHedged   = adverse.reduce((s, t) => s + t.total_hedged_usd,   0) / adverse.length;
  if (avgUnhedged === 0) return null;
  return (avgHedged - avgUnhedged) / Math.abs(avgUnhedged);
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function SectionHead({ index, title, badge }: { index: string; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{index}</span>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
        {title}
      </h3>
      {badge && (
        <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-1.5 py-0.5 tracking-wider uppercase">
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RiskAnalysisTab({ scenarioResults, summary }: Props) {
  const { totals, per_bucket } = scenarioResults;

  const var95   = varProxy(scenarioResults);
  const cvar    = cvarProxy(scenarioResults);
  const maxDd   = maxUnhedgedDrawdown(scenarioResults);
  const protR   = protectionRatio(scenarioResults);

  // Unique buckets from per_bucket
  const uniqueBuckets  = [...new Set(per_bucket.map(r => r.bucket))].sort();
  const uniqueSigmas   = [...new Set(per_bucket.map(r => r.sigma))].sort((a, b) => a - b);

  // Build heat matrix: bucket × sigma → hedge_benefit_usd
  const heatMap: Record<string, Record<number, number>> = {};
  for (const row of per_bucket) {
    if (!heatMap[row.bucket]) heatMap[row.bucket] = {};
    heatMap[row.bucket][row.sigma] = row.hedge_benefit_usd;
  }

  // Min/max for heat normalisation
  const allBenefits = per_bucket.map(r => r.hedge_benefit_usd);
  const heatMin = Math.min(...allBenefits, 0);
  const heatMax = Math.max(...allBenefits, 0);
  const heatRange = heatMax - heatMin || 1;

  function heatCellStyle(benefit: number | undefined): CSSProperties {
    if (benefit === undefined) return { background: 'var(--bg-deep)', color: 'var(--text-tertiary)' };
    const norm = (benefit - heatMin) / heatRange;
    if (benefit >= 0) {
      return {
        background: `rgba(34,197,94,${0.1 + norm * 0.5})`,
        color: 'var(--accent-green)',
      };
    } else {
      const neg = 1 - (benefit - heatMin) / heatRange;
      return {
        background: `rgba(239,68,68,${0.1 + neg * 0.5})`,
        color: 'var(--accent-red)',
      };
    }
  }

  // IFRS 9 dollar-offset calculation (same logic as OverviewTab for consistency)
  const pos = totals.filter(t => t.sigma > 0).sort((a, b) => a.sigma - b.sigma);
  const neg = totals.filter(t => t.sigma < 0).sort((a, b) => b.sigma - a.sigma);
  let effRatio: number | null = null;
  if (pos.length && neg.length) {
    const preferredSigma = 0.025;
    const hasPref = pos.some(t => Math.abs(t.sigma - preferredSigma) < 1e-6);
    const chosenSigma = hasPref ? preferredSigma : Math.max(...pos.map(t => t.sigma));
    const posRow = pos.find(t => Math.abs(t.sigma - chosenSigma) < 1e-6);
    const negRow = neg.find(t => Math.abs(Math.abs(t.sigma) - chosenSigma) < 1e-6);
    if (posRow && negRow) {
      const baseRow = totals.find(t => t.sigma === 0);
      const baseH = baseRow?.total_hedged_usd   ?? (posRow.total_hedged_usd + negRow.total_hedged_usd) / 2;
      const baseU = baseRow?.total_unhedged_usd ?? (posRow.total_unhedged_usd + negRow.total_unhedged_usd) / 2;
      const hChg = Math.abs(posRow.total_hedged_usd - baseH);
      const uChg = Math.abs(posRow.total_unhedged_usd - baseU);
      if (uChg > 0) effRatio = hChg / uChg;
    }
  }
  const effQualifies = effRatio !== null && effRatio >= 0.80 && effRatio <= 1.25;

  return (
    <div className="space-y-6">

      {/* R1 — Risk KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'VaR (Worst Hedged)',
            value: fmtUSD(var95),
            sub: 'Max loss under hedge',
            color: var95 < 0 ? 'var(--accent-red)' : 'var(--accent-green)',
          },
          {
            label: 'CVaR (Tail Avg)',
            value: fmtUSD(cvar),
            sub: 'Avg of worst 25% scenarios',
            color: cvar < 0 ? 'var(--accent-red)' : 'var(--accent-green)',
          },
          {
            label: 'Max Unhedged Loss',
            value: fmtUSD(maxDd),
            sub: 'Worst unhedged scenario',
            color: 'var(--accent-red)',
          },
          {
            label: 'Protection Ratio',
            value: protR !== null ? fmtPct(protR) : 'N/A',
            sub: 'Avg loss mitigation (adverse)',
            color: protR !== null && protR > 0.5 ? 'var(--accent-green)' : 'var(--accent-amber)',
          },
        ].map(k => (
          <div key={k.label} className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4 kpi-tile-hover transition-all">
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">{k.label}</div>
            <div className="text-xl font-mono font-bold leading-tight" style={{ color: k.color }}>{k.value}</div>
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] mt-1.5">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* R2 — Scenario chart */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead index="R2" title="Scenario Analysis — Hedged vs Unhedged P&L" badge="Full Sigma Sweep" />
        <ScenarioChart totals={totals} />
      </div>

      {/* R3 — Per-bucket scenario heat matrix */}
      {uniqueBuckets.length > 0 && uniqueSigmas.length > 0 && (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded overflow-hidden">
          <div className="px-5 py-3 bg-[var(--bg-deep)] border-b border-[var(--border-soft)] flex items-center gap-3">
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]">R3</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Hedge Benefit Heat Matrix — Bucket × Sigma
            </span>
            <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-1.5 py-0.5 tracking-wider uppercase ml-auto">
              USD · Per Bucket
            </span>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="text-[10px] font-mono w-full">
              <thead>
                <tr>
                  <th scope="col" className="text-left pb-2 pr-4 text-[var(--text-tertiary)] font-medium uppercase text-[9px] tracking-wider">
                    Bucket
                  </th>
                  {uniqueSigmas.map(s => (
                    <th scope="col" key={s} className="text-center pb-2 px-2 text-[var(--text-tertiary)] font-medium whitespace-nowrap text-[9px] tracking-wider">
                      {s > 0 ? '+' : ''}{(s * 100).toFixed(1)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uniqueBuckets.map(bucket => (
                  <tr key={bucket} className="border-t border-[var(--border-soft)]">
                    <td className="py-1.5 pr-4 font-medium text-[var(--text-primary)] whitespace-nowrap">{bucket}</td>
                    {uniqueSigmas.map(s => {
                      const val = heatMap[bucket]?.[s];
                      return (
                        <td
                          key={s}
                          className="py-1.5 px-2 text-center rounded"
                          style={heatCellStyle(val)}
                          title={val !== undefined ? fmtUSD(val) : '—'}
                        >
                          {val !== undefined
                            ? (Math.abs(val) >= 1_000_000
                                ? `${(val / 1_000_000).toFixed(1)}M`
                                : Math.abs(val) >= 1_000
                                  ? `${(val / 1_000).toFixed(0)}K`
                                  : val.toFixed(0))
                            : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-6 mt-3 text-[9px] font-mono text-[var(--text-tertiary)]">
              <span>■ <span style={{ color: 'var(--accent-green)' }}>Green</span> = Positive hedge benefit (gain vs unhedged)</span>
              <span>■ <span style={{ color: 'var(--accent-red)' }}>Red</span> = Negative (hedge underperforms)</span>
            </div>
          </div>
        </div>
      )}

      {/* R4 — IFRS 9 Effectiveness band */}
      <div
        className="border rounded p-5"
        style={{
          background: effQualifies ? 'var(--accent-green)/4' : effRatio !== null ? 'var(--accent-amber)/4' : 'var(--bg-panel)',
          borderColor: effQualifies ? 'var(--accent-green)/30' : effRatio !== null ? 'var(--accent-amber)/30' : 'var(--border-rim)',
        }}
      >
        <SectionHead
          index="R4"
          title="IFRS 9.6.4.1 Effectiveness Band Reference"
          badge={effQualifies ? 'QUALIFYING' : effRatio !== null ? 'OUTSIDE BAND' : 'NO DATA'}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 text-[11px] font-mono">
            {[
              { label: 'Dollar-Offset Ratio', value: effRatio !== null ? `${(effRatio * 100).toFixed(2)}%` : 'Insufficient data', color: effQualifies ? 'var(--accent-green)' : effRatio !== null ? 'var(--accent-red)' : 'var(--text-tertiary)', bold: true },
              { label: 'Qualifying Band', value: '80.00% – 125.00%', color: 'var(--text-secondary)' },
              { label: 'Assessment', value: effQualifies ? 'QUALIFYING — Hedge designation maintainable' : effRatio !== null ? 'OUTSIDE BAND — Hedge may need rebalancing' : 'Insufficient sigma data', color: effQualifies ? 'var(--accent-green)' : 'var(--accent-amber)' },
              { label: 'Standard Reference', value: 'IFRS 9 §6.4.1(c)(iii)', color: 'var(--text-tertiary)' },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center py-2 border-b border-[var(--border-soft)] last:border-0">
                <span className="text-[var(--text-tertiary)]">{r.label}</span>
                <span className={r.bold ? 'font-bold' : ''} style={{ color: r.color }}>{r.value}</span>
              </div>
            ))}
          </div>
          <div>
            {/* Visual band */}
            {effRatio !== null && (() => {
              const min = 0, max = 1.5;
              const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;
              const ratioClipped = Math.min(max, Math.max(min, effRatio));
              const markerColor  = effQualifies ? 'var(--accent-green)' : 'var(--accent-red)';
              return (
                <div>
                  <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                    Effectiveness Gauge (0%–150%)
                  </div>
                  <div className="relative h-6 w-full rounded overflow-hidden"
                    style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-rim)' }}>
                    {/* Qualifying zone */}
                    <div className="absolute top-0 bottom-0"
                      style={{ left: pct(0.80), right: `${100 - parseFloat(pct(1.25))}%`, background: 'var(--accent-green)', opacity: 0.18 }} />
                    {/* Ratio marker */}
                    <div className="absolute top-0 bottom-0 w-0.5"
                      style={{ left: pct(ratioClipped), background: markerColor, boxShadow: `0 0 6px ${markerColor}` }} />
                    {/* Labels */}
                    <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-[var(--text-tertiary)]">
                      {(effRatio * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-[var(--text-tertiary)] mt-1">
                    <span>0%</span>
                    <span className="text-[var(--accent-green)]">80%</span>
                    <span>100%</span>
                    <span className="text-[var(--accent-green)]">125%</span>
                    <span>150%</span>
                  </div>
                  <div className="mt-3 p-2 rounded text-[10px] font-mono text-[var(--text-tertiary)] leading-relaxed"
                    style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)' }}>
                    Prospective effectiveness ratio {(effRatio * 100).toFixed(2)}% falls{' '}
                    {effQualifies
                      ? 'within the IFRS 9 qualifying band. Hedge designation is maintainable at this reporting date.'
                      : 'outside the IFRS 9 qualifying band. Consider rebalancing the hedge ratio or reviewing the designated hedging relationship.'}
                  </div>
                </div>
              );
            })()}
            {effRatio === null && (
              <div className="text-[11px] font-mono text-[var(--text-tertiary)] leading-relaxed">
                Dollar-offset ratio cannot be computed — requires at least one symmetric sigma pair (e.g. ±2.5%).
                Expand the sigma sweep in policy settings to enable this assessment.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* R5 — Existing RiskMetricsPanel */}
      <RiskMetricsPanel totals={totals} summary={summary} />

      {/* R6 — Scenario totals table */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead index="R6" title="Scenario Totals Register" badge={`${totals.length} Scenarios`} />
        <ScenarioTable totals={totals} />
      </div>

      {/* R7 — Risk narrative */}
      <div className="bg-[var(--bg-deep)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead index="R7" title="Risk Interpretation" badge="Automated Narrative" />
        <div className="text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed space-y-2">
          <p>
            <span className="text-[var(--accent-cyan)]">Worst-case hedged exposure:</span>{' '}
            {fmtUSD(var95)} — the maximum USD P&L impact under the hedged position across all {totals.length} sigma scenarios tested.
            {var95 >= 0
              ? ' The hedge delivers a positive outcome even in the worst-case scenario.'
              : ' A negative worst-case is expected for pay-fixed hedges under MXN appreciation scenarios.'}
          </p>
          <p>
            <span className="text-[var(--accent-amber)]">Tail risk (CVaR):</span>{' '}
            {fmtUSD(cvar)} average across the worst 25% of scenarios. This represents the expected loss
            conditional on adverse tail outcomes and is the primary stress metric for committee review.
          </p>
          {protR !== null && (
            <p>
              <span className="text-[var(--accent-green)]">Protection effectiveness:</span>{' '}
              The hedge mitigates {fmtPct(protR)} of adverse-scenario losses on average,
              {protR > 0.7
                ? ' indicating strong tail protection consistent with policy objectives.'
                : protR > 0.4
                  ? ' indicating moderate protection. Consider increasing hedge ratios for better coverage.'
                  : ' indicating limited protection. Hedge ratio and tenor alignment should be reviewed.'}
            </p>
          )}
          <p className="text-[var(--text-tertiary)] border-t border-[var(--border-soft)] pt-2 mt-2">
            All figures are indicative. Scenario analysis uses deterministic spot-rate shocks applied uniformly
            across all buckets at the market snapshot date. Correlations, volatility clustering, and jump
            diffusion effects are not modelled. For full VaR/CVaR analytics, integrate with a Monte Carlo engine.
          </p>
        </div>
      </div>

    </div>
  );
}
