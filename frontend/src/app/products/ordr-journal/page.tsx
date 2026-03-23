"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, BookOpen, TrendingUp, BarChart2, Brain,
  FileText, Calendar, Shield, Database,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "∞", label: "Trade Log" },
  { value: "R:R", label: "Risk Tracking" },
  { value: "Sharpe", label: "Performance" },
  { value: "Daily", label: "Journal Notes" },
  { value: "AI", label: "Pattern Review" },
];

const FEATURES = [
  {
    icon: <BookOpen size={20} />,
    title: "Trade Log",
    desc: "Every trade captured with entry/exit, size, P&L, tags, strategy label, and screenshot attachment. Filterable by date, pair, strategy, or outcome.",
  },
  {
    icon: <TrendingUp size={20} />,
    title: "Performance Analytics",
    desc: "Real-time equity curve, Sharpe ratio, Sortino ratio, Calmar ratio, max drawdown, win rate, average R:R, profit factor. Full statistical breakdown.",
  },
  {
    icon: <BarChart2 size={20} />,
    title: "Strategy Comparison",
    desc: "Compare performance across strategies side-by-side. Identify which setups are generating alpha and which need refinement.",
  },
  {
    icon: <Brain size={20} />,
    title: "AI Pattern Review",
    desc: "AI analyzes your journal entries to identify behavioral patterns, overtrading signals, emotional trade flags, and setup quality drift over time.",
  },
  {
    icon: <FileText size={20} />,
    title: "Daily Journal",
    desc: "Pre-market prep, intraday notes, post-session review. Voice-to-text entry. Market commentary. Psychological state tracking.",
  },
  {
    icon: <Calendar size={20} />,
    title: "Economic Calendar",
    desc: "Integrated macro calendar with earnings, central bank meetings, and high-impact data releases. Auto-tag trades with macro context.",
  },
  {
    icon: <Shield size={20} />,
    title: "Risk Controls",
    desc: "Pre-trade risk calculator, position sizing, max daily loss alerts, drawdown circuit breakers. Never blow an account from one bad session.",
  },
  {
    icon: <Database size={20} />,
    title: "Data Export",
    desc: "Full trade history export to CSV, PDF summary reports, tax lot reports, and broker reconciliation files.",
  },
];

// Equity curve polyline data points (x, y) — viewBox 0 0 900 320
// Y range: 0 = $25k (top), 280 = $0 (bottom); working area ~60–280 for $0–$25k
// Each $5k = 44px step from bottom (280)
// Jan x=60 → Dec x=840, step ~72px
const EQUITY_PTS: [number, number][] = [
  [60,  192], // Jan  $10k  (280 - 10/25*280 = 280-112 = 168 … rescaling to 60-280 range)
  [132, 178], // Feb  $11k
  [204, 160], // Mar  $12.3k
  [276, 152], // Apr  $12.9k  — drawdown starts
  [348, 175], // May  $11.3k  — drawdown
  [420, 185], // Jun  $10.7k  — drawdown trough
  [492, 162], // Jul  $12.6k  — recovery
  [564, 140], // Aug  $14.2k
  [636, 122], // Sep  $15.7k
  [708, 108], // Oct  $16.9k
  [780, 95],  // Nov  $17.9k
  [840, 80],  // Dec  $19.1k  → ~$24k displayed
];

const EQ_POLY = EQUITY_PTS.map(([x, y]) => `${x},${y}`).join(" ");
const AREA_POLY = `60,280 ${EQ_POLY} 840,280`;

// Drawdown shaded region: Apr(276) → Jun(420)
const DD_POLY = `276,152 348,175 420,185 420,280 276,280`;

const MONTHLY_DATA = [
  { month: "Jan", pct: 2.1,  pos: true  },
  { month: "Feb", pct: 3.4,  pos: true  },
  { month: "Mar", pct: -1.2, pos: false },
  { month: "Apr", pct: 0.8,  pos: true  },
  { month: "May", pct: -2.1, pos: false },
  { month: "Jun", pct: 4.2,  pos: true  },
  { month: "Jul", pct: 3.1,  pos: true  },
  { month: "Aug", pct: -0.4, pos: false },
  { month: "Sep", pct: 2.8,  pos: true  },
  { month: "Oct", pct: 1.9,  pos: true  },
  { month: "Nov", pct: -0.6, pos: false },
  { month: "Dec", pct: 3.2,  pos: true  },
];

// Bar chart sizing — viewBox 0 0 900 280
// Bars: 12 months, x from 60, step 70, bar width 40
// Y zero line at y=180; max positive = 4.5% → ~80px above; max negative = 2.5% → ~45px below
const BAR_ZERO = 180;
const BAR_SCALE = 18; // px per 1%

const JOURNAL_CARDS = [
  {
    date: "2026-03-20 — Pre-Market",
    body: "EURUSD long setup forming above 1.085 support. NFP data at 8:30 — staying flat until number drops. Key levels: 1.0820 / 1.0920 / 1.1000.",
    tags: ["ANALYSIS", "MACRO"],
  },
  {
    date: "2026-03-20 — Trade #247",
    body: "EURUSD long 1.0858 → 1.0924. R:R 1:2.4. Position sized at 1.2% risk. Clean breakout after NFP surprise. Held through first pullback to plan.",
    tags: ["+2.4R", "CONFIRMED"],
  },
  {
    date: "2026-03-20 — Post-Session",
    body: "3 trades, 2 winners 1 breakeven. Hit daily target early, closed desk. No revenge trades. Equity +$840. Psychological state: disciplined.",
    tags: ["REVIEW", "+$840"],
  },
];

export default function ORDRJournalPage() {
  return (
    <MarketingLayout>

      {/* ── 1. Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link
          href="/products"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}
        >
          <ChevronLeft size={14} /> All Products
        </Link>
        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 20 }}>
          [ORDR JOURNAL]
        </div>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 20px", color: C.text }}>
          The Institutional Trading Journal
        </h1>
        <p style={{ fontFamily: F.ui, fontSize: 17, color: C.textSub, maxWidth: 680, margin: "0 auto 36px", lineHeight: 1.7 }}>
          Track every trade, measure every decision. Performance analytics, psychological tracking, and strategy review for professional traders.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="https://ordr-journal-client.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}
          >
            Open Live Demo <ArrowRight size={16} />
          </a>
          <Link
            href="/products"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "transparent", border: `1.5px solid ${C.accent}`, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}
          >
            View Products
          </Link>
        </div>
      </section>

      {/* ── 2. Stats Strip ───────────────────────────────────────────────────── */}
      <section style={{ background: C.bg, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 48px" }}>
        <div className="stats-row" style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "center", gap: 48 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 24, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. Equity Curve Chart ────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
          PERFORMANCE ANALYTICS
        </div>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 14px", color: C.text }}>
          Equity Curve &amp; Drawdown Analysis
        </h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, maxWidth: 680, margin: "0 0 40px", lineHeight: 1.7 }}>
          Track your cumulative P&amp;L in real time. Identify max drawdown periods, recovery trajectories, and overall account growth against your benchmark curve.
        </p>

        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.bg }}>
          <svg viewBox="0 0 900 320" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto", display: "block" }}>

            {/* Grid lines — horizontal every ~44px (each $5k), vertical every 80px */}
            {[60, 140, 220, 300].map(y => (
              <line key={`hg${y}`} x1="60" y1={y} x2="860" y2={y} stroke="#F0F0F0" strokeWidth="1" />
            ))}
            {[60, 140, 220, 300, 380, 460, 540, 620, 700, 780, 860].map(x => (
              <line key={`vg${x}`} x1={x} y1="40" x2={x} y2="280" stroke="#F0F0F0" strokeWidth="1" />
            ))}

            {/* Y-axis labels */}
            {[["$0", 280], ["$5k", 236], ["$10k", 192], ["$15k", 148], ["$20k", 104], ["$25k", 60]].map(([lbl, y]) => (
              <text
                key={`yl${lbl}`}
                x="52"
                y={Number(y) + 4}
                fontFamily="IBM Plex Mono, monospace"
                fontSize="9"
                fill="#999"
                textAnchor="end"
              >
                {lbl}
              </text>
            ))}

            {/* X-axis month labels */}
            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
              <text
                key={`xl${m}`}
                x={60 + i * 72}
                y="298"
                fontFamily="IBM Plex Mono, monospace"
                fontSize="9"
                fill="#999"
                textAnchor="middle"
              >
                {m}
              </text>
            ))}

            {/* Drawdown shaded period (Apr–Jun) */}
            <polygon points={DD_POLY} fill="rgba(239,68,68,0.07)" />

            {/* Drawdown line segment */}
            <polyline points="276,152 348,175 420,185" stroke="#EF4444" strokeWidth="1.5" fill="none" strokeDasharray="4 2" />

            {/* Area under equity curve */}
            <polygon points={AREA_POLY} fill="rgba(30,58,95,0.07)" />

            {/* Equity curve line */}
            <polyline points={EQ_POLY} stroke="#1E3A5F" strokeWidth="2.5" fill="none" strokeLinejoin="round" />

            {/* Chart title */}
            <text x="68" y="28" fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="700" fill="#999" letterSpacing="1">
              EQUITY CURVE
            </text>

            {/* MAX DD label */}
            <rect x="320" y="188" width="90" height="18" rx="3" fill="rgba(239,68,68,0.12)" />
            <text x="365" y="200" fontFamily="IBM Plex Mono, monospace" fontSize="9" fontWeight="700" fill="#EF4444" textAnchor="middle">
              MAX DD: -8.3%
            </text>

            {/* CURRENT label */}
            <rect x="750" y="64" width="100" height="18" rx="3" fill="rgba(30,58,95,0.10)" />
            <text x="800" y="76" fontFamily="IBM Plex Mono, monospace" fontSize="9" fontWeight="700" fill="#1E3A5F" textAnchor="middle">
              CURRENT: +14.2%
            </text>

            {/* Dot at current position */}
            <circle cx="840" cy="80" r="4" fill="#1E3A5F" />
          </svg>
        </div>

        {/* Chart summary stats */}
        <div className="chart-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: C.border, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginTop: 2 }}>
          {[
            { label: "Total Return", value: "+14.2%" },
            { label: "Max Drawdown", value: "-8.3%" },
            { label: "Win Rate", value: "64.2%" },
            { label: "Sharpe Ratio", value: "1.87" },
          ].map(s => (
            <div key={s.label} style={{ background: C.bg, padding: "20px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 22, fontWeight: 800, color: s.label === "Max Drawdown" ? "#EF4444" : C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. Monthly P&L Bar Chart ─────────────────────────────────────────── */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
            MONTHLY BREAKDOWN
          </div>
          <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 14px", color: C.text }}>
            Month-by-Month Performance
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, maxWidth: 680, margin: "0 0 40px", lineHeight: 1.7 }}>
            See exactly which months drove performance and which created drag. Drill into any month for a full trade log, strategy breakdown, and session notes.
          </p>

          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <svg viewBox="0 0 900 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto", display: "block" }}>

              {/* Y-axis labels and horizontal guide lines */}
              {[
                ["-3%", BAR_ZERO + 3 * BAR_SCALE],
                ["0%",  BAR_ZERO],
                ["+2%", BAR_ZERO - 2 * BAR_SCALE],
                ["+4%", BAR_ZERO - 4 * BAR_SCALE],
              ].map(([lbl, y]) => (
                <g key={`yb${lbl}`}>
                  <line x1="60" y1={Number(y)} x2="870" y2={Number(y)} stroke="#F0F0F0" strokeWidth="1" />
                  <text x="54" y={Number(y) + 4} fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#999" textAnchor="end">{lbl}</text>
                </g>
              ))}

              {/* Zero dashed line */}
              <line x1="60" y1={BAR_ZERO} x2="870" y2={BAR_ZERO} stroke="#E5E7EB" strokeWidth="1.5" strokeDasharray="6 3" />

              {/* Bars */}
              {MONTHLY_DATA.map((m, i) => {
                const barH = Math.abs(m.pct) * BAR_SCALE;
                const barX = 68 + i * 70;
                const barY = m.pos ? BAR_ZERO - barH : BAR_ZERO;
                const barColor = m.pos ? "#1E3A5F" : "#EF4444";
                const lblY = m.pos ? barY - 5 : barY + barH + 13;
                const sign = m.pos ? "+" : "";
                return (
                  <g key={m.month}>
                    <rect x={barX} y={barY} width="40" height={barH} rx="3" fill={barColor} opacity="0.85" />
                    <text x={barX + 20} y={lblY} fontFamily="IBM Plex Mono, monospace" fontSize="8" fontWeight="700" fill={barColor} textAnchor="middle">
                      {sign}{m.pct}%
                    </text>
                    <text x={barX + 20} y="262" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#999" textAnchor="middle">
                      {m.month}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </section>

      {/* ── 5. Features Grid ─────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
          FEATURES
        </div>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 14px", color: C.text }}>
          Everything a professional trader needs
        </h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, maxWidth: 680, margin: "0 0 48px", lineHeight: 1.7 }}>
          Built for traders who treat performance as a discipline, not a hope. From raw trade log to statistical edge identification.
        </p>
        <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
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

      {/* ── 6. Journal Entry Showcase ────────────────────────────────────────── */}
      <section style={{ background: C.bgDark, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.textOnDarkMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
            JOURNAL ENTRIES
          </div>
          <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 14px", color: C.textOnDark }}>
            Built for reflection, not just record-keeping
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: "rgba(255,255,255,0.5)", maxWidth: 680, margin: "0 0 48px", lineHeight: 1.7 }}>
            A journal that captures the thinking behind the trade — not just the numbers. Pre-market prep, live annotations, and post-session review in a single connected flow.
          </p>
          <div className="journal-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {JOURNAL_CARDS.map(card => (
              <div
                key={card.date}
                style={{ background: "#111111", border: "1px solid #374151", borderRadius: 8, padding: "24px 20px" }}
              >
                <div style={{ fontFamily: F.mono, fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12, letterSpacing: "0.04em" }}>
                  {card.date}
                </div>
                <p style={{ fontFamily: F.ui, fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.75, margin: "0 0 20px" }}>
                  {card.body}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {card.tags.map(tag => (
                    <span
                      key={tag}
                      style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3, padding: "3px 8px", letterSpacing: "0.06em" }}
                    >
                      [{tag}]
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. CTA ───────────────────────────────────────────────────────────── */}
      <section style={{ background: C.bg, borderTop: `1px solid ${C.border}`, padding: "80px 48px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text }}>
            Start journaling like an institution
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 16, color: C.textSub, margin: "0 0 36px", lineHeight: 1.7 }}>
            Your edge is in your data. Every trade tells a story.
          </p>
          <a
            href="https://ordr-journal-client.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "14px 32px", borderRadius: 6, textDecoration: "none" }}
          >
            Open ORDR Journal <ArrowRight size={16} />
          </a>
        </div>
      </section>

      <style>{`
        @media (max-width: 768px) {
          .feat-grid    { grid-template-columns: 1fr !important; }
          .journal-grid { grid-template-columns: 1fr !important; }
          .chart-stats  { grid-template-columns: repeat(2, 1fr) !important; }
          .stats-row    { flex-wrap: wrap; gap: 24px !important; }
        }
      `}</style>
    </MarketingLayout>
  );
}
