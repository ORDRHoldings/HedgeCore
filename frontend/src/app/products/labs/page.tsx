"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Sliders, Box, BookMarked, RefreshCw, History, Shuffle,
  Shield, BarChart3,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "50+", label: "Scenarios" },
  { value: "10,000+", label: "Monte Carlo Paths" },
  { value: "SHA-256", label: "Report Integrity" },
  { value: "Full", label: "Sandbox Isolation" },
  { value: "Multi-Period", label: "Backtesting" },
];

const FEATURES = [
  { icon: <Sliders size={20} />, title: "Scenario Studio", desc: "Configure custom shock packs with parametric control over every risk factor. Vol-scaled stress tests automatically adjust shock magnitudes based on realized volatility regime. Historical VaR and Expected Shortfall (ES) analysis with configurable confidence levels (95%, 99%, 99.5%). Select scenario parameters based on your portfolio composition to identify the stress tests most relevant to your specific exposure profile." },
  { icon: <Box size={20} />, title: "Sandbox Environment", desc: "Full isolation from production data and governance pipeline. Test any policy configuration, any shock scenario, any hedge structure without affecting live positions. Draft persistence across sessions so you can build complex experiments over time. The sandbox mirrors production engine behavior exactly -- same deterministic kernel, same validation rules -- but with complete freedom to experiment." },
  { icon: <BookMarked size={20} />, title: "Crisis Library", desc: "Pre-built crisis scenarios calibrated from historical events: 2008 GFC (credit freeze + vol spike + EM contagion), 2015 CHF de-peg (instantaneous 20% move), 2016 Brexit referendum (GBP flash), 2020 COVID (cross-asset correlation spike), 2022 rate hike cycle (USD strength + EM pressure), and historical EM currency crises (TRY, ZAR, BRL, ARS). Each scenario includes multiple severity levels and compound stress combinations with full historical context documentation." },
  { icon: <RefreshCw size={20} />, title: "What-If Analysis", desc: "Change any policy parameter and see real-time impact on hedge positions. Modify hedge ratios, swap instruments, adjust maturity profiles, or shift netting assumptions and instantly see the cascading effects across your portfolio. Side-by-side comparison of current vs. proposed policy with quantified P&L impact, including downstream effectiveness changes, governance tier shifts, and accounting treatment implications." },
  { icon: <History size={20} />, title: "Backtesting Engine", desc: "Single-period and multi-period backtests with policy comparison across historical data windows. Run any policy against past market data and measure actual vs. predicted performance. SHA-256 report hashing for tamper-evident backtest records. Policy comparison mode tests multiple configurations against the same historical period, ranking by effectiveness, cost, and risk reduction." },
  { icon: <Shuffle size={20} />, title: "Monte Carlo Simulation", desc: "Stochastic scenario generation with configurable path counts (1,000 to 100,000+), distribution assumptions (normal, t-distribution, historical bootstrap), and correlation structures. Tail risk quantification with confidence interval estimation, distribution analysis, and extreme event probability. Compare simulated outcomes against your risk appetite thresholds and historical precedents." },
  { icon: <BarChart3 size={20} />, title: "Sensitivity Analysis", desc: "Systematic parameter sweeps across hedge ratios, vol assumptions, correlation inputs, and cost parameters. Grid-based analysis showing how output metrics change across parameter ranges. Identify which inputs have the largest marginal impact on your risk-adjusted returns and prioritize calibration accordingly." },
  { icon: <Shield size={20} />, title: "Report Integrity", desc: "Every backtest, simulation, and scenario result is SHA-256 hashed for tamper-evident integrity. Reports are cryptographically sealed at generation time, ensuring that results cannot be modified after the fact. Full audit trail of experiment configurations, parameters, and outputs for regulatory compliance and internal governance." },
];

export default function LabsPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#F0FDF4", border: "1px solid #86efac", borderRadius: 4, padding: "6px 14px", marginBottom: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: "#065F46", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            LIVE · AVAILABLE NOW
          </span>
        </div>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>ORDR Labs</h1>
        <p style={{ fontFamily: F.ui, fontSize: 20, color: C.textSub, maxWidth: 700, margin: "0 auto 12px", lineHeight: 1.6 }}>
          Scenario Studio, Backtesting, and Monte Carlo Simulation
        </p>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 650, margin: "0 auto 32px", lineHeight: 1.7 }}>
          Full sandbox isolation with the same deterministic engine as production. Pure deterministic computation
          for scenario design, stress testing, backtesting, and Monte Carlo simulation. No AI involvement.
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

      {/* Architecture Diagram */}
      <section style={{ padding: "80px 48px 40px", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Sandbox Architecture</h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 32px", lineHeight: 1.7, maxWidth: 700 }}>
          Labs operates in full isolation from production. Same engine, same validation, zero production risk.
        </p>
        <svg viewBox="0 0 800 320" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto" }}>
          {/* Sandbox boundary */}
          <rect x="20" y="20" width="520" height="280" rx="8" fill="#F7F8FA" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="6 3" />
          <text x="40" y="48" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#1E3A5F" letterSpacing="0.08em">SANDBOX ENVIRONMENT</text>

          {/* Scenario Studio */}
          <rect x="50" y="70" width="140" height="70" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <text x="120" y="100" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fontWeight="600" fill="#111" textAnchor="middle">Scenario Studio</text>
          <text x="120" y="118" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">Shocks / VaR / ES</text>

          {/* Monte Carlo */}
          <rect x="50" y="160" width="140" height="70" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <text x="120" y="190" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fontWeight="600" fill="#111" textAnchor="middle">Monte Carlo</text>
          <text x="120" y="208" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">10,000+ Paths</text>

          {/* Backtesting */}
          <rect x="220" y="70" width="140" height="70" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <text x="290" y="100" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fontWeight="600" fill="#111" textAnchor="middle">Backtesting</text>
          <text x="290" y="118" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">SHA-256 Reports</text>

          {/* What-If */}
          <rect x="220" y="160" width="140" height="70" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <text x="290" y="190" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fontWeight="600" fill="#111" textAnchor="middle">What-If Analysis</text>
          <text x="290" y="208" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">Policy Comparison</text>

          {/* Deterministic Engine (inside sandbox) */}
          <rect x="390" y="90" width="130" height="120" rx="6" fill="#1E3A5F" />
          <text x="455" y="120" fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="700" fill="#FFFFFF" textAnchor="middle">DETERMINISTIC</text>
          <text x="455" y="136" fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="700" fill="#FFFFFF" textAnchor="middle">ENGINE</text>
          <text x="455" y="160" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="rgba(255,255,255,0.6)" textAnchor="middle">Same kernel</text>
          <text x="455" y="176" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="rgba(255,255,255,0.6)" textAnchor="middle">Same validation</text>
          <text x="455" y="192" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="rgba(255,255,255,0.6)" textAnchor="middle">Zero side effects</text>

          {/* AI Layer (outside sandbox) */}
          <rect x="580" y="60" width="200" height="200" rx="8" fill="rgba(30,58,95,0.06)" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="4 2" />
          <text x="680" y="88" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#1E3A5F" textAnchor="middle">OUTPUT / REPORTS</text>
          <text x="680" y="120" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#1E3A5F" textAnchor="middle">SHA-256 Reports</text>
          <text x="680" y="145" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#1E3A5F" textAnchor="middle">Result Tables</text>
          <text x="680" y="170" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#1E3A5F" textAnchor="middle">Distribution Charts</text>
          <text x="680" y="195" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#1E3A5F" textAnchor="middle">Policy Comparison</text>
          <text x="680" y="220" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#1E3A5F" textAnchor="middle">Audit Export</text>

          {/* Arrows */}
          <line x1="360" y1="105" x2="388" y2="120" stroke="#E5E7EB" strokeWidth="1" />
          <line x1="360" y1="195" x2="388" y2="180" stroke="#E5E7EB" strokeWidth="1" />
          <line x1="190" y1="105" x2="218" y2="105" stroke="#E5E7EB" strokeWidth="1" />
          <line x1="190" y1="195" x2="218" y2="195" stroke="#E5E7EB" strokeWidth="1" />
          <line x1="540" y1="150" x2="578" y2="150" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrLb)" />

          <defs>
            <marker id="arrLb" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#1E3A5F" /></marker>
          </defs>
        </svg>
      </section>

      {/* Capabilities */}
      <section style={{ padding: "40px 48px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 48px", color: C.text }}>Capabilities</h2>
        <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ color: C.accent }}>{f.icon}</div>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text }}>{f.title}</div>
              </div>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Start experimenting today</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>Deterministic scenario design, backtesting, and Monte Carlo simulation in full sandbox isolation.</p>
        <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Request Demo <ArrowRight size={16} />
        </Link>
      </section>

      <style>{`@media(max-width:768px){
        .feat-grid { grid-template-columns: 1fr !important; }
        .stats-row { flex-wrap: wrap; gap: 24px !important; }
      }`}</style>
    </MarketingLayout>
  );
}
