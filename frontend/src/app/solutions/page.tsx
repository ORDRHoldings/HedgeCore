"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F, SOLUTIONS } from "@/components/marketing/theme";
import {
  Building2, ShieldAlert, BarChart3, Landmark, Umbrella, Flame,
  ArrowRight,
} from "lucide-react";

const ICONS: Record<string, React.ReactNode> = {
  "corporate-treasury": <Building2 size={24} strokeWidth={1.5} />,
  "risk-management": <ShieldAlert size={24} strokeWidth={1.5} />,
  "asset-management": <BarChart3 size={24} strokeWidth={1.5} />,
  "banking": <Landmark size={24} strokeWidth={1.5} />,
  "insurance": <Umbrella size={24} strokeWidth={1.5} />,
  "energy": <Flame size={24} strokeWidth={1.5} />,
};

export default function SolutionsPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{
        padding: "100px 48px 64px",
        textAlign: "center",
        background: C.bg,
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{
            fontFamily: F.heading, fontSize: 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: C.accent,
          }}>
            Solutions by Industry
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: 18, color: C.textSub,
            maxWidth: 560, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Purpose-built FX risk management for your sector. Every solution leverages the
            same deterministic engine, institutional governance, and audit infrastructure.
          </p>
        </div>
      </section>

      {/* Solutions Grid */}
      <section style={{
        padding: "80px 48px",
        maxWidth: 1100, margin: "0 auto",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
        }}>
          {SOLUTIONS.map((s) => (
            <Link
              key={s.slug}
              href={`/solutions/${s.slug}`}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "36px 32px",
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: C.accentLight, color: C.accent,
                marginBottom: 20,
              }}>
                {ICONS[s.slug]}
              </div>
              <h3 style={{
                fontFamily: F.heading, fontSize: 20, fontWeight: 700,
                margin: "0 0 10px", letterSpacing: "-0.01em", color: C.text,
              }}>
                {s.name}
              </h3>
              <p style={{
                fontFamily: F.ui, fontSize: 14, color: C.textSub,
                lineHeight: 1.6, margin: "0 0 20px",
              }}>
                {s.desc}
              </p>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: F.ui, fontSize: 13, fontWeight: 600,
                color: C.accent,
              }}>
                Learn More <ArrowRight size={14} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{
        padding: "80px 48px",
        textAlign: "center",
        background: C.bgAlt,
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 40, fontWeight: 800,
          letterSpacing: "-0.02em", margin: "0 0 16px",
          color: C.accent,
        }}>
          Not sure which solution fits?
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: C.textSub,
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Talk to our team and we will help you identify the right configuration
          for your organization.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" style={{
            fontFamily: F.ui, fontSize: 15, fontWeight: 600,
            color: "#fff", background: C.accent,
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 8,
          }}>
            Get Started <ArrowRight size={16} />
          </Link>
          <Link href="/contact" style={{
            fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.textSub,
            padding: "13px 32px", borderRadius: 8, textDecoration: "none",
            border: `1.5px solid ${C.border}`,
          }}>
            Contact Sales
          </Link>
        </div>
      </section>

      <style>{`
        @media(max-width:768px){
          section{padding:60px 20px !important}
          h1{font-size:36px !important}
          h2{font-size:28px !important}
          div[style*="grid-template-columns: repeat(3"]{grid-template-columns:1fr !important}
        }
      `}</style>
    </MarketingLayout>
  );
}
