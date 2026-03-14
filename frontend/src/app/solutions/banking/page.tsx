"use client";

import Link from "next/link";
import { ChevronLeft, ArrowRight, Scale, ShieldCheck, TrendingUp, BookOpen, Lock, BarChart3, FileText, Workflow } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const CHALLENGES = [
  { title: "FX Desk Compliance", desc: "Regulatory expectations for audit infrastructure, trade documentation, and operational controls require purpose-built systems, not spreadsheets." },
  { title: "Audit Infrastructure", desc: "SOX, MiFID II, and EMIR mandate tamper-evident record keeping with complete decision provenance for every trade and hedge decision." },
  { title: "Real-Time Pricing", desc: "Professional FX desks require institutional-grade charting, real-time market data, and multi-source pricing infrastructure." },
  { title: "Regulatory Requirements", desc: "EMIR reporting, MiFID II best execution, and Basel capital adequacy demand systematic compliance infrastructure across the trading lifecycle." },
];

const CAPABILITIES = [
  { icon: <Lock size={20} />, title: "WORM Audit Trail", desc: "Append-only, SHA-256 hash-chained event log satisfies SOX, EMIR, and MiFID II record-keeping requirements.", product: "ORDR Treasury" },
  { icon: <TrendingUp size={20} />, title: "Professional Charting", desc: "Canvas 2D charting engine with 23 technical indicators, drawing tools, and multi-timeframe analysis.", product: "ORDR Market" },
  { icon: <BookOpen size={20} />, title: "Regulatory Reference", desc: "ISDA definitions, EMIR trade reporting guidance, and hedge accounting standards reference library.", product: "ORDR HedgeWiki" },
  { icon: <Workflow size={20} />, title: "Execution Pipeline", desc: "Tri-state governance pipeline (Sandbox, Staging, Ledger) with 4-eyes approval and separation of duties.", product: "ORDR Treasury" },
];

export default function BankingPage() {
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
          Banking &amp; Capital Markets
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 560, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Institutional FX infrastructure for banks and dealers with
          compliance-grade audit trails and governance.
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
          Institutional-grade FX infrastructure
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.7)",
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Built for the compliance and governance standards of regulated banks.
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
