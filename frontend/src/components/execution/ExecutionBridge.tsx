"use client";

import { useState, useEffect, useRef } from 'react';
import type { HedgePlan, ScenarioResults } from '../../api/types';
import { mapBucketToInstrument } from '../../utils/symbolMapper';
import { getTradingViewSymbol } from '../../utils/currencySymbolMap';
import BucketTicketCard from './BucketTicketCard';
import TradingViewEmbed from './TradingViewEmbed';

interface Props {
  hedgePlan: HedgePlan;
  scenarioResults: ScenarioResults;
  runId: string;
  /** If provided, scroll to this bucket card on mount */
  focusBucket?: string;
  /** Base currency for the hedge (derived from market context). Defaults to 'MXN'. */
  baseCcy?: string;
}

export default function ExecutionBridge({
  hedgePlan,
  scenarioResults,
  runId,
  focusBucket,
  baseCcy = 'MXN',
}: Props) {
  const [instrumentType, setInstrumentType] = useState<'NDF' | 'FUTURES'>('NDF');
  const [activeChartIdx, setActiveChartIdx] = useState(0);
  const focusRef = useRef<HTMLDivElement>(null);

  // Scroll to focused bucket on mount
  useEffect(() => {
    if (focusBucket && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusBucket]);

  const activeBuckets = hedgePlan.buckets.filter(b => !b.suppressed);
  const suppressedBuckets = hedgePlan.buckets.filter(b => b.suppressed);

  // Build chart symbols list — spot always available, plus per-bucket instruments in futures mode
  const spotSymbol = getTradingViewSymbol(baseCcy);
  const spotLabel = (() => {
    // PRICE_CCY quotes as CCY/USD; others as USD/CCY
    const PRICE_CCY = new Set(['EUR', 'GBP', 'AUD', 'NZD', 'CHF']);
    return PRICE_CCY.has(baseCcy) ? `${baseCcy}/USD Spot` : `USD/${baseCcy} Spot`;
  })();

  const symbolSet = new Map<string, string>();
  symbolSet.set(spotSymbol, spotLabel);
  for (const b of activeBuckets) {
    const m = mapBucketToInstrument(b.bucket, instrumentType, b.action_mxn, b.forward_rate, baseCcy);
    if (m.tradingview_symbol !== spotSymbol) {
      symbolSet.set(m.tradingview_symbol, m.display_label);
    }
  }
  const chartSymbols = Array.from(symbolSet.entries()).map(([symbol, label]) => ({ symbol, label }));
  const activeChart = chartSymbols[Math.min(activeChartIdx, chartSymbols.length - 1)] ?? chartSymbols[0];

  // Find worst-case scenario per bucket (sigma = -0.10 or +0.10, whichever has lower hedge_benefit_usd)
  function getWorstCase(bucket: string) {
    const matches = scenarioResults.per_bucket.filter(
      s => s.bucket === bucket && (s.sigma === -0.10 || s.sigma === 0.10),
    );
    if (matches.length === 0) return null;
    return matches.reduce((worst, cur) =>
      cur.hedge_benefit_usd < worst.hedge_benefit_usd ? cur : worst,
    );
  }

  // ── Empty state: all buckets suppressed ──────────────────────────────────────
  if (activeBuckets.length === 0) {
    return (
      <div className="space-y-6">
        {/* Empty state card */}
        <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded-sm p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Execution Desk</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Run {runId.slice(0, 8)}…
              </p>
            </div>
          </div>

          <div className="border border-[var(--border-soft)] rounded-sm p-5 text-center">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">
              No execution required
            </p>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              All buckets were suppressed by policy rules.
            </p>

            {/* Suppression detail table */}
            {suppressedBuckets.length > 0 && (
              <div className="mt-4 text-left border border-[var(--border-soft)] rounded-sm overflow-hidden">
                <div className="bg-[var(--bg-sub)] px-4 py-2 border-b border-[var(--border-soft)]">
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)] tracking-widest uppercase">
                    Suppressed Buckets — Reason &amp; Detail
                  </span>
                </div>
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="border-b border-[var(--border-soft)]">
                      {['Bucket', 'Net Exposure', 'Action', 'Action USD', 'Reason'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-[var(--text-tertiary)] font-normal text-[10px] uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suppressedBuckets.map(b => {
                      const actionUsdAbs = Math.abs(b.action_usd);
                      return (
                        <tr key={b.bucket} className="border-b border-[var(--border-soft)] last:border-0">
                          <td className="px-4 py-2 text-[var(--accent-cyan)]">{b.bucket}</td>
                          <td className="px-4 py-2 text-[var(--text-primary)]">
                            {b.commercial_exposure_mxn.toLocaleString('en', { maximumFractionDigits: 0 })} {baseCcy}
                          </td>
                          <td className="px-4 py-2 text-[var(--text-primary)]">
                            {b.action_mxn !== 0
                              ? `${b.action_mxn > 0 ? '+' : ''}${b.action_mxn.toLocaleString('en', { maximumFractionDigits: 0 })} ${baseCcy}`
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-[var(--text-secondary)]">
                            ${actionUsdAbs.toLocaleString('en', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-4 py-2 text-[var(--accent-amber)] text-[10px]">
                            {b.action_mxn === 0
                              ? 'Zero net exposure'
                              : `Below min trade threshold`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[10px] text-[var(--text-tertiary)] mt-4">
              To generate execution tickets, lower the minimum trade size in Policy
              settings or add more exposure so each bucket exceeds the threshold.
            </p>
          </div>
        </div>

        {/* Chart still shows for market reference */}
        <div className="rounded-sm border border-[var(--border-rim)] bg-[var(--bg-panel)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-soft)]">
            <h4 className="font-semibold text-[var(--text-primary)]">Market Reference Chart</h4>
          </div>
          <div className="h-[360px] w-full">
            <TradingViewEmbed key={spotSymbol} symbol={spotSymbol} />
          </div>
          <p className="text-sm text-[var(--text-secondary)] text-center py-2 border-t border-[var(--border-soft)]">
            Chart is informational; calculations use MarketSnapshot.
          </p>
        </div>
      </div>
    );
  }

  // ── Execution Summary numbers ─────────────────────────────────────────────
  const totalNotional = activeBuckets.reduce((s, b) => s + Math.abs(b.action_mxn), 0);
  const totalNotionalUsd = activeBuckets.reduce((s, b) => s + Math.abs(b.action_usd), 0);
  const totalFriction = activeBuckets.reduce((s, b) => s + b.friction_usd, 0);
  const topBucket = activeBuckets.reduce(
    (max, b) => Math.abs(b.action_mxn) > Math.abs(max.action_mxn) ? b : max,
    activeBuckets[0],
  );

  // ── Active buckets ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Execution Summary panel */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] tracking-widest">ED-00</span>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>Execution Summary</h3>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-1.5 py-0.5">Run {runId.slice(0, 8)}…</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Trade Tickets",       value: String(activeBuckets.length),                                  color: "var(--accent-cyan)" },
            { label: "Total Notional",       value: totalNotional.toLocaleString('en', { maximumFractionDigits: 0 }) + ` ${baseCcy}`, color: "var(--text-primary)" },
            { label: "USD Equiv",            value: `$${totalNotionalUsd.toLocaleString('en', { maximumFractionDigits: 0 })}`, color: "var(--text-primary)" },
            { label: "Est. Friction",        value: `$${totalFriction.toLocaleString('en', { maximumFractionDigits: 0 })}`,     color: "var(--accent-amber)" },
            { label: "Top Bucket",           value: topBucket?.bucket ?? "—",                                     color: "var(--accent-indigo)" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-3">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{k.label}</div>
              <div className="font-mono font-bold mt-0.5" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
        {suppressedBuckets.length > 0 && (
          <p className="text-[10px] font-mono text-[var(--accent-amber)] mt-3">
            ⚠ {suppressedBuckets.length} bucket{suppressedBuckets.length > 1 ? "s" : ""} suppressed (below min trade threshold): {suppressedBuckets.map(b => b.bucket).join(", ")}
          </p>
        )}
      </div>

      {/* Card 1: Execution Desk header + bucket cards */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded-sm p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Execution Desk</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Trade instructions derived from HedgeCalc run {runId.slice(0, 8)}…
            </p>
          </div>

          <div className="flex items-center gap-1 bg-[var(--bg-deep)] rounded-full p-0.5">
            <button
              onClick={() => setInstrumentType('NDF')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                instrumentType === 'NDF'
                  ? 'bg-[var(--accent-cyan)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              NDF
            </button>
            <button
              onClick={() => setInstrumentType('FUTURES')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                instrumentType === 'FUTURES'
                  ? 'bg-[var(--accent-cyan)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Futures Proxy
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {activeBuckets.map(b => {
            const mapping = mapBucketToInstrument(b.bucket, instrumentType, b.action_mxn, b.forward_rate, baseCcy);
            const worstCase = getWorstCase(b.bucket);
            const isFocus = b.bucket === focusBucket;
            return (
              <div key={b.bucket} ref={isFocus ? focusRef : undefined}>
                <BucketTicketCard
                  bucket={b}
                  mapping={mapping}
                  worstCase={worstCase}
                  runId={runId}
                  baseCcy={baseCcy}
                />
              </div>
            );
          })}
        </div>

        {/* Show suppressed buckets as collapsed notice */}
        {suppressedBuckets.length > 0 && (
          <div className="mt-2 border-t border-[var(--border-soft)] pt-3">
            <p className="text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--accent-amber)]">
                {suppressedBuckets.length} bucket{suppressedBuckets.length > 1 ? 's' : ''} suppressed
              </span>{' '}
              (below min trade threshold):{' '}
              {suppressedBuckets.map(b => b.bucket).join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Card 2: Dedicated chart panel */}
      <div className="rounded-sm border border-[var(--border-rim)] bg-[var(--bg-panel)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-soft)]">
          <h4 className="font-semibold text-[var(--text-primary)]">Market Chart</h4>
          {chartSymbols.length > 1 && (
            <div className="flex gap-2">
              {chartSymbols.map((s, i) => (
                <button
                  key={s.symbol}
                  onClick={() => setActiveChartIdx(i)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    i === activeChartIdx
                      ? 'bg-[var(--accent-cyan)] text-white border-[var(--accent-cyan)]'
                      : 'bg-[var(--bg-sub)] text-[var(--text-secondary)] border-[var(--border-rim)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="h-[420px] md:h-[560px] w-full">
          {activeChart && <TradingViewEmbed key={activeChart.symbol} symbol={activeChart.symbol} />}
        </div>
        <p className="text-sm text-[var(--text-secondary)] text-center py-2 border-t border-[var(--border-soft)]">
          Chart is informational; calculations use MarketSnapshot.
        </p>
      </div>
    </div>
  );
}
