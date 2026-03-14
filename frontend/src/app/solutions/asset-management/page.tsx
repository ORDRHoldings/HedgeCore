"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Globe, PieChart, History, BookOpen,
  TrendingUp, Brain, Wallet, BarChart3, FileCheck,
  Target, Layers, DollarSign, LineChart, Shield,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const CHALLENGES = [
  {
    icon: <Globe size={20} />,
    title: "Multi-Fund Currency Complexity",
    desc: "Asset managers with global mandates face dozens of currency exposures across multiple funds, each with distinct investment policies, benchmark constraints, and investor reporting obligations. Aggregating currency risk across a fund complex requires systematic decomposition that accounts for overlapping exposures, netting opportunities, and fund-specific hedge mandates. Manual aggregation across fund administrator reports, custodian feeds, and internal position systems introduces errors that compound at the portfolio level.",
  },
  {
    icon: <Target size={20} />,
    title: "Benchmark Tracking & Hedge Drift",
    desc: "Currency hedging that is not systematically monitored drifts from target ratios as underlying asset values, currency rates, and cashflows change. A fund with a 50% EUR hedge target may find itself at 43% or 58% within weeks if hedge positions are not rebalanced against the evolving exposure. This drift creates tracking error against currency-hedged benchmarks that investors and consultants monitor closely. Without continuous monitoring, portfolio managers discover drift in monthly reports rather than in real time.",
  },
  {
    icon: <DollarSign size={20} />,
    title: "Cost Optimization Pressure",
    desc: "Hedge execution costs -- forward points, bid-ask spreads, roll costs, and margin requirements -- directly reduce fund returns. In a low-return environment, a 20-basis-point improvement in hedge execution efficiency can meaningfully affect performance rankings. Optimizing costs requires analyzing the trade-off between hedge precision and execution cost across multiple currency pairs, tenors, and instruments. Most asset managers lack the quantitative infrastructure to systematically evaluate these trade-offs.",
  },
  {
    icon: <FileCheck size={20} />,
    title: "Investor & Regulatory Reporting",
    desc: "Fund prospectus constraints, regulatory disclosures (UCITS, AIFMD, SEC), and investor reporting demand documented hedge rationale and execution evidence for every hedge action. Institutional investors and consultants expect transparent attribution of FX hedging impact on portfolio returns. Producing these reports requires not just accurate calculations but a complete audit trail that connects hedge decisions to policy parameters, market data, and approval workflows.",
  },
];

const CAPABILITIES = [
  {
    icon: <PieChart size={20} />,
    title: "Multi-Currency Exposure Decomposition",
    desc: "Full portfolio decomposition across currency pairs with confirmed and forecast cashflow bucketing by maturity tenor. The engine breaks down gross and net exposure by fund, strategy, and currency pair, identifying natural hedges and netting opportunities. Each decomposition is deterministic and reproducible -- the same position book always produces the same exposure breakdown, enabling reliable period-over-period comparison.",
    product: "ORDR Portfolio",
  },
  {
    icon: <TrendingUp size={20} />,
    title: "Systematic Hedge Plan Generation",
    desc: "Generate hedge recommendations based on policy parameters including target hedge ratios, cost thresholds, minimum trade sizes, and instrument preferences. The deterministic engine evaluates the cost-risk trade-off for each proposed hedge action and optimizes execution within policy constraints. The AI assistant monitors hedge drift in real time and recommends rebalancing actions when positions deviate from target ratios.",
    product: "ORDR Treasury",
  },
  {
    icon: <Brain size={20} />,
    title: "AI Cost Analysis & Optimization",
    desc: "The Agentic AI layer analyzes hedge execution costs across rolling windows, identifies patterns in forward point movements, and evaluates alternative tenor structures that reduce carry cost. It monitors roll costs as hedge maturities approach and alerts portfolio managers when market conditions favor early or deferred rolls. The AI interprets cost data from the deterministic engine -- it never overrides cost calculations, but it helps managers understand the cost implications of their hedging decisions.",
    product: "ORDR Treasury",
  },
  {
    icon: <LineChart size={20} />,
    title: "Performance Attribution",
    desc: "Isolate the impact of FX hedging on portfolio returns with transparent, reproducible attribution calculations. Decompose total return into asset return, currency return, and hedge contribution. The deterministic engine ensures that attribution results are independently verifiable -- auditors and investors can reconstruct the calculation from the same inputs and confirm identical outputs.",
    product: "ORDR Portfolio",
  },
  {
    icon: <History size={20} />,
    title: "Backtesting & Historical Analysis",
    desc: "Single and multi-period backtesting with policy comparison enables systematic evaluation of alternative hedge strategies against historical market data. SHA-256 hashed report integrity ensures that backtesting results cannot be retroactively modified. The AI assistant interprets backtesting outputs and highlights periods where policy parameters would have produced different outcomes, supporting evidence-based policy refinement.",
    product: "ORDR Labs",
  },
  {
    icon: <BookOpen size={20} />,
    title: "Regulatory Reference Library",
    desc: "ISDA definitions, IFRS 9 and ASC 815 hedge accounting guidance, UCITS currency overlay regulations, and AIFMD reporting requirements in a searchable reference library. Cross-referenced with policy templates to ensure that hedge strategies align with applicable regulatory frameworks. The AI assistant can answer natural-language questions about regulatory requirements and their implications for specific hedge structures.",
    product: "ORDR HedgeWiki",
  },
];

const PRODUCTS_USED = [
  { name: "ORDR Treasury", desc: "Hedge calculation, policy governance, and execution pipeline" },
  { name: "ORDR Portfolio", desc: "Multi-currency decomposition and performance attribution" },
  { name: "ORDR Labs", desc: "Backtesting, scenario analysis, and Monte Carlo simulation" },
  { name: "ORDR HedgeWiki", desc: "Regulatory reference and hedge accounting guidance" },
];

export default function AssetManagementPage() {
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
          Asset Management
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 640, margin: "0 auto 16px", lineHeight: 1.7,
        }}>
          Multi-currency portfolio hedging with AI-powered cost optimization insights,
          performance attribution, and systematic hedge plan generation. Deterministic
          calculations ensure auditability while the Agentic AI layer monitors drift,
          evaluates costs, and communicates recommendations in real time.
        </p>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textMuted,
          maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6,
        }}>
          Purpose-built for portfolio managers, currency overlay teams, and fund
          risk officers managing multi-currency mandates.
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
            Challenges in Portfolio Currency Management
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 640, margin: "0 auto 48px", textAlign: "center", lineHeight: 1.6,
          }}>
            Currency hedging for multi-asset portfolios requires infrastructure that
            most asset managers either lack or have outgrown.
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

      {/* SVG Diagram: Asset Management Flow */}
      <section style={{ padding: "96px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
          }}>
            Asset Management Hedge Flow
          </h2>
        </div>
        <svg viewBox="0 0 1000 400" width="100%" style={{ display: "block" }}>
          <defs>
            <marker id="amArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>

          {/* Row 1: Portfolio Sources */}
          <rect x="20" y="30" width="220" height="120" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="130" y="55" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">
            PORTFOLIO INPUTS
          </text>
          {["Fund Positions", "NAV Data", "Benchmark Weights"].map((label, i) => (
            <g key={label}>
              <rect x="35" y={68 + i * 26} width="190" height="20" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="130" y={82 + i * 26} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          <line x1="240" y1="90" x2="290" y2="90" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#amArrow)" />

          {/* Exposure Decomposition */}
          <rect x="300" y="30" width="180" height="120" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="390" y="55" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            DECOMPOSITION
          </text>
          {["Currency Exposure", "Netting Analysis", "Maturity Bucketing"].map((label, i) => (
            <g key={label}>
              <rect x="315" y={68 + i * 26} width="150" height="20" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="390" y={82 + i * 26} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          <line x1="480" y1="90" x2="530" y2="90" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#amArrow)" />

          {/* Hedge Engine */}
          <rect x="540" y="30" width="180" height="120" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="630" y="55" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            HEDGE ENGINE
          </text>
          {["Plan Generation", "Cost Optimization", "Policy Compliance"].map((label, i) => (
            <g key={label}>
              <rect x="555" y={68 + i * 26} width="150" height="20" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="630" y={82 + i * 26} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          <line x1="720" y1="90" x2="770" y2="90" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#amArrow)" />

          {/* Output */}
          <rect x="780" y="30" width="200" height="120" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="880" y="55" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">
            OUTPUT
          </text>
          {["Hedge Orders", "Attribution Report", "Investor Reporting"].map((label, i) => (
            <g key={label}>
              <rect x="795" y={68 + i * 26} width="170" height="20" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="880" y={82 + i * 26} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* AI Layer */}
          <rect x="200" y="190" width="600" height="70" rx="8" fill="#1E3A5F" />
          <text x="500" y="215" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.6)" letterSpacing="0.08em">
            AGENTIC AI LAYER: CONTINUOUS MONITORING & OPTIMIZATION INSIGHT
          </text>
          <text x="500" y="240" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fill="rgba(255,255,255,0.5)">
            Drift detection -- Cost analysis -- Rebalance recommendations -- Natural language Q&A
          </text>

          {/* Dashed connections */}
          {[130, 390, 630, 880].map((x) => (
            <line key={x} x1={x} y1="150" x2={x} y2="190"
              stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
          ))}

          {/* Governance bar */}
          <rect x="200" y="300" width="600" height="50" rx="8" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="1.5" />
          <text x="500" y="322" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            GOVERNANCE: WORM AUDIT -- POLICY VERSION CONTROL -- HASH CHAIN
          </text>
          <text x="500" y="340" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fill="#999999">
            Complete audit trail for investor reporting, regulatory disclosure, and compliance review
          </text>

          <line x1="500" y1="260" x2="500" y2="300" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
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
            How ORDR Helps Asset Managers
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
          Optimize your portfolio hedging
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Systematic, auditable hedge management with AI-powered cost optimization
          and real-time drift monitoring for multi-currency portfolios.
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
          svg{min-height:320px}
        }
      `}</style>
    </MarketingLayout>
  );
}
