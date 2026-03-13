"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useMarketingTheme } from "@/components/marketing/useMarketingTheme";
import { F } from "@/components/marketing/theme";
import {
  Flame, Layers, CalendarRange, Activity, Minimize2, Zap, GitBranch, ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: <Layers size={22} strokeWidth={1.5} />,
    title: "Commodity FX Overlay",
    desc: "Manage the FX component of commodity hedging programs. Separate currency risk from commodity price risk for cleaner attribution.",
  },
  {
    icon: <CalendarRange size={22} strokeWidth={1.5} />,
    title: "Multi-Tenor Hedging",
    desc: "Roll programs across 12+ monthly buckets with forward curve integration. Tenor-aware optimization for production schedules.",
  },
  {
    icon: <Activity size={22} strokeWidth={1.5} />,
    title: "Basis Risk Monitoring",
    desc: "Track and report on basis risk between hedge and underlying exposure. Automated alerts when basis drift exceeds tolerance thresholds.",
  },
  {
    icon: <Minimize2 size={22} strokeWidth={1.5} />,
    title: "Cost Optimization",
    desc: "Minimize hedge friction while maintaining target coverage ratios. Transparent cost decomposition including spread, rollover, and carry.",
  },
  {
    icon: <Zap size={22} strokeWidth={1.5} />,
    title: "Crisis Scenario Testing",
    desc: "Pre-built scenarios for oil shocks, currency crises, and supply disruptions. Stress-test your hedge portfolio before events hit.",
  },
  {
    icon: <GitBranch size={22} strokeWidth={1.5} />,
    title: "Pipeline Integration",
    desc: "Sandbox to Staging to Ledger workflow for controlled hedge execution. Test proposals in sandbox before committing to production.",
  },
];

export default function EnergyPage() {
  const { T, dk, mob } = useMarketingTheme();

  return (
    <MarketingLayout>
      <style>{`
        .en-feat{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .en-feat:hover{transform:translateY(-4px);border-color:${dk ? "rgba(251,146,60,0.3)" : "rgba(30,58,95,0.2)"} !important}
      `}</style>

      {/* Hero */}
      <section style={{
        padding: mob ? "80px 20px 48px" : "100px 48px 64px",
        textAlign: "center", position: "relative", background: T.heroGrad,
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px",
            border: `1px solid ${T.border}`, borderRadius: 100,
            fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: T.textDim,
            background: dk ? "rgba(251,146,60,0.04)" : "rgba(30,58,95,0.03)",
            marginBottom: 24,
          }}>
            <Flame size={14} /> ENERGY &amp; COMMODITIES
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: mob ? 36 : 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: dk ? "#eeeef2" : T.accent,
          }}>
            Energy &amp; Commodities
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: mob ? 16 : 18, color: T.textSub,
            maxWidth: 560, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Commodity price risk management and hedge optimization. Manage the FX
            overlay on commodity hedging programs with multi-tenor precision.
          </p>
        </div>
      </section>

      {/* Challenge */}
      <section style={{
        padding: mob ? "48px 20px" : "72px 48px",
        background: T.sectionAlt, borderTop: `1px solid ${T.border}`,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 20px", color: T.text,
          }}>
            The Challenge
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 16, color: T.textSub, lineHeight: 1.8, margin: 0,
          }}>
            Energy and commodity companies face layered risk: commodity price exposure
            compounded by currency risk on international revenue. Rolling hedge programs
            across dozens of monthly tenors creates operational complexity. Crisis events --
            oil shocks, supply disruptions, sanctions -- demand rapid reassessment of the
            entire hedge portfolio.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section style={{ padding: mob ? "48px 20px" : "80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 40px", textAlign: "center", color: T.text,
        }}>
          Commodity Hedging Toolkit
        </h2>
        <div style={{
          display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: 24,
        }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="en-feat" style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 14, padding: "28px 24px", boxShadow: T.cardShadow,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(251,146,60,0.08)", color: "#fb923c", marginBottom: 16,
              }}>
                {f.icon}
              </div>
              <h3 style={{
                fontFamily: F.heading, fontSize: 16, fontWeight: 700,
                margin: "0 0 8px", color: T.text,
              }}>
                {f.title}
              </h3>
              <p style={{
                fontFamily: F.ui, fontSize: 14, color: T.textSub, lineHeight: 1.6, margin: 0,
              }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Who It's For */}
      <section style={{
        padding: mob ? "48px 20px" : "64px 48px",
        background: T.sectionAlt, borderTop: `1px solid ${T.border}`,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 16px", color: T.text,
          }}>
            Who It&apos;s For
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 16, color: T.textSub, lineHeight: 1.7, margin: 0,
          }}>
            VP Commodity Risk, Heads of Treasury, and FX Managers at energy producers,
            mining companies, and commodity trading firms. Ideal for organizations
            managing multi-tenor roll programs across volatile markets.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: mob ? "48px 20px 64px" : "64px 48px 96px", textAlign: "center",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 28 : 40, fontWeight: 800,
          letterSpacing: "-0.02em", margin: "0 0 16px",
          color: dk ? "#eeeef2" : T.accent,
        }}>
          Tame commodity FX risk
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: T.textSub,
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Multi-tenor hedge optimization with crisis-ready scenario testing.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: T.accentText, background: T.accent,
            padding: "13px 32px", borderRadius: 10, textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 8,
          }}>
            Get Started <ArrowRight size={16} />
          </Link>
          <Link href="/contact" style={{
            fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: T.textSub,
            padding: "13px 32px", borderRadius: 10, textDecoration: "none",
            border: `1.5px solid ${T.border}`,
          }}>
            Contact Sales
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
