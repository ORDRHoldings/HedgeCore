"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, FileSpreadsheet, Search, ShieldAlert, FileText,
  Calculator, Lock, Settings, ClipboardCheck, Brain, MessageSquare,
  Phone, Mic, Eye, Shield, CheckCircle,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "< 50ms", label: "Hedge calculation speed" },
  { value: "96.2%", label: "IFRS 9 pass rate (typical)" },
  { value: "60+", label: "Policy presets available" },
  { value: "4-eyes", label: "Governance requirement" },
  { value: "7yr", label: "Audit retention" },
  { value: "WORM", label: "No UPDATE, no DELETE" },
];

const CHALLENGES = [
  {
    icon: <FileSpreadsheet size={20} />,
    title: "Spreadsheet Risk",
    desc: "Critical hedge decisions rely on error-prone spreadsheets maintained by individuals. A single formula error, broken cell reference, or version conflict can produce incorrect hedge ratios that go undetected until the next audit cycle. The lack of version control, access logging, and computational verification creates systemic operational risk that regulators increasingly flag as a material control deficiency.",
  },
  {
    icon: <Search size={20} />,
    title: "Audit Trail Gaps",
    desc: "Regulators, external auditors, and internal compliance teams demand complete decision provenance for every hedge action. Spreadsheets and email chains cannot provide tamper-evident, chronologically ordered records with cryptographic integrity verification. When an auditor asks why a specific hedge ratio was applied to a specific position on a specific date, most treasury teams spend days reconstructing the answer from fragmented sources.",
  },
  {
    icon: <ShieldAlert size={20} />,
    title: "Policy Inconsistency",
    desc: "Without a governed policy engine, the same FX exposure receives different treatment depending on which analyst processes it, which desk handles it, and which quarter it falls in. Policy drift accumulates silently -- hedge ratios creep, cost thresholds shift, and approval workflows are bypassed. The result is an inconsistent risk profile that neither the CFO nor the board can reliably interpret.",
  },
  {
    icon: <FileText size={20} />,
    title: "Regulatory Reporting Burden",
    desc: "IFRS 9 hedge effectiveness testing, ASC 815 designation documentation, SOX control evidence, and local regulatory disclosures require systematic, repeatable processes that most treasury teams lack the infrastructure to support. Manual preparation of these reports consumes weeks of analyst time per quarter and remains vulnerable to human error at every step of the documentation chain.",
  },
];

const CAPABILITIES = [
  {
    icon: <Calculator size={20} />,
    title: "Deterministic Hedge Calculation",
    desc: "Import positions from any ERP or TMS, apply governed policy parameters, and generate hedge recommendations in under 50ms. The frozen v1 kernel guarantees that identical inputs always produce identical outputs -- no model drift, no stochastic variation, no hidden state. Every calculation is reproducible, verifiable, and defensible under audit scrutiny.",
    product: "ORDR Treasury",
  },
  {
    icon: <Brain size={20} />,
    title: "AI Risk Assistant",
    desc: "An Agentic AI sits above the deterministic engine, monitoring your entire position book in real time. Ask it about any position, policy, or hedge outcome using natural language. It reads your data, interprets engine outputs, and communicates proactively when it detects anomalies, approaching maturities, or policy violations. Think of it as a junior risk analyst that never sleeps and never misses a threshold breach.",
    product: "ORDR Treasury",
  },
  {
    icon: <Lock size={20} />,
    title: "WORM Audit Trail",
    desc: "Every decision, calculation, and approval is recorded in a SHA-256 hash-chained, append-only event log. WORM (Write Once, Read Many) semantics mean that no record can be modified or deleted after creation. Each event includes the previous hash, creating a tamper-evident chain that satisfies SOX Section 404, IFRS 9 documentation requirements, and enterprise internal audit standards.",
    product: "ORDR Treasury",
  },
  {
    icon: <Settings size={20} />,
    title: "Policy Governance Engine",
    desc: "60 pre-built policy templates with configurable hedge ratios, maturity profiles, governance tiers, cost thresholds, and compliance guardrails. Policies are version-controlled with full revision history. The AI assistant can recommend policy configurations based on your exposure profile and regulatory environment, but every policy change requires explicit human approval through the 4-eyes workflow.",
    product: "ORDR Treasury",
  },
  {
    icon: <ClipboardCheck size={20} />,
    title: "IFRS 9 / ASC 815 Effectiveness",
    desc: "Prospective hedge effectiveness assessment with critical terms match and statistical forecast methods. The engine evaluates designation criteria, computes effectiveness ratios, and generates documentation packages that auditors can verify independently. The AI assistant flags potential effectiveness failures before they occur, giving treasury teams time to adjust hedge relationships proactively.",
    product: "ORDR Treasury",
  },
  {
    icon: <Shield size={20} />,
    title: "4-Eyes Governance Pipeline",
    desc: "Every execution proposal passes through a tri-state pipeline (Sandbox, Staging, Ledger) with maker-checker approval and enforced separation of duties. The same user cannot both create and approve a proposal. The AI assistant tracks pending approvals, notifies checkers of outstanding items, and provides decision context -- but it cannot bypass the human approval requirement.",
    product: "ORDR Treasury",
  },
];

const AI_FEATURES = [
  {
    icon: <MessageSquare size={18} />,
    title: "Chat",
    desc: "Ask questions about positions, policies, and hedge outcomes in natural language through the integrated chatbox. The AI has read access to your entire position book and policy configuration.",
  },
  {
    icon: <Phone size={18} />,
    title: "Phone",
    desc: "Call the AI Risk Assistant for hands-free status updates during meetings, commutes, or while working across multiple systems. Voice responses are concise and structured for decision-making.",
  },
  {
    icon: <Mic size={18} />,
    title: "Voice Commands",
    desc: "Issue voice commands directly within the ORDR terminal to query positions, check hedge status, or request scenario analysis. The AI understands treasury-specific terminology and context.",
  },
  {
    icon: <Eye size={18} />,
    title: "Proactive Monitoring",
    desc: "The AI continuously monitors your position book for approaching maturities, policy threshold breaches, hedge effectiveness deterioration, and market condition changes that affect your exposure profile.",
  },
];

const PRODUCTS_USED = [
  { name: "ORDR Treasury", desc: "Core hedge calculation, policy governance, and execution pipeline" },
  { name: "ORDR Portfolio", desc: "Exposure decomposition and multi-currency risk analysis" },
  { name: "ORDR Labs", desc: "Scenario stress testing, backtesting, and Monte Carlo simulation" },
];

export default function CorporateTreasuryPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/solutions" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: F.ui, fontSize: 14, color: C.textSub, textDecoration: "none",
          marginBottom: 32,
        }}>
          <ChevronLeft size={14} /> All Solutions
        </Link>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 600,
          letterSpacing: "0.1em", color: C.textMuted,
          marginBottom: 16, textTransform: "uppercase",
        }}>
          INDUSTRY SOLUTION
        </div>
        <h1 style={{
          fontFamily: F.heading, fontSize: 48, fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 20px",
          color: C.accent,
        }}>
          Corporate Treasury
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 640, margin: "0 auto 16px", lineHeight: 1.7,
        }}>
          End-to-end FX risk management for multinational treasury operations. Deterministic
          hedge calculations ensure mathematical precision while an Agentic AI Risk Assistant
          provides real-time insight, proactive monitoring, and natural-language communication
          across chat, phone, and voice.
        </p>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textMuted,
          maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6,
        }}>
          Replace spreadsheets with a governed computation engine. Replace manual monitoring
          with an AI assistant that understands your positions, your policies, and your regulatory
          obligations.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: "#fff", background: C.accent,
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
          }}>
            Get Started <ArrowRight size={16} />
          </Link>
          <Link href="/contact" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: C.textSub, border: `1.5px solid ${C.border}`,
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
          }}>
            Request Demo
          </Link>
        </div>
      </section>

      {/* Stats Strip */}
      <section style={{ background: C.accent, padding: "40px 48px" }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 24,
        }}>
          {STATS.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: F.mono, fontSize: 26, fontWeight: 800,
                color: "#FFFFFF", marginBottom: 4, letterSpacing: "-0.02em",
              }}>
                {s.value}
              </div>
              <div style={{
                fontFamily: F.ui, fontSize: 12, color: "rgba(255,255,255,0.65)",
                lineHeight: 1.4,
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Challenges */}
      <section style={{ background: C.bgAlt, padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.1em", color: C.textMuted,
            marginBottom: 12, textAlign: "center", textTransform: "uppercase",
          }}>
            THE PROBLEM
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", textAlign: "center", color: C.text,
          }}>
            Challenges Facing Corporate Treasury Teams
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 640, margin: "0 auto 48px", textAlign: "center", lineHeight: 1.6,
          }}>
            Most treasury teams operate with tooling that was adequate a decade ago. As regulatory
            expectations, audit requirements, and exposure complexity have grown, the gap between
            what spreadsheets can provide and what compliance demands has become untenable.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CHALLENGES.map((c) => (
              <div key={c.title} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(220, 38, 38, 0.06)", color: "#DC2626",
                  }}>
                    {c.icon}
                  </div>
                  <h3 style={{
                    fontFamily: F.heading, fontSize: 17, fontWeight: 700,
                    margin: 0, color: C.text,
                  }}>
                    {c.title}
                  </h3>
                </div>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  lineHeight: 1.7, margin: 0,
                }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SVG Diagram: Corporate Treasury Workflow */}
      <section style={{ padding: "96px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.1em", color: C.textMuted,
            marginBottom: 12, textTransform: "uppercase",
          }}>
            WORKFLOW
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
          }}>
            Corporate Treasury Workflow
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 600, margin: "0 auto", lineHeight: 1.6,
          }}>
            From exposure import to hedge execution, every step is deterministic,
            governed, and monitored by the AI Risk Assistant.
          </p>
        </div>
        <svg viewBox="0 0 1000 380" width="100%" style={{ display: "block" }}>
          <defs>
            <marker id="ctArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>

          {/* Step boxes */}
          {[
            { x: 20, label: "Exposure\nImport", sub: "ERP / TMS / CSV" },
            { x: 182, label: "Policy\nAssignment", sub: "60 Templates" },
            { x: 344, label: "Deterministic\nCalculation", sub: "<50ms Kernel" },
            { x: 506, label: "AI Review\n& Insight", sub: "Anomaly Check" },
            { x: 668, label: "4-Eyes\nApproval", sub: "Maker / Checker" },
            { x: 830, label: "Execution\n& Audit", sub: "WORM Ledger" },
          ].map((step, i) => (
            <g key={step.label}>
              <rect x={step.x} y="80" width="140" height="80" rx="8"
                fill={i === 3 ? "#1E3A5F" : "#F7F8FA"}
                stroke={i === 3 ? "#1E3A5F" : "#E5E7EB"} strokeWidth="1.5" />
              {step.label.split("\n").map((line, li) => (
                <text key={li} x={step.x + 70} y={106 + li * 18}
                  textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif"
                  fontSize="12" fontWeight="600"
                  fill={i === 3 ? "#FFFFFF" : "#1E3A5F"}>
                  {line}
                </text>
              ))}
              <text x={step.x + 70} y="148" textAnchor="middle"
                fontFamily="'IBM Plex Mono', monospace" fontSize="9"
                fill={i === 3 ? "rgba(255,255,255,0.6)" : "#999999"}>
                {step.sub}
              </text>
              {i < 5 && (
                <line x1={step.x + 140} y1="120" x2={step.x + 182} y2="120"
                  stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#ctArrow)" />
              )}
            </g>
          ))}

          {/* Step numbers */}
          {[20, 182, 344, 506, 668, 830].map((x, i) => (
            <g key={`num-${i}`}>
              <circle cx={x + 70} cy="56" r="14" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x={x + 70} y="60" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace"
                fontSize="11" fontWeight="700" fill="#1E3A5F" dominantBaseline="middle">
                {i + 1}
              </text>
            </g>
          ))}

          {/* AI layer annotation */}
          <rect x="140" y="200" width="720" height="60" rx="8" fill="rgba(30,58,95,0.04)" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="4,4" />
          <text x="500" y="224" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#1E3A5F" letterSpacing="0.08em">
            AI RISK ASSISTANT: CONTINUOUS MONITORING ACROSS ALL STEPS
          </text>
          <text x="500" y="246" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fill="#555555">
            Communicates via chat, phone, and voice -- monitors positions 24/7 -- never overrides the engine
          </text>

          {/* Dashed lines from steps to AI layer */}
          {[90, 252, 414, 576, 738, 900].map((x, i) => (
            <line key={`dash-${i}`} x1={x} y1="160" x2={x} y2="200"
              stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
          ))}

          {/* Audit hash chain at bottom */}
          <rect x="200" y="290" width="600" height="50" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="500" y="312" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            SHA-256 HASH CHAIN -- APPEND-ONLY AUDIT LOG -- WORM SEMANTICS
          </text>
          <text x="500" y="330" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fill="#999999">
            Every step recorded immutably. Tamper-evident. Regulator-ready.
          </text>
        </svg>
      </section>

      {/* Sample Calculation Output */}
      <section style={{ background: C.bgAlt, padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.1em", color: C.textMuted,
            marginBottom: 12, textAlign: "center", textTransform: "uppercase",
          }}>
            SAMPLE OUTPUT
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 12px", textAlign: "center", color: C.text,
          }}>
            Sample Calculation Output
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 600, margin: "0 auto 40px", textAlign: "center", lineHeight: 1.6,
          }}>
            This is what the ORDR kernel actually produces. Every run is hash-sealed and submitted
            for 4-eyes approval before anything reaches the ledger.
          </p>
          <div style={{
            background: "#0A0A0A", border: "1px solid #1E293B",
            borderRadius: 12, padding: "32px 36px", overflowX: "auto",
          }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
              color: "#E2E8F0", lineHeight: 1.9, whiteSpace: "pre",
            }}>
              <span style={{ color: "#E2E8F0", fontWeight: 700 }}>ORDR TREASURY · CALCULATION RUN #1847{"\n"}</span>
              <span style={{ color: "#6B7280" }}>{"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"}{"\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"TIMESTAMP    "}</span><span>{"2026-03-23T09:14:32.048Z\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"POLICY       "}</span><span>{"MODERATE_HEDGE_60PCT_v3\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"KERNEL       "}</span><span>{"v1.4.1 · 41 modules · 48ms\n"}</span>
              {"\n"}
              <span style={{ color: "#93C5FD" }}>{"POSITIONS PROCESSED:  "}</span><span>{"24/24\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"CURRENCIES:           "}</span><span>{"EUR, GBP, JPY, CHF, CAD, AUD, MXN, BRL\n"}</span>
              {"\n"}
              <span style={{ color: "#93C5FD" }}>{"EUR/USD  PAYABLE    "}</span><span>{"$4,200,000  90D → FWD  $2,520,000  (60%)  rate 1.0842\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"GBP/USD  RECEIVABLE "}</span><span>{"$1,800,000  60D → COLL $1,800,000 (100%)  rate 1.2634\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"JPY/USD  PAYABLE  "}</span><span>{"¥320,000,000  30D → NDF  ¥192,000,000 (60%)  rate 149.82\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"CHF/USD  PAYABLE    "}</span><span>{"$  940,000  90D → FWD  $  564,000  (60%)  rate 0.9021\n"}</span>
              <span style={{ color: "#6B7280" }}>{"... +20 positions\n"}</span>
              {"\n"}
              <span style={{ color: "#93C5FD" }}>{"HEDGE COST (EST)     "}</span><span>{"0.23% annualized\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"EFFECTIVENESS (FWD)  "}</span><span style={{ color: "#22C55E" }}>{"96.2%  → IFRS 9: PASS\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"HASH                 "}</span><span style={{ color: "#6B7280" }}>{"8f4e2b9a1c3d5e7f...a1b2c3d4\n"}</span>
              {"\n"}
              <span style={{ color: "#6B7280" }}>{"[SUBMITTED FOR 4-EYES APPROVAL]\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"MAKER: "}</span><span>{"jsmith@corp.com · 2026-03-23T09:16:00Z\n"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section style={{ padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.1em", color: C.textMuted,
            marginBottom: 12, textAlign: "center", textTransform: "uppercase",
          }}>
            CAPABILITIES
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", textAlign: "center", color: C.text,
          }}>
            How ORDR Solves This
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 640, margin: "0 auto 48px", textAlign: "center", lineHeight: 1.6,
          }}>
            A deterministic computation engine for accuracy and auditability, combined with
            an Agentic AI assistant for insight, evaluation, and communication.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24, marginBottom: 40 }}>
            {CAPABILITIES.map((c) => (
              <div key={c.title} style={{
                background: C.bgAlt, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: C.accentLight, color: C.accent,
                  }}>
                    {c.icon}
                  </div>
                  <span style={{
                    fontFamily: F.mono, fontSize: 11, fontWeight: 600,
                    color: C.accent, letterSpacing: "0.06em",
                  }}>
                    {c.product.toUpperCase()}
                  </span>
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 17, fontWeight: 700,
                  margin: "0 0 10px", color: C.text,
                }}>
                  {c.title}
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  lineHeight: 1.7, margin: 0,
                }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>

          {/* IFRS 9 Effectiveness Report Card */}
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: 12,
            overflow: "hidden",
          }}>
            <div style={{
              background: C.accent, padding: "16px 28px",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <CheckCircle size={18} color="#fff" />
              <span style={{
                fontFamily: F.mono, fontSize: 12, fontWeight: 700,
                color: "#fff", letterSpacing: "0.08em",
              }}>
                IFRS 9 EFFECTIVENESS REPORT — SPECIMEN
              </span>
              <span style={{
                marginLeft: "auto", fontFamily: F.mono, fontSize: 10,
                color: "rgba(255,255,255,0.55)", letterSpacing: "0.05em",
              }}>
                WORM-SEALED · READ-ONLY
              </span>
            </div>
            <div style={{
              background: C.bgAlt, padding: "28px 28px",
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0,
            }}>
              {[
                { label: "Hedge Pair", value: "EUR/USD Forward" },
                { label: "Method", value: "Critical Terms Match" },
                { label: "Hedge Ratio", value: "60%" },
                { label: "Prospective Test", value: "PASS (96.2%)", highlight: true },
                { label: "Designation Date", value: "2026-03-23" },
                { label: "Standard", value: "IFRS 9 / IAS 39" },
              ].map((row, i) => (
                <div key={row.label} style={{
                  padding: "16px 20px",
                  borderBottom: i < 3 ? `1px solid ${C.border}` : undefined,
                  borderRight: (i % 3 !== 2) ? `1px solid ${C.border}` : undefined,
                }}>
                  <div style={{
                    fontFamily: F.mono, fontSize: 10, fontWeight: 600,
                    color: C.textMuted, letterSpacing: "0.08em",
                    marginBottom: 6, textTransform: "uppercase",
                  }}>
                    {row.label}
                  </div>
                  <div style={{
                    fontFamily: F.mono, fontSize: 14, fontWeight: 700,
                    color: row.highlight ? "#22C55E" : C.text,
                  }}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              background: "#0A0A0A", padding: "14px 28px",
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <span style={{
                fontFamily: F.mono, fontSize: 10, color: "#6B7280",
                letterSpacing: "0.05em",
              }}>
                EVIDENCE:
              </span>
              <span style={{
                fontFamily: F.mono, fontSize: 10, color: "#93C5FD",
              }}>
                WORM-sealed · hash c3d4...9f8e · no retroactive edits permitted
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* AI Risk Assistant Callout */}
      <section style={{ padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            background: C.accent, borderRadius: 16, padding: "56px 48px",
          }}>
            <div style={{ maxWidth: 680, margin: "0 auto" }}>
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)",
                marginBottom: 16, textTransform: "uppercase",
              }}>
                AGENTIC AI
              </div>
              <h2 style={{
                fontFamily: F.heading, fontSize: 36, fontWeight: 800,
                color: "#fff", margin: "0 0 16px", letterSpacing: "-0.02em",
              }}>
                Your AI Risk Assistant
              </h2>
              <p style={{
                fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.75)",
                lineHeight: 1.7, margin: "0 0 40px",
              }}>
                ORDR Treasury includes an Agentic AI that functions like a dedicated risk analyst
                on your team. It has read access to your positions, understands your policy
                configuration, and monitors your hedge book continuously. Communicate with it
                through any channel -- it responds with the same context awareness regardless
                of interface.
              </p>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16,
              maxWidth: 900, margin: "0 auto",
            }}>
              {AI_FEATURES.map((f) => (
                <div key={f.title} style={{
                  background: "rgba(255,255,255,0.08)", borderRadius: 10,
                  padding: "24px 20px",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(255,255,255,0.12)", color: "#fff",
                    marginBottom: 14,
                  }}>
                    {f.icon}
                  </div>
                  <h4 style={{
                    fontFamily: F.heading, fontSize: 15, fontWeight: 700,
                    color: "#fff", margin: "0 0 8px",
                  }}>
                    {f.title}
                  </h4>
                  <p style={{
                    fontFamily: F.ui, fontSize: 13, color: "rgba(255,255,255,0.6)",
                    lineHeight: 1.6, margin: 0,
                  }}>
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Products Used */}
      <section style={{ background: C.bgAlt, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 28, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 32px", textAlign: "center", color: C.text,
          }}>
            Products Used
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {PRODUCTS_USED.map((p) => (
              <div key={p.name} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "24px 20px", textAlign: "center",
              }}>
                <div style={{
                  fontFamily: F.mono, fontSize: 13, fontWeight: 700,
                  color: C.accent, marginBottom: 8, letterSpacing: "0.02em",
                }}>
                  {p.name}
                </div>
                <p style={{
                  fontFamily: F.ui, fontSize: 13, color: C.textSub,
                  lineHeight: 1.5, margin: 0,
                }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "96px 48px", textAlign: "center" }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 36, fontWeight: 800,
          color: "#fff", margin: "0 0 16px", letterSpacing: "-0.02em",
        }}>
          Ready to modernize your treasury?
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Replace spreadsheets with deterministic, governed hedge computation --
          and an AI assistant that monitors your positions around the clock.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: C.accent, background: "#fff",
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
          }}>
            Get Started <ArrowRight size={16} />
          </Link>
          <Link href="/contact" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: "rgba(255,255,255,0.8)",
            border: "1.5px solid rgba(255,255,255,0.3)",
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
          }}>
            Contact Sales
          </Link>
        </div>
      </section>

      <style>{`
        @media(max-width:768px){
          section{padding:60px 20px !important}
          h1{font-size:36px !important}
          h2{font-size:24px !important}
          div[style*="grid-template-columns: repeat(2"]{grid-template-columns:1fr !important}
          div[style*="grid-template-columns: repeat(3"]{grid-template-columns:1fr !important}
          div[style*="grid-template-columns: repeat(4"]{grid-template-columns:1fr 1fr !important}
          svg{min-height:300px}
        }
      `}</style>
    </MarketingLayout>
  );
}
