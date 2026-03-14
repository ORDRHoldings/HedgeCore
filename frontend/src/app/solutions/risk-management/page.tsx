"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Layers, Activity, FlaskConical, Users,
  Network, Monitor, BarChart3, Shield, Brain, AlertTriangle,
  Eye, TrendingUp, Database, Bell, Gauge, Lock,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const CHALLENGES = [
  {
    icon: <Network size={20} />,
    title: "Fragmented Risk Views",
    desc: "Risk exposures scattered across treasury management systems, trading platforms, ERP modules, and analyst spreadsheets make enterprise-wide risk quantification unreliable. When the CRO asks for total FX exposure by currency, the answer requires days of manual aggregation from disparate sources -- and by the time the report is assembled, the underlying data has already shifted. This fragmentation creates blind spots that regulators increasingly treat as material control deficiencies.",
  },
  {
    icon: <AlertTriangle size={20} />,
    title: "Model Risk",
    desc: "Proprietary risk models that lack transparency, reproducibility, and independent verification create model risk that compounds the very exposures they are meant to measure. When a model produces unexpected results, risk teams cannot easily determine whether the output reflects a genuine market condition or a computational error. Without deterministic, verifiable calculations, model governance becomes a checkbox exercise rather than a genuine risk control.",
  },
  {
    icon: <FlaskConical size={20} />,
    title: "Scenario Coverage Gaps",
    desc: "Ad hoc stress testing without systematic scenario frameworks produces inconsistent results that cannot withstand audit scrutiny. Risk committees receive different scenario outputs depending on which analyst ran the analysis, which assumptions were applied, and which data vintage was used. The lack of a governed scenario library means that critical tail risks -- geopolitical disruptions, liquidity crises, correlation breakdowns -- are tested sporadically or not at all.",
  },
  {
    icon: <Monitor size={20} />,
    title: "Real-Time Monitoring Gaps",
    desc: "Batch-processed risk reports generated overnight or weekly leave risk officers blind to intraday exposure changes, market moves, and threshold breaches. By the time a risk limit violation appears in a morning report, the position may have been in breach for hours. Real-time monitoring requires not just live data feeds but intelligent interpretation that can distinguish signal from noise and escalate appropriately.",
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
    title: "Concentration & Correlation Analysis",
    desc: "Portfolio-level concentration metrics identify over-exposed currency pairs, counterparties, and tenors. Factor covariance analysis quantifies correlation risk between positions, revealing hidden concentrations that single-position analysis cannot detect. The engine computes normalized variance decomposition and marginal risk contribution for every position in the book.",
    product: "ORDR Portfolio",
  },
  {
    icon: <FlaskConical size={20} />,
    title: "VaR, Expected Shortfall & Scenarios",
    desc: "Historical Value-at-Risk, parametric VaR, expected shortfall, and configurable shock packs provide comprehensive tail risk measurement. Monte Carlo simulation supports custom distribution assumptions and correlation structures. Every scenario run is hash-chained and append-only, creating a verifiable audit trail of stress testing activity for risk committee and regulatory review.",
    product: "ORDR Labs",
  },
  {
    icon: <Brain size={20} />,
    title: "AI-Powered Anomaly Detection",
    desc: "The Agentic AI layer continuously monitors risk metrics, position changes, and market conditions. It detects anomalies -- unusual position concentrations, rapid exposure growth, policy threshold approaches, effectiveness deterioration -- and surfaces them proactively. The AI does not modify risk calculations; it interprets deterministic outputs and alerts risk officers to conditions that warrant attention.",
    product: "ORDR Treasury",
  },
  {
    icon: <Activity size={20} />,
    title: "Real-Time Market Intelligence",
    desc: "Live FX spot rates, forward curves, and volatility surfaces from multiple data providers with automatic failover. Configurable alert thresholds trigger notifications when market moves affect exposure profiles. The ORDR Market charting engine provides Canvas 2D visualization with 23 technical indicators, while the AI coaching layer helps interpret patterns and identify regime changes.",
    product: "ORDR Market",
  },
  {
    icon: <Users size={20} />,
    title: "4-Eyes Governance & RBAC",
    desc: "Maker-checker workflows with enforced separation of duties ensure that no single individual can both propose and approve a risk-affecting action. 9 roles with 41 granular permissions control access to every function. The WORM audit trail records every decision with SHA-256 hash-chain integrity, providing tamper-evident evidence for internal audit, regulatory examination, and board reporting.",
    product: "ORDR Treasury",
  },
];

const METRICS = [
  { value: "8", label: "Risk Dimensions", sub: "R1-R8 Taxonomy" },
  { value: "<50ms", label: "Calculation Speed", sub: "Per Position" },
  { value: "SHA-256", label: "Hash Chain", sub: "Tamper-Evident" },
  { value: "41", label: "RBAC Permissions", sub: "Fail-Closed" },
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
          Risk Management
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 640, margin: "0 auto 16px", lineHeight: 1.7,
        }}>
          Enterprise risk quantification, monitoring, and governance with an AI insight layer
          that surfaces anomalies, evaluates scenarios, and communicates findings in natural language.
          Built on a frozen, deterministic engine that ensures every risk metric is reproducible
          and audit-defensible.
        </p>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textMuted,
          maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6,
        }}>
          The deterministic foundation computes. The Agentic AI interprets. Together, they
          give risk teams both precision and intelligence.
        </p>
        <Link href="/auth/login" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontFamily: F.ui, fontSize: 15, fontWeight: 600,
          color: "#fff", background: C.accent,
          padding: "13px 32px", borderRadius: 8, textDecoration: "none",
        }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      {/* Key Metrics Bar */}
      <section style={{ background: C.accent, padding: "48px" }}>
        <div style={{
          maxWidth: 900, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24,
        }}>
          {METRICS.map((m) => (
            <div key={m.label} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: F.mono, fontSize: 32, fontWeight: 800,
                color: "#FFFFFF", marginBottom: 4,
              }}>
                {m.value}
              </div>
              <div style={{
                fontFamily: F.ui, fontSize: 13, fontWeight: 600,
                color: "rgba(255,255,255,0.8)", marginBottom: 2,
              }}>
                {m.label}
              </div>
              <div style={{
                fontFamily: F.mono, fontSize: 10, color: "rgba(255,255,255,0.45)",
                letterSpacing: "0.05em",
              }}>
                {m.sub}
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

      {/* SVG Diagram: Risk Management Architecture */}
      <section style={{ padding: "96px 48px", maxWidth: 1100, margin: "0 auto" }}>
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
            <marker id="rmArrowD" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>

          {/* Left: Data Sources */}
          <rect x="20" y="60" width="160" height="280" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="100" y="85" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">
            DATA SOURCES
          </text>
          {["FX Spot Rates", "Forward Curves", "Vol Surfaces", "Position Book", "Policy Config"].map((label, i) => (
            <g key={label}>
              <rect x="35" y={100 + i * 44} width="130" height="32" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="100" y={120 + i * 44} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* Arrow right */}
          <line x1="180" y1="200" x2="230" y2="200" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#rmArrow)" />

          {/* Center: Risk Engine */}
          <rect x="240" y="60" width="260" height="280" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="370" y="85" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            DETERMINISTIC RISK ENGINE
          </text>
          {["R1-R8 Taxonomy", "Hedge Kernel", "VaR / ES Engine", "Effectiveness Test", "Scenario Engine"].map((label, i) => (
            <g key={label}>
              <rect x="258" y={100 + i * 44} width="224" height="32" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="370" y={120 + i * 44} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* Arrow right */}
          <line x1="500" y1="200" x2="550" y2="200" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#rmArrow)" />

          {/* Right Top: AI Analysis */}
          <rect x="560" y="60" width="200" height="130" rx="8" fill="#1E3A5F" />
          <text x="660" y="85" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.6)" letterSpacing="0.08em">
            AI ANALYSIS LAYER
          </text>
          {["Anomaly Detection", "Scenario Evaluation", "Natural Language"].map((label, i) => (
            <g key={label}>
              <rect x="575" y={100 + i * 28} width="170" height="22" rx="4" fill="rgba(255,255,255,0.12)" />
              <text x="660" y={115 + i * 28} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#FFFFFF">
                {label}
              </text>
            </g>
          ))}

          {/* Arrow right from AI to Dashboard */}
          <line x1="760" y1="125" x2="800" y2="125" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#rmArrow)" />

          {/* Right: Dashboard + Alerts */}
          <rect x="810" y="60" width="160" height="130" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="890" y="85" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">
            OUTPUT
          </text>
          {["Risk Dashboard", "Alert Engine", "Reports"].map((label, i) => (
            <g key={label}>
              <rect x="825" y={100 + i * 28} width="130" height="22" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="890" y={115 + i * 28} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* Bottom: Governance */}
          <rect x="240" y="370" width="730" height="50" rx="8" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="1.5" />
          <text x="605" y="395" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            GOVERNANCE: WORM AUDIT -- 4-EYES APPROVAL -- HASH CHAIN -- RBAC (41 PERMISSIONS)
          </text>
          <text x="605" y="412" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fill="#999999">
            Every calculation, decision, and alert is recorded immutably in the append-only audit log
          </text>

          {/* Vertical lines to governance */}
          <line x1="370" y1="340" x2="370" y2="370" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
          <line x1="660" y1="190" x2="660" y2="370" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
          <line x1="890" y1="190" x2="890" y2="370" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
        </svg>
      </section>

      {/* Capabilities */}
      <section style={{ background: C.bgAlt, padding: "96px 48px" }}>
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
                background: C.bg, border: `1px solid ${C.border}`,
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
          svg{min-height:350px}
        }
      `}</style>
    </MarketingLayout>
  );
}
