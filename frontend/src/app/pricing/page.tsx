"use client";

import { useState } from "react";
import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";
import { Check, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

const TIERS = [
  {
    name: "Essentials",
    price: "$299",
    period: "/mo",
    desc: "For small treasury teams getting started with systematic hedging",
    features: [
      "5 users",
      "3 currency pairs",
      "Basic policy engine",
      "Position management",
      "Email support",
    ],
    cta: "Get Started",
    href: "/auth/login",
    highlight: false,
  },
  {
    name: "Professional",
    price: "$799",
    period: "/mo",
    desc: "For active treasury teams managing hedging programs at scale",
    features: [
      "25 users",
      "Unlimited currency pairs",
      "Full policy engine (60 templates)",
      "Priority support",
      "ORDR Market + Labs access",
      "Scenario stress testing",
      "Report Studio",
    ],
    cta: "Start Free Trial",
    href: "/auth/login",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For institutions requiring governance, compliance, and custom integration",
    features: [
      "Unlimited users",
      "Dedicated instance",
      "SLA with guaranteed uptime",
      "Custom integrations",
      "All products included",
      "4-eyes governance",
      "WORM audit trail",
      "API access (219+ endpoints)",
    ],
    cta: "Contact Sales",
    href: "/contact",
    highlight: false,
  },
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
    a: "Yes. Annual billing saves 20% compared to monthly billing on both Essentials and Professional plans.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your data is retained for 90 days after cancellation. You can export all positions, calculations, and audit logs at any time before or after cancellation.",
  },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
            Pricing
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: 18, color: C.textSub,
            maxWidth: 480, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Transparent pricing for teams of every size.
          </p>
        </div>
      </section>

      {/* Tier Cards */}
      <section style={{
        padding: "80px 48px",
        maxWidth: 1100, margin: "0 auto",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24, alignItems: "start",
        }}>
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              style={{
                background: C.bg,
                border: tier.highlight
                  ? `2px solid ${C.accent}`
                  : `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "36px 28px",
                position: "relative",
              }}
            >
              {tier.highlight && (
                <div style={{
                  position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                  background: C.accent, color: "#fff",
                  fontFamily: F.mono, fontSize: 12, fontWeight: 700,
                  padding: "4px 16px", borderRadius: 100, letterSpacing: "0.06em",
                }}>
                  MOST POPULAR
                </div>
              )}
              <h3 style={{
                fontFamily: F.heading, fontSize: 20, fontWeight: 700,
                margin: "0 0 4px", color: C.text,
              }}>
                {tier.name}
              </h3>
              <p style={{
                fontFamily: F.ui, fontSize: 14, color: C.textSub, margin: "0 0 20px",
              }}>
                {tier.desc}
              </p>
              <div style={{ marginBottom: 24 }}>
                <span style={{
                  fontFamily: F.heading, fontSize: 44, fontWeight: 800,
                  color: C.text, letterSpacing: "-0.03em",
                }}>
                  {tier.price}
                </span>
                {tier.period && (
                  <span style={{
                    fontFamily: F.ui, fontSize: 16, color: C.textMuted,
                  }}>
                    {tier.period}
                  </span>
                )}
              </div>
              <Link href={tier.href} style={{
                display: "block", textAlign: "center",
                fontFamily: F.ui, fontSize: 15, fontWeight: 600,
                color: tier.highlight ? "#fff" : C.text,
                background: tier.highlight ? C.accent : "transparent",
                border: tier.highlight ? "none" : `1.5px solid ${C.border}`,
                padding: "12px 20px", borderRadius: 8, textDecoration: "none",
                marginBottom: 28,
              }}>
                {tier.cta}
              </Link>
              <div style={{
                borderTop: `1px solid ${C.border}`, paddingTop: 20,
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                {tier.features.map((f) => (
                  <div key={f} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  }}>
                    <Check size={15} style={{ color: "#16a34a", flexShrink: 0 }} />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{
        padding: "40px 48px 96px",
        maxWidth: 720, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 32px", textAlign: "center", color: C.text,
        }}>
          Frequently Asked Questions
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FAQ.map((item, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${C.border}`, borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "space-between", padding: "16px 20px",
                  background: "transparent", border: "none", cursor: "pointer",
                  fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text,
                  textAlign: "left",
                }}
              >
                {item.q}
                {openFaq === i
                  ? <ChevronUp size={16} color={C.textMuted} />
                  : <ChevronDown size={16} color={C.textMuted} />}
              </button>
              {openFaq === i && (
                <div style={{
                  padding: "0 20px 16px",
                  fontFamily: F.ui, fontSize: 14, color: C.textSub, lineHeight: 1.7,
                }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <style>{`
        @media(max-width:768px){
          section{padding:60px 20px !important}
          h1{font-size:36px !important}
          h2{font-size:24px !important}
          div[style*="grid-template-columns: repeat(3"]{grid-template-columns:1fr !important}
        }
      `}</style>
    </MarketingLayout>
  );
}
