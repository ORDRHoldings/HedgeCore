"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";

const RENDER_TS = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

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

const GUIDE_SECTIONS = [
  {
    title: "Position Desk",
    path: "/input",
    description: "Enter FX exposure positions manually, upload CSV/Excel files, or connect a database. Use the inline form to add positions instantly — they appear in the table below for duplicate, edit, delete, and IBKR execution workflow.",
    steps: [
      "Navigate to Position Desk in the top nav",
      "Use the inline entry form to add FX exposure positions",
      "Positions appear immediately in the table below",
      "Duplicate, Edit, or Delete positions using row action buttons",
      "For CONFIRMED positions: click IBKR to confirm execution and mark as fact",
      "Use Upload CSV or Connect Database tabs for bulk import",
    ],
  },
  {
    title: "Policy Engine",
    path: "/policies",
    description: "Browse all 33 system hedge policy presets organized by category. Create custom AI-powered policies using the 5-step wizard. The AI analyzes your business profile and generates 3 tailored recommendations.",
    steps: [
      "Navigate to Policy Engine in the top nav",
      "Browse system presets by category (Corporate, Financial, Sovereign, Sector)",
      "Click 'Activate Policy' on any preset to make it your active hedge policy",
      "Click '+ New AI Policy' to open the 5-step wizard",
      "Complete the wizard and review 3 AI recommendations",
      "Save your custom policy by name and tag",
      "Admin users can publish policies company-wide",
    ],
  },
  {
    title: "Execution",
    path: "/execution",
    description: "The Execution section contains two sub-tools: the Simulation Engine (stress-testing and waterfall analysis) and the Execution Bridge (bucket-level trade tickets). Run the hedge engine from the Position Desk to generate execution-ready instructions.",
    steps: [
      "Enter positions on the Position Desk and click Generate Hedge Plan",
      "The Execution Bridge opens automatically with bucket-level trade tickets",
      "Switch between NDF and Futures Proxy instrument types",
      "Copy ticket details or use the IBKR handoff button",
      "Use the Simulation Engine tab for deep scenario stress-testing and waterfall rule analysis",
      "Review the Scenario Stress Tester at any time — no data required",
    ],
  },
  {
    title: "Analysis",
    path: "/currency-fx",
    description: "Deep-dive FX analytics: exposure waterfall, currency breakdown, forward curve analysis, and IFRS 9 compliance scoring for your current position portfolio.",
    steps: [
      "Navigate to Execution → Analysis",
      "Review currency exposure breakdown and net positions",
      "Analyze forward curve against your settlement buckets",
      "Export results for governance reporting",
    ],
  },
  {
    title: "Governance (HedgeWiki)",
    path: "/hedgewiki",
    description: "Versioned knowledge graph covering FX instruments, ISDA framework, IFRS 9 standards, ASC 815, policy templates, and HedgeCore architecture. Every article links back to authoritative citations.",
    steps: [
      "Browse knowledge domains in the left sidebar",
      "Read article abstracts and authoritative citations",
      "Follow knowledge graph links to related articles",
      "Use HedgeCore field linkages to map concepts to engine fields",
    ],
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

export default function HelpPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(0);

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
          <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.07em", color: S.tertiary }}>
            ORDR TERMINAL · PLATFORM GUIDE
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{RENDER_TS}</span>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "220px 1fr 260px", overflow: "hidden" }}>

        {/* Left sidebar — section nav */}
        <aside style={{ borderRight: `1px solid ${S.rim}`, background: S.bgPanel, overflow: "auto", padding: "16px 0" }}>
          <div style={{ padding: "0 16px 8px", fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Platform Guide
          </div>
          {GUIDE_SECTIONS.map((sec, i) => (
            <button
              key={sec.title}
              onClick={() => setActiveSection(i)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 16px", fontFamily: S.fontUI, fontSize: "0.75rem",
                color: activeSection === i ? S.cyan : S.secondary,
                background: activeSection === i ? `color-mix(in srgb, var(--accent-cyan) 8%, transparent)` : "transparent",
                borderLeft: activeSection === i ? `2px solid ${S.cyan}` : "2px solid transparent",
                cursor: "pointer", transition: "all 100ms",
              }}
            >
              {sec.title}
            </button>
          ))}

          <div style={{ height: 1, background: S.rim, margin: "12px 0" }} />
          <div style={{ padding: "0 16px 8px", fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Quick Links
          </div>
          {[
            { label: "Dashboard",          path: "/dashboard"   },
            { label: "Position Desk",      path: "/input"       },
            { label: "Policy Engine",      path: "/policies"    },
            { label: "Execution Bridge",   path: "/execution"   },
            { label: "Simulation Engine",  path: "/sandbox"     },
            { label: "Analysis",           path: "/currency-fx" },
            { label: "HedgeWiki",          path: "/hedgewiki"   },
          ].map((lnk) => (
            <button
              key={lnk.path}
              onClick={() => router.push(lnk.path)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "6px 16px", fontFamily: S.fontMono, fontSize: "0.5625rem",
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
                    style={{ fontFamily: S.fontMono, fontSize: "0.5rem", padding: "2px 8px", border: `1px solid ${S.rim}`, color: S.cyan, background: "transparent", cursor: "pointer", letterSpacing: "0.04em" }}
                  >
                    Open →
                  </button>
                </div>
                <div style={{ height: 1, background: S.rim, marginBottom: 18 }} />
                <p style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, lineHeight: 1.6, marginBottom: 24, maxWidth: 600 }}>
                  {sec.description}
                </p>

                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                    Workflow Steps
                  </div>
                  <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                    {sec.steps.map((step, idx) => (
                      <li key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.cyan, minWidth: 18, marginTop: 2 }}>
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary, lineHeight: 1.5 }}>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Scenario Stress Tester callout for Simulation section */}
                {activeSection === 1 && (
                  <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "14px 18px", borderRadius: 2 }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.08em", marginBottom: 10 }}>
                      SCENARIO STRESS TESTER — CLIENT-SIDE P&amp;L ENGINE
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {["% Spot Moves", "Historic Crises", "Custom Shock"].map((chip, i) => (
                        <div key={chip} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {i > 0 && <span style={{ color: S.rim, fontSize: "0.625rem" }}>+</span>}
                          <div style={{ padding: "4px 10px", border: `1px solid ${i === 0 ? S.cyan : S.rim}`, color: i === 0 ? S.cyan : S.tertiary, fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.04em" }}>
                            {chip}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary }}>
                      Instant P&amp;L: Unhedged · Hedged · Hedge Benefit · Efficiency %. No backend required.
                    </div>
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
            <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              System Diagnostics
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>Backend API</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: statusColor, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
                  {backendStatus}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>Frontend</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.pass, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: S.pass, display: "inline-block" }} />
                  ONLINE
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary }}>Platform</span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>{PLATFORM_VERSION}</span>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: S.rim, marginBottom: 16 }} />

          {/* Knowledge Base */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Knowledge Base
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.5, marginBottom: 10 }}>
              HedgeWiki covers FX instruments, hedge accounting standards, and platform methodology.
            </div>
            <button
              onClick={() => router.push("/hedgewiki")}
              style={{
                display: "block", width: "100%", padding: "8px 12px", marginBottom: 10,
                fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.04em",
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
            <div style={{ fontFamily: S.fontMono, fontSize: "0.4375rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Contact Support
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.6 }}>
              For technical issues or platform questions, contact your system administrator or the HedgeCore support team.
            </div>
            <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>
              support@hedgecore.app
            </div>
          </div>
        </aside>
      </div>

      {/* ── Footer ── */}
      <footer style={{
        display: "flex", alignItems: "center", gap: 12, height: 28,
        padding: "0 20px", borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>HedgeCore · ORDR Terminal</span>
        <span style={{ color: S.rim }}>·</span>
        <span>Platform Help &amp; Diagnostics</span>
        <span style={{ color: S.rim }}>·</span>
        <span>{RENDER_TS}</span>
      </footer>
    </div>
  );
}
