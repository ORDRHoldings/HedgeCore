"use client";

import Link from "next/link";
import { ChevronLeft, ArrowRight, Flame, Globe, FlaskConical, TrendingUp, Zap, BarChart3, Shield, Activity } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const CHALLENGES = [
  { title: "Commodity-Linked FX Exposure", desc: "Energy companies face correlated commodity and currency risk that requires integrated analysis, not siloed spreadsheet models." },
  { title: "Volatile Currency Pairs", desc: "Emerging market currencies tied to energy-producing nations exhibit extreme volatility that demands systematic monitoring and scenario analysis." },
  { title: "Complex Cross-Currency Hedging", desc: "Multi-leg hedging across commodity currencies, funding currencies, and reporting currencies creates operational complexity that manual processes cannot manage." },
  { title: "Geopolitical Risk", desc: "Sanctions, trade restrictions, and political instability in energy-producing regions create tail risks that require scenario modeling and contingency planning." },
];

const CAPABILITIES = [
  { icon: <Zap size={20} />, title: "Cross-Currency Hedging", desc: "Multi-currency exposure decomposition with cross-pair correlation analysis and systematic hedge plan generation.", product: "ORDR Treasury" },
  { icon: <Globe size={20} />, title: "Geopolitical Intelligence", desc: "Polisophic corridor scoring for country and currency risk with configurable alert thresholds and scenario triggers.", product: "ORDR Polisophic" },
  { icon: <FlaskConical size={20} />, title: "Scenario Studio", desc: "Energy-specific shock packs, commodity-FX correlation scenarios, and Monte Carlo simulation for risk committee reporting.", product: "ORDR Labs" },
  { icon: <Activity size={20} />, title: "Market Data", desc: "Real-time FX spot, forward curves, and volatility surfaces with multi-provider failover and configurable polling.", product: "ORDR Market" },
];

export default function EnergyPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <Link href="/solutions" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: F.ui, fontSize: 14, color: C.textSub, textDecoration: "none",
          marginBottom: 32,
        }}>
          <ChevronLeft size={14} /> All Solutions
        </Link>
        <h1 style={{
          fontFamily: F.heading, fontSize: 48, fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px",
          color: C.accent,
        }}>
          Energy &amp; Commodities
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 560, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Commodity-linked FX exposure management and cross-currency
          hedging for the energy sector.
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
      <section style={{ background: C.bgAlt, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 40px", textAlign: "center", color: C.text,
          }}>
            Your Challenges
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CHALLENGES.map((c) => (
              <div key={c.title} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 18, fontWeight: 700,
                  margin: "0 0 10px", color: C.text,
                }}>
                  {c.title}
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  lineHeight: 1.6, margin: 0,
                }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section style={{ padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 40px", textAlign: "center", color: C.text,
          }}>
            How ORDR Helps
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {CAPABILITIES.map((c) => (
              <div key={c.title} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 12, marginBottom: 12,
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
                  fontFamily: F.heading, fontSize: 18, fontWeight: 700,
                  margin: "0 0 10px", color: C.text,
                }}>
                  {c.title}
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  lineHeight: 1.6, margin: 0,
                }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 36, fontWeight: 800,
          color: "#fff", margin: "0 0 16px", letterSpacing: "-0.02em",
        }}>
          Manage commodity-linked FX risk
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Integrated geopolitical intelligence and scenario analysis for energy companies.
        </p>
        <Link href="/auth/login" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontFamily: F.ui, fontSize: 15, fontWeight: 600,
          color: C.accent, background: "#fff",
          padding: "13px 32px", borderRadius: 8, textDecoration: "none",
        }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      <style>{`
        @media(max-width:768px){
          section{padding:60px 20px !important}
          h1{font-size:36px !important}
          h2{font-size:24px !important}
          div[style*="grid-template-columns: repeat(2"]{grid-template-columns:1fr !important}
        }
      `}</style>
    </MarketingLayout>
  );
}
