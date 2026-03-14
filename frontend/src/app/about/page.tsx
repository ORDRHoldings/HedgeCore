"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";
import {
  ArrowRight, Cpu, Eye, Shield, Minimize2,
  Brain, Mic, MessageSquare, Monitor,
  Building2, Landmark, BarChart3, Umbrella, Flame, Globe,
} from "lucide-react";

/* ── Values ── */
const VALUES = [
  {
    icon: <Cpu size={22} />,
    title: "Determinism",
    desc: "Same inputs produce identical outputs. No ML black boxes, no random seeds, no non-determinism. Every calculation is reproducible, explainable, and audit-safe. The engine runs 41 production modules with sub-50ms latency, producing hash-chained results that can be independently verified.",
  },
  {
    icon: <Eye size={22} />,
    title: "Transparency",
    desc: "Full audit trail on every decision. SHA-256 hash-chained event logs, append-only (WORM) calculation records, and complete decision provenance. Every hedge recommendation includes a full trace of inputs, policy parameters, and engine state that produced it.",
  },
  {
    icon: <Shield size={22} />,
    title: "Governance",
    desc: "4-eyes approval, separation of duties, RBAC with 41 permissions across 9 roles, and maker-checker workflows. The tri-state pipeline (Sandbox, Staging, Ledger) ensures no calculation reaches production without proper review and authorization.",
  },
  {
    icon: <Minimize2 size={22} />,
    title: "Simplicity",
    desc: "Complex problems solved with clear interfaces. No feature bloat. Every screen serves a purpose, every calculation has a rationale. The AI layer surfaces insights in plain language -- you never need to understand the math to act on the recommendation.",
  },
];

/* ── Industries ── */
const INDUSTRIES = [
  { icon: <Building2 size={20} />, name: "Corporate Treasury", desc: "End-to-end FX risk management for multinational corporations managing cross-border exposures across dozens of currency pairs and subsidiaries." },
  { icon: <Landmark size={20} />, name: "Banking & Capital Markets", desc: "Institutional FX infrastructure for banks, dealers, and market makers requiring deterministic computation and regulatory-grade audit trails." },
  { icon: <BarChart3 size={20} />, name: "Asset Management", desc: "Multi-currency portfolio hedging, exposure decomposition, and risk attribution for funds managing international equity, fixed income, and alternative assets." },
  { icon: <Umbrella size={20} />, name: "Insurance", desc: "ALM currency risk management, regulatory hedge accounting (IFRS 9 / ASC 815), and prospective effectiveness testing for insurance portfolios." },
  { icon: <Flame size={20} />, name: "Energy & Commodities", desc: "Commodity-linked FX exposure management and cross-currency hedging for energy companies with global supply chains and revenue streams." },
  { icon: <Globe size={20} />, name: "Sovereign & Public Sector", desc: "Central bank reserve management, sovereign wealth fund hedging, and public sector FX risk governance with full audit compliance." },
];

export default function AboutPage() {
  return (
    <MarketingLayout>
      {/* ── Hero ── */}
      <section style={{
        padding: "100px 48px 64px",
        textAlign: "center",
        background: C.bg,
      }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <h1 style={{
            fontFamily: F.heading, fontSize: 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: C.accent,
          }}>
            About ORDR
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: 18, color: C.textSub,
            maxWidth: 620, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Deterministic engines for computation. Agentic AI for insight.
            Built for institutions that demand both precision and intelligence.
          </p>
        </div>
      </section>

      {/* ── Mission ── */}
      <section style={{
        padding: "80px 48px",
        background: C.bgAlt,
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 12, fontWeight: 600,
            letterSpacing: "0.15em", color: C.textMuted,
            marginBottom: 12, textTransform: "uppercase",
          }}>
            Mission
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 20px", color: C.text,
          }}>
            Institutional-Grade Financial Infrastructure
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 17, color: C.textSub, lineHeight: 1.8, margin: "0 0 16px",
          }}>
            ORDR Terminal was created on a principle that financial institutions
            should not have to choose between computational precision and intelligent
            assistance. The platform&apos;s deterministic engine layer produces identical
            results for identical inputs -- every calculation is reproducible, auditable,
            and hash-chained with SHA-256 for tamper evidence. No ML black boxes, no
            random seeds, no stochastic variation.
          </p>
          <p style={{
            fontFamily: F.ui, fontSize: 17, color: C.textSub, lineHeight: 1.8, margin: 0,
          }}>
            On top of this deterministic foundation sits an Agentic AI layer that provides
            real-time insight, evaluation, and assistance. The AI reads charts, evaluates
            risk profiles, coaches trading discipline, and communicates via voice, chat,
            or terminal -- but it never auto-executes. Every decision remains with the
            human operator. We built the platform we wished existed when we were managing
            FX risk at scale: one that combines the rigor of deterministic computation
            with the intelligence of modern AI, treating governance and auditability as
            first-class requirements rather than afterthoughts.
          </p>
        </div>
      </section>

      {/* ── Values ── */}
      <section style={{ padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 12, fontWeight: 600,
            letterSpacing: "0.15em", color: C.textMuted,
            marginBottom: 12, textTransform: "uppercase",
            textAlign: "center",
          }}>
            Core Principles
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 40px",
            textAlign: "center", color: C.text,
          }}>
            Our Values
          </h2>
          <div className="about-values-grid" style={{
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24,
          }}>
            {VALUES.map((v) => (
              <div key={v.title} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: C.accentLight, color: C.accent,
                  marginBottom: 16,
                }}>
                  {v.icon}
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 18, fontWeight: 700,
                  margin: "0 0 10px", color: C.text,
                }}>
                  {v.title}
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  lineHeight: 1.7, margin: 0,
                }}>
                  {v.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our Approach: Deterministic Engine + AI Layer ── */}
      <section style={{ padding: "80px 48px", background: C.bgAlt }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 12, fontWeight: 600,
            letterSpacing: "0.15em", color: C.textMuted,
            marginBottom: 12, textTransform: "uppercase",
            textAlign: "center",
          }}>
            Architecture
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px",
            textAlign: "center", color: C.text,
          }}>
            Our Approach
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 16, color: C.textSub,
            lineHeight: 1.7, maxWidth: 720, margin: "0 auto 48px",
            textAlign: "center",
          }}>
            ORDR separates computation from intelligence. The deterministic engine
            layer handles all financial calculations with mathematical precision,
            while the Agentic AI layer provides contextual insight, evaluation,
            and real-time assistance. This separation ensures that regulatory-grade
            auditability is never compromised by AI unpredictability.
          </p>

          {/* Architecture Diagram SVG */}
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <svg
              viewBox="0 0 900 520"
              width="100%"
              style={{ display: "block" }}
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Bottom Layer: Deterministic Engine */}
              <rect x="50" y="360" width="800" height="130" rx="8" fill={C.accent} />
              <text x="450" y="396" textAnchor="middle" fontFamily={F.mono} fontSize="14" fontWeight="700" fill="#fff" letterSpacing="0.12em">
                DETERMINISTIC ENGINE LAYER
              </text>
              <line x1="150" y1="412" x2="750" y2="412" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <text x="200" y="436" textAnchor="middle" fontFamily={F.mono} fontSize="11" fill="rgba(255,255,255,0.7)">kernel.py</text>
              <text x="350" y="436" textAnchor="middle" fontFamily={F.mono} fontSize="11" fill="rgba(255,255,255,0.7)">validator.py</text>
              <text x="500" y="436" textAnchor="middle" fontFamily={F.mono} fontSize="11" fill="rgba(255,255,255,0.7)">audit.py</text>
              <text x="680" y="436" textAnchor="middle" fontFamily={F.mono} fontSize="11" fill="rgba(255,255,255,0.7)">41 modules</text>
              <text x="300" y="465" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.5)">SHA-256 hash chain</text>
              <text x="550" y="465" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.5)">Sub-50ms latency</text>
              <text x="750" y="465" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.5)">WORM audit trail</text>

              {/* Middle Layer: AI Insight */}
              <rect x="50" y="190" width="800" height="130" rx="8" fill="#1a6b5a" />
              <text x="450" y="226" textAnchor="middle" fontFamily={F.mono} fontSize="14" fontWeight="700" fill="#fff" letterSpacing="0.12em">
                AGENTIC AI LAYER
              </text>
              <line x1="150" y1="242" x2="750" y2="242" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <text x="170" y="268" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.7)">Risk evaluation</text>
              <text x="330" y="268" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.7)">Pattern recognition</text>
              <text x="500" y="268" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.7)">Chart analysis</text>
              <text x="650" y="268" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.7)">Trading discipline</text>
              <text x="790" y="268" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.7)">Anomaly detection</text>
              <text x="300" y="298" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.5)">Voice &amp; chat interface</text>
              <text x="550" y="298" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.5)">Contextual insight</text>
              <text x="750" y="298" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill="rgba(255,255,255,0.5)">Never auto-executes</text>

              {/* Top Layer: User Interface */}
              <rect x="50" y="20" width="800" height="130" rx="8" fill={C.bgMuted} stroke={C.border} strokeWidth="1" />
              <text x="450" y="56" textAnchor="middle" fontFamily={F.mono} fontSize="14" fontWeight="700" fill={C.text} letterSpacing="0.12em">
                USER INTERFACE LAYER
              </text>
              <line x1="150" y1="72" x2="750" y2="72" stroke={C.border} strokeWidth="1" />
              <text x="170" y="98" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill={C.textSub}>Terminal</text>
              <text x="300" y="98" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill={C.textSub}>Charts</text>
              <text x="430" y="98" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill={C.textSub}>Voice</text>
              <text x="560" y="98" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill={C.textSub}>Chatbox</text>
              <text x="700" y="98" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill={C.textSub}>Reports</text>
              <text x="450" y="128" textAnchor="middle" fontFamily={F.ui} fontSize="11" fill={C.textMuted}>Multi-channel communication: desktop, mobile, API</text>

              {/* Arrows: UI -> AI */}
              <defs>
                <marker id="arrowDown" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
                  <path d="M0,0 L8,3 L0,6 Z" fill={C.textMuted} />
                </marker>
                <marker id="arrowUp" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
                  <path d="M8,0 L0,3 L8,6 Z" fill={C.textMuted} />
                </marker>
              </defs>
              <line x1="350" y1="150" x2="350" y2="188" stroke={C.textMuted} strokeWidth="1.5" markerEnd="url(#arrowDown)" />
              <line x1="550" y1="188" x2="550" y2="150" stroke={C.textMuted} strokeWidth="1.5" markerEnd="url(#arrowUp)" />
              <text x="300" y="175" textAnchor="middle" fontFamily={F.mono} fontSize="9" fill={C.textMuted}>QUERIES</text>
              <text x="600" y="175" textAnchor="middle" fontFamily={F.mono} fontSize="9" fill={C.textMuted}>INSIGHTS</text>

              {/* Arrows: AI -> Engine */}
              <line x1="350" y1="320" x2="350" y2="358" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" markerEnd="url(#arrowDown)" />
              <line x1="550" y1="358" x2="550" y2="320" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" markerEnd="url(#arrowUp)" />
              <text x="290" y="345" textAnchor="middle" fontFamily={F.mono} fontSize="9" fill={C.textMuted}>COMPUTE</text>
              <text x="610" y="345" textAnchor="middle" fontFamily={F.mono} fontSize="9" fill={C.textMuted}>RESULTS</text>
            </svg>
          </div>

          {/* Approach detail cards */}
          <div className="about-approach-grid" style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginTop: 48,
          }}>
            <div style={{ padding: "24px 20px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ color: C.accent, marginBottom: 12 }}><Cpu size={20} /></div>
              <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Deterministic Compute</div>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>
                The engine calculates with mathematical precision. 41 modules, sub-50ms, same input always produces the same output. No randomness, no approximation.
              </p>
            </div>
            <div style={{ padding: "24px 20px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ color: C.accent, marginBottom: 12 }}><Brain size={20} /></div>
              <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>AI Evaluation</div>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>
                The Agentic AI layer evaluates engine output, identifies patterns, flags anomalies, and provides contextual insight to support human decision-making.
              </p>
            </div>
            <div style={{ padding: "24px 20px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ color: C.accent, marginBottom: 12 }}><Mic size={20} /></div>
              <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Multi-Channel</div>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>
                Communicate with the AI via voice, chat, or visual terminal. Get status updates, ask questions, receive guidance -- like having a risk analyst on call.
              </p>
            </div>
            <div style={{ padding: "24px 20px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ color: C.accent, marginBottom: 12 }}><Shield size={20} /></div>
              <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Human Decision</div>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>
                AI never auto-executes. Every trade, every hedge, every decision is made by the human operator. The AI informs, the human decides, the engine computes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Global Reach ── */}
      <section style={{ padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 12, fontWeight: 600,
            letterSpacing: "0.15em", color: C.textMuted,
            marginBottom: 12, textTransform: "uppercase",
            textAlign: "center",
          }}>
            Industries Served
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px",
            textAlign: "center", color: C.text,
          }}>
            Global Reach
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 16, color: C.textSub,
            lineHeight: 1.7, maxWidth: 680, margin: "0 auto 40px",
            textAlign: "center",
          }}>
            ORDR serves institutions across six major industry verticals worldwide,
            from Fortune 500 corporate treasuries to sovereign wealth funds. Our platform
            supports 100+ currency pairs, all major hedge instruments, and regulatory
            frameworks including IFRS 9, ASC 815, and local GAAP standards.
          </p>
          <div className="about-industries-grid" style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20,
          }}>
            {INDUSTRIES.map((ind) => (
              <div key={ind.name} style={{
                padding: "24px", background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 8,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                }}>
                  <div style={{ color: C.accent }}>{ind.icon}</div>
                  <div style={{
                    fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text,
                  }}>
                    {ind.name}
                  </div>
                </div>
                <p style={{
                  fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0,
                }}>
                  {ind.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform Numbers ── */}
      <section style={{ padding: "64px 48px", background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="about-stats-grid" style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 32 }}>
          {[
            { value: "41", label: "Engine Modules" },
            { value: "219+", label: "API Endpoints" },
            { value: "<50ms", label: "Computation Latency" },
            { value: "7", label: "Product Suite" },
            { value: "60", label: "Policy Presets" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 28, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        padding: "80px 48px",
        textAlign: "center",
        background: C.bg,
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 40, fontWeight: 800,
          letterSpacing: "-0.02em", margin: "0 0 16px",
          color: C.accent,
        }}>
          Ready to see it in action?
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: C.textSub,
          maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Launch the terminal and experience deterministic hedge computation
          with Agentic AI insight -- built for institutional teams that
          demand both precision and intelligence.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: "#fff", background: C.accent,
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 8,
          }}>
            Get Started <ArrowRight size={16} />
          </Link>
          <Link href="/contact" style={{
            fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.textSub,
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
            border: `1.5px solid ${C.border}`,
          }}>
            Contact Us
          </Link>
        </div>
      </section>

      <style>{`
        @media(max-width:768px){
          section{padding:60px 20px !important}
          h1{font-size:36px !important}
          h2{font-size:24px !important}
          .about-values-grid{grid-template-columns:1fr !important}
          .about-approach-grid{grid-template-columns:1fr 1fr !important}
          .about-industries-grid{grid-template-columns:1fr !important}
          .about-stats-grid{grid-template-columns:repeat(3,1fr) !important}
        }
        @media(max-width:480px){
          .about-approach-grid{grid-template-columns:1fr !important}
          .about-stats-grid{grid-template-columns:repeat(2,1fr) !important}
        }
      `}</style>
    </MarketingLayout>
  );
}
