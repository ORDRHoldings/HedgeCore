"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import HelpPanel from "@/components/layout/HelpPanel";
import { HELP_CENTER_HELP } from "@/lib/helpContent";

// ── Hydration-safe timestamp hook ─────────────────────────────────────────────
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  pass:     "var(--status-pass,#10B981)",
  fail:     "var(--accent-red,#B91C1C)",
} as const;

const PLATFORM_VERSION = "v2.0.0";
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" &&
  ["hedgecore.vercel.app", "ordr-terminal.vercel.app"].includes(window.location.hostname)
    ? "https://hedgecore.onrender.com/api"
    : "/api");

interface HealthStatus {
  status: string;
  service: string;
}

const FAQ_ITEMS = [
  {
    q: "What is the Tri-State Pipeline?",
    a: "ORDR uses a SANDBOX → STAGING → LEDGER workflow. Sandbox is the mutable simulation environment (no DB writes). Staging is the 4-eyes approval queue. Ledger is the WORM-sealed permanent record of approved hedge plans.",
  },
  {
    q: "Why does my hedge calculation show INDICATIVE data?",
    a: "INDICATIVE means the FX module is using fallback/cached rates instead of live Alpha Vantage data. Set your ALPHA_VANTAGE_API_KEY in Settings → API & Keys. Free tier is limited to 25 calls/day; upgrade for production use.",
  },
  {
    q: "What is the 4-Eyes Principle?",
    a: "All execution proposals require two separate authorisations. The analyst who submits a proposal cannot also approve it (proposer_id ≠ approver_id, enforced at database level). This satisfies EMIR dual-authorisation requirements for material OTC derivative trades.",
  },
  {
    q: "What does WORM mean?",
    a: "Write Once, Read Many. Once an audit event or ledger entry is created, it can never be modified or deleted. This is enforced by database triggers. All records are hash-chained with SHA-256 for cryptographic tamper-evidence.",
  },
  {
    q: "What is an NDF?",
    a: "A Non-Deliverable Forward is a cash-settled FX forward contract. Used for currencies with exchange controls (MXN, BRL, INR, KRW, CNH). At maturity, only the net gain/loss is paid in USD — no physical delivery of the restricted currency. Standard instrument for EM FX hedging.",
  },
  {
    q: "How is hedge effectiveness calculated?",
    a: "ORDR uses the R² regression method per IFRS 9 §B6.4.17: the coefficient of determination from regressing hedging instrument fair value changes against hedged item changes. R² ≥ 0.80 indicates high effectiveness. The 80–125% dollar-offset bright-line from IAS 39 no longer applies under IFRS 9.",
  },
  {
    q: "What is the difference between CONFIRMED and FORECAST positions?",
    a: "CONFIRMED positions are contractually obligated cash flows (signed invoices, confirmed orders). FORECAST positions are projected but not yet contracted. Policy hedge ratios differ: typically 80% for confirmed, 50% for forecast, reflecting the higher probability of confirmed flows.",
  },
  {
    q: "How do I reset the dashboard layout?",
    a: "Click the gear icon in the dashboard toolbar and select 'Reset to Default Layout'. This clears your saved layout from localStorage and restores the role-based default for your user role. Your widget settings and data are not affected.",
  },
  {
    q: "What is the hash chain and why does it matter?",
    a: "Each audit event contains a SHA-256 hash of its own content plus the hash of the previous event, forming a chain. If any historical event is modified, its hash changes, breaking all subsequent chain links. The Audit Trail's 'Verify Chain Integrity' button replays and validates the full chain.",
  },
  {
    q: "What hedge instruments does ORDR support?",
    a: "ORDR v1 supports: NDF (Non-Deliverable Forward), FX Forward (physical delivery), and FX Futures Proxy (CME-listed contracts). Options and structured products are not supported in v1 per architecture freeze — they would introduce non-zero vega/gamma risk (R2/R3).",
  },
  {
    q: "What is the R1–R8 taxonomy?",
    a: "ORDR decomposes portfolio risk into 8 dimensions: R1 Delta, R2 Vega, R3 Gamma, R4 Theta/Carry, R5 Correlation, R6 Credit/CVA, R7 Liquidity, R8 Tail/Event. For v1 (NDF/Forward-only book): R2 and R3 are zero (no optionality). R1 and R8 typically dominate.",
  },
  {
    q: "Can I use ORDR with my ERP system?",
    a: "Yes. ORDR supports: CSV/Excel upload (manual mapping), SQL database connector (scheduled pull), and ERP connectors for SAP, Oracle, and NetSuite. Navigate to Position Desk → Import tab and select your ingestion channel. See the Data Ingestion guide for field mapping details.",
  },
  {
    q: "What are the minimum permissions required to approve a proposal?",
    a: "Proposal approval requires: (1) is_superuser=true OR role with 'approve_proposals' permission, (2) user must NOT be the original proposer (4-eyes), (3) user must be in the same company_id. Branch-level approval requires matching branch_id. Contact your admin to adjust your role.",
  },
  {
    q: "How do I interpret the hedge efficiency percentage?",
    a: "Hedge efficiency = actual hedge P&L offset / theoretical maximum offset × 100%. 100% = perfect hedge. Values below 80% indicate basis risk (imperfect correlation between hedge and hedged item), ratio shortfalls, or timing mismatches between hedge and exposure settlement dates.",
  },
  {
    q: "What is covered interest parity (CIP)?",
    a: "CIP states that the forward rate equals the spot rate adjusted for the interest rate differential: F = S × (1+r_domestic)/(1+r_foreign). If this relationship breaks down, arbitrage exists. In practice, CIP deviations widen during stress periods as balance sheet capacity for FX swap dealers is constrained (BIS 2016, 2019 research).",
  },
];

const GUIDE_SECTIONS = [
  {
    title: "Getting Started",
    path: "/dashboard",
    description: "Welcome to ORDR Terminal — your institutional FX treasury platform. Start with the Dashboard to see your portfolio KPIs, then input positions, configure a hedge policy, and run the simulation engine to generate execution-ready trade tickets.",
    steps: [
      "Log in with your enterprise credentials (SSO supported)",
      "Review the Dashboard for portfolio summary and KPIs",
      "Navigate to Position Desk to enter or import FX exposure data",
      "Select a hedge policy in the Policy Engine",
      "Run the Sandbox simulation to analyze hedge effectiveness",
      "Use the Execution Pipeline to stage, approve, and execute trades",
    ],
  },
  {
    title: "Dashboard & Widgets",
    path: "/dashboard",
    description: "The Dashboard provides a real-time overview of your FX portfolio: P&L snapshot, exposure heat-map, team activity feed, and quick-access KPI tiles. Portfolio Risk and Scenario Studio are accessible via the Dashboard submenu.",
    steps: [
      "View consolidated P&L and exposure KPIs at a glance",
      "Monitor team activity feed for recent pipeline actions",
      "Navigate to Portfolio Risk for delta, vega, and correlation analysis",
      "Open Scenario Studio for Monte Carlo and stress-test simulations",
      "Access Polisophic for political and macro risk intelligence",
    ],
  },
  {
    title: "Data Ingestion",
    path: "/input",
    description: "Ingest FX exposure data through multiple channels: manual entry, CSV/Excel upload, SQL database connection, ERP integration (SAP, Oracle, NetSuite), or accounting system connectors (Xero, QuickBooks, Sage). Each channel maps source fields to ORDR TradeRow format.",
    steps: [
      "Use Manual Entry for quick ad-hoc position input",
      "Upload CSV or Excel files for bulk import with auto-mapping",
      "Configure Database Connection for scheduled SQL pulls",
      "Set up ERP Integration for SAP, Oracle, or NetSuite connectors",
      "Connect Accounting Systems to import foreign currency invoices",
      "Review Import History for audit trail of all data ingestion events",
    ],
  },
  {
    title: "Position Desk — Manual Entry Guide",
    path: "/input",
    description: "Step-by-step walkthrough for manually creating FX exposure positions. The Position Desk (Ingestion Desk) is where all exposure data enters the ORDR platform. Each position represents a confirmed or forecast cash flow in a foreign currency that may require hedging. This guide covers the manual entry form, field definitions, validation rules, and best practices for institutional-grade data ingestion.",
    steps: [
      "Navigate to Position Desk → Manual Entry tab. The form displays 8 fields: Record ID, Entity, Flow Type, Currency, Amount, Value Date, Status, and Description",
      "RECORD ID — Enter a unique identifier (e.g. EXP-EUR-001). This is immutable after save per WORM audit requirements. Use a consistent naming convention: {TYPE}-{CCY}-{SEQ}",
      "ENTITY — Enter the legal entity or counterparty name (e.g. Nordstrom GmbH). Must match your counterparty master data for accurate reporting",
      "FLOW TYPE — Select AP (Accounts Payable, outflow: you owe foreign currency) or AR (Accounts Receivable, inflow: you are owed foreign currency). This determines hedge direction",
      "CURRENCY — Select the ISO 4217 currency code from the dropdown (27 currencies available: EUR, GBP, JPY, MXN, BRL, CAD, CHF, ZAR, and more). This is the foreign currency of the exposure",
      "AMOUNT — Enter the notional value as a positive number (e.g. 2500000 for 2.5M). No currency symbol or sign needed — the system determines direction from Flow Type. Displays with thousand separators",
      "VALUE DATE — Click the date field to open the calendar picker. Use Q1/Q2/Q3/Q4 shortcuts to jump between quarters, arrow buttons to navigate months, then click the target date. Alternatively, type YYYY-MM-DD in the TYPE DATE input. Must be a future date",
      "STATUS — Choose CONFIRMED (contractually obligated) or FORECAST (projected). Only CONFIRMED positions are eligible for automated execution via IBKR. Default is CONFIRMED",
      "DESCRIPTION — Optional free-text note (e.g. 'Q2 consulting revenue - Frankfurt'). Appears in the audit trail and ledger export. Strongly recommended for traceability",
      "Click + ADD POSITION to save. The position appears in the table below with status NEW. The summary bar updates showing TOTAL positions, CONFIRMED/FORECAST counts, and currencies",
      "GATE CHECK at the bottom shows ALL GATES PASSED (green) when at least one position is loaded and validated. This unlocks the GENERATE HEDGE PLAN button",
      "Repeat for additional positions. Each position can have a different currency, flow type, and value date. The system supports multi-currency portfolios",
    ],
  },
  {
    title: "Policy Engine",
    path: "/policies",
    description: "Browse all 33 system hedge policy presets organized by category. Create custom AI-powered policies using the 5-step wizard. The AI analyzes your business profile and generates 3 tailored recommendations. Save and manage custom policies for your team.",
    steps: [
      "Browse system presets by category (Corporate, Financial, Sovereign, Sector)",
      "Click 'Activate Policy' on any preset to make it your active hedge policy",
      "Open the AI Policy Wizard for guided custom policy creation",
      "Complete 5 steps: Business Profile → Cash Flow → Risk → Objectives → AI Recommendations",
      "Review 3 AI-generated policy recommendations (Conservative, Balanced, Aggressive)",
      "Save custom policies and manage them in My Saved Policies",
      "Admin users can publish policies branch-wide or company-wide",
    ],
  },
  {
    title: "Sandbox & Simulation",
    path: "/sandbox",
    description: "The Sandbox is the core simulation engine. It runs your positions through the waterfall rule engine, generates integrity scores, and produces allocation recommendations. Start clean and choose a demo fixture or load data from the Position Desk.",
    steps: [
      "Navigate to Sandbox — it starts clean (no auto-loaded data)",
      "Select a demo simulation fixture or load positions from Position Desk",
      "Review KPIs: Integrity Score, Rules Passed, V2 Module Count",
      "Analyze the Waterfall Engine for rule-by-rule pass/fail details",
      "Explore left rail tabs: Exposure, Attribution, Constraints",
      "Explore right rail tabs: Before/After, Liquidity, Rolls, Scenarios",
      "Use the Scenario Stress Tester for custom shock analysis",
      "Click 'Execution Bridge →' to proceed to trade ticket generation",
    ],
  },
  {
    title: "Execution Pipeline",
    path: "/execution",
    description: "The full execution pipeline: Proposal → Staging → Approval → Ledger. Create proposals from sandbox results, submit to staging for review, obtain dual-approval authorization, and record executed trades on the immutable ledger.",
    steps: [
      "Generate a hedge plan proposal from sandbox simulation results",
      "Submit proposal to staging for governance review",
      "Obtain required approvals (dual authorization for amounts > threshold)",
      "Execute approved trades via IBKR handoff or manual confirmation",
      "View executed trades in the Ledger with hash-chain integrity",
      "Review Execution History for all completed and pending transactions",
    ],
  },
  {
    title: "Execution Bridge",
    path: "/execution",
    description: "The Execution Bridge translates sandbox hedge allocations into bucket-level trade tickets. Each ticket includes instrument type (NDF, Forward, Option), notional, tenor, counterparty, and IBKR execution parameters.",
    steps: [
      "Run a sandbox simulation to generate hedge allocations",
      "Navigate to Execution Bridge to see bucket-level trade tickets",
      "Switch between NDF and Futures Proxy instrument types per bucket",
      "Review ticket details: notional, rate, tenor, settlement date",
      "Copy ticket details or use the IBKR handoff button",
      "Monitor TradingView chart for real-time rate reference",
    ],
  },
  {
    title: "FX Rates",
    path: "/currency-fx",
    description: "Live FX market data with TradingView charts. Switch between currency pairs (USD/MXN, EUR/MXN, GBP/MXN, etc.), view forward curves, cross rates, and historic crisis reference shocks for stress-testing context.",
    steps: [
      "Select a currency pair from the tab bar to switch the chart",
      "View live TradingView chart with technical analysis tools",
      "Review forward curve table with forward points and annualized basis",
      "Click cross rates rows to switch the active pair",
      "Reference historic crisis shocks for scenario planning",
      "Open Sandbox to run full stress-test simulations",
    ],
  },
  {
    title: "Polisophic",
    path: "/polisophic",
    description: "Political and macro risk intelligence feed. Monitor risk events (central bank decisions, sanctions, fiscal policy), track risk scores by dimension, analyze macro scenarios, configure alert rules, and assess exposure risk impact.",
    steps: [
      "Review the Event Feed for latest political and macro risk events",
      "Check Risk Scores for MXN pressure, sovereign risk, and trade policy",
      "Explore Macro Scenarios for base, upside, and downside projections",
      "Configure Alert Rules for automated notifications on key thresholds",
      "Assess My Exposure Risk to see how events impact your portfolio",
    ],
  },
  {
    title: "Governance",
    path: "/hedgewiki",
    description: "Comprehensive governance suite: HedgeWiki knowledge base for FX instruments and standards, Audit Trail for immutable decision logging with hash-chain integrity, and Access Control for role-based permissions and branch hierarchy.",
    steps: [
      "Browse HedgeWiki for FX instruments, ISDA, IFRS 9, ASC 815 articles",
      "Review Audit Trail for all pipeline actions with timestamps and hashes",
      "Verify chain integrity with one-click hash validation",
      "Manage Access Control: users, roles, permissions, branch hierarchy",
      "Export audit logs for regulatory compliance reporting",
    ],
  },
  {
    title: "Troubleshooting",
    path: "/help",
    description: "Common issues and solutions for the ORDR Terminal platform. Check system diagnostics, verify API connectivity, and resolve data import errors.",
    steps: [
      "Check System Diagnostics panel (right sidebar) for backend/frontend status",
      "If backend shows OFFLINE: verify API URL and network connectivity",
      "Clear browser cache if UI shows stale data after an update",
      "For import errors: verify CSV/Excel column headers match expected format",
      "For policy errors: ensure at least one policy is activated before sandbox run",
      "Contact support@hedgecore.app for unresolved issues",
    ],
  },
  {
    title: "API Reference",
    path: "/help",
    description: "ORDR Terminal API endpoints for programmatic integration. All endpoints require Bearer token authentication. The API serves hedge calculation, pipeline management, policy configuration, and data ingestion.",
    steps: [
      "POST /api/calculate — Run hedge calculation engine with positions + policy",
      "POST /api/proposals — Create a new hedge proposal from sandbox results",
      "POST /api/staging — Submit proposal to staging for approval",
      "POST /api/staging/:id/authorize — Authorize a staged artifact",
      "GET /api/ledger — List all ledger entries (executed trades)",
      "GET /api/policies — List policy templates (system + custom)",
      "POST /api/connectors/csv — Import positions from CSV file",
      "GET /api/health — Check API health status",
    ],
  },
  {
    title: "FAQ — Frequently Asked Questions",
    path: "/help",
    description: "Answers to the most common questions about ORDR Terminal: the Tri-State Pipeline, hedge instruments, IFRS 9 effectiveness, 4-eyes approval, WORM audit trail, position lifecycle, and regulatory compliance. Click any question below to see the full answer.",
    steps: FAQ_ITEMS.map(item => `Q: ${item.q}  →  ${item.a}`),
  },
];

const KB_LINKS = [
  { label: "NDF — Non-Deliverable Forward", id: "ndf" },
  { label: "FX Swap mechanics", id: "fxswap" },
  { label: "IFRS 9 Hedge Accounting", id: "ifrs9-eff" },
  { label: "Hedge Effectiveness Testing", id: "het-regression" },
  { label: "Delta-hedge ratio methodology", id: "delta-hedge" },
  { label: "Waterfall rule engine", id: "waterfall" },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${S.soft}`, background: S.bgPanel }}>
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          width: "100%", textAlign: "left" as const, padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600,
          color: open ? S.cyan : S.primary, lineHeight: 1.4,
        }}
      >
        <span>{q}</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, flexShrink: 0, marginLeft: 8 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 12px", fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, lineHeight: 1.6 }}>
          {a}
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  const renderTs = useRenderTs();
  const router = useRouter();
  const { token } = useAuth();
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(0);
  const [searchFilter, setSearchFilter] = useState("");

  const filteredSections = GUIDE_SECTIONS.map((sec, i) => ({ ...sec, origIdx: i })).filter(sec =>
    !searchFilter || sec.title.toLowerCase().includes(searchFilter.toLowerCase()) || sec.description.toLowerCase().includes(searchFilter.toLowerCase())
  );

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setHealthStatus(data);
      } catch (e) {
        setHealthError(e instanceof Error ? e.message : "Unreachable");
      } finally {
        setHealthLoading(false);
      }
    };
    fetchHealth();
  }, [token]);

  const backendStatus = healthLoading
    ? "CHECKING"
    : healthError
      ? "OFFLINE"
      : healthStatus?.status === "ok" || healthStatus?.status === "healthy"
        ? "ONLINE"
        : "DEGRADED";

  const statusColor = backendStatus === "ONLINE" ? S.pass : backendStatus === "CHECKING" ? S.amber : S.fail;

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary }}>

      {/* ── Header ── */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke={S.cyan} strokeWidth="1.25" />
          <path d="M8 6v4M8 5v-.5" stroke={S.cyan} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div>
          <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary, lineHeight: 1.1 }}>
            Help &amp; Documentation
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.07em", color: S.tertiary }}>
            ORDR TERMINAL · PLATFORM GUIDE
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>{renderTs}</span>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr 260px", overflow: "hidden" }}>

        {/* Left sidebar — section nav */}
        <aside style={{ borderRight: `1px solid ${S.rim}`, background: S.bgPanel, overflow: "auto", padding: "16px 0" }}>
          <div style={{ padding: "0 16px 8px", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Platform Guide
          </div>
          <div style={{ padding: "0 12px 10px" }}>
            <input
              type="text"
              placeholder="Search guides…"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "5px 10px",
                fontFamily: S.fontMono,
                fontSize: "0.6875rem",
                color: S.primary,
                background: S.bgSub,
                border: `1px solid ${S.soft}`,
                borderRadius: 2,
                outline: "none",
              }}
            />
          </div>
          {filteredSections.map((sec) => (
            <button
              key={sec.title}
              onClick={() => setActiveSection(sec.origIdx)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 16px", fontFamily: S.fontUI, fontSize: "0.75rem",
                color: activeSection === sec.origIdx ? S.cyan : S.secondary,
                background: activeSection === sec.origIdx ? `color-mix(in srgb, var(--accent-cyan) 8%, transparent)` : "transparent",
                borderLeft: activeSection === sec.origIdx ? `2px solid ${S.cyan}` : "2px solid transparent",
                cursor: "pointer", transition: "all 100ms",
              }}
            >
              {sec.title}
            </button>
          ))}

          <div style={{ height: 1, background: S.rim, margin: "12px 0" }} />
          <div style={{ padding: "0 16px 8px", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Quick Links
          </div>
          {[
            { label: "Dashboard",          path: "/dashboard"   },
            { label: "Position Desk",      path: "/input"       },
            { label: "Policy Engine",      path: "/policies"    },
            { label: "AI Policy Wizard",   path: "/ai-policy-wizard" },
            { label: "Sandbox",            path: "/sandbox"     },
            { label: "Execution Pipeline", path: "/execution"   },
            { label: "FX Rates",           path: "/currency-fx" },
            { label: "Polisophic",         path: "/polisophic"  },
            { label: "HedgeWiki",          path: "/hedgewiki"   },
            { label: "Audit Trail",        path: "/audit-trail" },
            { label: "Access Control",     path: "/access-control" },
          ].map((lnk) => (
            <button
              key={lnk.path}
              onClick={() => router.push(lnk.path)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "6px 16px", fontFamily: S.fontMono, fontSize: "0.75rem",
                color: S.tertiary, background: "transparent", cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = S.secondary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = S.tertiary)}
            >
              → {lnk.label}
            </button>
          ))}
        </aside>

        {/* Center — selected guide section */}
        <main style={{ overflow: "auto", padding: "28px 32px" }}>
          {GUIDE_SECTIONS[activeSection] && (() => {
            const sec = GUIDE_SECTIONS[activeSection];
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontFamily: S.fontUI, fontSize: "1rem", fontWeight: 700, color: S.primary }}>{sec.title}</span>
                  <button
                    onClick={() => router.push(sec.path)}
                    style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", padding: "2px 8px", border: `1px solid ${S.rim}`, color: S.cyan, background: "transparent", cursor: "pointer", letterSpacing: "0.04em" }}
                  >
                    Open →
                  </button>
                </div>
                <div style={{ height: 1, background: S.rim, marginBottom: 18 }} />
                <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, lineHeight: 1.6, marginBottom: 24, maxWidth: 600 }}>
                  {sec.description}
                </p>

                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                    Workflow Steps
                  </div>
                  <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                    {sec.steps.map((step, idx) => (
                      <li key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.cyan, minWidth: 18, marginTop: 2 }}>
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, lineHeight: 1.5 }}>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* FAQ section — special rendering for FAQ guide */}
                {activeSection === GUIDE_SECTIONS.length - 1 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 12 }}>
                      Frequently Asked Questions
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                      {FAQ_ITEMS.map((item, idx) => (
                        <FaqItem key={idx} q={item.q} a={item.a} />
                      ))}
                    </div>
                  </div>
                )}
                {/* Scenario Stress Tester callout for Simulation section */}
                {activeSection === 1 && (
                  <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "14px 18px", borderRadius: 2 }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.08em", marginBottom: 10 }}>
                      SCENARIO STRESS TESTER — CLIENT-SIDE P&amp;L ENGINE
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {["% Spot Moves", "Historic Crises", "Custom Shock"].map((chip, i) => (
                        <div key={chip} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {i > 0 && <span style={{ color: S.rim, fontSize: "0.625rem" }}>+</span>}
                          <div style={{ padding: "4px 10px", border: `1px solid ${i === 0 ? S.cyan : S.rim}`, color: i === 0 ? S.cyan : S.tertiary, fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.04em" }}>
                            {chip}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>
                      Instant P&amp;L: Unhedged · Hedged · Hedge Benefit · Efficiency %. No backend required.
                    </div>
                  
    <HelpPanel config={HELP_CENTER_HELP} storageKey="help-center" />
    </div>
                )}
              </>
            );
          })()}
        </main>

        {/* Right sidebar — diagnostics + KB */}
        <aside style={{ borderLeft: `1px solid ${S.rim}`, background: S.bgPanel, overflow: "auto", padding: "16px" }}>

          {/* System Diagnostics */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              System Diagnostics
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.secondary }}>Backend API</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: statusColor, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
                  {backendStatus}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.secondary }}>Frontend</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.pass, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: S.pass, display: "inline-block" }} />
                  ONLINE
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.secondary }}>Platform</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>{PLATFORM_VERSION}</span>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: S.rim, marginBottom: 16 }} />

          {/* Knowledge Base */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Knowledge Base
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.5, marginBottom: 10 }}>
              HedgeWiki covers FX instruments, hedge accounting standards, and platform methodology.
            </div>
            <button
              onClick={() => router.push("/hedgewiki")}
              style={{
                display: "block", width: "100%", padding: "8px 12px", marginBottom: 10,
                fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.04em",
                color: S.cyan, background: `color-mix(in srgb, var(--accent-cyan) 8%, transparent)`,
                border: `1px solid ${S.cyan}`, cursor: "pointer",
              }}
            >
              Open HedgeWiki →
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {KB_LINKS.map((lnk) => (
                <button
                  key={lnk.id}
                  onClick={() => router.push(`/hedgewiki`)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "4px 0",
                    fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.tertiary,
                    background: "transparent", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = S.secondary)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = S.tertiary)}
                >
                  {lnk.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: S.rim, marginBottom: 16 }} />

          {/* Contact Support */}
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Contact Support
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.6 }}>
              For technical issues or platform questions, contact your system administrator or the HedgeCore support team.
            </div>
            <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>
              support@hedgecore.app
            </div>
          </div>
        </aside>
      </div>

      {/* ── Footer ── */}
      <footer style={{
        display: "flex", alignItems: "center", gap: 12, height: 28,
        padding: "0 20px", borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>HedgeCore · ORDR Terminal</span>
        <span style={{ color: S.rim }}>·</span>
        <span>Platform Help &amp; Diagnostics</span>
        <span style={{ color: S.rim }}>·</span>
        <span>{renderTs}</span>
      </footer>
    </div>
  );
}
