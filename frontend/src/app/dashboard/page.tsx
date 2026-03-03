"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Responsive, WidthProvider } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import { Plus, RotateCcw, RefreshCw, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import type { UserContext } from "@/lib/authContext";
import { WIDGET_REGISTRY, type GridItem, type WidgetId } from "@/lib/widgets/widgetRegistry";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import WidgetCatalog from "@/components/dashboard/WidgetCatalog";
import HelpPanelV2 from "@/components/help/HelpPanelV2";
import { DASHBOARD_HELP } from "@/lib/help";
import KpiSummaryWidget          from "@/components/dashboard/widgets/KpiSummaryWidget";
import RecentRunsWidget           from "@/components/dashboard/widgets/RecentRunsWidget";
import PendingApprovalsWidget     from "@/components/dashboard/widgets/PendingApprovalsWidget";
import TeamActivityWidget         from "@/components/dashboard/widgets/TeamActivityWidget";
import BranchComparisonWidget     from "@/components/dashboard/widgets/BranchComparisonWidget";
import PolisophicMiniWidget       from "@/components/dashboard/widgets/PolisophicMiniWidget";
import QuickActionsWidget         from "@/components/dashboard/widgets/QuickActionsWidget";
import ExposureSummaryWidget      from "@/components/dashboard/widgets/ExposureSummaryWidget";
import PipelineStatusWidget       from "@/components/dashboard/widgets/PipelineStatusWidget";
import FxRatesWidget              from "@/components/dashboard/widgets/FxRatesWidget";
import CurrencyIntelWidget        from "@/components/dashboard/widgets/CurrencyIntelWidget";
import HedgeHealthWidget          from "@/components/dashboard/widgets/HedgeHealthWidget";
import MarketPulseWidget          from "@/components/dashboard/widgets/MarketPulseWidget";
import CommandHubWidget           from "@/components/dashboard/widgets/CommandHubWidget";
import GeoPoliticalWidget         from "@/components/dashboard/widgets/GeoPoliticalWidget";
import UsdExposureRadarWidget     from "@/components/dashboard/widgets/UsdExposureRadarWidget";
import RiskPulseWidget            from "@/components/dashboard/widgets/RiskPulseWidget";
import FxNewsWidget               from "@/components/dashboard/widgets/FxNewsWidget";
import EconCalendarWidget         from "@/components/dashboard/widgets/EconCalendarWidget";
import HedgeMonitorWidget         from "@/components/dashboard/widgets/HedgeMonitorWidget";
import MultiPairExposureWidget    from "@/components/dashboard/widgets/MultiPairExposureWidget";
import WidgetErrorBoundary        from "@/components/ui/WidgetErrorBoundary";

const ResponsiveGridLayout = WidthProvider(Responsive);

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass)",
  fail:      "var(--accent-red,#B91C1C)",
} as const;

// ── View modes ────────────────────────────────────────────────────────────────

type ViewMode = "OVERVIEW" | "RISK" | "EXECUTION" | "MARKET";

const VIEW_MODES: { id: ViewMode; label: string; sub: string }[] = [
  { id: "OVERVIEW",  label: "OVERVIEW",  sub: "Balanced executive summary" },
  { id: "RISK",      label: "RISK",      sub: "Exposure & posture" },
  { id: "EXECUTION", label: "EXECUTION", sub: "Pipeline & approvals" },
  { id: "MARKET",    label: "MARKET",    sub: "Market intelligence" },
];

const VIEW_DEFAULTS: Record<ViewMode, { widgetIds: string[]; grid: GridItem[] }> = {
  OVERVIEW: {
    widgetIds: ["kpi_summary","exposure_summary","pipeline_status","recent_runs","pending_approvals","team_activity","hedge_health"],
    grid: [
      { i: "kpi_summary",       x: 0, y: 0,  w: 12, h: 3 },
      { i: "exposure_summary",  x: 0, y: 3,  w: 6,  h: 5 },
      { i: "pipeline_status",   x: 6, y: 3,  w: 6,  h: 4 },
      { i: "recent_runs",       x: 0, y: 8,  w: 6,  h: 5 },
      { i: "pending_approvals", x: 6, y: 7,  w: 6,  h: 5 },
      { i: "team_activity",     x: 0, y: 13, w: 8,  h: 5 },
      { i: "hedge_health",      x: 8, y: 13, w: 4,  h: 5 },
    ],
  },
  RISK: {
    widgetIds: ["kpi_summary","hedge_health","exposure_summary","risk_pulse","usd_exposure_radar","geopolitical","branch_comparison","multi_pair_exposure"],
    grid: [
      { i: "kpi_summary",         x: 0, y: 0,  w: 12, h: 3 },
      { i: "hedge_health",        x: 0, y: 3,  w: 4,  h: 6 },
      { i: "exposure_summary",    x: 4, y: 3,  w: 8,  h: 5 },
      { i: "risk_pulse",          x: 0, y: 9,  w: 6,  h: 6 },
      { i: "usd_exposure_radar",  x: 6, y: 8,  w: 6,  h: 5 },
      { i: "geopolitical",        x: 0, y: 15, w: 6,  h: 5 },
      { i: "branch_comparison",   x: 6, y: 13, w: 6,  h: 5 },
      { i: "multi_pair_exposure", x: 0, y: 20, w: 12, h: 6 },
    ],
  },
  EXECUTION: {
    widgetIds: ["kpi_summary","pending_approvals","pipeline_status","recent_runs","hedge_monitor","team_activity","quick_actions"],
    grid: [
      { i: "kpi_summary",       x: 0, y: 0,  w: 12, h: 3 },
      { i: "pending_approvals", x: 0, y: 3,  w: 6,  h: 5 },
      { i: "pipeline_status",   x: 6, y: 3,  w: 6,  h: 4 },
      { i: "recent_runs",       x: 0, y: 8,  w: 6,  h: 5 },
      { i: "hedge_monitor",     x: 6, y: 7,  w: 6,  h: 5 },
      { i: "team_activity",     x: 0, y: 13, w: 8,  h: 5 },
      { i: "quick_actions",     x: 8, y: 13, w: 4,  h: 5 },
    ],
  },
  MARKET: {
    widgetIds: ["fx_rates","market_pulse","econ_calendar","currency_intel","fx_news","geopolitical"],
    grid: [
      { i: "fx_rates",       x: 0, y: 0,  w: 6, h: 5 },
      { i: "market_pulse",   x: 6, y: 0,  w: 6, h: 4 },
      { i: "econ_calendar",  x: 0, y: 5,  w: 6, h: 8 },
      { i: "currency_intel", x: 6, y: 4,  w: 6, h: 8 },
      { i: "fx_news",        x: 0, y: 13, w: 6, h: 8 },
      { i: "geopolitical",   x: 6, y: 12, w: 6, h: 5 },
    ],
  },
};

// ── Widget component map ───────────────────────────────────────────────────────

type WidgetComponentProps = { token: string; user: UserContext; onRemove?: () => void };

const WIDGET_COMPONENTS: Record<WidgetId, React.ComponentType<WidgetComponentProps>> = {
  kpi_summary:         KpiSummaryWidget,
  recent_runs:         RecentRunsWidget,
  pending_approvals:   PendingApprovalsWidget,
  team_activity:       TeamActivityWidget,
  branch_comparison:   BranchComparisonWidget,
  polisophic_mini:     PolisophicMiniWidget,
  quick_actions:       QuickActionsWidget,
  exposure_summary:    ExposureSummaryWidget,
  pipeline_status:     PipelineStatusWidget,
  fx_rates:            FxRatesWidget,
  currency_intel:      CurrencyIntelWidget,
  hedge_health:        HedgeHealthWidget,
  market_pulse:        MarketPulseWidget,
  command_hub:         CommandHubWidget,
  geopolitical:        GeoPoliticalWidget,
  usd_exposure_radar:  UsdExposureRadarWidget,
  risk_pulse:          RiskPulseWidget,
  fx_news:             FxNewsWidget,
  econ_calendar:       EconCalendarWidget,
  hedge_monitor:       HedgeMonitorWidget,
  multi_pair_exposure: MultiPairExposureWidget,
};

// ── Layout persistence ─────────────────────────────────────────────────────────

const LAYOUT_VERSION = 8;
const layoutKey = (uid: string, view: ViewMode) => `dash_v8_${uid}_${view}`;

function saveLayout(uid: string, view: ViewMode, widgetIds: string[], grid: GridItem[]) {
  try { localStorage.setItem(layoutKey(uid, view), JSON.stringify({ widgetIds, grid, v: LAYOUT_VERSION })); } catch {}
}

function loadLayout(uid: string, view: ViewMode): { widgetIds: string[]; grid: GridItem[] } | null {
  try {
    const r = localStorage.getItem(layoutKey(uid, view));
    if (!r) return null;
    const p = JSON.parse(r);
    if ((p.v ?? 0) < LAYOUT_VERSION) return null;
    if (!Array.isArray(p.widgetIds) || p.widgetIds.length === 0) return null;
    if (!Array.isArray(p.grid)      || p.grid.length      === 0) return null;
    return p;
  } catch { return null; }
}

function toRGLLayout(items: GridItem[]): Layout[] {
  return items.map(item => ({
    i: item.i, x: item.x, y: item.y, w: item.w, h: item.h,
    minW: WIDGET_REGISTRY.find(w => w.id === item.i)?.minW ?? 2,
    minH: WIDGET_REGISTRY.find(w => w.id === item.i)?.minH ?? 2,
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAgo(ms: number): string {
  const d = Math.floor((Date.now() - ms) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}

function fmtUSD(n?: number | null): string {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n?: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

// ── Workflow Strip ────────────────────────────────────────────────────────────

interface OnboardingSummary {
  exposures_open_count: number;
  policy_assigned: boolean;
  policy_id: string | null;
  last_run_id: string | null;
  pending_proposals_count: number;
  pending_approvals_count: number;
}

type WorkflowAction = {
  label: string;
  count: number;
  href: string;
  color: string;
  urgency: "high" | "medium" | "low";
};

function deriveWorkflowAction(d: OnboardingSummary): WorkflowAction | null {
  if (d.pending_approvals_count > 0)
    return { label: `${d.pending_approvals_count} proposal${d.pending_approvals_count > 1 ? "s" : ""} approved — EXECUTE`, count: d.pending_approvals_count, href: "/staging", color: "var(--status-pass)", urgency: "high" };
  if (d.pending_proposals_count > 0)
    return { label: `${d.pending_proposals_count} proposal${d.pending_proposals_count > 1 ? "s" : ""} awaiting checker approval`, count: d.pending_proposals_count, href: "/staging", color: "var(--accent-amber)", urgency: "high" };
  if (d.last_run_id && d.exposures_open_count > 0)
    return { label: `${d.exposures_open_count} position${d.exposures_open_count > 1 ? "s" : ""} ready — submit for execution`, count: d.exposures_open_count, href: "/hedge-desk", color: "var(--accent-cyan)", urgency: "medium" };
  if (!d.policy_assigned && d.exposures_open_count > 0)
    return { label: `${d.exposures_open_count} position${d.exposures_open_count > 1 ? "s" : ""} need policy assignment`, count: d.exposures_open_count, href: "/policy-desk", color: "var(--accent-amber)", urgency: "medium" };
  if (d.exposures_open_count > 0)
    return { label: `${d.exposures_open_count} position${d.exposures_open_count > 1 ? "s" : ""} open — run calculation`, count: d.exposures_open_count, href: "/hedge-desk", color: "var(--accent-cyan)", urgency: "low" };
  return null;
}

function WorkflowStrip({ token, refreshKey }: { token: string; refreshKey: number }) {
  const [summary, setSummary] = useState<OnboardingSummary | null>(null);
  const router = useRouter();

  useEffect(() => {
    dashboardFetch("/v1/ui/onboarding-summary", token)
      .then(r => r.ok ? r.json() : null)
      .then((d: OnboardingSummary | null) => { if (d) setSummary(d); })
      .catch(() => {});
  }, [token, refreshKey]);

  if (!summary) return null;
  const action = deriveWorkflowAction(summary);
  if (!action) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        height: 28, display: "flex", alignItems: "center",
        background: `color-mix(in srgb, ${action.color} 7%, var(--bg-sub))`,
        borderBottom: `1px solid color-mix(in srgb, ${action.color} 25%, var(--border-rim))`,
        padding: "0 14px", flexShrink: 0, cursor: "pointer", gap: 10,
      }}
      onClick={() => router.push(action.href)}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: action.color, boxShadow: `0 0 6px ${action.color}`, flexShrink: 0, animation: action.urgency === "high" ? "pulse 1.5s infinite" : undefined }} />
      <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, color: action.color, letterSpacing: "0.06em", flexShrink: 0 }}>
        NEXT ACTION
      </span>
      <span style={{ width: 1, height: 12, background: `color-mix(in srgb, ${action.color} 30%, transparent)`, flexShrink: 0 }} />
      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {action.label}
      </span>
      <ArrowRight size={10} color={action.color} style={{ flexShrink: 0, marginLeft: "auto" }} />
    </div>
  );
}

// ── Status Strip ──────────────────────────────────────────────────────────────

interface DashSummary {
  total_exposure_usd?: number;
  coverage_ratio?: number;
  pending_approvals?: number;
  open_positions?: number;
}

function StatusStrip({ token, refreshKey }: { token: string; refreshKey: number }) {
  const [data, setData] = useState<DashSummary | null>(null);

  useEffect(() => {
    dashboardFetch("/v1/dashboard/summary", token)
      .then(r => r.ok ? r.json() : null)
      .then((d: DashSummary | null) => { if (d) setData(d); })
      .catch(() => {});
  }, [token, refreshKey]);

  const cov = data?.coverage_ratio;
  const posture =
    cov == null ? { label: "MONITORING", color: S.tertiary } :
    cov >= 0.75 ? { label: "COVERED",    color: S.pass }     :
    cov >= 0.40 ? { label: "PARTIAL",    color: S.amber }    :
                  { label: "EXPOSED",    color: S.fail };

  const sep = <div style={{ width: 1, height: 14, background: S.rim, flexShrink: 0 }} />;

  const chip = (lbl: string, val: string, valColor?: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 14px", flexShrink: 0 }}>
      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.1em" }}>{lbl}</span>
      <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: valColor ?? S.primary, letterSpacing: "0.03em" }}>{val}</span>
    </div>
  );

  return (
    <div style={{
      height: 30, display: "flex", alignItems: "center",
      background: S.bgSub, borderBottom: `1px solid ${S.rim}`,
      flexShrink: 0, overflow: "hidden",
    }}>
      {/* Posture */}
      <div style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "0 14px", borderRight: `1px solid ${S.rim}`,
        height: "100%", flexShrink: 0,
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: posture.color, boxShadow: `0 0 5px ${posture.color}`,
          display: "inline-block", flexShrink: 0,
        }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: posture.color, letterSpacing: "0.12em" }}>
          {posture.label}
        </span>
      </div>

      {sep}
      {chip("EXPOSURE",  fmtUSD(data?.total_exposure_usd))}
      {sep}
      {chip("COVERAGE",  fmtPct(data?.coverage_ratio), cov != null ? posture.color : undefined)}
      {sep}
      {chip("PENDING",   data?.pending_approvals != null ? String(data.pending_approvals) : "—",
        (data?.pending_approvals ?? 0) > 0 ? S.amber : undefined)}
      {sep}
      {chip("POSITIONS", data?.open_positions != null ? String(data.open_positions) : "—")}

      <div style={{ flex: 1 }} />
      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", paddingRight: 16, flexShrink: 0 }}>
        ORDR TERMINAL · INSTITUTIONAL FX GOVERNANCE
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, token } = useAuth();
  const [ready,       setReady]       = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [viewMode,    setViewMode]    = useState<ViewMode>("OVERVIEW");
  const [widgetIds,   setWidgetIds]   = useState<string[]>([]);
  const [gridItems,   setGridItems]   = useState<GridItem[]>([]);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [refreshKey,  setRefreshKey]  = useState<number>(0);
  const [agoLabel,    setAgoLabel]    = useState<string>("just now");
  const agoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setReady(true); }, []);

  useEffect(() => {
    if (ready && !isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [ready, isLoading, isAuthenticated, router]);

  // SMB default layout — simple 6-widget grid
  const SMB_DEFAULT_LAYOUT = {
    widgetIds: ["kpi_summary", "exposure_summary", "hedge_health", "risk_pulse", "pipeline_status", "fx_rates"],
    grid: [
      { i: "kpi_summary",      x: 0, y: 0, w: 8, h: 4 },
      { i: "exposure_summary", x: 8, y: 0, w: 4, h: 4 },
      { i: "hedge_health",     x: 0, y: 4, w: 4, h: 4 },
      { i: "risk_pulse",       x: 4, y: 4, w: 4, h: 4 },
      { i: "pipeline_status",  x: 0, y: 8, w: 6, h: 4 },
      { i: "fx_rates",         x: 6, y: 8, w: 6, h: 4 },
    ],
  };

  // Load per-view layout whenever user or viewMode changes
  useEffect(() => {
    if (!user) return;
    const isSmbUser = user?.plan_tier === "smb";
    const saved = loadLayout(user.id, viewMode);
    if (saved) { setWidgetIds(saved.widgetIds); setGridItems(saved.grid); }
    else if (isSmbUser && viewMode === "OVERVIEW") { setWidgetIds(SMB_DEFAULT_LAYOUT.widgetIds); setGridItems(SMB_DEFAULT_LAYOUT.grid); }
    else { const d = VIEW_DEFAULTS[viewMode]; setWidgetIds(d.widgetIds); setGridItems(d.grid); }
  }, [user?.id, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // "X ago" label
  useEffect(() => {
    setAgoLabel(formatAgo(lastRefresh));
    if (agoRef.current) clearInterval(agoRef.current);
    agoRef.current = setInterval(() => setAgoLabel(formatAgo(lastRefresh)), 10_000);
    return () => { if (agoRef.current) clearInterval(agoRef.current); };
  }, [lastRefresh]);

  const handleRefreshAll = useCallback(() => {
    setLastRefresh(Date.now());
    setRefreshKey(k => k + 1);
  }, []);

  const handleLayoutChange = useCallback((currentLayout: Layout[]) => {
    if (!user || widgetIds.length === 0) return;
    const updated: GridItem[] = currentLayout.map(l => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
    setGridItems(updated);
    saveLayout(user.id, viewMode, widgetIds, updated);
  }, [user, widgetIds, viewMode]);

  const handleAdd = useCallback((widgetId: string) => {
    if (widgetIds.includes(widgetId) || !user) return;
    const def = WIDGET_REGISTRY.find(w => w.id === widgetId);
    if (!def) return;
    const maxY = gridItems.reduce((acc, g) => Math.max(acc, g.y + g.h), 0);
    const newItem: GridItem = { i: widgetId, x: 0, y: maxY, w: def.defaultW, h: def.defaultH };
    const newIds = [...widgetIds, widgetId];
    const newGrid = [...gridItems, newItem];
    setWidgetIds(newIds); setGridItems(newGrid);
    saveLayout(user.id, viewMode, newIds, newGrid);
  }, [user, widgetIds, gridItems, viewMode]);

  const handleRemove = useCallback((widgetId: string) => {
    if (!user) return;
    const newIds = widgetIds.filter(id => id !== widgetId);
    const newGrid = gridItems.filter(g => g.i !== widgetId);
    setWidgetIds(newIds); setGridItems(newGrid);
    saveLayout(user.id, viewMode, newIds, newGrid);
  }, [user, widgetIds, gridItems, viewMode]);

  const handleReset = useCallback(() => {
    if (!user) return;
    const d = VIEW_DEFAULTS[viewMode];
    setWidgetIds(d.widgetIds); setGridItems(d.grid);
    try { localStorage.removeItem(layoutKey(user.id, viewMode)); } catch {}
  }, [user, viewMode]);

  const loadingStyle: React.CSSProperties = {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: S.bgDeep, fontFamily: S.fontMono, fontSize: "0.75rem",
    color: S.tertiary, letterSpacing: "0.06em",
  };

  if (!ready || isLoading) return <div style={loadingStyle}>INITIALIZING SESSION…</div>;
  if (!isAuthenticated || !user || !token) {
    router.replace("/auth/login");
    return <div style={loadingStyle}>REDIRECTING…</div>;
  }

  const rglLayout = toRGLLayout(gridItems);
  const role = user.roles?.[0] ?? "risk_analyst";

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary, display: "flex", flexDirection: "column" }}>
      {/* ── Command Bar ─────────────────────────────────────────────────────── */}
      <div style={{
        height: 44, display: "flex", alignItems: "stretch",
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        flexShrink: 0, overflow: "hidden",
      }}>
        {/* View mode tabs */}
        <div style={{ display: "flex", alignItems: "stretch", borderRight: `1px solid ${S.rim}` }}>
          {VIEW_MODES.map(vm => (
            <button
              key={vm.id}
              onClick={() => setViewMode(vm.id)}
              title={vm.sub}
              style={{
                display: "flex", alignItems: "center",
                fontFamily: S.fontMono, fontSize: "0.625rem",
                letterSpacing: "0.1em", fontWeight: 600,
                color: viewMode === vm.id ? S.cyan : S.tertiary,
                background: viewMode === vm.id
                  ? `color-mix(in srgb, ${S.cyan} 6%, transparent)`
                  : "transparent",
                border: "none",
                borderBottom: `2px solid ${viewMode === vm.id ? S.cyan : "transparent"}`,
                padding: "0 18px",
                cursor: "pointer",
                transition: "all 120ms",
              }}
            >
              {vm.label}
            </button>
          ))}
        </div>

        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", borderRight: `1px solid ${S.rim}` }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: S.pass, boxShadow: `0 0 5px ${S.pass}`,
            animation: "pulse 2s infinite", display: "inline-block",
          }} />
          <span style={{ fontFamily: S.fontMono, fontSize: "0.575rem", color: S.pass, letterSpacing: "0.12em" }}>LIVE</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Role · widget count */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontFamily: S.fontMono, fontSize: "0.575rem", letterSpacing: "0.08em",
          padding: "0 14px", borderLeft: `1px solid ${S.rim}`,
        }}>
          <span style={{ color: S.amber }}>{role.replace(/_/g, " ").toUpperCase()}</span>
          <span style={{ color: S.rim }}>·</span>
          <span style={{ color: S.tertiary }}>{widgetIds.length} WIDGETS</span>
        </div>

        {/* Refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderLeft: `1px solid ${S.rim}` }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.55rem", color: S.tertiary, letterSpacing: "0.04em" }}>
            {agoLabel}
          </span>
          <button onClick={handleRefreshAll} title="Refresh all widgets" style={iconBtn()}>
            <RefreshCw size={10} strokeWidth={1.8} />
          </button>
        </div>

        {/* Add / Reset */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderLeft: `1px solid ${S.rim}` }}>
          <button onClick={() => setCatalogOpen(true)} style={chipBtn(S.cyan)}>
            <Plus size={10} strokeWidth={2.2} /><span>ADD</span>
          </button>
          <button onClick={handleReset} title={`Reset ${viewMode} view to default`} style={chipBtn(S.tertiary, true)}>
            <RotateCcw size={10} strokeWidth={1.8} /><span>RESET</span>
          </button>
        </div>
      </div>

      {/* ── Status Strip ────────────────────────────────────────────────────── */}
      <StatusStrip token={token} refreshKey={refreshKey} />

      {/* ── Workflow Strip (contextual next-action banner) ───────────────────── */}
      <WorkflowStrip token={token} refreshKey={refreshKey} />

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, overflow: "auto", padding: "14px 18px" }}>
          {gridItems.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", minHeight: 400, gap: 12,
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.7rem", color: S.tertiary, letterSpacing: "0.08em" }}>
                NO WIDGETS · {viewMode} VIEW
              </div>
              <button onClick={() => setCatalogOpen(true)} style={{
                display: "flex", alignItems: "center", gap: 6,
                color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}`,
                padding: "6px 16px", cursor: "pointer",
                fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.06em",
              }}>
                <Plus size={12} strokeWidth={2} /> ADD WIDGET
              </button>
            </div>
          ) : (
            <ResponsiveGridLayout
              className="dashboard-grid"
              layouts={{ lg: rglLayout, md: rglLayout, sm: rglLayout }}
              breakpoints={{ lg: 1200, md: 996, sm: 768 }}
              cols={{ lg: 12, md: 10, sm: 6 }}
              rowHeight={44}
              onLayoutChange={handleLayoutChange}
              margin={[6, 6]}
              containerPadding={[0, 0]}
              draggableHandle=".widget-drag-handle"
              useCSSTransforms
            >
              {gridItems.map(({ i }) => {
                const WidgetComponent = WIDGET_COMPONENTS[i as WidgetId] ?? null;
                if (!WidgetComponent) return null;
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <WidgetErrorBoundary widgetId={i}>
                      <div key={refreshKey} style={{ display: "contents" }}>
                        <WidgetComponent token={token} user={user} onRemove={() => handleRemove(i)} />
                      </div>
                    </WidgetErrorBoundary>
                  </div>
                );
              })}
            </ResponsiveGridLayout>
          )}
        </div>
        <HelpPanelV2 module={DASHBOARD_HELP} storageKey="dashboard" />
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{
        height: 28, display: "flex", alignItems: "center", gap: 8,
        padding: "0 18px", background: S.bgPanel, borderTop: `1px solid ${S.rim}`,
        fontFamily: S.fontMono, fontSize: "0.55rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span style={{ color: S.cyan }}>ORDR</span>
        <span style={{ color: S.rim }}>·</span>
        <span>{user.company?.name ?? "ORDR Terminal"}</span>
        <span style={{ color: S.rim }}>·</span>
        <span style={{ color: S.secondary }}>{viewMode}</span>
        <div style={{ flex: 1 }} />
        <span>Drag to reposition · Resize from corner · Layout saved per view</span>
      </footer>

      <WidgetCatalog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        activeWidgetIds={widgetIds}
        onAdd={handleAdd}
        onReset={() => { handleReset(); setCatalogOpen(false); }}
      />

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .react-grid-item { transition: none !important; }
        .react-grid-item.react-grid-placeholder {
          background: color-mix(in srgb, var(--accent-cyan) 8%, transparent) !important;
          border: 1px dashed var(--accent-cyan) !important;
          border-radius: 0 !important; opacity: 1 !important;
        }
        .react-resizable-handle { opacity: 0; transition: opacity 150ms; }
        .react-grid-item:hover .react-resizable-handle { opacity: 0.5; }
        .react-resizable-handle::after { border-color: var(--accent-cyan) !important; }
        .dashboard-grid { min-height: 100%; }
      `}</style>
    </div>
  );
}

function chipBtn(color: string, ghost?: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 4,
    fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
    fontSize: "0.575rem", letterSpacing: "0.1em", fontWeight: 600,
    color, background: "transparent",
    border: `1px solid ${ghost ? "var(--border-rim)" : color}`,
    padding: "3px 8px", cursor: "pointer",
  };
}

function iconBtn(): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--text-tertiary)", background: "transparent",
    border: "1px solid var(--border-rim)",
    padding: 4, cursor: "pointer", lineHeight: 1,
  };
}
