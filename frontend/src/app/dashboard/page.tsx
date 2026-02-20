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
import Link from "next/link";
import { Responsive, WidthProvider } from "react-grid-layout";
import type { Layout, Layouts } from "react-grid-layout";
import {
  LayoutDashboard,
  Plus,
  RefreshCw,
  Monitor,
  LogOut,
  Building2,
  ChevronRight,
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
  const { isAuthenticated, isLoading, user, token, logout } = useAuth();

  const [ready, setReady] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [widgetIds, setWidgetIds] = useState<string[]>([]);
  const [gridItems, setGridItems] = useState<GridItem[]>([]);
  const [ts, setTs] = useState(nowTs());

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

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
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

  if (!isAuthenticated || !user || !token) return null;

  const role = user.roles?.[0] ?? "—";
  const branchLabel = user.branch
    ? `${user.company?.name ?? "Synex"} · ${user.branch.name}`
    : user.company?.name ?? "Synex Capital Partners";

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

      {/* ── TopBar ─────────────────────────────────────────────────────────── */}
      <header style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 24px",
        background: S.bgPanel,
        borderBottom: `1px solid ${S.rim}`,
        flexShrink: 0,
      }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LayoutDashboard size={16} strokeWidth={1.5} style={{ color: S.cyan }} />
          <span style={{
            fontFamily: S.fontUI,
            fontSize: "0.8125rem",
            fontWeight: 700,
            color: S.primary,
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
          }}>
            ORDR Dashboard
          </span>
        </div>

        <span style={{ color: S.rim }}>|</span>

        {/* Org context */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Building2 size={13} strokeWidth={1.5} style={{ color: S.tertiary }} />
          <span style={{
            fontFamily: S.fontMono,
            fontSize: "0.5625rem",
            color: S.secondary,
            letterSpacing: "0.04em",
          }}>
            {branchLabel}
          </span>
        </div>

        <span style={{ color: S.soft }}>·</span>

        {/* Role */}
        <span style={{
          fontFamily: S.fontMono,
          fontSize: "0.5rem",
          padding: "1px 6px",
          border: `1px solid ${S.rim}`,
          color: S.cyan,
          letterSpacing: "0.05em",
          textTransform: "uppercase" as const,
        }}>
          {role}
        </span>

        {/* Nav links */}
        <div style={{ flex: 1 }} />
        <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {[
            { href: "/dashboard",    label: "Dashboard",    active: true },
            { href: "/terminal",     label: "Terminal" },
            { href: "/polisophic",   label: "Polisophic" },
          ].map(({ href, label, active }) => (
            <Link
              key={href}
              href={href}
              style={{
                fontFamily: S.fontMono,
                fontSize: "0.5625rem",
                letterSpacing: "0.04em",
                padding: "4px 10px",
                color: active ? S.cyan : S.tertiary,
                borderBottom: active ? `2px solid ${S.cyan}` : "2px solid transparent",
                textDecoration: "none",
                transition: "color 120ms",
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        <span style={{ color: S.rim }}>|</span>

        {/* User identity */}
        <span style={{
          fontFamily: S.fontMono,
          fontSize: "0.5rem",
          color: S.tertiary,
          letterSpacing: "0.03em",
        }}>
          {user.full_name ?? user.email}
        </span>

        {/* Logout */}
        <button
          onClick={() => { logout(); router.push("/auth/login"); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontFamily: S.fontMono,
            fontSize: "0.5rem",
            letterSpacing: "0.06em",
            color: S.tertiary,
            background: "transparent",
            border: `1px solid ${S.rim}`,
            padding: "3px 8px",
            cursor: "pointer",
          }}
        >
          <LogOut size={11} strokeWidth={1.5} />
          Sign Out
        </button>
      </header>

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
            fontSize: "0.5625rem",
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
            fontSize: "0.5625rem",
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
          fontSize: "0.4375rem",
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
                fontSize: "0.5625rem",
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
        fontSize: "0.5rem",
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
