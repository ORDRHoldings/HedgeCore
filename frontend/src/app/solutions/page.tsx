"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F, SOLUTIONS } from "@/components/marketing/theme";
import {
  Building2, ShieldAlert, BarChart3, Landmark, Umbrella, Flame,
  ArrowRight, Cpu, Brain, Lock, MessageSquare,
} from "lucide-react";

const ICONS: Record<string, React.ReactNode> = {
  "corporate-treasury": <Building2 size={24} strokeWidth={1.5} />,
  "risk-management": <ShieldAlert size={24} strokeWidth={1.5} />,
  "asset-management": <BarChart3 size={24} strokeWidth={1.5} />,
  "banking": <Landmark size={24} strokeWidth={1.5} />,
  "insurance": <Umbrella size={24} strokeWidth={1.5} />,
  "energy": <Flame size={24} strokeWidth={1.5} />,
};

const EXTENDED_DESCS: Record<string, string> = {
  "corporate-treasury":
    "End-to-end FX exposure management with an AI Risk Assistant that communicates via chat, phone, and voice. Deterministic hedge calculations ensure accuracy while AI provides real-time status updates, anomaly alerts, and policy recommendations across your entire position book.",
  "risk-management":
    "Enterprise risk quantification across the R1-R8 taxonomy with AI-powered anomaly detection and scenario evaluation. The deterministic engine computes VaR, expected shortfall, and concentration metrics while the Agentic AI layer surfaces insights, flags outliers, and recommends stress scenarios.",
  "asset-management":
    "Multi-currency portfolio hedging with AI-driven cost optimization insights and performance attribution. Systematic hedge plan generation backed by deterministic calculations, with an intelligent assistant that monitors hedge drift, tracks benchmark deviations, and evaluates cost-risk trade-offs.",
  "banking":
    "Institutional FX infrastructure with AI-powered market analysis through ORDR Market and compliance-grade governance. The Agentic AI coaches trading discipline, helps interpret technical patterns, and monitors regulatory thresholds while the deterministic engine handles all calculation and audit functions.",
  "insurance":
    "ALM currency risk management with AI monitoring of reserve adequacy and hedge effectiveness. Long-dated liability matching powered by deterministic maturity-bucketed calculations, with intelligent alerts for basis risk deterioration, roll cost spikes, and Solvency II capital implications.",
  "energy":
    "Commodity-linked FX exposure management with AI geopolitical overlay powered by Polisophic intelligence. Cross-currency hedging calculations are deterministic while the Agentic AI layer monitors geopolitical corridors, analyzes commodity-FX correlations, and evaluates scenario impacts in real time.",
};

const PILLARS = [
  {
    icon: <Cpu size={22} strokeWidth={1.5} />,
    title: "Deterministic Engine",
    desc: "Every hedge calculation, risk metric, and effectiveness test runs through a frozen, audited computation kernel. Same inputs always produce the same outputs. No hidden model drift, no stochastic surprises. The engine is SHA-256 hash-chained for tamper-evident auditability.",
  },
  {
    icon: <Brain size={22} strokeWidth={1.5} />,
    title: "Agentic AI Layer",
    desc: "An intelligent assistant sits above the deterministic foundation, providing real-time insight, evaluation, and proactive monitoring. It reads your positions, understands your policies, and communicates findings through natural language -- via chat, voice, or phone. It never overrides the engine; it interprets and explains it.",
  },
  {
    icon: <Lock size={22} strokeWidth={1.5} />,
    title: "Institutional Governance",
    desc: "4-eyes approval workflows, separation of duties enforcement, WORM audit trails, and RBAC with 41 granular permissions. Every decision is recorded in an append-only, hash-chained ledger. The AI operates within the same governance framework -- it recommends, it never unilaterally executes.",
  },
  {
    icon: <MessageSquare size={22} strokeWidth={1.5} />,
    title: "Multi-Modal Communication",
    desc: "Interact with ORDR through dashboards, chat, voice commands, or phone calls. The Agentic AI understands context across all channels -- ask about a position by voice, receive a detailed breakdown in chat, get an alert by phone when thresholds are breached. One assistant, every interface.",
  },
];

export default function SolutionsPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{
        padding: "100px 48px 72px",
        textAlign: "center",
        background: C.bg,
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 12, fontWeight: 600,
            letterSpacing: "0.1em", color: C.accent,
            marginBottom: 16, textTransform: "uppercase",
          }}>
            ENTERPRISE SOLUTIONS
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 20px",
            color: C.accent,
          }}>
            Enterprise Solutions Across Industries
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: 18, color: C.textSub,
            maxWidth: 640, margin: "0 auto", lineHeight: 1.7,
          }}>
            Every ORDR solution is built on the same deterministic computation engine and
            institutional governance framework. An Agentic AI layer sits on top, providing
            intelligent insight, proactive monitoring, and natural-language assistance --
            without ever compromising calculation integrity.
          </p>
        </div>
      </section>

      {/* Architecture SVG Diagram */}
      <section style={{ padding: "0 48px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <svg viewBox="0 0 1000 520" width="100%" style={{ display: "block" }}>
          <defs>
            <marker id="arrowDown" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
            <marker id="arrowRight" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>

          {/* Title */}
          <text x="500" y="30" textAnchor="middle" fontFamily="'Manrope', sans-serif" fontSize="16" fontWeight="700" fill="#1E3A5F">
            ORDR UNIFIED PLATFORM ARCHITECTURE
          </text>

          {/* Top Layer: Industry Solutions */}
          <rect x="40" y="50" width="920" height="80" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="500" y="72" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.1em">
            INDUSTRY SOLUTIONS
          </text>
          {["Corporate Treasury", "Risk Mgmt", "Asset Mgmt", "Banking", "Insurance", "Energy"].map((label, i) => (
            <g key={label}>
              <rect x={65 + i * 148} y="85" width="130" height="34" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x={130 + i * 148} y="106" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="11" fontWeight="600" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* Arrow down */}
          <line x1="500" y1="130" x2="500" y2="160" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowDown)" />

          {/* Agentic AI Layer */}
          <rect x="140" y="165" width="720" height="90" rx="8" fill="#1E3A5F" />
          <text x="500" y="190" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="11" fontWeight="600" fill="rgba(255,255,255,0.6)" letterSpacing="0.1em">
            AGENTIC AI LAYER
          </text>
          {["Risk Assistant", "Market Coach", "Anomaly Detection", "Voice / Chat / Phone"].map((label, i) => (
            <g key={label}>
              <rect x={170 + i * 172} y="202" width="152" height="38" rx="6" fill="rgba(255,255,255,0.12)" />
              <text x={246 + i * 172} y="225" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="11" fontWeight="500" fill="#FFFFFF">
                {label}
              </text>
            </g>
          ))}

          {/* Arrow down */}
          <line x1="500" y1="255" x2="500" y2="285" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowDown)" />

          {/* Deterministic Engine */}
          <rect x="140" y="290" width="720" height="90" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="500" y="315" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="11" fontWeight="600" fill="#555555" letterSpacing="0.1em">
            DETERMINISTIC ENGINE (FROZEN v1 KERNEL)
          </text>
          {["Hedge Kernel", "Risk Taxonomy", "Effectiveness", "Scenarios / VaR"].map((label, i) => (
            <g key={label}>
              <rect x={170 + i * 172} y="327" width="152" height="38" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x={246 + i * 172} y="350" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="11" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* Arrow down */}
          <line x1="500" y1="380" x2="500" y2="410" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrowDown)" />

          {/* Governance & Audit */}
          <rect x="200" y="415" width="600" height="65" rx="8" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="1.5" />
          <text x="500" y="440" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="11" fontWeight="600" fill="#555555" letterSpacing="0.1em">
            GOVERNANCE & AUDIT INFRASTRUCTURE
          </text>
          {["WORM Audit", "4-Eyes Approval", "Hash Chain", "RBAC"].map((label, i) => (
            <g key={label}>
              <text x={282 + i * 145} y="465" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* Side labels */}
          <text x="30" y="210" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fill="#999999" transform="rotate(-90, 30, 210)">
            INTERPRETS
          </text>
          <text x="970" y="210" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fill="#999999" transform="rotate(90, 970, 210)">
            RECOMMENDS
          </text>
          <text x="30" y="335" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fill="#999999" transform="rotate(-90, 30, 335)">
            COMPUTES
          </text>
          <text x="970" y="335" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="9" fill="#999999" transform="rotate(90, 970, 335)">
            DETERMINISTIC
          </text>

          {/* Bottom note */}
          <text x="500" y="510" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fill="#999999">
            AI never overrides the engine. It interprets, evaluates, and communicates -- within governance constraints.
          </text>
        </svg>
      </section>

      {/* Solutions Grid */}
      <section style={{
        padding: "80px 48px",
        maxWidth: 1100, margin: "0 auto",
      }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 40, fontWeight: 800,
            letterSpacing: "-0.02em", margin: "0 0 16px", color: C.accent,
          }}>
            Solutions by Industry
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 16, color: C.textSub,
            maxWidth: 600, margin: "0 auto", lineHeight: 1.6,
          }}>
            Each solution leverages the same frozen computation kernel, the same audit infrastructure,
            and the same Agentic AI assistant -- configured for your sector&apos;s specific requirements.
          </p>
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 24,
        }}>
          {SOLUTIONS.map((s) => (
            <Link
              key={s.slug}
              href={`/solutions/${s.slug}`}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "32px 28px",
              }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: 14, marginBottom: 16,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: C.accentLight, color: C.accent,
                }}>
                  {ICONS[s.slug]}
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 20, fontWeight: 700,
                  margin: 0, letterSpacing: "-0.01em", color: C.text,
                }}>
                  {s.name}
                </h3>
              </div>
              <p style={{
                fontFamily: F.ui, fontSize: 14, color: C.textSub,
                lineHeight: 1.7, margin: "0 0 20px",
              }}>
                {EXTENDED_DESCS[s.slug] || s.desc}
              </p>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: F.ui, fontSize: 13, fontWeight: 600,
                color: C.accent,
              }}>
                Explore Solution <ArrowRight size={14} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Deterministic Foundation Section */}
      <section style={{ background: C.bgAlt, padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{
              fontFamily: F.mono, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.1em", color: C.textMuted,
              marginBottom: 12, textTransform: "uppercase",
            }}>
              PLATFORM PHILOSOPHY
            </div>
            <h2 style={{
              fontFamily: F.heading, fontSize: 40, fontWeight: 800,
              letterSpacing: "-0.02em", margin: "0 0 16px", color: C.accent,
            }}>
              Deterministic Foundation, Intelligent Assistance
            </h2>
            <p style={{
              fontFamily: F.ui, fontSize: 16, color: C.textSub,
              maxWidth: 680, margin: "0 auto", lineHeight: 1.7,
            }}>
              ORDR separates computation from intelligence by design. The deterministic engine
              handles every calculation -- hedge ratios, risk metrics, effectiveness tests, scenario
              analysis -- with mathematical precision and full auditability. The Agentic AI layer
              interprets those results, monitors for anomalies, and communicates insights in natural
              language. This architecture means you get the best of both worlds: calculations you can
              audit and defend to regulators, and an intelligent assistant that helps you understand
              what those calculations mean for your business.
            </p>
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24,
          }}>
            {PILLARS.map((p) => (
              <div key={p.title} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "32px 28px",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: C.accentLight, color: C.accent,
                  marginBottom: 16,
                }}>
                  {p.icon}
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 18, fontWeight: 700,
                  margin: "0 0 10px", color: C.text,
                }}>
                  {p.title}
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  lineHeight: 1.7, margin: 0,
                }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{
        padding: "96px 48px",
        textAlign: "center",
        background: C.accent,
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 40, fontWeight: 800,
          letterSpacing: "-0.02em", margin: "0 0 16px",
          color: "#fff",
        }}>
          Not sure which solution fits?
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Every ORDR deployment starts from the same unified platform. Talk to our team and
          we will help you configure the right solution for your organization, your regulatory
          environment, and your risk profile.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: C.accent, background: "#fff",
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 8,
          }}>
            Get Started <ArrowRight size={16} />
          </Link>
          <Link href="/contact" style={{
            fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)",
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
            border: "1.5px solid rgba(255,255,255,0.3)",
          }}>
            Contact Sales
          </Link>
        </div>
      </section>

      <style>{`
        @media(max-width:768px){
          section{padding:60px 20px !important}
          h1{font-size:36px !important}
          h2{font-size:28px !important}
          div[style*="grid-template-columns: repeat(2"]{grid-template-columns:1fr !important}
          div[style*="grid-template-columns: repeat(3"]{grid-template-columns:1fr !important}
          svg{min-height:400px}
        }
      `}</style>
    </MarketingLayout>
  );
}
