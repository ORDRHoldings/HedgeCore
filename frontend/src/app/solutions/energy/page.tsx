"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Zap, Globe, BarChart3, Activity,
  Lock, FlaskConical, Brain, ShieldCheck, AlertTriangle,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "WTI/Brent", label: "Commodity reference" },
  { value: "190+", label: "Geopolitical corridors" },
  { value: "0.73", label: "USD/CAD–WTI correlation" },
  { value: "POLISOPHIC", label: "Geo intelligence" },
  { value: "Cross-CCY", label: "Basis capability" },
  { value: "SHA-256", label: "Trade audit" },
];

const CHALLENGES = [
  {
    icon: <Zap size={20} />,
    title: "Commodity-FX correlation complexity",
    desc: "Oil companies have USD revenues and local-currency costs. When oil prices and USD move together, FX hedges can overcorrect or undercorrect. A hedge sized on standalone FX exposure without accounting for oil-USD correlation can amplify losses rather than reduce them — a structural error most treasury systems can't detect.",
  },
  {
    icon: <Globe size={20} />,
    title: "Geopolitical tail risk",
    desc: "An OPEC production decision or a Middle East escalation can move USD/SAR and USD/NOK in ways that standard VaR models don't capture. Geopolitical events create correlated shocks across commodity prices, currency pairs, and counterparty credit — simultaneously — in ways that require dedicated intelligence infrastructure, not generic risk models.",
  },
  {
    icon: <BarChart3 size={20} />,
    title: "Multi-currency capex hedging",
    desc: "Energy projects span multiple countries with different currencies, legal frameworks, and hedging instruments. Coordination is manual and error-prone — a pipeline project may have GBP equipment procurement, EUR engineering contracts, USD debt service, and NOK local payroll, each requiring a different hedge with different accounting treatment.",
  },
  {
    icon: <AlertTriangle size={20} />,
    title: "Basis risk in energy FX",
    desc: "Cross-currency basis swaps for emerging market energy exporters (BRL, MXN, NOK) have wide bid-ask spreads and limited liquidity that affect hedge cost. Basis risk compounds when NDF markets thin out — a hedge that's economic at 5bp basis becomes a cost center at 40bp, with no systematic alert until the roll hits.",
  },
];

const CAPABILITIES = [
  {
    icon: <Globe size={20} />,
    title: "Polisophic — 190+ Geopolitical Corridors",
    desc: "ORDR Polisophic provides quantified corridor scoring for 190+ country-currency pairs across energy-producing regions. Scores integrate political stability, sanctions probability, regulatory risk, and market access. The AI monitors geopolitical developments in real time, correlates events with corridor score history, and alerts when risk thresholds approach hedge review triggers.",
    product: "ORDR Polisophic",
  },
  {
    icon: <Zap size={20} />,
    title: "Commodity-FX Correlation Engine",
    desc: "The engine computes rolling commodity-FX correlation coefficients — WTI/USD-CAD, Brent/USD-NOK, LNG/USD-AUD — across configurable windows. Regime detection identifies when correlation relationships break down, alerting risk managers with context-rich explanations and recommending hedge ratio adjustments when the commodity-FX link weakens or inverts.",
    product: "ORDR Treasury",
  },
  {
    icon: <Brain size={20} />,
    title: "AI Regime Analysis — Correlation Breakdown Alerts",
    desc: "The Agentic AI interprets deterministic correlation calculations and surfaces regime changes in plain language. When oil-CAD correlation weakens from -0.73 to -0.41, the AI explains the structural cause (pipeline constraints, USD exceptionalism, OPEC dynamics) and evaluates whether current hedge structures remain effective under the new regime.",
    product: "ORDR Treasury",
  },
  {
    icon: <FlaskConical size={20} />,
    title: "Energy-Specific Scenario Studio",
    desc: "Configurable shock packs designed for energy sector risks: oil price collapse with USD strength, gas supply disruption with EUR/RUB stress, EM contagion affecting multiple commodity currencies, and energy transition scenarios. Historical VaR, expected shortfall, and Monte Carlo with full audit trail — SHA-256 hash-chained for tamper-evident reporting.",
    product: "ORDR Labs",
  },
  {
    icon: <Activity size={20} />,
    title: "Cross-Currency Basis Management",
    desc: "Multi-currency exposure decomposition with NDF and cross-currency basis swap optimization for emerging market energy currencies (BRL, MXN, NOK, NGN). The engine identifies natural hedges across the portfolio, quantifies basis risk at each roll, and computes hedge cost against capital benefit — including the cost of wide bid-ask spreads in illiquid markets.",
    product: "ORDR Treasury",
  },
  {
    icon: <Lock size={20} />,
    title: "WORM Audit — IFRS 9 + Commodity Compliance",
    desc: "Every calculation, hedge decision, and approval is recorded in a SHA-256 hash-chained, append-only log satisfying IFRS 9 effectiveness documentation, commodity trading position reporting, and ESG disclosure requirements. 4-eyes governance with separation of duties enforces institutional approval standards across the entire hedge lifecycle.",
    product: "ORDR Treasury",
  },
];

const PRODUCTS = [
  { name: "ORDR Treasury", desc: "Core hedging and governance pipeline" },
  { name: "ORDR Polisophic", desc: "Geopolitical corridor intelligence" },
  { name: "ORDR Labs", desc: "Commodity scenario stress testing" },
  { name: "ORDR FinHub", desc: "Commodity data and macro signals" },
];

const CORRIDOR_ROWS = [
  { pair: "USD/SAR", score: "41", level: "MODERATE", trigger: "OPEC+ quota discussion", color: "#e6c767" },
  { pair: "USD/NOK", score: "28", level: "LOW", trigger: "Stable North Sea output", color: "#3fb950" },
  { pair: "USD/RUB", score: "N/A", level: "RESTRICTED", trigger: "Sanctions regime", color: "#8b949e" },
  { pair: "USD/CAD", score: "34", level: "LOW-MED", trigger: "Pipeline capacity watch", color: "#3fb950" },
  { pair: "USD/MXN", score: "52", level: "MODERATE", trigger: "Pemex fiscal constraints", color: "#e6c767" },
  { pair: "USD/BRL", score: "61", level: "ELEVATED", trigger: "Pre-election volatility", color: "#f0883e" },
  { pair: "USD/NGN", score: "78", level: "HIGH", trigger: "Currency controls risk", color: "#f85149" },
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
          Commodity-linked FX hedging, geopolitical risk scoring for energy corridors,
          and cross-currency basis management for oil, gas, and mining companies.
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

      {/* Stats Strip */}
      <section style={{
        background: C.bgAlt,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "40px 48px",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 24,
        }}>
          {STATS.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: F.mono, fontSize: 22, fontWeight: 700,
                color: C.accent, letterSpacing: "-0.02em", marginBottom: 4,
              }}>
                {s.value}
              </div>
              <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textMuted, lineHeight: 1.4 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Challenges */}
      <section style={{ background: C.bg, padding: "96px 48px" }}>
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
            exposure matrices require specialized infrastructure.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CHALLENGES.map((c) => (
              <div key={c.title} style={{
                background: C.bgAlt, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(220,38,38,0.06)", color: "#DC2626",
                  }}>
                    {c.icon}
                  </div>
                  <h3 style={{ fontFamily: F.heading, fontSize: 17, fontWeight: 700, margin: 0, color: C.text }}>
                    {c.title}
                  </h3>
                </div>
                <p style={{ fontFamily: F.ui, fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Geopolitical Terminal Panel */}
      <section style={{ padding: "96px 48px", background: C.bgAlt }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              fontFamily: F.mono, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.1em", color: C.textMuted,
              marginBottom: 12, textTransform: "uppercase",
            }}>
              LIVE TERMINAL OUTPUT
            </div>
            <h2 style={{
              fontFamily: F.heading, fontSize: 36, fontWeight: 700,
              letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
            }}>
              ORDR Polisophic — Energy Corridor Analysis
            </h2>
            <p style={{
              fontFamily: F.ui, fontSize: 15, color: C.textSub,
              maxWidth: 560, margin: "0 auto", lineHeight: 1.6,
            }}>
              Sample corridor scoring output for an energy sector portfolio.
              Real-time geopolitical scores drive hedge recommendations automatically.
            </p>
          </div>
          <div style={{
            background: "#0d1117", border: "1px solid #30363d",
            borderRadius: 12, padding: "28px 32px", fontFamily: F.mono,
            fontSize: 13, lineHeight: 1.85, color: "#c9d1d9",
            overflowX: "auto",
          }}>
            <div style={{ color: "#e6c767", fontWeight: 700, marginBottom: 4 }}>
              ORDR POLISOPHIC + TREASURY · ENERGY CORRIDOR ANALYSIS
            </div>
            <div style={{ color: "#444d56", marginBottom: 12 }}>
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#8b949e" }}>DATE    </span>
              2026-03-23  ·  Energy Sector  ·  19 corridors
            </div>
            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────────────────</div>

            {/* Corridor table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "110px 60px 120px 1fr",
              color: "#8b949e", fontSize: 11, letterSpacing: "0.06em",
              marginBottom: 6, textTransform: "uppercase",
            }}>
              <span>CORRIDOR</span>
              <span>SCORE</span>
              <span>LEVEL</span>
              <span>TRIGGER</span>
            </div>
            {CORRIDOR_ROWS.map((row) => (
              <div key={row.pair} style={{
                display: "grid", gridTemplateColumns: "110px 60px 120px 1fr",
                borderBottom: "1px solid #21262d", padding: "6px 0",
                alignItems: "center",
              }}>
                <span style={{ color: "#79c0ff" }}>{row.pair}</span>
                <span style={{ color: row.color, fontWeight: 700 }}>{row.score}</span>
                <span style={{ color: row.color, fontSize: 11 }}>{row.level}</span>
                <span style={{ color: "#8b949e", fontSize: 12 }}>{row.trigger}</span>
              </div>
            ))}

            <div style={{ color: "#444d56", margin: "16px 0 8px" }}>─────────────────────────────────────────────────────</div>
            <div style={{ color: "#8b949e", marginBottom: 6, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              COMMODITY CORRELATIONS (90D)
            </div>
            <div>
              <span style={{ color: "#8b949e" }}>WTI → USD/CAD    </span>
              <span style={{ color: "#3fb950", fontWeight: 700 }}>-0.73</span>
              {"  "}(strong inverse)
            </div>
            <div>
              <span style={{ color: "#8b949e" }}>Brent → USD/NOK  </span>
              <span style={{ color: "#3fb950", fontWeight: 700 }}>-0.68</span>
              {"  "}(strong inverse)
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#8b949e" }}>LNG → USD/AUD    </span>
              <span style={{ color: "#e6c767", fontWeight: 700 }}>-0.41</span>
              {"  "}(moderate)
            </div>

            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────────────────</div>
            <div style={{ color: "#8b949e", marginBottom: 6, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              HEDGE RECOMMENDATION
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: "#f0883e" }}>USD/BRL: </span>
              Reduce unhedged exposure (score 61, near threshold)
            </div>
            <div style={{ paddingLeft: 8, color: "#8b949e", marginBottom: 8 }}>
              Suggested: NDF 3M, 60% hedge ratio, review in 30 days
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: "#f85149", fontWeight: 700 }}>USD/NGN: </span>
              AVOID unhedged position (score 78)
            </div>
            <div style={{ paddingLeft: 8, color: "#8b949e", marginBottom: 12 }}>
              Suggested: USD invoicing or LC structure
            </div>

            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────────────────</div>
            <div style={{ color: "#bc8cff", marginBottom: 2 }}>AI NOTE</div>
            <div style={{ paddingLeft: 8, color: "#c9d1d9", fontStyle: "italic" }}>
              &quot;Middle East escalation risk elevated this week. Monitor USD/AED and USD/KWD basis —
              typically stable but showing unusual forward premium compression.&quot;
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section style={{ background: C.bg, padding: "96px 48px" }}>
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
                background: C.bgAlt, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
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
                <h3 style={{ fontFamily: F.heading, fontSize: 17, fontWeight: 700, margin: "0 0 10px", color: C.text }}>
                  {c.title}
                </h3>
                <p style={{ fontFamily: F.ui, fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products Strip */}
      <section style={{ background: C.bgAlt, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 28, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 32px", textAlign: "center", color: C.text,
          }}>
            Products for Energy &amp; Commodities
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {PRODUCTS.map((p) => (
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
                <p style={{ fontFamily: F.ui, fontSize: 13, color: C.textSub, lineHeight: 1.5, margin: 0 }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Polisophic Callout */}
      <section style={{ padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: C.accent, borderRadius: 16, padding: "56px 48px" }}>
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
                Polisophic: Know before the market prices it in
              </h2>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: "rgba(255,255,255,0.75)",
                lineHeight: 1.7, margin: "0 0 28px",
              }}>
                ORDR Polisophic scores 190+ geopolitical corridors across energy-producing regions
                in real time. Corridor scores integrate political stability, sanctions probability,
                regulatory risk, and market access. When a score crosses a hedge review threshold,
                the system surfaces a recommendation — before the market moves.
              </p>
              <div style={{ display: "flex", gap: 28, justifyContent: "center", flexWrap: "wrap" }}>
                {[
                  "190+ corridors scored",
                  "Sanctions monitoring",
                  "Hedge review triggers",
                  "AI escalation alerts",
                ].map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldCheck size={14} color="rgba(255,255,255,0.6)" />
                    <span style={{ fontFamily: F.ui, fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
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
          Integrated geopolitical intelligence, commodity-FX correlation analysis,
          cross-currency basis management, and deterministic hedge computation —
          with an AI that monitors your energy corridors around the clock.
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
            color: "rgba(255,255,255,0.85)",
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
          h1{font-size:32px !important}
          h2{font-size:22px !important}
          div[style*="grid-template-columns: repeat(6"]{grid-template-columns:repeat(3,1fr) !important}
          div[style*="grid-template-columns: repeat(4"]{grid-template-columns:repeat(2,1fr) !important}
          div[style*="grid-template-columns: repeat(2"]{grid-template-columns:1fr !important}
        }
      `}</style>
    </MarketingLayout>
  );
}
