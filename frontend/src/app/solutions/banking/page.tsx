"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Scale, ShieldCheck, TrendingUp, BookOpen,
  Lock, BarChart3, FileText, Workflow, Brain, Users,
  Building, Monitor, Gavel, Network, Database, Eye,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const CHALLENGES = [
  {
    icon: <Network size={20} />,
    title: "Client Flow Management",
    desc: "Banks managing FX hedging programs for corporate clients must track exposures, generate hedge recommendations, and execute trades across hundreds of client accounts with distinct policy parameters, credit limits, and reporting requirements. Each client relationship involves a unique combination of currency pairs, maturity profiles, and governance constraints. Managing this complexity with generic trading systems or manual processes creates operational risk that scales linearly with client count, eventually exceeding the capacity of even well-resourced FX desks.",
  },
  {
    icon: <Gavel size={20} />,
    title: "Regulatory Compliance Burden",
    desc: "EMIR trade reporting, MiFID II best execution documentation, FRTB capital adequacy calculations, and Basel III/IV liquidity requirements demand systematic compliance infrastructure across the entire trading lifecycle. Each regulatory regime has distinct documentation standards, timing requirements, and data format specifications. Banks that rely on manual compliance processes face escalating costs, increasing error rates, and growing regulatory scrutiny. The penalty for non-compliance is not just financial -- it threatens the institution's ability to operate in regulated markets.",
  },
  {
    icon: <Monitor size={20} />,
    title: "Operational Efficiency",
    desc: "FX desks at regional and mid-tier banks operate with smaller teams than their bulge-bracket counterparts but face the same regulatory and operational requirements. Automating hedge calculation, policy application, and audit trail generation is not a luxury -- it is a survival requirement. Manual processes that were adequate when the desk handled 50 client relationships become untenable at 200. Without systematic infrastructure, operational risk grows faster than revenue, and the cost-to-serve for smaller client relationships becomes uneconomic.",
  },
  {
    icon: <BarChart3 size={20} />,
    title: "Risk Limit Architecture",
    desc: "Managing FX risk limits across client accounts, desk-level aggregations, and institution-wide thresholds requires a hierarchical limit framework that is enforced in real time. When a client hedge proposal would breach a desk limit, the system must identify the conflict before execution -- not in the end-of-day risk report. Most banks lack the integrated infrastructure to check client-level, desk-level, and enterprise-level limits simultaneously against a single proposed transaction.",
  },
];

const CAPABILITIES = [
  {
    icon: <Building size={20} />,
    title: "Multi-Tenant Client Hedging",
    desc: "Run client hedging programs on a single platform with tenant-isolated position books, policy configurations, and audit trails. Each client operates in a governed sandbox with distinct hedge parameters, approval workflows, and reporting outputs. The deterministic engine ensures that client hedge calculations are reproducible and verifiable, while tenant isolation means that no client can access another client's data, positions, or policy configurations.",
    product: "ORDR Treasury",
  },
  {
    icon: <Lock size={20} />,
    title: "Compliance-Grade Audit Trail",
    desc: "Append-only, SHA-256 hash-chained event log satisfies SOX, EMIR, and MiFID II record-keeping requirements. Every calculation, approval, and execution event is recorded with immutable provenance. The WORM (Write Once, Read Many) architecture ensures that no audit record can be modified or deleted after creation. Each event includes the previous event's hash, creating a tamper-evident chain that regulators can independently verify.",
    product: "ORDR Treasury",
  },
  {
    icon: <TrendingUp size={20} />,
    title: "AI-Powered Market Intelligence",
    desc: "ORDR Market provides Canvas 2D charting with 23 technical indicators, drawing tools, and multi-timeframe analysis. The Agentic AI layer is the first agentic charting system -- it coaches trading discipline, helps interpret technical patterns and market structure, and can assist desk analysts in building algorithmic strategies in Python or JavaScript. The AI monitors market conditions in real time and alerts when conditions affect client exposure profiles.",
    product: "ORDR Market",
  },
  {
    icon: <Workflow size={20} />,
    title: "Tri-State Governance Pipeline",
    desc: "Every execution proposal passes through three stages: Sandbox (draft and calculate), Staging (review and approve), and Ledger (execute and record). 4-eyes approval with enforced separation of duties ensures that no single individual can both create and approve a trade. The governance pipeline is configurable per client, supporting different approval thresholds, escalation rules, and committee requirements based on transaction size and risk profile.",
    product: "ORDR Treasury",
  },
  {
    icon: <Brain size={20} />,
    title: "Agentic AI for Desk Operations",
    desc: "The AI assistant monitors pending approvals, tracks client exposure changes, and surfaces operational insights across the desk's entire client book. Desk managers can ask natural-language questions about aggregated positions, limit utilization, and client activity patterns. The AI interprets deterministic engine outputs and presents them in decision-ready format, reducing the time between calculation and action.",
    product: "ORDR Treasury",
  },
  {
    icon: <BookOpen size={20} />,
    title: "Regulatory Reference Library",
    desc: "ISDA definitions, EMIR trade reporting guidance, MiFID II best execution requirements, and hedge accounting standards in a searchable reference library. Cross-referenced with ORDR policy templates to ensure that hedge strategies comply with applicable regulatory frameworks. The AI can answer natural-language questions about regulatory requirements and flag potential compliance issues in proposed hedge structures.",
    product: "ORDR HedgeWiki",
  },
];

export default function BankingPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/solutions" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: F.ui, fontSize: 14, color: C.textSub, textDecoration: "none",
          marginBottom: 32,
        }}>
          <ChevronLeft size={14} /> All Solutions
        </Link>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 600,
          letterSpacing: "0.1em", color: C.textMuted,
          marginBottom: 16, textTransform: "uppercase",
        }}>
          INDUSTRY SOLUTION
        </div>
        <h1 style={{
          fontFamily: F.heading, fontSize: 48, fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 20px",
          color: C.accent,
        }}>
          Banking &amp; Capital Markets
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 640, margin: "0 auto 16px", lineHeight: 1.7,
        }}>
          Institutional FX infrastructure with AI-powered market analytics, compliance-grade
          governance, and multi-tenant client hedging programs. The deterministic engine handles
          every calculation while the Agentic AI provides real-time market intelligence,
          operational insight, and trading discipline coaching through ORDR Market.
        </p>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textMuted,
          maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6,
        }}>
          Built for FX desks, client advisory teams, and institutional risk functions
          at banks of all sizes.
        </p>
        <Link href="/auth/login" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontFamily: F.ui, fontSize: 15, fontWeight: 600,
          color: "#fff", background: C.accent,
          padding: "13px 32px", borderRadius: 8, textDecoration: "none",
        }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      {/* Challenges */}
      <section style={{ background: C.bgAlt, padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.1em", color: C.textMuted,
            marginBottom: 12, textAlign: "center", textTransform: "uppercase",
          }}>
            THE PROBLEM
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", textAlign: "center", color: C.text,
          }}>
            Challenges Facing Institutional FX Desks
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 640, margin: "0 auto 48px", textAlign: "center", lineHeight: 1.6,
          }}>
            Regulated financial institutions face unique infrastructure requirements that
            generic treasury management systems and trading platforms cannot adequately address.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CHALLENGES.map((c) => (
              <div key={c.title} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(220, 38, 38, 0.06)", color: "#DC2626",
                  }}>
                    {c.icon}
                  </div>
                  <h3 style={{
                    fontFamily: F.heading, fontSize: 17, fontWeight: 700,
                    margin: 0, color: C.text,
                  }}>
                    {c.title}
                  </h3>
                </div>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  lineHeight: 1.7, margin: 0,
                }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SVG Diagram: Banking Flow */}
      <section style={{ padding: "96px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
          }}>
            Institutional FX Infrastructure
          </h2>
        </div>
        <svg viewBox="0 0 1000 460" width="100%" style={{ display: "block" }}>
          <defs>
            <marker id="bkArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>

          {/* Client Layer */}
          <rect x="20" y="30" width="960" height="80" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="500" y="52" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">
            CLIENT ACCOUNTS (MULTI-TENANT, ISOLATED)
          </text>
          {["Corporate A", "Corporate B", "Fund Manager", "Insurance Co.", "Pension Fund"].map((label, i) => (
            <g key={label}>
              <rect x={45 + i * 188} y="65" width="168" height="32" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x={129 + i * 188} y="85" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* Arrows down */}
          <line x1="500" y1="110" x2="500" y2="140" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#bkArrow)" />

          {/* FX Desk Operations */}
          <rect x="120" y="145" width="760" height="90" rx="8" fill="#1E3A5F" />
          <text x="500" y="170" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.6)" letterSpacing="0.08em">
            FX DESK OPERATIONS + AGENTIC AI
          </text>
          {["Client Advisory", "Hedge Calculation", "Market Intelligence", "Limit Monitoring"].map((label, i) => (
            <g key={label}>
              <rect x={145 + i * 185} y="185" width="165" height="35" rx="6" fill="rgba(255,255,255,0.12)" />
              <text x={227 + i * 185} y="207" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#FFFFFF">
                {label}
              </text>
            </g>
          ))}

          {/* Arrows down */}
          <line x1="500" y1="235" x2="500" y2="265" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#bkArrow)" />

          {/* Deterministic Engine */}
          <rect x="120" y="270" width="370" height="80" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="305" y="293" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            DETERMINISTIC ENGINE
          </text>
          {["Hedge Kernel", "Risk Taxonomy", "Effectiveness"].map((label, i) => (
            <g key={label}>
              <rect x={140 + i * 115} y="305" width="100" height="30" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x={190 + i * 115} y="324" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* ORDR Market */}
          <rect x="510" y="270" width="370" height="80" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="695" y="293" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            ORDR MARKET
          </text>
          {["Canvas Charting", "23 Indicators", "AI Coach"].map((label, i) => (
            <g key={label}>
              <rect x={530 + i * 115} y="305" width="100" height="30" rx="6" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x={580 + i * 115} y="324" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">
                {label}
              </text>
            </g>
          ))}

          {/* Compliance & Governance */}
          <rect x="120" y="380" width="760" height="55" rx="8" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="1.5" />
          <text x="500" y="405" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">
            COMPLIANCE: WORM AUDIT -- EMIR REPORTING -- MiFID II BEST EXECUTION -- FRTB CAPITAL
          </text>
          <text x="500" y="425" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fill="#999999">
            Every transaction, calculation, and approval recorded with SHA-256 hash-chain integrity
          </text>

          {/* Connection lines */}
          <line x1="305" y1="350" x2="305" y2="380" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
          <line x1="695" y1="350" x2="695" y2="380" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
        </svg>
      </section>

      {/* Capabilities */}
      <section style={{ background: C.bgAlt, padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.1em", color: C.textMuted,
            marginBottom: 12, textAlign: "center", textTransform: "uppercase",
          }}>
            CAPABILITIES
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 48px", textAlign: "center", color: C.text,
          }}>
            How ORDR Helps Banks
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CAPABILITIES.map((c) => (
              <div key={c.title} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: C.accentLight, color: C.accent,
                  }}>
                    {c.icon}
                  </div>
                  <span style={{
                    fontFamily: F.mono, fontSize: 11, fontWeight: 600,
                    color: C.accent, letterSpacing: "0.06em",
                  }}>
                    {c.product.toUpperCase()}
                  </span>
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 17, fontWeight: 700,
                  margin: "0 0 10px", color: C.text,
                }}>
                  {c.title}
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  lineHeight: 1.7, margin: 0,
                }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ORDR Market Callout */}
      <section style={{ padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            background: C.accent, borderRadius: 16, padding: "56px 48px",
          }}>
            <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)",
                marginBottom: 16, textTransform: "uppercase",
              }}>
                AGENTIC CHARTING
              </div>
              <h2 style={{
                fontFamily: F.heading, fontSize: 32, fontWeight: 800,
                color: "#fff", margin: "0 0 16px", letterSpacing: "-0.02em",
              }}>
                ORDR Market: The First Agentic Charting System
              </h2>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: "rgba(255,255,255,0.7)",
                lineHeight: 1.7, margin: "0 0 12px",
              }}>
                ORDR Market goes beyond traditional charting platforms. The Agentic AI coaches
                trading discipline, helps desk analysts read chart patterns, identify regime changes,
                and build algorithmic strategies in Python or JavaScript. It monitors market conditions
                in real time and correlates price action with client exposure profiles.
              </p>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: "rgba(255,255,255,0.7)",
                lineHeight: 1.7, margin: 0,
              }}>
                Canvas 2D rendering with 23 technical indicators, professional drawing tools,
                and 60fps animation. Combined with an AI that understands both the chart and
                your client book.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "96px 48px", textAlign: "center" }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 36, fontWeight: 800,
          color: "#fff", margin: "0 0 16px", letterSpacing: "-0.02em",
        }}>
          Institutional-grade FX infrastructure
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Built for the compliance, governance, and operational standards of regulated
          financial institutions. Deterministic engine. Agentic AI. Complete audit trail.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: C.accent, background: "#fff",
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
          }}>
            Get Started <ArrowRight size={16} />
          </Link>
          <Link href="/contact" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: "rgba(255,255,255,0.8)",
            border: "1.5px solid rgba(255,255,255,0.3)",
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
          }}>
            Contact Sales
          </Link>
        </div>
      </section>

      <style>{`
        @media(max-width:768px){
          section{padding:60px 20px !important}
          h1{font-size:36px !important}
          h2{font-size:24px !important}
          div[style*="grid-template-columns: repeat(2"]{grid-template-columns:1fr !important}
          svg{min-height:380px}
        }
      `}</style>
    </MarketingLayout>
  );
}
