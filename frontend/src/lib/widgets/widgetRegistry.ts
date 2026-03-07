/**
 * widgetRegistry.ts
 * Defines all available dashboard widgets and default layouts per user role.
 */

import type { UserContext, PlanTier } from "@/lib/authContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WidgetProps {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export interface WidgetDef {
  id: string;
  title: string;
  description: string;
  defaultW: number;  // grid columns (max 12)
  defaultH: number;  // grid rows
  minW: number;
  minH: number;
  requiredPermission: string | null;  // null = any authenticated user
  requiredPlan?: PlanTier;            // minimum plan tier (default: all plans)
}

export interface GridItem {
  i: string;       // widget id
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Widget Registry ──────────────────────────────────────────────────────────

export const WIDGET_REGISTRY: WidgetDef[] = [
  {
    id: "kpi_summary",
    title: "Portfolio KPIs",
    description: "Key metrics: exposure, coverage, proposals, alerts. Scoped to your authority.",
    defaultW: 12,
    defaultH: 3,
    minW: 6,
    minH: 2,
    requiredPermission: null,
  },
  {
    id: "recent_runs",
    title: "My Recent Runs",
    description: "Last 10 sandbox and ledger calculation runs initiated by you.",
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 3,
    requiredPermission: null,
  },
  {
    id: "pending_approvals",
    title: "Pending Approvals",
    description: "Staging artifacts awaiting your review and approval decision.",
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 3,
    requiredPermission: "pipeline.approve",
  },
  {
    id: "team_activity",
    title: "Team Activity",
    description: "Live activity feed for your branch or company-wide.",
    defaultW: 6,
    defaultH: 6,
    minW: 4,
    minH: 4,
    requiredPermission: "audit.view_branch",
  },
  {
    id: "branch_comparison",
    title: "Branch Risk Comparison",
    description: "Side-by-side risk and exposure metrics across all branches.",
    defaultW: 8,
    defaultH: 5,
    minW: 6,
    minH: 4,
    requiredPermission: "reports.view_all_branches",
    requiredPlan: "enterprise",
  },
  {
    id: "polisophic_mini",
    title: "Geopolitical Risk",
    description: "Top risk events and currency-exposure alert for your portfolio.",
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 3,
    requiredPermission: null,
    requiredPlan: "enterprise",
  },
  {
    id: "quick_actions",
    title: "Quick Actions",
    description: "Permission-gated shortcuts to your most common actions.",
    defaultW: 4,
    defaultH: 4,
    minW: 3,
    minH: 3,
    requiredPermission: null,
  },
  {
    id: "exposure_summary",
    title: "FX Exposure Summary",
    description: "Currency exposure breakdown: notional amounts and hedge coverage by pair.",
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 3,
    requiredPermission: "trades.view",
  },
  {
    id: "pipeline_status",
    title: "Pipeline Status",
    description: "Tri-state pipeline funnel: Sandbox → Staging → Ledger counts.",
    defaultW: 6,
    defaultH: 4,
    minW: 4,
    minH: 3,
    requiredPermission: "pipeline.create_proposal",
  },
  {
    id: "fx_rates",
    title: "FX Rates",
    description: "Live and BIS-calibrated exchange rates for 8 major and EM currency pairs.",
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 4,
    requiredPermission: null,
  },
  {
    id: "currency_intel",
    title: "Currency Intelligence",
    description: "Macro data, central bank policy, risk scores, and POLISOPHIC news feed for your exposure currencies.",
    defaultW: 6,
    defaultH: 8,
    minW: 5,
    minH: 6,
    requiredPermission: null,
    requiredPlan: "enterprise",
  },
  {
    id: "hedge_health",
    title: "Hedge Health",
    description: "Composite health score across coverage, policy, approvals, positions, and pipeline. Shows setup checklist when starting fresh.",
    defaultW: 4,
    defaultH: 6,
    minW: 3,
    minH: 5,
    requiredPermission: null,
  },
  {
    id: "market_pulse",
    title: "Market Pulse",
    description: "Real-time market context: key indices, FX pairs, commodities, and bond yields in a Bloomberg-style ticker grid.",
    defaultW: 4,
    defaultH: 4,
    minW: 4,
    minH: 3,
    requiredPermission: null,
  },
  {
    id: "command_hub",
    title: "Command Hub",
    description: "Stunning visual navigation grid to every module in the application. Role-filtered, color-coded, with keyboard shortcuts.",
    defaultW: 2,
    defaultH: 13,
    minW: 2,
    minH: 4,
    requiredPermission: null,
    requiredPlan: "enterprise",
  },
  {
    id: "geopolitical",
    title: "Geopolitical & Macro",
    description: "POLISOPHIC-powered political risk events, macro tape, and central bank tracker. Tabbed 3-panel intelligence view.",
    defaultW: 4,
    defaultH: 4,
    minW: 4,
    minH: 4,
    requiredPermission: null,
    requiredPlan: "enterprise",
  },
  {
    id: "usd_exposure_radar",
    title: "USD Exposure Radar",
    description: "Deep-dive into USD dynamics: DXY, real yields, Fed positioning, FX matrix with vol/carry, and USD strength chart.",
    defaultW: 4,
    defaultH: 4,
    minW: 4,
    minH: 4,
    requiredPermission: null,
    requiredPlan: "enterprise",
  },
  {
    id: "risk_pulse",
    title: "Risk Pulse",
    description: "Live FX risk score derived from news volume and economic calendar impact. Updates every 60s.",
    defaultW: 4,
    defaultH: 6,
    minW: 3,
    minH: 5,
    requiredPermission: null,
    requiredPlan: "enterprise",
  },
  {
    id: "fx_news",
    title: "FX News",
    description: "Latest forex headlines from Finnhub. Scrollable feed with source, relative time, and direct links.",
    defaultW: 4,
    defaultH: 8,
    minW: 3,
    minH: 5,
    requiredPermission: null,
  },
  {
    id: "econ_calendar",
    title: "Econ Calendar",
    description: "7-day economic calendar with impact scoring. Grouped by day with actual vs estimate vs prior.",
    defaultW: 6,
    defaultH: 8,
    minW: 4,
    minH: 5,
    requiredPermission: null,
  },
  {
    id: "hedge_monitor",
    title: "Hedge Monitor",
    description: "Live MTM P&L, hedge effectiveness score, next roll date, and coverage — links to full Hedge Monitor page.",
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 4,
    requiredPermission: "trades.view",
  },
  {
    id: "multi_pair_exposure",
    title: "Multi-Pair Exposure",
    description: "Cross-currency exposure bar chart: 26-pair registry with NDF badges, hedge % coverage, and exposure in USD.",
    defaultW: 6,
    defaultH: 6,
    minW: 4,
    minH: 4,
    requiredPermission: "trades.view",
    requiredPlan: "enterprise",
  },
];

// ─── Default Layouts per Role ─────────────────────────────────────────────────

type RoleLayout = { widgetIds: string[]; grid: GridItem[] };

const ROLE_LAYOUTS: Record<string, RoleLayout> = {
  admin: {
    // ── Admin operational layout ──
    //
    //  ┌────────────────────────────────────────┐  y=0
    //  │   KPI Summary (w=12, h=3)              │
    //  ├──────────────────┬─────────────────────┤  y=3
    //  │  Exposure Summary │  FX Rates           │
    //  │  (w=6, h=5)      │  (w=6, h=5)         │
    //  ├──────────┬───────┴─────────────────────┤  y=8
    //  │ Recent   │  Hedge Health │ Quick Actions│
    //  │ Runs     │  (w=4, h=6)  │ (w=4, h=4)  │
    //  │ (w=6,h=5)│              │              │
    //  └──────────┴──────────┴──────────────────┘
    //
    widgetIds: ["kpi_summary", "exposure_summary", "fx_rates", "recent_runs", "hedge_health", "quick_actions"],
    grid: [
      { i: "kpi_summary",      x: 0, y: 0, w: 12, h: 3 },
      { i: "exposure_summary", x: 0, y: 3, w: 6,  h: 5 },
      { i: "fx_rates",         x: 6, y: 3, w: 6,  h: 5 },
      { i: "recent_runs",      x: 0, y: 8, w: 6,  h: 5 },
      { i: "hedge_health",     x: 6, y: 8, w: 4,  h: 6 },
      { i: "quick_actions",    x: 10, y: 8, w: 2, h: 4 },
    ],
  },
  ceo: {
    widgetIds: ["kpi_summary", "branch_comparison", "pending_approvals", "polisophic_mini", "team_activity"],
    grid: [
      { i: "kpi_summary",       x: 0, y: 0,  w: 12, h: 3 },
      { i: "branch_comparison", x: 0, y: 3,  w: 8,  h: 5 },
      { i: "pending_approvals", x: 8, y: 3,  w: 4,  h: 5 },
      { i: "polisophic_mini",   x: 0, y: 8,  w: 6,  h: 5 },
      { i: "team_activity",     x: 6, y: 8,  w: 6,  h: 6 },
    ],
  },
  cfo: {
    widgetIds: ["kpi_summary", "exposure_summary", "fx_rates", "branch_comparison", "polisophic_mini", "recent_runs", "multi_pair_exposure"],
    grid: [
      { i: "kpi_summary",         x: 0, y: 0,  w: 12, h: 3 },
      { i: "exposure_summary",    x: 0, y: 3,  w: 6,  h: 5 },
      { i: "fx_rates",            x: 6, y: 3,  w: 6,  h: 5 },
      { i: "branch_comparison",   x: 0, y: 8,  w: 8,  h: 5 },
      { i: "polisophic_mini",     x: 8, y: 8,  w: 4,  h: 5 },
      { i: "recent_runs",         x: 0, y: 13, w: 12, h: 5 },
      { i: "multi_pair_exposure", x: 0, y: 18, w: 6,  h: 6 },
    ],
  },
  head_of_risk: {
    widgetIds: ["kpi_summary", "pending_approvals", "polisophic_mini", "branch_comparison", "team_activity"],
    grid: [
      { i: "kpi_summary",       x: 0, y: 0,  w: 12, h: 3 },
      { i: "pending_approvals", x: 0, y: 3,  w: 6,  h: 5 },
      { i: "polisophic_mini",   x: 6, y: 3,  w: 6,  h: 5 },
      { i: "branch_comparison", x: 0, y: 8,  w: 8,  h: 5 },
      { i: "team_activity",     x: 8, y: 8,  w: 4,  h: 6 },
    ],
  },
  branch_manager: {
    widgetIds: ["kpi_summary", "pending_approvals", "team_activity", "exposure_summary", "recent_runs"],
    grid: [
      { i: "kpi_summary",       x: 0, y: 0,  w: 12, h: 3 },
      { i: "pending_approvals", x: 0, y: 3,  w: 6,  h: 5 },
      { i: "team_activity",     x: 6, y: 3,  w: 6,  h: 6 },
      { i: "exposure_summary",  x: 0, y: 8,  w: 6,  h: 5 },
      { i: "recent_runs",       x: 6, y: 9,  w: 6,  h: 5 },
    ],
  },
  supervisor: {
    widgetIds: ["kpi_summary", "pending_approvals", "recent_runs", "team_activity", "quick_actions"],
    grid: [
      { i: "kpi_summary",       x: 0, y: 0,  w: 12, h: 3 },
      { i: "pending_approvals", x: 0, y: 3,  w: 6,  h: 5 },
      { i: "recent_runs",       x: 6, y: 3,  w: 6,  h: 5 },
      { i: "team_activity",     x: 0, y: 8,  w: 8,  h: 6 },
      { i: "quick_actions",     x: 8, y: 8,  w: 4,  h: 4 },
    ],
  },
  senior_analyst: {
    widgetIds: ["recent_runs", "exposure_summary", "fx_rates", "hedge_health", "pipeline_status", "quick_actions"],
    grid: [
      { i: "recent_runs",      x: 0, y: 0,  w: 6,  h: 5 },
      { i: "exposure_summary", x: 6, y: 0,  w: 6,  h: 5 },
      { i: "fx_rates",         x: 0, y: 5,  w: 6,  h: 5 },
      { i: "hedge_health",     x: 6, y: 5,  w: 6,  h: 5 },
      { i: "pipeline_status",  x: 0, y: 10, w: 6,  h: 4 },
      { i: "quick_actions",    x: 6, y: 10, w: 6,  h: 4 },
    ],
  },
  risk_analyst: {
    widgetIds: ["recent_runs", "hedge_health", "quick_actions", "exposure_summary"],
    grid: [
      { i: "recent_runs",      x: 0, y: 0, w: 7, h: 5 },
      { i: "hedge_health",     x: 7, y: 0, w: 5, h: 5 },
      { i: "quick_actions",    x: 0, y: 5, w: 4, h: 4 },
      { i: "exposure_summary", x: 4, y: 5, w: 8, h: 5 },
    ],
  },
  junior_analyst: {
    widgetIds: ["recent_runs", "quick_actions", "fx_rates"],
    grid: [
      { i: "recent_runs",   x: 0, y: 0, w: 7, h: 5 },
      { i: "quick_actions",  x: 7, y: 0, w: 5, h: 4 },
      { i: "fx_rates",       x: 0, y: 5, w: 12, h: 5 },
    ],
  },
  auditor: {
    widgetIds: ["team_activity", "pipeline_status", "recent_runs", "kpi_summary"],
    grid: [
      { i: "team_activity",    x: 0, y: 0, w: 8,  h: 6 },
      { i: "pipeline_status",  x: 8, y: 0, w: 4,  h: 4 },
      { i: "recent_runs",      x: 8, y: 4, w: 4,  h: 5 },
      { i: "kpi_summary",      x: 0, y: 6, w: 8,  h: 3 },
    ],
  },
};

// Default fallback — functional widgets that work at all plan tiers
const DEFAULT_LAYOUT: RoleLayout = {
  widgetIds: ["kpi_summary", "exposure_summary", "fx_rates", "recent_runs", "quick_actions", "hedge_health"],
  grid: [
    { i: "kpi_summary",      x: 0, y: 0, w: 12, h: 3 },
    { i: "exposure_summary", x: 0, y: 3, w: 6,  h: 5 },
    { i: "fx_rates",         x: 6, y: 3, w: 6,  h: 5 },
    { i: "recent_runs",      x: 0, y: 8, w: 6,  h: 5 },
    { i: "quick_actions",    x: 6, y: 8, w: 4,  h: 4 },
    { i: "hedge_health",     x: 10, y: 8, w: 2, h: 6 },
  ],
};

export function getDefaultLayoutForRole(role: string): RoleLayout {
  return ROLE_LAYOUTS[role] ?? DEFAULT_LAYOUT;
}

/** Union of all valid widget IDs — derived from WIDGET_REGISTRY so it's always in sync. */
export type WidgetId = (typeof WIDGET_REGISTRY)[number]["id"];

export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find((w) => w.id === id);
}
