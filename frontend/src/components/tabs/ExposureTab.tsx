"use client";

/**
 * ExposureTab.tsx
 *
 * Institutional-grade exposure & bucket analysis.
 *
 * Sections:
 *   E1  KPI strip — gross/net/residual/coverage
 *   E2  Confirmed vs Forecast split (stacked bar analogue)
 *   E3  ExposureChart (existing chart component)
 *   E4  Full per-bucket detail table with per-bucket coverage
 *   E5  Basis risk summary
 *   E6  HedgePlanTable (existing component)
 */

import type { HedgePlan, BucketResult, PolicyConfig } from '../../api/types';
import { fmtMXN, fmtPct } from '../../utils/formatters';
import ExposureChart from '../results/ExposureChart';
import HedgePlanTable from '../results/HedgePlanTable';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  hedgePlan: HedgePlan;
  policy?:   PolicyConfig;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bucketCoverage(b: BucketResult): number {
  const exp = Math.abs(b.commercial_exposure_mxn);
  if (exp === 0) return 0;
  return Math.abs(b.hedge_position_mxn) / exp;
}

function coverageColor(ratio: number): string {
  return ratio >= 0.95 ? 'var(--accent-green)'
    : ratio >= 0.70 ? 'var(--accent-amber)'
    : 'var(--accent-red)';
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

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

function KpiStrip({ items }: { items: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {items.map(item => (
        <div
          key={item.label}
          className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4"
        >
          <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
            {item.label}
          </div>
          <div className="text-lg font-mono font-bold" style={{ color: item.color ?? 'var(--text-primary)' }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExposureTab({ hedgePlan, policy }: Props) {
  const { buckets, summary } = hedgePlan;

  const activeBuckets     = buckets.filter(b => !b.suppressed);
  const suppressedBuckets = buckets.filter(b => b.suppressed);

  // Aggregate confirmed vs forecast
  const totalConfirmed = buckets.reduce((s, b) => s + Math.abs(b.confirmed_flow_mxn), 0);
  const totalForecast  = buckets.reduce((s, b) => s + Math.abs(b.forecast_flow_mxn), 0);
  const totalGross     = Math.abs(summary.total_commercial_exposure_mxn);
  const confirmedPct   = totalGross > 0 ? totalConfirmed / totalGross : 0;
  const forecastPct    = totalGross > 0 ? totalForecast  / totalGross : 0;

  const covRatio = totalGross > 0
    ? Math.abs(summary.total_hedge_position_mxn) / totalGross
    : 0;

  // ── E1: KPI strip ──────────────────────────────────────────────────────────
  const kpis = [
    { label: 'Gross Exposure',   value: fmtMXN(summary.total_commercial_exposure_mxn), color: 'var(--text-primary)' },
    { label: 'Net Hedge Position', value: fmtMXN(summary.total_hedge_position_mxn), color: 'var(--accent-cyan)' },
    { label: 'Residual Exposure', value: fmtMXN(summary.total_residual_mxn),
      color: Math.abs(summary.total_residual_mxn) < totalGross * 0.05 ? 'var(--accent-green)' : 'var(--accent-red)' },
    { label: 'Portfolio Coverage', value: fmtPct(covRatio), color: coverageColor(covRatio) },
  ];

  return (
    <div className="space-y-6">

      {/* E1 — KPI strip */}
      <KpiStrip items={kpis} />

      {/* E2 — Confirmed vs Forecast split */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead index="E2" title="Confirmed vs Forecast Composition" badge="Flow Classification" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Stacked proportion bar */}
          <div>
            <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Exposure by Flow Type
            </div>
            <div className="flex h-8 rounded overflow-hidden border border-[var(--border-rim)]">
              {totalConfirmed > 0 && (
                <div
                  className="flex items-center justify-center text-[9px] font-mono text-white font-bold"
                  style={{
                    width: `${confirmedPct * 100}%`,
                    background: 'var(--accent-green)',
                  }}
                  title={`Confirmed: ${fmtMXN(totalConfirmed)}`}
                >
                  {confirmedPct > 0.12 ? `${(confirmedPct * 100).toFixed(0)}%` : ''}
                </div>
              )}
              {totalForecast > 0 && (
                <div
                  className="flex items-center justify-center text-[9px] font-mono text-white font-bold"
                  style={{
                    width: `${forecastPct * 100}%`,
                    background: 'var(--accent-amber)',
                    opacity: 0.85,
                  }}
                  title={`Forecast: ${fmtMXN(totalForecast)}`}
                >
                  {forecastPct > 0.12 ? `${(forecastPct * 100).toFixed(0)}%` : ''}
                </div>
              )}
            </div>
            <div className="flex gap-4 mt-2 text-[10px] font-mono">
              <span style={{ color: 'var(--accent-green)' }}>
                ■ Confirmed {fmtPct(confirmedPct)}
              </span>
              <span style={{ color: 'var(--accent-amber)' }}>
                ■ Forecast {fmtPct(forecastPct)}
              </span>
            </div>
          </div>

          {/* Notional breakdown */}
          <div className="space-y-2 text-[11px] font-mono">
            {[
              { label: 'Confirmed Flows', value: fmtMXN(totalConfirmed), color: 'var(--accent-green)' },
              { label: 'Forecast Flows',  value: fmtMXN(totalForecast),  color: 'var(--accent-amber)' },
              { label: 'Gross Total',     value: fmtMXN(totalGross),     color: 'var(--text-primary)', bold: true },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center py-1.5 border-b border-[var(--border-soft)] last:border-0">
                <span className="text-[var(--text-tertiary)]">{r.label}</span>
                <span className={r.bold ? 'font-bold' : ''} style={{ color: r.color }}>{r.value}</span>
              </div>
            ))}
            {policy && (
              <>
                <div className="flex justify-between items-center py-1.5 border-b border-[var(--border-soft)]">
                  <span className="text-[var(--text-tertiary)]">Confirmed Target Ratio</span>
                  <span style={{ color: 'var(--accent-green)' }}>{fmtPct(policy.hedge_ratios.confirmed)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-[var(--text-tertiary)]">Forecast Target Ratio</span>
                  <span style={{ color: 'var(--accent-amber)' }}>{fmtPct(policy.hedge_ratios.forecast)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* E3 — Exposure chart */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead index="E3" title="Exposure by Bucket" badge="Visual" />
        <ExposureChart buckets={buckets} />
      </div>

      {/* E4 — Per-bucket detail table */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded overflow-hidden">
        <div className="px-5 py-3 bg-[var(--bg-deep)] border-b border-[var(--border-soft)] flex items-center gap-3">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">E4</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Per-Bucket Hedge Detail
          </span>
          <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-1.5 py-0.5 tracking-wider uppercase ml-auto">
            {activeBuckets.length} Active · {suppressedBuckets.length} Suppressed
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead className="bg-[var(--bg-deep)]">
              <tr className="border-b border-[var(--border-soft)]">
                {[
                  'Bucket', 'Confirmed', 'Forecast', 'Gross Exp.',
                  'Existing Hedge', 'New Action', 'Net Position',
                  'Residual', 'Coverage', 'Fwd Rate',
                ].map(h => (
                  <th scope="col" key={h} className="text-left px-3 py-2 text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeBuckets.map(b => {
                const cov = bucketCoverage(b);
                return (
                  <tr key={b.bucket} className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--bg-deep)] transition-colors">
                    <td className="px-3 py-2.5 font-medium text-[var(--text-primary)] whitespace-nowrap">{b.bucket}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--accent-green)' }}>{fmtMXN(b.confirmed_flow_mxn)}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--accent-amber)' }}>{fmtMXN(b.forecast_flow_mxn)}</td>
                    <td className="px-3 py-2.5 text-[var(--text-primary)]">{fmtMXN(b.commercial_exposure_mxn)}</td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">{fmtMXN(b.existing_hedges_mxn)}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--accent-indigo)' }}>{fmtMXN(b.action_mxn)}</td>
                    <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--accent-cyan)' }}>{fmtMXN(b.hedge_position_mxn)}</td>
                    <td className="px-3 py-2.5" style={{ color: Math.abs(b.residual_mxn) < Math.abs(b.commercial_exposure_mxn) * 0.05 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {fmtMXN(b.residual_mxn)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-rim)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(100, cov * 100)}%`, background: coverageColor(cov) }}
                          />
                        </div>
                        <span style={{ color: coverageColor(cov) }}>{fmtPct(cov)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--accent-cyan)' }}>{b.forward_rate.toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
            {activeBuckets.length > 0 && (
              <tfoot className="bg-[var(--bg-deep)] border-t-2 border-[var(--border-rim)]">
                <tr>
                  <td className="px-3 py-2.5 font-bold text-[var(--text-primary)]">TOTAL</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--accent-green)' }}>{fmtMXN(totalConfirmed)}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--accent-amber)' }}>{fmtMXN(totalForecast)}</td>
                  <td className="px-3 py-2.5 font-bold text-[var(--text-primary)]">{fmtMXN(summary.total_commercial_exposure_mxn)}</td>
                  <td className="px-3 py-2.5 font-bold text-[var(--text-secondary)]">{fmtMXN(summary.total_existing_hedges_mxn)}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--accent-indigo)' }}>{fmtMXN(summary.total_action_mxn)}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--accent-cyan)' }}>{fmtMXN(summary.total_hedge_position_mxn)}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--accent-red)' }}>{fmtMXN(summary.total_residual_mxn)}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: coverageColor(covRatio) }}>{fmtPct(covRatio)}</td>
                  <td className="px-3 py-2.5 text-[var(--text-tertiary)]">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Suppressed buckets note */}
        {suppressedBuckets.length > 0 && (
          <div className="px-5 py-3 border-t border-[var(--border-soft)]"
            style={{ background: 'var(--accent-amber)/4' }}>
            <div className="text-[10px] font-mono text-[var(--accent-amber)] uppercase tracking-wider mb-1">
              Suppressed Buckets ({suppressedBuckets.length})
            </div>
            <div className="text-[11px] font-mono text-[var(--text-tertiary)]">
              {suppressedBuckets.map(b => b.bucket).join(' · ')} — action below minimum trade size, deferred to next eligible bucket.
            </div>
          </div>
        )}
      </div>

      {/* E5 — Basis risk summary */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead index="E5" title="Basis Risk Summary" badge="Structural" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] font-mono">
          <div>
            <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Tenor Mismatch Risk
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Active Tenors</span>
                <span className="text-[var(--text-primary)]">{activeBuckets.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Max Fwd Rate</span>
                <span style={{ color: 'var(--accent-cyan)' }}>
                  {activeBuckets.length > 0
                    ? Math.max(...activeBuckets.map(b => b.forward_rate)).toFixed(4)
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Min Fwd Rate</span>
                <span style={{ color: 'var(--accent-cyan)' }}>
                  {activeBuckets.length > 0
                    ? Math.min(...activeBuckets.map(b => b.forward_rate)).toFixed(4)
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Rate Dispersion</span>
                <span className="text-[var(--text-primary)]">
                  {activeBuckets.length > 1
                    ? (Math.max(...activeBuckets.map(b => b.forward_rate)) - Math.min(...activeBuckets.map(b => b.forward_rate))).toFixed(4)
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Hedge Ratio Compliance
            </div>
            <div className="space-y-1.5">
              {activeBuckets.map(b => {
                const cov = bucketCoverage(b);
                const target = 0.80; // minimum threshold
                const compliant = cov >= target;
                return (
                  <div key={b.bucket} className="flex justify-between">
                    <span className="text-[var(--text-tertiary)]">{b.bucket}</span>
                    <span style={{ color: compliant ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {fmtPct(cov)} {compliant ? '✓' : '⚠'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Friction by Bucket
            </div>
            <div className="space-y-1.5">
              {activeBuckets
                .filter(b => Math.abs(b.action_usd) > 0)
                .map(b => {
                  const bps = (b.friction_usd / Math.abs(b.action_usd)) * 10_000;
                  return (
                    <div key={b.bucket} className="flex justify-between">
                      <span className="text-[var(--text-tertiary)]">{b.bucket}</span>
                      <span style={{ color: 'var(--accent-amber)' }}>{bps.toFixed(1)} bps</span>
                    </div>
                  );
                })}
              {activeBuckets.filter(b => Math.abs(b.action_usd) > 0).length === 0 && (
                <span className="text-[var(--text-tertiary)]">No new actions</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* E6 — HedgePlanTable (full detail) */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead index="E6" title="Hedge Plan Detail Table" badge="Full Bucket Register" />
        <HedgePlanTable plan={hedgePlan} />
      </div>

    </div>
  );
}
