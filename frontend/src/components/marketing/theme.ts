/**
 * Marketing theme — Bloomberg-inspired.
 * Black nav, white background, institutional typography.
 * No dark/light toggle. Single professional light theme.
 */

// ── Product catalogue ────────────────────────────────────────────────────────

export interface Product {
  name: string;
  slug: string;
  desc: string;
  icon: string;
}

export const PRODUCTS: Product[] = [
  { name: "ORDR Treasury", slug: "treasury", desc: "FX hedge calculation, policy governance, and execution pipeline", icon: "LayoutGrid" },
  { name: "ORDR Market", slug: "market", desc: "Professional charting and real-time market intelligence", icon: "TrendingUp" },
  { name: "ORDR Connect", slug: "connect", desc: "Autonomous customer operations OS replacing passive CRM", icon: "Network" },
  { name: "ORDR Portfolio", slug: "portfolio", desc: "Portfolio risk decomposition and exposure analysis", icon: "PieChart" },
  { name: "ORDR Labs", slug: "labs", desc: "Scenario studio, backtesting, and Monte Carlo simulation", icon: "FlaskConical" },
  { name: "ORDR Polisophic", slug: "polisophic", desc: "Geopolitical risk intelligence and corridor scoring", icon: "Globe" },
  { name: "ORDR HedgeWiki", slug: "hedgewiki", desc: "ISDA definitions, IFRS 9 / ASC 815 reference library", icon: "BookOpen" },
  { name: "ORDR FinHub", slug: "finhub", desc: "Economic calendars, company research, signal detection", icon: "Newspaper" },
  { name: "ORDR Fund", slug: "fund", desc: "Pooled capital management for private fund managers", icon: "BarChart3" },
];

// ── Solutions catalogue ──────────────────────────────────────────────────────

export interface Solution {
  name: string;
  slug: string;
  desc: string;
}

export const SOLUTIONS: Solution[] = [
  { name: "Corporate Treasury", slug: "corporate-treasury", desc: "End-to-end FX risk management for corporate treasury operations" },
  { name: "Risk Management", slug: "risk-management", desc: "Enterprise risk quantification, monitoring, and governance" },
  { name: "Asset Management", slug: "asset-management", desc: "Multi-currency portfolio hedging and exposure analysis" },
  { name: "Banking & Capital Markets", slug: "banking", desc: "Institutional FX infrastructure for banks and dealers" },
  { name: "Insurance", slug: "insurance", desc: "ALM currency risk and regulatory hedge accounting" },
  { name: "Energy & Commodities", slug: "energy", desc: "Commodity-linked FX exposure and cross-currency hedging" },
];

// ── Colors ───────────────────────────────────────────────────────────────────

export const C = {
  navBg: "#000000",
  navText: "#FFFFFF",
  navTextMuted: "rgba(255,255,255,0.55)",

  bg: "#FFFFFF",
  bgAlt: "#F7F8FA",
  bgMuted: "#EEEEF2",
  bgDark: "#0C0C0C",

  text: "#111111",
  textSub: "#555555",
  textMuted: "#999999",
  textOnDark: "#FFFFFF",
  textOnDarkMuted: "rgba(255,255,255,0.5)",

  accent: "#1E3A5F",
  accentHover: "#162D4A",
  accentLight: "rgba(30,58,95,0.04)",

  border: "#E5E7EB",
  borderLight: "#F0F0F0",

  cardShadow: "0 1px 3px rgba(0,0,0,0.05)",
  dropdownShadow: "0 12px 40px rgba(0,0,0,0.12)",
} as const;

// ── Fonts ────────────────────────────────────────────────────────────────────

export const F = {
  heading: "'Manrope', 'Helvetica Neue', Arial, sans-serif",
  ui: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
} as const;
