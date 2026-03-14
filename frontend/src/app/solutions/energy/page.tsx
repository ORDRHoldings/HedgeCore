"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Flame, Globe, FlaskConical, TrendingUp,
  Zap, BarChart3, Shield, Activity, Brain, AlertTriangle,
  Network, MapPin, Database, Lock, Gauge, Eye,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const CHALLENGES = [
  {
    icon: <Zap size={20} />,
    title: "Price-Quantity Correlation Risk",
    desc: "Energy companies face a unique challenge: commodity prices and production volumes are often correlated with the currencies of producing nations. When oil prices fall, the currencies of oil-exporting nations typically weaken simultaneously, creating compounding losses for companies with revenue in those currencies. This correlation means that commodity hedging and currency hedging cannot be managed in isolation -- a perfectly hedged commodity position may still carry significant unhedged currency risk if the FX component is not systematically analyzed. Traditional treasury systems treat commodity and currency risk as separate concerns, missing the correlation dynamics that drive actual P&L impact.",
  },
  {
    icon: <Globe size={20} />,
    title: "Multi-Commodity FX Exposure",
    desc: "A single energy company may have revenue linked to crude oil (priced in USD), natural gas (priced in regional currencies and USD), LNG (priced in a basket of currencies), and electricity (priced in local currencies). Each commodity has its own pricing convention, settlement currency, and market structure. The resulting FX exposure is a complex matrix of currency pairs, tenors, and correlation assumptions that changes with production schedules, contract renewals, and market conditions. Managing this complexity requires systematic decomposition that accounts for the interplay between commodity prices, production volumes, and currency rates.",
  },
  {
    icon: <MapPin size={20} />,
    title: "Geopolitical Disruption Risk",
    desc: "Energy supply chains are concentrated in geopolitically sensitive regions. Sanctions on Russian energy, Middle Eastern instability, Latin American political transitions, and Southeast Asian regulatory changes create tail risks that affect both commodity supply and currency markets simultaneously. A sanctions event can render existing hedge relationships undeliverable overnight. Energy companies need scenario frameworks that model the combined impact of geopolitical events on commodity prices, production volumes, and FX rates -- including the second-order effects on counterparty credit and market liquidity that traditional stress testing ignores.",
  },
  {
    icon: <BarChart3 size={20} />,
    title: "Regulatory & Environmental Reporting",
    desc: "Energy companies face overlapping regulatory reporting requirements: IFRS 9 hedge effectiveness documentation, commodity trading position reporting, ESG-linked financial disclosures, and jurisdiction-specific energy market compliance. The transition to renewable energy adds new currency exposures (equipment procurement in EUR/CNY, carbon credit trading in EUR, green bond issuance in multiple currencies) that require integration with existing hedging programs. Without systematic infrastructure, the reporting burden grows faster than the team's capacity to produce accurate, auditable documentation.",
  },
];

const CAPABILITIES = [
  {
    icon: <Zap size={20} />,
    title: "Cross-Commodity Currency Hedging",
    desc: "Multi-currency exposure decomposition with cross-pair correlation analysis that accounts for commodity-FX linkages. The deterministic engine decomposes gross exposure by commodity, currency pair, and maturity tenor, identifying natural hedges where offsetting positions reduce net exposure. Systematic hedge plan generation evaluates cost-risk trade-offs across the full exposure matrix, optimizing instrument selection and tenor matching within policy constraints.",
    product: "ORDR Treasury",
  },
  {
    icon: <Globe size={20} />,
    title: "Polisophic Geopolitical Intelligence",
    desc: "ORDR Polisophic provides geopolitical corridor scoring for country and currency risk across energy-producing regions. Corridor scores quantify political stability, sanctions probability, regulatory risk, and market access for each country-currency pair. The AI layer monitors geopolitical developments in real time, correlates events with historical corridor score changes, and alerts when geopolitical conditions affect exposure profiles. Configurable alert thresholds and scenario triggers enable proactive hedge adjustments before events materialize in market prices.",
    product: "ORDR Polisophic",
  },
  {
    icon: <Brain size={20} />,
    title: "AI Correlation & Regime Analysis",
    desc: "The Agentic AI analyzes commodity-FX correlation patterns across rolling windows, detecting regime changes where historical relationships break down. When oil-CAD correlation weakens, when gas-NOK sensitivity shifts, or when EM currency correlations spike during risk-off events, the AI identifies the change and alerts risk managers with context-rich explanations. It evaluates whether current hedge structures remain effective under the new correlation regime and recommends adjustments. The AI interprets deterministic correlation calculations -- it never overrides the engine's quantitative outputs.",
    product: "ORDR Treasury",
  },
  {
    icon: <FlaskConical size={20} />,
    title: "Energy-Specific Scenario Studio",
    desc: "Configurable shock packs designed for energy sector risks: oil price collapse with USD strength, gas supply disruption with EUR/RUB stress, EM contagion affecting multiple commodity currencies simultaneously, and energy transition scenarios modeling gradual shifts from fossil fuel revenue to renewable energy procurement currencies. Historical VaR, expected shortfall, and Monte Carlo simulation with correlation stress. Every scenario run is SHA-256 hash-chained for tamper-evident reporting to risk committees.",
    product: "ORDR Labs",
  },
  {
    icon: <Activity size={20} />,
    title: "Real-Time Market Data & Charting",
    desc: "Live FX spot rates, forward curves, and volatility surfaces from multiple data providers with automatic failover. The ORDR Market Canvas 2D charting engine provides professional-grade visualization with 23 technical indicators and drawing tools. The Agentic AI coaching layer helps energy desk analysts interpret patterns in commodity currencies, identify support/resistance levels, and build automated alert strategies. Multi-timeframe analysis supports both tactical trading and strategic hedging decisions.",
    product: "ORDR Market",
  },
  {
    icon: <Lock size={20} />,
    title: "WORM Audit & Compliance Trail",
    desc: "Every calculation, hedge decision, and approval is recorded in a SHA-256 hash-chained, append-only audit log that satisfies IFRS 9 hedge effectiveness documentation, commodity trading position reporting, and ESG-linked financial disclosure requirements. The WORM architecture ensures that no audit record can be modified after creation. 4-eyes governance with separation of duties enforces institutional approval standards across the entire hedge lifecycle.",
    product: "ORDR Treasury",
  },
];

const PRODUCTS_USED = [
  { name: "ORDR Treasury", desc: "Cross-commodity FX hedging and governance pipeline" },
  { name: "ORDR Polisophic", desc: "Geopolitical corridor scoring and intelligence" },
  { name: "ORDR Market", desc: "Real-time charting with AI coaching for commodity currencies" },
  { name: "ORDR Labs", desc: "Energy-specific scenario stress testing and Monte Carlo" },
];

export default function EnergyPage() {
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
          Energy &amp; Commodities
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 640, margin: "0 auto 16px", lineHeight: 1.7,
        }}>
          Commodity-linked FX exposure management with AI-powered geopolitical overlay,
          cross-commodity correlation analysis, and deterministic hedge calculation.
          The Polisophic intelligence layer monitors geopolitical corridors in real time
          while the frozen computation kernel ensures every hedge decision is reproducible
          and audit-defensible.
        </p>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textMuted,
          maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6,
        }}>
          Purpose-built for energy treasury teams, commodity trading desks, and risk
          functions managing multi-commodity, multi-currency exposure portfolios.
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
            Challenges Facing Energy Companies
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 640, margin: "0 auto 48px", textAlign: "center", lineHeight: 1.6,
          }}>
            Energy sector FX risk is structurally different from corporate treasury risk.
            Commodity-currency correlations, geopolitical tail risks, and multi-commodity
            exposure matrices create challenges that require specialized infrastructure.
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

      {/* SVG Diagram: Energy & Commodities Flow */}
      <section style={{ padding: "96px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
          }}>
            Energy &amp; Commodities Hedge Architecture
          </h2>
        </div>
        <svg viewBox="0 0 1000 480" width="100%" style={{ display: "block" }}>
          <defs>
            <marker id="enArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>

          {/* Commodity Sources */}
          <rect x="20" y="30" width="200" height="150" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="120" y="52" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">
            COMMODITY EXPOSURE
          </text>
          {["Crude Oil (USD)", "Natural Gas (USD/GBP)", "LNG (Multi-CCY)", "Power (Local CCY)", "Carbon (EUR)"].map((label, i) => (
            <g key={label}>
              <rect x="35" y={64 + i * 22} width="170" height="16" rx="3" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="120" y={76 + i * 22} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* Geopolitical */}
          <rect x="20" y="200" width="200" height="110" rx="8" fill="#1E3A5F" />
          <text x="120" y="222" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.6)" letterSpacing="0.08em">
            POLISOPHIC
          </text>
          {["Corridor Scores", "Sanctions Monitor", "Stability Index", "Alert Triggers"].map((label, i) => (
            <g key={label}>
              <rect x="35" y={234 + i * 18} width="170" height="14" rx="3" fill="rgba(255,255,255,0.1)" />
              <text x="120" y={245 + i * 18} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fontWeight="500" fill="#FFFFFF">
                {label}
              </text>
            </g>
          ))}

          {/* Arrows */}
          <line x1="220" y1="105" x2="270" y2="105" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#enArrow)" />
          <line x1="220" y1="255" x2="270" y2="175" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#enArrow)" />

          {/* Correlation Engine */}
          <rect x="280" y="30" width="220" height="130" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="390" y="52" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            CORRELATION ENGINE
          </text>
          {["Commodity-FX Linkage", "Cross-Pair Analysis", "Regime Detection", "Netting Calc"].map((label, i) => (
            <g key={label}>
              <rect x="295" y={64 + i * 24} width="190" height="18" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="390" y={77 + i * 24} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          <line x1="500" y1="95" x2="540" y2="95" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#enArrow)" />

          {/* Hedge Engine */}
          <rect x="550" y="30" width="200" height="130" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="650" y="52" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            HEDGE ENGINE
          </text>
          {["Plan Generation", "Cost Optimization", "Instrument Select", "Policy Enforce"].map((label, i) => (
            <g key={label}>
              <rect x="565" y={64 + i * 24} width="170" height="18" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="650" y={77 + i * 24} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          <line x1="750" y1="95" x2="790" y2="95" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#enArrow)" />

          {/* Output */}
          <rect x="800" y="30" width="180" height="130" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="890" y="52" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">
            OUTPUT
          </text>
          {["Hedge Orders", "Scenario Reports", "Geopolitical Brief", "Audit Trail"].map((label, i) => (
            <g key={label}>
              <rect x="815" y={64 + i * 24} width="150" height="18" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="890" y={77 + i * 24} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* AI Layer spanning center */}
          <rect x="280" y="190" width="700" height="65" rx="8" fill="#1E3A5F" />
          <text x="630" y="215" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.6)" letterSpacing="0.08em">
            AGENTIC AI: CORRELATION MONITORING -- REGIME DETECTION -- GEOPOLITICAL ALERTS
          </text>
          <text x="630" y="240" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fill="rgba(255,255,255,0.5)">
            Interprets deterministic outputs, monitors commodity-FX linkages, communicates via chat/voice/phone
          </text>

          {/* Dashed connections to AI */}
          {[390, 650, 890].map((x) => (
            <line key={x} x1={x} y1="160" x2={x} y2="190"
              stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
          ))}

          {/* Scenario Layer */}
          <rect x="280" y="280" width="700" height="60" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="630" y="305" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            SCENARIO ENGINE: OIL SHOCK -- GAS DISRUPTION -- EM CONTAGION -- ENERGY TRANSITION
          </text>
          <text x="630" y="328" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fill="#999999">
            Monte Carlo simulation with commodity-FX correlation stress and geopolitical scenario overlays
          </text>

          <line x1="630" y1="255" x2="630" y2="280" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />

          {/* Governance */}
          <rect x="280" y="370" width="700" height="50" rx="8" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="1.5" />
          <text x="630" y="393" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            GOVERNANCE: WORM AUDIT -- 4-EYES APPROVAL -- IFRS 9 DOCS -- SHA-256 CHAIN
          </text>
          <text x="630" y="412" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fill="#999999">
            Complete audit trail for regulatory reporting, ESG disclosure, and commodity compliance
          </text>

          <line x1="630" y1="340" x2="630" y2="370" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
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
            How ORDR Helps Energy Companies
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

      {/* Polisophic Callout */}
      <section style={{ padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            background: C.accent, borderRadius: 16, padding: "56px 48px",
          }}>
            <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)",
                marginBottom: 16, textTransform: "uppercase",
              }}>
                GEOPOLITICAL INTELLIGENCE
              </div>
              <h2 style={{
                fontFamily: F.heading, fontSize: 32, fontWeight: 800,
                color: "#fff", margin: "0 0 16px", letterSpacing: "-0.02em",
              }}>
                Polisophic Corridor Scoring
              </h2>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: "rgba(255,255,255,0.7)",
                lineHeight: 1.7, margin: "0 0 12px",
              }}>
                ORDR Polisophic provides quantified geopolitical risk scoring for every country
                and currency in your exposure universe. Corridor scores are computed from
                political stability indices, sanctions probability, regulatory risk assessments,
                and market access metrics. The Agentic AI monitors geopolitical developments
                in real time and correlates events with historical score changes, providing
                early warning when geopolitical risk begins to affect currency markets.
              </p>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: "rgba(255,255,255,0.7)",
                lineHeight: 1.7, margin: 0,
              }}>
                For energy companies, this means understanding whether a sanctions escalation,
                a pipeline dispute, or a regulatory change in a producing nation will affect
                your FX exposure -- before the market prices it in.
              </p>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
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
          Manage commodity-linked FX risk
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Integrated geopolitical intelligence, cross-commodity correlation analysis,
          and deterministic hedge computation for the energy sector. With an AI
          that monitors your exposure around the clock.
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
          svg{min-height:380px}
        }
      `}</style>
    </MarketingLayout>
  );
}
