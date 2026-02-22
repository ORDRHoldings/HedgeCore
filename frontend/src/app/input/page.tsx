"use client";

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { useAuth } from '../../lib/authContext';
import type {
  TradeRow,
  HedgeRow,
  MarketSnapshot,
  PolicyConfig,
  ValidationErrorDetail,
  FuturesCurrency,
} from '../../api/types';
import { FUTURES_CURRENCY_LIST } from '../../api/types';
import { useHedge } from '../../lib/hedgeContext';
import { calculate, uploadHedgesCsv } from '../../api/client';
import { importPositionsCsv } from '../../api/positionClient';
import { getActivePolicy, listPolicyTemplates, activatePolicy as activatePolicyApi } from '../../api/policyClient';
import type { PolicyTemplate } from '../../api/policyClient';
import { POLICY_PRESETS } from '../../constants/policyPresets';
import type { PolicyPreset } from '../../constants/policyPresets';
import { validateAll } from '../../utils/validator';
import { fmtMXN } from '../../utils/formatters';
import { deriveCurrencyContext } from '../../utils/currencyContext';
import type { AppDispatch, RootState } from '../../lib/store';
import {
  listPositionsThunk,
  createPositionThunk,
  updatePositionThunk,
  deletePositionThunk,
  clearError as clearPositionError,
  markExecuted,
} from '../../lib/store/slices/positionSlice';
import type { PositionRow } from '../../api/positionClient';
import FileUploadLane from '../../components/input/FileUploadLane';
import DatabaseConnectorLane from '../../components/input/DatabaseConnectorLane';
import ConnectorPlaceholderLane from '../../components/input/ConnectorPlaceholderLane';
import ImportHistoryPanel from '../../components/input/ImportHistoryPanel';

import EmptyState from '../../components/ui/EmptyState';
import type { StepKey } from '../../components/input/StepSection';
import TradeTable from '../../components/input/TradeTable';
import TradeModal from '../../components/input/TradeModal';
import HedgeModal from '../../components/input/HedgeModal';
import PolicyForm from '../../components/input/PolicyForm';
import GovernanceStrip from '../../components/input/GovernanceStrip';
import SnapshotSummary from '../../components/input/SnapshotSummary';
import Toast from '../../components/shared/Toast';
import Modal from '../../components/shared/Modal';
import BackendErrorBanner from '../../components/input/BackendErrorBanner';
import {
  AUTO_RESOLVED_CODES,
  ERROR_KNOWLEDGE_BASE,
  parseFieldIndex,
  parseFieldTarget,
} from '../../constants/errorKnowledgeBase';
import type { ResolveActionType } from '../../constants/errorKnowledgeBase';

const EMPTY_MARKET: MarketSnapshot = {
  as_of: new Date().toISOString().slice(0, 19) + 'Z',
  spot_usdmxn: 0,
  forward_points_by_month: {},
  provider_metadata: { source: 'manual_user_input' },
};

const STEP_ORDER: StepKey[] = ['exposure', 'policy'];

// ─── Ingestion Desk tabs ──────────────────────────────────────────────────
type DeskTab = 'manual' | 'upload' | 'database' | 'erp' | 'accounting' | 'history';

const DESK_TABS: { key: DeskTab; label: string; subtitle: string }[] = [
  { key: 'manual',      label: 'Manual Entry',      subtitle: 'Inline form + bulk' },
  { key: 'upload',      label: 'Upload CSV / Excel', subtitle: 'File import' },
  { key: 'database',    label: 'Connect Database',   subtitle: 'SQL pull' },
  { key: 'erp',         label: 'ERP Integration',    subtitle: 'SAP · Oracle · MS Dynamics' },
  { key: 'accounting',  label: 'Accounting System',  subtitle: 'Xero · QuickBooks · NetSuite' },
  { key: 'history',     label: 'Import History',     subtitle: 'Audit trail' },
];

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

/** Convert a DB-backed PositionRow to the TradeRow shape the rest of the page uses */
function positionToTradeRow(p: PositionRow): TradeRow {
  return {
    record_id:   p.record_id,
    entity:      p.entity,
    type:        p.type,
    currency:    p.currency,
    amount:      p.amount,
    value_date:  p.value_date,
    status:      p.status,
    description: p.description ?? '',
  };
}

// ─── Import result banner ─────────────────────────────────────────────────────
interface ImportBannerProps {
  created: number;
  totalRows: number;
  errors: { row: number; record_id?: string; error: string }[];
  onDismiss: () => void;
}
function ImportBanner({ created, totalRows, errors, onDismiss }: ImportBannerProps) {
  const hasErrors = errors.length > 0;
  return (
    <div style={{
      border: `1px solid ${hasErrors ? S.amber : S.green}`,
      background: hasErrors
        ? `color-mix(in srgb, ${S.amber} 4%, ${S.bgPanel})`
        : `color-mix(in srgb, ${S.green} 4%, ${S.bgPanel})`,
      marginBottom: 8,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 14px',
        borderBottom: `1px solid ${hasErrors ? S.amber : S.green}`,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', color: hasErrors ? S.amber : S.green, letterSpacing: '0.06em' }}>
          CSV IMPORT RESULT
        </span>
        <span style={{ fontFamily: S.fontUI, fontSize: '0.6875rem', color: S.textSecondary }}>
          {created}/{totalRows} rows imported{hasErrors ? ` · ${errors.length} errors` : ''}
        </span>
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.textTertiary, fontFamily: S.fontMono, fontSize: '0.75rem' }}
        >×</button>
      </div>
      {hasErrors && (
        <div style={{ padding: '8px 14px', maxHeight: 120, overflowY: 'auto' }}>
          {errors.map((e, i) => (
            <div key={i} style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.amber, marginBottom: 3 }}>
              Row {e.row}{e.record_id ? ` (${e.record_id})` : ''}: {e.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function InputPage() {
  const router    = useRouter();
  const dispatch  = useDispatch<AppDispatch>();
  const { setCalculation } = useHedge();
  const { token } = useAuth();

  // ── Redux position state ──────────────────────────────────────────────────
  const { positions, loading: positionsLoading, error: positionError, executedIds, ibkrRefs } = useSelector(
    (s: RootState) => s.positions,
  );

  // ── Ingestion desk tab ────────────────────────────────────────────────────
  const [deskTab, setDeskTab] = useState<DeskTab>('manual');

  // ── Local state ───────────────────────────────────────────────────────────
  const [hedges, setHedges]  = useState<HedgeRow[]>([]);
  const [market, setMarket]  = useState<MarketSnapshot>(EMPTY_MARKET);
  const [policy, setPolicy]  = useState<PolicyConfig>({
    bucket_mode: 'CALENDAR_MONTH',
    hedge_ratios: { confirmed: 0, forecast: 0 },
    cost_assumptions: { spread_bps: 0 },
    execution_product: 'NDF',
    min_trade_size_usd: 0,
  });

  // ── UI ────────────────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(false);
  const [backendErrors, setBackendErrors]   = useState<ValidationErrorDetail[]>([]);
  const [backendErrorMsg, setBackendErrorMsg] = useState('');

  const [showAutoResolveConfirm, setShowAutoResolveConfirm] = useState(false);

  // ── Import banner ─────────────────────────────────────────────────────────
  const [importResult, setImportResult] = useState<{
    created: number; totalRows: number;
    errors: { row: number; record_id?: string; error: string }[];
  } | null>(null);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [tradeModalOpen, setTradeModalOpen]       = useState(false);
  const [editingPosition, setEditingPosition]     = useState<PositionRow | undefined>();
  const [hedgeModalOpen, setHedgeModalOpen]       = useState(false);
  const [editingHedgeIndex, setEditingHedgeIndex] = useState<number | undefined>();

  // ── Policy / Market ───────────────────────────────────────────────────────
  const [activePresetId, setActivePresetId]       = useState<string | null>('balanced-corporate');
  // DB-backed active policy template (for activate button)
  const [dbTemplates, setDbTemplates]             = useState<PolicyTemplate[]>([]);
  const [activePolicyTemplateId, setActivePolicyTemplateId] = useState<string | null>(null);
  const [policyActivating, setPolicyActivating]   = useState(false);
  const [policyActivateMsg, setPolicyActivateMsg] = useState('');
  const [marketMode, setMarketMode]               = useState<'DEMO' | 'MANUAL'>('MANUAL');
  const [autofillLoading, setAutofillLoading]     = useState(false);
  const [autofillMsg, setAutofillMsg]             = useState('');

  // ── Step (progressive disclosure) ─────────────────────────────────────────
  const [activeStep, setActiveStep] = useState<StepKey>('exposure');

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg]       = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg); setToastVisible(true);
  }, []);

  // ── IBKR Execution modal ──────────────────────────────────────────────────
  const [ibkrModalOpen, setIbkrModalOpen]             = useState(false);
  const [ibkrTargetPosition, setIbkrTargetPosition]   = useState<PositionRow | undefined>();
  const [ibkrRefInput, setIbkrRefInput]                = useState('');

  const openIbkrModal = useCallback((pos: PositionRow) => {
    setIbkrTargetPosition(pos);
    setIbkrRefInput('');
    setIbkrModalOpen(true);
  }, []);

  const handleConfirmExecution = useCallback(() => {
    if (!ibkrTargetPosition) return;
    dispatch(markExecuted({ id: ibkrTargetPosition.id, ibkr_ref: ibkrRefInput || undefined }));
    setIbkrModalOpen(false);
    setIbkrTargetPosition(undefined);
    showToast('Position marked as executed');
  }, [dispatch, ibkrTargetPosition, ibkrRefInput, showToast]);

  // ── Inline trade entry form ───────────────────────────────────────────────
  const EMPTY_INLINE: TradeRow = {
    record_id: '', entity: '', type: 'AP', currency: 'MXN',
    amount: 0, value_date: '', status: 'CONFIRMED', description: '',
  };
  const [inlineForm, setInlineForm]       = useState<TradeRow>(EMPTY_INLINE);
  const [inlineTouched, setInlineTouched] = useState<Record<string, boolean>>({});
  const [inlineSaving, setInlineSaving]   = useState(false);

  // ── Load positions from DB on mount ───────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    // Demo tokens are not accepted by the backend — skip fetch and clear any
    // stale error state left over from a previous session so no banner appears
    if (token.startsWith('demo_token_')) {
      dispatch(clearPositionError());
      return;
    }
    dispatch(listPositionsThunk({ token }));
  }, [dispatch, token]);

  // ── Load policy templates + active policy on mount ────────────────────────
  useEffect(() => {
    if (!token) return;
    // Demo tokens are not accepted by the backend — skip fetch in demo mode
    if (token.startsWith('demo_token_')) return;
    // Fetch templates (for matching DB template IDs to preset IDs)
    listPolicyTemplates(token).then(setDbTemplates).catch(() => {/* ignore */});
    // Fetch active policy → pre-select preset if found
    getActivePolicy(token).then(instance => {
      if (!instance?.template) return;
      const tmpl = instance.template;
      // Record the DB template UUID so we can skip re-activation
      setActivePolicyTemplateId(tmpl.id);
      // Match by short_name to a known preset ID
      const matched = POLICY_PRESETS.find(p => p.shortName === tmpl.short_name);
      if (matched) {
        setActivePresetId(matched.id);
        setPolicy(matched.policy);
      }
    }).catch(() => {/* ignore — use defaults */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // run once on mount

  // ── Derive trades array from Redux positions for downstream use ───────────
  const trades = useMemo(() => positions.map(positionToTradeRow), [positions]);

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
    const nonMarket = validation.errors.filter(
      e => e.severity === 'CRITICAL' && !AUTO_RESOLVED_CODES.has(e.code),
    );
    return nonMarket.length === 0 ? 'PASS' : 'FAIL';
  }, [trades.length, validation.errors]);

  const nonMarketCriticals = validation.errors.filter(
    e => e.severity === 'CRITICAL' && !AUTO_RESOLVED_CODES.has(e.code),
  );
  const canCalculate = nonMarketCriticals.length === 0 && trades.length > 0 && !loading;

  const integrityScore = useMemo(() => {
    if (trades.length === 0) return undefined;
    const countable = validation.errors.filter(e => !AUTO_RESOLVED_CODES.has(e.code)).length;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - countable / 21))));
  }, [trades.length, validation.errors]);

  const stepUnlocked = useMemo(() => ({
    exposure:      true,
    market:        true,
    policy:        trades.length > 0,
    hedges:        true,
    authorization: true,
  }), [trades.length]);

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
    const realErrors  = validation.errors.filter(e => !AUTO_RESOLVED_CODES.has(e.code));
    const noErrors    = realErrors.length === 0;
    return {
      exposure:      hasTrades ? 'complete' : 'pending',
      hedges:        hedges.length > 0 ? 'complete' : (hasTrades ? 'partial' : 'pending'),
      market:        (marketValid && fwdValid) ? 'complete' : (marketValid ? 'partial' : 'pending'),
      policy:        activePresetId ? 'complete' : 'partial',
      authorization: (hasTrades && noErrors) ? 'complete' : (hasTrades ? 'error' : 'pending'),
    } as Record<StepKey, 'complete' | 'partial' | 'error' | 'pending'>;
  }, [trades.length, hedges.length, market.spot_usdmxn, market.forward_points_by_month, validation.errors, activePresetId]);

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

  const validationGates = useMemo(() => {
    const nonMarketErrors = validation.errors.filter(
      e => e.severity === 'CRITICAL' && !AUTO_RESOLVED_CODES.has(e.code),
    );
    return [
      { label: 'Exposure data',      met: trades.length > 0,           message: trades.length === 0 ? 'No positions loaded' : undefined },
      { label: 'Market snapshot',    met: true,                        message: market.spot_usdmxn > 0 ? undefined : 'Auto-fetched on generate' },
      { label: 'No critical errors', met: nonMarketErrors.length === 0,
        message: nonMarketErrors.length > 0 ? `${nonMarketErrors.length} critical` : undefined },
    ];
  }, [trades.length, market.spot_usdmxn, validation.errors]);

  const detectedCurrencies = useMemo(
    () => [...new Set(trades.map(t => t.currency))],
    [trades],
  );

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
        body: JSON.stringify({
          currencies: detectedCurrencies,
          trade_value_dates: trades.map(t => t.value_date),
        }),
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
        showToast(isLive ? 'Market data autofilled (live)' : 'Market data autofilled (demo rates)');
      }
    } catch (err) {
      setAutofillMsg(`Autofill failed: ${String(err)}`);
    } finally {
      setAutofillLoading(false);
    }
  }, [detectedCurrencies, trades, showToast]);

  // ── Hedges handlers (local — hedges are not yet DB-persisted) ────────────
  const handleHedgesCsv = useCallback(async (file: File) => {
    const data = await uploadHedgesCsv(file);
    setHedges(data.hedges);
  }, []);

  const openAddHedge   = useCallback(() => { setEditingHedgeIndex(undefined); setHedgeModalOpen(true); }, []);
  const openEditHedge  = useCallback((i: number) => { setEditingHedgeIndex(i); setHedgeModalOpen(true); }, []);
  const handleSaveHedge = useCallback((hedge: HedgeRow) => {
    if (editingHedgeIndex !== undefined) {
      setHedges(prev => prev.map((h, i) => i === editingHedgeIndex ? hedge : h));
    } else {
      setHedges(prev => [...prev, hedge]);
    }
    setHedgeModalOpen(false);
  }, [editingHedgeIndex]);
  const handleRemoveHedge = useCallback((i: number) => {
    setHedges(prev => prev.filter((_, j) => j !== i));
  }, []);

  // ── Position (DB) handlers ────────────────────────────────────────────────
  const openAddTrade = useCallback(() => {
    setEditingPosition(undefined);
    setTradeModalOpen(true);
  }, []);

  const openEditTrade = useCallback((idx: number) => {
    setEditingPosition(positions[idx]);
    setTradeModalOpen(true);
  }, [positions]);

  /** Duplicate: pre-fill modal with a copy of the row (create mode, blank ID) */
  const openDuplicateTrade = useCallback((pos: PositionRow) => {
    // Treat as "new" but pre-populate with a copy of the source row (blank record_id)
    setEditingPosition({
      ...pos,
      id:        '__duplicate__',  // sentinel so TradeModal sees it as existing but onSave creates new
      record_id: '',
    });
    setTradeModalOpen(true);
  }, []);

  const handleSaveTrade = useCallback(async (trade: TradeRow) => {
    if (!token) return;
    const isDuplicate = editingPosition?.id === '__duplicate__';
    if (editingPosition && !isDuplicate) {
      // Update existing
      await dispatch(updatePositionThunk({ id: editingPosition.id, trade, token }));
      showToast('Position updated');
    } else {
      // Create new (includes duplicate scenario)
      const result = await dispatch(createPositionThunk({ trade, token }));
      if (createPositionThunk.fulfilled.match(result)) {
        showToast(isDuplicate ? 'Position duplicated' : 'Position added');
      } else {
        showToast(`Error: ${result.payload as string}`);
      }
    }
    setTradeModalOpen(false);
    setEditingPosition(undefined);
  }, [dispatch, token, editingPosition, showToast]);

  const handleRemoveTrade = useCallback(async (idx: number) => {
    if (!token) return;
    const pos = positions[idx];
    if (!pos) return;
    await dispatch(deletePositionThunk({ id: pos.id, token }));
    showToast('Position removed');
  }, [dispatch, token, positions, showToast]);

  // ── Inline trade save (DB write) ──────────────────────────────────────────
  const inlineIdDuplicate = inlineForm.record_id !== '' && existingTradeIds.has(inlineForm.record_id);
  const inlineValid = (
    inlineForm.record_id.trim() !== '' &&
    !inlineIdDuplicate &&
    inlineForm.entity.trim() !== '' &&
    inlineForm.amount > 0 &&
    inlineForm.value_date !== ''
  );

  const handleInlineSave = useCallback(async () => {
    setInlineTouched({ record_id: true, entity: true, amount: true, value_date: true });
    if (!inlineValid || !token) return;
    setInlineSaving(true);
    const result = await dispatch(createPositionThunk({ trade: inlineForm, token }));
    setInlineSaving(false);
    if (createPositionThunk.fulfilled.match(result)) {
      setInlineForm(EMPTY_INLINE);
      setInlineTouched({});
      showToast('Position added');
    } else {
      showToast(`Error: ${result.payload as string}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, token, inlineForm, inlineValid, showToast]);

  const setInlineField = useCallback(<K extends keyof TradeRow>(field: K, value: TradeRow[K]) => {
    setInlineForm(f => ({ ...f, [field]: value }));
  }, []);

  const touchInline = useCallback((field: string) => {
    setInlineTouched(t => ({ ...t, [field]: true }));
  }, []);

  // ── CSV import (positions bulk upload to DB) ───────────────────────────────
  const handlePositionsCsv = useCallback(async (file: File) => {
    if (!token) return;
    try {
      const result = await importPositionsCsv(file, token);
      setImportResult({
        created: result.created,
        totalRows: result.total_rows,
        errors: result.errors,
      });
      if (result.created > 0) {
        await dispatch(listPositionsThunk({ token }));
        showToast(`Imported ${result.created} positions`);
      }
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail;
      if (detail?.parse_errors) {
        setImportResult({ created: 0, totalRows: 0, errors: detail.parse_errors });
      } else {
        showToast(`CSV import failed: ${String(err)}`);
      }
    }
  }, [dispatch, token, showToast]);

  // ── Policy ────────────────────────────────────────────────────────────────
  const handleSelectPreset = useCallback((preset: PolicyPreset) => {
    setPolicy(preset.policy); setActivePresetId(preset.id);
    setPolicyActivateMsg('');
  }, []);
  const handleCustomPolicy = useCallback(() => { setActivePresetId('custom'); setPolicyActivateMsg(''); }, []);

  // Activate the selected preset as the company+branch active policy in the DB
  const handleActivatePolicy = useCallback(async () => {
    if (!token || !activePresetId || activePresetId === 'custom') return;
    // Find the DB template matching this preset's shortName
    const preset = POLICY_PRESETS.find(p => p.id === activePresetId);
    if (!preset) return;
    const dbTmpl = dbTemplates.find(t => t.short_name === preset.shortName);
    if (!dbTmpl) {
      setPolicyActivateMsg('Template not found in database — try reloading.');
      return;
    }
    // Skip if already the active template
    if (activePolicyTemplateId === dbTmpl.id) {
      setPolicyActivateMsg(`✓ ${preset.name} is already the active policy.`);
      return;
    }
    setPolicyActivating(true);
    setPolicyActivateMsg('');
    try {
      await activatePolicyApi(dbTmpl.id, token);
      setActivePolicyTemplateId(dbTmpl.id);
      setPolicyActivateMsg(`✓ ${preset.name} activated as the active hedge policy.`);
      showToast(`Policy activated: ${preset.shortName}`);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data?.detail ?? String(e);
      setPolicyActivateMsg(`Error: ${detail}`);
    } finally {
      setPolicyActivating(false);
    }
  }, [token, activePresetId, dbTemplates, activePolicyTemplateId, showToast]);

  // ── Calculation ───────────────────────────────────────────────────────────
  const handleCalculate = async (opts?: { forceMarketRefresh?: boolean }) => {
    setLoading(true); setBackendErrors([]); setBackendErrorMsg('');
    try {
      let activeMarket = market;
      const needsFetch = opts?.forceMarketRefresh || activeMarket.spot_usdmxn === 0;
      if (needsFetch && detectedCurrencies.length > 0) {
        try {
          const tradeValueDates = trades.map(t => t.value_date);
          const res = await fetch('/api/market-autofill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currencies: detectedCurrencies, trade_value_dates: tradeValueDates }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.market) { activeMarket = data.market; setMarket(data.market); }
          } else {
            setBackendErrorMsg(`Market autofill failed (HTTP ${res.status}). Add market data manually or retry.`);
            setLoading(false); return;
          }
        } catch (e) {
          setBackendErrorMsg(`Market autofill unavailable: ${String(e)}. Add market data manually or retry.`);
          setLoading(false); return;
        }
      }
      const result = await calculate({ trades, hedges, market: activeMarket, policy });
      setCalculation(result, { policy, trades, hedges, market: activeMarket, fixtureId: null });
      router.push('/execution');
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
        const msg = typeof detail === 'string'
          ? detail
          : detail ? JSON.stringify(detail)
          : `Network or server error — ${String(err)}`;
        setBackendErrorMsg(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Error Resolution Dispatch ──────────────────────────────────────────── */
  const handleResolveError = useCallback((
    error: ValidationErrorDetail,
    actionOverride?: ResolveActionType,
  ) => {
    const knowledge = ERROR_KNOWLEDGE_BASE[error.code];
    if (!knowledge?.resolveAction) return;

    const actionType: ResolveActionType = actionOverride ?? knowledge.resolveAction.type;
    const index = parseFieldIndex(error.field);
    const target = parseFieldTarget(error.field);

    switch (actionType) {
      case 'auto_resolve':
        setShowAutoResolveConfirm(true);
        break;

      case 'edit_trade':
        setActiveStep('exposure');
        if (index !== undefined && index < positions.length) {
          setEditingPosition(positions[index]);
          setTradeModalOpen(true);
        }
        break;

      case 'edit_hedge':
        setActiveStep('exposure');
        if (index !== undefined && index < hedges.length) {
          setEditingHedgeIndex(index);
          setHedgeModalOpen(true);
        }
        break;

      case 'remove_duplicate':
        if (target === 'trades' && index !== undefined && index < positions.length) {
          const pos = positions[index];
          if (window.confirm(`Remove duplicate trade "${pos.record_id}" at position ${index + 1}?`)) {
            handleRemoveTrade(index);
            setBackendErrors([]); setBackendErrorMsg('');
          }
        } else if (target === 'hedges' && index !== undefined && index < hedges.length) {
          const hedgeId = hedges[index]?.hedge_id;
          if (window.confirm(`Remove duplicate hedge "${hedgeId}" at position ${index + 1}?`)) {
            handleRemoveHedge(index);
            setBackendErrors([]); setBackendErrorMsg('');
          }
        }
        break;

      case 'navigate_policy':
        setActiveStep('policy');
        break;

      case 'navigate_market':
        handleMarketAutofill();
        break;

      case 'add_trades':
        setActiveStep('exposure');
        requestAnimationFrame(() => {
          const addForm = document.querySelector('[data-section="add-exposure-line"]');
          addForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        break;
    }
  }, [
    positions, hedges, setActiveStep,
    setEditingPosition, setTradeModalOpen,
    setEditingHedgeIndex, setHedgeModalOpen,
    handleRemoveTrade, handleRemoveHedge,
    handleMarketAutofill,
  ]);

  // For duplicate: pass the trade data but mark as "new" (undefined existingTrade in modal)
  // by only setting editingTrade when it's a real edit, not a duplicate
  const isDuplicating = editingPosition?.id === '__duplicate__';
  const editingTrade = editingPosition && !isDuplicating ? positionToTradeRow(editingPosition) : undefined;
  // For duplicate, we pass the prefill data so the modal form is pre-filled
  const duplicatePrefill = isDuplicating ? positionToTradeRow(editingPosition!) : undefined;
  const editingHedge = editingHedgeIndex !== undefined ? hedges[editingHedgeIndex] : undefined;

  const tradeIdsForModal = useMemo(() => {
    if (editingTrade) { const s = new Set(existingTradeIds); s.delete(editingTrade.record_id); return s; }
    return existingTradeIds;
  }, [existingTradeIds, editingTrade]);

  // Duplicate: convert the prefill data into initialValues for TradeModal
  const tradeModalInitialValues = duplicatePrefill ? {
    entity:      duplicatePrefill.entity,
    type:        duplicatePrefill.type,
    currency:    duplicatePrefill.currency,
    amount:      duplicatePrefill.amount,
    value_date:  duplicatePrefill.value_date,
    status:      duplicatePrefill.status,
    description: duplicatePrefill.description,
  } : undefined;

  const hedgeIdsForModal = useMemo(() => {
    if (editingHedge) { const s = new Set(existingHedgeIds); s.delete(editingHedge.hedge_id); return s; }
    return existingHedgeIds;
  }, [existingHedgeIds, editingHedge]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hedgeSummary = hedgeSummary; // referenced in governance strip
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _autofillLoading = autofillLoading; // used in autofill button
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _autofillMsg = autofillMsg; // shown below market button

  return (
    <div>
      {/* ── Governance strip ── */}
      <GovernanceStrip
        tradeCount={trades.length} hedgeCount={hedges.length} policyName={activePresetName}
        snapshotMode={marketMode} snapshotTimestamp={market.as_of} engineVersion="1.0.0"
        validationState={validationState} errorCount={nonMarketCriticals.length}
        warningCount={validation.warnings.length} fixtureId={null}
        fixtureLabel={null}
        integrityScore={integrityScore}
      />

      {/* ── Page content ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 16px' }}>

        {/* ── Import result banner ── */}
        {importResult && (
          <div style={{ marginTop: 8 }}>
            <ImportBanner
              created={importResult.created}
              totalRows={importResult.totalRows}
              errors={importResult.errors}
              onDismiss={() => setImportResult(null)}
            />
          </div>
        )}

        {/* ── Position load error (suppressed for demo users) ── */}
        {positionError && !token?.startsWith('demo_token_') && (
          <div style={{
            marginTop: 8, padding: '8px 14px',
            border: `1px solid ${S.red}`,
            background: `color-mix(in srgb, ${S.red} 5%, ${S.bgPanel})`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.red }}>
              Failed to load positions: {positionError}
            </span>
            <button
              onClick={() => dispatch(clearPositionError())}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.textTertiary, fontFamily: S.fontMono }}
            >×</button>
          </div>
        )}

        {/* ── Action bar: Generate Hedge Plan ── */}
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 0', borderBottom: `1px solid ${S.border}`,
        }}>
          <button
            type="button"
            onClick={() => handleCalculate()}
            disabled={!canCalculate}
            style={{
              fontFamily: S.fontMono, fontSize: '0.75rem', letterSpacing: '0.04em', fontWeight: 700,
              padding: '5px 20px',
              border: `1px solid ${canCalculate ? S.cyan : S.border}`,
              color: canCalculate ? 'var(--bg-deep)' : S.textTertiary,
              background: canCalculate ? S.cyan : 'transparent',
              cursor: canCalculate ? 'pointer' : 'not-allowed',
              transition: 'all 0.1s',
            }}
          >
            {loading ? 'GENERATING…' : '⚡ GENERATE HEDGE PLAN'}
          </button>
          {trades.length > 0 && (
            <span style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.textTertiary, letterSpacing: '0.04em' }}>
              {trades.length} POSITIONS · {tradeSummary.confirmed} CONFIRMED · {tradeSummary.forecast} FORECAST
            </span>
          )}
        </div>

        {/* ── Backend error banner ── */}
        {backendErrorMsg && (
          <BackendErrorBanner
            headerMessage={backendErrorMsg}
            errors={backendErrors}
            onDismiss={() => { setBackendErrorMsg(''); setBackendErrors([]); }}
            onResolve={handleResolveError}
          />
        )}

        {/* ── Ingestion Desk ── */}
        <div style={{ marginTop: 8 }}>

          {/* ── Tab strip ── */}
          <div style={{
            display:      'flex',
            borderBottom: `1px solid ${S.border}`,
            background:   S.bgSub,
            overflowX:    'auto',
          }}>
            {DESK_TABS.map(tab => {
              const active = deskTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setDeskTab(tab.key)}
                  style={{
                    fontFamily:    S.fontMono,
                    fontSize:      '0.75rem',
                    letterSpacing: '0.06em',
                    padding:       '8px 16px',
                    border:        'none',
                    borderBottom:  active ? `2px solid ${S.cyan}` : '2px solid transparent',
                    background:    active ? `color-mix(in srgb, ${S.cyan} 5%, ${S.bgPanel})` : 'transparent',
                    color:         active ? S.cyan : S.textTertiary,
                    cursor:        'pointer',
                    display:       'flex',
                    flexDirection: 'column',
                    gap:           2,
                    whiteSpace:    'nowrap',
                    transition:    'all 0.1s',
                  }}
                >
                  <span style={{ textTransform: 'uppercase' }}>{tab.label}</span>
                  <span style={{ fontSize: '0.625rem', opacity: 0.6, fontFamily: S.fontUI, textTransform: 'none', letterSpacing: 0 }}>
                    {tab.subtitle}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Tab: Upload CSV / Excel ── */}
          {deskTab === 'upload' && (
            <div style={{ padding: '16px' }}>
              <FileUploadLane
                token={token ?? undefined}
                onImportComplete={() => { if (token) dispatch(listPositionsThunk({ token })); }}
              />
            </div>
          )}

          {/* ── Tab: Connect Database ── */}
          {deskTab === 'database' && (
            <div style={{ padding: '16px' }}>
              <DatabaseConnectorLane />
            </div>
          )}

          {/* ── Tab: ERP Integration ── */}
          {deskTab === 'erp' && (
            <div style={{ padding: '16px' }}>
              <ConnectorPlaceholderLane
                title="ERP integration — coming soon"
                message="Pull exposure positions directly from SAP, Oracle EBS, or Microsoft Dynamics. One-click sync with field mapping configuration."
              />
            </div>
          )}

          {/* ── Tab: Accounting System ── */}
          {deskTab === 'accounting' && (
            <div style={{ padding: '16px' }}>
              <ConnectorPlaceholderLane
                title="Accounting system connector — coming soon"
                message="Connect to Xero, QuickBooks, or NetSuite to automatically import foreign currency invoices and payables as exposure positions."
              />
            </div>
          )}

          {/* ── Tab: Import History ── */}
          {deskTab === 'history' && (
            <div style={{ padding: '16px' }}>
              <ImportHistoryPanel token={token ?? undefined} />
            </div>
          )}

          {/* ── Tab: Manual Entry ── */}
          {deskTab === 'manual' && (
            <div>
              {/* ── Inline Trade Entry Form (always visible at top) ── */}
              <div
                data-section="add-exposure-line"
                style={{ background: S.bgSub, borderBottom: `1px solid ${S.border}` }}
              >
                {/* Form header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 14px',
                  borderBottom: `1px solid ${S.borderSoft}`,
                }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.textTertiary, letterSpacing: '0.1em' }}>
                    ADD EXPOSURE LINE
                  </span>
                  <span style={{ width: 1, height: 10, background: S.borderSoft, display: 'inline-block' }} />
                  <span style={{ fontFamily: S.fontUI, fontSize: '0.75rem', color: S.textTertiary }}>
                    Enter a new FX exposure position — saved to database
                  </span>
                </div>

                {/* Form grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 1,
                  background: S.border,
                  padding: 0,
                }}>
                  {/* RECORD ID */}
                  {(() => {
                    const err = inlineTouched.record_id && !inlineForm.record_id.trim()
                      ? 'Required'
                      : inlineTouched.record_id && inlineIdDuplicate
                      ? 'ID exists'
                      : null;
                    return (
                      <div style={{ background: S.bgPanel, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', color: err ? S.red : S.textTertiary }}>
                          RECORD ID {err && <span style={{ color: S.red }}>— {err}</span>}
                        </label>
                        <input
                          type="text"
                          value={inlineForm.record_id}
                          onChange={e => setInlineField('record_id', e.target.value)}
                          onBlur={() => touchInline('record_id')}
                          placeholder="e.g. TXN-001"
                          style={{
                            fontFamily: S.fontMono, fontSize: '0.875rem',
                            background: 'transparent', border: 'none',
                            borderBottom: `1px solid ${err ? S.red : S.borderSoft}`,
                            color: S.textPrimary, padding: '4px 0', outline: 'none', width: '100%',
                          }}
                        />
                      </div>
                    );
                  })()}

                  {/* ENTITY */}
                  {(() => {
                    const err = inlineTouched.entity && !inlineForm.entity.trim() ? 'Required' : null;
                    return (
                      <div style={{ background: S.bgPanel, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', color: err ? S.red : S.textTertiary }}>
                          ENTITY {err && <span style={{ color: S.red }}>— {err}</span>}
                        </label>
                        <input
                          type="text"
                          value={inlineForm.entity}
                          onChange={e => setInlineField('entity', e.target.value)}
                          onBlur={() => touchInline('entity')}
                          placeholder="e.g. Acme Corp"
                          style={{
                            fontFamily: S.fontMono, fontSize: '0.875rem',
                            background: 'transparent', border: 'none',
                            borderBottom: `1px solid ${err ? S.red : S.borderSoft}`,
                            color: S.textPrimary, padding: '4px 0', outline: 'none', width: '100%',
                          }}
                        />
                      </div>
                    );
                  })()}

                  {/* FLOW TYPE */}
                  <div style={{ background: S.bgPanel, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', color: S.textTertiary }}>FLOW TYPE</label>
                    <select
                      value={inlineForm.type}
                      onChange={e => setInlineField('type', e.target.value as TradeRow['type'])}
                      style={{ fontFamily: S.fontMono, fontSize: '0.875rem', background: S.bgPanel, border: 'none', borderBottom: `1px solid ${S.borderSoft}`, color: S.textPrimary, padding: '2px 0', outline: 'none', width: '100%', cursor: 'pointer' }}
                    >
                      <option value="AP">AP — Accounts Payable</option>
                      <option value="AR">AR — Accounts Receivable</option>
                    </select>
                  </div>

                  {/* CURRENCY */}
                  <div style={{ background: S.bgPanel, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', color: S.textTertiary }}>CURRENCY</label>
                    <select
                      value={inlineForm.currency}
                      onChange={e => setInlineField('currency', e.target.value as FuturesCurrency)}
                      style={{ fontFamily: S.fontMono, fontSize: '0.875rem', background: S.bgPanel, border: 'none', borderBottom: `1px solid ${S.borderSoft}`, color: S.textPrimary, padding: '2px 0', outline: 'none', width: '100%', cursor: 'pointer' }}
                    >
                      {FUTURES_CURRENCY_LIST.map(c => (
                        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* AMOUNT */}
                  {(() => {
                    const err = inlineTouched.amount && !(inlineForm.amount > 0) ? 'Must be > 0' : null;
                    return (
                      <div style={{ background: S.bgPanel, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', color: err ? S.red : S.textTertiary }}>
                          AMOUNT ({inlineForm.currency}) {err && <span style={{ color: S.red }}>— {err}</span>}
                        </label>
                        <input
                          type="number" min={0} step={1000}
                          value={inlineForm.amount || ''}
                          onChange={e => setInlineField('amount', parseFloat(e.target.value) || 0)}
                          onBlur={() => touchInline('amount')}
                          placeholder="0"
                          style={{ fontFamily: S.fontMono, fontSize: '0.875rem', background: 'transparent', border: 'none', borderBottom: `1px solid ${err ? S.red : S.borderSoft}`, color: S.textPrimary, padding: '4px 0', outline: 'none', width: '100%' }}
                        />
                      </div>
                    );
                  })()}

                  {/* VALUE DATE */}
                  {(() => {
                    const err = inlineTouched.value_date && !inlineForm.value_date ? 'Required' : null;
                    return (
                      <div style={{ background: S.bgPanel, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', color: err ? S.red : S.textTertiary }}>
                          VALUE DATE {err && <span style={{ color: S.red }}>— {err}</span>}
                        </label>
                        <input
                          type="date"
                          value={inlineForm.value_date}
                          onChange={e => setInlineField('value_date', e.target.value)}
                          onBlur={() => touchInline('value_date')}
                          style={{ fontFamily: S.fontMono, fontSize: '0.875rem', background: 'transparent', border: 'none', borderBottom: `1px solid ${err ? S.red : S.borderSoft}`, color: S.textPrimary, padding: '4px 0', outline: 'none', width: '100%', colorScheme: 'dark' }}
                        />
                      </div>
                    );
                  })()}

                  {/* STATUS */}
                  <div style={{ background: S.bgPanel, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', color: S.textTertiary }}>STATUS</label>
                    <select
                      value={inlineForm.status}
                      onChange={e => setInlineField('status', e.target.value as TradeRow['status'])}
                      style={{ fontFamily: S.fontMono, fontSize: '0.875rem', background: S.bgPanel, border: 'none', borderBottom: `1px solid ${S.borderSoft}`, color: S.textPrimary, padding: '2px 0', outline: 'none', width: '100%', cursor: 'pointer' }}
                    >
                      <option value="CONFIRMED">CONFIRMED</option>
                      <option value="FORECAST">FORECAST</option>
                    </select>
                  </div>

                  {/* DESCRIPTION */}
                  <div style={{ background: S.bgPanel, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', color: S.textTertiary }}>DESCRIPTION</label>
                    <input
                      type="text"
                      value={inlineForm.description ?? ''}
                      onChange={e => setInlineField('description', e.target.value)}
                      placeholder="Optional note"
                      style={{ fontFamily: S.fontMono, fontSize: '0.875rem', background: 'transparent', border: 'none', borderBottom: `1px solid ${S.borderSoft}`, color: S.textPrimary, padding: '4px 0', outline: 'none', width: '100%' }}
                    />
                  </div>
                </div>

                {/* Submit row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '8px 14px', borderTop: `1px solid ${S.borderSoft}` }}>
                  <button
                    type="button"
                    onClick={() => { setInlineForm(EMPTY_INLINE); setInlineTouched({}); }}
                    style={{ fontFamily: S.fontMono, fontSize: '0.75rem', letterSpacing: '0.04em', padding: '7px 14px', border: `1px solid ${S.border}`, color: S.textTertiary, background: 'transparent', cursor: 'pointer' }}
                  >CLEAR</button>
                  <button
                    type="button"
                    onClick={handleInlineSave}
                    disabled={inlineSaving}
                    style={{ fontFamily: S.fontMono, fontSize: '0.75rem', letterSpacing: '0.04em', fontWeight: 700, padding: '7px 18px', border: `1px solid ${inlineValid ? S.cyan : S.border}`, color: inlineValid ? S.cyan : S.textTertiary, background: inlineValid ? `color-mix(in srgb, ${S.cyan} 6%, transparent)` : 'transparent', cursor: inlineSaving ? 'not-allowed' : 'pointer', opacity: inlineSaving ? 0.6 : 1, transition: 'all 0.1s' }}
                  >{inlineSaving ? 'SAVING…' : '+ ADD POSITION'}</button>
                </div>
              </div>

              {/* ── Position Table (immediately below form, no gap) ── */}
              {positionsLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textTertiary, letterSpacing: '0.04em' }}>
                  LOADING POSITIONS…
                </div>
              ) : trades.length === 0 ? (
                <EmptyState
                  type="empty"
                  title="No positions yet"
                  message="Add your first FX exposure position using the form above, or import a CSV file."
                  className="py-4"
                />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  {/* Table caption */}
                  <div style={{ display: 'flex', gap: 16, padding: '6px 14px', background: S.bgSub, borderBottom: `1px solid ${S.border}`, fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.04em', color: S.textTertiary }}>
                    <span>TOTAL: {trades.length}</span>
                    <span style={{ color: S.cyan }}>CONFIRMED: {tradeSummary.confirmed}</span>
                    <span style={{ color: S.amber }}>FORECAST: {tradeSummary.forecast}</span>
                    <span>EXECUTED: {executedIds.length}</span>
                    {detectedCurrencies.length > 0 && (
                      <span style={{ color: S.amber }}>CCY: {detectedCurrencies.join(', ')}</span>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: S.fontUI, fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ background: S.bgSub, borderBottom: `1px solid ${S.border}` }}>
                        {['ID', 'Entity', 'Type', 'CCY', 'Amount', 'Value Date', 'Status', 'Description', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', color: S.textTertiary, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos, idx) => {
                        const isExecuted = executedIds.includes(pos.id);
                        const ibkrRef = ibkrRefs[pos.id];
                        return (
                          <tr key={pos.id} style={{ borderBottom: `1px solid ${S.borderSoft}`, background: isExecuted ? `color-mix(in srgb, ${S.green} 3%, transparent)` : 'transparent' }}>
                            <td style={{ padding: '7px 10px', fontFamily: S.fontMono, fontSize: '0.8125rem', color: S.textPrimary }}>{pos.record_id}</td>
                            <td style={{ padding: '7px 10px', color: S.textPrimary }}>{pos.entity}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                              <span style={{ padding: '2px 6px', borderRadius: 2, fontSize: '0.75rem', fontWeight: 600, background: pos.type === 'AR' ? `color-mix(in srgb, ${S.green} 12%, transparent)` : `color-mix(in srgb, ${S.red} 12%, transparent)`, color: pos.type === 'AR' ? S.green : S.red }}>
                                {pos.type}
                              </span>
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textSecondary }}>{pos.currency}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: S.fontMono, fontSize: '0.8125rem', color: S.textPrimary }}>{fmtMXN(pos.amount)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', fontFamily: S.fontMono, fontSize: '0.75rem' }}>{pos.value_date}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                              {isExecuted ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 2, fontSize: '0.6875rem', fontWeight: 700, background: `color-mix(in srgb, ${S.green} 12%, transparent)`, color: S.green, fontFamily: S.fontMono, letterSpacing: '0.04em' }}>
                                  ✓ EXECUTED
                                  {ibkrRef && <span style={{ fontSize: '0.625rem', opacity: 0.7 }}> · {ibkrRef}</span>}
                                </span>
                              ) : (
                                <span style={{ padding: '2px 7px', borderRadius: 2, fontSize: '0.6875rem', fontWeight: 600, fontFamily: S.fontMono, letterSpacing: '0.04em', background: pos.status === 'CONFIRMED' ? `color-mix(in srgb, ${S.cyan} 10%, transparent)` : `color-mix(in srgb, ${S.amber} 10%, transparent)`, color: pos.status === 'CONFIRMED' ? S.cyan : S.amber }}>
                                  {pos.status}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '7px 10px', color: S.textSecondary, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.description}</td>
                            <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {/* Duplicate */}
                                <button
                                  title="Duplicate"
                                  onClick={() => openDuplicateTrade(pos)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.textTertiary, padding: '3px 6px', fontFamily: S.fontMono, fontSize: '0.8125rem', letterSpacing: '0.02em' }}
                                  onMouseEnter={e => (e.currentTarget.style.color = S.cyan)}
                                  onMouseLeave={e => (e.currentTarget.style.color = S.textTertiary)}
                                >⊕</button>
                                {/* Edit */}
                                <button
                                  title="Edit"
                                  onClick={() => openEditTrade(idx)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.textTertiary, padding: '3px 6px', fontFamily: S.fontMono, fontSize: '0.8125rem' }}
                                  onMouseEnter={e => (e.currentTarget.style.color = S.amber)}
                                  onMouseLeave={e => (e.currentTarget.style.color = S.textTertiary)}
                                >✎</button>
                                {/* Execute via IBKR (only for non-executed CONFIRMED) */}
                                {!isExecuted && pos.status === 'CONFIRMED' && (
                                  <button
                                    title="Execute via IBKR"
                                    onClick={() => openIbkrModal(pos)}
                                    style={{ background: 'none', border: `1px solid ${S.green}`, cursor: 'pointer', color: S.green, padding: '1px 5px', fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.06em', borderRadius: 2 }}
                                  >IBKR</button>
                                )}
                                {/* Delete */}
                                <button
                                  title="Delete"
                                  onClick={() => {
                                    if (window.confirm(`Remove position "${pos.record_id}"?`)) {
                                      handleRemoveTrade(idx);
                                    }
                                  }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.textTertiary, padding: '2px 4px', fontFamily: S.fontMono, fontSize: '1rem', lineHeight: 1 }}
                                  onMouseEnter={e => (e.currentTarget.style.color = S.red)}
                                  onMouseLeave={e => (e.currentTarget.style.color = S.textTertiary)}
                                >×</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Sticky gate bar */}
      <div
        className="sticky bottom-0 z-40 shrink-0 no-print"
        style={{
          borderTop: `1px solid ${S.border}`,
          background: S.bgSub,
          fontFamily: S.fontMono,
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', color: S.textTertiary }}>GATE CHECK</span>
          {validationGates.filter(g => !g.met).map((g, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: '0.75rem', color: S.red,
                border: `1px solid ${S.red}`, padding: '1px 6px',
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: S.red, display: 'inline-block' }} />
              {g.label}
              {g.message && <span style={{ color: S.textTertiary, fontSize: '0.6875rem' }}> — {g.message}</span>}
            </span>
          ))}
          {validationGates.every(g => g.met) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: S.green }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: S.green, display: 'inline-block' }} />
              ALL GATES PASSED — CLICK GENERATE HEDGE PLAN IN THE RAIL ABOVE
            </span>
          )}
        </div>
      </div>

      {/* Modals */}
      <TradeModal
        open={tradeModalOpen} onClose={() => { setTradeModalOpen(false); setEditingPosition(undefined); }}
        onSave={handleSaveTrade}
        existingTrade={editingTrade}
        initialValues={tradeModalInitialValues}
        existingIds={tradeIdsForModal} forwardBuckets={forwardBuckets}
      />
      <HedgeModal
        open={hedgeModalOpen} onClose={() => setHedgeModalOpen(false)} onSave={handleSaveHedge}
        existingHedge={editingHedge} existingIds={hedgeIdsForModal} forwardBuckets={forwardBuckets}
      />

      {/* Auto-Resolve Confirmation Modal */}
      <Modal
        open={showAutoResolveConfirm}
        onClose={() => setShowAutoResolveConfirm(false)}
        title="Auto-Resolve Market Data Errors"
        subtitle="Fetch live market data and re-run the hedge calculation"
        width="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowAutoResolveConfirm(false)}
              style={{
                fontFamily: S.fontMono, fontSize: '0.625rem', letterSpacing: '0.06em',
                padding: '6px 16px', border: `1px solid ${S.border}`, color: S.textSecondary,
                background: 'transparent', cursor: 'pointer',
              }}
            >CANCEL</button>
            <button
              type="button"
              onClick={() => { setShowAutoResolveConfirm(false); handleCalculate({ forceMarketRefresh: true }); }}
              style={{
                fontFamily: S.fontMono, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em',
                padding: '6px 16px', border: `1px solid ${S.cyan}`, color: 'var(--bg-deep)',
                background: S.cyan, cursor: 'pointer',
              }}
            >CONFIRM & GENERATE</button>
          </>
        }
      >
        <div style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textSecondary, lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 12px' }}>
            The following market data errors will be automatically resolved by fetching live data from the market provider:
          </p>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14,
            padding: '10px 12px',
            background: 'color-mix(in srgb, var(--accent-cyan) 4%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent-cyan) 15%, transparent)',
            borderRadius: 3,
          }}>
            {backendErrors.filter(e => AUTO_RESOLVED_CODES.has(e.code)).map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: '0.625rem', fontWeight: 700, padding: '2px 6px',
                  color: 'var(--accent-cyan)',
                  background: 'color-mix(in srgb, var(--accent-cyan) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent-cyan) 20%, transparent)',
                  borderRadius: 2,
                }}>{e.code}</span>
                <span style={{ fontSize: '0.8125rem', color: S.textPrimary }}>{e.message}</span>
              </div>
            ))}
            {backendErrors.filter(e => AUTO_RESOLVED_CODES.has(e.code)).length === 0 && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--accent-cyan)' }}>
                V-011 (Spot Rate) · V-012 (Forward Points) · V-014 (Trade Bucket Forward Points)
              </span>
            )}
          </div>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: S.textPrimary }}>
            What happens when you confirm:
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>The engine fetches the current spot exchange rate for your currency pair</li>
            <li>Forward points are retrieved for all trade settlement months</li>
            <li>The hedge plan calculation is re-run with the fresh market data</li>
            <li>If successful, you will be redirected to the results page</li>
          </ol>
        </div>
      </Modal>

      {/* ── IBKR Execution Confirmation Modal ── */}
      <Modal
        open={ibkrModalOpen}
        onClose={() => { setIbkrModalOpen(false); setIbkrTargetPosition(undefined); }}
        title="Confirm Execution"
        subtitle={ibkrTargetPosition ? `Position: ${ibkrTargetPosition.record_id} · ${ibkrTargetPosition.currency} ${fmtMXN(ibkrTargetPosition.amount)}` : ''}
        width="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
            <button
              type="button"
              onClick={() => { setIbkrModalOpen(false); setIbkrTargetPosition(undefined); }}
              style={{ fontFamily: S.fontMono, fontSize: '0.75rem', letterSpacing: '0.04em', padding: '7px 14px', border: `1px solid ${S.border}`, color: S.textSecondary, background: 'transparent', cursor: 'pointer' }}
            >CANCEL</button>
            <button
              type="button"
              onClick={handleConfirmExecution}
              style={{ fontFamily: S.fontMono, fontSize: '0.75rem', letterSpacing: '0.04em', fontWeight: 700, padding: '7px 18px', border: `1px solid ${S.green}`, color: 'var(--bg-deep)', background: S.green, cursor: 'pointer' }}
            >✓ CONFIRM EXECUTED</button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
          <p style={{ fontFamily: S.fontUI, fontSize: '0.875rem', color: S.textSecondary, lineHeight: 1.6, margin: 0 }}>
            Mark this position as <strong style={{ color: S.green }}>executed</strong> via Interactive Brokers?
            This will flag it as a verified fact in the Position Desk.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', color: S.textTertiary }}>
              IBKR REFERENCE (optional)
            </label>
            <input
              type="text"
              value={ibkrRefInput}
              onChange={e => setIbkrRefInput(e.target.value)}
              placeholder="e.g. IBKR-2026-00341"
              style={{ fontFamily: S.fontMono, fontSize: '0.875rem', padding: '8px 10px', border: `1px solid ${S.border}`, background: S.bgSub, color: S.textPrimary, outline: 'none', width: '100%' }}
            />
          </div>
        </div>
      </Modal>

      <Toast message={toastMsg} visible={toastVisible} onClose={() => setToastVisible(false)} />
    </div>
  );
}
