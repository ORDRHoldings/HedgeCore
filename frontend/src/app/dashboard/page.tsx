"use client";

/**
 * dashboard/page.tsx
 * HedgeCalc – Phase III Role-Based Modular Dashboard
 *
 * Layout:
 *  ┌─ TopBar: identity + branch + role + nav + logout ─────────────┐
 *  ├─ Controls: [+ Add Widget] [Reset Layout] [timestamp] ─────────┤
 *  │  react-grid-layout drag/resize widget grid                    │
 *  └─ Footer ──────────────────────────────────────────────────────┘
 */

import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Responsive, WidthProvider } from "react-grid-layout";
import type { Layout, Layouts } from "react-grid-layout";
import {
  Plus,
  RefreshCw,
  Monitor,
} from "lucide-react";

import { useAuth } from "@/lib/authContext";
import {
  WIDGET_REGISTRY,
  getDefaultLayoutForRole,
  type GridItem,
} from "@/lib/widgets/widgetRegistry";
import WidgetCatalog from "@/components/dashboard/WidgetCatalog";

// ── Widget component imports ──────────────────────────────────────────────────
import KpiSummaryWidget from "@/components/dashboard/widgets/KpiSummaryWidget";
import RecentRunsWidget from "@/components/dashboard/widgets/RecentRunsWidget";
import PendingApprovalsWidget from "@/components/dashboard/widgets/PendingApprovalsWidget";
import TeamActivityWidget from "@/components/dashboard/widgets/TeamActivityWidget";
import BranchComparisonWidget from "@/components/dashboard/widgets/BranchComparisonWidget";
import PolisophicMiniWidget from "@/components/dashboard/widgets/PolisophicMiniWidget";
import QuickActionsWidget from "@/components/dashboard/widgets/QuickActionsWidget";
import ExposureSummaryWidget from "@/components/dashboard/widgets/ExposureSummaryWidget";
import PipelineStatusWidget from "@/components/dashboard/widgets/PipelineStatusWidget";
import HelpPanel from "@/components/layout/HelpPanel";
import { DASHBOARD_HELP } from "@/lib/helpContent";

// ── react-grid-layout setup ───────────────────────────────────────────────────
const ResponsiveGridLayout = WidthProvider(Responsive);

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
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
  pass:      "var(--status-pass)",
  fail:      "var(--accent-red,#B91C1C)",
} as const;

// ── Widget component map ──────────────────────────────────────────────────────
const WIDGET_COMPONENTS: Record<string, React.ComponentType<{ token: string; user: any; onRemove?: () => void }>> = {
  kpi_summary:       KpiSummaryWidget,
  recent_runs:       RecentRunsWidget,
  pending_approvals: PendingApprovalsWidget,
  team_activity:     TeamActivityWidget,
  branch_comparison: BranchComparisonWidget,
  polisophic_mini:   PolisophicMiniWidget,
  quick_actions:     QuickActionsWidget,
  exposure_summary:  ExposureSummaryWidget,
  pipeline_status:   PipelineStatusWidget,
};

// ── localStorage helpers ───────────────────────────────────────────────────────
function layoutKey(userId: string) {
  return `dashboard_layout_${userId}`;
}

function saveLayout(userId: string, widgetIds: string[], grid: GridItem[]) {
  try {
    localStorage.setItem(layoutKey(userId), JSON.stringify({ widgetIds, grid }));
  } catch {
    // localStorage unavailable (SSR, private mode) — ignore
  }
}

function loadLayout(userId: string): { widgetIds: string[]; grid: GridItem[] } | null {
  try {
    const raw = localStorage.getItem(layoutKey(userId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Grid item → react-grid-layout Layout ─────────────────────────────────────
function toRGLLayout(items: GridItem[]): Layout[] {
  return items.map((item) => ({
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: WIDGET_REGISTRY.find((w) => w.id === item.i)?.minW ?? 2,
    minH: WIDGET_REGISTRY.find((w) => w.id === item.i)?.minH ?? 2,
  }));
}

// ── Timestamp ────────────────────────────────────────────────────────────────
function nowTs() {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

// ── Dashboard Page ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, token } = useAuth();

  const [ready, setReady] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [widgetIds, setWidgetIds] = useState<string[]>([]);
  const [gridItems, setGridItems] = useState<GridItem[]>([]);
  // Hydration-safe: initialize empty, set on client
  const [ts, setTs] = useState('');

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && !isLoading && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [ready, isLoading, isAuthenticated, router]);

  // ── Initialize layout ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const saved = loadLayout(user.id);
    if (saved) {
      setWidgetIds(saved.widgetIds);
      setGridItems(saved.grid);
    } else {
      const role = user.roles?.[0] ?? "risk_analyst";
      const defaults = getDefaultLayoutForRole(role);
      setWidgetIds(defaults.widgetIds);
      setGridItems(defaults.grid);
    }
  }, [user?.id]);

  // ── Clock: set initial value on client, then tick every 30s ───────────────
  useEffect(() => {
    setTs(nowTs());                                     // hydration-safe initial set
    const id = setInterval(() => setTs(nowTs()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Layout change handler ─────────────────────────────────────────────────
  const handleLayoutChange = useCallback(
    (currentLayout: Layout[]) => {
      if (!user) return;
      const updated: GridItem[] = currentLayout.map((l) => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
      }));
      setGridItems(updated);
      saveLayout(user.id, widgetIds, updated);
    },
    [user, widgetIds],
  );

  // ── Add widget ────────────────────────────────────────────────────────────
  const handleAdd = useCallback(
    (widgetId: string) => {
      if (widgetIds.includes(widgetId) || !user) return;
      const def = WIDGET_REGISTRY.find((w) => w.id === widgetId);
      if (!def) return;

      // Place new widget below all existing ones
      const maxY = gridItems.reduce((acc, g) => Math.max(acc, g.y + g.h), 0);
      const newItem: GridItem = {
        i: widgetId,
        x: 0,
        y: maxY,
        w: def.defaultW,
        h: def.defaultH,
      };
      const newIds = [...widgetIds, widgetId];
      const newGrid = [...gridItems, newItem];
      setWidgetIds(newIds);
      setGridItems(newGrid);
      saveLayout(user.id, newIds, newGrid);
    },
    [user, widgetIds, gridItems],
  );

  // ── Remove widget ─────────────────────────────────────────────────────────
  const handleRemove = useCallback(
    (widgetId: string) => {
      if (!user) return;
      const newIds = widgetIds.filter((id) => id !== widgetId);
      const newGrid = gridItems.filter((g) => g.i !== widgetId);
      setWidgetIds(newIds);
      setGridItems(newGrid);
      saveLayout(user.id, newIds, newGrid);
    },
    [user, widgetIds, gridItems],
  );

  // ── Reset layout ──────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (!user) return;
    const role = user.roles?.[0] ?? "risk_analyst";
    const defaults = getDefaultLayoutForRole(role);
    setWidgetIds(defaults.widgetIds);
    setGridItems(defaults.grid);
    try {
      localStorage.removeItem(layoutKey(user.id));
    } catch {}
  }, [user]);

  // ── Render guards ─────────────────────────────────────────────────────────
  if (!ready || isLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: S.bgDeep,
        fontFamily: S.fontMono,
        fontSize: "0.75rem",
        color: S.tertiary,
        letterSpacing: "0.06em",
      }}>
        Initializing session…
      </div>
    );
  }

  if (!isAuthenticated || !user || !token) {
    router.replace("/auth/login");
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: S.bgDeep,
        fontFamily: S.fontMono,
        fontSize: "0.75rem",
        color: S.tertiary,
        letterSpacing: "0.06em",
      }}>
        Redirecting to login…
      </div>
    );
  }

  const rglLayout = toRGLLayout(gridItems);

  return (
    <div style={{
      minHeight: "100vh",
      background: S.bgDeep,
      fontFamily: S.fontUI,
      color: S.primary,
      display: "flex",
      flexDirection: "column",
    }}>

      {/* ── Controls bar ───────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 24px",
        background: S.bgSub,
        borderBottom: `1px solid ${S.soft}`,
        flexShrink: 0,
      }}>
        <button
          onClick={() => setCatalogOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            letterSpacing: "0.04em",
            color: S.cyan,
            background: "transparent",
            border: `1px solid ${S.cyan}`,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          <Plus size={12} strokeWidth={2} />
          Add Widget
        </button>

        <button
          onClick={handleReset}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            letterSpacing: "0.04em",
            color: S.tertiary,
            background: "transparent",
            border: `1px solid ${S.rim}`,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} strokeWidth={1.5} />
          Reset Layout
        </button>

        <div style={{ flex: 1 }} />

        <span style={{
          fontFamily: S.fontMono,
          fontSize: "0.6875rem",
          color: S.tertiary,
          letterSpacing: "0.04em",
        }}>
          {widgetIds.length} WIDGETS · {ts}
        </span>
      </div>

      {/* ── Widget Grid ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: "16px 20px", overflow: "auto" }}>
        {gridItems.length === 0 ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 300,
            gap: 16,
          }}>
            <div style={{
              fontFamily: S.fontMono,
              fontSize: "0.75rem",
              color: S.tertiary,
              letterSpacing: "0.06em",
            }}>
              NO WIDGETS ON DASHBOARD
            </div>
            <button
              onClick={() => setCatalogOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: S.fontMono,
                fontSize: "0.75rem",
                letterSpacing: "0.05em",
                color: S.cyan,
                background: "transparent",
                border: `1px solid ${S.cyan}`,
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              <Plus size={13} strokeWidth={2} />
              Add Your First Widget
            </button>
          </div>
        ) : (
          <ResponsiveGridLayout
            className="dashboard-grid"
            layouts={{ lg: rglLayout, md: rglLayout, sm: rglLayout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768 }}
            cols={{ lg: 12, md: 10, sm: 6 }}
            rowHeight={60}
            onLayoutChange={handleLayoutChange}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            draggableHandle=".widget-drag-handle"
            useCSSTransforms
          >
            {gridItems.map(({ i }) => {
              const WidgetComponent = WIDGET_COMPONENTS[i];
              if (!WidgetComponent) return null;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <WidgetComponent
                    token={token}
                    user={user}
                    onRemove={() => handleRemove(i)}
                  />
                
    <HelpPanel config={DASHBOARD_HELP} storageKey="dashboard" />
    </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{
        height: 32,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 24px",
        background: S.bgPanel,
        borderTop: `1px solid ${S.rim}`,
        fontFamily: S.fontMono,
        fontSize: "0.6875rem",
        color: S.tertiary,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}>
        <Monitor size={11} strokeWidth={1.5} style={{ color: S.tertiary }} />
        <span>ORDR Dashboard</span>
        <span style={{ color: S.rim }}>·</span>
        <span>Synex Capital Partners</span>
        <span style={{ color: S.rim }}>·</span>
        <span>Institutional Risk Infrastructure</span>
        <div style={{ flex: 1 }} />
        <span>Layout auto-saved · Drag handles to reposition · Resize from corners</span>
      </footer>

      {/* ── Widget Catalog drawer ──────────────────────────────────────────── */}
      <WidgetCatalog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        activeWidgetIds={widgetIds}
        onAdd={handleAdd}
        onReset={() => { handleReset(); setCatalogOpen(false); }}
      />

      {/* ── Grid layout styles ─────────────────────────────────────────────── */}
      <style>{`
        .react-grid-item {
          transition: none !important;
        }
        .react-grid-item.react-grid-placeholder {
          background: color-mix(in srgb, var(--accent-cyan) 10%, transparent) !important;
          border: 1px dashed var(--accent-cyan) !important;
          border-radius: 0 !important;
          opacity: 1 !important;
        }
        .react-resizable-handle {
          opacity: 0;
          transition: opacity 150ms;
        }
        .react-grid-item:hover .react-resizable-handle {
          opacity: 0.6;
        }
        .react-resizable-handle::after {
          border-color: var(--accent-cyan) !important;
        }
        .dashboard-grid {
          min-height: 100%;
        }
        @media (max-width: 768px) {
          .dashboard-grid .react-grid-item {
            position: static !important;
            transform: none !important;
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
