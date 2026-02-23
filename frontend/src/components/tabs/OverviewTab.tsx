"use client";

/**
 * OverviewTab.tsx
 *
 * Committee Summary — institutional-grade hedge plan overview.
 *
 * Sections:
 *   S1  8-KPI primary grid
 *   S2  Coverage decomposition bar
 *   S3  Stress tail-risk & P&L range band
 *   S4  IFRS 9.6.4.1 prospective effectiveness (dollar-offset method)
 *   S5  Forward rate schedule by bucket
 *   S6  Policy parameters reference
 *   S7  Summary ledger (reconciliation)
 *   S8  Attestation footer
 */

import type { ReactNode } from 'react';
import type { HedgePlanSummary, ScenarioTotalResult, BucketResult, PolicyConfig } from '../../api/types';
import { fmtMXN, fmtUSD, fmtPct } from '../../utils/formatters';
import CoverageBar from './CoverageBar';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  summary:   HedgePlanSummary;
  totals:    ScenarioTotalResult[];
  buckets?:  BucketResult[];
  policy?:   PolicyConfig;
  runId?:    string;
  asOf?:     string;
  spotRate?: number;
}

// ─── Pure helper functions ────────────────────────────────────────────────────

function coverageRatio(s: HedgePlanSummary): number {
  const d = Math.abs(s.total_commercial_exposure_mxn);
  return d === 0 ? 0 : Math.abs(s.total_hedge_position_mxn) / d;
}

function worstCase(totals: ScenarioTotalResult[]): ScenarioTotalResult | null {
  if (!totals.length) return null;
  return totals.reduce((w, t) =>
    t.total_hedge_benefit_usd < w.total_hedge_benefit_usd ? t : w,
  );
}

function bestCase(totals: ScenarioTotalResult[]): ScenarioTotalResult | null {
  if (!totals.length) return null;
  return totals.reduce((b, t) =>
    t.total_hedge_benefit_usd > b.total_hedge_benefit_usd ? t : b,
  );
}

function tailRiskReduction(totals: ScenarioTotalResult[]): number | null {
  const wc = worstCase(totals);
  if (!wc || wc.total_unhedged_usd === 0) return null;
  return Math.abs(wc.total_hedge_benefit_usd) / Math.abs(wc.total_unhedged_usd);
}

function avgBenefit(totals: ScenarioTotalResult[]): number {
  if (!totals.length) return 0;
  return totals.reduce((s, t) => s + t.total_hedge_benefit_usd, 0) / totals.length;
}

/**
 * IFRS 9.6.4.1 prospective effectiveness — dollar-offset method.
 *
 * Ratio = ΔFair Value of Hedging Instrument / ΔFair Value of Hedged Item
 *
 * We use the symmetric sigma pair with the largest absolute delta
 * (±2.5% preferred; falls back to widest available pair).
 *
 * Qualifying band: 80%–125%.
 */
function ifrs9Effectiveness(totals: ScenarioTotalResult[]): {
  ratio: number | null;
  qualifies: boolean;
  sigma: number | null;
  hedgeChange: number;
  exposureChange: number;
} {
  const nullResult = { ratio: null, qualifies: false, sigma: null, hedgeChange: 0, exposureChange: 0 };
  if (!totals.length) return nullResult;

  // Find symmetric pairs
  const pos = totals.filter(t => t.sigma > 0).sort((a, b) => a.sigma - b.sigma);
  const neg = totals.filter(t => t.sigma < 0).sort((a, b) => b.sigma - a.sigma);
  if (!pos.length || !neg.length) return nullResult;

  // Prefer ±2.5% (sigma = 0.025) or fall back to widest pair
  const preferredSigma = 0.025;
  const hasPref = pos.some(t => Math.abs(t.sigma - preferredSigma) < 1e-6);
  const chosenSigma = hasPref ? preferredSigma : Math.max(...pos.map(t => t.sigma));

  const posRow = pos.find(t => Math.abs(t.sigma - chosenSigma) < 1e-6);
  const negRow = neg.find(t => Math.abs(Math.abs(t.sigma) - chosenSigma) < 1e-6);
  if (!posRow || !negRow) return nullResult;

  // At sigma=0: baseline (use the zero-sigma row or approximate via average)
  const baseRow = totals.find(t => t.sigma === 0);
  const baseHedged   = baseRow?.total_hedged_usd   ?? (posRow.total_hedged_usd + negRow.total_hedged_usd) / 2;
  const baseUnhedged = baseRow?.total_unhedged_usd ?? (posRow.total_unhedged_usd + negRow.total_unhedged_usd) / 2;

  // Hedging instrument change: improvement in hedged P&L vs baseline (worst-case side)
  const hedgeChange    = Math.abs(posRow.total_hedged_usd   - baseHedged);
  const exposureChange = Math.abs(posRow.total_unhedged_usd - baseUnhedged);

  if (exposureChange === 0) return nullResult;

  const ratio = hedgeChange / exposureChange;
  const qualifies = ratio >= 0.80 && ratio <= 1.25;

  return { ratio, qualifies, sigma: chosenSigma, hedgeChange, exposureChange };
}

function allInCostBps(s: HedgePlanSummary): number | null {
  const notional = Math.abs(s.total_action_usd);
  if (notional === 0) return null;
  return (s.total_friction_usd / notional) * 10_000;
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function PanelHead({ label, badge }: { label: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
        {label}
      </h3>
      {badge && (
        <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-1.5 py-0.5 tracking-wider uppercase">
          {badge}
        </span>
      )}
    </div>
  );
}

function Panel({ children, accent }: { children: ReactNode; accent?: 'green' | 'amber' | 'red' | 'cyan' | 'indigo' }) {
  const borderColor = accent
    ? `var(--accent-${accent})/30`
    : 'var(--border-rim)';
  const bgColor = accent
    ? `var(--accent-${accent})/4`
    : 'var(--bg-panel)';
  return (
    <div
      className="rounded p-5"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      {children}
    </div>
  );
}

function KpiCard({
  label, value, sub, color, dim,
}: {
  label: string; value: string; sub?: string; color?: string; dim?: boolean;
}) {
  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4 kpi-tile-hover transition-all">
      <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
        {label}
      </div>
      <div
        className="text-xl font-mono font-bold leading-tight"
        style={{ color: color ?? (dim ? 'var(--text-tertiary)' : 'var(--text-primary)') }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] font-mono text-[var(--text-tertiary)] mt-1.5">{sub}</div>
      )}
    </div>
  );
}

function Kv({ label, value, color, bold, dim }: { label: string; value: string; color?: string; bold?: boolean; dim?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-[var(--border-soft)] last:border-0">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span
        className={`font-mono text-sm ${bold ? 'font-bold' : 'font-medium'}`}
        style={{ color: color ?? (dim ? 'var(--text-tertiary)' : 'var(--text-primary)') }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OverviewTab({ summary, totals, buckets, policy, runId, asOf, spotRate }: Props) {
  const cov      = coverageRatio(summary);
  const wc       = worstCase(totals);
  const bc       = bestCase(totals);
  const trr      = tailRiskReduction(totals);
  const avgB     = avgBenefit(totals);
  const eff      = ifrs9Effectiveness(totals);
  const costBps  = allInCostBps(summary);

  const covColor =
    cov >= 0.95 ? 'var(--accent-green)'
    : cov >= 0.70 ? 'var(--accent-amber)'
    : 'var(--accent-red)';

  const covLabel =
    cov >= 0.95 ? 'FULLY COVERED'
    : cov >= 0.70 ? 'PARTIALLY COVERED'
    : 'UNDER-HEDGED';

  const residLabel =
    summary.total_residual_mxn === 0 ? 'ZERO RESIDUAL'
    : Math.abs(summary.total_residual_mxn) < Math.abs(summary.total_commercial_exposure_mxn) * 0.05
      ? 'WITHIN TOLERANCE'
      : 'RESIDUAL EXISTS';

  const residColor =
    summary.total_residual_mxn === 0 ? 'var(--accent-green)'
    : Math.abs(summary.total_residual_mxn) < Math.abs(summary.total_commercial_exposure_mxn) * 0.05
      ? 'var(--accent-amber)'
      : 'var(--accent-red)';

  const effQualColor = eff.qualifies ? 'var(--accent-green)' : eff.ratio !== null ? 'var(--accent-red)' : 'var(--text-tertiary)';
  const effLabel     = eff.qualifies ? 'QUALIFYING' : eff.ratio !== null ? 'OUTSIDE BAND' : 'INSUFFICIENT DATA';

  // Active buckets (not suppressed)
  const activeBuckets = buckets?.filter(b => !b.suppressed && Math.abs(b.action_mxn) > 0) ?? [];

  const nowUtc = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

  return (
    <div className="space-y-6">

      {/* ── S1: 8-KPI Primary Grid ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Total Exposure"
          value={fmtMXN(summary.total_commercial_exposure_mxn)}
          sub="Commercial MXN"
          color="var(--text-primary)"
        />
        <KpiCard
          label="Portfolio Coverage"
          value={fmtPct(cov)}
          sub={covLabel}
          color={covColor}
        />
        <KpiCard
          label="Net Hedge Position"
          value={fmtMXN(summary.total_hedge_position_mxn)}
          sub="Existing + New action"
          color="var(--accent-cyan)"
        />
        <KpiCard
          label="Residual Exposure"
          value={fmtMXN(summary.total_residual_mxn)}
          sub={residLabel}
          color={residColor}
        />
        <KpiCard
          label="New Hedge Action"
          value={fmtMXN(summary.total_action_mxn)}
          sub={fmtUSD(summary.total_action_usd) + ' USD equivalent'}
          color={summary.total_action_mxn !== 0 ? 'var(--accent-indigo)' : 'var(--accent-green)'}
        />
        <KpiCard
          label="All-In Cost"
          value={costBps !== null ? `${costBps.toFixed(1)} bps` : 'N/A'}
          sub={`${fmtUSD(summary.total_friction_usd)} total spread`}
          color="var(--accent-amber)"
        />
        <KpiCard
          label="Tail Risk Reduction"
          value={trr !== null ? fmtPct(trr) : 'N/A'}
          sub="Worst-case hedge benefit"
          color={trr !== null && trr > 0.6 ? 'var(--accent-green)' : 'var(--accent-amber)'}
        />
        <KpiCard
          label="IFRS 9 Effectiveness"
          value={eff.ratio !== null ? fmtPct(eff.ratio) : 'N/A'}
          sub={effLabel}
          color={effQualColor}
        />
      </div>

      {/* ── S2: Coverage Decomposition ──────────────────────────────────────── */}
      <Panel>
        <PanelHead
          label="Coverage Decomposition"
          badge="Deterministic · Snapshot-Bound"
        />
        <CoverageBar
          totalExposure={summary.total_commercial_exposure_mxn}
          existingHedges={summary.total_existing_hedges_mxn}
          newAction={summary.total_action_mxn}
          residual={summary.total_residual_mxn}
        />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px] font-mono">
          {[
            { label: 'Gross Exposure', value: fmtMXN(summary.total_commercial_exposure_mxn), color: 'var(--text-primary)' },
            { label: 'Existing Hedges', value: fmtMXN(summary.total_existing_hedges_mxn), color: 'var(--text-secondary)' },
            { label: 'New Action', value: fmtMXN(summary.total_action_mxn), color: 'var(--accent-indigo)' },
            { label: 'Residual (Open)', value: fmtMXN(summary.total_residual_mxn), color: residColor },
          ].map(item => (
            <div key={item.label}>
              <div className="text-[var(--text-tertiary)] uppercase tracking-wider text-[9px] mb-1">{item.label}</div>
              <div className="font-bold" style={{ color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── S3: Stress Tail Risk & P&L Range Band ───────────────────────────── */}
      {wc && bc && (
        <Panel accent="red">
          <PanelHead
            label="Stress Scenario — Tail Risk & P&L Range"
            badge="Full Sigma Sweep"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                Worst-Case Scenario (σ = {wc.sigma > 0 ? '+' : ''}{(wc.sigma * 100).toFixed(1)}%)
              </div>
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] mb-2">
                Shocked spot: {wc.shocked_spot.toFixed(4)}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-tertiary)]">Unhedged P&L</span>
                  <span style={{ color: 'var(--accent-red)' }}>{fmtUSD(wc.total_unhedged_usd)}</span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-tertiary)]">Hedged P&L</span>
                  <span style={{ color: 'var(--accent-green)' }}>{fmtUSD(wc.total_hedged_usd)}</span>
                </div>
                <div className="flex justify-between text-[11px] font-mono border-t border-[var(--border-soft)] pt-1">
                  <span className="text-[var(--text-tertiary)]">Hedge Benefit</span>
                  <span className="font-bold" style={{ color: wc.total_hedge_benefit_usd >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {fmtUSD(wc.total_hedge_benefit_usd)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                Best-Case Scenario (σ = {bc.sigma > 0 ? '+' : ''}{(bc.sigma * 100).toFixed(1)}%)
              </div>
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] mb-2">
                Shocked spot: {bc.shocked_spot.toFixed(4)}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-tertiary)]">Unhedged P&L</span>
                  <span style={{ color: 'var(--accent-green)' }}>{fmtUSD(bc.total_unhedged_usd)}</span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-tertiary)]">Hedged P&L</span>
                  <span style={{ color: 'var(--accent-green)' }}>{fmtUSD(bc.total_hedged_usd)}</span>
                </div>
                <div className="flex justify-between text-[11px] font-mono border-t border-[var(--border-soft)] pt-1">
                  <span className="text-[var(--text-tertiary)]">Hedge Benefit</span>
                  <span className="font-bold" style={{ color: bc.total_hedge_benefit_usd >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {fmtUSD(bc.total_hedge_benefit_usd)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                P&L Protection Statistics
              </div>
              <div className="space-y-2 mt-2">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-tertiary)]">Tail Risk Reduction</span>
                  <span className="font-bold" style={{ color: trr !== null && trr > 0.5 ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                    {trr !== null ? fmtPct(trr) : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-tertiary)]">Avg Hedge Benefit</span>
                  <span className="font-bold" style={{ color: avgB >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {fmtUSD(avgB)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-tertiary)]">Scenarios Evaluated</span>
                  <span className="text-[var(--text-primary)]">{totals.length}</span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-tertiary)]">Sigma Range</span>
                  <span className="text-[var(--text-primary)]">
                    {totals.length > 0
                      ? `${(Math.min(...totals.map(t => t.sigma)) * 100).toFixed(1)}% / +${(Math.max(...totals.map(t => t.sigma)) * 100).toFixed(1)}%`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* P&L range visualiser */}
          {totals.length > 1 && (() => {
            const sorted = [...totals].sort((a, b) => a.sigma - b.sigma);
            const allUsd = sorted.map(t => t.total_hedged_usd);
            const minUsd = Math.min(...allUsd);
            const maxUsd = Math.max(...allUsd);
            const range  = maxUsd - minUsd || 1;
            return (
              <div>
                <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                  Hedged P&L Band — All Scenarios
                </div>
                <div className="flex items-end gap-px h-12">
                  {sorted.map(t => {
                    const h = Math.max(4, ((t.total_hedged_usd - minUsd) / range) * 48);
                    const isPositive = t.total_hedged_usd >= 0;
                    return (
                      <div
                        key={t.sigma}
                        className="flex-1 rounded-t-sm"
                        style={{
                          height: `${h}px`,
                          background: isPositive ? 'var(--accent-green)' : 'var(--accent-red)',
                          opacity: 0.7,
                        }}
                        title={`σ=${(t.sigma * 100).toFixed(1)}% → ${fmtUSD(t.total_hedged_usd)}`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[9px] font-mono text-[var(--text-tertiary)] mt-1">
                  <span>{(Math.min(...totals.map(t => t.sigma)) * 100).toFixed(1)}%</span>
                  <span>+{(Math.max(...totals.map(t => t.sigma)) * 100).toFixed(1)}%</span>
                </div>
              </div>
            );
          })()}
        </Panel>
      )}

      {/* ── S4: IFRS 9.6.4.1 Prospective Effectiveness ─────────────────────── */}
      <Panel accent={eff.qualifies ? 'green' : eff.ratio !== null ? 'amber' : undefined}>
        <PanelHead
          label="IFRS 9.6.4.1 — Prospective Effectiveness Assessment"
          badge="Dollar-Offset Method"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="space-y-0">
              <Kv label="Assessment Method" value="Dollar-Offset (Prospective)" />
              <Kv
                label="Effectiveness Ratio"
                value={eff.ratio !== null ? `${(eff.ratio * 100).toFixed(2)}%` : 'Insufficient data'}
                color={effQualColor}
                bold
              />
              <Kv
                label="Qualifying Band"
                value="80.00% – 125.00%"
                color="var(--text-secondary)"
              />
              <Kv
                label="Qualification Status"
                value={effLabel}
                color={effQualColor}
                bold
              />
              {eff.sigma !== null && (
                <Kv label="Test Sigma Used" value={`±${(eff.sigma * 100).toFixed(1)}%`} />
              )}
              <Kv
                label="Hedging Instrument ΔFV"
                value={eff.hedgeChange !== 0 ? fmtUSD(eff.hedgeChange) : '—'}
              />
              <Kv
                label="Hedged Item ΔFV"
                value={eff.exposureChange !== 0 ? fmtUSD(eff.exposureChange) : '—'}
              />
            </div>
          </div>

          {/* Effectiveness band visualiser */}
          <div>
            <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
              Effectiveness Band Gauge
            </div>
            {eff.ratio !== null ? (() => {
              const min = 0;
              const max = 1.5; // show 0–150%
              const band_lo = 0.80;
              const band_hi = 1.25;
              const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;
              const ratioClipped = Math.min(max, Math.max(min, eff.ratio));
              return (
                <div className="relative mt-2">
                  {/* Track */}
                  <div className="relative h-5 w-full rounded overflow-hidden"
                    style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-rim)' }}>
                    {/* Qualifying zone */}
                    <div
                      className="absolute top-0 bottom-0"
                      style={{
                        left: pct(band_lo),
                        right: `${100 - parseFloat(pct(band_hi))}%`,
                        background: 'var(--accent-green)',
                        opacity: 0.20,
                      }}
                    />
                    {/* Ratio marker */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5"
                      style={{
                        left: pct(ratioClipped),
                        background: effQualColor,
                        boxShadow: `0 0 6px ${effQualColor}`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-[var(--text-tertiary)] mt-1">
                    <span>0%</span>
                    <span className="text-[var(--accent-green)]">80%</span>
                    <span>100%</span>
                    <span className="text-[var(--accent-green)]">125%</span>
                    <span>150%</span>
                  </div>
                  <div className="mt-2 text-[10px] font-mono" style={{ color: effQualColor }}>
                    Ratio: {(eff.ratio * 100).toFixed(2)}% → {effLabel}
                  </div>
                </div>
              );
            })() : (
              <div className="text-[11px] font-mono text-[var(--text-tertiary)]">
                Insufficient scenario data to compute dollar-offset ratio.
                A minimum of one symmetric sigma pair is required.
              </div>
            )}

            {/* Regulatory note */}
            <div className="mt-4 p-3 rounded"
              style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)' }}>
              <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                Regulatory Basis
              </div>
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] leading-relaxed">
                IFRS 9 §6.4.1(c)(iii) requires prospective effectiveness within the 80%–125%
                dollar-offset band at each hedge designation date and subsequent reporting period.
                Retrospective assessment is complementary (see Effectiveness tab).
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* ── S5: Forward Rate Schedule ────────────────────────────────────────── */}
      {activeBuckets.length > 0 && (
        <Panel>
          <PanelHead
            label="Forward Rate Schedule by Bucket"
            badge={spotRate ? `Spot: ${spotRate.toFixed(4)}` : 'Forward Curve'}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b border-[var(--border-soft)]">
                  {['Bucket', 'Fwd Rate', 'Carry vs Spot', 'Action MXN', 'Action USD', 'Direction', 'Friction (bps)'].map(h => (
                    <th key={h} className="text-left pb-2 pr-4 text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeBuckets.map(b => {
                  const carryVsSpot = spotRate ? b.forward_rate - spotRate : null;
                  const frictionBps = Math.abs(b.action_usd) > 0
                    ? (b.friction_usd / Math.abs(b.action_usd)) * 10_000
                    : null;
                  const dirColor =
                    b.action_direction === 'SELL_MXN_BUY_USD' ? 'var(--accent-indigo)'
                    : b.action_direction === 'BUY_MXN_SELL_USD' ? 'var(--accent-cyan)'
                    : 'var(--text-tertiary)';
                  return (
                    <tr key={b.bucket} className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--bg-deep)] transition-colors">
                      <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{b.bucket}</td>
                      <td className="py-2 pr-4 text-[var(--accent-cyan)]">{b.forward_rate.toFixed(4)}</td>
                      <td className="py-2 pr-4" style={{ color: carryVsSpot === null ? 'var(--text-tertiary)' : carryVsSpot >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {carryVsSpot !== null ? `${carryVsSpot >= 0 ? '+' : ''}${carryVsSpot.toFixed(4)}` : '—'}
                      </td>
                      <td className="py-2 pr-4 text-[var(--text-primary)]">{fmtMXN(b.action_mxn)}</td>
                      <td className="py-2 pr-4 text-[var(--text-secondary)]">{fmtUSD(b.action_usd)}</td>
                      <td className="py-2 pr-4" style={{ color: dirColor }}>
                        {b.action_direction ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-[var(--accent-amber)]">
                        {frictionBps !== null ? `${frictionBps.toFixed(1)} bps` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {activeBuckets.length > 0 && (
                <tfoot className="border-t-2 border-[var(--border-rim)]">
                  <tr>
                    <td className="py-2 pr-4 font-bold text-[var(--text-primary)]">TOTAL</td>
                    <td className="py-2 pr-4 text-[var(--text-tertiary)]">—</td>
                    <td className="py-2 pr-4 text-[var(--text-tertiary)]">—</td>
                    <td className="py-2 pr-4 font-bold text-[var(--text-primary)]">{fmtMXN(summary.total_action_mxn)}</td>
                    <td className="py-2 pr-4 font-bold text-[var(--text-secondary)]">{fmtUSD(summary.total_action_usd)}</td>
                    <td className="py-2 pr-4 text-[var(--text-tertiary)]">—</td>
                    <td className="py-2 pr-4 font-bold text-[var(--accent-amber)]">
                      {costBps !== null ? `${costBps.toFixed(1)} bps` : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {activeBuckets.some(b => b.carry_note) && (
            <div className="mt-3 p-2 rounded text-[10px] font-mono text-[var(--text-tertiary)]"
              style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)' }}>
              <span className="text-[var(--accent-amber)] mr-2">CARRY NOTES:</span>
              {activeBuckets.filter(b => b.carry_note).map(b => `${b.bucket}: ${b.carry_note}`).join(' · ')}
            </div>
          )}
        </Panel>
      )}

      {/* ── S6: Policy Parameters Reference ─────────────────────────────────── */}
      {policy && (
        <Panel>
          <PanelHead
            label="Governing Policy Parameters"
            badge="Run-Time Configuration"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div className="space-y-0">
              <Kv label="Execution Product" value={policy.execution_product} color="var(--accent-cyan)" />
              <Kv label="Bucket Mode" value={policy.bucket_mode} />
              <Kv label="Confirmed Hedge Ratio" value={fmtPct(policy.hedge_ratios.confirmed)} color="var(--accent-green)" />
              <Kv label="Forecast Hedge Ratio" value={fmtPct(policy.hedge_ratios.forecast)} color="var(--accent-amber)" />
            </div>
            <div className="space-y-0">
              <Kv label="Spread Assumption" value={`${policy.cost_assumptions.spread_bps} bps`} color="var(--accent-amber)" />
              <Kv label="Min Trade Size" value={`$${policy.min_trade_size_usd.toLocaleString()} USD`} />
              <Kv label="Active Buckets" value={`${activeBuckets.length}`} />
              <Kv label="Suppressed Buckets" value={`${(buckets?.filter(b => b.suppressed) ?? []).length}`} dim />
            </div>
          </div>
        </Panel>
      )}

      {/* ── S7: Summary Ledger (Reconciliation) ─────────────────────────────── */}
      <Panel>
        <PanelHead label="Summary Ledger" badge="Full Reconciliation" />
        <div className="space-y-0">
          <Kv label="(A) Gross Commercial Exposure" value={fmtMXN(summary.total_commercial_exposure_mxn)} color="var(--text-primary)" bold />
          <Kv label="(B) Existing Hedges On Books" value={`(${fmtMXN(Math.abs(summary.total_existing_hedges_mxn))})`} color="var(--text-secondary)" />
          <Kv label="(C) New Hedge Action Required" value={`(${fmtMXN(Math.abs(summary.total_action_mxn))})`} color="var(--accent-indigo)" />
          <Kv
            label="(D) Net Hedge Position = B + C"
            value={fmtMXN(summary.total_hedge_position_mxn)}
            color="var(--accent-cyan)"
            bold
          />
          <Kv
            label="(E) Residual Exposure = A + D"
            value={fmtMXN(summary.total_residual_mxn)}
            color={residColor}
            bold
          />
          <Kv label="(F) Portfolio Coverage = D / A" value={fmtPct(cov)} color={covColor} bold />
          <div className="border-t border-[var(--border-rim)] mt-1 pt-3">
            <Kv label="Total Friction Cost (USD)" value={fmtUSD(summary.total_friction_usd)} color="var(--accent-amber)" />
            <Kv
              label="All-In Transaction Cost"
              value={costBps !== null ? `${costBps.toFixed(2)} bps on notional` : 'N/A'}
              color="var(--accent-amber)"
            />
            {wc && (
              <Kv
                label="Worst-Case Hedge Benefit (USD)"
                value={fmtUSD(wc.total_hedge_benefit_usd)}
                color={wc.total_hedge_benefit_usd >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
              />
            )}
          </div>
        </div>
      </Panel>

      {/* ── S8: Attestation Footer ───────────────────────────────────────────── */}
      <div className="border border-[var(--border-rim)] rounded p-5"
        style={{ background: 'var(--bg-deep)' }}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Attestation
            </div>
            <div className="text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed max-w-lg">
              This committee summary was generated deterministically by the ORDR Hedge Calculation Engine
              and is bound to a single market snapshot and policy configuration. All figures are
              indicative pending final execution confirmation. Results are not investment advice.
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Run Provenance
            </div>
            <div className="space-y-1 text-[10px] font-mono text-[var(--text-tertiary)]">
              {runId && <div>Run ID: <span className="text-[var(--text-secondary)]">{runId.slice(0, 16)}…</span></div>}
              {asOf  && <div>As-Of: <span className="text-[var(--text-secondary)]">{asOf}</span></div>}
              {spotRate && <div>Spot Rate: <span className="text-[var(--text-secondary)]">{spotRate.toFixed(4)}</span></div>}
              <div>Generated: <span className="text-[var(--text-secondary)]">{nowUtc}</span></div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
