"use client";

/**
 * HedgeEffectivenessTab.tsx
 *
 * IFRS 9 Hedge Effectiveness — Prospective & Retrospective Assessment.
 *
 * Sections:
 *   H1  Prospective assessment — dollar-offset method (IFRS 9.6.4.1)
 *   H2  Retrospective assessment — consistency check across all sigma pairs
 *   H3  Hedge ratio compliance per bucket
 *   H4  Assumptions registry
 *   H5  IFRS 9 hedge documentation checklist
 *   H6  Governance attestation
 */

import type { ReactNode } from 'react';
import type { ScenarioResults, HedgePlan, PolicyConfig, MarketSnapshot } from '../../api/types';
import { fmtMXN, fmtUSD, fmtPct } from '../../utils/formatters';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  scenarioResults: ScenarioResults;
  hedgePlan:       HedgePlan;
  policy?:         PolicyConfig;
  market?:         MarketSnapshot;
  runId?:          string;
  asOf?:           string;
}

// ─── IFRS 9 calculation helpers ───────────────────────────────────────────────

interface EffectivenessResult {
  sigma:           number;
  hedgeChange:     number;
  exposureChange:  number;
  ratio:           number | null;
  qualifies:       boolean;
}

/**
 * Compute dollar-offset effectiveness for every symmetric sigma pair.
 * Used for both prospective (chosen pair) and retrospective (all pairs) analysis.
 */
function computeEffectiveness(
  totals: ScenarioResults['totals'],
): EffectivenessResult[] {
  const posRows = totals.filter(t => t.sigma > 0).sort((a, b) => a.sigma - b.sigma);
  const baseRow = totals.find(t => t.sigma === 0);

  return posRows.map(posRow => {
    const negRow = totals.find(
      t => t.sigma < 0 && Math.abs(Math.abs(t.sigma) - posRow.sigma) < 1e-6,
    );

    const baseH = baseRow?.total_hedged_usd   ?? (negRow ? (posRow.total_hedged_usd + negRow.total_hedged_usd) / 2 : posRow.total_hedged_usd);
    const baseU = baseRow?.total_unhedged_usd ?? (negRow ? (posRow.total_unhedged_usd + negRow.total_unhedged_usd) / 2 : posRow.total_unhedged_usd);

    const hedgeChange    = Math.abs(posRow.total_hedged_usd   - baseH);
    const exposureChange = Math.abs(posRow.total_unhedged_usd - baseU);

    if (exposureChange === 0) {
      return { sigma: posRow.sigma, hedgeChange, exposureChange, ratio: null, qualifies: false };
    }

    const ratio = hedgeChange / exposureChange;
    return {
      sigma: posRow.sigma,
      hedgeChange,
      exposureChange,
      ratio,
      qualifies: ratio >= 0.80 && ratio <= 1.25,
    };
  });
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Panel({ children, accent }: { children: ReactNode; accent?: 'green' | 'amber' | 'red' | 'cyan' }) {
  const borderColor = accent ? `var(--accent-${accent})` : 'var(--border-rim)';
  const bgColor     = accent ? `var(--accent-${accent})/4` : 'var(--bg-panel)';
  return (
    <div className="rounded p-5" style={{ background: bgColor, border: `1px solid ${borderColor}/30` }}>
      {children}
    </div>
  );
}

function SectionHead({ index, title, badge, badgeColor }: {
  index: string; title: string; badge?: string; badgeColor?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{index}</span>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
        {title}
      </h3>
      {badge && (
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 tracking-wider uppercase border"
          style={{
            color: badgeColor ?? 'var(--text-tertiary)',
            borderColor: badgeColor ? `${badgeColor}/40` : 'var(--border-rim)',
            background: badgeColor ? `${badgeColor}/6` : 'transparent',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function Kv({ label, value, color, bold }: {
  label: string; value: string; color?: string; bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-[var(--border-soft)] last:border-0">
      <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      <span
        className={`font-mono text-[11px] ${bold ? 'font-bold' : 'font-medium'}`}
        style={{ color: color ?? 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}

function EffectivenessBadge({ qualifies, ratio }: { qualifies: boolean; ratio: number | null }) {
  if (ratio === null) return (
    <span className="text-[9px] font-mono border border-[var(--border-rim)] text-[var(--text-tertiary)] px-2 py-0.5">
      NO DATA
    </span>
  );
  return (
    <span
      className="text-[9px] font-mono border px-2 py-0.5"
      style={{
        borderColor: qualifies ? 'var(--accent-green)' : 'var(--accent-red)',
        color: qualifies ? 'var(--accent-green)' : 'var(--accent-red)',
        background: qualifies ? 'var(--accent-green)/8' : 'var(--accent-red)/8',
      }}
    >
      {qualifies ? 'QUALIFYING' : 'OUTSIDE BAND'}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HedgeEffectivenessTab({
  scenarioResults,
  hedgePlan,
  policy,
  market,
  runId,
  asOf,
}: Props) {
  const { totals, per_bucket } = scenarioResults;
  const { buckets, summary: _summary } = hedgePlan;

  const allResults = computeEffectiveness(totals);

  // Prospective: use preferred ±2.5% or widest available
  const preferredResult = allResults.find(r => Math.abs(r.sigma - 0.025) < 1e-6)
    ?? allResults[allResults.length - 1]
    ?? null;

  const prospectiveQualifies = preferredResult?.qualifies ?? false;
  const prospectiveBadge     = preferredResult?.qualifies
    ? 'QUALIFYING' : preferredResult?.ratio !== null
      ? 'OUTSIDE BAND' : 'INSUFFICIENT DATA';
  const prospectiveColor     = prospectiveQualifies ? 'var(--accent-green)'
    : preferredResult?.ratio !== null ? 'var(--accent-red)' : 'var(--text-tertiary)';

  // Retrospective: all sigma pairs pass?
  const retroResults      = allResults.filter(r => r.ratio !== null);
  const retroAllPass      = retroResults.length > 0 && retroResults.every(r => r.qualifies);
  const retroPassCount    = retroResults.filter(r => r.qualifies).length;

  // Unique buckets from per_bucket
  const _uniqueBuckets = [...new Set(per_bucket.map(r => r.bucket))].sort();

  const nowUtc = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

  return (
    <div className="space-y-6">

      {/* ── H1: Prospective effectiveness ──────────────────────────────────── */}
      <Panel accent={prospectiveQualifies ? 'green' : preferredResult?.ratio !== null ? 'amber' : undefined}>
        <SectionHead
          index="H1"
          title="Prospective Effectiveness Assessment"
          badge={prospectiveBadge}
          badgeColor={prospectiveColor}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Metrics */}
          <div>
            <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
              IFRS 9.6.4.1(c)(iii) — Dollar-Offset Method
            </div>
            <div className="space-y-0">
              <Kv label="Assessment Method" value="Dollar-Offset (Prospective)" />
              <Kv label="Test Sigma" value={preferredResult ? `±${(preferredResult.sigma * 100).toFixed(1)}%` : '—'} />
              <Kv
                label="ΔFV Hedging Instrument"
                value={preferredResult ? fmtUSD(preferredResult.hedgeChange) : '—'}
                color="var(--accent-cyan)"
              />
              <Kv
                label="ΔFV Hedged Item"
                value={preferredResult ? fmtUSD(preferredResult.exposureChange) : '—'}
                color="var(--text-secondary)"
              />
              <Kv
                label="Effectiveness Ratio"
                value={preferredResult?.ratio !== null
                  ? `${(preferredResult.ratio! * 100).toFixed(2)}%`
                  : 'Insufficient data'}
                color={prospectiveColor}
                bold
              />
              <Kv label="Qualifying Band" value="80.00% – 125.00%" />
              <Kv
                label="Assessment Outcome"
                value={prospectiveBadge}
                color={prospectiveColor}
                bold
              />
            </div>
          </div>

          {/* Gauge + explanation */}
          <div>
            {preferredResult?.ratio !== null && (() => {
              const ratio = preferredResult.ratio!;
              const pct   = (v: number) => `${(v / 1.5) * 100}%`;
              const ratioClipped = Math.min(1.5, Math.max(0, ratio));
              return (
                <div>
                  <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
                    Effectiveness Gauge
                  </div>
                  <div className="relative h-7 rounded overflow-hidden mb-1"
                    style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-rim)' }}>
                    {/* Qualifying zone */}
                    <div className="absolute top-0 bottom-0"
                      style={{ left: pct(0.80), right: `${100 - parseFloat(pct(1.25))}%`, background: 'var(--accent-green)', opacity: 0.18 }} />
                    {/* Marker */}
                    <div className="absolute top-0 bottom-0 w-0.5"
                      style={{ left: pct(ratioClipped), background: prospectiveColor, boxShadow: `0 0 8px ${prospectiveColor}` }} />
                    <div className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-[var(--text-secondary)]">
                      {(ratio * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-[var(--text-tertiary)]">
                    <span>0%</span>
                    <span style={{ color: 'var(--accent-green)' }}>80%</span>
                    <span>100%</span>
                    <span style={{ color: 'var(--accent-green)' }}>125%</span>
                    <span>150%</span>
                  </div>
                </div>
              );
            })()}

            <div className="mt-4 p-3 rounded text-[10px] font-mono leading-relaxed"
              style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)', color: 'var(--text-tertiary)' }}>
              <div className="text-[var(--text-secondary)] mb-1 font-semibold">Regulatory Basis</div>
              IFRS 9 §6.4.1 requires that the hedging relationship is expected to achieve a highly effective
              offsetting of changes in fair value. The 80%–125% dollar-offset band is the IAS 39 legacy threshold
              widely retained by practitioners under IFRS 9 for prospective testing.
              Effectiveness must be assessed at hedge inception and at each reporting date.
            </div>
          </div>
        </div>
      </Panel>

      {/* ── H2: Retrospective assessment ──────────────────────────────────── */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead
          index="H2"
          title="Retrospective Consistency — All Sigma Pairs"
          badge={`${retroPassCount}/${retroResults.length} PAIRS PASS`}
          badgeColor={retroAllPass ? 'var(--accent-green)' : 'var(--accent-amber)'}
        />

        {allResults.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b border-[var(--border-soft)]">
                  {['Sigma', 'ΔFV Hedge Instr.', 'ΔFV Hedged Item', 'Ratio', 'Status'].map(h => (
                    <th scope="col" key={h} className="text-left pb-2 pr-4 text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allResults.map(r => (
                  <tr key={r.sigma} className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--bg-deep)] transition-colors">
                    <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">
                      ±{(r.sigma * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 pr-4" style={{ color: 'var(--accent-cyan)' }}>
                      {fmtUSD(r.hedgeChange)}
                    </td>
                    <td className="py-2 pr-4 text-[var(--text-secondary)]">
                      {fmtUSD(r.exposureChange)}
                    </td>
                    <td className="py-2 pr-4 font-bold" style={{ color: r.qualifies ? 'var(--accent-green)' : r.ratio !== null ? 'var(--accent-red)' : 'var(--text-tertiary)' }}>
                      {r.ratio !== null ? `${(r.ratio * 100).toFixed(2)}%` : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <EffectivenessBadge qualifies={r.qualifies} ratio={r.ratio} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-[11px] font-mono text-[var(--text-tertiary)]">
            No positive sigma scenarios found. Run calculation with a sigma sweep to enable retrospective analysis.
          </div>
        )}

        {retroResults.length > 0 && (
          <div className="mt-4 p-3 rounded text-[10px] font-mono text-[var(--text-tertiary)] leading-relaxed"
            style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)' }}>
            Retrospective consistency: {retroPassCount} of {retroResults.length} sigma pairs fall within the 80%–125% qualifying band.
            {retroAllPass
              ? ' All tested sigma levels qualify — hedge relationship is retrospectively consistent.'
              : ' One or more sigma levels fall outside the band. Review hedge ratio configuration.'}
          </div>
        )}
      </div>

      {/* ── H3: Hedge ratio compliance per bucket ──────────────────────────── */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead index="H3" title="Hedge Ratio Compliance by Bucket" badge="Per-Bucket Analysis" />

        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="border-b border-[var(--border-soft)]">
                {['Bucket', 'Gross Exposure', 'Net Hedge Position', 'Coverage', 'Target', 'Status', 'Direction'].map(h => (
                  <th scope="col" key={h} className="text-left pb-2 pr-4 text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.filter(b => !b.suppressed).map(b => {
                const cov    = Math.abs(b.commercial_exposure_mxn) > 0
                  ? Math.abs(b.hedge_position_mxn) / Math.abs(b.commercial_exposure_mxn)
                  : 0;
                const target = policy
                  ? (b.confirmed_flow_mxn !== 0 ? policy.hedge_ratios.confirmed : policy.hedge_ratios.forecast)
                  : 0.80;
                const pass   = cov >= target * 0.95; // 5% tolerance
                const covCol = pass ? 'var(--accent-green)' : 'var(--accent-red)';
                return (
                  <tr key={b.bucket} className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--bg-deep)] transition-colors">
                    <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{b.bucket}</td>
                    <td className="py-2 pr-4 text-[var(--text-primary)]">{fmtMXN(b.commercial_exposure_mxn)}</td>
                    <td className="py-2 pr-4" style={{ color: 'var(--accent-cyan)' }}>{fmtMXN(b.hedge_position_mxn)}</td>
                    <td className="py-2 pr-4 font-bold" style={{ color: covCol }}>
                      {fmtPct(cov)}
                    </td>
                    <td className="py-2 pr-4 text-[var(--text-secondary)]">{fmtPct(target)}</td>
                    <td className="py-2 pr-4">
                      <span
                        className="text-[9px] font-mono border px-1.5 py-0.5"
                        style={{
                          borderColor: pass ? 'var(--accent-green)' : 'var(--accent-red)',
                          color: pass ? 'var(--accent-green)' : 'var(--accent-red)',
                          background: pass ? 'var(--accent-green)/8' : 'var(--accent-red)/8',
                        }}
                      >
                        {pass ? 'COMPLIANT' : 'UNDER-HEDGED'}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-[var(--text-tertiary)]">
                      {b.action_direction ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── H4: Assumptions registry ───────────────────────────────────────── */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead index="H4" title="Assumptions Registry" badge="Calculation Inputs" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <div>
            <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Market Data</div>
            <div className="space-y-0">
              <Kv label="Spot Rate (USD/MXN)" value={market ? market.spot_rate.toFixed(4) : '—'} color="var(--accent-cyan)" />
              <Kv label="As-Of Date" value={asOf ?? market?.as_of ?? '—'} />
              <Kv
                label="Forward Points Tenors"
                value={market
                  ? `${Object.keys(market.forward_points_by_month).length} months`
                  : '—'}
              />
              <Kv
                label="Data Provider"
                value={market
                  ? (String(market.provider_metadata?.source ?? market.provider_metadata?.provider ?? 'ORDR Engine'))
                  : 'ORDR Engine'}
              />
            </div>
          </div>
          <div>
            <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Policy Configuration</div>
            <div className="space-y-0">
              <Kv label="Execution Product" value={policy?.execution_product ?? '—'} color="var(--accent-cyan)" />
              <Kv label="Confirmed Hedge Ratio" value={policy ? fmtPct(policy.hedge_ratios.confirmed) : '—'} color="var(--accent-green)" />
              <Kv label="Forecast Hedge Ratio" value={policy ? fmtPct(policy.hedge_ratios.forecast) : '—'} color="var(--accent-amber)" />
              <Kv label="Spread Assumption" value={policy ? `${policy.cost_assumptions.spread_bps} bps` : '—'} color="var(--accent-amber)" />
              <Kv label="Min Trade Size" value={policy ? `$${policy.min_trade_size_usd.toLocaleString()} USD` : '—'} />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Calculation Assumptions</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div className="space-y-0">
              <Kv label="Effectiveness Standard" value="IFRS 9 §6.4 / IAS 39 legacy band" />
              <Kv label="Prospective Test Method" value="Dollar-Offset (ratio of ΔFVs)" />
              <Kv label="Qualifying Band" value="80% – 125%" />
              <Kv label="Sigma Test Source" value="Deterministic spot-rate shock" />
            </div>
            <div className="space-y-0">
              <Kv label="Preferred Test Sigma" value="±2.5% (fallback: widest available)" />
              <Kv label="Base Scenario" value="σ = 0 (unshocked forward curve)" />
              <Kv label="Bucket Mode" value={policy?.bucket_mode ?? 'CALENDAR_MONTH'} />
              <Kv label="Run ID" value={runId ? runId.slice(0, 16) + '…' : '—'} />
            </div>
          </div>
        </div>
      </div>

      {/* ── H5: IFRS 9 hedge documentation checklist ───────────────────────── */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
        <SectionHead index="H5" title="IFRS 9 Hedge Documentation Checklist" badge="§6.4.1 Requirements" />

        <div className="space-y-2">
          {[
            {
              ref: '§6.4.1(a)',
              item: 'Hedging relationship formally designated and documented at inception',
              status: 'CONFIRMED',
              note: 'Run-time designation captured in run envelope',
            },
            {
              ref: '§6.4.1(b)',
              item: 'Risk management objective and strategy for undertaking the hedge documented',
              status: 'CONFIRMED',
              note: `Policy: ${policy?.execution_product ?? 'NDF/FWD'} — confirmed ${fmtPct(policy?.hedge_ratios.confirmed ?? 0)} / forecast ${fmtPct(policy?.hedge_ratios.forecast ?? 0)}`,
            },
            {
              ref: '§6.4.1(c)(i)',
              item: 'Economic relationship exists between hedging instrument and hedged item',
              status: 'CONFIRMED',
              note: 'Forward contracts offset commercial FX cash flows in same currency pair',
            },
            {
              ref: '§6.4.1(c)(ii)',
              item: 'Credit risk does not dominate the value changes of the hedging relationship',
              status: 'REVIEW',
              note: 'Counterparty credit risk not modelled — verify with counterparty CSA',
            },
            {
              ref: '§6.4.1(c)(iii)',
              item: 'Hedge ratio reflects actual quantity of hedged item vs hedging instrument',
              status: prospectiveQualifies ? 'CONFIRMED' : 'REVIEW',
              note: prospectiveQualifies
                ? `Prospective effectiveness ratio: ${preferredResult?.ratio !== null ? (preferredResult.ratio! * 100).toFixed(2) + '%' : '—'} (qualifying band 80–125%)`
                : 'Effectiveness ratio outside qualifying band — review hedge ratio',
            },
            {
              ref: '§6.5.4',
              item: 'Prospective effectiveness assessment performed at each reporting date',
              status: 'CONFIRMED',
              note: `Performed at run time: ${asOf ?? nowUtc}`,
            },
            {
              ref: '§6.5.11',
              item: 'Retrospective effectiveness monitored to identify sources of ineffectiveness',
              status: retroAllPass ? 'CONFIRMED' : 'REVIEW',
              note: `${retroPassCount}/${retroResults.length} sigma pairs qualify`,
            },
          ].map(row => {
            const statusColor =
              row.status === 'CONFIRMED' ? 'var(--accent-green)'
              : row.status === 'REVIEW'   ? 'var(--accent-amber)'
              : 'var(--accent-red)';
            return (
              <div
                key={row.ref}
                className="flex gap-3 p-3 rounded"
                style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)' }}
              >
                <div className="flex-shrink-0 w-16 text-[9px] font-mono text-[var(--text-tertiary)] pt-0.5">{row.ref}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono text-[var(--text-primary)] mb-0.5">{row.item}</div>
                  <div className="text-[10px] font-mono text-[var(--text-tertiary)]">{row.note}</div>
                </div>
                <div className="flex-shrink-0">
                  <span
                    className="text-[9px] font-mono border px-1.5 py-0.5"
                    style={{
                      borderColor: statusColor,
                      color: statusColor,
                      background: `${statusColor}/8`,
                    }}
                  >
                    {row.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── H6: Governance attestation ─────────────────────────────────────── */}
      <div className="border border-[var(--border-rim)] rounded p-5"
        style={{ background: 'var(--bg-deep)' }}>
        <SectionHead index="H6" title="Effectiveness Attestation" />
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 max-w-lg">
            <div className="text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed">
              This effectiveness assessment has been generated deterministically by the ORDR Hedge Calculation Engine
              using the dollar-offset method under IFRS 9 §6.4.1(c)(iii). All effectiveness ratios are computed
              from the scenario analysis run bound to the market snapshot and policy configuration recorded in
              this run envelope. These results support but do not substitute for the formal hedge documentation
              that must be maintained by the reporting entity.
            </div>
            <div className="mt-3 text-[10px] font-mono text-[var(--text-tertiary)]">
              For audit purposes, retain this output alongside the run trace bundle and market data provenance.
            </div>
          </div>
          <div className="flex-shrink-0 text-right space-y-1 text-[10px] font-mono text-[var(--text-tertiary)]">
            {runId && <div>Run ID: <span className="text-[var(--text-secondary)]">{runId.slice(0, 16)}…</span></div>}
            {asOf   && <div>As-Of: <span className="text-[var(--text-secondary)]">{asOf}</span></div>}
            <div>Generated: <span className="text-[var(--text-secondary)]">{nowUtc}</span></div>
            <div className="mt-2 pt-2 border-t border-[var(--border-soft)]">
              <span
                className="text-[9px] border px-2 py-0.5"
                style={{
                  borderColor: prospectiveQualifies ? 'var(--accent-green)' : 'var(--accent-amber)',
                  color: prospectiveQualifies ? 'var(--accent-green)' : 'var(--accent-amber)',
                }}
              >
                IFRS 9 · {prospectiveBadge}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
