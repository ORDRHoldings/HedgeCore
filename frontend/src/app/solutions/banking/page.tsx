"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useMarketingTheme } from "@/components/marketing/useMarketingTheme";
import { F } from "@/components/marketing/theme";
import {
  Landmark, GitBranch, Shield, Lock, FileOutput, Code2, Users, ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: <GitBranch size={22} strokeWidth={1.5} />,
    title: "Trade Lifecycle Management",
    desc: "Full position tracking from NEW through HEDGED with state machine enforcement. Every transition validated and audit-logged.",
  },
  {
    icon: <Shield size={22} strokeWidth={1.5} />,
    title: "Audit Infrastructure",
    desc: "SHA-256 hash chain, WORM tables, and tamper-evident event logging. Cryptographic proof of every decision and calculation.",
  },
  {
    icon: <Lock size={22} strokeWidth={1.5} />,
    title: "RBAC Enforcement",
    desc: "9 roles, 41 permissions, fail-closed authorization with Separation of Duties. No unauthorized access, no exceptions.",
  },
  {
    icon: <FileOutput size={22} strokeWidth={1.5} />,
    title: "Regulatory Exports",
    desc: "EMIR Article 9 XML, MiFID II RTS 25, Dodd-Frank Title VII, and ISDA Confirmations. Pre-formatted for submission.",
  },
  {
    icon: <Code2 size={22} strokeWidth={1.5} />,
    title: "API-First Architecture",
    desc: "219+ REST endpoints with OpenAPI documentation. Integrate with existing banking infrastructure via well-documented APIs.",
  },
  {
    icon: <Users size={22} strokeWidth={1.5} />,
    title: "Multi-Tenant Isolation",
    desc: "Tenant isolation with per-tenant hash chains and branch-level access control. Data segregation meets banking requirements.",
  },
];

export default function BankingPage() {
  const { T, dk, mob } = useMarketingTheme();

  return (
    <MarketingLayout>
      <style>{`
        .bk-feat{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .bk-feat:hover{transform:translateY(-4px);border-color:${dk ? "rgba(245,158,11,0.3)" : "rgba(30,58,95,0.2)"} !important}
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
            background: dk ? "rgba(245,158,11,0.04)" : "rgba(30,58,95,0.03)",
            marginBottom: 24,
          }}>
            <Landmark size={14} /> BANKING
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: mob ? 36 : 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: dk ? "#eeeef2" : T.accent,
          }}>
            Banking &amp; Financial Services
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: mob ? 16 : 18, color: T.textSub,
            maxWidth: 580, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Institutional trading compliance and audit infrastructure. Purpose-built
            for the governance, auditability, and regulatory demands of banking.
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
            Banks require complete auditability of every trade decision, cryptographic
            proof of data integrity, and fail-closed access controls that satisfy
            regulators across jurisdictions. Most hedging tools were built for corporates,
            not for the stringent compliance environment of financial institutions.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section style={{ padding: mob ? "48px 20px" : "80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 40px", textAlign: "center", color: T.text,
        }}>
          Banking-Grade Infrastructure
        </h2>
        <div style={{
          display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: 24,
        }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="bk-feat" style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 14, padding: "28px 24px", boxShadow: T.cardShadow,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(245,158,11,0.08)", color: "#f59e0b", marginBottom: 16,
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
            Heads of FX Trading, Compliance Officers, and Technology teams at banks
            and financial services firms. Designed for institutions that require
            cryptographic audit proof and multi-jurisdictional regulatory compliance.
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
          Built for banking compliance
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: T.textSub,
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Deploy audit-proof hedge governance that satisfies the most demanding regulators.
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
