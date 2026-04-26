"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Scale, FileCheck, AlertTriangle, TrendingDown,
  FlaskConical, Brain, Settings, Gauge, ShieldCheck,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "5yr+", label: "Typical hedge tenor" },
  { value: "Solvency II", label: "Regulatory framework" },
  { value: "ALM", label: "Asset-liability matching" },
  { value: "IFRS 9", label: "Accounting standard" },
  { value: "WORM", label: "Actuarial audit" },
  { value: "<50ms", label: "Calculation speed" },
];

const CHALLENGES = [
  {
    icon: <Scale size={20} />,
    title: "Long-dated hedge complexity",
    desc: "3-5 year FX hedges require cross-currency basis swaps and long-dated forwards that most treasury systems can't handle. Standard systems max out at 12-month forwards — leaving the long end of the liability curve unhedged or hedged with instruments that introduce basis risk rather than eliminating it.",
  },
  {
    icon: <AlertTriangle size={20} />,
    title: "Reserve adequacy opacity",
    desc: "Actuarial teams calculate reserve adequacy quarterly. Without real-time FX tracking, currency moves erode reserves before the next review. A 5% GBP/USD move can shift a 103% funded ratio to 98% — a solvency breach — in weeks, with no alert until month-end reporting.",
  },
  {
    icon: <FileCheck size={20} />,
    title: "Solvency II SCR calculation",
    desc: "Currency SCR under Solvency II requires a 25% instantaneous FX shock across all currency pairs. Most tools can't compute this automatically — actuaries run it manually in Excel, introducing calculation risk and making it impossible to run the SCR intra-quarter when market conditions shift.",
  },
  {
    icon: <TrendingDown size={20} />,
    title: "Hedge effectiveness for long tenors",
    desc: "Critical terms match breaks down for 5-year hedges. Statistical regression must be run quarterly with evidence packages for auditors. Without a systematic engine, this is a manual process — inconsistent across periods, exposed to methodology drift, and impossible to defend in regulatory review.",
  },
];

const CAPABILITIES = [
  {
    icon: <Scale size={20} />,
    title: "ALM-Aligned Long-Tenor Hedging",
    desc: "Portfolio-level exposure decomposition with cashflow bucketing across maturity tenors aligned to liability durations. The deterministic engine handles cross-currency basis swaps and long-dated forwards up to 10 years, matching hedge maturities to liability cashflow profiles with basis risk gap detection.",
    product: "ORDR Treasury",
  },
  {
    icon: <FileCheck size={20} />,
    title: "Solvency II SCR — Automated 25% Shock",
    desc: "The engine computes the instantaneous 25% FX shock across all currency pairs, calculates gross and net SCR, and produces a reduction certificate showing capital benefit from hedges. Runs in under 50ms. Evidence package is SHA-256 hash-chained and ready for regulator submission.",
    product: "ORDR Labs",
  },
  {
    icon: <Brain size={20} />,
    title: "Reserve Adequacy Monitoring — Real-Time",
    desc: "The Agentic AI monitors currency composition of reserves against liability profiles continuously, alerting when FX moves cause reserve adequacy to approach regulatory thresholds. Configured thresholds can trigger email, dashboard, or API alerts — no waiting for month-end reporting.",
    product: "ORDR Treasury",
  },
  {
    icon: <Settings size={20} />,
    title: "IFRS 9 Effectiveness Testing — Statistical Regression",
    desc: "Prospective and retrospective effectiveness testing using critical terms match and statistical regression. Quarterly evidence packages are generated automatically with methodology documentation, effectiveness ratios, and pass/fail conclusions — formatted for auditor review and IFRS 9 designation maintenance.",
    product: "ORDR Treasury",
  },
  {
    icon: <FlaskConical size={20} />,
    title: "ORSA Scenario Stress Testing",
    desc: "Configurable shock packs including Solvency II standard formula shocks, ORSA scenario sets, EM currency crisis, and yield curve inversion with FX correlation. Historical VaR, expected shortfall, and Monte Carlo simulation with full audit trail. Every scenario run is SHA-256 hash-chained for tamper-evident reporting.",
    product: "ORDR Labs",
  },
  {
    icon: <Gauge size={20} />,
    title: "Capital Optimization — SCR Frontier",
    desc: "The engine evaluates capital impact of alternative hedge strategies, quantifying the trade-off between hedge cost and SCR reduction. By comparing capital charge reduction per hedge instrument against carry cost and execution friction, the system identifies the capital-efficient frontier for the insurer's currency hedge program.",
    product: "ORDR Portfolio",
  },
];

const PRODUCTS = [
  { name: "ORDR Treasury", desc: "Core ALM hedging and governance pipeline" },
  { name: "ORDR Portfolio", desc: "Reserve adequacy and capital tracking" },
  { name: "ORDR Labs", desc: "Solvency II SCR and ORSA stress testing" },
  { name: "ORDR HedgeWiki", desc: "IFRS 9 / IFRS 17 accounting reference" },
];

export default function InsurancePage() {
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
          Insurance &amp; ALM
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 640, margin: "0 auto 16px", lineHeight: 1.7,
        }}>
          Long-dated FX liability matching, Solvency II currency SCR, and reserve adequacy
          monitoring for insurance companies and pension funds.
        </p>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textMuted,
          maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6,
        }}>
          Purpose-built for CIOs, ALM teams, and actuarial risk functions at insurers
          managing multi-currency investment portfolios and liability profiles.
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
      <section style={{
        background: C.bgAlt,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "40px 48px",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 24,
        }}>
          {STATS.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: F.mono, fontSize: 24, fontWeight: 700,
                color: C.accent, letterSpacing: "-0.02em", marginBottom: 4,
              }}>
                {s.value}
              </div>
              <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textMuted, lineHeight: 1.4 }}>
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
            Challenges Facing Insurance Companies
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            maxWidth: 640, margin: "0 auto 48px", textAlign: "center", lineHeight: 1.6,
          }}>
            Insurance currency risk requires long-horizon thinking, regulatory precision,
            and continuous monitoring that general-purpose treasury tools cannot provide.
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

      {/* ALM Terminal Panel */}
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
              ORDR Treasury — ALM Hedge Run
            </h2>
            <p style={{
              fontFamily: F.ui, fontSize: 15, color: C.textSub,
              maxWidth: 560, margin: "0 auto", lineHeight: 1.6,
            }}>
              Sample output from an ALM hedge run for a life assurance company.
              Cross-currency basis swaps, long-dated forwards, Solvency II SCR — all in one run.
            </p>
          </div>
          <div style={{
            background: "#0d1117", border: "1px solid #30363d",
            borderRadius: 12, padding: "28px 32px", fontFamily: F.mono,
            fontSize: 13, lineHeight: 1.8, color: "#c9d1d9",
            overflowX: "auto",
          }}>
            <div style={{ color: "#e6c767", fontWeight: 700, marginBottom: 4 }}>
              ORDR TREASURY · ALM HEDGE RUN
            </div>
            <div style={{ color: "#444d56", marginBottom: 12 }}>
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            </div>
            <div><span style={{ color: "#8b949e" }}>ENTITY      </span>Meridian Life Assurance Ltd</div>
            <div><span style={{ color: "#8b949e" }}>RESERVE CY  </span>GBP (£420M total liabilities)</div>
            <div style={{ marginBottom: 8 }}><span style={{ color: "#8b949e" }}>HEDGE DATE  </span>2026-03-23</div>
            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────</div>
            <div>
              <span style={{ color: "#8b949e" }}>GBP/USD LIABILITIES  </span>
              <span style={{ color: "#79c0ff" }}>£142,000,000</span>
              {"  "}36-60M tenor
            </div>
            <div>
              <span style={{ color: "#8b949e" }}>GBP/EUR LIABILITIES  </span>
              <span style={{ color: "#79c0ff" }}>£ 38,400,000</span>
              {"  "}24-48M tenor
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: "#8b949e" }}>GBP/CHF LIABILITIES  </span>
              <span style={{ color: "#79c0ff" }}>£  9,200,000</span>
              {"  "}12-24M tenor
            </div>
            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────</div>
            <div style={{ color: "#8b949e", marginBottom: 4 }}>HEDGE STRATEGY: Cross-Currency Basis Swap + Long FWD</div>
            <div style={{ paddingLeft: 4 }}>
              <div>
                <span style={{ color: "#8b949e" }}>INSTRUMENT   </span>
                GBP/USD CCS  £142M  3yr  rate{" "}
                <span style={{ color: "#f85149" }}>-21.4bp basis</span>
              </div>
              <div style={{ paddingLeft: 13 }}>
                GBP/EUR FWD  £38.4M  2yr  rate{" "}
                <span style={{ color: "#3fb950" }}>1.1634</span>
              </div>
              <div style={{ paddingLeft: 13, marginBottom: 8 }}>
                GBP/CHF FWD  £9.2M   1yr  rate{" "}
                <span style={{ color: "#3fb950" }}>1.1021</span>
              </div>
            </div>
            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────</div>
            <div>
              <span style={{ color: "#8b949e" }}>EFFECTIVENESS (REGRESSION)   </span>
              <span style={{ color: "#3fb950", fontWeight: 700 }}>97.4%  PASS</span>
            </div>
            <div style={{ color: "#8b949e", marginTop: 8, marginBottom: 4 }}>SOLVENCY II FX SCR (25% SHOCK)</div>
            <div style={{ paddingLeft: 4 }}>
              <div>
                <span style={{ color: "#8b949e" }}>  GBP/USD impact:  </span>
                <span style={{ color: "#f85149" }}>-£35,500,000</span>
              </div>
              <div>
                <span style={{ color: "#8b949e" }}>  GBP/EUR impact:   </span>
                <span style={{ color: "#f85149" }}>-£9,600,000</span>
              </div>
              <div>
                <span style={{ color: "#8b949e" }}>  Net SCR:          </span>
                <span style={{ color: "#e6c767" }}>£45,100,000</span>
                {"  "}(after hedges)
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "#8b949e" }}>  Pre-hedge SCR:    </span>
                £47,660,000  →{" "}
                <span style={{ color: "#3fb950" }}>REDUCTION: 5.4%</span>
              </div>
            </div>
            <div style={{ color: "#444d56", marginBottom: 8 }}>─────────────────────────────────────────</div>
            <div>
              <span style={{ color: "#8b949e" }}>RESERVE ADEQUACY:  </span>
              <span style={{ color: "#3fb950", fontWeight: 700 }}>103.2%  FUNDED</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <span style={{ color: "#8b949e" }}>HASH  </span>
              <span style={{ color: "#e6c767" }}>b4c5...d6e7</span>
              {"  "}·{"  "}
              <span style={{ color: "#3fb950", fontWeight: 600 }}>WORM SEALED</span>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section style={{ background: C.bg, padding: "96px 48px" }}>
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
            How ORDR Helps Insurers
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CAPABILITIES.map((c) => (
              <div key={c.title} style={{
                background: C.bgAlt, border: `1px solid ${C.border}`,
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
            Products for Insurance &amp; ALM
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

      {/* Reserve Monitoring Callout */}
      <section style={{ padding: "0 48px 96px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ background: C.accent, borderRadius: 16, padding: "56px 48px" }}>
            <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)",
                marginBottom: 16, textTransform: "uppercase",
              }}>
                ACTUARIAL AI
              </div>
              <h2 style={{
                fontFamily: F.heading, fontSize: 32, fontWeight: 800,
                color: "#fff", margin: "0 0 16px", letterSpacing: "-0.02em",
              }}>
                Reserve monitoring that doesn&apos;t wait for month-end
              </h2>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: "rgba(255,255,255,0.75)",
                lineHeight: 1.7, margin: "0 0 28px",
              }}>
                The Agentic AI monitors currency composition of reserves against liability profiles
                continuously — not quarterly. When a 4% GBP move starts compressing your 103%
                funded ratio toward 99%, you get an alert in hours, not at month-end reporting.
              </p>
              <div style={{ display: "flex", gap: 28, justifyContent: "center", flexWrap: "wrap" }}>
                {[
                  "Real-time reserve adequacy",
                  "SCR breach pre-alerts",
                  "Effectiveness ratio monitoring",
                  "WORM audit for regulators",
                ].map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldCheck size={14} color="rgba(255,255,255,0.6)" />
                    <span style={{ fontFamily: F.ui, fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{f}</span>
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
          Governed hedging for insurers
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          ALM-aligned currency risk management with real-time reserve monitoring,
          automated Solvency II SCR, and complete regulatory documentation — in one platform.
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
          div[style*="grid-template-columns: repeat(2"]{grid-template-columns:1fr !important}
        }
      `}</style>
    </MarketingLayout>
  );
}
