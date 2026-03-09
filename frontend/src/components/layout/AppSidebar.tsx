"use client";

/**
 * AppSidebar.tsx — Institutional Left-Rail Navigation
 *
 * A Bloomberg-grade sidebar that replaces the top bar.
 * Collapsed (64px): icon rail with flyout panels on hover.
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

// ── Sidebar design tokens ────────────────────────────────────────────────────
const T = {
  fontUI:    "'IBM Plex Sans', var(--font-terminal, sans-serif)",
  fontMono:  "'IBM Plex Mono', var(--font-terminal-mono, monospace)",
  // Sidebar chrome — dark instrument panel
  sidebarBg:      "#0B1120",
  sidebarBgHover: "#111B2E",
  sidebarBorder:  "#1A2744",
  sidebarDivider: "#152036",
  // Text on dark
  textBright: "#E8ECF4",
  textMuted:  "#7B8BA5",
  textDim:    "#4A5A74",
  // Accents
  accent:     "#1C62F2",
  accentDim:  "rgba(28, 98, 242, 0.12)",
  accentGlow: "rgba(28, 98, 242, 0.25)",
  amber:      "#D97706",
  green:      "#059669",
  red:        "#DC2626",
  // Flyout (light)
  flyoutBg:      "#FFFFFF",
  flyoutBorder:  "#E2E8F0",
  flyoutText:    "#0F172A",
  flyoutMuted:   "#64748B",
  flyoutHover:   "#F1F5F9",
  // Dimensions
  collapsed: 64,
  expanded:  260,
} as const;

// ── SVG icon library ─────────────────────────────────────────────────────────
// 18×18 for section icons, 14×14 for sub-items
function icon(d: string, size = 18) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const Ic = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  ),
  table: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/>
    </svg>
  ),
  policy: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>
    </svg>
  ),
  execution: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  bar_chart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  reports: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
    </svg>
  ),
  microscope: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>
    </svg>
  ),
  target: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  lightning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  scales: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="3" x2="12" y2="21"/><line x1="4" y1="7" x2="20" y2="7"/>
      <path d="M4 7l2 8h0a4 4 0 0 0 4 0h0l2-8"/><path d="M12 7l2 8h0a4 4 0 0 0 4 0h0l2-8"/>
    </svg>
  ),
  governance: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  help: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5"/>
    </svg>
  ),
  // Sub-item icons (14px)
  pen:      icon("M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z", 14),
  upload:   icon("M16 16l-4-4-4 4M12 12v9M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3", 14),
  db: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  shield:   icon("M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z", 14),
  ai: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
    </svg>
  ),
  download: icon("M8 17l4 4 4-4M12 12v9M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3", 14),
  clock:    icon("M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z", 14),
  book:     icon("M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z", 14),
  check:    icon("M20 6L9 17l-5-5", 14),
  question: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5"/>
    </svg>
  ),
  terminal: icon("M4 17l6-6-6-6M12 19h8", 14),
  key:      icon("M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4", 14),
  user: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  ticket:  icon("M15 5v2M15 11v2M15 17v2M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z", 14),
  support: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/>
    </svg>
  ),
  plug: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18"/><path d="M7 17H4a2 2 0 0 1-2-2v-4l3-3"/>
      <path d="M17 7h3a2 2 0 0 1 2 2v4l-3 3"/>
    </svg>
  ),
  monitor: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      <polyline points="6 10 9 7 12 10 15 7 18 10"/>
    </svg>
  ),
  cpu:      icon("M18 12h2M4 12h2M12 4V2M12 22v-2M7.8 7.8L6.4 6.4M17.6 6.4l-1.4 1.4M7.8 16.2l-1.4 1.4M17.6 17.6l-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z", 14),
  // Sidebar-specific
  collapse: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
    </svg>
  ),
  expand: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
    </svg>
  ),
  logout: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  chevron: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
} as const;

// ── Nav data types ───────────────────────────────────────────────────────────
interface NavItem {
  label: string;
  desc:  string;
  href:  string;
  icon:  React.ReactNode;
  badge?: string;
  badgeColor?: string;
  minTier?: PlanTier;
  group?: string;
}

interface NavSection {
  label:     string;
  href:      string;
  icon:      React.ReactNode;
  prefixes:  string[];
  header:    string;
  items:     NavItem[];
  teamOnly?: boolean;
  minTier?:  PlanTier;
  superuserOnly?: boolean;
}

// ── Navigation config ────────────────────────────────────────────────────────
const S_AMBER  = "var(--accent-amber)";
const S_CYAN   = "var(--accent-cyan)";
const S_GREEN  = "var(--status-pass,#22c55e)";
const S_RED    = "var(--accent-red,#f87171)";

const NAV: NavSection[] = [
  {
    label: "Dashboard", href: "/dashboard", icon: Ic.dashboard,
    prefixes: ["/dashboard", "/portfolio-risk", "/polisophic", "/portfolio-multi"],
    header: "Overview",
    items: [
      { label: "Summary",             desc: "KPIs, P&L snapshot, FX exposure",               href: "/dashboard",        icon: Ic.dashboard },
      { label: "Portfolio Risk",       desc: "R1–R8 risk taxonomy decomposition",              href: "/portfolio-risk",   icon: Ic.bar_chart, badge: "RISK",  badgeColor: S_AMBER, minTier: "enterprise" as PlanTier },
      { label: "Polisophic",           desc: "Political & macro risk intelligence",             href: "/polisophic",       icon: Ic.governance, badge: "INTEL", badgeColor: S_AMBER, minTier: "enterprise" as PlanTier },
      { label: "Multi-Pair Portfolio", desc: "26-pair exposure matrix",                        href: "/portfolio-multi",  icon: Ic.bar_chart, badge: "MULTI", badgeColor: S_CYAN, minTier: "enterprise" as PlanTier },
    ],
  },
  {
    label: "Hedge Desk", href: "/hedge-desk", icon: Ic.execution,
    prefixes: ["/hedge-desk", "/hedge-monitor", "/trade-history", "/position-desk", "/input", "/upload-csv", "/policy-desk", "/policy-dashboard", "/policies", "/calculate", "/results"],
    header: "HEDGE DESK",
    items: [
      // ── PRIMARY OPERATING LANE
      { label: "Overview",       desc: "Start, resume, or review hedge runs",       href: "/hedge-desk",       icon: Ic.dashboard, badge: "HOME",    badgeColor: S_CYAN,  group: "OPERATE" },
      { label: "Active Run",     desc: "Guided hedge pipeline",                     href: "/hedge-desk?mode=run", icon: Ic.execution, badge: "PIPELINE", badgeColor: S_GREEN, group: "OPERATE" },
      { label: "Monitor",        desc: "Live MTM P&L, drift, roll schedule",        href: "/hedge-monitor",    icon: Ic.bar_chart, badge: "LIVE",    badgeColor: S_GREEN, group: "OPERATE" },
      { label: "History",        desc: "Proposals, fills, slippage audit",           href: "/trade-history",    icon: Ic.clock,     badge: "LOG",     badgeColor: S_CYAN,  group: "OPERATE" },
      // ── REFERENCE
      { label: "Policy Dashboard", desc: "Impact analysis & policy comparison",        href: "/policy-dashboard", icon: Ic.bar_chart,                                        group: "REFERENCE" },
      { label: "Policy Library", desc: "Institutional preset policies",              href: "/policies",         icon: Ic.book,                                             group: "REFERENCE" },
      { label: "Position Desk",  desc: "Position lifecycle management",              href: "/position-desk",    icon: Ic.table,                                            group: "REFERENCE" },
    ],
  },
  {
    label: "Markets", href: "/fx-market", icon: Ic.bar_chart,
    prefixes: ["/fx-market"],
    header: "Market Data",
    items: [
      { label: "FX Rates", desc: "Spot, forwards, vol surface, carry", href: "/fx-market", icon: Ic.bar_chart },
    ],
  },
  {
    label: "Reports", href: "/reports", icon: Ic.reports,
    prefixes: ["/reports"],
    header: "Report Studio",
    items: [
      { label: "Report Studio",     desc: "30 presets, AI composer, export",   href: "/reports",              icon: Ic.reports,  badge: "STUDIO", badgeColor: S_CYAN },
      { label: "Preset Library",    desc: "Board/treasury/risk/audit presets", href: "/reports?view=library", icon: Ic.book,     badge: "35",     badgeColor: S_CYAN },
      { label: "AI Report Builder", desc: "Goal-driven AI composer",           href: "/reports?view=builder", icon: Ic.ai,       badge: "AI",     badgeColor: S_AMBER },
      { label: "Saved Reports",     desc: "Versioned and scheduled reports",   href: "/reports?view=saved",   icon: Ic.shield,   badge: "SAVED",  badgeColor: S_CYAN },
      { label: "Run Results",       desc: "Hedge schedule with rationale",     href: "/results",              icon: Ic.bar_chart },
      { label: "Committee Pack",    desc: "IFRS 9 hedge effectiveness pack",   href: "/committee-pack",       icon: Ic.download, badge: "PDF",    badgeColor: S_AMBER },
    ],
  },
  {
    label: "Connectors", href: "/database-connection", icon: Ic.plug,
    prefixes: ["/database-connection", "/erp-integration", "/accounting-connection", "/connectors", "/import-history"],
    header: "Data Connectors",
    minTier: "professional" as PlanTier,
    items: [
      { label: "Connect Database", desc: "SQL pull — Oracle, Postgres, MySQL",  href: "/database-connection",   icon: Ic.db,        badge: "SQL",   badgeColor: S_CYAN },
      { label: "ERP Integration",  desc: "SAP, Oracle, NetSuite connectors",   href: "/erp-integration",       icon: Ic.lightning,  badge: "ERP",   badgeColor: S_AMBER },
      { label: "Accounting",       desc: "QuickBooks, Xero, Sage import",      href: "/accounting-connection", icon: Ic.reports },
      { label: "Connectors Hub",   desc: "Unified data pipeline status",       href: "/connectors",            icon: Ic.plug,       badge: "HUB",   badgeColor: S_CYAN },
      { label: "Import History",   desc: "Audit log of all imports",           href: "/import-history",        icon: Ic.clock,      badge: "AUDIT", badgeColor: S_CYAN },
    ],
  },
  {
    label: "Audit Lab", href: "/audit-lab", icon: Ic.microscope,
    prefixes: ["/audit-lab"],
    header: "05 · AUDIT LAB",
    items: [
      { label: "Audit Lab",      desc: "Quantify markup, fees, unhedged variance", href: "/audit-lab",        icon: Ic.microscope, badge: "NEW", badgeColor: S_CYAN },
      { label: "Upload Dataset", desc: "CSV upload with period selector",          href: "/audit-lab/upload", icon: Ic.upload },
    ],
  },
  {
    label: "Decisions", href: "/decision-desk", icon: Ic.target,
    prefixes: ["/decision-desk"],
    header: "06 · DECISION DESK",
    items: [
      { label: "Decision Desk", desc: "Ranked hedge actions + IBKR packets", href: "/decision-desk", icon: Ic.target, badge: "NEW", badgeColor: S_AMBER },
    ],
  },
  {
    label: "Effectiveness", href: "/hedge-effectiveness", icon: Ic.scales,
    prefixes: ["/hedge-effectiveness"],
    header: "07 · HEDGE EFFECTIVENESS",
    items: [
      { label: "Effectiveness Testing", desc: "IFRS 9 / ASC 815 compliance",      href: "/hedge-effectiveness",     icon: Ic.scales,  badge: "IFRS 9", badgeColor: S_GREEN },
      { label: "Upload Dataset",        desc: "CSV fair value change data",        href: "/hedge-effectiveness?tab=upload", icon: Ic.upload },
      { label: "Assessment History",     desc: "Past effectiveness test runs",      href: "/hedge-effectiveness?tab=runs",   icon: Ic.clock,   badge: "WORM",   badgeColor: S_CYAN },
    ],
  },
  {
    label: "Research", href: "/sandbox", icon: Ic.lightning, minTier: "enterprise" as PlanTier,
    prefixes: ["/sandbox", "/scenario-studio", "/methodology"],
    header: "Research & Simulation",
    items: [
      { label: "Simulation Lab",  desc: "Stress testing, crisis library, what-if", href: "/sandbox",         icon: Ic.terminal,  badge: "LAB",     badgeColor: S_AMBER },
      { label: "Scenario Studio", desc: "Monte Carlo stress-test simulations",     href: "/scenario-studio", icon: Ic.lightning, badge: "LIVE",    badgeColor: S_GREEN },
      { label: "Methodology",     desc: "Calculation whitepaper & architecture",   href: "/methodology",     icon: Ic.book,      badge: "REF",     badgeColor: S_CYAN },
    ],
  },
  {
    label: "Governance", href: "/audit-trail", icon: Ic.governance,
    teamOnly: true, minTier: "enterprise" as PlanTier,
    prefixes: ["/hedgewiki", "/hedges", "/audit-trail", "/run-viewer", "/lineage", "/committee-pack", "/staging", "/ledger"],
    header: "Compliance & Audit",
    items: [
      { label: "Staging Queue",    desc: "4-eyes maker/checker review",       href: "/staging",     icon: Ic.db,       badge: "QUEUE",  badgeColor: S_CYAN },
      { label: "Ledger",           desc: "Immutable settled ledger records",  href: "/ledger",      icon: Ic.check,    badge: "LEDGER", badgeColor: S_GREEN },
      { label: "Audit Trail",      desc: "Hash-chain integrity log",          href: "/audit-trail", icon: Ic.check,    badge: "AUDIT",  badgeColor: S_AMBER },
      { label: "Run Viewer",       desc: "TraceLite + SHA-256 RunEnvelope",   href: "/run-viewer",  icon: Ic.terminal, badge: "TRACE",  badgeColor: "#93C5FD" },
      { label: "Position Lineage", desc: "5-level provenance graph",          href: "/lineage",     icon: Ic.plug,     badge: "GRAPH",  badgeColor: "#818cf8" },
      { label: "Hedge Wiki",       desc: "FX instruments, ISDA, IFRS 9",     href: "/hedgewiki",   icon: Ic.book },
    ],
  },
  {
    label: "Settings", href: "/settings", icon: Ic.settings,
    prefixes: ["/settings"],
    header: "Configuration",
    items: [
      { label: "General",            desc: "Organisation, currency, timezone",    href: "/settings",                   icon: Ic.user },
      { label: "Policy Limits",      desc: "Hedge ratios, trade size limits",     href: "/settings?tab=policy_limits", icon: Ic.shield,    badge: "RISK", badgeColor: S_AMBER },
      { label: "Execution",          desc: "Default product, stress sigma",       href: "/settings?tab=execution",     icon: Ic.lightning, badge: "EXEC", badgeColor: S_CYAN },
      { label: "API & Config",       desc: "API keys, backend URL, IBKR",        href: "/settings?tab=api_config",    icon: Ic.key,       badge: "KEYS", badgeColor: S_RED },
      { label: "Notifications",      desc: "Alert triggers, webhooks",            href: "/settings?tab=notifications", icon: Ic.clock },
      { label: "Security",           desc: "TOTP MFA enrolment",                  href: "/settings?tab=security",      icon: Ic.shield,    badge: "MFA",  badgeColor: S_CYAN },
      { label: "Users & Roles",      desc: "Team members, RBAC assignments",      href: "/settings?tab=users_roles",   icon: Ic.user,      badge: "RBAC", badgeColor: "#3B82F6", minTier: "enterprise" as PlanTier },
      { label: "API Key Management", desc: "Generate and revoke API keys",        href: "/settings?tab=api_key_mgmt",  icon: Ic.key,       badge: "MGMT", badgeColor: S_AMBER, minTier: "professional" as PlanTier },
      { label: "Organisation",       desc: "Company, branches, governance",       href: "/settings?tab=organisation",  icon: Ic.db, minTier: "enterprise" as PlanTier },
      { label: "Audit Trail",        desc: "Immutable event log",                 href: "/settings?tab=audit_trail",   icon: Ic.check,     badge: "WORM", badgeColor: "#3B82F6", minTier: "enterprise" as PlanTier },
    ],
  },
  {
    label: "Admin", href: "/admin-monitor", icon: Ic.monitor,
    prefixes: ["/admin-monitor", "/devops"],
    header: "Platform Operations",
    superuserOnly: true,
    items: [
      { label: "Operations Center", desc: "System health, services, DB stats",   href: "/admin-monitor",  icon: Ic.monitor, badge: "NOC",  badgeColor: S_RED },
      { label: "DevOps Console",    desc: "AI memory, risks, freeze, decisions", href: "/devops",         icon: Ic.cpu,     badge: "OS",   badgeColor: S_CYAN },
    ],
  },
  {
    label: "Help", href: "/help", icon: Ic.help,
    prefixes: ["/help"],
    header: "Support",
    items: [
      { label: "Documentation",  desc: "Knowledge base — L1 to L5 depth",  href: "/help",          icon: Ic.book },
      { label: "FAQ",            desc: "Frequently asked questions",         href: "/help/faq",      icon: Ic.question },
      { label: "Support Center", desc: "Diagnostics, tickets, knowledge",   href: "/help/support",  icon: Ic.support, badge: "NEW", badgeColor: S_CYAN },
      { label: "Contact",        desc: "Open a ticket with diagnostics",    href: "/help/contact",  icon: Ic.ticket },
    ],
  },
];

// ── Role badge colour ────────────────────────────────────────────────────────
function roleColor(role: string): string {
  if (["admin", "cfo", "ceo"].includes(role))            return T.amber;
  if (["head_of_risk", "branch_manager"].includes(role)) return T.accent;
  if (["auditor"].includes(role))                        return "#93C5FD";
  return T.textMuted;
}

// ══════════════════════════════════════════════════════════════════════════════
// FLYOUT PANEL — shows when hovering a section in collapsed mode
// ══════════════════════════════════════════════════════════════════════════════

interface FlyoutProps {
  sec: NavSection;
  rect: DOMRect | null;
}

function Flyout({ sec, rect }: FlyoutProps) {
  if (!rect) return null;
  const top = rect.top;
  const maxH = typeof window !== "undefined" ? window.innerHeight - top - 16 : 600;

  return (
    <div
      style={{
        position:     "fixed",
        left:         T.collapsed + 6,
        top,
        zIndex:       9999,
        minWidth:     280,
        maxWidth:     340,
        maxHeight:    maxH,
        overflowY:    "auto",
        background:   T.flyoutBg,
        border:       `1px solid ${T.flyoutBorder}`,
        borderLeft:   `3px solid ${T.accent}`,
        boxShadow:    "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
        borderRadius: "0 6px 6px 0",
        animation:    "sidebarFlyIn 120ms ease-out",
      }}
    >
      {/* Header */}
      <div style={{
        padding:       "10px 16px 8px",
        fontFamily:    T.fontMono,
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: "0.14em",
        color:         T.flyoutMuted,
        textTransform: "uppercase",
        borderBottom:  `1px solid ${T.flyoutBorder}`,
      }}>
        {sec.header}
      </div>
      {/* Items */}
      {sec.items.map((item, idx) => {
        const prevGroup = idx > 0 ? sec.items[idx - 1].group : undefined;
        const showGroupDivider = item.group && item.group !== prevGroup;
        return (
          <div key={item.href + item.label}>
            {showGroupDivider && (
              <div style={{
                padding: "6px 16px 3px",
                fontFamily: T.fontMono,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: T.flyoutMuted,
                borderTop: idx > 0 ? `1px solid ${T.flyoutBorder}` : "none",
                opacity: 0.7,
              }}>
                {item.group}
              </div>
            )}
            <Link
              href={item.href}
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            10,
                padding:        "9px 16px",
                textDecoration: "none",
                borderBottom:   `1px solid ${T.flyoutBorder}`,
                transition:     "background 80ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.flyoutHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ color: T.flyoutMuted, flexShrink: 0, display: "flex", alignItems: "center" }}>
                {item.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: T.fontUI, fontSize: 13, fontWeight: 500, color: T.flyoutText }}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <span style={{
                      fontFamily: T.fontMono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
                      color: item.badgeColor ?? T.flyoutMuted,
                      background: `color-mix(in srgb, ${item.badgeColor ?? T.flyoutMuted} 10%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${item.badgeColor ?? T.flyoutMuted} 20%, transparent)`,
                      padding: "1px 5px", borderRadius: 2,
                    }}>
                      {item.badge}
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: T.fontUI, fontSize: 11, color: T.flyoutMuted, display: "block", marginTop: 1, lineHeight: 1.35 }}>
                  {item.desc}
                </span>
              </span>
              <span style={{ color: T.flyoutMuted, opacity: 0.4, display: "flex", alignItems: "center" }}>
                {Ic.chevron}
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SIDEBAR SECTION — single nav section row
// ══════════════════════════════════════════════════════════════════════════════

interface SectionRowProps {
  sec:        NavSection;
  isActive:   boolean;
  isExpanded: boolean;
  isHovered:  boolean;
  onHover:    (label: string, rect: DOMRect) => void;
  onLeave:    () => void;
  expandedOpen: string | null;
  onToggleExpanded: (label: string) => void;
}

function SectionRow({ sec, isActive, isExpanded, isHovered, onHover, onLeave, expandedOpen, onToggleExpanded }: SectionRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const isSubOpen = expandedOpen === sec.label;

  const handleMouseEnter = useCallback(() => {
    if (!isExpanded && ref.current) {
      onHover(sec.label, ref.current.getBoundingClientRect());
    }
  }, [isExpanded, sec.label, onHover]);

  return (
    <div ref={ref} onMouseEnter={handleMouseEnter} onMouseLeave={onLeave}>
      {/* Section button */}
      <div
        onClick={() => {
          if (isExpanded) {
            // In expanded mode, toggle sub-items or navigate if only 1 item
            if (sec.items.length <= 1) {
              router.push(sec.href);
            } else {
              onToggleExpanded(sec.label);
            }
          } else {
            router.push(sec.href);
          }
        }}
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
          background:   isActive ? T.accentDim : isHovered ? T.sidebarBgHover : "transparent",
        }}
        onMouseEnter={e => {
          if (!isActive) (e.currentTarget as HTMLElement).style.background = T.sidebarBgHover;
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
            background:   T.accent,
            borderRadius: "0 2px 2px 0",
            boxShadow:    `0 0 8px ${T.accentGlow}`,
          }} />
        )}

        {/* Icon */}
        <span style={{
          display:    "flex",
          alignItems: "center",
          color:      isActive ? T.accent : T.textMuted,
          transition: "color 100ms",
          flexShrink: 0,
          width:      isExpanded ? "auto" : T.collapsed,
          justifyContent: isExpanded ? "flex-start" : "center",
        }}>
          {sec.icon}
        </span>

        {/* Label (expanded only) */}
        {isExpanded && (
          <>
            <span style={{
              fontFamily:    T.fontMono,
              fontSize:      11,
              fontWeight:    isActive ? 600 : 500,
              letterSpacing: "0.06em",
              color:         isActive ? T.textBright : T.textMuted,
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
                color:      T.textDim,
                display:    "flex",
                alignItems: "center",
                transition: "transform 150ms",
                transform:  isSubOpen ? "rotate(90deg)" : "rotate(0)",
              }}>
                {Ic.chevron}
              </span>
            )}
          </>
        )}
      </div>

      {/* Expanded sub-items */}
      {isExpanded && isSubOpen && (
        <div style={{
          overflow: "hidden",
          borderTop: `1px solid ${T.sidebarDivider}`,
          background: "rgba(0,0,0,0.15)",
        }}>
          {sec.items.map((item, idx) => {
            const prevGroup = idx > 0 ? sec.items[idx - 1].group : undefined;
            const showGroupDivider = item.group && item.group !== prevGroup;
            return (
              <div key={item.href + item.label}>
                {showGroupDivider && (
                  <div style={{
                    padding: "6px 16px 2px 44px",
                    fontFamily: T.fontMono,
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    color: T.textDim,
                    borderTop: idx > 0 ? `1px solid ${T.sidebarDivider}` : "none",
                  }}>
                    {item.group}
                  </div>
                )}
                <Link
                  href={item.href}
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    gap:            8,
                    padding:        "7px 16px 7px 44px",
                    textDecoration: "none",
                    transition:     "background 80ms",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.sidebarBgHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ color: T.textDim, flexShrink: 0, display: "flex", alignItems: "center" }}>
                    {item.icon}
                  </span>
                  <span style={{
                    fontFamily: T.fontUI, fontSize: 12, color: T.textMuted,
                    flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <span style={{
                      fontFamily: T.fontMono, fontSize: 8, fontWeight: 700, letterSpacing: "0.06em",
                      color: item.badgeColor ?? T.textDim,
                      background: `color-mix(in srgb, ${item.badgeColor ?? T.textDim} 15%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${item.badgeColor ?? T.textDim} 25%, transparent)`,
                      padding: "1px 4px", borderRadius: 2,
                    }}>
                      {item.badge}
                    </span>
                  )}
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

export default function AppSidebar() {
  const { user, token, logout, isAuthenticated } = useAuth();
  const { hasAccess: hasPlanAccess } = usePlanGate();
  const router   = useRouter();
  const pathname = usePathname() ?? "";

  // Expanded / collapsed state — persist to localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ordr_sidebar_expanded") === "true";
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

  // Flyout state (collapsed mode hover)
  const [flyout, setFlyout] = useState<{ label: string; rect: DOMRect } | null>(null);
  const flyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSectionHover = useCallback((label: string, rect: DOMRect) => {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current);
    setFlyout({ label, rect });
  }, []);

  const handleSectionLeave = useCallback(() => {
    flyoutTimer.current = setTimeout(() => setFlyout(null), 200);
  }, []);

  // Keep flyout open when hovering the flyout itself
  const handleFlyoutEnter = useCallback(() => {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current);
  }, []);
  const handleFlyoutLeave = useCallback(() => {
    flyoutTimer.current = setTimeout(() => setFlyout(null), 150);
  }, []);

  // Expanded sub-items state
  const [expandedOpen, setExpandedOpen] = useState<string | null>(null);
  const handleToggleExpanded = useCallback((label: string) => {
    setExpandedOpen(prev => prev === label ? null : label);
  }, []);

  // Don't render on auth pages
  if (!isAuthenticated || !user) return null;
  if (pathname.startsWith("/auth") || pathname === "/api-health") return null;

  const role   = user.roles?.[0] ?? "—";
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

  const width = isExpanded ? T.expanded : T.collapsed;

  const flyoutSec = flyout ? visibleNav.find(s => s.label === flyout.label) : null;

  return (
    <>
      {/* Inject keyframe animation */}
      <style>{`
        @keyframes sidebarFlyIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes sidebarPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(28,98,242,0.25); }
          50%      { box-shadow: 0 0 14px rgba(28,98,242,0.4); }
        }
      `}</style>

      <nav
        style={{
          width,
          minWidth:      width,
          height:        "100vh",
          display:       "flex",
          flexDirection: "column",
          background:    T.sidebarBg,
          borderRight:   `1px solid ${T.sidebarBorder}`,
          transition:    "width 200ms cubic-bezier(0.4, 0, 0.2, 1), min-width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
          overflow:      "hidden",
          position:      "relative",
          zIndex:        100,
          flexShrink:    0,
          // Subtle noise texture via repeating gradient
          backgroundImage: `
            radial-gradient(ellipse at 50% 0%, rgba(28,98,242,0.03) 0%, transparent 60%),
            linear-gradient(180deg, #0B1120 0%, #0D1528 100%)
          `,
        }}
      >
        {/* ── Brand mark ──────────────────────────────────────────────── */}
        <div
          style={{
            height:         56,
            display:        "flex",
            alignItems:     "center",
            justifyContent: isExpanded ? "space-between" : "center",
            padding:        isExpanded ? "0 16px" : "0",
            borderBottom:   `1px solid ${T.sidebarDivider}`,
            flexShrink:     0,
          }}
        >
          {isExpanded ? (
            <>
              <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: `linear-gradient(135deg, ${T.accent} 0%, #3B82F6 100%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 2px 8px ${T.accentGlow}`,
                }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: "0.04em" }}>
                    O
                  </span>
                </div>
                <span style={{
                  fontFamily:    T.fontMono,
                  fontSize:      14,
                  fontWeight:    700,
                  letterSpacing: "0.18em",
                  color:         T.textBright,
                }}>
                  ORDR
                </span>
                <span style={{
                  fontFamily:    T.fontMono,
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.08em",
                  color:         T.textDim,
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
                  color: T.textDim, display: "flex", alignItems: "center",
                  padding: 4, borderRadius: 4, transition: "color 100ms",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.textMuted; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.textDim; }}
              >
                {Ic.collapse}
              </button>
            </>
          ) : (
            <button
              onClick={toggleExpanded}
              title="Expand sidebar  [ "
              style={{
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, borderRadius: 6,
                color: T.textBright,
                backgroundImage: `linear-gradient(135deg, ${T.accent} 0%, #3B82F6 100%)`,
                boxShadow: `0 2px 8px ${T.accentGlow}`,
                transition: "transform 100ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.05)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
            >
              <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 800, color: "#fff" }}>O</span>
            </button>
          )}
        </div>

        {/* ── Navigation sections ─────────────────────────────────────── */}
        <div style={{
          flex:       1,
          overflowY:  "auto",
          overflowX:  "hidden",
          paddingTop:  8,
          paddingBottom: 8,
          // Custom scrollbar for dark bg
          scrollbarWidth: "thin",
          scrollbarColor: `${T.sidebarDivider} transparent`,
        }}>
          {visibleNav.map(sec => {
            const isActive = sec.prefixes.some(
              p => pathname === p || pathname.startsWith(p + "/")
            );
            const isHovered = flyout?.label === sec.label;
            return (
              <SectionRow
                key={sec.label}
                sec={sec}
                isActive={isActive}
                isExpanded={isExpanded}
                isHovered={isHovered}
                onHover={handleSectionHover}
                onLeave={handleSectionLeave}
                expandedOpen={expandedOpen}
                onToggleExpanded={handleToggleExpanded}
              />
            );
          })}
        </div>

        {/* ── Divider ─────────────────────────────────────────────────── */}
        <div style={{ height: 1, background: T.sidebarDivider, flexShrink: 0 }} />

        {/* ── Live status ─────────────────────────────────────────────── */}
        <div style={{
          height:         32,
          display:        "flex",
          alignItems:     "center",
          justifyContent: isExpanded ? "flex-start" : "center",
          padding:        isExpanded ? "0 16px" : "0",
          gap:            8,
          flexShrink:     0,
          borderBottom:   `1px solid ${T.sidebarDivider}`,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: liveStatus === "online" ? T.green : liveStatus === "offline" ? T.red : T.amber,
            boxShadow: liveStatus === "online" ? `0 0 6px ${T.green}` : "none",
          }} />
          {isExpanded && (
            <span style={{
              fontFamily:    T.fontMono,
              fontSize:      9,
              fontWeight:    600,
              letterSpacing: "0.1em",
              color:         liveStatus === "online" ? T.green : liveStatus === "offline" ? T.red : T.amber,
            }}>
              {liveStatus === "online" ? "SYSTEM ONLINE" : liveStatus === "offline" ? "OFFLINE" : "CHECKING…"}
            </span>
          )}
        </div>

        {/* ── User identity ───────────────────────────────────────────── */}
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
            background: `linear-gradient(135deg, ${T.sidebarBgHover} 0%, ${T.sidebarBorder} 100%)`,
            border: `1px solid ${T.sidebarBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: T.fontMono, fontSize: 11, fontWeight: 700,
            color: T.textMuted, letterSpacing: "0.04em",
          }}>
            {initials}
          </div>

          {isExpanded && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: T.fontUI, fontSize: 12, fontWeight: 600, color: T.textBright,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span style={{
                  fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
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
                color: T.textDim, display: "flex", alignItems: "center",
                padding: 4, borderRadius: 4, transition: "color 100ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.red; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.textDim; }}
            >
              {Ic.logout}
            </button>
          ) : (
            <button
              onClick={() => { logout(); router.push("/auth/login"); }}
              title="Sign out"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: T.textDim, display: "flex", alignItems: "center",
                padding: 2, transition: "color 100ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.red; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.textDim; }}
            >
              {Ic.logout}
            </button>
          )}
        </div>
      </nav>

      {/* ── Flyout panel (collapsed mode) ──────────────────────────── */}
      {!isExpanded && flyoutSec && (
        <div
          onMouseEnter={handleFlyoutEnter}
          onMouseLeave={handleFlyoutLeave}
        >
          <Flyout sec={flyoutSec} rect={flyout?.rect ?? null} />
        </div>
      )}
    </>
  );
}
