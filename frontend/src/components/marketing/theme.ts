/* ═══════════════════════════════════════════════════════
   Marketing Theme System
   Shared across all marketing / public-facing pages.
   ═══════════════════════════════════════════════════════ */

export type ThemeMode = "light" | "dark";

export interface MarketingTheme {
  bg: string;
  bgDeep: string;
  bgCard: string;
  bgGlass: string;
  bgNav: string;
  border: string;
  borderSoft: string;
  text: string;
  textSub: string;
  textDim: string;
  accent: string;
  accentSoft: string;
  accentGlow: string;
  accentText: string;
  accent2: string;
  accent2Soft: string;
  cardShadow: string;
  navShadow: string;
  heroGrad: string;
  sectionAlt: string;
  tagBg: string;
  tagText: string;
  tagBorder: string;
  ctaBg: string;
  footerBg: string;
  green: string;
  red: string;
}

export const DARK: MarketingTheme = {
  bg: "#050508",
  bgDeep: "#020204",
  bgCard: "#0c0c12",
  bgGlass: "rgba(12,12,18,0.7)",
  bgNav: "rgba(5,5,8,0.8)",
  border: "#16161f",
  borderSoft: "#1e1e2a",
  text: "#eeeef2",
  textSub: "#9494a8",
  textDim: "#5c5c72",
  accent: "#22d3ee",
  accentSoft: "rgba(34,211,238,0.08)",
  accentGlow: "rgba(34,211,238,0.15)",
  accentText: "#000",
  accent2: "#818cf8",
  accent2Soft: "rgba(129,140,248,0.08)",
  cardShadow: "0 4px 40px rgba(0,0,0,0.5)",
  navShadow: "0 1px 40px rgba(0,0,0,0.5)",
  heroGrad:
    "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(34,211,238,0.08), transparent 60%), radial-gradient(ellipse 60% 40% at 80% 10%, rgba(129,140,248,0.06), transparent 50%)",
  sectionAlt: "#08080d",
  tagBg: "rgba(34,211,238,0.06)",
  tagText: "#22d3ee",
  tagBorder: "rgba(34,211,238,0.12)",
  ctaBg: "#0a0a10",
  footerBg: "#030305",
  green: "#34d399",
  red: "#f87171",
};

export const LIGHT: MarketingTheme = {
  bg: "#ffffff",
  bgDeep: "#f8fafc",
  bgCard: "#ffffff",
  bgGlass: "rgba(255,255,255,0.8)",
  bgNav: "rgba(255,255,255,0.85)",
  border: "#e2e8f0",
  borderSoft: "#edf0f4",
  text: "#0f172a",
  textSub: "#64748b",
  textDim: "#94a3b8",
  accent: "#1e3a5f",
  accentSoft: "rgba(30,58,95,0.06)",
  accentGlow: "rgba(30,58,95,0.1)",
  accentText: "#fff",
  accent2: "#4a90d9",
  accent2Soft: "rgba(74,144,217,0.06)",
  cardShadow: "0 4px 24px rgba(0,0,0,0.06)",
  navShadow: "0 1px 24px rgba(0,0,0,0.06)",
  heroGrad:
    "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30,58,95,0.05), transparent 60%)",
  sectionAlt: "#f4f6f9",
  tagBg: "rgba(30,58,95,0.05)",
  tagText: "#1e3a5f",
  tagBorder: "rgba(30,58,95,0.1)",
  ctaBg: "#1e3a5f",
  footerBg: "#0f172a",
  green: "#16a34a",
  red: "#dc2626",
};

/** Font stacks */
export const F = {
  ui: "'IBM Plex Sans', -apple-system, sans-serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
  heading: "'Manrope', 'IBM Plex Sans', sans-serif",
} as const;

/* ── Product catalogue ── */

export interface Product {
  name: string;
  slug: string;
  short: string;
  desc: string;
  tags: string[];
  icon: string; // lucide-react icon name
  color: string;
}

export const PRODUCTS: Product[] = [
  {
    name: "ORDR Treasury",
    slug: "treasury",
    short: "TREASURY",
    desc: "FX hedge governance engine with deterministic computation, 4-eyes approval, WORM audit trail, and IFRS 9 effectiveness testing.",
    tags: ["GOVERNANCE", "AUDIT", "HEDGING"],
    icon: "LayoutGrid",
    color: "#22d3ee",
  },
  {
    name: "ORDR Market",
    slug: "market",
    short: "MARKET",
    desc: "Professional charting & market intelligence platform with 77 indicators, multi-asset coverage, and TradingView integration.",
    tags: ["CHARTING", "MARKET DATA"],
    icon: "TrendingUp",
    color: "#34d399",
  },
  {
    name: "ORDR Portfolio",
    slug: "portfolio",
    short: "PORTFOLIO",
    desc: "Portfolio risk engine. Decompose exposures, classify R1-R8 risk categories, generate hedge plans with sub-50ms computation.",
    tags: ["RISK", "ENGINE"],
    icon: "PieChart",
    color: "#818cf8",
  },
  {
    name: "ORDR Labs",
    slug: "labs",
    short: "LABS",
    desc: "Scenario Studio & Sandbox environment. Stress testing, Monte Carlo simulation, crisis library, what-if analysis.",
    tags: ["SIMULATION", "SANDBOX"],
    icon: "FlaskConical",
    color: "#f59e0b",
  },
  {
    name: "ORDR Polisophic",
    slug: "polisophic",
    short: "POLISOPHIC",
    desc: "Political & macro risk intelligence. Corridor scoring, geopolitical event tracking, currency-impact analysis.",
    tags: ["GEOPOLITICAL", "INTEL"],
    icon: "Globe",
    color: "#ec4899",
  },
  {
    name: "ORDR HedgeWiki",
    slug: "hedgewiki",
    short: "HEDGEWIKI",
    desc: "Institutional knowledge base. ISDA definitions, IFRS 9 / ASC 815 guidance, methodology reference library.",
    tags: ["KNOWLEDGE", "COMPLIANCE"],
    icon: "BookOpen",
    color: "#a78bfa",
  },
  {
    name: "ORDR FinHub",
    slug: "finhub",
    short: "FINHUB",
    desc: "Financial intelligence hub. Market analysis, economic calendars, research feeds, curated financial data.",
    tags: ["RESEARCH", "DATA"],
    icon: "Newspaper",
    color: "#fb923c",
  },
];

/* ── Solutions catalogue ── */

export interface Solution {
  name: string;
  slug: string;
  desc: string;
}

export const SOLUTIONS: Solution[] = [
  {
    name: "Corporate Treasury",
    slug: "corporate-treasury",
    desc: "End-to-end FX exposure management for corporate treasury teams",
  },
  {
    name: "Risk Management",
    slug: "risk-management",
    desc: "Enterprise risk analytics and governance for risk officers",
  },
  {
    name: "Asset Management",
    slug: "asset-management",
    desc: "Portfolio hedging and risk decomposition for fund managers",
  },
  {
    name: "Banking",
    slug: "banking",
    desc: "Institutional trading compliance and audit infrastructure",
  },
  {
    name: "Insurance",
    slug: "insurance",
    desc: "Liability hedging and regulatory compliance for insurers",
  },
  {
    name: "Energy & Commodities",
    slug: "energy",
    desc: "Commodity price risk management and hedge optimization",
  },
];

/* ── Shared data constants ── */

export const TICKER_DATA = [
  { sym: "EUR/USD", price: "1.0847", chg: "+0.12%", up: true },
  { sym: "GBP/USD", price: "1.2634", chg: "+0.08%", up: true },
  { sym: "USD/JPY", price: "149.82", chg: "-0.24%", up: false },
  { sym: "USD/CHF", price: "0.8847", chg: "+0.05%", up: true },
  { sym: "AUD/USD", price: "0.6521", chg: "-0.18%", up: false },
  { sym: "USD/CAD", price: "1.3612", chg: "+0.03%", up: true },
  { sym: "SPX", price: "5,667.20", chg: "+0.34%", up: true },
  { sym: "GOLD", price: "2,178.40", chg: "+0.52%", up: true },
  { sym: "BTC", price: "67,842", chg: "-1.23%", up: false },
  { sym: "NDX", price: "19,842", chg: "+0.61%", up: true },
];

export const METRICS = [
  { value: "7", label: "Products", suffix: "" },
  { value: "219", label: "API Endpoints", suffix: "+" },
  { value: "41", label: "Engine Modules", suffix: "" },
  { value: "77", label: "Chart Indicators", suffix: "" },
  { value: "3,463", label: "Passing Tests", suffix: "" },
  { value: "<50", label: "ms Latency", suffix: "ms" },
];

export const CAPABILITIES = [
  {
    iconName: "Shield",
    label: "WORM Audit Trail",
    desc: "Append-only event log with SHA-256 hash chain. Tamper-evident, regulation-proof audit semantics for every calculation and approval.",
    num: "SHA-256",
  },
  {
    iconName: "Users",
    label: "4-Eyes Governance",
    desc: "Maker-checker approval workflow with Separation of Duties enforcement. Sandbox to Staging to Ledger pipeline.",
    num: "4-EYES",
  },
  {
    iconName: "Layers",
    label: "R1-R8 Risk Taxonomy",
    desc: "Eight frozen risk categories covering translation, transaction, economic, and strategic exposure classification.",
    num: "R1-R8",
  },
  {
    iconName: "FileCheck",
    label: "IFRS 9 / ASC 815",
    desc: "Built-in prospective effectiveness testing, hedge documentation, and accounting framework alignment.",
    num: "IFRS 9",
  },
  {
    iconName: "Cpu",
    label: "Deterministic Engine",
    desc: "Same inputs produce identical outputs. No ML black boxes. Reproducible, explainable, auditor-friendly.",
    num: "v1",
  },
  {
    iconName: "Eye",
    label: "60 Policy Presets",
    desc: "Maturity profiles, governance tiers, evidence grades, accounting modes -- ready-to-deploy institutional templates.",
    num: "60",
  },
];

export const COMPLIANCE = [
  { label: "WORM Semantics", sub: "Append-only audit tables" },
  { label: "SHA-256 Hash Chain", sub: "Per-tenant tamper detection" },
  { label: "4-Eyes Approval", sub: "Maker-checker with SoD" },
  { label: "IFRS 9 / ASC 815", sub: "Hedge effectiveness testing" },
  { label: "BCBS FRTB", sub: "Stress test methodology" },
  { label: "Fail-Closed RBAC", sub: "9 roles x 41 permissions" },
];

export const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Import Positions",
    desc: "Upload FX exposures via CSV, API, or manual entry. Auto-classify into R1-R8 risk categories with currency pair detection.",
    iconName: "Upload",
  },
  {
    step: "02",
    title: "Configure Policy",
    desc: "Select from 60 institutional templates or build custom. Set hedge ratios, cost thresholds, governance tiers, and maturity profiles.",
    iconName: "Settings",
  },
  {
    step: "03",
    title: "Calculate & Review",
    desc: "Deterministic engine produces hedge recommendations in under 50ms. Review instrument selection, notional sizing, and risk decomposition.",
    iconName: "Calculator",
  },
  {
    step: "04",
    title: "Execute & Audit",
    desc: "4-eyes approval workflow with SoD enforcement. Every decision hash-chained to an immutable WORM audit trail.",
    iconName: "ShieldCheck",
  },
];

export const TESTIMONIALS = [
  {
    quote:
      "ORDR replaced three spreadsheets, two consultants, and a monthly fire drill. Our audit prep went from two weeks to two hours.",
    name: "Sarah Chen",
    title: "Head of Treasury",
    company: "Meridian Manufacturing",
  },
  {
    quote:
      "The deterministic engine is what convinced our board. Same inputs, same outputs, every time. Our auditors actually smile now.",
    name: "James Okafor",
    title: "VP Risk Management",
    company: "Apex Capital Partners",
  },
  {
    quote:
      "We hedged $340M in FX exposure across 14 currencies last quarter. The 4-eyes workflow and WORM trail made compliance painless.",
    name: "Maria Vasquez",
    title: "CFO",
    company: "NovaTech Solutions",
  },
];
