"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Layers, Activity, Users,
  Monitor, Brain, AlertTriangle,
  Gauge, Globe,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "R1-R8", label: "Risk taxonomy (8 categories)" },
  { value: "95%", label: "VaR confidence level" },
  { value: "190+", label: "Countries in Polisophic" },
  { value: "<50ms", label: "Risk calculation speed" },
  { value: "Monte Carlo", label: "Simulation method" },
  { value: "WORM", label: "Audit chain" },
];

const CHALLENGES = [
  {
    icon: <Layers size={20} />,
    title: "Risk Taxonomy Gaps",
    desc: "Most risk frameworks collapse FX into a single bucket. ORDR decomposes into 8 categories: directional, basis, gamma, theta, vega, liquidity, counterparty, and operational risk. Each category has its own measurement methodology, limit framework, and reporting cadence — enabling risk committees to see the full picture rather than a single blended number.",
  },
  {
    icon: <AlertTriangle size={20} />,
    title: "VaR Black Boxes",
    desc: "Standard VaR models are opaque. ORDR's deterministic kernel produces the same VaR for the same inputs every time — reproducible, verifiable, defensible to the board. When an auditor or regulator challenges a VaR figure, the treasury team can reconstruct the exact calculation from the same inputs and confirm identical outputs. No hidden state, no model drift.",
  },
  {
    icon: <Globe size={20} />,
    title: "Geopolitical Blind Spots",
    desc: "Market risk models ignore geopolitical regime changes until after they happen. ORDR Polisophic scores 190+ country corridors proactively, assigning risk ratings across sanctions exposure, political transition probability, capital controls risk, and central bank policy regime. Corridor scores update continuously and feed directly into the R1-R8 decomposition.",
  },
  {
    icon: <Monitor size={20} />,
    title: "Report Assembly",
    desc: "Board risk reports are assembled manually from multiple systems. ORDR generates them deterministically from a single source of truth — the same engine that produced the underlying calculations. Every number in the report is traceable to a specific calculation run, hash, and timestamp. Assembly time drops from weeks to minutes.",
  },
];

const CAPABILITIES = [
  {
    icon: <Layers size={20} />,
    title: "R1-R8 Risk Taxonomy",
    desc: "Structured risk classification across 8 dimensions with quantified exposure decomposition and attribution. Every position is mapped to a standardized risk category, enabling consistent aggregation, comparison, and reporting across business units, geographies, and time periods. The taxonomy is frozen in the v1 architecture to ensure stability and cross-period comparability.",
    product: "ORDR Portfolio",
  },
  {
    icon: <Gauge size={20} />,
    title: "VaR, Expected Shortfall & Scenarios",
    desc: "Historical Value-at-Risk at 95% confidence, expected shortfall at 97.5%, and configurable Monte Carlo shock packs provide comprehensive tail risk measurement. Every scenario run is hash-chained and append-only, creating a verifiable audit trail for risk committee and regulatory review. The same inputs always produce the same outputs — no stochastic variation between runs.",
    product: "ORDR Labs",
  },
  {
    icon: <Globe size={20} />,
    title: "Polisophic Geopolitical Overlay",
    desc: "190+ country corridor scores across sanctions risk, political transition probability, capital controls exposure, and monetary regime stability. Scores feed directly into the R7 counterparty and R8 operational risk buckets. Risk officers see geopolitical risk quantified alongside market risk — not in a separate PDF from a separate vendor.",
    product: "ORDR Polisophic",
  },
  {
    icon: <Brain size={20} />,
    title: "AI Anomaly Detection & Interpretation",
    desc: "The Agentic AI layer continuously monitors risk metrics, position changes, and market conditions. It detects anomalies — unusual position concentrations, rapid exposure growth, policy threshold approaches, effectiveness deterioration — and surfaces them proactively. The AI interprets deterministic outputs and alerts risk officers to conditions that warrant attention without modifying the underlying calculations.",
    product: "ORDR Treasury",
  },
  {
    icon: <Activity size={20} />,
    title: "Real-Time Market Intelligence",
    desc: "Live FX spot rates, forward curves, and volatility surfaces from multiple data providers with automatic failover. Configurable alert thresholds trigger notifications when market moves affect exposure profiles. The ORDR FinHub data layer provides macroeconomic indicators and central bank policy data that contextualize risk metrics beyond raw market price.",
    product: "ORDR FinHub",
  },
  {
    icon: <Users size={20} />,
    title: "4-Eyes Governance & RBAC",
    desc: "Maker-checker workflows with enforced separation of duties ensure that no single individual can both propose and approve a risk-affecting action. 9 roles with 41 granular permissions control access to every function. The WORM audit trail records every decision with SHA-256 hash-chain integrity, providing tamper-evident evidence for internal audit, regulatory examination, and board reporting.",
    product: "ORDR Treasury",
  },
];

const PRODUCTS_USED = [
  { name: "ORDR Portfolio", desc: "Core R1-R8 decomposition, VaR, concentration analysis" },
  { name: "ORDR Labs", desc: "Monte Carlo, scenario stress testing, backtesting" },
  { name: "ORDR Polisophic", desc: "190+ country geopolitical corridor scoring" },
  { name: "ORDR FinHub", desc: "Macro data, central bank policy, market data feeds" },
];

const GEO_CORRIDORS = [
  { pair: "EUR/TRY", score: 74, level: "HIGH", note: "sanctions risk elevated" },
  { pair: "USD/MXN", score: 52, level: "MODERATE", note: "political transition" },
  { pair: "USD/BRL", score: 58, level: "MODERATE", note: "fiscal policy uncertainty" },
  { pair: "USD/JPY", score: 31, level: "LOW", note: "stable monetary regime" },
];

export default function RiskManagementPage() {
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
          Enterprise Risk Management
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 640, margin: "0 auto 16px", lineHeight: 1.7,
        }}>
          R1-R8 risk decomposition, VaR, scenario stress testing, and geopolitical risk scoring
          — all deterministic, all auditable. Every risk metric is reproducible, verifiable,
          and defensible to the board.
        </p>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textMuted,
          maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6,
        }}>
          The deterministic engine computes. The Agentic AI interprets. Together, they give
          risk teams both precision and intelligence.
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
                fontFamily: F.mono, fontSize: 22, fontWeight: 800,
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

      {/* The Problem */}
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
            Challenges Facing Enterprise Risk Teams
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 640, margin: "0 auto 48px", textAlign: "center", lineHeight: 1.6,
          }}>
            Risk management infrastructure must balance computational rigor with operational
            agility. Most organizations struggle with one or more of these systemic challenges.
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

      {/* R1-R8 Terminal Panel */}
      <section style={{ padding: "96px 48px" }}>
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
            R1-R8 Risk Decomposition Run
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 600, margin: "0 auto 40px", textAlign: "center", lineHeight: 1.6,
          }}>
            This is what the ORDR engine actually produces for a 47-position book. Every run
            is hash-sealed and immutable once committed to the ledger.
          </p>
          <div style={{
            background: "#0A0A0A", border: "1px solid #1E293B",
            borderRadius: 12, padding: "32px 36px", overflowX: "auto",
          }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
              color: "#E2E8F0", lineHeight: 1.9, whiteSpace: "pre",
            }}>
              <span style={{ color: "#E2E8F0", fontWeight: 700 }}>{"ORDR PORTFOLIO · RISK DECOMPOSITION RUN\n"}</span>
              <span style={{ color: "#6B7280" }}>{"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"PORTFOLIO    "}</span><span>{"Corp FX Book Q1-2026\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"POSITIONS    "}</span><span>{"47 positions · 11 currencies\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"TIMESTAMP    "}</span><span>{"2026-03-23T08:45:00Z\n"}</span>
              {"\n"}
              <span style={{ color: "#93C5FD" }}>{"R1  DIRECTIONAL    "}</span><span>{"$12.4M net short USD    "}</span><span style={{ color: "#3B82F6" }}>{"████████░░  "}</span><span>{"62%\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"R2  BASIS           "}</span><span>{"$1.8M cross-currency   "}</span><span style={{ color: "#3B82F6" }}>{"████░░░░░░  "}</span><span>{"22%\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"R3  GAMMA           "}</span><span>{"$0.3M option convexity "}</span><span style={{ color: "#3B82F6" }}>{"██░░░░░░░░   "}</span><span>{"8%\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"R4  THETA           "}</span><span>{"$0.1M time decay       "}</span><span style={{ color: "#3B82F6" }}>{"█░░░░░░░░░   "}</span><span>{"3%\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"R5  VEGA            "}</span><span>{"$0.2M vol exposure     "}</span><span style={{ color: "#3B82F6" }}>{"█░░░░░░░░░   "}</span><span>{"4%\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"R6  LIQUIDITY       "}</span><span>{"LOW · 98% G10 pairs    "}</span><span style={{ color: "#6B7280" }}>{"░░░░░░░░░░  "}</span><span style={{ color: "#22C55E" }}>{"OK\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"R7  COUNTERPARTY    "}</span><span>{"2 banks > 30% share    "}</span><span style={{ color: "#3B82F6" }}>{"██░░░░░░░░  "}</span><span style={{ color: "#F59E0B" }}>{"WATCH\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"R8  OPERATIONAL     "}</span><span>{"3 manual overrides     "}</span><span style={{ color: "#3B82F6" }}>{"█░░░░░░░░░  "}</span><span style={{ color: "#F59E0B" }}>{"REVIEW\n"}</span>
              {"\n"}
              <span style={{ color: "#93C5FD" }}>{"VaR (95%, 1-day)   "}</span><span>{"$2,106,000\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"ES  (97.5%, 1-day)  "}</span><span>{"$2,890,000\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"HHI CONCENTRATION   "}</span><span>{"0.231 (MODERATE)\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"MAX DRAWDOWN (90D)  "}</span><span>{"8.3%\n"}</span>
              {"\n"}
              <span style={{ color: "#93C5FD" }}>{"HASH  "}</span><span style={{ color: "#6B7280" }}>{"c3d4...9f8e · WORM SEALED\n"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* SVG Diagram: Risk Architecture */}
      <section style={{ background: C.bgAlt, padding: "96px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.1em", color: C.textMuted,
            marginBottom: 12, textTransform: "uppercase",
          }}>
            ARCHITECTURE
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
          }}>
            Risk Management Architecture
          </h2>
        </div>
        <svg viewBox="0 0 1000 440" width="100%" style={{ display: "block" }}>
          <defs>
            <marker id="rmArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>

          {/* Left: Data Sources */}
          <rect x="20" y="60" width="160" height="280" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="100" y="85" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">DATA SOURCES</text>
          {["FX Spot Rates", "Forward Curves", "Vol Surfaces", "Position Book", "Policy Config"].map((label, i) => (
            <g key={label}>
              <rect x="35" y={100 + i * 44} width="130" height="32" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="100" y={120 + i * 44} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">{label}</text>
            </g>
          ))}

          <line x1="180" y1="200" x2="230" y2="200" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#rmArrow)" />

          {/* Center: Risk Engine */}
          <rect x="240" y="60" width="260" height="280" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="370" y="85" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">DETERMINISTIC RISK ENGINE</text>
          {["R1-R8 Taxonomy", "Hedge Kernel", "VaR / ES Engine", "Effectiveness Test", "Scenario Engine"].map((label, i) => (
            <g key={label}>
              <rect x="258" y={100 + i * 44} width="224" height="32" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="370" y={120 + i * 44} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">{label}</text>
            </g>
          ))}

          <line x1="500" y1="200" x2="550" y2="200" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#rmArrow)" />

          {/* Right Top: AI Analysis */}
          <rect x="560" y="60" width="200" height="130" rx="8" fill="#1E3A5F" />
          <text x="660" y="85" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.6)" letterSpacing="0.08em">AI ANALYSIS LAYER</text>
          {["Anomaly Detection", "Scenario Evaluation", "Natural Language"].map((label, i) => (
            <g key={label}>
              <rect x="575" y={100 + i * 28} width="170" height="22" rx="4" fill="rgba(255,255,255,0.12)" />
              <text x="660" y={115 + i * 28} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#FFFFFF">{label}</text>
            </g>
          ))}

          <line x1="760" y1="125" x2="800" y2="125" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#rmArrow)" />

          {/* Right: Output */}
          <rect x="810" y="60" width="160" height="130" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="890" y="85" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">OUTPUT</text>
          {["Risk Dashboard", "Alert Engine", "Board Reports"].map((label, i) => (
            <g key={label}>
              <rect x="825" y={100 + i * 28} width="130" height="22" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="890" y={115 + i * 28} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">{label}</text>
            </g>
          ))}

          {/* Bottom: Governance */}
          <rect x="240" y="370" width="730" height="50" rx="8" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="1.5" />
          <text x="605" y="395" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">GOVERNANCE: WORM AUDIT — 4-EYES APPROVAL — HASH CHAIN — RBAC (41 PERMISSIONS)</text>
          <text x="605" y="412" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fill="#999999">Every calculation, decision, and alert is recorded immutably in the append-only audit log</text>

          <line x1="370" y1="340" x2="370" y2="370" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
          <line x1="660" y1="190" x2="660" y2="370" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
          <line x1="890" y1="190" x2="890" y2="370" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
        </svg>
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
            letterSpacing: "-0.02em", margin: "0 0 48px", textAlign: "center", color: C.text,
          }}>
            How ORDR Helps
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
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
        </div>
      </section>

      {/* Geopolitical Corridor Table */}
      <section style={{ background: C.bgAlt, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
            <div>
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.1em", color: C.textMuted,
                marginBottom: 12, textTransform: "uppercase",
              }}>
                ORDR POLISOPHIC
              </div>
              <h2 style={{
                fontFamily: F.heading, fontSize: 30, fontWeight: 700,
                letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
              }}>
                Geopolitical Risk Overlay
              </h2>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: C.textSub,
                lineHeight: 1.7, margin: "0 0 24px",
              }}>
                Polisophic scores 190+ FX corridor pairs across sanctions exposure,
                political transition risk, capital controls probability, and monetary
                regime stability. Scores feed directly into R7 and R8 buckets — so
                geopolitical risk appears in your standard risk report, not a
                separate PDF.
              </p>
              <p style={{
                fontFamily: F.ui, fontSize: 14, color: C.textMuted,
                lineHeight: 1.6, margin: 0,
              }}>
                Score range: 0 (negligible) — 100 (critical). Updated continuously
                from regulatory feeds, news intelligence, and country rating agencies.
              </p>
            </div>
            <div>
              <div style={{
                background: "#0A0A0A", border: "1px solid #1E293B",
                borderRadius: 12, overflow: "hidden",
              }}>
                <div style={{
                  padding: "12px 20px", borderBottom: "1px solid #1E293B",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <Globe size={14} color="#93C5FD" />
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                    fontWeight: 700, color: "#93C5FD", letterSpacing: "0.08em",
                  }}>
                    POLISOPHIC · CORRIDOR SCORES
                  </span>
                </div>
                <div style={{ padding: "0" }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "80px 60px 100px 1fr",
                    padding: "8px 20px", borderBottom: "1px solid #1A2332",
                  }}>
                    {["PAIR", "SCORE", "LEVEL", "DRIVER"].map((h) => (
                      <span key={h} style={{
                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                        color: "#6B7280", letterSpacing: "0.08em",
                      }}>{h}</span>
                    ))}
                  </div>
                  {GEO_CORRIDORS.map((row) => {
                    const levelColor = row.level === "HIGH" ? "#EF4444"
                      : row.level === "MODERATE" ? "#F59E0B"
                      : "#22C55E";
                    return (
                      <div key={row.pair} style={{
                        display: "grid", gridTemplateColumns: "80px 60px 100px 1fr",
                        padding: "10px 20px", borderBottom: "1px solid #1A2332",
                      }}>
                        <span style={{
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
                          color: "#E2E8F0", fontWeight: 700,
                        }}>{row.pair}</span>
                        <span style={{
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
                          color: levelColor, fontWeight: 700,
                        }}>{row.score}</span>
                        <span style={{
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                          color: levelColor,
                        }}>{row.level}</span>
                        <span style={{
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                          color: "#6B7280",
                        }}>{row.note}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Products Used */}
      <section style={{ padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 28, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 32px", textAlign: "center", color: C.text,
          }}>
            Products Used
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {PRODUCTS_USED.map((p) => (
              <div key={p.name} style={{
                background: C.bgAlt, border: `1px solid ${C.border}`,
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
          Elevate your risk infrastructure
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Deterministic risk computation with AI-powered insight. Built for
          the governance and audit standards of institutional risk management.
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
          div[style*="grid-template-columns: repeat(4"]{grid-template-columns:repeat(2,1fr) !important}
          div[style*="grid-template-columns: repeat(6"]{grid-template-columns:repeat(3,1fr) !important}
          div[style*="grid-template-columns: 1fr 1fr"]{grid-template-columns:1fr !important}
          svg{min-height:350px}
        }
      `}</style>
    </MarketingLayout>
  );
}
