"use client";

import Link from "next/link";
import {
  LayoutGrid, TrendingUp, PieChart, FlaskConical, Globe, BookOpen, Newspaper,
  ArrowRight, Cpu, Brain, Shield, Lock,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F, PRODUCTS } from "@/components/marketing/theme";

const ICONS: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid size={22} strokeWidth={1.6} />,
  TrendingUp: <TrendingUp size={22} strokeWidth={1.6} />,
  PieChart: <PieChart size={22} strokeWidth={1.6} />,
  FlaskConical: <FlaskConical size={22} strokeWidth={1.6} />,
  Globe: <Globe size={22} strokeWidth={1.6} />,
  BookOpen: <BookOpen size={22} strokeWidth={1.6} />,
  Newspaper: <Newspaper size={22} strokeWidth={1.6} />,
};

const AI_DESCS: Record<string, string> = {
  treasury: "Deterministic hedge computation with an Agentic AI risk assistant. Communicate via chat, phone, or voice to get real-time status on hedges, positions, and risk exposure. The engine calculates; the AI interprets, monitors, and alerts.",
  market: "The first agentic charting platform. AI coaches trading discipline, helps read charts, and assists non-technical users in building algorithms via natural language. Supports Python, JavaScript, and execution linking.",
  portfolio: "AI-enhanced portfolio risk decomposition across the R1-R8 taxonomy. The deterministic engine classifies and quantifies exposure; the AI layer detects anomalies, surfaces concentration risks, and recommends rebalancing actions.",
  labs: "AI-assisted scenario generation, backtesting evaluation, and Monte Carlo analysis. The deterministic engine runs simulations; the AI interprets results, suggests stress parameters, and identifies tail-risk patterns.",
  polisophic: "AI-powered geopolitical intelligence with corridor scoring. The engine quantifies political risk into FX overlays; the AI monitors global events, interprets macro trends, and translates them into actionable hedge signals.",
  hedgewiki: "AI-enhanced knowledge navigation across ISDA definitions, IFRS 9, ASC 815, and regulatory frameworks. Ask questions in natural language and receive contextual, citation-backed answers from the institutional knowledge graph.",
  finhub: "AI-curated market intelligence with economic calendars, company research, and signal detection. The AI filters noise, surfaces relevant events for your portfolio, and provides contextual analysis on market-moving data.",
};

export default function ProductsPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "96px 48px 64px", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 20 }}>
          ORDR TERMINAL PLATFORM
        </div>
        <h1 style={{ fontFamily: F.heading, fontSize: 52, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 20px", color: C.text }}>
          Seven Products. One Deterministic Platform. AI-Enhanced.
        </h1>
        <p style={{ fontFamily: F.ui, fontSize: 18, color: C.textSub, maxWidth: 700, margin: "0 auto", lineHeight: 1.7 }}>
          Every ORDR product is built on the same deterministic computation engine -- reproducible, auditable, and cryptographically sealed.
          An Agentic AI layer sits on top, providing insight, evaluation, and multi-channel assistance without ever altering the calculation path.
        </p>
      </section>

      {/* Platform Architecture SVG */}
      <section style={{ padding: "0 48px 64px", maxWidth: 1000, margin: "0 auto" }}>
        <svg viewBox="0 0 900 420" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto" }}>
          {/* Background layers */}
          <rect x="20" y="10" width="860" height="110" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <rect x="20" y="140" width="860" height="80" rx="8" fill="rgba(30,58,95,0.06)" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="4 2" />
          <rect x="20" y="240" width="860" height="80" rx="8" fill="#1E3A5F" />
          <rect x="20" y="340" width="860" height="70" rx="8" fill="#0C0C0C" />

          {/* Layer labels */}
          <text x="50" y="38" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#999" letterSpacing="0.08em">USER INTERFACE</text>
          <text x="50" y="168" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#1E3A5F" letterSpacing="0.08em">AGENTIC AI LAYER</text>
          <text x="50" y="268" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#FFFFFF" letterSpacing="0.08em">DETERMINISTIC ENGINE</text>
          <text x="50" y="368" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="rgba(255,255,255,0.5)" letterSpacing="0.08em">DATA / AUDIT / GOVERNANCE</text>

          {/* Product boxes in UI layer */}
          {["Treasury", "Market", "Portfolio", "Labs", "Polisophic", "Wiki", "FinHub"].map((name, i) => (
            <g key={name}>
              <rect x={70 + i * 114} y="52" width="100" height="52" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x={120 + i * 114} y="82" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fontWeight="600" fill="#111" textAnchor="middle">{name}</text>
            </g>
          ))}

          {/* AI layer capabilities */}
          {["Insight", "Evaluation", "Monitoring", "Voice / Chat", "Alerts"].map((cap, i) => (
            <g key={cap}>
              <rect x={80 + i * 156} y="182" width="130" height="28" rx="4" fill="rgba(30,58,95,0.08)" stroke="#1E3A5F" strokeWidth="0.5" />
              <text x={145 + i * 156} y="200" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fontWeight="600" fill="#1E3A5F" textAnchor="middle">{cap}</text>
            </g>
          ))}

          {/* Engine layer modules */}
          {["Kernel", "Validator", "Risk Calc", "Scenarios", "Effectiveness", "Netting"].map((mod, i) => (
            <g key={mod}>
              <rect x={75 + i * 132} y="285" width="110" height="26" rx="4" fill="rgba(255,255,255,0.12)" />
              <text x={130 + i * 132} y="303" fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="600" fill="#FFFFFF" textAnchor="middle">{mod}</text>
            </g>
          ))}

          {/* Data layer items */}
          {["PostgreSQL", "WORM Audit", "Hash Chain", "SHA-256", "Market Data"].map((item, i) => (
            <g key={item}>
              <text x={130 + i * 150} y="382" fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="rgba(255,255,255,0.5)" textAnchor="middle">{item}</text>
            </g>
          ))}

          {/* Connecting arrows */}
          <line x1="450" y1="104" x2="450" y2="140" stroke="#E5E7EB" strokeWidth="1.5" markerEnd="url(#arrowGray)" />
          <line x1="450" y1="220" x2="450" y2="240" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowNavy)" />
          <line x1="450" y1="320" x2="450" y2="340" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />

          <defs>
            <marker id="arrowGray" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#E5E7EB" />
            </marker>
            <marker id="arrowNavy" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>
        </svg>
      </section>

      {/* Product Grid */}
      <section style={{ padding: "0 48px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
          Product Suite
        </h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 40px", lineHeight: 1.6, maxWidth: 700 }}>
          Each product operates on the same frozen deterministic engine. The Agentic AI layer provides contextual intelligence, natural-language interaction, and proactive monitoring without altering computation outputs.
        </p>
        <div className="prod-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          {PRODUCTS.map((p) => (
            <Link
              key={p.slug}
              href={p.slug === "hedgewiki" ? "https://hedge-wiki.vercel.app/" : `/products/${p.slug}`}
              {...(p.slug === "hedgewiki" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8, height: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: C.bgAlt, color: C.accent }}>
                    {ICONS[p.icon] || <LayoutGrid size={22} />}
                  </div>
                  <div style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", color: C.text }}>{p.name}</div>
                </div>
                <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, flex: 1, margin: 0 }}>
                  {AI_DESCS[p.slug] || p.desc}
                </p>
                <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: C.accent, display: "flex", alignItems: "center", gap: 4 }}>
                  Learn More <ArrowRight size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Deterministic Core + AI Layer */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
            Deterministic Core + Agentic AI Layer
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 48px", lineHeight: 1.7, maxWidth: 700 }}>
            The ORDR architecture separates computation from intelligence. The deterministic engine is frozen, auditable, and cryptographically sealed.
            The AI layer operates strictly as an observer and interpreter -- it reads outputs but never writes to the calculation path.
          </p>
          <div className="arch-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            <div style={{ padding: "28px 24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ color: C.accent, marginBottom: 16 }}><Cpu size={22} /></div>
              <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>Deterministic Engine</div>
              <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
                41 production modules in a frozen kernel. Every calculation is reproducible, every output is hash-chained.
                Sub-50ms computation with zero side effects. No randomness, no external state, no learning.
                The same inputs always produce the same outputs -- guaranteed by architecture, verified by SHA-256 audit trail.
              </p>
            </div>
            <div style={{ padding: "28px 24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ color: C.accent, marginBottom: 16 }}><Brain size={22} /></div>
              <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>Agentic AI Layer</div>
              <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
                An always-on intelligence layer that interprets engine outputs, monitors risk positions, and communicates
                proactively via chat, voice, or phone. It evaluates scenarios, surfaces anomalies, and provides
                natural-language explanations of complex hedge structures. It never modifies calculations -- only reads and interprets.
              </p>
            </div>
            <div style={{ padding: "28px 24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ color: C.accent, marginBottom: 16 }}><Shield size={22} /></div>
              <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>Governance Boundary</div>
              <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
                A strict separation enforced at the architecture level. The AI layer has read-only access to engine outputs.
                All mutations flow through the deterministic path with 4-eyes approval, WORM audit logging,
                and per-tenant SHA-256 hash chains. No AI action can bypass governance controls.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Strip */}
      <section style={{ padding: "64px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div className="trust-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32 }}>
          {[
            { icon: <Lock size={20} />, title: "WORM Audit Trail", desc: "Append-only event log with tamper-evident hash chains. Every calculation, approval, and rejection is permanently recorded." },
            { icon: <Shield size={20} />, title: "4-Eyes Governance", desc: "Maker-checker approval with Separation of Duties enforcement. No single actor can approve their own proposals." },
            { icon: <Cpu size={20} />, title: "Sub-50ms Engine", desc: "41-module deterministic kernel with zero external dependencies. Reproducible computation sealed by SHA-256." },
            { icon: <Brain size={20} />, title: "Multi-Channel AI", desc: "Communicate via terminal chat, voice commands, or phone. Your AI risk assistant is always available, always informed." },
          ].map(item => (
            <div key={item.title} style={{ textAlign: "center" }}>
              <div style={{ color: C.accent, marginBottom: 12, display: "flex", justifyContent: "center" }}>{item.icon}</div>
              <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>{item.title}</div>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Ready to get started?</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32, maxWidth: 600, margin: "0 auto 32px" }}>
          Launch the terminal and explore institutional-grade FX hedge governance with AI-enhanced insight and multi-channel communication.
        </p>
        <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      <style>{`
        @media(max-width:900px){ .prod-grid { grid-template-columns: 1fr !important; } .arch-grid { grid-template-columns: 1fr !important; } .trust-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media(max-width:600px){ .trust-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </MarketingLayout>
  );
}
