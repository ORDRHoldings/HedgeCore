"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useMarketingTheme } from "@/components/marketing/useMarketingTheme";
import { F } from "@/components/marketing/theme";
import {
  Umbrella, Clock, ShieldCheck, Coins, FileCheck, Users, FileText, ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: <Clock size={22} strokeWidth={1.5} />,
    title: "Liability-Driven Hedging",
    desc: "Match hedge maturities to insurance liability durations. Tenor-aware optimization aligns hedging horizons with claim payout schedules.",
  },
  {
    icon: <ShieldCheck size={22} strokeWidth={1.5} />,
    title: "Solvency Requirements",
    desc: "Tools to support Solvency II capital optimization and risk reporting. Quantify SCR impact of hedging decisions before execution.",
  },
  {
    icon: <Coins size={22} strokeWidth={1.5} />,
    title: "Currency Risk for Reserves",
    desc: "Monitor and hedge FX exposure on international reserves and premiums. Track coverage ratios across currency-denominated liabilities.",
  },
  {
    icon: <FileCheck size={22} strokeWidth={1.5} />,
    title: "Effectiveness Testing",
    desc: "IFRS 9 prospective effectiveness testing for hedge accounting qualification. Critical terms match and statistical forecast validation.",
  },
  {
    icon: <Users size={22} strokeWidth={1.5} />,
    title: "Governance Controls",
    desc: "Maker-checker workflows meet insurance regulatory requirements. Full Separation of Duties enforcement with escalation paths.",
  },
  {
    icon: <FileText size={22} strokeWidth={1.5} />,
    title: "Comprehensive Reporting",
    desc: "Generate regulatory reports and board-ready summaries. Pre-built templates for Solvency II SFCR, ORSA, and internal risk reports.",
  },
];

export default function InsurancePage() {
  const { T, dk, mob } = useMarketingTheme();

  return (
    <MarketingLayout>
      <style>{`
        .ins-feat{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .ins-feat:hover{transform:translateY(-4px);border-color:${dk ? "rgba(236,72,153,0.3)" : "rgba(30,58,95,0.2)"} !important}
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
            background: dk ? "rgba(236,72,153,0.04)" : "rgba(30,58,95,0.03)",
            marginBottom: 24,
          }}>
            <Umbrella size={14} /> INSURANCE
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: mob ? 36 : 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: dk ? "#eeeef2" : T.accent,
          }}>
            Insurance
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: mob ? 16 : 18, color: T.textSub,
            maxWidth: 560, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Liability hedging and regulatory compliance for insurers. Align hedge
            maturities with liability durations while satisfying Solvency II requirements.
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
            Insurance companies hold international reserves and collect premiums in
            multiple currencies. Mismatched hedge durations create basis risk that
            amplifies under stress scenarios. Solvency II reporting demands precise
            quantification of currency risk impact on capital adequacy, and hedge
            accounting qualification requires ongoing effectiveness documentation.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section style={{ padding: mob ? "48px 20px" : "80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 40px", textAlign: "center", color: T.text,
        }}>
          Insurance Hedging Toolkit
        </h2>
        <div style={{
          display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: 24,
        }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="ins-feat" style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 14, padding: "28px 24px", boxShadow: T.cardShadow,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(236,72,153,0.08)", color: "#ec4899", marginBottom: 16,
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
            Chief Investment Officers, Heads of ALM, and Risk Actuaries at insurance
            companies and reinsurers. Built for teams managing multi-currency reserve
            portfolios under Solvency II or equivalent regulatory frameworks.
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
          Align hedging with liabilities
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: T.textSub,
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Duration-matched hedging with governance controls built for insurance regulation.
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
