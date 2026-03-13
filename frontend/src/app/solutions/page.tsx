"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useMarketingTheme } from "@/components/marketing/useMarketingTheme";
import { F } from "@/components/marketing/theme";
import {
  Building2, ShieldAlert, BarChart3, Landmark, Umbrella, Flame,
  ArrowRight,
} from "lucide-react";

const SOLUTIONS = [
  {
    icon: <Building2 size={28} strokeWidth={1.5} />,
    name: "Corporate Treasury",
    slug: "corporate-treasury",
    desc: "End-to-end FX exposure management for multinational treasury teams with policy governance and audit-ready reporting.",
    color: "#22d3ee",
  },
  {
    icon: <ShieldAlert size={28} strokeWidth={1.5} />,
    name: "Risk Management",
    slug: "risk-management",
    desc: "Enterprise risk analytics, R1-R8 taxonomy, scenario stress testing, and real-time dashboards for risk officers.",
    color: "#818cf8",
  },
  {
    icon: <BarChart3 size={28} strokeWidth={1.5} />,
    name: "Asset Management",
    slug: "asset-management",
    desc: "Portfolio hedging, risk decomposition, performance attribution, and fund-level compliance for asset managers.",
    color: "#34d399",
  },
  {
    icon: <Landmark size={28} strokeWidth={1.5} />,
    name: "Banking & Financial Services",
    slug: "banking",
    desc: "Institutional trading compliance, WORM audit infrastructure, RBAC enforcement, and regulatory export generation.",
    color: "#f59e0b",
  },
  {
    icon: <Umbrella size={28} strokeWidth={1.5} />,
    name: "Insurance",
    slug: "insurance",
    desc: "Liability-driven hedging, Solvency II support, effectiveness testing, and maker-checker governance for insurers.",
    color: "#ec4899",
  },
  {
    icon: <Flame size={28} strokeWidth={1.5} />,
    name: "Energy & Commodities",
    slug: "energy",
    desc: "Commodity FX overlay, multi-tenor roll programs, basis risk monitoring, and crisis scenario testing.",
    color: "#fb923c",
  },
];

export default function SolutionsPage() {
  const { T, dk, mob } = useMarketingTheme();

  return (
    <MarketingLayout>
      <style>{`
        .sol-card{transition:all .3s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden}
        .sol-card:hover{transform:translateY(-6px);box-shadow:${dk
          ? "0 16px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,211,238,0.15)"
          : "0 16px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(30,58,95,0.15)"} !important}
        .sol-card:hover .sol-arrow{opacity:1;transform:translateX(0)}
      `}</style>

      {/* Hero */}
      <section style={{
        padding: mob ? "80px 20px 48px" : "100px 48px 64px",
        textAlign: "center",
        position: "relative",
        background: T.heroGrad,
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px",
            border: `1px solid ${T.border}`, borderRadius: 100,
            fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: T.textDim,
            background: dk ? "rgba(34,211,238,0.03)" : "rgba(30,58,95,0.03)",
            marginBottom: 24,
          }}>
            SOLUTIONS
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: mob ? 36 : 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: dk ? "#eeeef2" : T.accent,
          }}>
            Solutions by Industry
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: mob ? 16 : 18, color: T.textSub,
            maxWidth: 560, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Purpose-built FX risk management for your sector. Every solution leverages the
            same deterministic engine, institutional governance, and audit infrastructure.
          </p>
        </div>
      </section>

      {/* Solutions Grid */}
      <section style={{
        padding: mob ? "48px 20px" : "80px 48px",
        maxWidth: 1200, margin: "0 auto",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)",
          gap: 24,
        }}>
          {SOLUTIONS.map((s) => (
            <Link
              key={s.slug}
              href={`/solutions/${s.slug}`}
              className="sol-card"
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: 16,
                padding: mob ? "28px 24px" : "36px 32px",
                boxShadow: T.cardShadow,
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: `${s.color}12`, color: s.color,
                marginBottom: 20,
              }}>
                {s.icon}
              </div>
              <h3 style={{
                fontFamily: F.heading, fontSize: 20, fontWeight: 700,
                margin: "0 0 10px", letterSpacing: "-0.01em", color: T.text,
              }}>
                {s.name}
              </h3>
              <p style={{
                fontFamily: F.ui, fontSize: 14, color: T.textSub,
                lineHeight: 1.6, margin: 0,
              }}>
                {s.desc}
              </p>
              <div
                className="sol-arrow"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  marginTop: 20, fontFamily: F.ui, fontSize: 13, fontWeight: 600,
                  color: s.color, opacity: 0.7,
                  transform: "translateX(-4px)",
                  transition: "all .3s",
                }}
              >
                Learn More <ArrowRight size={14} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{
        padding: mob ? "48px 20px 64px" : "64px 48px 96px",
        textAlign: "center",
        background: T.sectionAlt,
        borderTop: `1px solid ${T.border}`,
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 28 : 40, fontWeight: 800,
          letterSpacing: "-0.02em", margin: "0 0 16px",
          color: dk ? "#eeeef2" : T.accent,
        }}>
          Not sure which solution fits?
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: T.textSub,
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Talk to our team and we will help you identify the right configuration
          for your organization.
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
