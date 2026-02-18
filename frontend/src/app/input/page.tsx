"use client";

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type {
  TradeRow,
  HedgeRow,
  MarketSnapshot,
  PolicyConfig,
  ValidationErrorDetail,
} from '../../api/types';
import { useHedge } from '../../lib/hedgeContext';
import { calculate, uploadTradesCsv, uploadHedgesCsv } from '../../api/client';
import {
  DEFAULT_DEMO_POLICY,
  DEMO_FIXTURES,
} from '../../constants/demoData';
import type { DemoFixture, DemoStory } from '../../constants/demoData';
import { POLICY_PRESETS } from '../../constants/policyPresets';
import type { PolicyPreset } from '../../constants/policyPresets';
import { validateAll } from '../../utils/validator';
import { fmtCompact, fmtPct } from '../../utils/formatters';
import { deriveCurrencyContext } from '../../utils/currencyContext';

import StepSection from '../../components/input/StepSection';
import StepProgress from '../../components/input/StepProgress';
import type { StepKey } from '../../components/input/StepSection';
import TradeTable from '../../components/input/TradeTable';
import TradeModal from '../../components/input/TradeModal';
import HedgeModal from '../../components/input/HedgeModal';
import PolicyForm from '../../components/input/PolicyForm';
import CsvUploader from '../../components/input/CsvUploader';
import GovernanceStrip from '../../components/input/GovernanceStrip';
import StickyActionBar from '../../components/input/StickyActionBar';
import SnapshotSummary from '../../components/input/SnapshotSummary';
import Toast from '../../components/shared/Toast';

const EMPTY_MARKET: MarketSnapshot = {
  as_of: new Date().toISOString().slice(0, 19) + 'Z',
  spot_usdmxn: 0,
  forward_points_by_month: {},
  provider_metadata: { source: 'manual_user_input' },
};

const STEP_ORDER: StepKey[] = ['exposure', 'policy'];

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  bg: 'var(--bg-deep)',
  bgSub: 'var(--bg-sub)',
  bgPanel: 'var(--bg-panel)',
  border: 'var(--border-rim)',
  borderSoft: 'var(--border-soft)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textTertiary: 'var(--text-tertiary)',
  cyan: 'var(--accent-cyan)',
  amber: 'var(--accent-amber)',
  green: 'var(--status-pass)',
  red: 'var(--accent-red)',
  fontMono: "'IBM Plex Mono', monospace",
  fontUI: "'IBM Plex Sans', sans-serif",
};

// ─── Dataset Selector Panel ───────────────────────────────────────────────────
interface DatasetPanelProps {
  fixtures: DemoFixture[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  loading?: boolean;
}

function DatasetPanel({ fixtures, activeId, onSelect, loading }: DatasetPanelProps) {
  const [confirmId, setConfirmId] = useState<string | null | '__CLEAR__'>(undefined as unknown as null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = (id: string | null) => {
    if (id === activeId || (id === null && activeId === null)) return;
    setConfirmId(id);
    setShowConfirm(true);
  };

  const confirm = () => {
    onSelect(confirmId === null ? '__CLEAR__' : confirmId);
    setShowConfirm(false);
  };

  const confirmLabel = confirmId ? (fixtures.find(f => f.id === confirmId)?.label ?? 'Unknown') : 'Empty state';

  // Group fixtures
  const groups: { label: string; items: DemoFixture[] }[] = [
    { label: 'MXN / Latin America', items: fixtures.filter(f => ['F01', 'F02', 'F03', 'F04', 'F09'].some(p => f.id.includes(p))) },
    { label: 'Global Currencies', items: fixtures.filter(f => ['F05', 'F06', 'F07', 'F08', 'F10'].some(p => f.id.includes(p))) },
  ];
  const all = fixtures;

  return (
    <>
      <div style={{
        border: `1px solid ${S.border}`,
        background: S.bgPanel,
        marginBottom: 0,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: `1px solid ${S.border}`,
          background: S.bgSub,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.textTertiary, letterSpacing: '0.08em' }}>DATASET SELECTOR</span>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: S.textPrimary, fontFamily: S.fontUI }}>Load Scenario Dataset</span>
          </div>
          {activeId && (
            <button
              onClick={() => handleClick(null)}
              style={{
                fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em',
                padding: '3px 10px', border: `1px solid ${S.border}`,
                color: S.textTertiary, background: 'transparent', cursor: 'pointer',
              }}
            >× CLEAR DATASET</button>
          )}
        </div>

        {/* Fixture grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 0,
          borderBottom: `1px solid ${S.border}`,
        }}>
          {all.map((f, i) => {
            const isActive = f.id === activeId;
            const story = f.demoStory;
            // Currency chip colour
            const ccyColor = ['EUR', 'GBP', 'CHF'].includes(f.market.provider_metadata?.currency_pair?.toString().split('/')[1] ?? '')
              ? S.cyan
              : ['BRL', 'JPY', 'ZAR', 'TRY'].some(c => f.id.includes(c) || f.demoStory.geographicExposure.includes(c))
              ? S.amber
              : S.green;

            // Detect primary currency from fixture
            const primaryCcy = (() => {
              const currencies = [...new Set(f.trades.map(t => t.currency))];
              return currencies[0] ?? 'MXN';
            })();

            return (
              <button
                key={f.id}
                onClick={() => handleClick(f.id)}
                disabled={loading}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  padding: '10px 12px',
                  borderRight: i % 5 !== 4 ? `1px solid ${S.borderSoft}` : 'none',
                  borderBottom: i < 5 ? `1px solid ${S.borderSoft}` : 'none',
                  background: isActive ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : 'transparent',
                  border: isActive ? `1px solid ${S.cyan}` : undefined,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  gap: 4,
                  position: 'relative',
                  transition: 'background 0.1s',
                }}
              >
                {/* Active indicator */}
                {isActive && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6,
                    fontFamily: S.fontMono, fontSize: '0.4375rem',
                    color: S.cyan, letterSpacing: '0.06em',
                  }}>● ACTIVE</span>
                )}

                {/* Fixture label chip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: '0.5rem', letterSpacing: '0.06em',
                    color: S.textTertiary,
                  }}>{f.id.slice(-3)}</span>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: '0.5rem', letterSpacing: '0.06em',
                    color: ccyColor, background: `color-mix(in srgb, ${ccyColor} 10%, transparent)`,
                    padding: '1px 4px',
                  }}>{primaryCcy}</span>
                </div>

                {/* Company name */}
                <span style={{
                  fontFamily: S.fontUI, fontSize: '0.6875rem', fontWeight: 600,
                  color: isActive ? S.cyan : S.textPrimary,
                  lineHeight: 1.3,
                }}>{story.companyName}</span>

                {/* Industry */}
                <span style={{
                  fontFamily: S.fontUI, fontSize: '0.625rem',
                  color: S.textTertiary,
                  lineHeight: 1.3,
                }}>{story.industry}</span>

                {/* Trade count */}
                <span style={{
                  fontFamily: S.fontMono, fontSize: '0.5rem',
                  color: S.textTertiary,
                  marginTop: 2,
                }}>{f.trades.length} pos · {f.hedges.length} hdg</span>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.textTertiary, letterSpacing: '0.05em' }}>
            {activeId
              ? `Dataset active — all inputs pre-loaded · click any card to switch · or manually edit below`
              : `Select a scenario to pre-load all inputs · or build manually using the steps below`}
          </span>
        </div>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(10,14,18,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false); }}
        >
          <div style={{
            background: S.bgPanel, border: `1px solid ${S.border}`, width: 420,
            fontFamily: S.fontUI,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', borderBottom: `1px solid ${S.border}`,
              background: S.bgSub,
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.textTertiary, letterSpacing: '0.08em' }}>CONFIRM ACTION</span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: S.textPrimary }}>Dataset Change</span>
            </div>
            <div style={{ padding: '16px' }}>
              <p style={{ fontSize: '0.75rem', color: S.textSecondary, lineHeight: 1.65, margin: '0 0 10px' }}>
                This will <strong style={{ color: S.textPrimary }}>reset all current inputs</strong> and{' '}
                {confirmId
                  ? <>load: <strong style={{ color: S.cyan }}>{confirmLabel}</strong></>
                  : <>clear the form to empty state</>
                }.
              </p>
              <p style={{ fontSize: '0.6875rem', color: S.textTertiary, lineHeight: 1.5, margin: 0 }}>
                Any unsaved manual entries will be discarded.
              </p>
            </div>
            <div style={{
              padding: '10px 16px', borderTop: `1px solid ${S.borderSoft}`,
              display: 'flex', justifyContent: 'flex-end', gap: 8, background: S.bgSub,
            }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  fontFamily: S.fontUI, fontSize: '0.6875rem', fontWeight: 500,
                  padding: '4px 12px', border: `1px solid ${S.border}`,
                  color: S.textSecondary, background: 'transparent', cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={confirm}
                style={{
                  fontFamily: S.fontUI, fontSize: '0.6875rem', fontWeight: 600,
                  padding: '4px 14px', border: `1px solid ${S.cyan}`,
                  color: S.cyan, background: 'transparent', cursor: 'pointer',
                }}
              >{confirmId ? 'Load Dataset' : 'Reset to Empty'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Scenario Card ────────────────────────────────────────────────────────────
function ScenarioCard({ story, fixtureLabel, onEdit }: { story: DemoStory; fixtureLabel: string; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      border: `1px solid ${S.border}`,
      background: S.bgPanel,
      marginBottom: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: expanded ? `1px solid ${S.border}` : 'none',
        background: `color-mix(in srgb, var(--accent-cyan) 4%, ${S.bgSub})`,
        cursor: 'pointer',
      }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.cyan, letterSpacing: '0.08em' }}>SCENARIO BRIEF</span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: S.textPrimary, fontFamily: S.fontUI }}>
            {story.companyName} — {story.industry}
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: '0.5rem', color: S.textTertiary,
            background: S.bgSub, padding: '2px 6px', border: `1px solid ${S.borderSoft}`,
          }}>{story.geographicExposure}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            style={{
              fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em',
              padding: '3px 10px', border: `1px solid ${S.border}`,
              color: S.textTertiary, background: 'transparent', cursor: 'pointer',
            }}
          >EDIT INPUTS</button>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.6rem', color: S.textTertiary }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>

          {/* Problem */}
          <div style={{ padding: '14px 16px', borderRight: `1px solid ${S.borderSoft}` }}>
            <p style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.red, letterSpacing: '0.08em', marginBottom: 6 }}>
              ● EXPOSURE PROBLEM
            </p>
            <p style={{ fontSize: '0.75rem', color: S.textPrimary, lineHeight: 1.65, margin: '0 0 8px', fontFamily: S.fontUI }}>
              {story.problem}
            </p>
            <div style={{
              background: `color-mix(in srgb, ${S.red} 5%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.red} 18%, transparent)`,
              padding: '6px 10px',
            }}>
              <p style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.red, letterSpacing: '0.06em', marginBottom: 4 }}>FINANCIAL IMPACT (UNHEDGED)</p>
              <p style={{ fontSize: '0.6875rem', color: S.textSecondary, lineHeight: 1.5, margin: 0, fontFamily: S.fontUI }}>
                {story.financialImpactWithoutHedge}
              </p>
            </div>
          </div>

          {/* Risk Description */}
          <div style={{ padding: '14px 16px', borderRight: `1px solid ${S.borderSoft}` }}>
            <p style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.amber, letterSpacing: '0.08em', marginBottom: 6 }}>
              ◆ RISK ARCHITECTURE
            </p>
            <p style={{ fontSize: '0.75rem', color: S.textPrimary, lineHeight: 1.65, margin: '0 0 8px', fontFamily: S.fontUI }}>
              {story.riskDescription}
            </p>
            <div style={{
              background: `color-mix(in srgb, ${S.amber} 5%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.amber} 18%, transparent)`,
              padding: '6px 10px',
            }}>
              <p style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.amber, letterSpacing: '0.06em', marginBottom: 4 }}>HEDGE OBJECTIVE</p>
              <p style={{ fontSize: '0.6875rem', color: S.textSecondary, lineHeight: 1.5, margin: 0, fontFamily: S.fontUI }}>
                {story.objective}
              </p>
            </div>
          </div>

          {/* Resolution */}
          <div style={{ padding: '14px 16px' }}>
            <p style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.green, letterSpacing: '0.08em', marginBottom: 6 }}>
              ✓ HEDGECORE RESOLUTION
            </p>
            <p style={{ fontSize: '0.75rem', color: S.textPrimary, lineHeight: 1.65, margin: '0 0 8px', fontFamily: S.fontUI }}>
              {story.resolution}
            </p>
            <div style={{
              background: `color-mix(in srgb, ${S.green} 5%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.green} 18%, transparent)`,
              padding: '6px 10px',
            }}>
              <p style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.green, letterSpacing: '0.06em', marginBottom: 4 }}>DATASET LOADED</p>
              <p style={{ fontSize: '0.6875rem', color: S.textSecondary, lineHeight: 1.5, margin: 0, fontFamily: S.fontUI }}>
                {fixtureLabel} — all trades, hedges, market data, and policy settings are pre-configured. Hit Generate Hedge Plan to see the output.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function InputPage() {
  const router = useRouter();
  const { setCalculation } = useHedge();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [trades, setTrades]  = useState<TradeRow[]>([]);
  const [hedges, setHedges]  = useState<HedgeRow[]>([]);
  const [market, setMarket]  = useState<MarketSnapshot>(EMPTY_MARKET);
  const [policy, setPolicy]  = useState<PolicyConfig>(DEFAULT_DEMO_POLICY);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(false);
  const [backendErrors, setBackendErrors]   = useState<ValidationErrorDetail[]>([]);
  const [backendErrorMsg, setBackendErrorMsg] = useState('');

  // ── Modals ────────────────────────────────────────────────────────────────
  const [tradeModalOpen, setTradeModalOpen]       = useState(false);
  const [editingTradeIndex, setEditingTradeIndex] = useState<number | undefined>();
  const [hedgeModalOpen, setHedgeModalOpen]       = useState(false);
  const [editingHedgeIndex, setEditingHedgeIndex] = useState<number | undefined>();

  // ── Policy / Market ───────────────────────────────────────────────────────
  const [activePresetId, setActivePresetId] = useState<string | null>('balanced-corporate');
  const [marketMode, setMarketMode]         = useState<'DEMO' | 'MANUAL'>('MANUAL');
  const [autofillLoading, setAutofillLoading] = useState(false);
  const [autofillMsg, setAutofillMsg]       = useState('');

  // ── Fixture / summary mode ────────────────────────────────────────────────
  const [fixtureId, setFixtureId]     = useState<string | null>(null);
  const [summaryMode, setSummaryMode] = useState(false);
  const clearFixture = useCallback(() => { setFixtureId(null); setSummaryMode(false); }, []);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg]       = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // ── Step (progressive disclosure) ─────────────────────────────────────────
  const [activeStep, setActiveStep] = useState<StepKey>('exposure');

  // ── Derived ───────────────────────────────────────────────────────────────
  const validation = useMemo(
    () => validateAll(trades, hedges, market, policy),
    [trades, hedges, market, policy],
  );

  const existingTradeIds = useMemo(() => new Set(trades.map(t => t.record_id)), [trades]);
  const existingHedgeIds = useMemo(() => new Set(hedges.map(h => h.hedge_id)), [hedges]);
  const forwardBuckets   = useMemo(() => new Set(Object.keys(market.forward_points_by_month)), [market.forward_points_by_month]);

  const activePresetName = useMemo(() => {
    if (!activePresetId) return null;
    if (activePresetId === 'custom') return 'Custom';
    return POLICY_PRESETS.find(p => p.id === activePresetId)?.name ?? null;
  }, [activePresetId]);

  const validationState = useMemo<'PASS' | 'FAIL' | 'PENDING'>(() => {
    if (trades.length === 0) return 'PENDING';
    return validation.canCalculate ? 'PASS' : 'FAIL';
  }, [trades.length, validation.canCalculate]);

  const canCalculate = !validation.errors.some(e => e.severity === 'CRITICAL') && trades.length > 0 && !loading;

  const integrityScore = useMemo(() => {
    if (trades.length === 0) return undefined;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - validation.errors.length / 21))));
  }, [trades.length, validation.errors.length]);

  const stepUnlocked = useMemo(() => {
    const hasTrades = trades.length > 0;
    return {
      exposure:      true,
      market:        true,   // not a visible step — keep key to avoid TS errors
      policy:        hasTrades,
      hedges:        true,   // not a visible step
      authorization: true,
    };
  }, [trades.length]);

  const lockedSteps = useMemo(() => {
    const locked = new Set<StepKey>();
    if (!stepUnlocked.policy) locked.add('policy');
    return locked;
  }, [stepUnlocked]);

  const visibleStepKeys = useMemo<StepKey[]>(() => {
    const idx = STEP_ORDER.indexOf(activeStep);
    const visible: StepKey[] = [activeStep];
    if (idx < STEP_ORDER.length - 1) visible.push(STEP_ORDER[idx + 1]);
    return visible;
  }, [activeStep]);

  const stepStatuses = useMemo(() => {
    const hasTrades   = trades.length > 0;
    const marketValid = market.spot_usdmxn > 0;
    const fwdValid    = Object.keys(market.forward_points_by_month).length > 0;
    const noErrors    = validation.errors.length === 0;
    return {
      exposure:      hasTrades ? 'complete' : 'pending',
      hedges:        hedges.length > 0 ? 'complete' : (hasTrades ? 'partial' : 'pending'),
      market:        (marketValid && fwdValid) ? 'complete' : (marketValid ? 'partial' : 'pending'),
      policy:        activePresetId ? 'complete' : 'partial',
      authorization: (hasTrades && noErrors) ? 'complete' : (hasTrades ? 'error' : 'pending'),
    } as Record<StepKey, 'complete' | 'partial' | 'error' | 'pending'>;
  }, [trades.length, hedges.length, market.spot_usdmxn, market.forward_points_by_month, validation.errors.length, activePresetId]);

  const tradeSummary = useMemo(() => ({
    totalMxn:  trades.reduce((s, t) => s + t.amount, 0),
    confirmed: trades.filter(t => t.status === 'CONFIRMED').length,
    forecast:  trades.filter(t => t.status === 'FORECAST').length,
  }), [trades]);

  const hedgeSummary = useMemo(() => ({
    totalNotional: hedges.reduce((s, h) => s + h.notional_mxn, 0),
    active:  hedges.filter(h => h.status === 'ACTIVE').length,
    locked:  hedges.filter(h => h.status === 'LOCKED').length,
  }), [hedges]);

  const bucketCount = useMemo(() => Object.keys(market.forward_points_by_month).length, [market.forward_points_by_month]);

  const ageMinutes = useMemo(() => {
    const m = Math.floor((Date.now() - Date.parse(market.as_of)) / 60000);
    return isNaN(m) || m < 0 ? '--' : `${m}m`;
  }, [market.as_of]);

  const fixtureLabel = useMemo(
    () => DEMO_FIXTURES.find((f: DemoFixture) => f.id === fixtureId)?.label ?? null,
    [fixtureId],
  );

  const activeFixture = useMemo(
    () => fixtureId ? DEMO_FIXTURES.find((f: DemoFixture) => f.id === fixtureId) ?? null : null,
    [fixtureId],
  );

  const validationGates = useMemo(() => [
    { label: 'Exposure data',     met: trades.length > 0,         message: trades.length === 0 ? 'No positions loaded' : undefined },
    { label: 'Market snapshot',   met: true,                      message: market.spot_usdmxn > 0 ? undefined : 'Auto-fetched on generate' },
    { label: 'No critical errors',met: !validation.errors.some(e => e.severity === 'CRITICAL'),
      message: validation.errors.some(e => e.severity === 'CRITICAL')
        ? `${validation.errors.filter(e => e.severity === 'CRITICAL').length} critical`
        : undefined },
  ], [trades.length, market.spot_usdmxn, validation.errors]);

  // ── Detected currencies from trades ───────────────────────────────────────
  const detectedCurrencies = useMemo(
    () => [...new Set(trades.map(t => t.currency))],
    [trades],
  );

  // ── Currency context (single canonical source for labels + validation) ────
  const currencyCtx = useMemo(
    () => deriveCurrencyContext(trades, market),
    [trades, market],
  );

  // ── Alpha Vantage autofill ─────────────────────────────────────────────────
  const handleMarketAutofill = useCallback(async () => {
    if (detectedCurrencies.length === 0) {
      setAutofillMsg('No trades loaded — add exposure lines first');
      return;
    }
    setAutofillLoading(true);
    setAutofillMsg('Fetching live market data…');
    try {
      const res = await fetch('/api/market-autofill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currencies: detectedCurrencies }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.market) {
        setMarket(data.market);
        setMarketMode(data.market.provider_metadata?.data_class === 'LIVE' ? 'DEMO' : 'MANUAL');
        const src = data.market.provider_metadata?.source ?? 'autofill';
        const isLive = src === 'alpha_vantage_live';
        setAutofillMsg(isLive
          ? `Live rates loaded for ${detectedCurrencies.join(', ')} via Alpha Vantage`
          : `Demo rates loaded for ${detectedCurrencies.join(', ')} — configure ALPHA_VANTAGE_API_KEY for live data`);
        setToastMsg(isLive ? 'Market data autofilled (live)' : 'Market data autofilled (demo rates)');
        setToastVisible(true);
        clearFixture();
        // Jump to market step
        setActiveStep('market');
      }
    } catch (err) {
      setAutofillMsg(`Autofill failed: ${String(err)}`);
    } finally {
      setAutofillLoading(false);
    }
  }, [detectedCurrencies, clearFixture]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectFixture = useCallback((selectedId: string | null) => {
    if (!selectedId || selectedId === '__CLEAR__') {
      setTrades([]); setHedges([]); setMarket(EMPTY_MARKET);
      setPolicy(DEFAULT_DEMO_POLICY); setActivePresetId('balanced-corporate');
      setMarketMode('MANUAL'); setFixtureId(null); setSummaryMode(false);
      setActiveStep('exposure'); setBackendErrors([]); setBackendErrorMsg('');
      setAutofillMsg('');
      if (selectedId === '__CLEAR__') { setToastMsg('Dataset cleared'); setToastVisible(true); }
      return;
    }
    const fixture = DEMO_FIXTURES.find((f: DemoFixture) => f.id === selectedId);
    if (!fixture) return;
    setTrades(fixture.trades); setHedges(fixture.hedges); setMarket(fixture.market);
    setPolicy(fixture.policy); setActivePresetId(fixture.presetId);
    setMarketMode('DEMO'); setFixtureId(fixture.id);
    setSummaryMode(true); setActiveStep('policy');
    setBackendErrors([]); setBackendErrorMsg('');
    setAutofillMsg('');
    setToastMsg(`Dataset loaded: ${fixture.label}`); setToastVisible(true);
  }, []);

  const handleTradesCsv = useCallback(async (file: File) => {
    const data = await uploadTradesCsv(file); setTrades(data.trades); clearFixture();
  }, [clearFixture]);

  const handleHedgesCsv = useCallback(async (file: File) => {
    const data = await uploadHedgesCsv(file); setHedges(data.hedges); clearFixture();
  }, [clearFixture]);

  const openAddTrade  = useCallback(() => { setEditingTradeIndex(undefined); setTradeModalOpen(true); }, []);
  const openEditTrade = useCallback((i: number) => { setEditingTradeIndex(i); setTradeModalOpen(true); }, []);
  const handleSaveTrade = useCallback((trade: TradeRow) => {
    clearFixture();
    if (editingTradeIndex !== undefined) {
      setTrades(prev => prev.map((t, i) => i === editingTradeIndex ? trade : t));
    } else {
      setTrades(prev => [...prev, trade]);
    }
    setTradeModalOpen(false);
  }, [editingTradeIndex, clearFixture]);
  const handleRemoveTrade = useCallback((i: number) => {
    clearFixture(); setTrades(prev => prev.filter((_, j) => j !== i));
  }, [clearFixture]);

  const openAddHedge  = useCallback(() => { setEditingHedgeIndex(undefined); setHedgeModalOpen(true); }, []);
  const openEditHedge = useCallback((i: number) => { setEditingHedgeIndex(i); setHedgeModalOpen(true); }, []);
  const handleSaveHedge = useCallback((hedge: HedgeRow) => {
    clearFixture();
    if (editingHedgeIndex !== undefined) {
      setHedges(prev => prev.map((h, i) => i === editingHedgeIndex ? hedge : h));
    } else {
      setHedges(prev => [...prev, hedge]);
    }
    setHedgeModalOpen(false);
  }, [editingHedgeIndex, clearFixture]);
  const handleRemoveHedge = useCallback((i: number) => {
    clearFixture(); setHedges(prev => prev.filter((_, j) => j !== i));
  }, [clearFixture]);

  const handleSelectPreset = useCallback((preset: PolicyPreset) => {
    clearFixture(); setPolicy(preset.policy); setActivePresetId(preset.id);
  }, [clearFixture]);
  const handleCustomPolicy = useCallback(() => { clearFixture(); setActivePresetId('custom'); }, [clearFixture]);

  const handleCalculate = async () => {
    setLoading(true); setBackendErrors([]); setBackendErrorMsg('');
    try {
      // Auto-fetch market if not already populated
      let activeMarket = market;
      if (activeMarket.spot_usdmxn === 0 && detectedCurrencies.length > 0) {
        try {
          const res = await fetch('/api/market-autofill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currencies: detectedCurrencies }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.market) {
              activeMarket = data.market;
              setMarket(data.market); // keep state in sync for results page
            }
          }
        } catch {
          // Market fetch failed — proceed anyway; backend will return 422 with clear error
        }
      }
      const result = await calculate({ trades, hedges, market: activeMarket, policy });
      setCalculation(result, { policy, trades, hedges, market: activeMarket, fixtureId });
      router.push('/results');
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { detail?: unknown } } };
      const detail = anyErr?.response?.data?.detail;
      if (detail && typeof detail === 'object' && 'validation_report' in detail) {
        const d = detail as { validation_report: { errors?: ValidationErrorDetail[] } };
        setBackendErrors(d.validation_report.errors || []);
        setBackendErrorMsg('Validation failed — fix exceptions below and retry.');
      } else if (detail && typeof detail === 'object' && 'parse_error' in detail) {
        const d = detail as { parse_error: string; errors?: Array<{ msg?: unknown }> };
        setBackendErrorMsg(`Parse error in ${d.parse_error}: ${JSON.stringify(d.errors?.[0]?.msg || d.errors)}`);
      } else {
        setBackendErrorMsg(typeof detail === 'string' ? detail : JSON.stringify(detail || String(err)));
      }
    } finally {
      setLoading(false);
    }
  };

  const editingTrade = editingTradeIndex !== undefined ? trades[editingTradeIndex] : undefined;
  const editingHedge = editingHedgeIndex !== undefined ? hedges[editingHedgeIndex] : undefined;

  const tradeIdsForModal = useMemo(() => {
    if (editingTrade) { const s = new Set(existingTradeIds); s.delete(editingTrade.record_id); return s; }
    return existingTradeIds;
  }, [existingTradeIds, editingTrade]);

  const hedgeIdsForModal = useMemo(() => {
    if (editingHedge) { const s = new Set(existingHedgeIds); s.delete(editingHedge.hedge_id); return s; }
    return existingHedgeIds;
  }, [existingHedgeIds, editingHedge]);

  const btnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: S.fontMono, fontSize: '0.625rem', fontWeight: active ? 600 : 500,
    padding: '3px 10px', letterSpacing: '0.04em',
    border: `1px solid ${active ? S.cyan : S.border}`,
    color: active ? S.cyan : S.textTertiary,
    background: 'transparent', cursor: 'pointer',
  });

  return (
    <div>
      {/* ── Governance strip ── */}
      <GovernanceStrip
        tradeCount={trades.length} hedgeCount={hedges.length} policyName={activePresetName}
        snapshotMode={marketMode} snapshotTimestamp={market.as_of} engineVersion="1.0.0"
        validationState={validationState} errorCount={validation.errors.length}
        warningCount={validation.warnings.length} fixtureId={fixtureId}
        fixtureLabel={fixtureLabel}
        integrityScore={integrityScore}
      />

      {/* ── Page content ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 16px' }}>

        {/* ── Dataset Panel (always visible above wizard) ── */}
        <div style={{ marginTop: 12 }}>
          <DatasetPanel
            fixtures={DEMO_FIXTURES}
            activeId={fixtureId}
            onSelect={handleSelectFixture}
            loading={loading}
          />
        </div>

        {/* ── Scenario Card (shown when fixture active) ── */}
        {activeFixture && (
          <div style={{ marginTop: 0, borderTop: 'none' }}>
            <ScenarioCard
              story={activeFixture.demoStory}
              fixtureLabel={activeFixture.label}
              onEdit={() => setSummaryMode(false)}
            />
          </div>
        )}

        {/* ── Step progress rail ── */}
        <div style={{ marginTop: 12 }}>
          <StepProgress
            steps={[
              { key: 'exposure', label: 'Exposure Intake', status: stepStatuses.exposure },
              { key: 'policy',   label: 'Hedge Policy',   status: stepStatuses.policy },
            ]}
            activeStep={activeStep} onActivate={setActiveStep} lockedSteps={lockedSteps}
          />
        </div>

        {/* ── Summary mode OR Wizard mode ── */}
        {summaryMode ? (
          <SnapshotSummary
            trades={trades} hedges={hedges} market={market} policy={policy}
            fixtureId={fixtureId} fixtureLabel={fixtureLabel}
            validationState={validationState} integrityScore={integrityScore}
            onEditInputs={() => setSummaryMode(false)}
            onGeneratePlan={handleCalculate}
            canGenerate={canCalculate}
            loading={loading}
          />
        ) : (
          <div>
            {/* Backend error banner */}
            {backendErrorMsg && (
              <div style={{
                marginTop: 12,
                background: `color-mix(in srgb, ${S.red} 5%, transparent)`,
                border: `1px solid ${S.red}`,
                color: S.red,
                padding: '10px 14px',
                fontFamily: S.fontMono,
                fontSize: '0.6875rem',
              }}>
                <p style={{ fontWeight: 600, marginBottom: backendErrors.length ? 8 : 0 }}>{backendErrorMsg}</p>
                {backendErrors.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {backendErrors.map((e, i) => (
                      <li key={i} style={{ display: 'flex', gap: 8 }}>
                        <span style={{ background: `color-mix(in srgb, ${S.red} 12%, transparent)`, padding: '0 4px', fontSize: '0.5625rem' }}>{e.code}</span>
                        <span style={{ opacity: 0.8 }}>{e.field}:</span>
                        <span style={{ opacity: 0.7 }}>{e.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Progressive step sections */}
            <div style={{ marginTop: 3 }}>

              {visibleStepKeys.includes('exposure') && (
                <StepSection
                  stepNumber="01" title="Commercial Exposure" stepKey="exposure"
                  activeStep={activeStep} onActivate={setActiveStep} locked={false}
                  badge={trades.length > 0 ? { label: `${trades.length} positions`, variant: 'info' } : undefined}
                  summary={trades.length > 0 ? (
                    <div style={{ display: 'flex', gap: 16, fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.textSecondary }}>
                      <span>{trades.length} positions</span>
                      <span>Net: {fmtCompact(tradeSummary.totalMxn)}</span>
                      <span>Confirmed: {tradeSummary.confirmed}</span>
                      <span>Forecast: {tradeSummary.forecast}</span>
                      {detectedCurrencies.length > 0 && (
                        <span style={{ color: S.amber }}>Currencies: {detectedCurrencies.join(', ')}</span>
                      )}
                    </div>
                  ) : undefined}
                  actions={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <CsvUploader label="Import CSV" onFile={handleTradesCsv} schemaType="trades" />
                      <button onClick={openAddTrade} style={btnStyle(true)}>+ New Exposure Line</button>
                    </div>
                  }
                >
                  <TradeTable trades={trades} onEdit={openEditTrade} onRemove={handleRemoveTrade} baseCcy={currencyCtx.baseCcy} />
                </StepSection>
              )}

              {visibleStepKeys.includes('policy') && (
                <StepSection
                  stepNumber="02" title="Hedge Policy" stepKey="policy"
                  activeStep={activeStep} onActivate={setActiveStep} locked={!stepUnlocked.policy}
                  badge={
                    activePresetName && activePresetId !== 'custom'
                      ? { label: activePresetName, variant: 'info' }
                      : activePresetId === 'custom'
                      ? { label: 'Custom', variant: 'neutral' }
                      : undefined
                  }
                  summary={
                    <div style={{ display: 'flex', gap: 16, fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.textSecondary }}>
                      <span>{activePresetName ?? 'Custom'}</span>
                      <span>Confirmed: {fmtPct(policy.hedge_ratios.confirmed)}</span>
                      <span>Forecast: {fmtPct(policy.hedge_ratios.forecast)}</span>
                      <span>{policy.execution_product}</span>
                    </div>
                  }
                >
                  <PolicyForm
                    policy={policy} onChange={setPolicy}
                    activePresetId={activePresetId}
                    onSelectPreset={handleSelectPreset}
                    onCustom={handleCustomPolicy}
                  />
                </StepSection>
              )}

            </div>
          </div>
        )}
      </div>

      {/* Sticky action bar — wizard mode only */}
      {!summaryMode && (
        <StickyActionBar
          loading={loading}
          onCalculate={handleCalculate}
          canCalculate={canCalculate}
          gates={validationGates}
        />
      )}

      {/* Modals */}
      <TradeModal
        open={tradeModalOpen} onClose={() => setTradeModalOpen(false)} onSave={handleSaveTrade}
        existingTrade={editingTrade} existingIds={tradeIdsForModal} forwardBuckets={forwardBuckets}
      />
      <HedgeModal
        open={hedgeModalOpen} onClose={() => setHedgeModalOpen(false)} onSave={handleSaveHedge}
        existingHedge={editingHedge} existingIds={hedgeIdsForModal} forwardBuckets={forwardBuckets}
      />
      <Toast message={toastMsg} visible={toastVisible} onClose={() => setToastVisible(false)} />
    </div>
  );
}
