"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, PieChart, Target, Globe2, BarChart3, Zap,
  Eye,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "8", label: "Risk Categories" },
  { value: "100+", label: "Currency Pairs" },
  { value: "<50ms", label: "Computation" },
  { value: "WORM", label: "Audit Trail" },
  { value: "R1-R8", label: "Taxonomy" },
];

const RISK_CATEGORIES = [
  { code: "R1", name: "Translation Risk", desc: "Foreign currency-denominated balance sheet items translated at period-end rates. Affects reported equity and earnings through cumulative translation adjustments (CTA). The engine quantifies translation exposure across entities and currency pairs deterministically." },
  { code: "R2", name: "Transaction Risk", desc: "Receivables, payables, and contractual cash flows in foreign currency between trade date and settlement date. Direct P&L impact from spot rate movements. Maturity clustering and settlement window analysis computed deterministically." },
  { code: "R3", name: "Economic Risk", desc: "Long-term competitive position changes from persistent FX movements. Affects market share, pricing power, and cost structure. The most difficult to hedge and quantify. Revenue/cost currency mix analysis and trend persistence computed by the deterministic engine." },
  { code: "R4", name: "Strategic Risk", desc: "FX impact on M&A valuations, capital allocation decisions, and long-term investment returns. Measured at the corporate strategy level. Strategic exposure from planned transactions and cross-border investment pipelines is quantified deterministically." },
  { code: "R5", name: "Operational Risk", desc: "Execution failures, settlement errors, system outages, and process breakdowns in FX operations. Quantified through operational loss event tracking. Execution quality metrics tracked and reported through the deterministic engine." },
  { code: "R6", name: "Settlement Risk", desc: "Counterparty default during the settlement window (Herstatt risk). Mitigated through CLS Bank, payment-versus-payment, and netting arrangements. Counterparty exposure limits and settlement concentration tracked per time zone." },
  { code: "R7", name: "Credit Risk", desc: "Counterparty default on outstanding FX derivative positions. Measured as positive mark-to-market exposure plus potential future exposure (PFE). Credit utilization against limits tracked deterministically across all counterparties." },
  { code: "R8", name: "Liquidity Risk", desc: "Inability to execute or unwind FX positions at fair market prices. Elevated during market stress, for exotic pairs, or at illiquid tenors. Bid-ask spreads, market depth, and historical liquidity events tracked for execution risk assessment." },
];

const FEATURES = [
  { icon: <PieChart size={20} />, title: "Exposure Decomposition", desc: "Break down portfolio by currency pair, maturity bucket, legal entity, risk category, and hedge instrument. Full drill-down from aggregate portfolio view to individual position detail. Concentration metrics (HHI, top-N exposure, diversification score) computed in real-time by the deterministic engine." },
  { icon: <Target size={20} />, title: "Hedge Plan Generation", desc: "Automatic bucket-level hedge recommendations with coverage ratio optimization. Instrument selection (forwards, options, swaps) and notional sizing based on policy parameters. The deterministic engine validates the plan against effectiveness thresholds and accounting treatment rules before execution." },
  { icon: <Globe2 size={20} />, title: "Multi-Entity Consolidation", desc: "Consolidate exposure across subsidiaries, branches, and legal entities with inter-company netting. Cross-currency exposure aggregation with entity-level drill-down. The engine identifies natural hedges between entities and quantifies netting benefits deterministically." },
  { icon: <BarChart3 size={20} />, title: "Concentration Analysis", desc: "Herfindahl-Hirschman Index for currency concentration, peak bucket identification, diversification scoring, and maturity distribution analysis. Concentration thresholds are computed deterministically and compared against configured risk appetite parameters." },
  { icon: <Zap size={20} />, title: "Scenario Stress Testing", desc: "Parametric shocks across all risk factors with hedged vs. unhedged comparison. Run standard scenarios (parallel shift, bear steepener, vol spike) or custom shock packs. The engine ranks positions by marginal risk contribution across each scenario." },
  { icon: <Eye size={20} />, title: "Institutional Reporting", desc: "Generate audit-ready reports for stakeholders, regulators, and board presentations. AI helps write clear summaries of complex risk decompositions and format institutional-grade documentation. All underlying data and calculations are deterministic and reproducible." },
];

export default function PortfolioPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#FFFBEB", border: "1px solid #fcd34d", borderRadius: 4, padding: "6px 14px", marginBottom: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B", display: "inline-block" }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: "#92400E", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            BETA · APRIL 1, 2026
          </span>
        </div>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>ORDR Portfolio</h1>
        <p style={{ fontFamily: F.ui, fontSize: 20, color: C.textSub, maxWidth: 700, margin: "0 auto 12px", lineHeight: 1.6 }}>
          Deterministic Portfolio Risk Decomposition with Institutional Reporting
        </p>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 650, margin: "0 auto 32px", lineHeight: 1.7 }}>
          Deterministic risk classification across the R1-R8 taxonomy with full exposure decomposition.
          AI helps with customer management and writing better institutional reports. All calculations are fully deterministic.
        </p>
        <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Request Demo <ArrowRight size={16} />
        </Link>
      </section>

      {/* Stats */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 48px" }}>
        <div className="stats-row" style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "center", gap: 48 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 24, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Risk Decomposition SVG */}
      <section style={{ padding: "80px 48px 40px", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Risk Decomposition Flow</h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 32px", lineHeight: 1.7, maxWidth: 700 }}>
          Every position flows through deterministic classification, risk quantification, and report generation.
        </p>
        <svg viewBox="0 0 800 300" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto" }}>
          {/* Portfolio Input */}
          <rect x="20" y="110" width="140" height="80" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="90" y="142" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#111" textAnchor="middle">PORTFOLIO</text>
          <text x="90" y="158" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">Positions, Entities</text>
          <text x="90" y="172" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">Currency Pairs</text>

          {/* R1-R8 Classification */}
          <rect x="210" y="40" width="180" height="220" rx="8" fill="#1E3A5F" />
          <text x="300" y="66" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#FFFFFF" textAnchor="middle">R1-R8 CLASSIFICATION</text>
          {["R1 Translation", "R2 Transaction", "R3 Economic", "R4 Strategic", "R5 Operational", "R6 Settlement", "R7 Credit", "R8 Liquidity"].map((r, i) => (
            <g key={r}>
              <rect x="225" y={80 + i * 22} width="150" height="18" rx="3" fill="rgba(255,255,255,0.1)" />
              <text x="300" y={93 + i * 22} fontFamily="IBM Plex Mono, monospace" fontSize="8" fill="rgba(255,255,255,0.7)" textAnchor="middle">{r}</text>
            </g>
          ))}

          {/* AI Layer */}
          <rect x="440" y="80" width="150" height="140" rx="8" fill="rgba(30,58,95,0.06)" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="4 2" />
          <text x="515" y="106" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#1E3A5F" textAnchor="middle">REPORT ENGINE</text>
          <text x="515" y="132" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#1E3A5F" textAnchor="middle">Stakeholder Reports</text>
          <text x="515" y="152" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#1E3A5F" textAnchor="middle">Board Summaries</text>
          <text x="515" y="172" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#1E3A5F" textAnchor="middle">Audit Documentation</text>
          <text x="515" y="192" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#1E3A5F" textAnchor="middle">Regulatory Filings</text>

          {/* Output */}
          <rect x="640" y="110" width="140" height="80" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="710" y="142" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#111" textAnchor="middle">RISK REPORT</text>
          <text x="710" y="158" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">Decomposition</text>
          <text x="710" y="172" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">Hedge Plan</text>

          {/* Arrows */}
          <line x1="160" y1="150" x2="208" y2="150" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrPf)" />
          <line x1="390" y1="150" x2="438" y2="150" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrPf2)" />
          <line x1="590" y1="150" x2="638" y2="150" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrPf)" />

          <defs>
            <marker id="arrPf" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#E5E7EB" /></marker>
            <marker id="arrPf2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#1E3A5F" /></marker>
          </defs>
        </svg>
      </section>

      {/* R1-R8 Taxonomy */}
      <section style={{ padding: "40px 48px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>R1-R8 Risk Taxonomy</h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 40px", lineHeight: 1.7, maxWidth: 700 }}>
          Eight risk categories, architecturally frozen. Every position is classified across all dimensions with deterministic quantification. Each category is computed independently and reproducibly by the engine.
        </p>
        <div className="risk-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {RISK_CATEGORIES.map(r => (
            <div key={r.code} style={{ padding: "20px 24px", border: `1px solid ${C.border}`, borderRadius: 8, borderLeft: `3px solid ${C.accent}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 800, color: C.accent }}>{r.code}</span>
                <span style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text }}>{r.name}</span>
              </div>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0 }}>{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 48px", color: C.text }}>Capabilities</h2>
          <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ padding: "28px 24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ color: C.accent }}>{f.icon}</div>
                  <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text }}>{f.title}</div>
                </div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Decompose your portfolio risk</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>R1-R8 classification, deterministic risk decomposition, and institutional-grade reporting.</p>
        <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Request Demo <ArrowRight size={16} />
        </Link>
      </section>

      <style>{`@media(max-width:768px){
        .feat-grid { grid-template-columns: 1fr !important; }
        .risk-grid { grid-template-columns: 1fr !important; }
        .stats-row { flex-wrap: wrap; gap: 24px !important; }
      }`}</style>
    </MarketingLayout>
  );
}
