"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Monitor, BarChart3, TrendingUp, Pencil, Radio, Code2,
  Brain, MessageSquare, Terminal, Zap, Layers, Eye, Shield, BookOpen, Play,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "77+", label: "Indicators" },
  { value: "60fps", label: "Rendering" },
  { value: "Canvas 2D", label: "Engine" },
  { value: "5", label: "Asset Classes" },
  { value: "Multi-Lang", label: "Algo Builder" },
  { value: "AI-Coach", label: "Discipline" },
];

const FEATURES = [
  { icon: <Monitor size={20} />, title: "Custom Canvas 2D Engine", desc: "Purpose-built rendering engine with zero external charting dependencies. 60fps rAF loop with smooth zoom (lerp 0.22 factor), momentum pan (0.92 decay), and full vertical/horizontal scrolling. TradingView-inspired dark theme (#131722 canvas, #26A69A/#EF5350 bull/bear). No WebGL, no Chart.js, no Highcharts -- pure Canvas 2D for maximum control and performance." },
  { icon: <BarChart3 size={20} />, title: "77+ Technical Indicators", desc: "Complete indicator library: RSI, MACD, Stochastic, Bollinger Bands, Ichimoku Cloud, ATR, ADX, CCI, Williams %R, MFI, OBV, VWAP, volume profile, and dozens more. Each indicator is rendered in a dedicated oscillator or overlay pane with configurable parameters. AI helps you understand indicator readings in context -- not as isolated signals, but as part of a broader market structure analysis." },
  { icon: <TrendingUp size={20} />, title: "Multi-Asset Coverage", desc: "FX spot pairs, equities, indices, crypto, and commodities from a single charting workspace. Dual-provider architecture (TwelveData REST + IBKR ib_insync) with automatic failover. Batch queries for 17+ FX pairs, historical OHLC with configurable timeframes, and real-time tick data where available. One interface, every asset class." },
  { icon: <Code2 size={20} />, title: "Algorithm Builder", desc: "Build trading algorithms in Python, JavaScript, or natural language. Technical users get full API access with backtesting hooks, position management, and execution linking. Non-technical users describe strategies in plain English and the AI translates them into executable logic with proper risk controls. Every algorithm is version-controlled, backtestable, and auditable." },
  { icon: <Pencil size={20} />, title: "Professional Drawing Tools", desc: "Four production tools: trendline (full TradingView parity with 20+ config fields), horizontal line, fibonacci retracement, and rectangle. Rubber-band preview with real-time angle badge and pip distance. Shift-snap for 45-degree angles, magnetic snap to OHLC values. Hit testing with 8px threshold and 6px handle radius. Line styles: solid, dashed, dotted with configurable opacity and extension." },
  { icon: <Radio size={20} />, title: "Real-Time Data Infrastructure", desc: "TwelveData provider handles FX spot (batch 17 pairs), historical OHLC, equity/index quotes, and 100+ technical indicators via REST API with rate limiting (8 req/min free tier). IBKR provider delivers FX spot, forward curves, options chains, equity data, and real-time tick via ib_insync. Automatic failover: if the primary provider fails, the system silently switches to the secondary without user intervention." },
  { icon: <Play size={20} />, title: "Execution Linking", desc: "Connect your algorithm output directly to your execution platform. ORDR Market does not execute trades -- it generates signals, validates them against your risk parameters, and forwards them to your broker, OMS, or internal execution system via configurable API integration. Every signal is logged, every execution link is auditable." },
  { icon: <Layers size={20} />, title: "6-Tab Intelligence Workspace", desc: "Overview (market summary + ticker tape), Heatmap (sector and pair correlation), Calendar (economic events with impact ratings), Companies (symbol search + fundamentals), Watchlists (custom lists with real-time updates), and Signals (technical analysis regime classification). Complete market intelligence in a single tabbed workspace." },
];

const ALGO_LANGS = [
  { lang: "Python", desc: "Full pandas/numpy ecosystem. Import your existing quantitative libraries. Backtesting with historical data, vectorized operations, and statistical analysis. Deploy strategies that run server-side with managed state.", code: "def strategy(candles):\n  sma20 = candles.close.rolling(20).mean()\n  return 'LONG' if candles.close[-1] > sma20[-1] else 'FLAT'" },
  { lang: "JavaScript", desc: "Browser-native execution with real-time DOM integration. Access the canvas engine directly for custom overlays and indicators. Event-driven architecture with WebSocket data feeds.", code: "function strategy(candles) {\n  const sma = SMA(candles.close, 20);\n  return candles.close.at(-1) > sma.at(-1) ? 'LONG' : 'FLAT';\n}" },
  { lang: "Natural Language", desc: "Describe your strategy in plain English. The AI translates it into executable code with proper risk controls, position sizing, and exit logic. Review, modify, and approve before deployment.", code: "\"Buy when price crosses above\nthe 20-period moving average\nand RSI is below 70. Risk 1%\nper trade, stop at recent swing low.\"" },
];

export default function MarketPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>
          ORDR Market
        </h1>
        <p style={{ fontFamily: F.ui, fontSize: 20, color: C.textSub, maxWidth: 700, margin: "0 auto 12px", lineHeight: 1.6 }}>
          The First Agentic Charting Platform
        </p>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 650, margin: "0 auto 32px", lineHeight: 1.7 }}>
          AI-integrated charting built for algorithmic trading. Build algorithms for technical and non-technical users alike.
          Python, JavaScript, or natural language. Link execution to your platform. AI coaches trading discipline -- not signals.
        </p>
        <a href="https://ordr-market.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Open ORDR Market <ArrowRight size={16} />
        </a>
      </section>

      {/* Stats Strip */}
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

      {/* Agentic AI for Trading */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Agentic AI for Trading</h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 40px", lineHeight: 1.7, maxWidth: 700 }}>
          The AI does not give signals. It coaches discipline. It helps you read charts better, understand patterns in context,
          maintain your trading plan, and avoid emotional decisions. It is a coach, not an oracle.
        </p>
        <div className="ai-trade-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          <div style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ color: C.accent, marginBottom: 16 }}><Eye size={22} /></div>
            <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>Chart Reading Assistance</div>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
              The AI analyzes chart structure and helps you identify support/resistance levels, trend formations, and volume patterns.
              It does not predict price -- it helps you see what the chart is showing you. Ask it &quot;What does this chart structure suggest?&quot; and get a
              structured analysis of market structure, momentum, and key levels based on the indicators you have active.
            </p>
          </div>
          <div style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ color: C.accent, marginBottom: 16 }}><Brain size={22} /></div>
            <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>Discipline Coaching</div>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
              Define your trading plan and the AI holds you accountable. It flags when you are about to deviate from your rules,
              reminds you of position sizing limits, and tracks your plan adherence over time. After each session, it provides a
              discipline scorecard: entries taken vs. plan, risk per trade vs. limit, and emotional decision count.
            </p>
          </div>
          <div style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ color: C.accent, marginBottom: 16 }}><MessageSquare size={22} /></div>
            <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>Strategy Building</div>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
              Describe a strategy in natural language and the AI generates executable code in Python or JavaScript. It suggests
              risk controls, validates entry/exit logic, and adds proper position sizing. Non-technical traders can build
              sophisticated algorithms without writing a single line of code. Technical traders can iterate faster with AI-assisted debugging.
            </p>
          </div>
        </div>
      </section>

      {/* Architecture Diagram */}
      <section style={{ padding: "0 48px 80px", maxWidth: 900, margin: "0 auto" }}>
        <h3 style={{ fontFamily: F.heading, fontSize: 22, fontWeight: 700, margin: "0 0 24px", color: C.text, textAlign: "center" }}>Trading Flow Architecture</h3>
        <svg viewBox="0 0 800 260" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto" }}>
          {/* Market Data */}
          <rect x="20" y="90" width="130" height="80" rx="8" fill="#0C0C0C" />
          <text x="85" y="122" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="rgba(255,255,255,0.7)" textAnchor="middle">MARKET DATA</text>
          <text x="85" y="140" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="rgba(255,255,255,0.4)" textAnchor="middle">TwelveData + IBKR</text>
          <text x="85" y="154" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="rgba(255,255,255,0.4)" textAnchor="middle">FX / Equity / Crypto</text>

          {/* AI Chart Analysis */}
          <rect x="190" y="90" width="130" height="80" rx="8" fill="rgba(30,58,95,0.06)" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="4 2" />
          <text x="255" y="122" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#1E3A5F" textAnchor="middle">AI ANALYSIS</text>
          <text x="255" y="140" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#1E3A5F" textAnchor="middle">Chart Reading</text>
          <text x="255" y="154" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#1E3A5F" textAnchor="middle">Pattern Context</text>

          {/* Strategy Builder */}
          <rect x="360" y="50" width="130" height="160" rx="8" fill="#1E3A5F" />
          <text x="425" y="80" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#FFFFFF" textAnchor="middle">STRATEGY</text>
          <text x="425" y="95" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#FFFFFF" textAnchor="middle">BUILDER</text>
          <rect x="375" y="110" width="100" height="22" rx="3" fill="rgba(255,255,255,0.12)" />
          <text x="425" y="125" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.7)" textAnchor="middle">Python</text>
          <rect x="375" y="138" width="100" height="22" rx="3" fill="rgba(255,255,255,0.12)" />
          <text x="425" y="153" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.7)" textAnchor="middle">JavaScript</text>
          <rect x="375" y="166" width="100" height="22" rx="3" fill="rgba(255,255,255,0.12)" />
          <text x="425" y="181" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.7)" textAnchor="middle">Natural Language</text>

          {/* Execution Link */}
          <rect x="530" y="90" width="130" height="80" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="595" y="122" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#111" textAnchor="middle">EXECUTION</text>
          <text x="595" y="140" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">Signal Validation</text>
          <text x="595" y="154" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">Risk Controls</text>

          {/* Your Platform */}
          <rect x="700" y="90" width="80" height="80" rx="8" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="2" />
          <text x="740" y="126" fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="700" fill="#111" textAnchor="middle">YOUR</text>
          <text x="740" y="142" fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="700" fill="#111" textAnchor="middle">BROKER</text>

          {/* Arrows */}
          <line x1="150" y1="130" x2="188" y2="130" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrMk)" />
          <line x1="320" y1="130" x2="358" y2="130" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrMk2)" />
          <line x1="490" y1="130" x2="528" y2="130" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrMk2)" />
          <line x1="660" y1="130" x2="698" y2="130" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrMk)" />

          <defs>
            <marker id="arrMk" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#E5E7EB" />
            </marker>
            <marker id="arrMk2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>
        </svg>
      </section>

      {/* Build Algorithms, Your Way */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Build Algorithms, Your Way</h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 48px", lineHeight: 1.7, maxWidth: 700 }}>
            Three paths to the same outcome. Technical traders write code. Non-technical traders describe strategies. Both get executable, backtestable, risk-controlled algorithms.
          </p>
          <div className="algo-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {ALGO_LANGS.map(a => (
              <div key={a.lang} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "20px 24px 16px" }}>
                  <div style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 700, color: C.accent, marginBottom: 8 }}>{a.lang}</div>
                  <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{a.desc}</p>
                </div>
                <div style={{ background: "#1a1a2e", padding: "16px 20px", fontFamily: F.mono, fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {a.code}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Capabilities</h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 48px", lineHeight: 1.7, maxWidth: 700 }}>
          A professional charting and trading platform with AI-enhanced chart analysis, multi-language algorithm building, and execution linking.
        </p>
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

      {/* Not a Signal Service */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "56px 48px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div style={{ color: C.accent, flexShrink: 0, marginTop: 2 }}><Shield size={24} /></div>
          <div>
            <div style={{ fontFamily: F.ui, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>This is not a signal service.</div>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
              ORDR Market is a professional charting and algorithm-building platform. The AI does not generate buy/sell signals,
              predict price movements, or guarantee returns. It coaches trading discipline, assists with chart reading, and helps
              build algorithmic strategies. All execution decisions are made by you. All risk is managed by your parameters.
              This is an enterprise tool for professional traders and institutions, not a retail signal subscription.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Explore the agentic charting platform</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>AI-coached trading discipline. Multi-language algorithm builder. Professional canvas engine.</p>
        <a href="https://ordr-market.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Open ORDR Market <ArrowRight size={16} />
        </a>
      </section>

      <style>{`@media(max-width:768px){
        .feat-grid { grid-template-columns: 1fr !important; }
        .ai-trade-grid { grid-template-columns: 1fr !important; }
        .algo-grid { grid-template-columns: 1fr !important; }
        .stats-row { flex-wrap: wrap; gap: 24px !important; }
      }`}</style>
    </MarketingLayout>
  );
}
