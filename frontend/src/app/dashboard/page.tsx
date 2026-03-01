"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Responsive, WidthProvider } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import { Plus, RotateCcw, HelpCircle, Activity, Clock, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import type { UserContext } from "@/lib/authContext";
import { WIDGET_REGISTRY, getDefaultLayoutForRole, type GridItem, type WidgetId } from "@/lib/widgets/widgetRegistry";
import WidgetCatalog from "@/components/dashboard/WidgetCatalog";
import HelpPanelV2 from "@/components/help/HelpPanelV2";
import { DASHBOARD_HELP } from "@/lib/help";
import KpiSummaryWidget from "@/components/dashboard/widgets/KpiSummaryWidget";
import RecentRunsWidget from "@/components/dashboard/widgets/RecentRunsWidget";
import PendingApprovalsWidget from "@/components/dashboard/widgets/PendingApprovalsWidget";
import TeamActivityWidget from "@/components/dashboard/widgets/TeamActivityWidget";
import BranchComparisonWidget from "@/components/dashboard/widgets/BranchComparisonWidget";
import PolisophicMiniWidget from "@/components/dashboard/widgets/PolisophicMiniWidget";
import QuickActionsWidget from "@/components/dashboard/widgets/QuickActionsWidget";
import ExposureSummaryWidget from "@/components/dashboard/widgets/ExposureSummaryWidget";
import PipelineStatusWidget from "@/components/dashboard/widgets/PipelineStatusWidget";
import FxRatesWidget from "@/components/dashboard/widgets/FxRatesWidget";
import CurrencyIntelWidget from "@/components/dashboard/widgets/CurrencyIntelWidget";
import HedgeHealthWidget from "@/components/dashboard/widgets/HedgeHealthWidget";
import MarketPulseWidget from "@/components/dashboard/widgets/MarketPulseWidget";
import CommandHubWidget from "@/components/dashboard/widgets/CommandHubWidget";
import GeoPoliticalWidget from "@/components/dashboard/widgets/GeoPoliticalWidget";
import UsdExposureRadarWidget from "@/components/dashboard/widgets/UsdExposureRadarWidget";
import RiskPulseWidget from "@/components/dashboard/widgets/RiskPulseWidget";
import FxNewsWidget from "@/components/dashboard/widgets/FxNewsWidget";
import EconCalendarWidget from "@/components/dashboard/widgets/EconCalendarWidget";
import WidgetErrorBoundary from "@/components/ui/WidgetErrorBoundary";
import OnboardingModal from "@/components/onboarding/OnboardingModal";
const ResponsiveGridLayout = WidthProvider(Responsive);
const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)", bgPanel: "var(--bg-panel)", bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)", soft: "var(--border-soft)",
  primary: "var(--text-primary)", secondary: "var(--text-secondary)", tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)", amber: "var(--accent-amber)", pass: "var(--status-pass)",
  fail: "var(--accent-red,#B91C1C)",
} as const;
type WidgetComponentProps = { token: string; user: UserContext; onRemove?: () => void };
const WIDGET_COMPONENTS: Record<WidgetId, React.ComponentType<WidgetComponentProps>> = {
  kpi_summary: KpiSummaryWidget, recent_runs: RecentRunsWidget,
  pending_approvals: PendingApprovalsWidget, team_activity: TeamActivityWidget,
  branch_comparison: BranchComparisonWidget, polisophic_mini: PolisophicMiniWidget,
  quick_actions: QuickActionsWidget, exposure_summary: ExposureSummaryWidget, pipeline_status: PipelineStatusWidget,
  fx_rates: FxRatesWidget, currency_intel: CurrencyIntelWidget,
  hedge_health: HedgeHealthWidget, market_pulse: MarketPulseWidget,
  command_hub: CommandHubWidget, geopolitical: GeoPoliticalWidget,
  usd_exposure_radar: UsdExposureRadarWidget,
  risk_pulse: RiskPulseWidget, fx_news: FxNewsWidget, econ_calendar: EconCalendarWidget,
};
const layoutKey = (uid: string) => `dashboard_layout_${uid}`;
const helpOpenKey = (uid: string) => `dashboard_help_open_${uid}`;
function saveLayout(uid: string, widgetIds: string[], grid: GridItem[]) {
  try { localStorage.setItem(layoutKey(uid), JSON.stringify({ widgetIds, grid })); } catch {}
}
function loadLayout(uid: string): { widgetIds: string[]; grid: GridItem[] } | null {
  try { const r = localStorage.getItem(layoutKey(uid)); return r ? JSON.parse(r) : null; } catch { return null; }
}
function toRGLLayout(items: GridItem[]): Layout[] {
  return items.map((item) => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h,
    minW: WIDGET_REGISTRY.find((w) => w.id === item.i)?.minW ?? 2,
    minH: WIDGET_REGISTRY.find((w) => w.id === item.i)?.minH ?? 2, }));
}
function nowTs() { return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC"; }

// L-09: Format "X ago" for last-refresh display
function formatAgo(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, token } = useAuth();
  const [ready, setReady] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [widgetIds, setWidgetIds] = useState<string[]>([]);
  const [gridItems, setGridItems] = useState<GridItem[]>([]);
  const [ts, setTs] = useState("");
  // L-09: Last-refresh tracking
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [agoLabel, setAgoLabel] = useState<string>("just now");
  const agoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    if (ready && !isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [ready, isLoading, isAuthenticated, router]);
  useEffect(() => {
    if (!user) return;
    const saved = loadLayout(user.id);
    if (saved) { setWidgetIds(saved.widgetIds); setGridItems(saved.grid); }
    else { const d = getDefaultLayoutForRole(user.roles?.[0] ?? "risk_analyst"); setWidgetIds(d.widgetIds); setGridItems(d.grid); }
    try { const h = localStorage.getItem(helpOpenKey(user.id)); if (h !== null) setHelpOpen(h === "1"); } catch {}
  }, [user?.id]);
  useEffect(() => {
    setTs(nowTs());
    const id = setInterval(() => setTs(nowTs()), 30_000);
    return () => clearInterval(id);
  }, []);

  // L-09: Update "X ago" label every 10 seconds
  useEffect(() => {
    setAgoLabel(formatAgo(lastRefresh));
    if (agoIntervalRef.current) clearInterval(agoIntervalRef.current);
    agoIntervalRef.current = setInterval(() => setAgoLabel(formatAgo(lastRefresh)), 10_000);
    return () => { if (agoIntervalRef.current) clearInterval(agoIntervalRef.current); };
  }, [lastRefresh]);

  // L-09: Refresh all widgets handler
  const handleRefreshAll = useCallback(() => {
    setLastRefresh(Date.now());
    setRefreshKey(k => k + 1);
  }, []);

  const handleLayoutChange = useCallback((currentLayout: Layout[]) => {
    if (!user) return;
    const updated: GridItem[] = currentLayout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
    setGridItems(updated); saveLayout(user.id, widgetIds, updated);
  }, [user, widgetIds]);
  const handleAdd = useCallback((widgetId: string) => {
    if (widgetIds.includes(widgetId) || !user) return;
    const def = WIDGET_REGISTRY.find((w) => w.id === widgetId);
    if (!def) return;
    const maxY = gridItems.reduce((acc, g) => Math.max(acc, g.y + g.h), 0);
    const newItem: GridItem = { i: widgetId, x: 0, y: maxY, w: def.defaultW, h: def.defaultH };
    const newIds = [...widgetIds, widgetId]; const newGrid = [...gridItems, newItem];
    setWidgetIds(newIds); setGridItems(newGrid); saveLayout(user.id, newIds, newGrid);
  }, [user, widgetIds, gridItems]);
  const handleRemove = useCallback((widgetId: string) => {
    if (!user) return;
    const newIds = widgetIds.filter((id) => id !== widgetId);
    const newGrid = gridItems.filter((g) => g.i !== widgetId);
    setWidgetIds(newIds); setGridItems(newGrid); saveLayout(user.id, newIds, newGrid);
  }, [user, widgetIds, gridItems]);
  const handleReset = useCallback(() => {
    if (!user) return;
    const d = getDefaultLayoutForRole(user.roles?.[0] ?? "risk_analyst");
    setWidgetIds(d.widgetIds); setGridItems(d.grid);
    try { localStorage.removeItem(layoutKey(user.id)); } catch {}
  }, [user]);
  const toggleHelp = useCallback(() => {
    setHelpOpen((prev) => {
      const next = !prev;
      if (user) { try { localStorage.setItem(helpOpenKey(user.id), next ? "1" : "0"); } catch {} }
      return next;
    });
  }, [user]);
  const loadingStyle: React.CSSProperties = {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: S.bgDeep, fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.06em",
  };
  if (!ready || isLoading) return <div style={loadingStyle}>Initializing session…</div>;
  if (!isAuthenticated || !user || !token) {
    router.replace("/auth/login");
    return <div style={loadingStyle}>Redirecting…</div>;
  }
  const rglLayout = toRGLLayout(gridItems);
  const role = user.roles?.[0] ?? "risk_analyst";
  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary, display: "flex", flexDirection: "column" }}>
      <OnboardingModal userId={user.id} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0, height: 44 }}>
        <button onClick={() => setCatalogOpen(true)} style={btnStyle(S.cyan)}><Plus size={11} strokeWidth={2.2} /><span>Add Widget</span></button>
        <button onClick={handleReset} style={btnStyle(S.tertiary, true)}><RotateCcw size={11} strokeWidth={1.8} /><span>Reset</span></button>
        <div style={{ width: 1, height: 18, background: S.rim, margin: "0 4px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: S.pass, boxShadow: `0 0 6px ${S.pass}`, animation: "pulse 2s infinite", display: "inline-block" }} />
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6rem", color: S.pass, letterSpacing: "0.1em" }}>LIVE</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: S.fontMono, fontSize: "0.6rem", color: S.tertiary, letterSpacing: "0.08em" }}>
          <Activity size={10} style={{ color: S.amber }} />
          <span style={{ color: S.amber }}>{role.replace(/_/g, " ").toUpperCase()}</span>
          <span style={{ color: S.rim }}>·</span>
          <span>{widgetIds.length} WIDGETS</span>
        </div>
        <div style={{ flex: 1 }} />
        {/* L-09: Last refreshed display + Refresh All button */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={10} style={{ color: S.tertiary }} />
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6rem", color: S.tertiary, letterSpacing: "0.04em" }}>
            Last refreshed: {agoLabel}
          </span>
          <button
            onClick={handleRefreshAll}
            title="Refresh all widgets"
            style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: S.fontMono, fontSize: "0.6rem", letterSpacing: "0.05em", color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`, padding: "2px 8px", cursor: "pointer" }}
          >
            <RefreshCw size={9} strokeWidth={1.8} />
            <span>↻ Refresh All</span>
          </button>
        </div>
        <div style={{ width: 1, height: 18, background: S.rim, margin: "0 4px" }} />
        <button onClick={toggleHelp} title={helpOpen ? "Hide help" : "Show contextual help"} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: S.fontMono, fontSize: "0.6rem", letterSpacing: "0.06em", color: helpOpen ? S.cyan : S.tertiary, background: helpOpen ? `color-mix(in srgb, ${S.cyan} 10%, transparent)` : "transparent", border: `1px solid ${helpOpen ? S.cyan : S.rim}`, padding: "3px 10px", cursor: "pointer", transition: "all 150ms" }}>
          <HelpCircle size={11} strokeWidth={1.8} /><span>HELP</span>
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {gridItems.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 16 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.06em" }}>NO WIDGETS ON DASHBOARD</div>
              <button onClick={() => setCatalogOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}`, padding: "6px 14px", cursor: "pointer" }}><Plus size={13} strokeWidth={2} /> Add Your First Widget</button>
            </div>
          ) : (
            <ResponsiveGridLayout className="dashboard-grid" layouts={{ lg: rglLayout, md: rglLayout, sm: rglLayout }} breakpoints={{ lg: 1200, md: 996, sm: 768 }} cols={{ lg: 12, md: 10, sm: 6 }} rowHeight={62} onLayoutChange={handleLayoutChange} margin={[10, 10]} containerPadding={[0, 0]} draggableHandle=".widget-drag-handle" useCSSTransforms>
              {/* L-09: key includes refreshKey to force remount on Refresh All */}
              {gridItems.map(({ i }) => { const WidgetComponent = WIDGET_COMPONENTS[i as WidgetId] ?? null; if (!WidgetComponent) return null; return (<div key={`${i}-${refreshKey}`} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}><WidgetErrorBoundary widgetId={i}><WidgetComponent token={token} user={user} onRemove={() => handleRemove(i)} /></WidgetErrorBoundary></div>); })}
            </ResponsiveGridLayout>
          )}
        </div>
        <HelpPanelV2 module={DASHBOARD_HELP} storageKey="dashboard" />
      </div>
      <footer style={{ height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 20px", background: S.bgPanel, borderTop: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: "0.6rem", color: S.tertiary, letterSpacing: "0.04em", flexShrink: 0 }}>
        <span style={{ color: S.cyan }}>ORDR</span><span style={{ color: S.rim }}>·</span><span>{user.company?.name ?? "ORDR Terminal"}</span><span style={{ color: S.rim }}>·</span><span>Institutional Risk Infrastructure</span><div style={{ flex: 1 }} /><span>Drag handle to reposition · Resize from corner · Layout auto-saved</span>
      </footer>
      <WidgetCatalog open={catalogOpen} onClose={() => setCatalogOpen(false)} activeWidgetIds={widgetIds} onAdd={handleAdd} onReset={() => { handleReset(); setCatalogOpen(false); }} />
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } .react-grid-item { transition: none !important; } .react-grid-item.react-grid-placeholder { background: color-mix(in srgb, var(--accent-cyan) 8%, transparent) !important; border: 1px dashed var(--accent-cyan) !important; border-radius: 0 !important; opacity: 1 !important; } .react-resizable-handle { opacity: 0; transition: opacity 150ms; } .react-grid-item:hover .react-resizable-handle { opacity: 0.5; } .react-resizable-handle::after { border-color: var(--accent-cyan) !important; } .dashboard-grid { min-height: 100%; }`}</style>
    </div>
  );
}
function btnStyle(color: string, ghost?: boolean): React.CSSProperties {
  return { display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: "0.6875rem", letterSpacing: "0.05em", color, background: "transparent", border: `1px solid ${ghost ? "var(--border-rim)" : color}`, padding: "3px 10px", cursor: "pointer" };
}
