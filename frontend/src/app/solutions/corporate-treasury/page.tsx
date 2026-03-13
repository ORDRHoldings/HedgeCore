"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useMarketingTheme } from "@/components/marketing/useMarketingTheme";
import { F } from "@/components/marketing/theme";
import {
  Building2, Calculator, Eye, Shield, FileText, Users, ArrowRight, BarChart3,
} from "lucide-react";

const FEATURES = [
  {
    icon: <Calculator size={22} strokeWidth={1.5} />,
    title: "Automated Hedge Calculation",
    desc: "Import positions, apply policy, generate hedge recommendations automatically. Sub-50ms deterministic computation with full audit trail.",
  },
  {
    icon: <Eye size={22} strokeWidth={1.5} />,
    title: "Cashflow Visibility",
    desc: "Full confirmed and forecast decomposition across monthly buckets with coverage gap identification and maturity profiling.",
  },
  {
    icon: <BarChart3 size={22} strokeWidth={1.5} />,
    title: "Policy Governance",
    desc: "60 pre-built policy templates with maturity profiles, governance tiers, and compliance guardrails. Customize or deploy instantly.",
  },
  {
    icon: <Shield size={22} strokeWidth={1.5} />,
    title: "Audit Trail",
    desc: "WORM-compliant event logging with SHA-256 hash chain satisfies SOX, IFRS 9, and internal audit requirements.",
  },
  {
    icon: <FileText size={22} strokeWidth={1.5} />,
    title: "Report Studio",
    desc: "30+ institutional report templates including Board Pack, CFO Dashboard, Treasury Flash, and regulatory exports.",
  },
  {
    icon: <Users size={22} strokeWidth={1.5} />,
    title: "4-Eyes Approval",
    desc: "Separation of duties enforcement prevents unauthorized hedge execution. Maker-checker workflow with full provenance tracking.",
  },
];

export default function CorporateTreasuryPage() {
  const { T, dk, mob } = useMarketingTheme();

  return (
    <MarketingLayout>
      <style>{`
        .ct-feat{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .ct-feat:hover{transform:translateY(-4px);border-color:${dk ? "rgba(34,211,238,0.25)" : "rgba(30,58,95,0.2)"} !important}
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
            background: dk ? "rgba(34,211,238,0.03)" : "rgba(30,58,95,0.03)",
            marginBottom: 24,
          }}>
            <Building2 size={14} /> CORPORATE TREASURY
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: mob ? 36 : 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: dk ? "#eeeef2" : T.accent,
          }}>
            Corporate Treasury
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: mob ? 16 : 18, color: T.textSub,
            maxWidth: 560, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            End-to-end FX exposure management for treasury teams. From position import
            to hedge execution, with institutional governance at every step.
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
            Treasury teams at multinational corporations face complex FX exposures across
            dozens of currency pairs, with confirmed and forecast cashflows spanning 12+ months.
            Manual spreadsheet-based hedging is error-prone, unauditable, and fails to meet
            IFRS 9 documentation requirements. When audit season arrives, weeks are lost
            reconstructing decisions that should have been captured automatically.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section style={{ padding: mob ? "48px 20px" : "80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 40px", textAlign: "center", color: T.text,
        }}>
          How ORDR Solves It
        </h2>
        <div style={{
          display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: 24,
        }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="ct-feat"
              style={{
                background: T.bgCard, border: `1px solid ${T.border}`,
                borderRadius: 14, padding: "28px 24px", boxShadow: T.cardShadow,
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: dk ? T.accentSoft : T.accentSoft,
                color: T.accent, marginBottom: 16,
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
                fontFamily: F.ui, fontSize: 14, color: T.textSub,
                lineHeight: 1.6, margin: 0,
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
            VP Treasury, Treasury Analysts, and FX Managers at corporations with $10M+
            annual FX exposure. Designed for teams managing confirmed and forecast
            cashflows across multiple entities and jurisdictions.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: mob ? "48px 20px 64px" : "64px 48px 96px",
        textAlign: "center",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 28 : 40, fontWeight: 800,
          letterSpacing: "-0.02em", margin: "0 0 16px",
          color: dk ? "#eeeef2" : T.accent,
        }}>
          Ready to modernize your treasury?
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: T.textSub,
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          See how ORDR replaces spreadsheets with deterministic, governed hedge computation.
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
