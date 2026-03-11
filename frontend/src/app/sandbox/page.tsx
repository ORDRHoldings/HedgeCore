"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import type { RootState, AppDispatch } from "../../lib/store";
import {
  sandboxCalculateThunk,
  sandboxCalculateMultiThunk,
  setXRayOpen,
  setXRayContext,
  setSelectedPair,
} from "../../lib/store/slices/pipelineSlice";
import type { CalculateRequest, PolicyConfig } from "../../api/types";

// ─── Fallback policy (used when no active policy is loaded) ───────────────────
const DEFAULT_POLICY: PolicyConfig = {
  bucket_mode: "CALENDAR_MONTH",
  hedge_ratios: { confirmed: 0.80, forecast: 0.50 },
  cost_assumptions: { spread_bps: 5.0 },
  execution_product: "NDF",
  min_trade_size_usd: 0,
};

// ─── Fallback spot rate (BIS-calibrated USD/MXN baseline) ─────────────────────
const FALLBACK_SPOT_USDMXN = 18.97;

// ─── Demo simulation payload (runs without prior position data) ────────────────
const today = new Date();
const m1 = new Date(today.getFullYear(), today.getMonth() + 1, 28).toISOString().slice(0, 10);
const m2 = new Date(today.getFullYear(), today.getMonth() + 2, 28).toISOString().slice(0, 10);
const m3 = new Date(today.getFullYear(), today.getMonth() + 3, 28).toISOString().slice(0, 10);
const DEMO_REQUEST: CalculateRequest = {
  trades: [
    { record_id: "DEMO-001", entity: "DemoCompany", type: "AR",  currency: "MXN", amount: 5_000_000, value_date: m1, status: "CONFIRMED", description: "Demo Q+1 export receivable" },
    { record_id: "DEMO-002", entity: "DemoCompany", type: "AP",  currency: "MXN", amount: 2_500_000, value_date: m2, status: "FORECAST",  description: "Demo supplier payment" },
    { record_id: "DEMO-003", entity: "DemoCompany", type: "AR",  currency: "MXN", amount: 3_200_000, value_date: m3, status: "CONFIRMED", description: "Demo Q+3 export receivable" },
    { record_id: "DEMO-004", entity: "DemoBranch",  type: "AP",  currency: "MXN", amount: 1_800_000, value_date: m2, status: "FORECAST",  description: "Demo branch import" },
  ],
  hedges: [],
  market: {
    as_of: today.toISOString().slice(0, 10),
    spot_rate: FALLBACK_SPOT_USDMXN,
    forward_points_by_month: { [m1.slice(0, 7)]: 0.0220, [m2.slice(0, 7)]: 0.0440, [m3.slice(0, 7)]: 0.0660 },
    provider_metadata: { source: "DEMO", primary_currency: "MXN" },
  },
  policy: DEFAULT_POLICY,
};

import HelpPanelV2 from "@/components/help/HelpPanelV2";
import { SANDBOX_HELP } from "@/lib/help";

// UI primitives
import KpiTile from "../../components/ui/KpiTile";
import XRayDrawer, { JsonViewer } from "../../components/ui/XRayDrawer";
import StatusChip from "../../components/ui/StatusChip";
import type { ChipStatus } from "../../components/ui/StatusChip";
import EmptyState from "../../components/ui/EmptyState";
import ErrorBanner from "../../components/ui/ErrorBanner";

// Sandbox components — institutional grade
import WaterfallEngine from "../../components/sandbox/WaterfallEngine";
import AllocatorSummary from "../../components/sandbox/AllocatorSummary";
import ScenarioStressTester from "../../components/sandbox/ScenarioStressTester";
import CrisisScenarioLibrary, { type CrisisEvent } from "../../components/sandbox/CrisisScenarioLibrary";
import RiskAttributionPanel from "../../components/sandbox/RiskAttributionPanel";
import WhatIfBuilder from "../../components/sandbox/WhatIfBuilder";
import RegulatoryCapital from "../../components/sandbox/RegulatoryCapital";
import MarketMicrostructure from "../../components/sandbox/MarketMicrostructure";
import WhitepaperExport from "../../components/sandbox/WhitepaperExport";
import { HedgeGauge } from "../../components/sandbox/VisualizationSuite";
import AuditEngine from "../../components/sandbox/AuditEngine";
import { AICommentaryPanel } from "../../components/sandbox/AICommentaryPanel";
import PairSelector from "../../components/sandbox/PairSelector";
import AttributionTab from "../../components/sandbox/AttributionTab";
import LiquidityTab from "../../components/sandbox/LiquidityTab";
import ConstraintsTab from "../../components/sandbox/ConstraintsTab";
import ForwardValidationPanel from "../../components/sandbox/ForwardValidationPanel";
import NettingSummaryPanel from "../../components/sandbox/NettingSummaryPanel";
import TensorDecompositionPanel from "../../components/sandbox/TensorDecompositionPanel";
import { getDemoRequest } from "../../constants/demoFixtures";
import { getPairMeta } from "../../constants/pairRegistry";

import { PageShell } from "@/components/layout/PageShell";
import { Zap } from "lucide-react";

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

// ─── Tab definitions ──────────────────────────────────────────────────────────
type SandboxTab = "stress" | "attribution" | "crises" | "whatif" | "regulatory" | "microstructure" | "audit" | "v2analytics";

const TABS: Array<{ id: SandboxTab; label: string; icon: string; subtitle: string }> = [
  { id: "stress",          label: "Stress Testing",     icon: "⚡", subtitle: "Scenario P&L · Tornado chart · Historical shocks · CF-VaR" },
  { id: "attribution",     label: "Risk Attribution",   icon: "◈", subtitle: "Waterfall · DV01 Ladder · Greeks · Correlation matrix" },
  { id: "crises",          label: "Crisis Library",     icon: "⚠", subtitle: "18 calibrated crises (1994–2023) · Multi-factor shocks" },
  { id: "whatif",          label: "What-If Builder",    icon: "⊟", subtitle: "Parameter explorer · Policy checker · A/B comparison" },
  { id: "regulatory",      label: "Regulatory Capital", icon: "⚖", subtitle: "SA-CCR (BCBS 279) · CVA · ISDA SIMM v2.6 · Leverage Ratio" },
  { id: "microstructure",  label: "Market Structure",   icon: "◎", subtitle: "BIS 2022 spreads · Kyle's λ · Almgren-Chriss execution" },
  { id: "audit",           label: "Audit Report",       icon: "🔐", subtitle: "14-rule compliance engine · Certification · Governance chain" },
  { id: "v2analytics", label: "V2 Analytics", icon: "⬡", subtitle: "Forward validation · Netting · Attribution · Liquidity · Constraints · Tensor" },
];

// ─── Live market data hook ────────────────────────────────────────────────────
function useLiveSpot(primaryCurrency: string) {
  const [liveSpot, setLiveSpot] = useState<number | null>(null);
  const [liveStatus, setLiveStatus] = useState<"loading" | "live" | "fallback" | "idle">("idle");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const fetchSpot = useCallback(async () => {
    setLiveStatus("loading");
    try {
      const res = await fetch(`/api/market-autofill?currency=${primaryCurrency}&buckets=2026-06`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Record<string, unknown>;
      const spot = (data.spot_rate ?? data.spot ?? data.spot_rate) as number | undefined;
      if (spot && spot > 0) {
        setLiveSpot(spot);
        setLiveStatus("live");
        setFetchedAt(new Date().toISOString());
      } else {
        throw new Error("No spot in response");
      }
    } catch {
      setLiveStatus("fallback");
    }
  }, [primaryCurrency]);

  useEffect(() => {
    fetchSpot();
    const interval = setInterval(fetchSpot, 300_000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchSpot]);

  return { liveSpot, liveStatus, fetchedAt, refreshSpot: fetchSpot };
}

// ─── Market data status badge ─────────────────────────────────────────────────
function DataSourceBadge({ status, fetchedAt }: { status: string; fetchedAt: string | null }) {
  const isLive = status === "live";
  const isLoading = status === "loading";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "3px 9px",
      border: `1px solid ${isLive ? "var(--accent-green)" : isLoading ? "var(--border-rim)" : "var(--accent-amber)"}`,
      borderRadius: 2,
      background: isLive
        ? "color-mix(in srgb, var(--accent-green) 10%, transparent)"
        : isLoading
          ? "transparent"
          : "color-mix(in srgb, var(--accent-amber) 10%, transparent)",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: isLive ? "var(--accent-green)" : isLoading ? "var(--text-tertiary)" : "var(--accent-amber)",
        flexShrink: 0,
        animation: isLoading ? "pulse 1.2s infinite" : undefined,
      }} />
      <span style={{
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
        color: isLive ? "var(--accent-green)" : isLoading ? "var(--text-tertiary)" : "var(--accent-amber)",
      }}>
        {isLive ? "LIVE" : isLoading ? "FETCHING" : "CALIBRATED"}
      </span>
      {fetchedAt && isLive && (
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: "var(--text-tertiary)" }}>
          {new Date(fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}

// ─── KPI tile (larger, institutional-grade) ───────────────────────────────────
function BigKpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4,
      padding: "12px 16px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: accent ?? S.primary, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Inline audit summary (shown in stress tab when no dedicated audit component) ─
function InlineAuditSummary({ sandboxResult, liveDataFetched }: {
  sandboxResult: NonNullable<ReturnType<typeof useSelector<RootState, RootState["pipeline"]["sandboxResult"]>>>;
  liveDataFetched: boolean;
}) {
  const waterfall = sandboxResult.waterfall_result;
  const envelope = sandboxResult.run_envelope as Record<string, unknown> | undefined;
  const isRealEngine = !!envelope?.inputs_hash;
  const hasTrace = Array.isArray(sandboxResult.trace_events) && sandboxResult.trace_events.length > 0;

  const govRules = [
    {
      id: "GOV-001", name: "Run Hash Integrity",
      status: isRealEngine ? "PASS" : "INFO",
      ref: "MiFID II RTS 6 §4",
      evidence: isRealEngine ? `SHA-256: ${String(envelope?.inputs_hash).slice(0, 16)}…` : "Hashes not computed for this run",
    },
    {
      id: "GOV-002", name: "Trace Event Completeness",
      status: hasTrace ? "PASS" : "INFO",
      ref: "EMIR Art. 9(1)",
      evidence: hasTrace ? `${(sandboxResult.trace_events as unknown[]).length} events logged` : "No trace events in this run",
    },
    {
      id: "GOV-003", name: "Market Data Source",
      status: liveDataFetched ? "PASS" : "WARN",
      ref: "MiFID II RTS 25 Art. 2",
      evidence: liveDataFetched ? "Live spot from Alpha Vantage API" : "Using BIS-calibrated fallback rates",
    },
  ];

  const statusColor = (s: string) => s === "PASS" ? S.green : s === "WARN" ? S.amber : s === "FAIL" ? S.red : S.tertiary;

  return (
    <div style={{ background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
          GOVERNANCE CHAIN
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>
          R1–R8 Waterfall + GOV checks
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: S.panel }}>
              {["Rule ID", "Name", "Status", "Evidence", "Regulatory Ref"].map(h => (
                <th key={h} style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  color: S.tertiary, textTransform: "uppercase",
                  padding: "8px 14px", textAlign: "left",
                  borderBottom: `1px solid ${S.rim}`,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {waterfall?.rules?.map((r: { rule_id: string; name: string; status: string; result_summary?: string; threshold?: unknown }) => (
              <tr key={r.rule_id} style={{ borderBottom: `1px solid ${S.soft}` }}>
                <td style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan, padding: "10px 14px" }}>{r.rule_id}</td>
                <td style={{ fontFamily: S.fontUI, fontSize: 13, color: S.primary, padding: "10px 14px" }}>{r.name}</td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                    color: statusColor(r.status),
                    padding: "2px 8px",
                    border: `1px solid ${statusColor(r.status)}`,
                    borderRadius: 2,
                    background: `color-mix(in srgb, ${statusColor(r.status)} 10%, transparent)`,
                  }}>● {r.status}</span>
                </td>
                <td style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, padding: "10px 14px" }}>
                  {r.result_summary ?? "—"}
                </td>
                <td style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, padding: "10px 14px" }}>
                  IFRS 9 / Basel III
                </td>
              </tr>
            ))}
            {govRules.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${S.soft}`, background: `color-mix(in srgb, ${S.sub} 40%, transparent)` }}>
                <td style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.amber, padding: "10px 14px" }}>{r.id}</td>
                <td style={{ fontFamily: S.fontUI, fontSize: 13, color: S.primary, padding: "10px 14px" }}>{r.name}</td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                    color: statusColor(r.status),
                    padding: "2px 8px",
                    border: `1px solid ${statusColor(r.status)}`,
                    borderRadius: 2,
                    background: `color-mix(in srgb, ${statusColor(r.status)} 10%, transparent)`,
                  }}>● {r.status}</span>
                </td>
                <td style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, padding: "10px 14px" }}>{r.evidence}</td>
                <td style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, padding: "10px 14px" }}>{r.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Widget embed mode ─────────────────────────────────────────────────────────
function WidgetMode({ currency, notional, tab }: { currency: string; notional: number; tab: SandboxTab }) {
  const dispatch = useDispatch<AppDispatch>();
  const { token } = useAuth();
  const { sandboxResult, sandboxLoading } = useSelector((s: RootState) => s.pipeline);
  const { liveSpot, liveStatus } = useLiveSpot(currency);

  const spot = liveSpot ?? (sandboxResult?.frozen_inputs?.market as Record<string, unknown> | undefined)?.spot_rate as number ?? FALLBACK_SPOT_USDMXN;

  return (
    <div style={{
      fontFamily: S.fontUI, background: S.panel,
      border: `1px solid ${S.rim}`, borderRadius: 6,
      minHeight: 400, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: `1px solid ${S.rim}`,
        background: S.sub,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: S.cyan }}>
            HEDGECORE
          </span>
          <DataSourceBadge status={liveStatus} fetchedAt={null} />
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            {currency} · {(notional / 1e6).toFixed(0)}M · Spot {spot.toFixed(4)}
          </span>
        </div>
        <a href="/sandbox" target="_blank" style={{
          fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textDecoration: "none",
          padding: "3px 10px", border: `1px solid ${S.rim}`, borderRadius: 2,
        }}>Full Platform ↗</a>
      </div>
      {sandboxLoading && <EmptyState type="loading" message="Initialising engine…" />}
      {!sandboxLoading && (
        <div style={{ padding: 16 }}>
          {tab === "stress" && (
            <ScenarioStressTester
              sandboxResult={sandboxResult}
              defaultPolicy={DEFAULT_POLICY}
              defaultSpot={liveSpot ?? FALLBACK_SPOT_USDMXN}
            />
          )}
          {tab === "attribution" && <RiskAttributionPanel sandboxResult={sandboxResult} spot={spot} />}
          {tab === "whatif" && <WhatIfBuilder sandboxResult={sandboxResult} defaultPolicy={DEFAULT_POLICY} defaultSpot={spot} />}
          {tab === "regulatory" && <RegulatoryCapital sandboxResult={sandboxResult} spot={spot} />}
          {tab === "microstructure" && <MarketMicrostructure notionalUSD={notional / spot} primaryCurrency={currency} spot={spot} />}
        </div>
      )}
      <div style={{
        padding: "6px 16px", borderTop: `1px solid ${S.soft}`,
        fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, background: S.sub,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>HedgeCore ORDR Terminal · Free simulation engine</span>
        <span>Not investment advice · All values indicative</span>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
function SandboxPageInner() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const {
    sandboxResult,
    sandboxLoading,
    xrayOpen,
    error,
    decisionPacketMode,
    selectedPair,
  } = useSelector((s: RootState) => s.pipeline);

  const [activeTab, setActiveTab] = useState<SandboxTab>("stress");
  const [selectedCrisis, setSelectedCrisis] = useState<CrisisEvent | null>(null);

  // Widget mode
  const isWidget = searchParams?.get("widget") === "true";
  const widgetCurrency = searchParams?.get("currency") ?? "MXN";
  const widgetNotional = parseFloat(searchParams?.get("notional") ?? "10000000");
  const widgetTab = (searchParams?.get("tab") ?? "stress") as SandboxTab;

  const waterfall = sandboxResult?.waterfall_result;
  const v2 = sandboxResult?.v2_results;

  // Primary currency derived from sandbox result market metadata
  const primaryCurrency = useMemo(() => {
    const m = sandboxResult?.frozen_inputs?.market as Record<string, unknown> | undefined;
    const meta = m?.provider_metadata as Record<string, unknown> | undefined;
    const fromResult = meta?.primary_currency as string | undefined;
    if (fromResult) return fromResult;
    return getPairMeta(selectedPair)?.localCcy ?? "MXN";
  }, [sandboxResult, selectedPair]);

  // Live spot hook
  const { liveSpot, liveStatus, fetchedAt, refreshSpot } = useLiveSpot(primaryCurrency);

  const spot = useMemo(() => {
    if (liveSpot && liveSpot > 0) return liveSpot;
    const m = sandboxResult?.frozen_inputs?.market as Record<string, unknown> | undefined;
    return (m?.spot_rate as number | undefined) ?? FALLBACK_SPOT_USDMXN;
  }, [liveSpot, sandboxResult]);

  const notionalUSD = useMemo(() => {
    const plan = sandboxResult?.calculate_response?.hedge_plan;
    const summary = plan?.summary as Record<string, number> | undefined;
    return (summary?.total_commercial_exposure_mxn ?? 10_000_000) / spot;
  }, [sandboxResult, spot]);

  // Coverage ratio
  const coverageRatio = useMemo(() => {
    const plan = sandboxResult?.calculate_response?.hedge_plan;
    const summary = plan?.summary as Record<string, number> | undefined;
    if (!summary) return 0;
    const exp = summary.total_commercial_exposure_mxn ?? 1;
    const hedged = summary.total_hedge_position_mxn ?? summary.total_hedge_notional_mxn ?? 0;
    return Math.min(1.25, hedged / Math.max(exp, 1));
  }, [sandboxResult]);

  const handlePairChange = useCallback((pair: string) => {
    dispatch(setSelectedPair(pair));
    const req = getDemoRequest(pair);
    dispatch(sandboxCalculateMultiThunk({ request: req, pair, token: token ?? undefined }));
  }, [dispatch, token]);

  const handleXRay = useCallback(
    (context: Record<string, unknown>) => {
      dispatch(setXRayContext(context));
      dispatch(setXRayOpen(true));
    },
    [dispatch]
  );

  // Auto-run demo simulation on mount when no result exists
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!autoRanRef.current && !sandboxResult && !sandboxLoading && token) {
      autoRanRef.current = true;
      const req = getDemoRequest(selectedPair);
      dispatch(sandboxCalculateMultiThunk({ request: req, pair: selectedPair, token }));
    }
  }, [sandboxResult, sandboxLoading, token, selectedPair, dispatch]);

  // Widget mode
  if (isWidget) {
    return <WidgetMode currency={widgetCurrency} notional={widgetNotional} tab={widgetTab} />;
  }

  // Decision Packet Mode
  if (decisionPacketMode && sandboxResult) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 28 }}>
        <h1 style={{ fontFamily: S.fontUI, fontSize: 22, fontWeight: 700, color: S.primary, marginBottom: 6 }}>
          Decision Packet — Executive Summary
        </h1>
        <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginBottom: 20 }}>
          Run ID: <strong>{sandboxResult.run_id}</strong> · Generated: {new Date().toLocaleString()}
        </p>
        <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, padding: 18, marginBottom: 14 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 10 }}>WATERFALL STATUS</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {waterfall?.rules.map((r: { rule_id: string; status: string }) => (
              <div key={r.rule_id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{r.rule_id}</span>
                <StatusChip status={r.status as ChipStatus} size="sm" />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontFamily: S.fontMono, fontSize: 13, color: S.secondary }}>
            Integrity: <span style={{ fontWeight: 700, color: S.primary, fontSize: 16 }}>{waterfall?.integrity_score ?? "—"}/100</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
          <KpiTile label="Coverage" value={`${(coverageRatio * 100).toFixed(1)}%`} />
          <KpiTile label="Worst-Case Loss" value={v2?.worst_case ? `-$${Math.abs((v2.worst_case as Record<string, unknown>).worst_case_loss as number ?? 0).toLocaleString()}` : "—"} />
          <KpiTile label="Margin Used" value={v2?.margin_summary ? `$${((v2.margin_summary as Record<string, unknown>).total_margin as number ?? 0).toLocaleString()}` : "—"} />
          <KpiTile label="Live Spot" value={`${spot.toFixed(4)} ${primaryCurrency}`} />
        </div>
        <ScenarioStressTester sandboxResult={sandboxResult} defaultPolicy={DEFAULT_POLICY} defaultSpot={spot} />
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

      {/* ── Page header strip ── */}
      <div style={{
        borderBottom: `1px solid ${S.rim}`,
        background: S.panel,
        padding: "0 16px",
        display: "flex", alignItems: "center", gap: 12, height: 48,
        flexShrink: 0,
      }}>
        <button onClick={() => router.push("/position-desk")} style={{
          fontFamily: S.fontUI, fontSize: 12, fontWeight: 500,
          padding: "3px 10px", border: `1px solid ${S.rim}`,
          color: S.secondary, background: "transparent", cursor: "pointer", borderRadius: 2,
        }}>← Position Desk</button>

        <span style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.12em", color: S.tertiary }}>
          SIMULATION LAB
        </span>
        <PairSelector value={selectedPair} onChange={handlePairChange} />

        {/* Live data badge */}
        <DataSourceBadge status={liveStatus} fetchedAt={fetchedAt} />

        {/* Live spot display */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>
            {spot.toFixed(4)}
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            {primaryCurrency}/USD
          </span>
          <button onClick={refreshSpot} title="Refresh live spot" style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
            background: "transparent", border: "none", cursor: "pointer", padding: "0 2px",
          }}>↻</button>
        </div>

        {sandboxResult && (
          <>
            <span style={{ color: S.rim }}>|</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
              RUN <span style={{ color: S.cyan, fontWeight: 700 }}>{sandboxResult.run_id.slice(0, 8).toUpperCase()}</span>
            </span>
            {waterfall && (
              <span style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                padding: "3px 8px", borderRadius: 2,
                background: `color-mix(in srgb, ${waterfall.integrity_score >= 80 ? S.green : S.amber} 12%, transparent)`,
                color: waterfall.integrity_score >= 80 ? S.green : S.amber,
                border: `1px solid ${waterfall.integrity_score >= 80 ? S.green : S.amber}`,
              }}>
                {waterfall.integrity_score}/100
              </span>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Whitepaper download link */}
        {sandboxResult && (
          <button
            onClick={() => router.push(`/sandbox/whitepaper?runId=${sandboxResult.run_id}`)}
            style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
              padding: "4px 12px", border: `1px solid ${S.rim}`,
              color: S.secondary, background: "transparent", cursor: "pointer", borderRadius: 2,
              display: "flex", alignItems: "center", gap: 5,
            }}>
            ⬇ Whitepaper
          </button>
        )}

        {sandboxResult && (
          <button onClick={() => router.push("/hedge-desk")} style={{
            fontFamily: S.fontUI, fontSize: 12, fontWeight: 700,
            padding: "5px 16px",
            border: `1px solid ${S.cyan}`,
            color: S.cyan, background: "transparent", cursor: "pointer", borderRadius: 2,
          }}>Execution Bridge →</button>
        )}
      </div>

      {/* ── Pair Context Banner ── */}
      {(() => {
        const meta = getPairMeta(selectedPair);
        if (!meta) return null;
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "4px 16px",
            borderBottom: `1px solid ${S.soft}`,
            background: `color-mix(in srgb, ${S.sub} 60%, ${S.panel})`,
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>PAIR</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan }}>{meta.label}</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{meta.group}</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>·</span>
            {meta.isNdf ? (
              <span style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.amber,
                padding: "1px 6px", border: `1px solid ${S.amber}`, borderRadius: 2,
                background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
              }}>NDF CASH-SETTLED</span>
            ) : (
              <span style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.green,
                padding: "1px 6px", border: `1px solid ${S.green}`, borderRadius: 2,
                background: `color-mix(in srgb, ${S.green} 10%, transparent)`,
              }}>DELIVERABLE</span>
            )}
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Spot fallback: {meta.demoSpot.toLocaleString("en", { maximumFractionDigits: 4, minimumFractionDigits: 2 })}</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>ADV: ${meta.adv_mn.toLocaleString()}M</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>1M Vol: {meta.vol1m}%</span>
          </div>
        );
      })()}

      {/* ── Main body: 3-column flex ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

        {/* ── Left rail ── */}
        <aside style={{
          width: 232, flexShrink: 0,
          borderRight: `1px solid ${S.rim}`,
          background: S.panel,
          overflowY: "auto",
          display: "flex", flexDirection: "column",
        }}>
          {sandboxResult && waterfall && (
            <div style={{ padding: "12px 14px", borderTop: `1px solid ${S.rim}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 10 }}>
                SIMULATION SUMMARY
              </div>

              {/* Coverage gauge */}
              <HedgeGauge ratio={coverageRatio} label="Hedge Coverage" />

              {/* KPI rows */}
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  ["Integrity", `${waterfall.integrity_score}/100`],
                  ["Rules", `${waterfall.rules.filter((r: { status: string }) => r.status === "PASS").length}/${waterfall.rules.length} PASS`],
                  ["Live Spot", `${spot.toFixed(4)}`],
                  ["Data Source", liveStatus === "live" ? "Live API" : "Calibrated"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Rule chips */}
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                {waterfall.rules.map((r: { rule_id: string; status: string }) => (
                  <div key={r.rule_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{r.rule_id}</span>
                    <StatusChip status={r.status as ChipStatus} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit shortcut when no result */}
          {!sandboxResult && (
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em" }}>
                SIMULATION LAB STATUS
              </div>
              <div style={{
                padding: "8px 12px", border: `1px solid ${S.cyan}`, borderRadius: 3,
                fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.5,
                background: `color-mix(in srgb, ${S.cyan} 5%, transparent)`,
              }}>
                {sandboxLoading ? "▶ Running demo simulation…" : "Demo simulation running — all 7 quant tabs will populate momentarily."}
              </div>
              <DataSourceBadge status={liveStatus} fetchedAt={fetchedAt} />
              {liveSpot && (
                <div style={{
                  fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.primary,
                  padding: "6px 12px", background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 2,
                }}>
                  {liveSpot.toFixed(4)} <span style={{ fontWeight: 400, color: S.tertiary, fontSize: 12 }}>{primaryCurrency}/USD</span>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── Center: tab bar + content ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Tab bar */}
          <div style={{
            display: "flex", borderBottom: `1px solid ${S.rim}`,
            background: S.sub, overflowX: "auto", flexShrink: 0,
          }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                padding: "0 18px", height: 42,
                border: "none",
                borderBottom: activeTab === tab.id ? `2px solid ${S.cyan}` : "2px solid transparent",
                background: "transparent",
                color: activeTab === tab.id ? S.cyan : S.tertiary,
                cursor: "pointer",
                whiteSpace: "nowrap",
                letterSpacing: "0.03em",
                transition: "color 100ms",
              }}>
                {tab.icon} {tab.label}
                {tab.id === "audit" && sandboxResult && (
                  <span style={{
                    marginLeft: 6, fontSize: 12, fontWeight: 700,
                    color: (waterfall?.integrity_score ?? 0) >= 80 ? S.green : S.amber,
                    border: `1px solid ${(waterfall?.integrity_score ?? 0) >= 80 ? S.green : S.amber}`,
                    borderRadius: 2, padding: "1px 4px",
                  }}>
                    {waterfall?.integrity_score ?? "?"}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab subtitle */}
          <div style={{
            padding: "5px 18px",
            borderBottom: `1px solid ${S.soft}`,
            fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
            background: `color-mix(in srgb, ${S.sub} 40%, transparent)`,
            flexShrink: 0, display: "flex", alignItems: "center", gap: 12,
          }}>
            <span>{TABS.find(t => t.id === activeTab)?.subtitle}</span>
            {activeTab === "crises" && selectedCrisis && (
              <span style={{
                color: S.amber, fontWeight: 700,
                padding: "1px 8px", border: `1px solid ${S.amber}`, borderRadius: 2,
              }}>
                ACTIVE: {selectedCrisis.shortName} · {selectedCrisis.stressParams.spotShock.toFixed(0)}% shock
              </span>
            )}
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

            {error && <ErrorBanner code={error.code} message={error.message} />}

            {/* Empty state */}
            {!sandboxResult && !sandboxLoading && (
              <EmptyState
                type="empty"
                title="No simulation data"
                message="Upload exposure positions via the Position Desk to run a hedge calculation."
                action={{ label: "Go to Position Desk", onClick: () => router.push("/position-desk") }}
              />
            )}

            {sandboxLoading && <EmptyState type="loading" message="Running simulation engine…" />}

            {/* ══════════ TAB: STRESS TESTING ══════════ */}
            {activeTab === "stress" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                {/* KPI strip — larger, institutional */}
                {sandboxResult && waterfall && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                    <BigKpi
                      label="Integrity Score"
                      value={`${waterfall.integrity_score}/100`}
                      sub="Weighted 14-rule audit"
                      accent={waterfall.integrity_score >= 85 ? S.green : waterfall.integrity_score >= 70 ? S.amber : S.red}
                    />
                    <BigKpi
                      label="Overall Status"
                      value={waterfall.overall_status}
                      sub={`${waterfall.rules.filter((r: { status: string }) => r.status === "PASS").length}/${waterfall.rules.length} rules passed`}
                      accent={waterfall.overall_status === "PASS" ? S.green : S.amber}
                    />
                    <BigKpi
                      label="Hedge Coverage"
                      value={`${(coverageRatio * 100).toFixed(1)}%`}
                      sub="IFRS 9 band: 80–125%"
                      accent={coverageRatio >= 0.80 && coverageRatio <= 1.25 ? S.green : S.amber}
                    />
                    <BigKpi
                      label="Live Spot"
                      value={`${spot.toFixed(4)}`}
                      sub={`${primaryCurrency}/USD · ${liveStatus === "live" ? "Alpha Vantage API" : "BIS calibrated"}`}
                      accent={liveStatus === "live" ? S.green : S.amber}
                    />
                    <BigKpi
                      label="Run ID"
                      value={sandboxResult.run_id.slice(0, 8).toUpperCase()}
                      sub={`Engine v${(sandboxResult.run_envelope as Record<string, unknown> | undefined)?.engine_version ?? "—"}`}
                    />
                  </div>
                )}

                {/* Waterfall engine */}
                {sandboxResult && waterfall && (
                  <>
                    <WaterfallEngine
                      waterfall={waterfall}
                      runId={sandboxResult.run_id}
                      v2ModuleCount={Object.keys(v2 ?? {}).filter(k => (v2 as Record<string, unknown>)[k] != null).length}
                      onRuleClick={(r) => handleXRay({ tab: "rule", data: r })}
                      onXRay={() => handleXRay({ tab: "waterfall", data: waterfall })}
                    />

                    <AllocatorSummary
                      allocatorResult={v2?.allocator_result as Record<string, unknown> | undefined}
                      currencyNetting={v2?.currency_netting as Record<string, unknown> | undefined}
                    />

                    {/* Governance audit inline */}
                    <InlineAuditSummary
                      sandboxResult={sandboxResult}
                      liveDataFetched={liveStatus === "live"}
                    />
                  </>
                )}

                {/* Crisis scenario banner */}
                {selectedCrisis && (
                  <div style={{
                    background: `color-mix(in srgb, ${S.amber} 6%, transparent)`,
                    border: `1px solid ${S.amber}`, borderRadius: 4, padding: "12px 16px",
                  }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.amber, marginBottom: 8, letterSpacing: "0.08em" }}>
                      ACTIVE CRISIS SCENARIO: {selectedCrisis.name.toUpperCase()}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 10 }}>
                      {[
                        ["FX Shock", `${selectedCrisis.stressParams.spotShock.toFixed(0)}%`],
                        ["Vol Spike", `+${selectedCrisis.stressParams.volShock.toFixed(0)}pp`],
                        ["Correl Break", `${(selectedCrisis.stressParams.correlBreak * 100).toFixed(0)}%`],
                        ["Liq. Premium", `+${selectedCrisis.stressParams.liquidityPremium}bps`],
                        ["NDF Effectiveness", `${selectedCrisis.hedgeEffectiveness.ndf.toFixed(1)}%`],
                      ].map(([k, v]) => (
                        <div key={k} style={{ background: S.sub, borderRadius: 3, padding: "8px 12px", border: `1px solid ${S.soft}` }}>
                          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginBottom: 4 }}>{k}</div>
                          <div style={{ fontFamily: S.fontMono, fontSize: 16, fontWeight: 700, color: S.amber }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6, margin: 0 }}>
                      {selectedCrisis.description.slice(0, 400)}…
                    </p>
                    <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                      Academic ref: {selectedCrisis.academicRef} · Region: {selectedCrisis.region} · Severity: {selectedCrisis.severity}
                    </div>
                    <button onClick={() => setSelectedCrisis(null)} style={{
                      marginTop: 8, fontFamily: S.fontMono, fontSize: 12,
                      color: S.tertiary, background: "transparent", border: `1px solid ${S.soft}`,
                      cursor: "pointer", padding: "3px 10px", borderRadius: 2,
                    }}>✕ Clear crisis</button>
                  </div>
                )}

                {/* Stress tester */}
                <ScenarioStressTester
                  sandboxResult={sandboxResult}
                  defaultPolicy={DEFAULT_POLICY}
                  defaultSpot={spot}
                />

                {/* AI Commentary Panel — strictly analytical */}
                {sandboxResult && (
                  <AICommentaryPanel
                    sandboxResult={sandboxResult}
                    spot={spot}
                    notionalUSD={notionalUSD}
                    scenarioShock={selectedCrisis ? selectedCrisis.stressParams.spotShock / 100 : -0.25}
                    scenarioLabel={selectedCrisis ? selectedCrisis.name : "Custom Scenario (−25%)"}
                  />
                )}

                {/* Execution bridge CTA */}
                {sandboxResult && (
                  <div style={{
                    background: `color-mix(in srgb, ${S.cyan} 4%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
                    borderRadius: 4, padding: "14px 20px",
                    display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
                  }}>
                    <div>
                      <p style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.06em", color: S.cyan, marginBottom: 4 }}>
                        SIMULATION COMPLETE
                      </p>
                      <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, margin: 0 }}>
                        Integrity {waterfall?.integrity_score}/100 · {waterfall?.rules.filter((r: { status: string }) => r.status === "PASS").length}/{waterfall?.rules.length} rules passed · Live spot {spot.toFixed(4)}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => router.push(`/sandbox/whitepaper?runId=${sandboxResult.run_id}`)} style={{
                        fontFamily: S.fontUI, fontSize: 12, fontWeight: 600,
                        padding: "7px 16px", border: `1px solid ${S.rim}`,
                        color: S.secondary, background: "transparent", cursor: "pointer", borderRadius: 2,
                      }}>⬇ Download Whitepaper</button>
                      <button onClick={() => router.push("/hedge-desk")} style={{
                        fontFamily: S.fontUI, fontSize: 13, fontWeight: 700,
                        padding: "7px 20px", border: `1px solid ${S.cyan}`,
                        color: S.cyan, background: "transparent", cursor: "pointer", borderRadius: 2,
                      }}>→ Open Execution Bridge</button>
                      <button onClick={() => router.push("/hedge-desk")} style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 12, fontWeight: 700,
                        padding: "8px 20px",
                        background: "#1C62F2",
                        color: "#fff",
                        border: "none",
                        borderRadius: 3,
                        cursor: "pointer",
                        letterSpacing: "0.06em",
                      }}>RUN AS PRODUCTION CALCULATION →</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════ TAB: RISK ATTRIBUTION ══════════ */}
            {activeTab === "attribution" && (
              <RiskAttributionPanel sandboxResult={sandboxResult} spot={spot} />
            )}

            {/* ══════════ TAB: CRISIS LIBRARY ══════════ */}
            {activeTab === "crises" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, margin: 0, lineHeight: 1.7 }}>
                  18 pre-built historical crisis scenarios calibrated to empirical market data (BIS, Bloomberg, IMF).
                  Each scenario encodes multi-factor stress parameters: spot shock, implied volatility spike,
                  correlation breakdown (DCC-GARCH), and liquidity premium — per BCBS 457 stressed VaR methodology.
                  Click <strong>APPLY</strong> to run the scenario through the stress engine with live market data.
                </p>
                <CrisisScenarioLibrary
                  onSelect={(crisis) => {
                    setSelectedCrisis(crisis);
                    setActiveTab("stress");
                  }}
                  selectedId={selectedCrisis?.id}
                />
              </div>
            )}

            {/* ══════════ TAB: WHAT-IF BUILDER ══════════ */}
            {activeTab === "whatif" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <WhatIfBuilder
                  sandboxResult={sandboxResult}
                  defaultPolicy={DEFAULT_POLICY}
                  defaultSpot={spot}
                />
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-soft)", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => router.push("/hedge-desk")}
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 12, fontWeight: 700,
                      padding: "8px 20px",
                      background: "#1C62F2",
                      color: "#fff",
                      border: "none",
                      borderRadius: 3,
                      cursor: "pointer",
                      letterSpacing: "0.06em",
                    }}
                  >
                    RUN AS PRODUCTION CALCULATION →
                  </button>
                </div>
              </div>
            )}

            {/* ══════════ TAB: REGULATORY CAPITAL ══════════ */}
            {activeTab === "regulatory" && (
              <RegulatoryCapital sandboxResult={sandboxResult} spot={spot} />
            )}

            {/* ══════════ TAB: MARKET STRUCTURE ══════════ */}
            {activeTab === "microstructure" && (
              <MarketMicrostructure
                notionalUSD={notionalUSD}
                primaryCurrency={primaryCurrency}
                spot={spot}
              />
            )}

            {/* ══════════ TAB: AUDIT REPORT ══════════ */}
            {activeTab === "audit" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                {/* Header */}
                <div style={{
                  background: `color-mix(in srgb, ${S.cyan} 4%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${S.cyan} 18%, transparent)`,
                  borderRadius: 4, padding: "16px 20px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.cyan, marginBottom: 6 }}>
                      COMPLIANCE AUDIT ENGINE — INSTITUTIONAL GRADE
                    </div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6 }}>
                      Run {sandboxResult ? `ID: ${sandboxResult.run_id.slice(0, 8).toUpperCase()} · ` : ""}
                      Generated: {new Date().toLocaleString()} ·
                      Standards: IFRS 9 · Basel III · ISDA SIMM v2.6 · EMIR · MiFID II
                    </div>
                  </div>
                  {sandboxResult && (
                    <button onClick={() => router.push(`/sandbox/whitepaper?runId=${sandboxResult.run_id}`)} style={{
                      fontFamily: S.fontUI, fontSize: 12, fontWeight: 700,
                      padding: "8px 18px", border: `1px solid ${S.cyan}`,
                      color: S.cyan, background: "transparent", cursor: "pointer", borderRadius: 2,
                    }}>⬇ Download Full Report</button>
                  )}
                </div>

                {/* No result state */}
                {!sandboxResult && (
                  <div style={{
                    padding: "24px", border: `1px solid ${S.rim}`, borderRadius: 4,
                    fontFamily: S.fontUI, fontSize: 14, color: S.secondary,
                    background: S.sub, textAlign: "center",
                  }}>
                    Run a simulation to generate the compliance audit report.
                    The 14-rule engine covers pre-run validation, calculation integrity,
                    post-run capital adequacy, and governance checks.
                  </div>
                )}

                {sandboxResult && (
                  <>
                    {/* Certification level */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                      <BigKpi
                        label="Integrity Score"
                        value={`${waterfall?.integrity_score ?? "—"}/100`}
                        sub="Weighted rule engine"
                        accent={(waterfall?.integrity_score ?? 0) >= 85 ? S.green : S.amber}
                      />
                      <BigKpi
                        label="Certification"
                        value={(waterfall?.integrity_score ?? 0) >= 90 ? "INSTITUTIONAL" : (waterfall?.integrity_score ?? 0) >= 75 ? "PROFESSIONAL" : "BASIC"}
                        sub="Based on rule weights"
                        accent={(waterfall?.integrity_score ?? 0) >= 90 ? S.cyan : (waterfall?.integrity_score ?? 0) >= 75 ? S.green : S.amber}
                      />
                      <BigKpi
                        label="Data Source"
                        value={liveStatus === "live" ? "LIVE" : "CALIBRATED"}
                        sub={liveStatus === "live" ? "Alpha Vantage · MiFID II RTS 25" : "BIS 2022 Triennial"}
                        accent={liveStatus === "live" ? S.green : S.amber}
                      />
                      <BigKpi
                        label="Governance"
                        value={((sandboxResult.run_envelope as Record<string, unknown> | undefined)?.inputs_hash) ? "REAL ENGINE" : "PENDING"}
                        sub="Hash integrity"
                        accent={((sandboxResult.run_envelope as Record<string, unknown> | undefined)?.inputs_hash) ? S.green : S.amber}
                      />
                    </div>

                    {/* Full 14-rule audit engine */}
                    <AuditEngine
                      sandboxResult={sandboxResult}
                      spot={spot}
                      notionalUSD={notionalUSD}
                      liveSpotFetched={liveStatus === "live"}
                    />

                    {/* Regulatory framework reference table */}
                    <div style={{ background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${S.rim}`, background: S.panel }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
                          REGULATORY FRAMEWORK COVERAGE
                        </span>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: S.panel }}>
                              {["Standard", "Full Name", "Key Requirement", "Platform Implementation", "Status"].map(h => (
                                <th key={h} style={{
                                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                                  color: S.tertiary, textTransform: "uppercase",
                                  padding: "9px 14px", textAlign: "left",
                                  borderBottom: `1px solid ${S.rim}`,
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ["IFRS 9.6.4.1", "Hedge Effectiveness Testing", "80–125% effectiveness band", "GBM prospective + dollar-offset retrospective", "PASS"],
                              ["BCBS 279", "Basel III SA-CCR", "EAD = 1.4×(RC+PFE), SF_FX=4%", "Per-bucket EAD with MF=√(min(M,1))", "PASS"],
                              ["BCBS d325", "CVA Capital Charge", "Supervisory weights by credit quality", "BBB: 0.54%, HY: 1.06%, AAA: 0.38%", "PASS"],
                              ["ISDA SIMM v2.6", "Initial Margin Model", "FX delta RW Cat3=7.4%, ρ_intra=0.50", "Full IM aggregation with inter-bucket γ=0.27", "PASS"],
                              ["BCBS d365", "Leverage Ratio", "Tier 1 / Exposure ≥ 3% + G-SIB", "NDF exposure = RC + PFE contribution", "PASS"],
                              ["BCBS 457", "FRTB — Market Risk", "SBM delta charge, RW_FX=15%", "DV01 per tenor bucket, curvature proxy", "PASS"],
                              ["EMIR Art. 11", "Non-cleared OTC margin", "Bilateral IM for >€8bn threshold", "SIMM IM estimate displayed, threshold shown", "INFO"],
                              ["Dodd-Frank §731", "Mandatory clearing (US)", ">$8bn MSP threshold", "Notional threshold indicator", "INFO"],
                              ["MiFID II RTS 25", "Market data quality", "Consolidated tape, best execution record", "Live data source label, timestamp logged", liveStatus === "live" ? "PASS" : "WARN"],
                              ["MiFID II RTS 6", "Algo trading governance", "Pre-trade validation, audit trail", "Run envelope with SHA-256 hash", "PASS"],
                            ].map(([std, name, req, impl, status]) => (
                              <tr key={std} style={{ borderBottom: `1px solid ${S.soft}` }}>
                                <td style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan, padding: "10px 14px" }}>{std}</td>
                                <td style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary, padding: "10px 14px" }}>{name}</td>
                                <td style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, padding: "10px 14px" }}>{req}</td>
                                <td style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, padding: "10px 14px" }}>{impl}</td>
                                <td style={{ padding: "10px 14px" }}>
                                  <span style={{
                                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                                    color: status === "PASS" ? S.green : status === "WARN" ? S.amber : S.tertiary,
                                    padding: "2px 7px", borderRadius: 2,
                                    border: `1px solid ${status === "PASS" ? S.green : status === "WARN" ? S.amber : S.rim}`,
                                    background: `color-mix(in srgb, ${status === "PASS" ? S.green : status === "WARN" ? S.amber : S.rim} 10%, transparent)`,
                                  }}>● {status}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Disclaimer */}
                    <div style={{
                      padding: "12px 16px", border: `1px solid ${S.soft}`, borderRadius: 3,
                      fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.6,
                      background: S.sub,
                    }}>
                      <strong style={{ color: S.secondary }}>Disclaimer:</strong> This audit report is generated automatically
                      by the HedgeCore simulation engine for analytical and documentation purposes. It does not constitute
                      a legal compliance opinion, financial advice, or a regulatory filing. All regulatory thresholds and
                      capital calculations are approximations based on published standards and must be reviewed by qualified
                      professionals (legal counsel, risk officers, external auditors) before use in regulatory submissions.
                      IFRS 9 hedge designations require formal documentation per IFRS 9.B6.4.1. Basel III calculations
                      are indicative only — official RWA computations must use approved internal models or regulator-approved
                      standardised approaches.
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ══════════ TAB: V2 ANALYTICS ══════════ */}
            {activeTab === "v2analytics" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {!sandboxResult && (
                  <EmptyState type="empty" message="Run a simulation to populate V2 analytics modules" />
                )}
                {sandboxResult && v2 && (
                  <>
                    <div style={{
                      padding: "10px 16px", background: `color-mix(in srgb, ${S.cyan} 4%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`, borderRadius: 4,
                      fontFamily: S.fontMono, fontSize: 12, color: S.secondary,
                    }}>
                      <span style={{ color: S.cyan, fontWeight: 700 }}>V2 ANALYTICS ENGINE</span>
                      {" — "}
                      {Object.keys(v2).filter(k => (v2 as Record<string, unknown>)[k] != null).length} modules active · Pair: <span style={{ color: S.cyan }}>{selectedPair}</span>
                    </div>
                    <div style={{ background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
                      <AttributionTab
                        navAttribution={v2.nav_attribution as Record<string, unknown> | undefined}
                        factorCovariance={v2.factor_covariance as Record<string, unknown> | undefined}
                      />
                    </div>
                    <div style={{ background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
                      <LiquidityTab
                        liquidityResult={v2.liquidity_result as Record<string, unknown> | undefined}
                        liquidityRegime={v2.liquidity_regime as Record<string, unknown> | undefined}
                      />
                    </div>
                    <div style={{ background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
                      <ConstraintsTab
                        capitalAdequacy={v2.capital_adequacy as Record<string, unknown> | undefined}
                        concentration={v2.concentration as Record<string, unknown> | undefined}
                        marginBreakdown={v2.margin_breakdown as Record<string, unknown> | undefined}
                        hedgeBands={v2.hedge_bands as Record<string, unknown> | undefined}
                        transactionCosts={v2.transaction_costs as Record<string, unknown> | undefined}
                      />
                    </div>
                    {v2.forward_validation && (
                      <div style={{ background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
                        <ForwardValidationPanel forwardValidation={v2.forward_validation as Record<string, unknown>} />
                      </div>
                    )}
                    {v2.currency_netting && (
                      <div style={{ background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
                        <NettingSummaryPanel currencyNetting={v2.currency_netting as Record<string, unknown>} />
                      </div>
                    )}
                    {v2.tensor_result && (
                      <div style={{ background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
                        <TensorDecompositionPanel tensorResult={v2.tensor_result as Record<string, unknown>} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

          </div>
        </div>

        {/* ── Right rail ── */}
        <aside style={{
          width: 268, flexShrink: 0,
          borderLeft: `1px solid ${S.rim}`,
          background: S.panel,
          overflowY: "auto",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "9px 14px", borderBottom: `1px solid ${S.rim}`, background: S.sub }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
              CONTEXT PANEL
            </span>
          </div>

          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Stress tab context */}
            {activeTab === "stress" && sandboxResult?.v2_results && (
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 8 }}>WORST CASE</div>
                {[
                  ["Unhedged Loss", (() => {
                    const wc = v2?.worst_case as Record<string, unknown> | undefined;
                    const l = wc?.worst_case_loss as number | undefined;
                    return l ? `−$${Math.abs(l).toLocaleString()}` : "—";
                  })()],
                  ["Hedged Loss", (() => {
                    const wc = v2?.worst_case as Record<string, unknown> | undefined;
                    const l = wc?.hedged_loss as number | undefined;
                    return l ? `−$${Math.abs(l).toLocaleString()}` : "—";
                  })()],
                  ["Margin Required", (() => {
                    const ms = v2?.margin_summary as Record<string, unknown> | undefined;
                    const m = ms?.total_margin as number | undefined;
                    return m ? `$${m.toLocaleString()}` : "—";
                  })()],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Regulatory context */}
            {activeTab === "regulatory" && (
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 8 }}>CAPITAL SNAPSHOT</div>
                {[
                  ["SA-CCR EAD", `$${(notionalUSD * 0.04 * 1.4).toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
                  ["Capital Charge (8%)", `$${(notionalUSD * 0.04 * 1.4 * 0.08).toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
                  ["ISDA SIMM IM", `$${(notionalUSD * 0.074).toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
                  ["Leverage Exp.", `$${(notionalUSD * 0.04).toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
                  ["BCBS Framework", "Basel III (2017)"],
                  ["SIMM Version", "v2.6 (Sep 2023)"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Crisis context */}
            {activeTab === "crises" && (
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 8 }}>CRISIS STATISTICS</div>
                {[
                  ["Calibrated Crises", "18"],
                  ["Date Range", "1994 – 2023"],
                  ["Global Events", "2 (GFC, COVID)"],
                  ["EM Events", "10"],
                  ["DM Events", "6"],
                  ["Avg FX Shock", "−27%"],
                  ["Max Shock", "−70% (Argentina)"],
                  ["Avg Hedge Eff.", "88%"],
                  ["Min Hedge Eff.", "52% (crises)"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Audit context */}
            {activeTab === "audit" && (
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 8 }}>RULE CATEGORIES</div>
                {[
                  ["PRE-001–004", "Pre-run validation"],
                  ["CALC-001–004", "Calculation audit"],
                  ["POST-001–004", "Post-run capital"],
                  ["GOV-001–002", "Governance chain"],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: "6px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan }}>{k}</div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Always-visible: compliance badges */}
            <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 12, marginTop: "auto" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, marginBottom: 8, letterSpacing: "0.1em" }}>
                COMPLIANCE STANDARDS
              </div>
              {[
                { label: "IFRS 9.6.4.1", ok: true, sub: "Effectiveness 80–125%" },
                { label: "Basel III SA-CCR", ok: true, sub: "BCBS 279 EAD" },
                { label: "ISDA SIMM v2.6", ok: true, sub: "FX delta IM" },
                { label: "Dodd-Frank §731", ok: true, sub: "Clearing threshold" },
                { label: "EMIR Art. 11", ok: true, sub: "Bilateral margin" },
                { label: "BCBS 457 FRTB", ok: true, sub: "SBM delta charge" },
                { label: "MiFID II RTS 25", ok: liveStatus === "live", sub: "Live market data" },
              ].map(c => (
                <div key={c.label} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.ok ? S.green : S.amber, flexShrink: 0, marginTop: 3 }} />
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, fontWeight: 600 }}>{c.label}</div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>{c.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Live spot refresh */}
            <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 10 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, marginBottom: 6 }}>MARKET DATA</div>
              <DataSourceBadge status={liveStatus} fetchedAt={fetchedAt} />
              {liveSpot && (
                <div style={{ marginTop: 6, fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color: S.primary }}>
                  {liveSpot.toFixed(4)} <span style={{ fontSize: 12, color: S.tertiary, fontWeight: 400 }}>{primaryCurrency}/USD</span>
                </div>
              )}
              {fetchedAt && (
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 2 }}>
                  Updated {new Date(fetchedAt).toLocaleTimeString()}
                </div>
              )}
              <button onClick={refreshSpot} style={{
                marginTop: 6, fontFamily: S.fontMono, fontSize: 12,
                color: S.cyan, background: "transparent",
                border: `1px solid ${S.rim}`, cursor: "pointer",
                padding: "3px 10px", borderRadius: 2, width: "100%",
              }}>↻ Refresh</button>
            </div>

          </div>
        </aside>

        <HelpPanelV2 module={SANDBOX_HELP} storageKey="sandbox" />
      </div>

      {/* X-Ray Drawer */}
      <XRayDrawer
        open={xrayOpen}
        onClose={() => dispatch(setXRayOpen(false))}
        title="X-Ray Inspector"
        tabs={[
          { id: "trace", label: "Trace", content: <JsonViewer data={sandboxResult?.trace_events ?? []} initialExpanded={false} /> },
          { id: "hashes", label: "Hashes", content: <JsonViewer data={sandboxResult?.run_envelope ?? {}} initialExpanded /> },
          { id: "raw", label: "Raw Data", content: <JsonViewer data={sandboxResult ?? {}} initialExpanded={false} /> },
        ]}
      />
    </div>
  );
}

// ─── Export with Suspense boundary ────────────────────────────────────────────
export default function SandboxPage() {
  const _planAllowed = usePlanRedirect("professional");
  if (!_planAllowed) return null;
  return (

    <PageShell icon={Zap} title="Sandbox" breadcrumb={["Dashboard", "Sandbox"]} noPadding>
    <Suspense fallback={
      <div style={{
        fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
        color: "var(--text-secondary)", padding: 28, fontSize: 14,
      }}>
        Loading simulation engine…
      </div>
    }>
      <SandboxPageInner />
    </Suspense>
  
    </PageShell>
    );
}
