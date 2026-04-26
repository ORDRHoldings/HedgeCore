"use client";

/**
 * AppSidebar.tsx — Institutional Left-Rail Navigation
 *
 * A Bloomberg-grade sidebar that replaces the top bar.
 * Collapsed (64px): icon rail with title tooltips.
 * Expanded (260px): full navigation with inline sub-items.
 *
 * Design: "Instrument Panel" — dark slab of authority against light workspace.
 * Near-black (#0B1120) sidebar, accent blue (#1C62F2) for active states only.
 * IBM Plex Mono for labels, IBM Plex Sans for descriptions.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, type PlanTier } from "@/lib/authContext";
import { usePlanGate } from "@/lib/hooks/usePlanGate";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Play, FileText, Microscope, BarChart3,
  Zap, Globe, Settings, Monitor, HelpCircle,
  Upload, Scale, Shield, Book, Clock, Terminal, Plug,
  ChevronRight, LogOut, PanelLeftClose,
  Target, Cpu, PenSquare, Download, Key, User, Ticket, CircleHelp, Database,
  DollarSign, RefreshCw, BarChart2, Building2, CreditCard, Link2, TrendingUp, GitMerge,
  Layers, FileSpreadsheet, Brain, TrendingDown, Calculator, Users, FileCheck, Library,
} from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { T } from "@/lib/design/tokens";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

// ── Sidebar-specific design tokens ──────────────────────────────────────────
const ST = {
  sidebarBg:      "var(--bg-sidebar, #0E0E0E)",
  sidebarBgHover: "var(--sidebar-hover, #181818)",
  sidebarBorder:  "var(--sidebar-border, #2A2A2A)",
  sidebarDivider: "var(--sidebar-divider, #1C1C1C)",
  textBright:     "var(--text-primary, #E0E0E0)",
  textMuted:      "var(--text-secondary, #B0B0B0)",
  textDim:        "var(--text-tertiary, #787878)",
  accent:         "var(--accent-blue, #64A8F0)",
  accentDim:      "var(--accent-blue-dim, rgba(100, 168, 240, 0.12))",
  accentGlow:     "var(--accent-blue-dim, rgba(100, 168, 240, 0.25))",
  amber:          "var(--accent-amber, #E5A84B)",
  green:          "var(--status-pass, #4CAF50)",
  red:            "var(--accent-red, #E57373)",
  white:          "#fff",
  collapsed: 64,
  expanded:  260,
} as const;

// ── Nav data types ───────────────────────────────────────────────────────────
interface NavItem {
  label: string;
  desc:  string;
  href:  string;
  icon:  LucideIcon;
  minTier?: PlanTier;
  group?: string;
}

interface NavSection {
  label:     string;
  href:      string;
  icon:      LucideIcon;
  prefixes:  string[];
  header:    string;
  items:     NavItem[];
  teamOnly?: boolean;
  minTier?:  PlanTier;
  superuserOnly?: boolean;
}

// ── Navigation config ────────────────────────────────────────────────────────
const NAV: NavSection[] = [
  {
    label: "Dashboard", href: "/dashboard", icon: LayoutDashboard,
    prefixes: ["/dashboard", "/portfolio", "/portfolio-risk", "/polisophic", "/portfolio-multi"],
    header: "Overview",
    items: [
      { label: "Summary",             desc: "KPIs, P&L snapshot, FX exposure",               href: "/dashboard",        icon: LayoutDashboard },
      { label: "ORDR Portfolio",      desc: "Multi-currency risk hub · R1-R8 · BETA",         href: "/portfolio",        icon: BarChart3, minTier: "professional" as PlanTier },
      { label: "Portfolio Risk",      desc: "R1-R8 risk taxonomy decomposition",              href: "/portfolio-risk",   icon: BarChart3, minTier: "professional" as PlanTier },
      { label: "Multi-Pair Matrix",   desc: "26-pair correlation heatmap · concentration",    href: "/portfolio-multi",  icon: BarChart3, minTier: "professional" as PlanTier },
      { label: "Polisophic",          desc: "Political & macro risk intelligence",             href: "/polisophic",       icon: Globe, minTier: "enterprise" as PlanTier },
    ],
  },
  {
    label: "Treasury Suite", href: "/hedge-desk", icon: Play,
    prefixes: ["/hedge-desk", "/hedge-monitor", "/trade-history", "/position-desk", "/policies", "/results", "/hedge-effectiveness", "/gl-postings", "/settlement", "/erp-sync", "/cash-positions", "/cash-forecast", "/intercompany-netting", "/cash-management", "/bank-statements", "/payments", "/intelligence", "/debt", "/ir-risk", "/pre-trade-tca", "/counterparties", "/regulatory-submissions", "/natural-hedging", "/hedge-templates"],
    header: "TREASURY SUITE",
    items: [
      // ── PRIMARY OPERATING LANE
      { label: "Overview",       desc: "Start, resume, or review hedge runs",       href: "/hedge-desk",       icon: LayoutDashboard, group: "OPERATE" },
      { label: "Active Run",     desc: "Guided hedge pipeline",                     href: "/hedge-desk?mode=run", icon: Play, group: "OPERATE" },
      { label: "Monitor",        desc: "Live MTM P&L, drift, roll schedule",        href: "/hedge-monitor",    icon: BarChart3, group: "OPERATE" },
      { label: "History",        desc: "Proposals, fills, slippage audit",           href: "/trade-history",    icon: Clock, group: "OPERATE" },
      { label: "Pre-Trade TCA",  desc: "Estimate execution cost",                     href: "/pre-trade-tca",    icon: Calculator, group: "OPERATE", minTier: "professional" as PlanTier },
      { label: "Natural Hedging", desc: "Offset AR/AP per currency before hedging",    href: "/natural-hedging",  icon: GitMerge,   group: "OPERATE", minTier: "professional" as PlanTier },
      { label: "Templates",       desc: "Library of hedge strategy blueprints",        href: "/hedge-templates",  icon: Library,    group: "OPERATE", minTier: "professional" as PlanTier },
      // ── COMPLIANCE
      { label: "Effectiveness",    desc: "IFRS 9 / ASC 815 hedge effectiveness",      href: "/hedge-effectiveness",            icon: Scale, group: "COMPLIANCE" },
      { label: "Assessment History", desc: "Past effectiveness test runs",             href: "/hedge-effectiveness?tab=runs",   icon: Clock, group: "COMPLIANCE" },
      // ── REFERENCE
      { label: "Policy Engine",   desc: "Library, saved, assign & analytics",          href: "/policies",             icon: Book, group: "REFERENCE" },
      { label: "Position Desk",  desc: "Position lifecycle management",              href: "/position-desk",    icon: LayoutDashboard, group: "REFERENCE" },
      // ── ACCOUNTING
      { label: "GL Postings",  desc: "Journal entry queue — approve, post to ERP",  href: "/gl-postings",   icon: FileText,     group: "ACCOUNTING", minTier: "professional" as PlanTier },
      { label: "Settlement",   desc: "Confirm hedge settlements, P&L variance",     href: "/settlement",    icon: DollarSign,   group: "ACCOUNTING", minTier: "professional" as PlanTier },
      { label: "ERP Sync",       desc: "Pull invoices from Xero, QB, NetSuite",           href: "/erp-sync",       icon: RefreshCw,  group: "ACCOUNTING", minTier: "professional" as PlanTier },
      { label: "Cash Positions", desc: "Group treasury cash position dashboard",          href: "/cash-positions", icon: BarChart2,  group: "ACCOUNTING", minTier: "professional" as PlanTier },
      { label: "Cash Forecast", desc: "Projected cash flows and liquidity planning",      href: "/cash-forecast",  icon: TrendingUp, group: "ACCOUNTING", minTier: "professional" as PlanTier },
      { label: "IC Netting", desc: "Intercompany netting & settlement optimization",  href: "/intercompany-netting", icon: GitMerge, group: "ACCOUNTING", minTier: "professional" as PlanTier },
      { label: "Cash Pools", desc: "Multi-entity cash pooling & sweep management",  href: "/cash-management", icon: Layers, group: "ACCOUNTING", minTier: "professional" as PlanTier },
      { label: "Bank Statements", desc: "Statement import & auto-reconciliation",  href: "/bank-statements", icon: FileSpreadsheet, group: "ACCOUNTING", minTier: "professional" as PlanTier },
      { label: "Payments", desc: "Paper-mode payment initiation with 4-eyes approval", href: "/payments", icon: CreditCard, group: "ACCOUNTING", minTier: "enterprise" as PlanTier },
      // ── DEBT & IR RISK
      { label: "Debt Portfolio", desc: "Debt facilities, drawdowns, maturity calendar",  href: "/debt",    icon: CreditCard,   group: "DEBT & IR RISK", minTier: "professional" as PlanTier },
      { label: "IR Risk",        desc: "IR swaps, DV01 ladder, IFRS 9 effectiveness",   href: "/ir-risk", icon: TrendingDown, group: "DEBT & IR RISK", minTier: "professional" as PlanTier },
      { label: "Counterparties", desc: "Counterparty hub · credit limits · PFE exposure", href: "/counterparties", icon: Users, group: "DEBT & IR RISK", minTier: "professional" as PlanTier },
      // ── COMPLIANCE
      { label: "Regulatory Submissions", desc: "EMIR / MiFID II / Dodd-Frank TR submission lifecycle", href: "/regulatory-submissions", icon: FileCheck, group: "COMPLIANCE", minTier: "professional" as PlanTier },
    ],
  },
  {
    label: "Reports", href: "/reports", icon: FileText,
    prefixes: ["/reports"],
    header: "Report Studio",
    items: [
      { label: "Studio",            desc: "Split-pane report builder + export", href: "/reports",                  icon: FileText },
      { label: "Library",           desc: "30 preset templates by category",    href: "/reports?tab=library",      icon: Book },
      { label: "Saved",             desc: "Versioned saved reports",            href: "/reports?tab=saved",        icon: Shield },
      { label: "Regulatory",        desc: "EMIR, MiFID, Dodd-Frank downloads", href: "/reports?tab=regulatory",   icon: Zap },
      { label: "Run Results",       desc: "Hedge schedule with rationale",      href: "/results",                  icon: BarChart3 },
      { label: "Committee Pack",    desc: "IFRS 9 hedge effectiveness pack",    href: "/committee-pack",           icon: Download },
    ],
  },
  {
    label: "Audit Lab", href: "/audit-lab", icon: Microscope,
    prefixes: ["/audit-lab"],
    header: "AUDIT LAB",
    items: [
      { label: "Audit Lab",      desc: "Quantify markup, fees, unhedged variance", href: "/audit-lab",             icon: Microscope },
      { label: "Upload Dataset", desc: "CSV upload with period selector",          href: "/audit-lab/upload",      icon: Upload },
      { label: "Compare Runs",   desc: "Side-by-side run comparison",              href: "/audit-lab/compare",     icon: Scale },
      { label: "Activity Log",   desc: "Immutable event log",                      href: "/audit-lab/audit-trail", icon: Shield },
      { label: "Trends",         desc: "Period-over-period trend analysis",        href: "/audit-lab/trends",      icon: BarChart3 },
    ],
  },
  {
    label: "Market", href: "/market-intelligence", icon: BarChart3,
    prefixes: ["/market-intelligence"],
    header: "MARKET",
    items: [
      { label: "Overview",   desc: "Market pulse, heatmap, movers, calendar",     href: "/market-intelligence",                icon: Globe },
      { label: "Heatmap",    desc: "Full-screen stock, FX, ETF, crypto heatmap",  href: "/market-intelligence?tab=heatmap",    icon: BarChart3 },
      { label: "Calendar",   desc: "Economic & earnings event calendar",          href: "/market-intelligence?tab=calendar",   icon: Clock },
      { label: "Companies",  desc: "Symbol search, overview, technicals",         href: "/market-intelligence?tab=companies",  icon: Target },
      { label: "Watchlists", desc: "Custom watchlist & stock screener",           href: "/market-intelligence?tab=watchlists", icon: PenSquare },
      { label: "Signals",    desc: "Passive technicals & news catalyst stream",   href: "/market-intelligence?tab=signals",    icon: Zap },
    ],
  },
  {
    label: "Research", href: "/sandbox", icon: Zap,
    prefixes: ["/sandbox", "/scenario-studio", "/methodology"],
    header: "Research & Simulation",
    items: [
      { label: "Simulation Lab",  desc: "Stress testing, crisis library, what-if", href: "/sandbox",         icon: Terminal },
      { label: "ORDR Labs",       desc: "Monte Carlo VaR/CVaR simulation engine",  href: "/scenario-studio", icon: Zap },
      { label: "Methodology",     desc: "Calculation whitepaper & architecture",   href: "/methodology",     icon: Book },
    ],
  },
  {
    label: "Governance", href: "/audit-trail", icon: Globe,
    teamOnly: true, minTier: "enterprise" as PlanTier,
    prefixes: ["/hedgewiki", "/hedges", "/audit-trail", "/run-viewer", "/lineage", "/committee-pack", "/staging", "/ledger"],
    header: "Compliance & Audit",
    items: [
      { label: "Staging Queue",    desc: "4-eyes maker/checker review",       href: "/staging",     icon: Database },
      { label: "Ledger",           desc: "Immutable settled ledger records",  href: "/ledger",      icon: Shield },
      { label: "Audit Trail",      desc: "Hash-chain integrity log",          href: "/audit-trail", icon: Shield },
      { label: "Run Viewer",       desc: "TraceLite + SHA-256 RunEnvelope",   href: "/run-viewer",  icon: Terminal },
      { label: "Position Lineage", desc: "5-level provenance graph",          href: "/lineage",     icon: Plug },
      { label: "Hedge Wiki",       desc: "FX instruments, ISDA, IFRS 9",     href: "/hedgewiki",   icon: Book },
    ],
  },
  {
    label: "Settings", href: "/settings", icon: Settings,
    prefixes: ["/settings", "/database-connection", "/erp-integration", "/accounting-connection", "/connectors", "/import-history", "/settings/gl-accounts", "/settings/legal-entities", "/settings/bank-accounts", "/settings/bank-connections"],
    header: "Configuration",
    items: [
      { label: "General",            desc: "Organisation, currency, timezone",    href: "/settings",                   icon: User },
      { label: "Policy Limits",      desc: "Hedge ratios, trade size limits",     href: "/settings?tab=policy_limits", icon: Shield },
      { label: "Execution",          desc: "Default product, stress sigma",       href: "/settings?tab=execution",     icon: Zap },
      { label: "API & Config",       desc: "API keys, backend URL, IBKR",        href: "/settings?tab=api_config",    icon: Key },
      { label: "Notifications",      desc: "Alert triggers, webhooks",            href: "/settings?tab=notifications", icon: Clock },
      { label: "Security",           desc: "TOTP MFA enrolment",                  href: "/settings?tab=security",      icon: Shield },
      // ── CONNECTORS
      { label: "Connect Database",   desc: "SQL pull -- Oracle, Postgres, MySQL",  href: "/settings?tab=connectors",    icon: Database, minTier: "professional" as PlanTier },
      { label: "ERP Integration",    desc: "SAP, Oracle, NetSuite connectors",    href: "/settings?tab=erp",           icon: Zap, minTier: "professional" as PlanTier },
      { label: "GL Account Mappings", desc: "Chart-of-accounts for journal entries",  href: "/settings/gl-accounts",          icon: FileText,   minTier: "professional" as PlanTier },
      { label: "Legal Entities",      desc: "Group treasury legal entity hierarchy",  href: "/settings/legal-entities",       icon: Building2,  minTier: "professional" as PlanTier },
      { label: "Bank Accounts",       desc: "Bank account registry and verification", href: "/settings/bank-accounts",        icon: CreditCard, minTier: "professional" as PlanTier },
      { label: "Bank Connections",    desc: "TrueLayer / Plaid OAuth connections",    href: "/settings/bank-connections",     icon: Link2,      minTier: "professional" as PlanTier },
      { label: "Import History",     desc: "Audit log of all imports",            href: "/settings?tab=import_history", icon: Clock, minTier: "professional" as PlanTier },
      // ── ADMIN
      { label: "Users & Roles",      desc: "Team members, RBAC assignments",      href: "/settings?tab=users_roles",   icon: User, minTier: "enterprise" as PlanTier },
      { label: "API Key Management", desc: "Generate and revoke API keys",        href: "/settings?tab=api_key_mgmt",  icon: Key, minTier: "professional" as PlanTier },
      { label: "Organisation",       desc: "Company, branches, governance",       href: "/settings?tab=organisation",  icon: Database, minTier: "enterprise" as PlanTier },
      { label: "Audit Trail",        desc: "Immutable event log",                 href: "/settings?tab=audit_trail",   icon: Shield, minTier: "enterprise" as PlanTier },
    ],
  },
  // ── INTELLIGENCE ──────────────────────────────────────────────
  {
    label: "Intelligence", href: "/intelligence", icon: Brain,
    prefixes: ["/intelligence"],
    header: "INTELLIGENCE",
    minTier: "intelligence" as PlanTier,
    items: [
      {
        label: "Intelligence",
        desc: "Natural language treasury query + AI report commentary",
        href: "/intelligence",
        icon: Brain,
        minTier: "intelligence" as PlanTier,
      },
    ],
  },
  {
    label: "Admin", href: "/admin", icon: Monitor,
    prefixes: ["/admin", "/admin-monitor", "/devops"],
    header: "Platform Operations",
    superuserOnly: true,
    items: [
      { label: "Operations Center", desc: "System health, services, DB stats",   href: "/admin?tab=operations", icon: Monitor },
      { label: "DevOps Console",    desc: "AI memory, risks, freeze, decisions", href: "/admin?tab=devops",     icon: Cpu },
    ],
  },
  {
    label: "Help", href: "/help", icon: HelpCircle,
    prefixes: ["/help"],
    header: "Support",
    items: [
      { label: "Documentation",  desc: "Knowledge base -- L1 to L5 depth",  href: "/help",          icon: Book },
      { label: "FAQ",            desc: "Frequently asked questions",         href: "/help/faq",      icon: CircleHelp },
      { label: "Support Center", desc: "Diagnostics, tickets, knowledge",   href: "/help/support",  icon: CircleHelp },
      { label: "Contact",        desc: "Open a ticket with diagnostics",    href: "/help/contact",  icon: Ticket },
    ],
  },
];

// ── Role badge colour ────────────────────────────────────────────────────────
function roleColor(role: string): string {
  if (["admin", "cfo", "ceo"].includes(role))            return ST.amber;
  if (["head_of_risk", "branch_manager"].includes(role)) return ST.accent;
  if (["auditor"].includes(role))                        return "#93C5FD";
  return ST.textMuted;
}

// ══════════════════════════════════════════════════════════════════════════════
// SIDEBAR SECTION — single nav section row
// ══════════════════════════════════════════════════════════════════════════════

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface SectionRowProps {
  sec:        NavSection;
  isActive:   boolean;
  isExpanded: boolean;
  expandedOpen: string | null;
  onToggleExpanded: (label: string) => void;
  pathname: string;
  onItemClick?: () => void;
}

function SectionRow({ sec, isActive, isExpanded, expandedOpen, onToggleExpanded, pathname, onItemClick }: SectionRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const isSubOpen = expandedOpen === sec.label;

  const handleClick = () => {
    if (isExpanded) {
      // In expanded mode, toggle sub-items or navigate if only 1 item
      if (sec.items.length <= 1) {
        router.push(sec.href);
        onItemClick?.();
      } else {
        onToggleExpanded(sec.label);
      }
    } else {
      router.push(sec.href);
      onItemClick?.();
    }
  };

  return (
    <div ref={ref}>
      {/* Section button */}
      <div
        role="button"
        tabIndex={0}
        aria-label={!isExpanded ? sec.label : undefined}
        aria-current={isActive ? "page" : undefined}
        aria-expanded={isExpanded && sec.items.length > 1 ? isSubOpen : undefined}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        title={!isExpanded ? sec.label : undefined}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          isExpanded ? 12 : 0,
          height:       42,
          padding:      isExpanded ? "0 16px" : "0",
          justifyContent: isExpanded ? "flex-start" : "center",
          cursor:       "pointer",
          position:     "relative",
          transition:   "background 100ms",
          background:   isActive ? ST.accentDim : "transparent",
          outline:      "none",
        }}
        onFocus={e => {
          if (!isActive) (e.currentTarget as HTMLElement).style.background = ST.sidebarBgHover;
        }}
        onBlur={e => {
          if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        onMouseEnter={e => {
          if (!isActive) (e.currentTarget as HTMLElement).style.background = ST.sidebarBgHover;
        }}
        onMouseLeave={e => {
          if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        {/* Active indicator — 3px accent bar */}
        {isActive && (
          <div style={{
            position:     "absolute",
            left:         0,
            top:          6,
            bottom:       6,
            width:        3,
            background:   ST.accent,
            borderRadius: "0 2px 2px 0",
            boxShadow:    `0 0 8px ${ST.accentGlow}`,
          }} />
        )}

        {/* Icon */}
        <span style={{
          display:    "flex",
          alignItems: "center",
          color:      isActive ? ST.accent : ST.textMuted,
          transition: "color 100ms",
          flexShrink: 0,
          width:      isExpanded ? "auto" : ST.collapsed,
          justifyContent: isExpanded ? "flex-start" : "center",
        }}>
          <Icon icon={sec.icon} size={18} color={isActive ? ST.accent : ST.textMuted} />
        </span>

        {/* Label (expanded only) */}
        {isExpanded && (
          <>
            <span style={{
              fontFamily:    T.fontMono,
              fontSize: 12,
              fontWeight:    isActive ? 600 : 500,
              letterSpacing: "0.06em",
              color:         isActive ? ST.textBright : ST.textMuted,
              transition:    "color 100ms",
              flex:          1,
              whiteSpace:    "nowrap",
              overflow:      "hidden",
              textOverflow:  "ellipsis",
            }}>
              {sec.label.toUpperCase()}
            </span>
            {sec.items.length > 1 && (
              <span style={{
                color:      ST.textDim,
                display:    "flex",
                alignItems: "center",
                transition: "transform 150ms",
                transform:  isSubOpen ? "rotate(90deg)" : "rotate(0)",
              }}>
                <Icon icon={ChevronRight} size={10} color={ST.textDim} />
              </span>
            )}
          </>
        )}
      </div>

      {/* Expanded sub-items */}
      {isExpanded && isSubOpen && (
        <div style={{
          overflow: "hidden",
          borderTop: `1px solid ${ST.sidebarDivider}`,
          background: "rgba(0,0,0,0.15)",
        }}>
          {sec.items.map((item, idx) => {
            const prevGroup = idx > 0 ? sec.items[idx - 1].group : undefined;
            const showGroupDivider = item.group && item.group !== prevGroup;
            const isItemActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <div key={item.href + item.label}>
                {showGroupDivider && (
                  <div style={{
                    padding: "6px 16px 2px 44px",
                    fontFamily: T.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    color: ST.textDim,
                    borderTop: idx > 0 ? `1px solid ${ST.sidebarDivider}` : "none",
                  }}>
                    {item.group}
                  </div>
                )}
                <Link
                  href={item.href}
                  onClick={() => onItemClick?.()}
                  aria-current={isItemActive ? "page" : undefined}
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    gap:            8,
                    padding:        "7px 16px 7px 44px",
                    textDecoration: "none",
                    transition:     "background 80ms",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = ST.sidebarBgHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ color: ST.textDim, flexShrink: 0, display: "flex", alignItems: "center" }}>
                    <Icon icon={item.icon} size={14} color={ST.textDim} />
                  </span>
                  <span style={{
                    fontFamily: T.fontUI, fontSize: 12, color: ST.textMuted,
                    flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {item.label}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SIDEBAR COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function AppSidebar({ mobileOpen, onMobileClose }: AppSidebarProps) {
  const { user, token, logout, isAuthenticated } = useAuth();
  const { hasAccess: hasPlanAccess } = usePlanGate();
  const router   = useRouter();
  const pathname = usePathname() ?? "";

  // Expanded / collapsed state — persist to localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("ordr_sidebar_expanded");
    return stored === null ? true : stored === "true";
  });

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev;
      localStorage.setItem("ordr_sidebar_expanded", String(next));
      return next;
    });
  }, []);

  // Governance mode
  const [governanceMode, setGovernanceMode] = useState<"solo" | "team">("solo");
  useEffect(() => {
    if (!token) return;
    dashboardFetch("/v1/company/settings", token)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.governance_mode) setGovernanceMode(data.governance_mode as "solo" | "team"); })
      .catch(() => {});
  }, [token]);

  // Live status
  const [liveStatus, setLiveStatus] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => {
    const check = () => {
      fetch(`${API_BASE}/health`, { method: "GET", signal: AbortSignal.timeout(5000) })
        .then(r => setLiveStatus(r.ok ? "online" : "offline"))
        .catch(() => setLiveStatus("offline"));
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcut: [ to toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "[" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleExpanded();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleExpanded]);

  // Expanded sub-items state
  const [expandedOpen, setExpandedOpen] = useState<string | null>(null);
  const handleToggleExpanded = useCallback((label: string) => {
    setExpandedOpen(prev => prev === label ? null : label);
  }, []);

  // Don't render on auth pages
  if (!isAuthenticated || !user) return null;
  if (pathname.startsWith("/auth") || pathname === "/api-health") return null;

  const role   = user.roles?.[0] ?? "\u2014";
  const name   = user.full_name ?? user.email;
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const visibleNav = NAV
    .filter(sec => {
      if (sec.superuserOnly && !user.is_superuser) return false;
      if (sec.teamOnly && governanceMode !== "team") return false;
      if (sec.minTier && !hasPlanAccess(sec.minTier)) return false;
      return true;
    })
    .map(sec => ({
      ...sec,
      items: sec.items.filter(item => !item.minTier || hasPlanAccess(item.minTier)),
    }));

  const width = isExpanded ? ST.expanded : ST.collapsed;

  return (
    <>
      {/* Inject keyframe animation */}
      <style>{`
        @keyframes sidebarPulse {
          0%, 100% { box-shadow: 0 0 8px var(--accent-blue-dim, rgba(28,98,242,0.25)); }
          50%      { box-shadow: 0 0 14px var(--accent-blue-dim, rgba(28,98,242,0.4)); }
        }
      `}</style>

      <nav
        role="navigation"
        aria-label="Main navigation"
        className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}
        style={{
          width,
          minWidth:      width,
          height:        "100vh",
          display:       "flex",
          flexDirection: "column",
          background:    ST.sidebarBg,
          borderRight:   `1px solid ${ST.sidebarBorder}`,
          transition:    "width 200ms cubic-bezier(0.4, 0, 0.2, 1), min-width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
          overflow:      "hidden",
          position:      "relative",
          zIndex:        100,
          flexShrink:    0,
          backgroundImage: "none",
        }}
      >
        {/* -- Brand mark -------------------------------------------------- */}
        <div
          style={{
            height:         56,
            display:        "flex",
            alignItems:     "center",
            justifyContent: isExpanded ? "space-between" : "center",
            padding:        isExpanded ? "0 16px" : "0",
            borderBottom:   `1px solid ${ST.sidebarDivider}`,
            flexShrink:     0,
          }}
        >
          {isExpanded ? (
            <>
              <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: ST.accent,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 2px 8px ${ST.accentGlow}`,
                }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 800, color: ST.white, letterSpacing: "0.04em" }}>
                    O
                  </span>
                </div>
                <span style={{
                  fontFamily:    T.fontMono,
                  fontSize:      14,
                  fontWeight:    700,
                  letterSpacing: "0.18em",
                  color:         ST.textBright,
                }}>
                  ORDR
                </span>
                <span style={{
                  fontFamily:    T.fontMono,
                  fontSize: 12,
                  fontWeight:    500,
                  letterSpacing: "0.08em",
                  color:         ST.textDim,
                  marginLeft:    -4,
                }}>
                  TERMINAL
                </span>
              </Link>
              <button
                onClick={toggleExpanded}
                title="Collapse sidebar  [ "
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: ST.textDim, display: "flex", alignItems: "center",
                  padding: 4, borderRadius: 4, transition: "color 100ms",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = ST.textMuted; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = ST.textDim; }}
              >
                <Icon icon={PanelLeftClose} size={16} color="currentColor" />
              </button>
            </>
          ) : (
            <button
              onClick={toggleExpanded}
              title="Expand sidebar  [ "
              style={{
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, borderRadius: 6,
                color: ST.textBright,
                background: ST.accent,
                boxShadow: `0 2px 8px ${ST.accentGlow}`,
                transition: "transform 100ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.05)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
            >
              <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 800, color: ST.white }}>O</span>
            </button>
          )}
        </div>

        {/* -- Navigation sections ----------------------------------------- */}
        <div style={{
          flex:       1,
          overflowY:  "auto",
          overflowX:  "hidden",
          paddingTop:  8,
          paddingBottom: 8,
          // Custom scrollbar for dark bg
          scrollbarWidth: "thin",
          scrollbarColor: `${ST.sidebarDivider} transparent`,
        }}>
          {visibleNav.map(sec => {
            const isActive = sec.prefixes.some(
              p => pathname === p || pathname.startsWith(p + "/")
            );
            return (
              <SectionRow
                key={sec.label}
                sec={sec}
                isActive={isActive}
                isExpanded={isExpanded}
                expandedOpen={expandedOpen}
                onToggleExpanded={handleToggleExpanded}
                pathname={pathname}
                onItemClick={onMobileClose}
              />
            );
          })}
        </div>

        {/* -- Divider ----------------------------------------------------- */}
        <div style={{ height: 1, background: ST.sidebarDivider, flexShrink: 0 }} />

        {/* -- Live status ------------------------------------------------- */}
        <div style={{
          height:         32,
          display:        "flex",
          alignItems:     "center",
          justifyContent: isExpanded ? "flex-start" : "center",
          padding:        isExpanded ? "0 16px" : "0",
          gap:            8,
          flexShrink:     0,
          borderBottom:   `1px solid ${ST.sidebarDivider}`,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: liveStatus === "online" ? ST.green : liveStatus === "offline" ? ST.red : ST.amber,
            boxShadow: liveStatus === "online" ? `0 0 6px ${ST.green}` : "none",
          }} />
          {isExpanded && (
            <span style={{
              fontFamily:    T.fontMono,
              fontSize: 12,
              fontWeight:    600,
              letterSpacing: "0.1em",
              color:         liveStatus === "online" ? ST.green : liveStatus === "offline" ? ST.red : ST.amber,
            }}>
              {liveStatus === "online" ? "SYSTEM ONLINE" : liveStatus === "offline" ? "OFFLINE" : "CHECKING\u2026"}
            </span>
          )}
        </div>

        {/* -- User identity ----------------------------------------------- */}
        <div style={{
          padding:     isExpanded ? "12px 16px" : "12px 0",
          display:     "flex",
          flexDirection: isExpanded ? "row" : "column",
          alignItems:  "center",
          gap:         isExpanded ? 10 : 6,
          flexShrink:  0,
        }}>
          {/* Avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: `linear-gradient(135deg, ${ST.sidebarBgHover} 0%, ${ST.sidebarBorder} 100%)`,
            border: `1px solid ${ST.sidebarBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: T.fontMono, fontSize: 12, fontWeight: 700,
            color: ST.textMuted, letterSpacing: "0.04em",
          }}>
            {initials}
          </div>

          {isExpanded && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: T.fontUI, fontSize: 12, fontWeight: 600, color: ST.textBright,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span style={{
                  fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  color: roleColor(role),
                  background: `color-mix(in srgb, ${roleColor(role)} 15%, transparent)`,
                  padding: "1px 5px", borderRadius: 2, textTransform: "uppercase",
                }}>
                  {role}
                </span>
              </div>
            </div>
          )}

          {/* Sign out */}
          {isExpanded ? (
            <button
              onClick={() => { logout(); router.push("/auth/login"); }}
              title="Sign out"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: ST.textDim, display: "flex", alignItems: "center",
                padding: 4, borderRadius: 4, transition: "color 100ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = ST.red; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = ST.textDim; }}
            >
              <Icon icon={LogOut} size={15} color="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => { logout(); router.push("/auth/login"); }}
              title="Sign out"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: ST.textDim, display: "flex", alignItems: "center",
                padding: 2, transition: "color 100ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = ST.red; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = ST.textDim; }}
            >
              <Icon icon={LogOut} size={15} color="currentColor" />
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
