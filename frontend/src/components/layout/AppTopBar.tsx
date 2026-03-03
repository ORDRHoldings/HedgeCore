"use client";

/**
 * AppTopBar.tsx — Enterprise two-row navigation bar
 *
 * Row 1 (44px): Brand ⬡ ORDR + current-section pill | Identity + Sign Out
 * Row 2 (36px): Full menu bar — 7 sections, each with icon + label + dropdown
 *
 * Dropdowns open on hover and close when the mouse leaves the item.
 * Pure inline SVG icons — no external icon library required.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, type PlanTier } from "@/lib/authContext";
import { usePlanGate } from "@/lib/hooks/usePlanGate";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

// ── Design tokens ──────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  red:      "var(--accent-red,#f87171)",
  green:    "var(--status-pass,#22c55e)",
} as const;

// ── SVG icon library (24×24 viewBox) ──────────────────────────────────────────
const Ic: Record<string, React.ReactNode> = {
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  table: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/>
    </svg>
  ),
  policy: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>
    </svg>
  ),
  reports: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
    </svg>
  ),
  execution: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  governance: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  help: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5"/>
    </svg>
  ),
  // Sub-item icons
  pen: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  upload: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  ),
  db: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  shield: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/>
    </svg>
  ),
  ai: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
    </svg>
  ),
  bar_chart: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  download: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  ),
  lightning: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  clock: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  book: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  check: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  question: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5"/>
    </svg>
  ),
  terminal: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  ),
  key: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  ),
  user: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  ticket: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5v2M15 11v2M15 17v2M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z"/>
    </svg>
  ),
  support: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
    </svg>
  ),
  chevron_down: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  chevron_right: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  plug: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18"/><path d="M7 17H4a2 2 0 0 1-2-2v-4l3-3"/>
      <path d="M17 7h3a2 2 0 0 1 2 2v4l-3 3"/>
      <line x1="8" y1="2" x2="8" y2="5"/><line x1="16" y1="2" x2="16" y2="5"/>
      <line x1="8" y1="19" x2="8" y2="22"/><line x1="16" y1="19" x2="16" y2="22"/>
    </svg>
  ),
};

// ── Nav data types ─────────────────────────────────────────────────────────────
interface NavItem {
  label: string;
  desc:  string;
  href:  string;
  icon:  React.ReactNode;
  badge?: string;
  badgeColor?: string;
  minTier?: PlanTier; // minimum plan tier to show this item
}

interface NavSection {
  label:    string;
  href:     string;
  icon:     React.ReactNode;
  prefixes: string[];
  header:   string;   // dropdown header label
  items:    NavItem[];
  teamOnly?: boolean; // hide in solo governance mode
  minTier?: PlanTier; // minimum plan tier to show this section
}

// ── Navigation config ──────────────────────────────────────────────────────────
const NAV: NavSection[] = [
  {
    label: "Dashboard", href: "/dashboard", icon: Ic.dashboard,
    prefixes: ["/dashboard", "/portfolio-risk", "/polisophic", "/portfolio-multi"],
    header: "Overview",
    items: [
      { label: "Summary",               desc: "KPIs, P&L snapshot, FX exposure heat-map",                          href: "/dashboard",        icon: Ic.dashboard               },
      { label: "Portfolio Risk",         desc: "Delta, vega, correlation across positions — R1–R8 taxonomy",         href: "/portfolio-risk",   icon: Ic.bar_chart, badge: "RISK",  badgeColor: S.amber, minTier: "enterprise" as PlanTier },
      { label: "Polisophic",             desc: "Political & macro risk intelligence feed",                            href: "/polisophic",       icon: Ic.governance, badge: "INTEL", badgeColor: S.amber, minTier: "enterprise" as PlanTier },
      { label: "Multi-Pair Portfolio",   desc: "26-pair exposure matrix: G10, EM, NDF settlement breakdown",         href: "/portfolio-multi",  icon: Ic.bar_chart, badge: "MULTI", badgeColor: S.cyan, minTier: "enterprise" as PlanTier },
    ],
  },
  {
    label: "Position Desk", href: "/position-desk", icon: Ic.table,
    prefixes: ["/position-desk", "/input", "/upload-csv", "/import-history", "/database-connection", "/erp-integration", "/accounting-connection", "/connectors"],
    header: "01 · POSITIONS",
    items: [
      { label: "Position Desk",        desc: "Lifecycle control tower — status, policy, execute, reject", href: "/position-desk",          icon: Ic.table,     badge: "DESK",  badgeColor: S.cyan  },
      { label: "New Exposure",          desc: "Manual entry, CSV/XLSX import, connector hub",              href: "/input",                  icon: Ic.pen },
      { label: "Upload CSV / XLSX",    desc: "Bulk import — field schema, validation & audit",            href: "/upload-csv",             icon: Ic.upload,    badge: "BULK",  badgeColor: S.amber, minTier: "professional" as PlanTier },
      { label: "Connect Database",     desc: "SQL pull — Oracle, Postgres, MySQL",                        href: "/database-connection",    icon: Ic.db,        badge: "SQL",   badgeColor: S.cyan,  minTier: "professional" as PlanTier },
      { label: "ERP Integration",      desc: "SAP, Oracle, NetSuite, MS Dynamics connectors",             href: "/erp-integration",        icon: Ic.lightning, badge: "ERP",   badgeColor: S.amber, minTier: "professional" as PlanTier },
      { label: "Accounting Systems",   desc: "QuickBooks, Xero, Sage invoice import",                     href: "/accounting-connection",  icon: Ic.reports, minTier: "professional" as PlanTier },
      { label: "Connectors Hub",       desc: "Unified data pipeline status — all connectors",             href: "/connectors",             icon: Ic.plug,      badge: "HUB",   badgeColor: S.cyan,  minTier: "professional" as PlanTier },
      { label: "Import History",       desc: "Audit log of all file & connector imports",                 href: "/import-history",         icon: Ic.clock,     badge: "AUDIT", badgeColor: S.cyan,  minTier: "professional" as PlanTier },
    ],
  },
  {
    label: "Policy Engine", href: "/policies", icon: Ic.policy,
    prefixes: ["/policies", "/ai-policy-wizard", "/saved-policies", "/policy-desk"],
    header: "02 · POLICY",
    items: [
      { label: "Policy Desk",       desc: "Assign policies to positions — active, template, favorite, AI", href: "/policy-desk",       icon: Ic.table,  badge: "DESK",  badgeColor: S.cyan  },
      { label: "Policy Library",    desc: "Browse 60 institutional preset policies",        href: "/policies",          icon: Ic.book },
      { label: "AI Policy Wizard",  desc: "Generate tailored policy from your risk profile",href: "/ai-policy-wizard",  icon: Ic.ai,     badge: "AI",    badgeColor: S.amber, minTier: "professional" as PlanTier },
      { label: "Policy Vault",       desc: "User-scoped & branch-published policies",        href: "/saved-policies",    icon: Ic.shield, badge: "SAVED", badgeColor: S.cyan,  minTier: "professional" as PlanTier },
    ],
  },
  {
    label: "Hedge Execution", href: "/hedge-desk", icon: Ic.execution,
    prefixes: ["/hedge-desk", "/trade-history", "/hedge-monitor"],
    header: "03 · HEDGE",
    items: [
      { label: "Hedge Desk",    desc: "SELECT → CALCULATE → RISK → APPROVE → EXECUTE — full hedge pipeline",        href: "/hedge-desk",    icon: Ic.terminal,  badge: "DESK",  badgeColor: S.cyan  },
      { label: "Trade History", desc: "Proposals, fills, slippage, tamper-evident audit trail",                      href: "/trade-history", icon: Ic.clock,     badge: "LOG",   badgeColor: S.cyan, minTier: "professional" as PlanTier },
      { label: "Hedge Monitor", desc: "Live MTM P&L, hedge effectiveness, roll schedule, reg capital",               href: "/hedge-monitor", icon: Ic.bar_chart, badge: "LIVE",  badgeColor: S.green },
    ],
  },
  {
    label: "Markets", href: "/fx-market", icon: Ic.bar_chart,
    prefixes: ["/fx-market"],
    header: "Market Data",
    items: [
      { label: "FX Rates", desc: "Live spot, forwards, vol surface, carry analysis — position-aware", href: "/fx-market", icon: Ic.bar_chart },
    ],
  },
  {
    label: "Reports", href: "/reports", icon: Ic.reports,
    prefixes: ["/reports", "/results"],
    header: "Report Studio",
    items: [
      { label: "Report Studio",        desc: "Institutional report builder — 30 presets, AI composer, export",  href: "/reports",                icon: Ic.reports,    badge: "STUDIO",  badgeColor: S.cyan  },
      { label: "Preset Library",       desc: "Browse 35 board/treasury/risk/audit/compliance presets",          href: "/reports?view=library",   icon: Ic.book,       badge: "35",      badgeColor: S.cyan  },
      { label: "AI Report Builder",    desc: "Goal-driven AI composer — governed, no hallucinated data",        href: "/reports?view=builder",   icon: Ic.ai,         badge: "AI",      badgeColor: S.amber },
      { label: "Saved Reports",        desc: "Your saved, versioned, and scheduled reports",                    href: "/reports?view=saved",     icon: Ic.shield,     badge: "SAVED",   badgeColor: S.cyan  },
      { label: "Run Results",           desc: "Full hedge schedule with rationale — results view",               href: "/results",                icon: Ic.bar_chart },
      { label: "Committee Pack",       desc: "Print-ready IFRS 9 §B6.4 hedge effectiveness pack — PDF export", href: "/committee-pack",         icon: Ic.download,   badge: "PDF",     badgeColor: S.amber },
    ],
  },
  {
    label: "Research", href: "/sandbox", icon: Ic.lightning, minTier: "enterprise" as PlanTier,
    prefixes: ["/sandbox", "/scenario-studio", "/methodology"],
    header: "Research & Simulation",
    items: [
      { label: "Simulation Lab",  desc: "Stress testing, crisis library, what-if, regulatory capital — 7-tab quant engine", href: "/sandbox",         icon: Ic.terminal,  badge: "LAB", badgeColor: S.amber },
      { label: "Scenario Studio", desc: "Monte Carlo & custom stress-test simulations",                                      href: "/scenario-studio", icon: Ic.lightning, badge: "SIM", badgeColor: S.cyan  },
      { label: "Methodology",     desc: "Calculation whitepaper — hedge formulas, instrument reference, engine architecture", href: "/methodology",     icon: Ic.book,      badge: "REF", badgeColor: S.cyan  },
    ],
  },
  {
    label: "Governance", href: "/audit-trail", icon: Ic.governance,
    teamOnly: true, minTier: "enterprise" as PlanTier,
    // TODO(admin-dashboard): Move "Access Control" (/access-control) to a future Admin Dashboard
    // module when it is built. The page/route is preserved; only the nav entry is removed here.
    prefixes: ["/hedgewiki", "/hedges", "/audit-trail", "/run-viewer", "/lineage", "/committee-pack", "/staging", "/ledger"],
    header: "Compliance & Audit",
    items: [
      { label: "Staging Queue",     desc: "4-eyes approval queue — maker/checker review of staged artifacts",   href: "/staging",     icon: Ic.db,       badge: "QUEUE",   badgeColor: S.cyan  },
      { label: "Ledger",            desc: "Approved hedge entries — immutable settled ledger records",           href: "/ledger",      icon: Ic.check,    badge: "LEDGER",  badgeColor: S.green },
      { label: "Audit Trail",       desc: "Immutable decision log with hash-chain integrity",                    href: "/audit-trail", icon: Ic.check,    badge: "AUDIT",   badgeColor: S.amber },
      { label: "Run Viewer",        desc: "TraceLite pipeline narrative + SHA-256 RunEnvelope hash chain",       href: "/run-viewer",  icon: Ic.terminal, badge: "TRACE",   badgeColor: "#a78bfa" },
      { label: "Position Lineage",  desc: "5-level provenance graph: Position → Policy → Run → Ticket",         href: "/lineage",     icon: Ic.plug,     badge: "GRAPH",   badgeColor: "#818cf8" },
      { label: "Hedge Wiki",        desc: "FX instruments, ISDA, IFRS 9 knowledge graph",                       href: "/hedgewiki",   icon: Ic.book },
    ],
  },
  {
    label: "Settings", href: "/settings", icon: Ic.settings,
    prefixes: ["/settings"],
    header: "Configuration",
    items: [
      // CONFIGURATION
      { label: "General",           desc: "Organisation name, currency, timezone, branding",        href: "/settings",                        icon: Ic.user },
      { label: "Policy Limits",     desc: "Hedge ratios, trade size limits, governance controls",   href: "/settings?tab=policy_limits",      icon: Ic.shield,    badge: "RISK",  badgeColor: S.amber },
      { label: "Execution",         desc: "Default product, stress sigma, friction thresholds",     href: "/settings?tab=execution",          icon: Ic.lightning, badge: "EXEC",  badgeColor: S.cyan  },
      { label: "API & Config",      desc: "Alpha Vantage, backend URL, IBKR TWS connectivity",     href: "/settings?tab=api_config",         icon: Ic.key,       badge: "KEYS",  badgeColor: S.red   },
      { label: "Notifications",     desc: "Alert triggers, email recipients, webhook endpoints",    href: "/settings?tab=notifications",      icon: Ic.clock },
      // ACCESS & SECURITY
      { label: "Security",          desc: "TOTP MFA enrolment and device management",              href: "/settings?tab=security",           icon: Ic.shield,    badge: "MFA",   badgeColor: S.cyan  },
      { label: "Users & Roles",     desc: "Team members, RBAC role assignments",                   href: "/settings?tab=users_roles",        icon: Ic.user,      badge: "RBAC",  badgeColor: "#8B5CF6", minTier: "enterprise" as PlanTier },
      { label: "API Key Management",desc: "Generate, label, and revoke programmatic API keys",     href: "/settings?tab=api_key_mgmt",       icon: Ic.key,       badge: "MGMT",  badgeColor: S.amber, minTier: "professional" as PlanTier },
      // ORGANISATION
      { label: "Organisation",      desc: "Company identity, branches, governance mode",           href: "/settings?tab=organisation",       icon: Ic.db, minTier: "enterprise" as PlanTier },
      { label: "Audit Trail",       desc: "Immutable event log with hash-chain integrity",         href: "/settings?tab=audit_trail",        icon: Ic.check,     badge: "WORM",  badgeColor: "#8B5CF6", minTier: "enterprise" as PlanTier },
    ],
  },
  {
    label: "Help", href: "/help", icon: Ic.help,
    prefixes: ["/help"],
    header: "Support",
    items: [
      { label: "Documentation",    desc: "14-guide knowledge base — L1 to L5 depth",        href: "/help",              icon: Ic.book },
      { label: "FAQ",              desc: "Frequently asked questions and troubleshooting",   href: "/help/faq",          icon: Ic.question },
      { label: "Support Center",   desc: "Diagnostics, knowledge base, ticket history",      href: "/help/support",      icon: Ic.support,  badge: "NEW", badgeColor: S.cyan },
      { label: "Contact Support",  desc: "Open a ticket with diagnostics bundle",            href: "/help/contact",      icon: Ic.ticket },
    ],
  },
];

// ── Role badge colour ──────────────────────────────────────────────────────────
function roleColor(role: string): string {
  if (["admin", "cfo", "ceo"].includes(role))            return S.amber;
  if (["head_of_risk", "branch_manager"].includes(role)) return S.cyan;
  if (["auditor"].includes(role))                        return "#a78bfa";
  return S.secondary;
}

// ── Section resolver ───────────────────────────────────────────────────────────
function resolveSection(pathname: string): string {
  for (const sec of NAV) {
    if (sec.prefixes.some((p) => pathname === p || pathname.startsWith(p + "/")))
      return sec.label;
  }
  return "Dashboard";
}

// ── MenuBarItem component ──────────────────────────────────────────────────────
interface MenuBarItemProps {
  sec:      NavSection;
  isActive: boolean;
  isOpen:   boolean;
  onOpen:   (label: string) => void;
  onClose:  () => void;
}

function MenuBarItem({ sec, isActive, isOpen, onOpen, onClose }: MenuBarItemProps) {
  const router = useRouter();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    onOpen(sec.label);
  }, [sec.label, onOpen]);

  const handleMouseLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => onClose(), 120);
  }, [onClose]);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Menu item button */}
      <Link
        href={sec.href}
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            6,
          fontFamily:     S.fontUI,
          fontSize:       13,
          fontWeight:     isActive ? 600 : 400,
          letterSpacing:  "0.01em",
          color:          isActive ? S.cyan : isOpen ? S.primary : S.secondary,
          textDecoration: "none",
          padding:        "0 14px",
          height:         36,
          borderBottom:   isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
          background:     isOpen && !isActive ? "color-mix(in srgb, var(--accent-cyan) 5%, transparent)" : "transparent",
          transition:     "color 120ms, background 120ms",
          whiteSpace:     "nowrap",
        }}
      >
        <span style={{ color: isActive ? S.cyan : isOpen ? S.primary : S.tertiary, display: "flex", alignItems: "center" }}>
          {sec.icon}
        </span>
        {sec.label}
        <span style={{ color: S.tertiary, marginLeft: 1, display: "flex", alignItems: "center", opacity: 0.7 }}>
          {Ic.chevron_down}
        </span>
      </Link>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          style={{
            position:    "absolute",
            top:         "100%",
            left:        0,
            minWidth:    280,
            background:  S.bgPanel,
            border:      `1px solid ${S.rim}`,
            borderTop:   `2px solid ${S.cyan}`,
            boxShadow:   "0 8px 24px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)",
            zIndex:      9999,
            overflow:    "hidden",
          }}
        >
          {/* Dropdown header */}
          <div
            style={{
              padding:       "8px 16px 6px",
              fontFamily:    S.fontMono,
              fontSize:      10,
              fontWeight:    700,
              letterSpacing: "0.1em",
              color:         S.tertiary,
              textTransform: "uppercase",
              borderBottom:  `1px solid ${S.soft}`,
            }}
          >
            {sec.header}
          </div>

          {/* Sub-items */}
          {sec.items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              style={{
                display:        "flex",
                alignItems:     "flex-start",
                gap:            10,
                padding:        "9px 16px",
                textDecoration: "none",
                borderBottom:   `1px solid ${S.soft}`,
                transition:     "background 100ms",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "color-mix(in srgb, var(--accent-cyan) 6%, transparent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              }}
            >
              {/* Sub-item icon */}
              <span style={{ color: S.tertiary, marginTop: 1, flexShrink: 0, display: "flex", alignItems: "center" }}>
                {item.icon}
              </span>

              {/* Label + description */}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 500, color: S.primary, whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <span style={{
                      fontFamily:    S.fontMono,
                      fontSize:      9,
                      fontWeight:    700,
                      letterSpacing: "0.08em",
                      color:         item.badgeColor ?? S.tertiary,
                      background:    `color-mix(in srgb, ${item.badgeColor ?? S.tertiary} 12%, transparent)`,
                      border:        `1px solid color-mix(in srgb, ${item.badgeColor ?? S.tertiary} 25%, transparent)`,
                      padding:       "1px 5px",
                      borderRadius:  2,
                    }}>
                      {item.badge}
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, display: "block", marginTop: 1, lineHeight: 1.4 }}>
                  {item.desc}
                </span>
              </span>

              {/* Chevron right */}
              <span style={{ color: S.tertiary, marginTop: 2, display: "flex", alignItems: "center", opacity: 0.5 }}>
                {Ic.chevron_right}
              </span>
            </Link>
          ))}

        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AppTopBar() {
  const { user, token, logout, isAuthenticated } = useAuth();
  const { hasAccess: hasPlanAccess } = usePlanGate();
  const router   = useRouter();
  const pathname = usePathname() ?? "";

  // Governance mode: fetched from company settings. "solo" = self-approve; "team" = 4-eyes.
  const [governanceMode, setGovernanceMode] = useState<"solo" | "team">("solo");
  useEffect(() => {
    if (!token) return;
    dashboardFetch("/v1/company/settings", token)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.governance_mode) setGovernanceMode(data.governance_mode as "solo" | "team"); })
      .catch(() => {}); // Default to "solo" on failure
  }, [token]);

  const [openMenu,     setOpenMenu]     = useState<string | null>(null);
  const [liveStatus,   setLiveStatus]   = useState<"checking" | "online" | "offline">("checking");
  const [showShortcuts, setShowShortcuts] = useState(false);

  const handleOpen  = useCallback((label: string) => setOpenMenu(label), []);
  const handleClose = useCallback(() => setOpenMenu(null), []);

  // X-16: `?` key opens keyboard shortcut manifest
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcuts(s => !s);
      }
      if (e.key === "Escape") setShowShortcuts(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Poll GET /health every 60s for the LIVE indicator
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

  const handleLogout = () => {
    logout();
    router.push("/auth/login");
  };

  // Don't render on auth / public pages
  if (!isAuthenticated || !user) return null;
  if (pathname.startsWith("/auth") || pathname === "/api-health") return null;

  const role    = user.roles?.[0] ?? "—";
  const branch  = user.branch?.code ?? user.branch?.name ?? "—";
  const name    = user.full_name ?? user.email;
  const section = resolveSection(pathname);

  const visibleNav = NAV
    .filter(sec => {
      if (sec.teamOnly && governanceMode !== "team") return false;
      if (sec.minTier && !hasPlanAccess(sec.minTier)) return false;
      return true;
    })
    .map(sec => ({
      ...sec,
      items: sec.items.filter(item => !item.minTier || hasPlanAccess(item.minTier)),
    }));

  return (
    <div
      style={{
        position:   "sticky",
        top:        0,
        zIndex:     200,
        flexShrink: 0,
        background: S.bgPanel,
      }}
    >
      {/* ══════════════════════════════════════════════════════════════════════
          ROW 1 — Brand bar (44px)
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          height:        44,
          display:       "flex",
          alignItems:    "center",
          paddingLeft:   24,
          paddingRight:  24,
          borderBottom:  `1px solid ${S.soft}`,
          fontFamily:    S.fontUI,
        }}
      >
        {/* Brand mark */}
        <Link
          href="/dashboard"
          style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ordr-logo-horizontal.png"
            alt="ORDR Terminal"
            style={{ height: 28, width: "auto", display: "block" }}
          />
        </Link>

        {/* Divider */}
        <span style={{ color: S.soft, fontSize: 18, margin: "0 12px", userSelect: "none" }}>│</span>

        {/* Section pill */}
        <span style={{
          fontFamily:    S.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
          color:         S.cyan,
          background:    "color-mix(in srgb, var(--accent-cyan) 8%, transparent)",
          border:        "1px solid color-mix(in srgb, var(--accent-cyan) 22%, transparent)",
          padding:       "3px 10px",
          borderRadius:  2,
          textTransform: "uppercase",
          flexShrink:    0,
        }}>
          {section}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* User icon */}
          <span style={{ color: S.tertiary, display: "flex", alignItems: "center" }}>{Ic.user}</span>

          {/* Full name */}
          <span style={{
            fontFamily: S.fontUI, fontSize: 13, fontWeight: 500, color: S.primary,
            whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {name}
          </span>

          {/* Role badge */}
          <span style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            color:         roleColor(role),
            background:    `color-mix(in srgb, ${roleColor(role)} 10%, transparent)`,
            border:        `1px solid color-mix(in srgb, ${roleColor(role)} 28%, transparent)`,
            padding:       "2px 8px", borderRadius: 2, textTransform: "uppercase", whiteSpace: "nowrap",
          }}>
            {role}
          </span>

          {/* Branch */}
          <span style={{
            fontFamily: S.fontMono, fontSize: 11, color: S.tertiary,
            letterSpacing: "0.05em", whiteSpace: "nowrap",
          }}>
            {branch}
          </span>

          {/* Divider */}
          <span style={{ color: S.soft, fontSize: 18, userSelect: "none" }}>│</span>

          {/* Keyboard shortcuts trigger */}
          <button
            onClick={() => setShowShortcuts(s => !s)}
            aria-label="Keyboard shortcuts (?)"
            title="Keyboard shortcuts (?)"
            style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: S.tertiary, background: "none", border: `1px solid ${S.soft}`,
              cursor: "pointer", padding: "3px 8px", borderRadius: 2, lineHeight: 1,
            }}
          >
            ?
          </button>

          {/* Sign Out */}
          <button
            onClick={handleLogout}
            aria-label="Sign out"
            style={{
              fontFamily:    S.fontMono, fontSize: 11, fontWeight: 500, letterSpacing: "0.04em",
              color:         S.tertiary,
              background:    "none",
              border:        `1px solid ${S.soft}`,
              cursor:        "pointer",
              padding:       "4px 12px",
              borderRadius:  2,
              transition:    "color 120ms, border-color 120ms",
              whiteSpace:    "nowrap",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = S.primary; (e.currentTarget as HTMLButtonElement).style.borderColor = S.rim; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = S.tertiary; (e.currentTarget as HTMLButtonElement).style.borderColor = S.soft; }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 2 — Menu bar (36px)
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          height:       36,
          display:      "flex",
          alignItems:   "stretch",
          paddingLeft:  12,
          paddingRight: 24,
          borderBottom: `1px solid ${S.rim}`,
          background:   S.bgSub,
          overflow:     "visible",   // allow dropdowns to extend below
          position:     "relative",
          zIndex:       100,
        }}
      >
        {/* Nav items */}
        <div style={{ display: "flex", alignItems: "stretch", flex: 1 }}>
          {visibleNav.map((sec) => {
            const isActive = sec.prefixes.some(
              (p) => pathname === p || pathname.startsWith(p + "/")
            );
            return (
              <MenuBarItem
                key={sec.label}
                sec={sec}
                isActive={isActive}
                isOpen={openMenu === sec.label}
                onOpen={handleOpen}
                onClose={handleClose}
              />
            );
          })}
        </div>

        {/* Right: terminal label + live indicator */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, paddingLeft: 16,
          borderLeft: `1px solid ${S.soft}`, flexShrink: 0,
        }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
            color: S.tertiary, textTransform: "uppercase",
          }}>
            ORDR TERMINAL
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", display: "inline-block",
              background: liveStatus === "online" ? "var(--status-pass,#4ade80)" : liveStatus === "offline" ? "var(--accent-red,#f87171)" : "var(--accent-amber,#f59e0b)",
            }} />
            <span style={{
              fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.06em",
              color: liveStatus === "online" ? "var(--status-pass,#4ade80)" : liveStatus === "offline" ? "var(--accent-red,#f87171)" : "var(--accent-amber,#f59e0b)",
            }}>
              {liveStatus === "online" ? "LIVE" : liveStatus === "offline" ? "OFFLINE" : "…"}
            </span>
          </span>
        </div>
      </div>

      {/* X-16: Keyboard Shortcut Manifest Modal */}
      {showShortcuts && (
        <div
          onClick={() => setShowShortcuts(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "28px 32px", minWidth: 480, maxWidth: 600, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 16px 64px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.cyan, letterSpacing: "0.12em" }}>KEYBOARD SHORTCUTS</div>
              <button onClick={() => setShowShortcuts(false)} aria-label="Close shortcuts" style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, background: "none", border: "none", cursor: "pointer" }}>✕</button>
            </div>
            {[
              { section: "GLOBAL", shortcuts: [
                { key: "?", desc: "Toggle this shortcut manifest" },
                { key: "Esc", desc: "Close any open modal or panel" },
              ]},
              { section: "POSITION DESK", shortcuts: [
                { key: "/", desc: "Focus position search" },
                { key: "R", desc: "Refresh positions from backend" },
                { key: "F", desc: "Cycle through filter presets" },
                { key: "Esc", desc: "Clear search / close modal" },
              ]},
              { section: "POLICY DESK", shortcuts: [
                { key: "/", desc: "Focus position search" },
                { key: "Esc", desc: "Clear search" },
              ]},
              { section: "HELP", shortcuts: [
                { key: "?", desc: "Open this manifest from any page" },
              ]},
            ].map(({ section, shortcuts }) => (
              <div key={section} style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${S.soft}` }}>{section}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {shortcuts.map(({ key, desc }) => (
                    <div key={key + desc} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <kbd style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.primary, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "2px 7px", minWidth: 36, textAlign: "center", boxShadow: "0 1px 0 rgba(0,0,0,0.15)", display: "inline-block" }}>{key}</kbd>
                      <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, paddingTop: 12, borderTop: `1px solid ${S.soft}` }}>
              Press <kbd style={{ fontFamily: S.fontMono, fontSize: 9, padding: "1px 5px", border: `1px solid ${S.soft}`, borderRadius: 2, background: S.bgSub }}>?</kbd> anywhere (outside inputs) to toggle · <kbd style={{ fontFamily: S.fontMono, fontSize: 9, padding: "1px 5px", border: `1px solid ${S.soft}`, borderRadius: 2, background: S.bgSub }}>Esc</kbd> to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
