"use client";

import Link from "next/link";
import {
  LayoutGrid, TrendingUp, PieChart, FlaskConical, Globe, BookOpen, Newspaper,
  ArrowRight, Upload, Settings, Calculator, ShieldCheck, Brain, CheckCircle2,
  Shield, Users, Layers, FileCheck, Cpu, Eye, Mic, MessageSquare,
  Building2, Landmark, BarChart3, Umbrella, Flame, Lock,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F, PRODUCTS, SOLUTIONS } from "@/components/marketing/theme";

/* ── Icon resolver ── */
const ICONS: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid size={22} strokeWidth={1.6} />,
  TrendingUp: <TrendingUp size={22} strokeWidth={1.6} />,
  PieChart: <PieChart size={22} strokeWidth={1.6} />,
  FlaskConical: <FlaskConical size={22} strokeWidth={1.6} />,
  Globe: <Globe size={22} strokeWidth={1.6} />,
  BookOpen: <BookOpen size={22} strokeWidth={1.6} />,
  Newspaper: <Newspaper size={22} strokeWidth={1.6} />,
};

/* ── Data ── */
const STATS = [
  { value: "7", label: "Products" },
  { value: "219+", label: "API Endpoints" },
  { value: "41", label: "Engine Modules" },
  { value: "<50ms", label: "Latency" },
  { value: "AI", label: "Powered Insights" },
];

const PRODUCT_DETAILS: Record<string, string> = {
  treasury: "Deterministic FX hedge calculation with 60 policy presets, 41 engine modules, 4-eyes governance, and WORM audit trail. AI serves as a communication layer -- chat, phone, and voice for status updates, customer management, and report writing. AI does not evaluate or influence calculations.",
  market: "The first Agentic charting system with AI integrated. Built for algorithmic trading -- build algos for non-technical AND technical people in Python, JavaScript, and more. AI assistant coaches trading discipline, helps read charts better, and provides real-time market insight. Link execution to your platform.",
  portfolio: "Multi-currency portfolio risk decomposition with deterministic R1-R8 risk taxonomy, concentration monitoring, and factor attribution. AI assists with customer management and writing institutional-grade reports. All risk calculations are fully deterministic.",
  labs: "Pure deterministic scenario studio with backtesting, Monte Carlo simulation, historical VaR/ES, configurable shock packs, and vol-scaled stress testing. Full sandbox isolation with the same frozen kernel as production. No AI involvement.",
  polisophic: "Geopolitical risk intelligence powered by AI corridor scoring. Monitors political, economic, and regulatory developments across 190+ countries. AI synthesizes risk signals into actionable hedging recommendations.",
  hedgewiki: "AI-searchable ISDA definitions, IFRS 9 / ASC 815 reference library, and hedge accounting guidance. Natural language queries across the full regulatory corpus with contextual cross-references.",
  finhub: "AI-curated economic calendars, company research, and signal detection. Aggregates macro data, earnings, central bank communications, and market events with intelligent prioritization and alerting.",
};

const AI_LAYER_STEPS = [
  { icon: <Calculator size={20} />, title: "Engine Calculates", desc: "The deterministic engine processes inputs through 41 production modules. Same input always produces the same output. Sub-50ms. Hash-chained. Reproducible." },
  { icon: <Brain size={20} />, title: "AI Communicates", desc: "AI is a communication and management layer for specific products. Treasury uses chat, voice, and phone for status updates and reports. Market uses AI for chart analysis and algo building. Polisophic uses AI for geopolitical intelligence. AI does not evaluate engine calculations." },
  { icon: <Mic size={20} />, title: "AI Assists", desc: "Where AI is present, it assists through communication channels: status updates and report writing (Treasury), chart reading and algo building (Market), geopolitical analysis (Polisophic). AI is not involved in any calculation, risk scoring, or engine output." },
  { icon: <CheckCircle2 size={20} />, title: "Human Decides", desc: "AI never auto-executes. Every trade, hedge, and decision is made by the human operator. The platform ensures 4-eyes governance and separation of duties on all execution." },
];

const CAPABILITIES = [
  { icon: <Shield size={20} />, title: "WORM Audit Trail", desc: "Append-only event log with SHA-256 hash chain. Every calculation, decision, and approval is permanently recorded in a tamper-evident, regulation-proof audit ledger. Per-tenant hash chains with GENESIS_HASH verification." },
  { icon: <Users size={20} />, title: "4-Eyes Governance", desc: "Maker-checker approval with enforced Separation of Duties. The tri-state pipeline (Sandbox, Staging, Ledger) ensures no calculation reaches production without multi-party review. Threshold-based escalation with 3-actor SoD." },
  { icon: <Cpu size={20} />, title: "Deterministic Engine", desc: "Same inputs produce same outputs, always. 41 production modules with sub-50ms computation. Pure functions, no side effects, no randomness. Every result independently verifiable and reproducible." },
  { icon: <FileCheck size={20} />, title: "IFRS 9 / ASC 815", desc: "Built-in prospective effectiveness testing with critical terms matching and statistical forecast validation. Hedge documentation generation, accounting framework alignment, and evidence grading for audit readiness." },
  { icon: <Eye size={20} />, title: "Real-Time Risk Intelligence", desc: "R1-R8 risk taxonomy, exposure decomposition, concentration analysis, and scenario stress testing. All risk computations are deterministic and reproducible across the full risk surface." },
  { icon: <Layers size={20} />, title: "Policy Engine", desc: "60 policy presets with maturity profiles, governance tiers, evidence grades, and 7-layer extension architecture. Extended overlays for volatility, geopolitical risk, netting, and prospective effectiveness." },
];

const WORKFLOW = [
  { step: "01", icon: <Upload size={20} />, title: "Import Exposures", desc: "Upload FX positions from ERP, TMS, or spreadsheet. Automatic classification, validation, and enrichment with market data." },
  { step: "02", icon: <Settings size={20} />, title: "Configure Policy", desc: "Select from 60 presets or build custom policies. Define hedge ratios, instruments, governance tiers, and risk parameters." },
  { step: "03", icon: <Calculator size={20} />, title: "Calculate", desc: "Deterministic engine computes hedge recommendations. Sub-50ms, reproducible, auditable. Every calculation hash-chained." },
  { step: "04", icon: <Brain size={20} />, title: "Review & Report", desc: "Review engine outputs and generate stakeholder reports. In Treasury, AI helps communicate status and write reports. AI does not evaluate or interpret calculations." },
  { step: "05", icon: <ShieldCheck size={20} />, title: "Execute", desc: "4-eyes approval, governed execution, WORM audit trail. Every decision recorded, hash-chained, and immutable." },
];

const SOLUTION_ICONS: Record<string, React.ReactNode> = {
  "corporate-treasury": <Building2 size={20} />,
  "risk-management": <Shield size={20} />,
  "asset-management": <BarChart3 size={20} />,
  "banking": <Landmark size={20} />,
  "insurance": <Umbrella size={20} />,
  "energy": <Flame size={20} />,
};

export default function LandingPage() {
  return (
    <MarketingLayout>
      {/* ── Hero ── */}
      <section style={{ padding: "100px 48px 80px", maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
        <div style={{
          fontFamily: F.mono, fontSize: 12, fontWeight: 600,
          letterSpacing: "0.15em", color: C.textMuted,
          marginBottom: 20, textTransform: "uppercase",
        }}>
          Institutional FX Risk Management
        </div>
        <h1 style={{
          fontFamily: F.heading, fontSize: 56, fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.08,
          margin: "0 0 24px", color: C.text,
        }}>
          Deterministic Computation.{" "}
          <span style={{ color: C.accent }}>Agentic Intelligence.</span>
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 19, color: C.textSub,
          maxWidth: 680, margin: "0 auto 40px", lineHeight: 1.6,
        }}>
          The engines are deterministic -- same input always produces the same output.
          AI is not used in any calculations. Where AI is present, it provides communication
          and management capabilities: Market uses AI for chart analysis and algo building,
          Polisophic for geopolitical intelligence, and Treasury for status updates and reports.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: "#fff", background: C.accent,
            padding: "13px 32px", borderRadius: 6, textDecoration: "none",
          }}>
            Launch Terminal <ArrowRight size={16} />
          </Link>
          <Link href="/products" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: C.textSub, background: "transparent",
            padding: "13px 32px", borderRadius: 6, textDecoration: "none",
            border: `1.5px solid ${C.border}`,
          }}>
            Explore Products
          </Link>
        </div>
      </section>

      {/* ── Stats Strip ── */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 48px" }}>
        <div className="stats-strip" style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "center", gap: 64 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 28, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture Diagram ── */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Architecture</div>
          <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
            The ORDR Platform Architecture
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.6, maxWidth: 620, margin: "0 auto" }}>
            Three layers, one principle: deterministic computation with intelligent assistance. The engine never guesses. The AI never executes.
          </p>
        </div>

        <div style={{ maxWidth: 940, margin: "0 auto" }}>
          <svg
            viewBox="0 0 940 560"
            width="100%"
            style={{ display: "block" }}
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Background */}
            <rect x="0" y="0" width="940" height="560" rx="12" fill={C.bgAlt} stroke={C.border} strokeWidth="1" />

            {/* Title */}
            <text x="470" y="36" textAnchor="middle" fontFamily={F.mono} fontSize="11" fontWeight="700" fill={C.textMuted} letterSpacing="0.15em">
              ORDR TERMINAL PLATFORM
            </text>

            {/* Layer 3 (top): User Interface */}
            <rect x="40" y="56" width="860" height="120" rx="8" fill="#fff" stroke={C.border} strokeWidth="1" />
            <rect x="40" y="56" width="860" height="30" rx="8" fill={C.bgMuted} />
            <rect x="40" y="76" width="860" height="10" fill={C.bgMuted} />
            <text x="470" y="76" textAnchor="middle" fontFamily={F.mono} fontSize="12" fontWeight="700" fill={C.text} letterSpacing="0.1em">
              USER INTERFACE LAYER
            </text>
            {/* UI sub-items */}
            <rect x="70" y="100" width="140" height="56" rx="6" fill={C.bgAlt} stroke={C.border} strokeWidth="0.5" />
            <text x="140" y="124" textAnchor="middle" fontFamily={F.ui} fontSize="12" fontWeight="600" fill={C.text}>Terminal</text>
            <text x="140" y="142" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill={C.textMuted}>Dashboard &amp; Widgets</text>

            <rect x="230" y="100" width="140" height="56" rx="6" fill={C.bgAlt} stroke={C.border} strokeWidth="0.5" />
            <text x="300" y="124" textAnchor="middle" fontFamily={F.ui} fontSize="12" fontWeight="600" fill={C.text}>Charts</text>
            <text x="300" y="142" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill={C.textMuted}>Canvas 2D Engine</text>

            <rect x="390" y="100" width="140" height="56" rx="6" fill={C.bgAlt} stroke={C.border} strokeWidth="0.5" />
            <text x="460" y="124" textAnchor="middle" fontFamily={F.ui} fontSize="12" fontWeight="600" fill={C.text}>Voice</text>
            <text x="460" y="142" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill={C.textMuted}>WebRTC Realtime</text>

            <rect x="550" y="100" width="140" height="56" rx="6" fill={C.bgAlt} stroke={C.border} strokeWidth="0.5" />
            <text x="620" y="124" textAnchor="middle" fontFamily={F.ui} fontSize="12" fontWeight="600" fill={C.text}>Chatbox</text>
            <text x="620" y="142" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill={C.textMuted}>Natural Language</text>

            <rect x="710" y="100" width="160" height="56" rx="6" fill={C.bgAlt} stroke={C.border} strokeWidth="0.5" />
            <text x="790" y="124" textAnchor="middle" fontFamily={F.ui} fontSize="12" fontWeight="600" fill={C.text}>Reports</text>
            <text x="790" y="142" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill={C.textMuted}>PDF / Export / API</text>

            {/* Arrows: UI -> AI */}
            <defs>
              <marker id="aDown" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill={C.textMuted} />
              </marker>
              <marker id="aUp" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
                <path d="M8,0 L0,3 L8,6 Z" fill={C.textMuted} />
              </marker>
            </defs>
            <line x1="370" y1="176" x2="370" y2="212" stroke={C.textMuted} strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#aDown)" />
            <line x1="570" y1="212" x2="570" y2="176" stroke={C.textMuted} strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#aUp)" />
            <text x="320" y="200" textAnchor="middle" fontFamily={F.mono} fontSize="9" fill={C.textMuted}>QUERIES</text>
            <text x="620" y="200" textAnchor="middle" fontFamily={F.mono} fontSize="9" fill={C.textMuted}>INSIGHTS</text>

            {/* Layer 2 (middle): Agentic AI */}
            <rect x="40" y="216" width="860" height="120" rx="8" fill="#1a6b5a" />
            <text x="470" y="248" textAnchor="middle" fontFamily={F.mono} fontSize="12" fontWeight="700" fill="#fff" letterSpacing="0.1em">
              AGENTIC AI LAYER
            </text>
            <line x1="100" y1="258" x2="840" y2="258" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
            {/* AI sub-items */}
            <text x="140" y="280" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.8)">Customer Management</text>
            <text x="300" y="280" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.8)">Report Generation</text>
            <text x="470" y="280" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.8)">Chart Analysis (Market)</text>
            <text x="630" y="280" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.8)">Trading Coaching (Market)</text>
            <text x="790" y="280" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.8)">Geopolitical Intel (Polisophic)</text>
            <text x="230" y="310" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.45)">Voice &amp; Chat Interface</text>
            <text x="470" y="310" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.45)">Communication Layer</text>
            <text x="710" y="310" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.45)">Never Auto-Executes</text>

            {/* Arrows: AI -> Engine */}
            <line x1="370" y1="336" x2="370" y2="372" stroke={C.textMuted} strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#aDown)" />
            <line x1="570" y1="372" x2="570" y2="336" stroke={C.textMuted} strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#aUp)" />
            <text x="320" y="360" textAnchor="middle" fontFamily={F.mono} fontSize="9" fill={C.textMuted}>COMPUTE</text>
            <text x="620" y="360" textAnchor="middle" fontFamily={F.mono} fontSize="9" fill={C.textMuted}>RESULTS</text>

            {/* Layer 1 (bottom): Deterministic Engine */}
            <rect x="40" y="376" width="860" height="140" rx="8" fill={C.accent} />
            <text x="470" y="408" textAnchor="middle" fontFamily={F.mono} fontSize="12" fontWeight="700" fill="#fff" letterSpacing="0.1em">
              DETERMINISTIC ENGINE LAYER
            </text>
            <line x1="100" y1="418" x2="840" y2="418" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
            {/* Engine sub-items in boxes */}
            <rect x="70" y="430" width="120" height="36" rx="4" fill="rgba(255,255,255,0.08)" />
            <text x="130" y="453" textAnchor="middle" fontFamily={F.mono} fontSize="11" fill="rgba(255,255,255,0.8)">kernel.py</text>

            <rect x="210" y="430" width="120" height="36" rx="4" fill="rgba(255,255,255,0.08)" />
            <text x="270" y="453" textAnchor="middle" fontFamily={F.mono} fontSize="11" fill="rgba(255,255,255,0.8)">validator.py</text>

            <rect x="350" y="430" width="100" height="36" rx="4" fill="rgba(255,255,255,0.08)" />
            <text x="400" y="453" textAnchor="middle" fontFamily={F.mono} fontSize="11" fill="rgba(255,255,255,0.8)">audit.py</text>

            <rect x="470" y="430" width="120" height="36" rx="4" fill="rgba(255,255,255,0.08)" />
            <text x="530" y="453" textAnchor="middle" fontFamily={F.mono} fontSize="11" fill="rgba(255,255,255,0.8)">41 modules</text>

            <rect x="610" y="430" width="140" height="36" rx="4" fill="rgba(255,255,255,0.08)" />
            <text x="680" y="453" textAnchor="middle" fontFamily={F.mono} fontSize="11" fill="rgba(255,255,255,0.8)">SHA-256 chain</text>

            <rect x="770" y="430" width="100" height="36" rx="4" fill="rgba(255,255,255,0.08)" />
            <text x="820" y="453" textAnchor="middle" fontFamily={F.mono} fontSize="11" fill="rgba(255,255,255,0.8)">WORM</text>

            <text x="230" y="498" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.4)">Sub-50ms latency</text>
            <text x="470" y="498" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.4)">Same input = Same output, always</text>
            <text x="710" y="498" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.4)">Tamper-evident audit trail</text>

            {/* Bottom label */}
            <text x="470" y="545" textAnchor="middle" fontFamily={F.mono} fontSize="9" fill={C.textMuted} letterSpacing="0.1em">
              DETERMINISTIC COMPUTATION + AGENTIC INTELLIGENCE
            </text>
          </svg>
        </div>
      </section>

      {/* ── Products Grid ── */}
      <section style={{ padding: "80px 48px", background: C.bgAlt }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Products</div>
            <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
              Seven products. One institutional platform.
            </h2>
            <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.6, marginTop: 0, maxWidth: 640 }}>
              Each product is purpose-built for a specific function in the hedge lifecycle.
              Every product is powered by the same deterministic computation engine.
            </p>
          </div>
          <div className="products-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {PRODUCTS.map((p, i) => (
              <Link key={p.slug} href={`/products/${p.slug}`} style={{ textDecoration: "none", color: "inherit", ...(!!(i === 6) ? { gridColumn: "2 / 3" } : {}) }}>
                <div style={{ padding: "24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: C.accentLight, color: C.accent }}>
                      {ICONS[p.icon] || <LayoutGrid size={22} />}
                    </div>
                    <div style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", color: C.text }}>{p.name}</div>
                  </div>
                  <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, flex: 1, margin: 0 }}>
                    {PRODUCT_DETAILS[p.slug] || p.desc}
                  </p>
                  <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: C.accent, display: "flex", alignItems: "center", gap: 4 }}>
                    Learn More <ArrowRight size={14} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How the AI Layer Works ── */}
      <section style={{ padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Intelligence</div>
            <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
              How the AI Layer Works
            </h2>
            <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.6, maxWidth: 600, margin: "0 auto" }}>
              The AI layer provides insight and assistance without compromising the determinism
              of the computation engine. Four principles govern how intelligence is delivered.
            </p>
          </div>
          <div className="ai-layer-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
            {AI_LAYER_STEPS.map((s, i) => (
              <div key={s.title} style={{
                padding: "28px 24px", border: `1px solid ${C.border}`,
                borderRadius: 8, position: "relative", background: C.bg,
              }}>
                <div style={{
                  fontFamily: F.mono, fontSize: 44, fontWeight: 900,
                  color: C.bgMuted, position: "absolute", top: 12, right: 16, lineHeight: 1,
                }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: C.accentLight, color: C.accent, marginBottom: 16,
                }}>
                  {s.icon}
                </div>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>{s.title}</div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solutions Grid ── */}
      <section style={{ background: C.bgAlt, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Solutions</div>
            <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
              Built for your industry
            </h2>
            <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.6, maxWidth: 560 }}>
              Six industry-specific solutions, each built on the same deterministic engine,
              tailored to the unique requirements of your sector.
            </p>
          </div>
          <div className="solutions-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {SOLUTIONS.map(s => (
              <Link key={s.slug} href={`/solutions/${s.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ padding: "24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, height: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ color: C.accent }}>{SOLUTION_ICONS[s.slug] || <LayoutGrid size={20} />}</div>
                    <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text }}>{s.name}</div>
                  </div>
                  <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── The ORDR Architecture Detail ── */}
      <section style={{ padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Infrastructure</div>
            <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
              The ORDR Architecture
            </h2>
            <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.6, maxWidth: 620, margin: "0 auto" }}>
              Five pillars of institutional-grade infrastructure, designed for
              regulated environments where audit compliance and data integrity are non-negotiable.
            </p>
          </div>

          {/* Architecture detail SVG */}
          <div style={{ maxWidth: 900, margin: "0 auto 48px" }}>
            <svg
              viewBox="0 0 900 300"
              width="100%"
              style={{ display: "block" }}
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Five pillars */}
              <rect x="20" y="20" width="160" height="260" rx="8" fill={C.accent} />
              <text x="100" y="60" textAnchor="middle" fontFamily={F.mono} fontSize="10" fontWeight="700" fill="#fff" letterSpacing="0.08em">WORM AUDIT</text>
              <line x1="40" y1="72" x2="160" y2="72" stroke="rgba(255,255,255,0.15)" />
              <text x="100" y="96" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">SHA-256 hash chain</text>
              <text x="100" y="116" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Append-only logs</text>
              <text x="100" y="136" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Per-tenant chains</text>
              <text x="100" y="156" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">GENESIS_HASH</text>
              <text x="100" y="176" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Tamper-evident</text>
              <text x="100" y="196" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.5)">No UPDATE</text>
              <text x="100" y="216" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.5)">No DELETE</text>

              <rect x="200" y="20" width="160" height="260" rx="8" fill="#1a6b5a" />
              <text x="280" y="60" textAnchor="middle" fontFamily={F.mono} fontSize="10" fontWeight="700" fill="#fff" letterSpacing="0.08em">4-EYES GOV</text>
              <line x1="220" y1="72" x2="340" y2="72" stroke="rgba(255,255,255,0.15)" />
              <text x="280" y="96" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Maker-checker</text>
              <text x="280" y="116" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Separation of duties</text>
              <text x="280" y="136" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Tri-state pipeline</text>
              <text x="280" y="156" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">9 RBAC roles</text>
              <text x="280" y="176" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">41 permissions</text>
              <text x="280" y="196" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.5)">Threshold-based</text>
              <text x="280" y="216" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.5)">3-actor SoD</text>

              <rect x="380" y="20" width="160" height="260" rx="8" fill={C.accent} />
              <text x="460" y="60" textAnchor="middle" fontFamily={F.mono} fontSize="10" fontWeight="700" fill="#fff" letterSpacing="0.08em">DET. ENGINE</text>
              <line x1="400" y1="72" x2="520" y2="72" stroke="rgba(255,255,255,0.15)" />
              <text x="460" y="96" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">41 modules</text>
              <text x="460" y="116" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Sub-50ms latency</text>
              <text x="460" y="136" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Pure functions</text>
              <text x="460" y="156" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">No side effects</text>
              <text x="460" y="176" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Hash-chained</text>
              <text x="460" y="196" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.5)">Reproducible</text>
              <text x="460" y="216" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.5)">Verifiable</text>

              <rect x="560" y="20" width="160" height="260" rx="8" fill="#1a6b5a" />
              <text x="640" y="60" textAnchor="middle" fontFamily={F.mono} fontSize="10" fontWeight="700" fill="#fff" letterSpacing="0.08em">AI INSIGHT</text>
              <line x1="580" y1="72" x2="700" y2="72" stroke="rgba(255,255,255,0.15)" />
              <text x="640" y="96" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Customer management</text>
              <text x="640" y="116" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Report writing</text>
              <text x="640" y="136" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Chart analysis</text>
              <text x="640" y="156" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Status updates</text>
              <text x="640" y="176" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Voice &amp; chat</text>
              <text x="640" y="196" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.5)">Market &amp; Polisophic</text>
              <text x="640" y="216" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.5)">Never executes</text>

              <rect x="740" y="20" width="140" height="260" rx="8" fill={C.accent} />
              <text x="810" y="60" textAnchor="middle" fontFamily={F.mono} fontSize="10" fontWeight="700" fill="#fff" letterSpacing="0.08em">MULTI-CH</text>
              <line x1="760" y1="72" x2="860" y2="72" stroke="rgba(255,255,255,0.15)" />
              <text x="810" y="96" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Voice (WebRTC)</text>
              <text x="810" y="116" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Chat (NL)</text>
              <text x="810" y="136" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Terminal UI</text>
              <text x="810" y="156" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">REST API</text>
              <text x="810" y="176" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.7)">Reports</text>
              <text x="810" y="196" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.5)">219+ endpoints</text>
              <text x="810" y="216" textAnchor="middle" fontFamily={F.ui} fontSize="10" fill="rgba(255,255,255,0.5)">Mobile-ready</text>
            </svg>
          </div>
        </div>
      </section>

      {/* ── Workflow ── */}
      <section style={{ padding: "80px 48px", background: C.bgAlt }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Workflow</div>
            <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
              Five steps. Full governance. AI-assisted.
            </h2>
            <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.6, maxWidth: 580, margin: "0 auto" }}>
              From raw exposure data to audited execution -- every step deterministic,
              every decision recorded, with AI insight at the review stage.
            </p>
          </div>
          <div className="workflow-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 20 }}>
            {WORKFLOW.map(w => (
              <div key={w.step} style={{ padding: "28px 20px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, position: "relative" }}>
                <div style={{ fontFamily: F.mono, fontSize: 44, fontWeight: 900, color: C.bgMuted, position: "absolute", top: 12, right: 16, lineHeight: 1 }}>{w.step}</div>
                <div style={{ width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: C.accentLight, color: C.accent, marginBottom: 16 }}>
                  {w.icon}
                </div>
                <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>{w.title}</div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform Capabilities ── */}
      <section style={{ padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Platform</div>
            <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
              Built to institutional standards
            </h2>
            <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.6, maxWidth: 580 }}>
              Six pillars of enterprise infrastructure, each designed for environments
              where regulatory compliance and data integrity are non-negotiable requirements.
            </p>
          </div>
          <div className="cap-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {CAPABILITIES.map(cap => (
              <div key={cap.title} style={{ padding: "24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ color: C.accent, marginBottom: 16 }}>{cap.icon}</div>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>{cap.title}</div>
                <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 600,
          letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)",
          marginBottom: 16, textTransform: "uppercase",
        }}>
          Enterprise-Grade
        </div>
        <h2 style={{ fontFamily: F.heading, fontSize: 40, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>
          Ready to transform your hedge operations?
        </h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", maxWidth: 560, margin: "0 auto 32px", lineHeight: 1.6 }}>
          Join the treasury teams and algorithmic traders that trust ORDR Terminal
          for deterministic, auditable, AI-assisted risk management.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: C.accent, background: "#fff",
            padding: "13px 32px", borderRadius: 6, textDecoration: "none",
          }}>
            Launch Terminal <ArrowRight size={16} />
          </Link>
          <Link href="/contact" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: "#fff", background: "transparent",
            padding: "13px 32px", borderRadius: 6, textDecoration: "none",
            border: "1.5px solid rgba(255,255,255,0.3)",
          }}>
            Contact Sales
          </Link>
        </div>
      </section>

      <style>{`
        @media(max-width:900px){
          .stats-strip{flex-wrap:wrap !important;gap:32px !important}
          .workflow-grid{grid-template-columns:1fr 1fr !important}
        }
        @media(max-width:768px){
          .products-grid, .solutions-grid, .cap-grid{grid-template-columns:1fr !important}
          .ai-layer-grid{grid-template-columns:1fr 1fr !important}
          .workflow-grid{grid-template-columns:1fr !important}
        }
        @media(max-width:480px){
          .ai-layer-grid{grid-template-columns:1fr !important}
          .stats-strip{gap:20px !important}
        }
      `}</style>
    </MarketingLayout>
  );
}
