"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Umbrella, Shield, Settings, FlaskConical,
  Scale, FileCheck, Lock, BarChart3, Brain, Clock,
  AlertTriangle, Activity, Database, Eye, TrendingDown, Gauge,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const CHALLENGES = [
  {
    icon: <Scale size={20} />,
    title: "Long-Dated Liability Matching",
    desc: "Insurance liabilities span decades -- life insurance policies, annuity obligations, and pension guarantees create currency exposures with maturities measured in years, not months. Hedging these long-dated obligations requires forward-looking programs with systematic maturity matching, roll strategy management, and careful consideration of basis risk between hedge instruments and underlying liabilities. The challenge is compounded when liabilities are denominated in currencies with limited forward market liquidity beyond standard tenors, forcing insurers to accept basis risk or implement complex proxy hedge structures.",
  },
  {
    icon: <FileCheck size={20} />,
    title: "Solvency II & Regulatory Capital",
    desc: "Solvency II and equivalent local capital regimes require demonstrable hedge effectiveness to reduce capital charges on FX-exposed investment portfolios and insurance liabilities. The standard formula applies punitive capital charges to unhedged currency risk, while internal model firms must prove that their hedging strategies are effective, governed, and auditable. Capital optimization through hedging is not just a treasury function -- it directly affects the insurer's capital adequacy ratio, dividend capacity, and competitive positioning. Without systematic effectiveness testing, hedging costs cannot be justified as capital-efficient.",
  },
  {
    icon: <AlertTriangle size={20} />,
    title: "Multi-Currency Reserve Complexity",
    desc: "Global insurers hold reserves and surplus in multiple currencies to match the geographic distribution of their liabilities. Managing the currency composition of investment portfolios against liability currency profiles requires continuous rebalancing as premiums are collected, claims are paid, and asset values fluctuate. Each currency introduces translation risk that affects reported solvency ratios, creating a dynamic optimization problem that manual processes cannot solve at the speed required by mark-to-market regulatory reporting.",
  },
  {
    icon: <TrendingDown size={20} />,
    title: "Basis Risk & Instrument Selection",
    desc: "Insurance hedging programs often face basis risk -- the mismatch between the hedge instrument and the underlying exposure. Cross-currency swaps may not perfectly match liability cashflow timing, FX forwards introduce roll risk at maturity, and options strategies create convexity that affects both P&L and capital. Selecting the right instrument for each liability segment requires systematic evaluation of cost, effectiveness, capital treatment, and accounting impact. Most insurers lack the quantitative infrastructure to optimize this multi-dimensional decision systematically.",
  },
];

const CAPABILITIES = [
  {
    icon: <Scale size={20} />,
    title: "ALM-Aligned Hedging",
    desc: "Portfolio-level exposure decomposition with confirmed and forecast cashflow bucketing across maturity tenors aligned to liability durations. The deterministic engine matches hedge maturities to liability cashflow profiles, identifying gaps where basis risk exceeds policy thresholds. Duration-weighted hedge optimization ensures that the hedge portfolio tracks liability sensitivity to currency moves across the entire term structure, not just at spot.",
    product: "ORDR Portfolio",
  },
  {
    icon: <FileCheck size={20} />,
    title: "Regulatory Effectiveness Testing",
    desc: "Prospective hedge effectiveness testing with critical terms match and statistical forecast methods for IFRS 9 and ASC 815 designation. The engine evaluates whether proposed hedge relationships satisfy effectiveness criteria before designation, preventing retroactive disqualification that would require immediate P&L recognition. The AI assistant monitors effectiveness ratios continuously and alerts when deterioration trends threaten designation thresholds.",
    product: "ORDR Treasury",
  },
  {
    icon: <Brain size={20} />,
    title: "AI-Powered Reserve Monitoring",
    desc: "The Agentic AI layer monitors the currency composition of reserves against liability profiles, detecting drift that affects solvency ratios. It alerts when currency movements cause reserve adequacy to approach regulatory thresholds, when hedge positions require rebalancing due to premium or claim cashflows, and when roll costs spike on approaching maturities. Think of it as a specialized actuary's assistant that never sleeps and monitors currency risk continuously.",
    product: "ORDR Treasury",
  },
  {
    icon: <Settings size={20} />,
    title: "Policy Governance with Insurance Templates",
    desc: "60 policy templates with governance tiers, maturity profiles, and escalation workflows configured for insurance-specific requirements. Templates include ALM hedge ratio targets, duration-matched tenor selection, Solvency II capital-optimized instrument preferences, and basis risk tolerance thresholds. Every policy change is version-controlled with full revision history and requires approval through the 4-eyes governance workflow.",
    product: "ORDR Treasury",
  },
  {
    icon: <FlaskConical size={20} />,
    title: "Scenario Stress Testing",
    desc: "Configurable shock packs including insurance-specific scenarios: EM currency crisis, yield curve inversion with FX correlation, Solvency II standard formula shocks, and ORSA (Own Risk and Solvency Assessment) scenario sets. Historical VaR, expected shortfall, and Monte Carlo simulation with full audit trail. Every scenario run is SHA-256 hash-chained for tamper-evident reporting to risk committees and regulators.",
    product: "ORDR Labs",
  },
  {
    icon: <Gauge size={20} />,
    title: "Solvency Capital Optimization",
    desc: "The engine evaluates the capital impact of alternative hedge strategies, quantifying the trade-off between hedge cost and SCR (Solvency Capital Requirement) reduction. By comparing the capital charge reduction achieved by each hedge instrument against its carry cost and execution friction, the system identifies the capital-efficient frontier for the insurer's currency hedge program. The AI interprets these calculations and presents them in decision-ready format for investment committees.",
    product: "ORDR Portfolio",
  },
];

const PRODUCTS_USED = [
  { name: "ORDR Treasury", desc: "Hedge calculation, effectiveness testing, and governance" },
  { name: "ORDR Portfolio", desc: "ALM decomposition and capital optimization analysis" },
  { name: "ORDR Labs", desc: "Scenario stress testing and Monte Carlo simulation" },
  { name: "ORDR HedgeWiki", desc: "IFRS 17, Solvency II, and hedge accounting reference" },
];

export default function InsurancePage() {
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
          Insurance
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 640, margin: "0 auto 16px", lineHeight: 1.7,
        }}>
          ALM currency risk management with AI-powered reserve monitoring, Solvency II
          capital optimization, and deterministic hedge effectiveness testing. Long-dated
          liability matching powered by a frozen computation kernel with continuous AI
          monitoring of solvency-affecting currency movements.
        </p>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textMuted,
          maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6,
        }}>
          Purpose-built for CIOs, ALM teams, and actuarial risk functions at insurers
          managing multi-currency investment portfolios and liability profiles.
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
            Challenges Facing Insurance Companies
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 640, margin: "0 auto 48px", textAlign: "center", lineHeight: 1.6,
          }}>
            Insurance currency risk management requires long-horizon thinking, regulatory
            precision, and continuous monitoring that general-purpose treasury tools cannot provide.
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

      {/* SVG Diagram: Insurance ALM Flow */}
      <section style={{ padding: "96px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
          }}>
            Insurance ALM Currency Hedge Flow
          </h2>
        </div>
        <svg viewBox="0 0 1000 420" width="100%" style={{ display: "block" }}>
          <defs>
            <marker id="insArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>

          {/* Top row: Inputs */}
          <rect x="20" y="30" width="220" height="100" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="130" y="52" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">
            LIABILITIES
          </text>
          {["Policy Obligations", "Claims Reserves", "Annuity Cashflows"].map((label, i) => (
            <g key={label}>
              <rect x="35" y={64 + i * 20} width="190" height="16" rx="3" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="130" y={76 + i * 20} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          <rect x="260" y="30" width="220" height="100" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="370" y="52" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">
            INVESTMENTS
          </text>
          {["Fixed Income", "Equity Portfolio", "Alternative Assets"].map((label, i) => (
            <g key={label}>
              <rect x="275" y={64 + i * 20} width="190" height="16" rx="3" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="370" y={76 + i * 20} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* Arrows */}
          <line x1="130" y1="130" x2="130" y2="165" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#insArrow)" />
          <line x1="370" y1="130" x2="370" y2="165" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#insArrow)" />

          {/* ALM Engine */}
          <rect x="40" y="170" width="440" height="80" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="260" y="193" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            DETERMINISTIC ALM ENGINE
          </text>
          {["Currency Matching", "Duration Analysis", "Hedge Optimization", "Effectiveness Test"].map((label, i) => (
            <g key={label}>
              <rect x={55 + i * 107} y="205" width="96" height="30" rx="5" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x={103 + i * 107} y="224" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          <line x1="480" y1="210" x2="530" y2="210" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#insArrow)" />

          {/* AI Layer */}
          <rect x="540" y="30" width="430" height="220" rx="8" fill="#1E3A5F" />
          <text x="755" y="55" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.6)" letterSpacing="0.08em">
            AGENTIC AI MONITORING
          </text>
          {[
            "Reserve Currency Drift Detection",
            "Solvency Ratio Impact Analysis",
            "Roll Cost & Maturity Alerts",
            "Basis Risk Deterioration Watch",
            "Regulatory Threshold Monitoring",
            "Natural Language Reporting",
          ].map((label, i) => (
            <g key={label}>
              <rect x="555" y={70 + i * 28} width="400" height="22" rx="4" fill="rgba(255,255,255,0.1)" />
              <text x="755" y={85 + i * 28} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#FFFFFF">
                {label}
              </text>
            </g>
          ))}

          {/* Bottom: Regulatory */}
          <rect x="40" y="290" width="930" height="50" rx="8" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="1.5" />
          <text x="505" y="313" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            REGULATORY: SOLVENCY II SCR -- IFRS 9 / IFRS 17 -- ORSA -- WORM AUDIT TRAIL
          </text>
          <text x="505" y="332" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fill="#999999">
            Capital-optimized hedging with complete regulatory documentation and tamper-evident audit chain
          </text>

          {/* Connections to regulatory */}
          <line x1="260" y1="250" x2="260" y2="290" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
          <line x1="755" y1="250" x2="755" y2="290" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />

          {/* Bottom note */}
          <text x="505" y="380" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fill="#999999">
            AI monitors continuously. Engine computes deterministically. Governance enforces approval workflows.
          </text>
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
            How ORDR Helps Insurers
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
          Governed hedging for insurers
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          ALM-aligned currency risk management with AI monitoring, Solvency II capital
          optimization, and complete regulatory documentation -- in one platform.
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
          svg{min-height:340px}
        }
      `}</style>
    </MarketingLayout>
  );
}
