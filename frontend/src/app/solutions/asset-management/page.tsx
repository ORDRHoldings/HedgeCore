"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, PieChart, History,
  TrendingUp, Brain, BarChart3, FileCheck,
  DollarSign, LineChart, Lock, Users,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "$245M", label: "Typical AUM tracked" },
  { value: "14", label: "Currencies managed" },
  { value: "4 min", label: "AI LP report generation" },
  { value: "Pro-rata", label: "Allocation method" },
  { value: "Dual portal", label: "Manager + LP access" },
  { value: "WORM", label: "Allocation audit" },
];

const CHALLENGES = [
  {
    icon: <BarChart3 size={20} />,
    title: "AUM Tracking in Spreadsheets",
    desc: "Fund managers track capital allocations, period returns, and LP contributions across multiple spreadsheets. Pro-rata errors compound silently — a mis-allocated basis point in Q1 creates a cascading discrepancy across four quarters of LP statements. There is no period locking, no hash chain, and no audit trail connecting a capital balance to the calculation that produced it.",
  },
  {
    icon: <DollarSign size={20} />,
    title: "Hedge Cost Opacity",
    desc: "Currency hedging costs are underreported or inconsistently allocated across fund tranches. Forward points, roll costs, and bid-ask spreads are absorbed into blended returns rather than allocated transparently to the currency strategies that incurred them. LPs cannot verify hedge attribution, and fund managers cannot defend their cost allocation methodology to institutional investors or consultants.",
  },
  {
    icon: <FileCheck size={20} />,
    title: "LP Reporting Manual Assembly",
    desc: "Quarterly LP reports take 2-3 weeks to assemble from raw data. NAV calculations reference custodian feeds, performance fee waterfalls are computed in separate spreadsheets, FX attribution is pulled from a third system, and the final document is assembled in Word. Every number touched by hand is a source of error. Every revision cycle introduces new reconciliation risk.",
  },
  {
    icon: <Lock size={20} />,
    title: "No Period Controls",
    desc: "Without period locking, historical NAV calculations can be retroactively adjusted — intentionally or accidentally. Audit trails are incomplete. When an LP questions a Q2 return figure during a Q4 audit, the fund manager may not be able to demonstrate that the Q2 number was not subsequently modified. ORDR enforces period locks backed by WORM semantics: once sealed, no retroactive edits are permitted.",
  },
];

const CAPABILITIES = [
  {
    icon: <PieChart size={20} />,
    title: "Multi-Currency Exposure Decomposition",
    desc: "Full portfolio decomposition across currency pairs with confirmed and forecast cashflow bucketing by maturity tenor. The engine breaks down gross and net exposure by fund, strategy, and currency pair, identifying natural hedges and netting opportunities. Each decomposition is deterministic and reproducible — the same position book always produces the same exposure breakdown.",
    product: "ORDR Portfolio",
  },
  {
    icon: <TrendingUp size={20} />,
    title: "Systematic Hedge Plan Generation",
    desc: "Generate hedge recommendations based on policy parameters including target hedge ratios, cost thresholds, minimum trade sizes, and instrument preferences. The deterministic engine evaluates the cost-risk trade-off for each proposed hedge action and optimizes execution within policy constraints. The AI assistant monitors hedge drift in real time and recommends rebalancing actions when positions deviate from target ratios.",
    product: "ORDR Treasury",
  },
  {
    icon: <Users size={20} />,
    title: "LP Portal & Dual Access",
    desc: "Fund managers and LPs access the same underlying data through role-scoped portals. LPs see their NAV, contributions, allocations, and return attribution. Managers see fund-level aggregates, policy configuration, and approval queues. The same WORM-sealed calculation backs both views — there is no separate LP version of the numbers.",
    product: "ORDR Fund",
  },
  {
    icon: <Brain size={20} />,
    title: "AI LP Report Generation",
    desc: "The Agentic AI generates quarterly LP report drafts in under 4 minutes from the deterministic ledger. The draft includes NAV reconciliation, performance attribution, hedge cost allocation, and period-over-period comparison. All numbers pull directly from sealed calculation runs — no manual assembly. Human review and approval is required before the report is released to the LP portal.",
    product: "ORDR Fund",
  },
  {
    icon: <LineChart size={20} />,
    title: "Performance Attribution",
    desc: "Isolate the impact of FX hedging on fund returns with transparent, reproducible attribution calculations. Decompose total return into asset return, currency return, and hedge contribution. The deterministic engine ensures that attribution results are independently verifiable — LPs and consultants can reconstruct the calculation from the same inputs and confirm identical outputs.",
    product: "ORDR Portfolio",
  },
  {
    icon: <History size={20} />,
    title: "Period Locking & Audit Trail",
    desc: "Period locks are enforced by WORM semantics — once a period is closed, the calculation hash is sealed and no retroactive modification is permitted. The full audit trail connects every LP balance, allocation, and return figure to a specific calculation run, timestamp, and approving user. Period-over-period reconciliation is automated and cryptographically verifiable.",
    product: "ORDR Fund",
  },
];

const PRODUCTS_USED = [
  { name: "ORDR Fund", desc: "AUM tracking, LP portal, period locking, AI report generation" },
  { name: "ORDR Portfolio", desc: "Multi-currency decomposition and performance attribution" },
  { name: "ORDR Treasury", desc: "Hedge calculation, policy governance, execution pipeline" },
  { name: "ORDR FinHub", desc: "Macro data, forward curves, volatility surfaces" },
];

export default function AssetManagementPage() {
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
          Asset Management
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 640, margin: "0 auto 16px", lineHeight: 1.7,
        }}>
          Multi-currency portfolio risk for fund managers. AUM tracking, LP reporting,
          hedge cost optimization, and institutional audit — all in one ecosystem.
          Deterministic calculations, period locking, and WORM-sealed LP reports.
        </p>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textMuted,
          maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6,
        }}>
          Purpose-built for portfolio managers, currency overlay teams, and fund
          risk officers managing multi-currency mandates and institutional LP relationships.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: "#fff", background: C.accent,
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
          }}>
            Get Started <ArrowRight size={16} />
          </Link>
          <Link href="/contact" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: C.textSub, border: `1.5px solid ${C.border}`,
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
          }}>
            Request Demo
          </Link>
        </div>
      </section>

      {/* Stats Strip */}
      <section style={{ background: C.accent, padding: "40px 48px" }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 24,
        }}>
          {STATS.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: F.mono, fontSize: 22, fontWeight: 800,
                color: "#FFFFFF", marginBottom: 4, letterSpacing: "-0.02em",
              }}>
                {s.value}
              </div>
              <div style={{
                fontFamily: F.ui, fontSize: 12, color: "rgba(255,255,255,0.65)",
                lineHeight: 1.4,
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The Problem */}
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
            Challenges in Portfolio Currency Management
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 640, margin: "0 auto 48px", textAlign: "center", lineHeight: 1.6,
          }}>
            Currency hedging for multi-asset portfolios requires infrastructure that
            most asset managers either lack or have outgrown.
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

      {/* Sample LP Report Terminal */}
      <section style={{ padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.1em", color: C.textMuted,
            marginBottom: 12, textAlign: "center", textTransform: "uppercase",
          }}>
            SAMPLE OUTPUT
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 12px", textAlign: "center", color: C.text,
          }}>
            Sample LP Report Draft
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 600, margin: "0 auto 40px", textAlign: "center", lineHeight: 1.6,
          }}>
            Generated by the AI in under 4 minutes from the deterministic ledger. All figures
            pull from WORM-sealed calculation runs. Human approval required before release.
          </p>
          <div style={{
            background: "#0A0A0A", border: "1px solid #1E293B",
            borderRadius: 12, padding: "32px 36px", overflowX: "auto",
          }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
              color: "#E2E8F0", lineHeight: 1.9, whiteSpace: "pre",
            }}>
              <span style={{ color: "#E2E8F0", fontWeight: 700 }}>{"ORDR FUND · LP REPORT DRAFT\n"}</span>
              <span style={{ color: "#F59E0B" }}>{"Generated by AI · Pending human review\n"}</span>
              <span style={{ color: "#6B7280" }}>{"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"FUND         "}</span><span>{"Meridian FX Opportunities Fund I\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"PERIOD       "}</span><span>{"Q1 2026 (Jan 1 – Mar 31)\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"LP           "}</span><span>{"Cornerstone Pension Fund\n"}</span>
              {"\n"}
              <span style={{ color: "#93C5FD" }}>{"OPENING NAV (Jan 1)   "}</span><span>{"$12,450,000\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"Contributions          "}</span><span>{"$1,500,000\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"Withdrawals            "}</span><span>{"        $0\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"P&L (gross)            "}</span><span style={{ color: "#22C55E" }}>{"  $287,400\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"Management Fees        "}</span><span>{"   $62,250\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"Performance Fees       "}</span><span>{"   $28,740  "}</span><span style={{ color: "#6B7280" }}>{"(20% above 5% hurdle)\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"CLOSING NAV (Mar 31)  "}</span><span style={{ fontWeight: 700 }}>{"$14,146,410\n"}</span>
              {"\n"}
              <span style={{ color: "#93C5FD" }}>{"Return (gross)             "}</span><span style={{ color: "#22C55E" }}>{"+2.31%  "}</span><span style={{ color: "#6B7280" }}>{"(annualized: 9.24%)\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"Sharpe Ratio               "}</span><span>{"1.42\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"Max Drawdown               "}</span><span style={{ color: "#F59E0B" }}>{"-1.8%\n"}</span>
              {"\n"}
              <span style={{ color: "#93C5FD" }}>{"HEDGE COSTS ALLOCATED     "}</span><span>{"$14,200\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"FX ATTRIBUTION:\n"}</span>
              <span>{"  EUR/USD long       "}</span><span style={{ color: "#22C55E" }}>{"+$142,000\n"}</span>
              <span>{"  GBP/USD short       "}</span><span style={{ color: "#EF4444" }}>{"-$34,200\n"}</span>
              <span>{"  JPY hedges          "}</span><span style={{ color: "#22C55E" }}>{"+$91,400\n"}</span>
              <span>{"  Other               "}</span><span style={{ color: "#22C55E" }}>{"+$88,200\n"}</span>
              {"\n"}
              <span style={{ color: "#93C5FD" }}>{"AUDIT HASH  "}</span><span style={{ color: "#6B7280" }}>{"7a6b...5c4d · WORM SEALED\n"}</span>
              <span style={{ color: "#93C5FD" }}>{"PERIOD LOCK "}</span><span style={{ color: "#22C55E" }}>{"Confirmed · No retroactive edits permitted\n"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* SVG Diagram */}
      <section style={{ background: C.bgAlt, padding: "96px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 600,
            letterSpacing: "0.1em", color: C.textMuted,
            marginBottom: 12, textTransform: "uppercase",
          }}>
            WORKFLOW
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 36, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
          }}>
            Asset Management Hedge Flow
          </h2>
        </div>
        <svg viewBox="0 0 1000 400" width="100%" style={{ display: "block" }}>
          <defs>
            <marker id="amArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>

          {/* Portfolio Inputs */}
          <rect x="20" y="30" width="220" height="120" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="130" y="55" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">PORTFOLIO INPUTS</text>
          {["Fund Positions", "NAV Data", "Benchmark Weights"].map((label, i) => (
            <g key={label}>
              <rect x="35" y={68 + i * 26} width="190" height="20" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="130" y={82 + i * 26} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">{label}</text>
            </g>
          ))}

          <line x1="240" y1="90" x2="290" y2="90" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#amArrow)" />

          {/* Decomposition */}
          <rect x="300" y="30" width="180" height="120" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="390" y="55" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">DECOMPOSITION</text>
          {["Currency Exposure", "Netting Analysis", "Maturity Bucketing"].map((label, i) => (
            <g key={label}>
              <rect x="315" y={68 + i * 26} width="150" height="20" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="390" y={82 + i * 26} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">{label}</text>
            </g>
          ))}

          <line x1="480" y1="90" x2="530" y2="90" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#amArrow)" />

          {/* Hedge Engine */}
          <rect x="540" y="30" width="180" height="120" rx="8" fill="#EEEEF2" stroke="#E5E7EB" strokeWidth="1" />
          <text x="630" y="55" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">HEDGE ENGINE</text>
          {["Plan Generation", "Cost Optimization", "Policy Compliance"].map((label, i) => (
            <g key={label}>
              <rect x="555" y={68 + i * 26} width="150" height="20" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="630" y={82 + i * 26} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">{label}</text>
            </g>
          ))}

          <line x1="720" y1="90" x2="770" y2="90" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#amArrow)" />

          {/* Output */}
          <rect x="780" y="30" width="200" height="120" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="880" y="55" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#999999" letterSpacing="0.08em">OUTPUT</text>
          {["LP Reports (AI)", "Attribution Report", "Investor Portal"].map((label, i) => (
            <g key={label}>
              <rect x="795" y={68 + i * 26} width="170" height="20" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
              <text x="880" y={82 + i * 26} textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fontWeight="500" fill="#1E3A5F">{label}</text>
            </g>
          ))}

          {/* AI Layer */}
          <rect x="200" y="190" width="600" height="70" rx="8" fill="#1E3A5F" />
          <text x="500" y="215" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.6)" letterSpacing="0.08em">AGENTIC AI LAYER: LP REPORT GENERATION · DRIFT MONITORING · COST ANALYSIS</text>
          <text x="500" y="240" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="10" fill="rgba(255,255,255,0.5)">Draft in 4 min — human approval required — numbers sealed from ledger only</text>

          {[130, 390, 630, 880].map((x) => (
            <line key={x} x1={x} y1="150" x2={x} y2="190"
              stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
          ))}

          {/* Governance bar */}
          <rect x="200" y="300" width="600" height="50" rx="8" fill="#FFFFFF" stroke="#1E3A5F" strokeWidth="1.5" />
          <text x="500" y="322" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" fill="#555555" letterSpacing="0.08em">GOVERNANCE: WORM AUDIT — PERIOD LOCKING — POLICY VERSION CONTROL — HASH CHAIN</text>
          <text x="500" y="340" textAnchor="middle" fontFamily="'IBM Plex Sans', sans-serif" fontSize="9" fill="#999999">Complete audit trail for LP reporting, regulatory disclosure, and compliance review</text>

          <line x1="500" y1="260" x2="500" y2="300" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
        </svg>
      </section>

      {/* Capabilities */}
      <section style={{ padding: "96px 48px" }}>
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
            How ORDR Helps Asset Managers
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CAPABILITIES.map((c) => (
              <div key={c.title} style={{
                background: C.bgAlt, border: `1px solid ${C.border}`,
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

      {/* Products Used */}
      <section style={{ background: C.bgAlt, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 28, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 32px", textAlign: "center", color: C.text,
          }}>
            Products Used
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {PRODUCTS_USED.map((p) => (
              <div key={p.name} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "24px 20px", textAlign: "center",
              }}>
                <div style={{
                  fontFamily: F.mono, fontSize: 13, fontWeight: 700,
                  color: C.accent, marginBottom: 8, letterSpacing: "0.02em",
                }}>
                  {p.name}
                </div>
                <p style={{
                  fontFamily: F.ui, fontSize: 13, color: C.textSub,
                  lineHeight: 1.5, margin: 0,
                }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "96px 48px", textAlign: "center" }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 36, fontWeight: 800,
          color: "#fff", margin: "0 0 16px", letterSpacing: "-0.02em",
        }}>
          Optimize your portfolio hedging
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Systematic, auditable hedge management with AI-generated LP reports,
          period locking, and real-time drift monitoring for multi-currency portfolios.
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
          div[style*="grid-template-columns: repeat(4"]{grid-template-columns:repeat(2,1fr) !important}
          div[style*="grid-template-columns: repeat(6"]{grid-template-columns:repeat(3,1fr) !important}
          svg{min-height:320px}
        }
      `}</style>
    </MarketingLayout>
  );
}
