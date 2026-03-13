"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useMarketingTheme } from "@/components/marketing/useMarketingTheme";
import { F } from "@/components/marketing/theme";
import {
  ShieldAlert, Layers, Activity, Globe, LayoutDashboard, FileCheck, ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: <Layers size={22} strokeWidth={1.5} />,
    title: "R1-R8 Risk Taxonomy",
    desc: "Comprehensive risk classification across 8 frozen categories covering translation, transaction, economic, and strategic FX exposure.",
  },
  {
    icon: <Activity size={22} strokeWidth={1.5} />,
    title: "Scenario Stress Testing",
    desc: "Parametric and historical VaR, Monte Carlo simulation, and pre-built crisis scenarios for comprehensive risk quantification.",
  },
  {
    icon: <ShieldAlert size={22} strokeWidth={1.5} />,
    title: "Concentration Monitoring",
    desc: "HHI-based concentration analysis, vulnerability ranking, and peak exposure tracking across currency pairs and counterparties.",
  },
  {
    icon: <Globe size={22} strokeWidth={1.5} />,
    title: "Geopolitical Risk",
    desc: "Polisophic corridor scores and event-driven risk adjustments. Monitor political developments that impact currency markets.",
  },
  {
    icon: <LayoutDashboard size={22} strokeWidth={1.5} />,
    title: "Real-Time Dashboards",
    desc: "Customizable widget-based dashboards with 21 widget types. Drag, resize, and configure your risk monitoring surface.",
  },
  {
    icon: <FileCheck size={22} strokeWidth={1.5} />,
    title: "Regulatory Compliance",
    desc: "EMIR, MiFID II, and Dodd-Frank report generation. Export-ready templates for regulatory submissions and internal audits.",
  },
];

export default function RiskManagementPage() {
  const { T, dk, mob } = useMarketingTheme();

  return (
    <MarketingLayout>
      <style>{`
        .rm-feat{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .rm-feat:hover{transform:translateY(-4px);border-color:${dk ? "rgba(129,140,248,0.3)" : "rgba(30,58,95,0.2)"} !important}
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
            background: dk ? "rgba(129,140,248,0.04)" : "rgba(30,58,95,0.03)",
            marginBottom: 24,
          }}>
            <ShieldAlert size={14} /> RISK MANAGEMENT
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: mob ? 36 : 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: dk ? "#eeeef2" : T.accent,
          }}>
            Risk Management
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: mob ? 16 : 18, color: T.textSub,
            maxWidth: 560, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Enterprise risk analytics and governance for risk officers. Quantify, monitor,
            and report on FX exposures with institutional-grade tooling.
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
            Risk teams need to quantify, monitor, and report on FX exposures across the
            organization. Existing tools are either too simple -- spreadsheets that break
            under complexity -- or too complex, requiring enterprise risk platforms with
            6-month implementations and million-dollar budgets. ORDR fills the gap with
            institutional-grade analytics that deploy in days, not quarters.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section style={{ padding: mob ? "48px 20px" : "80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 40px", textAlign: "center", color: T.text,
        }}>
          Risk Intelligence Stack
        </h2>
        <div style={{
          display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: 24,
        }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="rm-feat" style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 14, padding: "28px 24px", boxShadow: T.cardShadow,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(129,140,248,0.08)", color: "#818cf8", marginBottom: 16,
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
            Chief Risk Officers, VP Risk, and Risk Analysts at financial institutions
            and large corporates. Built for teams responsible for enterprise-wide FX
            risk quantification and regulatory reporting.
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
          Upgrade your risk infrastructure
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: T.textSub,
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Deploy enterprise risk analytics without the enterprise implementation timeline.
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
