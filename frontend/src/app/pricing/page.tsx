"use client";

import { useState } from "react";
import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useMarketingTheme } from "@/components/marketing/useMarketingTheme";
import { F } from "@/components/marketing/theme";
import {
  Check, X, ArrowRight, ChevronDown, ChevronUp, Zap,
} from "lucide-react";

const TIERS = [
  {
    name: "Starter",
    price: "$0",
    period: "/mo",
    desc: "For individuals exploring hedge analytics",
    features: [
      "1 user",
      "10 positions",
      "Basic engine",
      "Manual data entry",
      "Community support",
    ],
    cta: "Get Started Free",
    href: "/auth/login",
    popular: false,
    color: "",
  },
  {
    name: "Professional",
    price: "$499",
    period: "/mo",
    desc: "For treasury teams managing active hedging programs",
    features: [
      "5 users",
      "Unlimited positions",
      "Full engine + scenarios",
      "Market data feeds",
      "Policy engine (60 templates)",
      "Report Studio",
      "Email support",
    ],
    cta: "Start Free Trial",
    href: "/auth/login",
    popular: true,
    color: "#22d3ee",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For institutions requiring governance and compliance",
    features: [
      "Unlimited users",
      "Full platform access",
      "4-eyes governance",
      "WORM audit trail",
      "RBAC (9 roles, 41 permissions)",
      "API access (219+ endpoints)",
      "Custom integrations",
      "Dedicated support + SLA",
    ],
    cta: "Contact Sales",
    href: "/contact",
    popular: false,
    color: "",
  },
];

const COMPARISON = [
  { feature: "Users", starter: "1", pro: "5", enterprise: "Unlimited" },
  { feature: "Positions", starter: "10", pro: "Unlimited", enterprise: "Unlimited" },
  { feature: "Hedge Engine", starter: "Basic", pro: "Full", enterprise: "Full" },
  { feature: "Scenario Stress Testing", starter: false, pro: true, enterprise: true },
  { feature: "Policy Engine", starter: false, pro: true, enterprise: true },
  { feature: "Market Data Feeds", starter: false, pro: true, enterprise: true },
  { feature: "Report Studio", starter: false, pro: true, enterprise: true },
  { feature: "4-Eyes Governance", starter: false, pro: false, enterprise: true },
  { feature: "WORM Audit Trail", starter: false, pro: false, enterprise: true },
  { feature: "RBAC", starter: false, pro: false, enterprise: true },
  { feature: "API Access", starter: false, pro: false, enterprise: true },
  { feature: "Custom Integrations", starter: false, pro: false, enterprise: true },
  { feature: "SLA", starter: false, pro: false, enterprise: true },
];

const FAQ = [
  {
    q: "Can I switch plans later?",
    a: "Yes. You can upgrade or downgrade at any time. When upgrading, the difference is prorated. When downgrading, the change takes effect at the next billing cycle.",
  },
  {
    q: "Is there a free trial for Professional?",
    a: "Yes. The Professional plan includes a 14-day free trial with full access to all features. No credit card required to start.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards and bank transfers for annual billing. Enterprise customers can pay via invoice with NET-30 terms.",
  },
  {
    q: "Do you offer annual billing discounts?",
    a: "Yes. Annual billing on the Professional plan saves 20% compared to monthly billing. Contact sales for Enterprise annual pricing.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your data is retained for 90 days after cancellation. You can export all positions, calculations, and audit logs at any time before or after cancellation.",
  },
];

export default function PricingPage() {
  const { T, dk, mob } = useMarketingTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const renderCell = (val: boolean | string) => {
    if (typeof val === "string") {
      return <span style={{ fontFamily: F.mono, fontSize: 13, color: T.text }}>{val}</span>;
    }
    return val
      ? <Check size={16} style={{ color: T.green }} />
      : <X size={16} style={{ color: T.textDim, opacity: 0.4 }} />;
  };

  return (
    <MarketingLayout>
      <style>{`
        .pr-tier{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .pr-tier:hover{transform:translateY(-6px);box-shadow:${dk
          ? "0 20px 60px rgba(0,0,0,0.5)" : "0 20px 60px rgba(0,0,0,0.08)"} !important}
        .pr-faq{transition:all .2s}
        .pr-faq:hover{background:${dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)"} !important}
      `}</style>

      {/* Hero */}
      <section style={{
        padding: mob ? "80px 20px 48px" : "100px 48px 64px",
        textAlign: "center", background: T.heroGrad,
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px",
            border: `1px solid ${T.border}`, borderRadius: 100,
            fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: T.textDim,
            background: dk ? "rgba(34,211,238,0.03)" : "rgba(30,58,95,0.03)",
            marginBottom: 24,
          }}>
            PRICING
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: mob ? 36 : 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: dk ? "#eeeef2" : T.accent,
          }}>
            Pricing
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: mob ? 16 : 18, color: T.textSub,
            maxWidth: 480, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Transparent pricing for teams of every size. Start free, scale with your hedging needs.
          </p>
        </div>
      </section>

      {/* Tier Cards */}
      <section style={{
        padding: mob ? "48px 16px" : "80px 48px",
        maxWidth: 1100, margin: "0 auto",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)",
          gap: 24, alignItems: "start",
        }}>
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className="pr-tier"
              style={{
                background: T.bgCard,
                border: tier.popular
                  ? `2px solid ${dk ? "#22d3ee" : T.accent}`
                  : `1px solid ${T.border}`,
                borderRadius: 16,
                padding: "36px 28px",
                boxShadow: T.cardShadow,
                position: "relative",
              }}
            >
              {tier.popular && (
                <div style={{
                  position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                  background: dk ? "#22d3ee" : T.accent, color: dk ? "#000" : "#fff",
                  fontFamily: F.mono, fontSize: 12, fontWeight: 700,
                  padding: "4px 16px", borderRadius: 100, letterSpacing: "0.06em",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <Zap size={12} /> MOST POPULAR
                </div>
              )}
              <h3 style={{
                fontFamily: F.heading, fontSize: 20, fontWeight: 700,
                margin: "0 0 4px", color: T.text,
              }}>
                {tier.name}
              </h3>
              <p style={{
                fontFamily: F.ui, fontSize: 14, color: T.textSub, margin: "0 0 20px",
              }}>
                {tier.desc}
              </p>
              <div style={{ marginBottom: 24 }}>
                <span style={{
                  fontFamily: F.heading, fontSize: 44, fontWeight: 800,
                  color: T.text, letterSpacing: "-0.03em",
                }}>
                  {tier.price}
                </span>
                {tier.period && (
                  <span style={{
                    fontFamily: F.ui, fontSize: 16, color: T.textDim,
                  }}>
                    {tier.period}
                  </span>
                )}
              </div>
              <Link href={tier.href} style={{
                display: "block", textAlign: "center",
                fontFamily: F.ui, fontSize: 15, fontWeight: 600,
                color: tier.popular ? (dk ? "#000" : "#fff") : T.text,
                background: tier.popular ? (dk ? "#22d3ee" : T.accent) : "transparent",
                border: tier.popular ? "none" : `1.5px solid ${T.border}`,
                padding: "12px 20px", borderRadius: 10, textDecoration: "none",
                marginBottom: 28,
              }}>
                {tier.cta}
              </Link>
              <div style={{
                borderTop: `1px solid ${T.border}`, paddingTop: 20,
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                {tier.features.map((f) => (
                  <div key={f} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    fontFamily: F.ui, fontSize: 14, color: T.textSub,
                  }}>
                    <Check size={15} style={{ color: T.green, flexShrink: 0 }} />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section style={{
        padding: mob ? "32px 16px 48px" : "40px 48px 80px",
        maxWidth: 900, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 32px", textAlign: "center", color: T.text,
        }}>
          Feature Comparison
        </h2>
        <div style={{
          background: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: 14, overflow: "hidden", boxShadow: T.cardShadow,
        }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1.4fr 0.8fr 0.8fr 0.8fr" : "2fr 1fr 1fr 1fr",
            padding: "14px 20px",
            background: T.sectionAlt, borderBottom: `1px solid ${T.border}`,
          }}>
            <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: T.textDim, letterSpacing: "0.08em" }}>FEATURE</span>
            <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: T.textDim, letterSpacing: "0.08em", textAlign: "center" }}>STARTER</span>
            <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: T.textDim, letterSpacing: "0.08em", textAlign: "center" }}>PRO</span>
            <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: T.textDim, letterSpacing: "0.08em", textAlign: "center" }}>ENTERPRISE</span>
          </div>
          {/* Rows */}
          {COMPARISON.map((row, i) => (
            <div key={row.feature} style={{
              display: "grid",
              gridTemplateColumns: mob ? "1.4fr 0.8fr 0.8fr 0.8fr" : "2fr 1fr 1fr 1fr",
              padding: "12px 20px", alignItems: "center",
              borderBottom: i < COMPARISON.length - 1 ? `1px solid ${T.border}` : "none",
            }}>
              <span style={{ fontFamily: F.ui, fontSize: 14, color: T.text }}>{row.feature}</span>
              <div style={{ textAlign: "center" }}>{renderCell(row.starter)}</div>
              <div style={{ textAlign: "center" }}>{renderCell(row.pro)}</div>
              <div style={{ textAlign: "center" }}>{renderCell(row.enterprise)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{
        padding: mob ? "32px 16px 64px" : "40px 48px 96px",
        maxWidth: 720, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 32px", textAlign: "center", color: T.text,
        }}>
          Frequently Asked Questions
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {FAQ.map((item, i) => (
            <div
              key={i}
              className="pr-faq"
              style={{
                border: `1px solid ${T.border}`, borderRadius: 10,
                overflow: "hidden", marginBottom: 8,
              }}
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "space-between", padding: "16px 20px",
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: T.text,
                  textAlign: "left",
                }}
              >
                {item.q}
                {openFaq === i ? <ChevronUp size={16} color={T.textDim} /> : <ChevronDown size={16} color={T.textDim} />}
              </button>
              {openFaq === i && (
                <div style={{
                  padding: "0 20px 16px",
                  fontFamily: F.ui, fontSize: 14, color: T.textSub, lineHeight: 1.7,
                }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
