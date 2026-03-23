"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Monitor, Gavel, BarChart3, Network,
  TrendingUp, Lock, BookOpen, Brain, Workflow, Building,
  Activity, ShieldCheck,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "60fps", label: "Chart rendering speed" },
  { value: "77+", label: "Technical indicators" },
  { value: "219+", label: "API endpoints" },
  { value: "4-eyes", label: "Execution governance" },
  { value: "Python/JS", label: "Algo languages" },
  { value: "SHA-256", label: "Trade audit chain" },
];

const CHALLENGES = [
  {
    icon: <Monitor size={20} />,
    title: "Charting tools don't scale",
    desc: "Bloomberg and TradingView are consumer tools. Banks need customizable, API-driven charting that integrates with internal systems — not a third-party SaaS that can't be white-labeled, rate-limited, or extended with proprietary indicators.",
  },
  {
    icon: <Brain size={20} />,
    title: "No discipline enforcement",
    desc: "Prop traders drift from strategy without realizing it. Without systematic tracking, behavioral biases compound across sessions. A trader who overperforms on Mondays and bleeds on Fridays won't see the pattern until it's already a drawdown.",
  },
  {
    icon: <Gavel size={20} />,
    title: "Compliance-grade audit gaps",
    desc: "FX desk trades need tamper-evident records. Email trails and screen recordings don't satisfy FINRA 17a-4 or MiFID II archival requirements. Every calculation, approval, and execution needs a hash-chained, append-only record that regulators can independently verify.",
  },
  {
    icon: <Network size={20} />,
    title: "Siloed market data",
    desc: "Macro calendars, earnings events, and FX signals live in separate platforms. Analysts waste hours correlating data manually — cross-referencing a Bloomberg window with a Reuters feed with an internal spreadsheet to get a picture that should load in a single panel.",
  },
];

const CAPABILITIES = [
  {
    icon: <BarChart3 size={20} />,
    title: "60fps Canvas Charting — 77+ Indicators",
    desc: "ORDR Market renders at 60fps using Canvas 2D with hardware-accelerated compositing. 77+ technical indicators including EMA, MACD, RSI, Bollinger Bands, Ichimoku, and custom Python-computed overlays. Multi-timeframe analysis with synchronized crosshairs across panels. Built for institutional use — not throttled, not sampled.",
    product: "ORDR Market",
  },
  {
    icon: <Activity size={20} />,
    title: "Algo Builder — Python & JavaScript Engine",
    desc: "Write, backtest, and deploy trading algorithms in Python or JavaScript directly inside ORDR Market. The algo engine executes on live tick data with configurable signal logic, position sizing rules, and risk limits. Signal audit trail is SHA-256 hash-chained — every trade decision is reproducible and defensible.",
    product: "ORDR Market",
  },
  {
    icon: <Lock size={20} />,
    title: "WORM Audit Chain — FINRA 17a-4 / MiFID II",
    desc: "Append-only, SHA-256 hash-chained event log satisfies SOX, EMIR, and MiFID II record-keeping requirements. Every calculation, approval, and execution event is recorded with immutable provenance. No record can be modified or deleted after creation — each event includes the previous event's hash, creating a tamper-evident chain regulators can independently verify.",
    product: "ORDR Treasury",
  },
  {
    icon: <Workflow size={20} />,
    title: "Tri-State Governance — Sandbox → Staging → Ledger",
    desc: "Every execution proposal passes through three stages before it touches the ledger. 4-eyes approval with enforced separation of duties ensures that no single individual can both create and approve a trade. The governance pipeline is configurable per desk — different thresholds, escalation rules, and committee requirements based on transaction size.",
    product: "ORDR Treasury",
  },
  {
    icon: <Building size={20} />,
    title: "Multi-Tenant Client Hedging",
    desc: "Run client hedging programs on a single platform with tenant-isolated position books, policy configurations, and audit trails. Each client operates in a governed sandbox with distinct hedge parameters, approval workflows, and reporting outputs. Tenant isolation means no client can access another client's data, positions, or policy configurations.",
    product: "ORDR Treasury",
  },
  {
    icon: <BookOpen size={20} />,
    title: "Regulatory Reference Library",
    desc: "ISDA definitions, EMIR trade reporting guidance, MiFID II best execution requirements, and hedge accounting standards in a searchable reference library — cross-referenced with ORDR policy templates to ensure hedge strategies comply with applicable regulatory frameworks.",
    product: "ORDR HedgeWiki",
  },
];

const PRODUCTS = [
  { name: "ORDR Market", desc: "60fps charting, 77+ indicators, algo trading" },
  { name: "ORDR Journal", desc: "Trade review, session analytics, AI coaching" },
  { name: "ORDR FinHub", desc: "Macro calendar, FX signals, earnings events" },
  { name: "ORDR Portfolio", desc: "Desk-level risk and position aggregation" },
];

const JOURNAL_STATS = [
  { label: "Sessions this month", value: "22" },
  { label: "Win rate", value: "67.3%" },
  { label: "Avg R:R", value: "1 : 2.1" },
  { label: "Profit factor", value: "1.84" },
  { label: "Max drawdown", value: "-3.2%" },
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
          Institutional FX infrastructure for banks, dealers, and prop trading desks.
          60fps charting, 77+ indicators, algo trading, and governance-grade audit.
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

      {/* Stats Strip */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "40px 48px" }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 24,
        }}>
          {STATS.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: F.mono, fontSize: 28, fontWeight: 700,
                color: C.accent, letterSpacing: "-0.02em", marginBottom: 4,
              }}>
                {s.value}
              </div>
              <div style={{
                fontFamily: F.ui, fontSize: 12, color: C.textMuted,
                lineHeight: 1.4,
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Challenges */}
      <section style={{ background: C.bg, padding: "96px 48px" }}>
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
            maxWidth: 620, margin: "0 auto 48px", textAlign: "center", lineHeight: 1.6,
          }}>
            Regulated financial institutions face unique infrastructure requirements that
            generic trading platforms and treasury management systems cannot adequately address.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CHALLENGES.map((c) => (
              <div key={c.title} style={{
                background: C.bgAlt, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(220,38,38,0.06)", color: "#DC2626",
                  }}>
                    {c.icon}
                  </div>
                  <h3 style={{ fontFamily: F.heading, fontSize: 17, fontWeight: 700, margin: 0, color: C.text }}>
                    {c.title}
                  </h3>
                </div>
                <p style={{ fontFamily: F.ui, fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Terminal Panel */}
      <section style={{ padding: "96px 48px", background: C.bgAlt }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              fontFamily: F.mono, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.1em", color: C.textMuted,
              marginBottom: 12, textTransform: "uppercase",
            }}>
              LIVE TERMINAL OUTPUT
            </div>
            <h2 style={{
              fontFamily: F.heading, fontSize: 36, fontWeight: 700,
              letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
            }}>
              ORDR Market — Algo Builder
            </h2>
            <p style={{
              fontFamily: F.ui, fontSize: 15, color: C.textSub,
              maxWidth: 560, margin: "0 auto", lineHeight: 1.6,
            }}>
              Sample output from a live mean-reversion strategy running on EUR/USD H1.
              Every signal, entry, and AI coaching note is WORM-sealed at write time.
            </p>
          </div>
          <div style={{
            background: "#0d1117", border: "1px solid #30363d",
            borderRadius: 12, padding: "28px 32px", fontFamily: F.mono,
            fontSize: 13, lineHeight: 1.8, color: "#c9d1d9",
            overflowX: "auto",
          }}>
            <div style={{ color: "#e6c767", fontWeight: 700, marginBottom: 4 }}>
              ORDR MARKET · ALGO BUILDER · Python Engine
            </div>
            <div style={{ color: "#444d56", marginBottom: 12 }}>
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <div><span style={{ color: "#8b949e" }}>SYMBOL  </span><span style={{ color: "#79c0ff" }}>EUR/USD</span>  ·  H1  ·  Live</div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#8b949e" }}>BID     </span>
              <span style={{ color: "#3fb950" }}>1.08412</span>
              {"  "}
              <span style={{ color: "#8b949e" }}>ASK  </span>
              <span style={{ color: "#f85149" }}>1.08418</span>
              {"  "}
              <span style={{ color: "#8b949e" }}>SPREAD  </span>0.6 pips
            </div>
            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────</div>
            <div><span style={{ color: "#8b949e" }}>STRATEGY  </span>Mean Reversion EMA Cross</div>
            <div>
              <span style={{ color: "#8b949e" }}>STATUS    </span>
              <span style={{ color: "#3fb950", fontWeight: 600 }}>RUNNING</span>
              {"  "}·  23 trades today
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#8b949e" }}>P&amp;L       </span>
              <span style={{ color: "#3fb950" }}>+$4,280</span>
              {"  "}(gross){"  "}
              <span style={{ color: "#8b949e" }}>Sharpe </span>1.84
            </div>
            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────</div>
            <div style={{ color: "#8b949e", marginBottom: 2 }}>SIGNAL</div>
            <div style={{ paddingLeft: 8 }}>
              <span style={{ color: "#e6c767" }}>[09:32:14]</span>  EMA9 crossed above EMA21
            </div>
            <div style={{ paddingLeft: 8 }}>
              <span style={{ color: "#8b949e" }}>RSI(14): </span>52.3  →  Neutral
            </div>
            <div style={{ paddingLeft: 8 }}>
              <span style={{ color: "#8b949e" }}>MACD: </span>
              <span style={{ color: "#3fb950" }}>Bullish divergence confirmed</span>
            </div>
            <div style={{ paddingLeft: 8, marginBottom: 8 }}>
              <span style={{ color: "#8b949e" }}>ATR(14): </span>0.00083  →  Normal volatility
            </div>
            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────</div>
            <div>
              <span style={{ color: "#8b949e" }}>ENTRY     </span>
              <span style={{ color: "#79c0ff" }}>1.08395</span>
              {"  "}
              <span style={{ color: "#8b949e" }}>SIZE  </span>200,000  LONG
            </div>
            <div>
              <span style={{ color: "#8b949e" }}>STOP      </span>
              <span style={{ color: "#f85149" }}>1.08295</span>
              {"  "}(-$200)
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#8b949e" }}>TARGET    </span>
              <span style={{ color: "#3fb950" }}>1.08595</span>
              {"  "}(+$400){"  "}R:R 1:2
            </div>
            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────</div>
            <div style={{ color: "#bc8cff", marginBottom: 2 }}>AI COACH</div>
            <div style={{ paddingLeft: 8, color: "#c9d1d9", fontStyle: "italic", marginBottom: 8 }}>
              &quot;Position sized conservatively. Stop placement technically sound.
              Note: 3rd consecutive long on EUR/USD — watch for directional bias drift.&quot;
            </div>
            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────</div>
            <div>
              <span style={{ color: "#8b949e" }}>AUDIT     </span>
              <span style={{ color: "#e6c767" }}>HASH 8f4e...b2c3</span>
              {"  "}·{"  "}
              <span style={{ color: "#3fb950", fontWeight: 600 }}>WORM SEALED</span>
            </div>
          </div>
        </div>
      </section>

      {/* Trade Journal Sample */}
      <section style={{ padding: "96px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
            <div>
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.1em", color: C.textMuted,
                marginBottom: 12, textTransform: "uppercase",
              }}>
                ORDR JOURNAL
              </div>
              <h2 style={{
                fontFamily: F.heading, fontSize: 32, fontWeight: 700,
                letterSpacing: "-0.02em", margin: "0 0 16px", color: C.text,
              }}>
                Session-level performance analytics with AI behavioral flags
              </h2>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: C.textSub,
                lineHeight: 1.7, margin: "0 0 24px",
              }}>
                ORDR Journal tracks every session, calculates win rate, R:R, profit factor,
                and drawdown — then surfaces behavioral patterns that quantitative metrics alone miss.
              </p>
              <div style={{
                background: "#0d1117", border: "1px solid #f85149",
                borderRadius: 8, padding: "16px 20px",
                fontFamily: F.mono, fontSize: 12, color: "#f85149",
              }}>
                <span style={{ fontWeight: 700 }}>AI FLAG  </span>
                &quot;Overtrading detected on Fridays — 31% of losses concentrated on Friday afternoon sessions.&quot;
              </div>
            </div>
            <div style={{
              background: "#0d1117", border: "1px solid #30363d",
              borderRadius: 12, padding: "28px 32px",
            }}>
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.08em", color: "#e6c767",
                marginBottom: 16, textTransform: "uppercase",
              }}>
                Monthly Performance Summary
              </div>
              {JOURNAL_STATS.map((s) => (
                <div key={s.label} style={{
                  display: "flex", justifyContent: "space-between",
                  borderBottom: "1px solid #21262d", padding: "10px 0",
                  fontFamily: F.mono, fontSize: 13,
                }}>
                  <span style={{ color: "#8b949e" }}>{s.label}</span>
                  <span style={{ color: "#c9d1d9", fontWeight: 600 }}>{s.value}</span>
                </div>
              ))}
              <div style={{
                marginTop: 16, padding: "10px 0",
                display: "flex", justifyContent: "space-between",
                fontFamily: F.mono, fontSize: 13,
              }}>
                <span style={{ color: "#8b949e" }}>Sessions flagged</span>
                <span style={{ color: "#f85149", fontWeight: 700 }}>4 of 22</span>
              </div>
            </div>
          </div>
        </div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
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
                <h3 style={{ fontFamily: F.heading, fontSize: 17, fontWeight: 700, margin: "0 0 10px", color: C.text }}>
                  {c.title}
                </h3>
                <p style={{ fontFamily: F.ui, fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products Strip */}
      <section style={{ padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 28, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 32px", textAlign: "center", color: C.text,
          }}>
            Products for Banking &amp; Capital Markets
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {PRODUCTS.map((p) => (
              <div key={p.name} style={{
                background: C.bgAlt, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "24px 20px", textAlign: "center",
              }}>
                <div style={{
                  fontFamily: F.mono, fontSize: 13, fontWeight: 700,
                  color: C.accent, marginBottom: 8, letterSpacing: "0.02em",
                }}>
                  {p.name}
                </div>
                <p style={{ fontFamily: F.ui, fontSize: 13, color: C.textSub, lineHeight: 1.5, margin: 0 }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ORDR Market Callout */}
      <section style={{ padding: "0 48px 96px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: C.accent, borderRadius: 16, padding: "56px 48px" }}>
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
                ORDR Market: 60fps. 77+ Indicators. Algo Trading.
              </h2>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: "rgba(255,255,255,0.75)",
                lineHeight: 1.7, margin: "0 0 12px",
              }}>
                The first institutional charting platform with an integrated Agentic AI coach.
                Coaches trading discipline, interprets technical patterns, and can help desk analysts
                build algorithmic strategies in Python or JavaScript. Not a consumer product —
                an institutional platform with API-driven extensibility and governance-grade audit.
              </p>
              <div style={{ display: "flex", gap: 32, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
                {["60fps Canvas 2D", "77+ Indicators", "Python Algo Engine", "SHA-256 Signal Audit"].map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldCheck size={14} color="rgba(255,255,255,0.6)" />
                    <span style={{ fontFamily: F.ui, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{f}</span>
                  </div>
                ))}
              </div>
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
          60fps charting, 77+ indicators, algo trading, 4-eyes governance, and a SHA-256
          hash-chained audit trail. Built for the compliance and operational standards of
          regulated financial institutions.
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
            color: "rgba(255,255,255,0.85)",
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
          h1{font-size:32px !important}
          h2{font-size:22px !important}
          div[style*="grid-template-columns: repeat(6"]{grid-template-columns:repeat(3,1fr) !important}
          div[style*="grid-template-columns: repeat(4"]{grid-template-columns:repeat(2,1fr) !important}
          div[style*="grid-template-columns: 1fr 1fr"]{grid-template-columns:1fr !important}
          div[style*="grid-template-columns: repeat(2"]{grid-template-columns:1fr !important}
        }
      `}</style>
    </MarketingLayout>
  );
}
