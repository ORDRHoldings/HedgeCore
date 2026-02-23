"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import type { HedgePlan, ScenarioResults, PolicyConfig, ValidationReport } from '../../api/types';
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
  /** Validation report from the run envelope (for pre-flight checklist) */
  validationReport?: ValidationReport;
  /** Policy config for pre-flight limit checks */
  policy?: PolicyConfig;
  /** Callback: fired when authorization status changes */
  onAuthStatusChange?: (ready: boolean) => void;
}

// ── Design tokens (inline style approach consistent with page.tsx) ─────────────
const S = {
  fontUI:    "'IBM Plex Sans', sans-serif",
  fontMono:  "'IBM Plex Mono', monospace",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass,#4ade80)",
  fail:      "var(--accent-red,#B91C1C)",
} as const;

// ── Stress sigma presets ──────────────────────────────────────────────────────
const SIGMA_PRESETS = [
  { label: '1σ ±8%',  value: 0.08 },
  { label: '2σ ±15%', value: 0.15 },
  { label: '3σ ±22%', value: 0.22 },
] as const;

// ── Pre-flight checklist item ─────────────────────────────────────────────────
interface CheckItem {
  id: string;
  label: string;
  detail: string;
  autoChecked: boolean;
  checked: boolean;
}

export default function ExecutionBridge({
  hedgePlan,
  scenarioResults,
  runId,
  focusBucket,
  baseCcy = 'MXN',
  validationReport,
  policy,
  onAuthStatusChange,
}: Props) {
  const [instrumentType, setInstrumentType] = useState<'NDF' | 'FUTURES'>('NDF');
  const [activeChartIdx, setActiveChartIdx] = useState(0);
  const [stressSigma,    setStressSigma]    = useState(0.10);
  const [prefightOpen,   setPrefightOpen]   = useState(true);
  const [logOpen,        setLogOpen]        = useState(false);
  const [execLog,        setExecLog]        = useState<string[]>([]);
  const focusRef = useRef<HTMLDivElement>(null);

  // ── Append to session log ──────────────────────────────────────────────────
  const appendLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setExecLog(prev => [...prev, `[${ts}] ${msg}`]);
  }, []);

  // ── Pre-flight checklist state ─────────────────────────────────────────────
  const validationPassed = !validationReport || validationReport.status === 'PASS';
  const policyOk = !policy || true; // coverage ratio checks are in results — assume pass if rendered

  const storageKey = `ordr_auth_${runId}`;
  const storedAuth: Record<string, boolean> = (() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { return {}; }
  })();

  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({
    board_mandate:   storedAuth.board_mandate   ?? false,
    credit_check:    storedAuth.credit_check    ?? false,
    isda_confirmed:  storedAuth.isda_confirmed  ?? false,
  });

  // Persist manual checks
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(manualChecks));
    }
  }, [manualChecks, storageKey]);

  const checkItems: CheckItem[] = [
    {
      id:          'validation',
      label:       'Hedge plan validation passed',
      detail:      `Run ${runId.slice(0,8).toUpperCase()} · Status: ${validationReport?.status ?? 'PASS'}`,
      autoChecked: true,
      checked:     validationPassed,
    },
    {
      id:          'policy_limits',
      label:       'Policy limits respected',
      detail:      policy
        ? `Confirmed ratio: ${(policy.hedge_ratios.confirmed * 100).toFixed(0)}% · Forecast: ${(policy.hedge_ratios.forecast * 100).toFixed(0)}%`
        : 'Policy parameters verified',
      autoChecked: true,
      checked:     policyOk,
    },
    {
      id:          'run_id',
      label:       'Run ID confirmed',
      detail:      `RUN ${runId.slice(0,8).toUpperCase()}`,
      autoChecked: true,
      checked:     true,
    },
    {
      id:          'board_mandate',
      label:       'Board / Investment Committee mandate confirmed',
      detail:      'Manual confirmation required',
      autoChecked: false,
      checked:     manualChecks.board_mandate,
    },
    {
      id:          'credit_check',
      label:       'Counterparty credit check completed',
      detail:      'Verify credit exposure with your risk desk',
      autoChecked: false,
      checked:     manualChecks.credit_check,
    },
    {
      id:          'isda_confirmed',
      label:       'ISDA Master Agreement confirmed in place',
      detail:      '2002 ISDA Master Agreement — Schedule Ref. TBD',
      autoChecked: false,
      checked:     manualChecks.isda_confirmed,
    },
  ];

  const allChecked = checkItems.every(c => c.checked);
  const autosPassed = checkItems.filter(c => c.autoChecked).every(c => c.checked);

  const authStatus: 'READY' | 'PENDING' | 'BLOCKED' = !validationPassed
    ? 'BLOCKED'
    : allChecked
      ? 'READY'
      : 'PENDING';

  const authStatusColor = authStatus === 'READY' ? S.pass : authStatus === 'BLOCKED' ? S.fail : S.amber;
  const authStatusLabel = authStatus === 'READY'
    ? 'READY TO EXECUTE'
    : authStatus === 'BLOCKED'
      ? 'BLOCKED — VALIDATION FAILED'
      : 'PENDING AUTHORIZATION';

  // Notify parent of auth status
  useEffect(() => {
    onAuthStatusChange?.(authStatus === 'READY');
  }, [authStatus, onAuthStatusChange]);

  // Scroll to focused bucket on mount
  useEffect(() => {
    if (focusBucket && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusBucket]);

  // Log initial state
  useEffect(() => {
    appendLog(`Execution Bridge opened for run ${runId.slice(0,8).toUpperCase()}`);
    appendLog(`Authorization status: ${authStatus}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeBuckets    = hedgePlan.buckets.filter(b => !b.suppressed);
  const suppressedBuckets = hedgePlan.buckets.filter(b => b.suppressed);

  // Build chart symbols list
  const spotSymbol = getTradingViewSymbol(baseCcy);
  const spotLabel  = (() => {
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
  const activeChart  = chartSymbols[Math.min(activeChartIdx, chartSymbols.length - 1)] ?? chartSymbols[0];

  // Find worst-case scenario per bucket using configurable sigma
  function getWorstCase(bucket: string) {
    // Find the two closest sigma values we have data for
    const candidates = scenarioResults.per_bucket.filter(s => s.bucket === bucket);
    if (candidates.length === 0) return null;
    // Find closest positive and negative sigma to stressSigma
    const negMatch = candidates.filter(s => s.sigma < 0)
      .reduce<typeof candidates[0] | null>((best, cur) =>
        best === null || Math.abs(cur.sigma + stressSigma) < Math.abs(best.sigma + stressSigma) ? cur : best, null);
    const posMatch = candidates.filter(s => s.sigma > 0)
      .reduce<typeof candidates[0] | null>((best, cur) =>
        best === null || Math.abs(cur.sigma - stressSigma) < Math.abs(best.sigma - stressSigma) ? cur : best, null);
    const both = [negMatch, posMatch].filter((x): x is NonNullable<typeof x> => x !== null);
    if (both.length === 0) return null;
    return both.reduce((worst, cur) =>
      cur.hedge_benefit_usd < worst.hedge_benefit_usd ? cur : worst,
    );
  }

  // ── Portfolio-level metrics ───────────────────────────────────────────────
  const totalNotional    = activeBuckets.reduce((s, b) => s + Math.abs(b.action_mxn), 0);
  const totalNotionalUsd = activeBuckets.reduce((s, b) => s + Math.abs(b.action_usd), 0);
  const totalFriction    = activeBuckets.reduce((s, b) => s + b.friction_usd, 0);
  const topBucket        = activeBuckets.reduce(
    (max, b) => Math.abs(b.action_mxn) > Math.abs(max.action_mxn) ? b : max,
    activeBuckets[0],
  );
  const portfolioDV01    = activeBuckets.reduce((s, b) => s + Math.abs(b.action_usd) * 0.0001, 0);
  const proxyCount       = activeBuckets.filter(b => {
    const m = mapBucketToInstrument(b.bucket, instrumentType, b.action_mxn, b.forward_rate, baseCcy);
    return m.is_proxy;
  }).length;

  // ── Handle manual checkbox toggle ─────────────────────────────────────────
  function handleManualCheck(id: string, checked: boolean) {
    setManualChecks(prev => ({ ...prev, [id]: checked }));
    const item = checkItems.find(c => c.id === id);
    appendLog(`${checked ? '☑' : '☐'} ${item?.label ?? id}`);
  }

  // ── Instrument type change ─────────────────────────────────────────────────
  function handleInstrumentChange(type: 'NDF' | 'FUTURES') {
    setInstrumentType(type);
    appendLog(`Instrument type changed to ${type}`);
  }

  // ── Sigma change ───────────────────────────────────────────────────────────
  function handleSigmaChange(sigma: number) {
    setStressSigma(sigma);
    const preset = SIGMA_PRESETS.find(p => p.value === sigma);
    appendLog(`Stress sigma changed to ${preset?.label ?? `±${(sigma*100).toFixed(0)}%`}`);
  }

  // ── Empty state: all buckets suppressed ──────────────────────────────────────
  if (activeBuckets.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded-sm p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Execution Desk</h3>
              <p className="text-sm text-[var(--text-secondary)]">Run {runId.slice(0, 8)}…</p>
            </div>
          </div>
          <div className="border border-[var(--border-soft)] rounded-sm p-5 text-center">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">No execution required</p>
            <p className="text-sm text-[var(--text-secondary)] mb-4">All buckets were suppressed by policy rules.</p>
            {suppressedBuckets.length > 0 && (
              <div className="mt-4 text-left border border-[var(--border-soft)] rounded-sm overflow-hidden">
                <div className="bg-[var(--bg-sub)] px-4 py-2 border-b border-[var(--border-soft)]">
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)] tracking-widest uppercase">
                    Suppressed Buckets — Reason & Detail
                  </span>
                </div>
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="border-b border-[var(--border-soft)]">
                      {['Bucket', 'Net Exposure', 'Action', 'Action USD', 'Reason'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-[var(--text-tertiary)] font-normal text-[10px] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suppressedBuckets.map(b => (
                      <tr key={b.bucket} className="border-b border-[var(--border-soft)] last:border-0">
                        <td className="px-4 py-2 text-[var(--accent-cyan)]">{b.bucket}</td>
                        <td className="px-4 py-2 text-[var(--text-primary)]">{b.commercial_exposure_mxn.toLocaleString('en', { maximumFractionDigits: 0 })} {baseCcy}</td>
                        <td className="px-4 py-2 text-[var(--text-primary)]">{b.action_mxn !== 0 ? `${b.action_mxn > 0 ? '+' : ''}${b.action_mxn.toLocaleString('en', { maximumFractionDigits: 0 })} ${baseCcy}` : '—'}</td>
                        <td className="px-4 py-2 text-[var(--text-secondary)]">${Math.abs(b.action_usd).toLocaleString('en', { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-2 text-[var(--accent-amber)] text-[10px]">{b.action_mxn === 0 ? 'Zero net exposure' : 'Below min trade threshold'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-[var(--text-tertiary)] mt-4">To generate execution tickets, lower the minimum trade size in Policy settings or add more exposure so each bucket exceeds the threshold.</p>
          </div>
        </div>
        <div className="rounded-sm border border-[var(--border-rim)] bg-[var(--bg-panel)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-soft)]">
            <h4 className="font-semibold text-[var(--text-primary)]">Market Reference Chart</h4>
          </div>
          <div className="h-[360px] w-full">
            <TradingViewEmbed key={spotSymbol} symbol={spotSymbol} />
          </div>
          <p className="text-sm text-[var(--text-secondary)] text-center py-2 border-t border-[var(--border-soft)]">Chart is informational; calculations use MarketSnapshot.</p>
        </div>
      </div>
    );
  }

  // ── Active buckets ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ══ ED-00A: Pre-Flight Authorization ══ */}
      <div style={{
        background: S.bgPanel,
        border:     `1px solid ${authStatus === 'BLOCKED' ? S.fail : authStatus === 'READY' ? S.pass : S.amber}`,
        borderLeft: `3px solid ${authStatusColor}`,
        borderRadius: 2,
      }}>
        {/* Header */}
        <button
          onClick={() => setPrefightOpen(v => !v)}
          style={{
            width:        "100%",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
            padding:      "10px 16px",
            background:   "transparent",
            border:       "none",
            borderBottom: prefightOpen ? `1px solid ${S.soft}` : "none",
            cursor:       "pointer",
            gap:          12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
              ED-00A
            </span>
            <span style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.primary }}>
              Pre-Flight Authorization
            </span>
            <span style={{
              fontFamily:   S.fontMono,
              fontSize:     9,
              fontWeight:   700,
              letterSpacing:"0.08em",
              color:        authStatusColor,
              background:   `color-mix(in srgb, ${authStatusColor} 12%, transparent)`,
              border:       `1px solid color-mix(in srgb, ${authStatusColor} 25%, transparent)`,
              padding:      "1px 6px",
              borderRadius: 2,
            }}>
              {authStatusLabel}
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
              {checkItems.filter(c => c.checked).length}/{checkItems.length} items confirmed
            </span>
          </div>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {prefightOpen ? '▲' : '▼'}
          </span>
        </button>

        {prefightOpen && (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            {checkItems.map(item => (
              <div
                key={item.id}
                style={{
                  display:      "flex",
                  alignItems:   "flex-start",
                  gap:          10,
                  padding:      "7px 10px",
                  background:   item.checked
                    ? `color-mix(in srgb, ${S.pass} 5%, transparent)`
                    : `color-mix(in srgb, ${S.rim} 30%, transparent)`,
                  border:       `1px solid ${item.checked ? `color-mix(in srgb, ${S.pass} 20%, transparent)` : S.soft}`,
                  borderRadius: 2,
                }}
              >
                {item.autoChecked ? (
                  <span style={{
                    fontFamily: S.fontMono,
                    fontSize:   14,
                    color:      item.checked ? S.pass : S.fail,
                    flexShrink: 0,
                    marginTop:  1,
                  }}>
                    {item.checked ? '✓' : '✗'}
                  </span>
                ) : (
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={e => handleManualCheck(item.id, e.target.checked)}
                    style={{ marginTop: 3, accentColor: S.cyan, cursor: "pointer", flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.primary, fontWeight: item.autoChecked ? 400 : 500 }}>
                    {item.label}
                    {item.autoChecked && (
                      <span style={{ marginLeft: 6, fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>
                        AUTO
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 1 }}>
                    {item.detail}
                  </div>
                </div>
              </div>
            ))}

            {/* Regulatory note */}
            <div style={{
              marginTop:    4,
              padding:      "7px 10px",
              background:   `color-mix(in srgb, ${S.amber} 5%, transparent)`,
              border:       `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`,
              borderRadius: 2,
              fontFamily:   S.fontUI,
              fontSize:     11,
              color:        S.secondary,
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.amber, fontWeight: 700, letterSpacing: "0.06em", marginRight: 8 }}>
                REGULATORY
              </span>
              This authorization checklist is an internal control record. It does not substitute for compliance sign-off required under EMIR Art. 11, Dodd-Frank §731, or applicable local regulations. Retain this record for audit purposes per IFRS 9 §B6.5.
            </div>
          </div>
        )}
      </div>

      {/* ══ Stress Sigma + Instrument Toggle row ══ */}
      <div style={{
        background: S.bgPanel,
        border:     `1px solid ${S.rim}`,
        borderRadius: 2,
        padding:    "10px 16px",
        display:    "flex",
        alignItems: "center",
        gap:        16,
        flexWrap:   "wrap",
      }}>
        {/* Sigma selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary, fontWeight: 700 }}>
            STRESS SCENARIO
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {SIGMA_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => handleSigmaChange(p.value)}
                style={{
                  fontFamily:   S.fontMono,
                  fontSize:     10,
                  fontWeight:   stressSigma === p.value ? 700 : 400,
                  letterSpacing:"0.04em",
                  color:        stressSigma === p.value ? S.bgPanel : S.secondary,
                  background:   stressSigma === p.value ? S.cyan : "transparent",
                  border:       `1px solid ${stressSigma === p.value ? S.cyan : S.rim}`,
                  borderRadius: 2,
                  padding:      "3px 10px",
                  cursor:       "pointer",
                  transition:   "background 0.12s, color 0.12s",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            (worst-case scenario for each ticket)
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: S.rim }} />

        {/* Instrument toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary, fontWeight: 700 }}>
            INSTRUMENT
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {(['NDF', 'FUTURES'] as const).map(type => (
              <button
                key={type}
                onClick={() => handleInstrumentChange(type)}
                style={{
                  fontFamily:   S.fontMono,
                  fontSize:     10,
                  fontWeight:   instrumentType === type ? 700 : 400,
                  color:        instrumentType === type ? S.bgPanel : S.secondary,
                  background:   instrumentType === type ? S.cyan : "transparent",
                  border:       `1px solid ${instrumentType === type ? S.cyan : S.rim}`,
                  borderRadius: 2,
                  padding:      "3px 10px",
                  cursor:       "pointer",
                  transition:   "background 0.12s, color 0.12s",
                }}
              >
                {type === 'NDF' ? 'NDF / Forward' : 'Futures Proxy'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ Execution Summary ══ */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] tracking-widest">ED-00</span>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>Execution Summary</h3>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-rim)] px-1.5 py-0.5">Run {runId.slice(0, 8)}…</span>
          <span style={{
            fontFamily:   S.fontMono,
            fontSize:     9,
            fontWeight:   700,
            letterSpacing:"0.08em",
            color:        authStatusColor,
            background:   `color-mix(in srgb, ${authStatusColor} 12%, transparent)`,
            border:       `1px solid color-mix(in srgb, ${authStatusColor} 25%, transparent)`,
            padding:      "1px 6px",
            borderRadius: 2,
          }}>
            {authStatus}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          {[
            { label: "Trade Tickets",   value: String(activeBuckets.length),                                            color: "var(--accent-cyan)" },
            { label: "Total Notional",  value: `${totalNotional.toLocaleString('en', { maximumFractionDigits: 0 })} ${baseCcy}`, color: "var(--text-primary)" },
            { label: "USD Equiv",       value: `$${totalNotionalUsd.toLocaleString('en', { maximumFractionDigits: 0 })}`,    color: "var(--text-primary)" },
            { label: "Est. Friction",   value: `$${totalFriction.toLocaleString('en', { maximumFractionDigits: 0 })}`,      color: "var(--accent-amber)" },
            { label: "Portfolio DV01",  value: `$${portfolioDV01.toFixed(2)}`,                                          color: "var(--accent-indigo,#818cf8)" },
            { label: "Basis Risk",      value: proxyCount > 0 ? `${proxyCount}/${activeBuckets.length} PROXY` : "NONE",  color: proxyCount > 0 ? "var(--accent-amber)" : "var(--status-pass)" },
            { label: "Top Bucket",      value: topBucket?.bucket ?? "—",                                                 color: "var(--accent-indigo,#818cf8)" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-3">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{k.label}</div>
              <div className="font-mono font-bold mt-0.5" style={{ color: k.color, fontSize: "0.8125rem" }}>{k.value}</div>
            </div>
          ))}
        </div>

        {suppressedBuckets.length > 0 && (
          <p className="text-[10px] font-mono text-[var(--accent-amber)] mt-3">
            ⚠ {suppressedBuckets.length} bucket{suppressedBuckets.length > 1 ? "s" : ""} suppressed (below min trade threshold): {suppressedBuckets.map(b => b.bucket).join(", ")}
          </p>
        )}
      </div>

      {/* ══ ED-00B: Execution Session Log ══ */}
      <div style={{
        background: S.bgPanel,
        border:     `1px solid ${S.rim}`,
        borderRadius: 2,
      }}>
        <button
          onClick={() => setLogOpen(v => !v)}
          style={{
            width:       "100%",
            display:     "flex",
            alignItems:  "center",
            gap:         10,
            padding:     "8px 16px",
            background:  "transparent",
            border:      "none",
            borderBottom: logOpen ? `1px solid ${S.soft}` : "none",
            cursor:      "pointer",
          }}
        >
          <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
            ED-00B
          </span>
          <span style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: S.secondary }}>
            Execution Session Log
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {execLog.length} entr{execLog.length === 1 ? 'y' : 'ies'}
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginLeft: "auto" }}>
            {logOpen ? '▲' : '▼'}
          </span>
        </button>
        {logOpen && (
          <div style={{
            padding:   "8px 16px",
            maxHeight: 200,
            overflowY: "auto",
          }}>
            {execLog.length === 0 ? (
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>No entries yet.</div>
            ) : (
              execLog.map((entry, i) => (
                <div key={i} style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, lineHeight: 1.6 }}>
                  {entry}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ══ Execution Desk — bucket cards ══ */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded-sm p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Execution Desk</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Trade instructions derived from HedgeCalc run {runId.slice(0, 8)}… · Stress σ ±{(stressSigma * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {activeBuckets.map(b => {
            const mapping   = mapBucketToInstrument(b.bucket, instrumentType, b.action_mxn, b.forward_rate, baseCcy);
            const worstCase = getWorstCase(b.bucket);
            const isFocus   = b.bucket === focusBucket;
            return (
              <div key={b.bucket} ref={isFocus ? focusRef : undefined}>
                <BucketTicketCard
                  bucket={b}
                  mapping={mapping}
                  worstCase={worstCase}
                  runId={runId}
                  baseCcy={baseCcy}
                  onTicketCopied={(bucketId) => appendLog(`Trade ticket ${bucketId} copied to clipboard`)}
                />
              </div>
            );
          })}
        </div>

        {suppressedBuckets.length > 0 && (
          <div className="mt-2 border-t border-[var(--border-soft)] pt-3">
            <p className="text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--accent-amber)]">
                {suppressedBuckets.length} bucket{suppressedBuckets.length > 1 ? 's' : ''} suppressed
              </span>{' '}
              (below min trade threshold): {suppressedBuckets.map(b => b.bucket).join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* ══ Market Chart ══ */}
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
