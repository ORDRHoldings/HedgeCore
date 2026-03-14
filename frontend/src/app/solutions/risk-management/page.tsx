"use client";

import Link from "next/link";
import { ChevronLeft, ArrowRight, Layers, Activity, FlaskConical, Users, Network, Monitor, BarChart3, Shield } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const CHALLENGES = [
  { title: "Fragmented Risk Data", desc: "Risk exposures scattered across systems, spreadsheets, and email threads make enterprise-wide risk quantification unreliable." },
  { title: "Lack of Real-Time Monitoring", desc: "Stale risk dashboards and batch-processed reports leave risk officers blind to intraday exposure changes and market moves." },
  { title: "Scenario Analysis Gaps", desc: "Ad hoc stress testing without systematic scenario frameworks produces inconsistent results that cannot withstand audit scrutiny." },
  { title: "Governance Complexity", desc: "Multi-level approval workflows, separation of duties, and escalation policies require infrastructure that manual processes cannot enforce." },
];

const CAPABILITIES = [
  { icon: <Layers size={20} />, title: "R1-R8 Risk Taxonomy", desc: "Structured risk classification across 8 dimensions with quantified exposure decomposition and attribution.", product: "ORDR Portfolio" },
  { icon: <Activity size={20} />, title: "Real-Time Market Data", desc: "Live FX spot rates, forward curves, and volatility surfaces with configurable alerting and threshold monitoring.", product: "ORDR Market" },
  { icon: <FlaskConical size={20} />, title: "Scenario Studio", desc: "Configurable shock packs, historical VaR, expected shortfall, and Monte Carlo simulation with full audit trail.", product: "ORDR Labs" },
  { icon: <Users size={20} />, title: "4-Eyes Governance", desc: "Maker-checker workflows with separation of duties enforcement, RBAC, and tamper-evident approval chains.", product: "ORDR Treasury" },
];

export default function RiskManagementPage() {
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
          Risk Management
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 560, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Enterprise risk quantification, monitoring, and governance for
          institutional risk teams.
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
          Elevate your risk infrastructure
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Unified risk quantification with institutional governance built in.
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
