"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, LayoutDashboard, CalendarDays, Building2, Star, Signal, Rss,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const FEATURES = [
  { icon: <LayoutDashboard size={20} />, title: "Market Intelligence Dashboard", desc: "Real-time market overview with ticker tape, heatmaps, and sector analysis. Everything you need at a glance." },
  { icon: <CalendarDays size={20} />, title: "Economic Calendar", desc: "Full economic event calendar with impact ratings and historical data. Never miss a market-moving event." },
  { icon: <Building2 size={20} />, title: "Company Research", desc: "Symbol search with overview, technical analysis, and fundamental data. Deep dive into any publicly traded company." },
  { icon: <Star size={20} />, title: "Custom Watchlists", desc: "Build and monitor watchlists with real-time updates. Track your portfolio and interests across all asset classes." },
  { icon: <Signal size={20} />, title: "Signal Detection", desc: "Technical analysis signals across major indices with regime classification. Identify trends and reversals automatically." },
  { icon: <Rss size={20} />, title: "News & Analysis", desc: "Curated financial news stream with relevance filtering. Stay informed with institutional-quality analysis." },
];

const STATS = [
  { value: "6", label: "Intelligence Tabs" },
  { value: "Real-Time", label: "Data Feed" },
  { value: "5", label: "Asset Classes" },
];

export default function FinHubPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>ORDR FinHub</h1>
        <p style={{ fontFamily: F.ui, fontSize: 18, color: C.textSub, maxWidth: 600, margin: "0 auto 32px", lineHeight: 1.6 }}>
          Financial intelligence, curated and actionable. Market dashboards, economic calendars, company research, custom watchlists, and signal detection.
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
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Access financial intelligence</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>Market dashboards, economic calendars, and curated analysis.</p>
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
