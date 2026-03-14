"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Layers, PieChart, Target, Globe2, BarChart3, Zap,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const FEATURES = [
  { icon: <Layers size={20} />, title: "R1-R8 Risk Taxonomy", desc: "Eight risk categories: translation, transaction, economic, strategic, operational, settlement, credit, liquidity. Frozen, auditable classification." },
  { icon: <PieChart size={20} />, title: "Exposure Decomposition", desc: "Break down portfolio by currency pair, maturity, entity, and risk type. Full drill-down from aggregate to individual position." },
  { icon: <Target size={20} />, title: "Hedge Plan Generation", desc: "Automatic bucket-level hedge recommendations with coverage ratio optimization. Instrument selection and notional sizing." },
  { icon: <Globe2 size={20} />, title: "Multi-Currency Support", desc: "USD, EUR, GBP, JPY, MXN, and 100+ currency pairs. Cross-currency netting and multi-entity consolidation." },
  { icon: <BarChart3 size={20} />, title: "Concentration Analysis", desc: "Herfindahl-Hirschman Index, peak bucket identification, diversification scoring. Identify and manage concentration risk." },
  { icon: <Zap size={20} />, title: "Scenario Stress Testing", desc: "Parametric shocks across all risk factors with hedged vs unhedged comparison. Quantify downside across scenarios." },
];

const STATS = [
  { value: "8", label: "Risk Categories" },
  { value: "100+", label: "Currency Pairs" },
  { value: "<50ms", label: "Computation" },
];

export default function PortfolioPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>ORDR Portfolio</h1>
        <p style={{ fontFamily: F.ui, fontSize: 18, color: C.textSub, maxWidth: 600, margin: "0 auto 32px", lineHeight: 1.6 }}>
          Enterprise portfolio risk decomposition. R1-R8 risk taxonomy, exposure analysis, hedge plan generation, and scenario stress testing.
        </p>
        <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      {/* Stats */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 48px" }}>
        <div className="stats-row" style={{ maxWidth: 800, margin: "0 auto", display: "flex", justifyContent: "center", gap: 64 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 28, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 48px", color: C.text }}>Capabilities</h2>
        <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ color: C.accent, marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>{f.title}</div>
              <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Decompose your portfolio risk</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>R1-R8 classification, exposure analysis, and hedge plan generation.</p>
        <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      <style>{`@media(max-width:768px){
        .feat-grid { grid-template-columns: 1fr !important; }
        .stats-row { flex-wrap: wrap; gap: 32px !important; }
      }`}</style>
    </MarketingLayout>
  );
}
