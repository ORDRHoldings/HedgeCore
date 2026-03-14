"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, LayoutDashboard, CalendarDays, Building2, Star, Signal, Rss,
  Brain, Filter, Bell, Layers,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "6", label: "Intelligence Tabs" },
  { value: "Real-Time", label: "Data Feed" },
  { value: "5", label: "Asset Classes" },
  { value: "AI-Curated", label: "Signal Detection" },
  { value: "Global", label: "Coverage" },
];

const FEATURES = [
  { icon: <LayoutDashboard size={20} />, title: "Market Intelligence Dashboard", desc: "Real-time market overview with ticker tape, sector heatmaps, and cross-asset correlation analysis. Customizable layouts with widget-based composition -- pin the data feeds most relevant to your portfolio. AI curates the dashboard by highlighting instruments and sectors with unusual activity relative to your exposure profile. The dashboard adapts: if you hold EUR/USD positions, EUR-related macro data gets priority placement." },
  { icon: <CalendarDays size={20} />, title: "Economic Calendar", desc: "Full global economic event calendar with impact ratings (high/medium/low), historical surprise data, and consensus forecasts. Coverage spans central bank decisions (Fed, ECB, BoJ, BoE, PBoC), labor data, inflation prints, GDP releases, PMI surveys, and trade balance reports. AI pre-filters events by relevance to your portfolio, adds contextual notes explaining why specific events matter for your positions, and provides historical analysis of how your currency pairs reacted to similar data surprises." },
  { icon: <Building2 size={20} />, title: "Company Research", desc: "Symbol search with institutional-grade company profiles: financial statements, valuation metrics, technical analysis overlays, ownership data, and earnings history. Fundamental data includes P/E, EV/EBITDA, FCF yield, debt ratios, and margin trends. AI provides company analysis summaries highlighting key risks, competitive positioning, and currency exposure embedded in the company operations -- particularly useful for understanding FX risk in equity portfolios." },
  { icon: <Star size={20} />, title: "Custom Watchlists", desc: "Build and monitor unlimited watchlists with real-time price updates, daily change metrics, and custom alert thresholds. Organize by strategy, asset class, or risk theme. Share watchlists across team members with view/edit permissions. AI monitors your watchlists for unusual price action, volume spikes, and correlation breaks, alerting you to changes that might affect your hedge portfolio or require attention." },
  { icon: <Signal size={20} />, title: "AI Signal Detection", desc: "Technical analysis signals across major indices and currency pairs with regime classification (trending, ranging, volatile, transitioning). Signal detection combines multiple indicator readings (RSI divergence, MACD crossovers, Bollinger Band breaks, volume anomalies) into composite regime scores. The AI does not provide buy/sell signals -- it identifies regime changes and explains what the signal landscape suggests about current market structure relative to your positions." },
  { icon: <Rss size={20} />, title: "Curated News & Analysis", desc: "Multi-source financial news aggregation with AI-powered relevance filtering. News items are scored by relevance to your portfolio, asset class, and risk theme. AI summarizes long-form analysis into actionable insights, extracts key data points, and cross-references news events with your economic calendar and position data. Institutional sources only -- no social media noise, no unverified rumors." },
  { icon: <Filter size={20} />, title: "AI Noise Reduction", desc: "The financial data universe is overwhelming. FinHub AI reduces noise by learning your portfolio context and filtering all feeds (news, calendar, signals, research) through a relevance lens. Events affecting currencies you hold are surfaced first. News about sectors in your equity portfolio gets priority. Calendar events with historical impact on your specific pairs are highlighted. Everything else is accessible but not in your face." },
  { icon: <Bell size={20} />, title: "Contextual Alerts", desc: "Configurable alert system across all FinHub data feeds. Price alerts, news alerts, calendar event reminders, and signal regime change notifications. AI enriches each alert with context: why this alert matters now, what the historical precedent suggests, and what actions you might consider. Multi-channel delivery via terminal notification, email digest, or voice summary through the AI assistant." },
];

export default function FinHubPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>ORDR FinHub</h1>
        <p style={{ fontFamily: F.ui, fontSize: 20, color: C.textSub, maxWidth: 700, margin: "0 auto 12px", lineHeight: 1.6 }}>
          AI-Curated Market Intelligence
        </p>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 650, margin: "0 auto 32px", lineHeight: 1.7 }}>
          Economic calendars, company research, signal detection, and curated news -- all filtered through an AI layer
          that understands your portfolio context. Less noise, more signal. Every data feed is scored by relevance to your positions.
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

      {/* Data Flow Diagram */}
      <section style={{ padding: "80px 48px 40px", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Intelligence Data Flow</h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 32px", lineHeight: 1.7, maxWidth: 700 }}>
          Raw market data flows through AI curation and portfolio-aware filtering before reaching your dashboard.
        </p>
        <svg viewBox="0 0 800 300" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto" }}>
          {/* Raw Data Sources */}
          <rect x="20" y="30" width="160" height="240" rx="8" fill="#0C0C0C" />
          <text x="100" y="58" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="rgba(255,255,255,0.7)" textAnchor="middle">DATA SOURCES</text>
          {["Market Prices", "News Feeds", "Economic Data", "Earnings Data", "Regulatory", "Signals"].map((src, i) => (
            <g key={src}>
              <rect x="35" y={72 + i * 30} width="130" height="22" rx="4" fill="rgba(255,255,255,0.08)" />
              <text x="100" y={87 + i * 30} fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="rgba(255,255,255,0.6)" textAnchor="middle">{src}</text>
            </g>
          ))}

          {/* AI Curation Layer */}
          <rect x="230" y="50" width="170" height="200" rx="8" fill="rgba(30,58,95,0.06)" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="4 2" />
          <text x="315" y="78" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#1E3A5F" textAnchor="middle">AI CURATION</text>
          {["Relevance Scoring", "Noise Reduction", "Context Addition", "Alert Generation", "Summarization"].map((item, i) => (
            <g key={item}>
              <text x="315" y={108 + i * 28} fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#1E3A5F" textAnchor="middle">{item}</text>
            </g>
          ))}

          {/* Portfolio Context */}
          <rect x="270" y="260" width="90" height="30" rx="4" fill="#1E3A5F" />
          <text x="315" y="280" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#FFFFFF" textAnchor="middle">PORTFOLIO</text>
          <line x1="315" y1="260" x2="315" y2="250" stroke="#1E3A5F" strokeWidth="1" markerEnd="url(#arrFh)" />

          {/* Intelligence Tabs */}
          <rect x="450" y="30" width="160" height="240" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="530" y="58" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#111" textAnchor="middle">6 INTEL TABS</text>
          {["Overview", "Heatmap", "Calendar", "Companies", "Watchlists", "Signals"].map((tab, i) => (
            <g key={tab}>
              <rect x="465" y={72 + i * 30} width="130" height="22" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="0.5" />
              <text x="530" y={87 + i * 30} fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#111" textAnchor="middle">{tab}</text>
            </g>
          ))}

          {/* User */}
          <rect x="660" y="110" width="120" height="80" rx="8" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="2" />
          <text x="720" y="142" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#111" textAnchor="middle">TREASURY</text>
          <text x="720" y="160" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#111" textAnchor="middle">TEAM</text>
          <text x="720" y="178" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">Curated Feed</text>

          {/* Arrows */}
          <line x1="180" y1="150" x2="228" y2="150" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" markerEnd="url(#arrFh)" />
          <line x1="400" y1="150" x2="448" y2="150" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrFh2)" />
          <line x1="610" y1="150" x2="658" y2="150" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrFh3)" />

          <defs>
            <marker id="arrFh" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#1E3A5F" /></marker>
            <marker id="arrFh2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#1E3A5F" /></marker>
            <marker id="arrFh3" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#E5E7EB" /></marker>
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

      {/* Enterprise Notice */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "56px 48px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div style={{ color: C.accent, flexShrink: 0, marginTop: 2 }}><Brain size={24} /></div>
          <div>
            <div style={{ fontFamily: F.ui, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Intelligence, not advice.</div>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
              ORDR FinHub provides curated market intelligence and contextual analysis. It does not provide investment advice,
              trading recommendations, or guaranteed signal accuracy. The AI filters and contextualizes data based on your
              portfolio -- interpretation and decision-making remain with your team. All data sources are institutional-grade
              with auditable provenance. Signal detection identifies regime changes, not entry/exit points.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Access financial intelligence</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>AI-curated market data, economic calendars, and portfolio-aware signal detection.</p>
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
