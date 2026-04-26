"use client";
/* eslint-disable no-restricted-syntax -- public light-theme marketing page outside the dark-terminal design tokens */

import Link from "next/link";
import { useState } from "react";
import { Check, Minus, ChevronDown, ChevronUp } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

const ACCENT = C.accent;

interface Tier {
  name: string;
  tagline: string;
  price: string;
  priceCadence: string;
  implementation: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  meta: { label: string; value: string }[];
}

const TIERS: Tier[] = [
  {
    name: "Starter",
    tagline: "Proof of value",
    price: "$24,000",
    priceCadence: "/ year",
    implementation: "$0 (self-serve)",
    cta: { label: "Start trial", href: "/contact?plan=starter" },
    meta: [
      { label: "Legal entities", value: "1" },
      { label: "Trades / yr",    value: "500" },
      { label: "Users",          value: "5" },
      { label: "Support SLA",    value: "24h email" },
    ],
  },
  {
    name: "Professional",
    tagline: "Most treasuries pick this",
    price: "$72,000",
    priceCadence: "/ year",
    implementation: "$12,000 one-time",
    cta: { label: "Book a demo", href: "/contact?plan=professional" },
    highlight: true,
    meta: [
      { label: "Legal entities", value: "Up to 5" },
      { label: "Trades / yr",    value: "5,000" },
      { label: "Users",          value: "25" },
      { label: "Support SLA",    value: "8h business hours" },
    ],
  },
  {
    name: "Enterprise",
    tagline: "Strategic + regulated",
    price: "From $144,000",
    priceCadence: "/ year",
    implementation: "$24,000–$60,000",
    cta: { label: "Contact sales", href: "/contact?plan=enterprise" },
    meta: [
      { label: "Legal entities", value: "Unlimited" },
      { label: "Trades / yr",    value: "Unlimited" },
      { label: "Users",          value: "Unlimited" },
      { label: "Support SLA",    value: "4h, 99.9% uptime" },
    ],
  },
];

interface FeatureRow {
  feature: string;
  starter: boolean | string;
  professional: boolean | string;
  enterprise: boolean | string;
  group?: string;
}

const FEATURES: FeatureRow[] = [
  { feature: "Hedge accounting (IFRS 9 / ASC 815)", starter: true,  professional: true,  enterprise: true,  group: "Core" },
  { feature: "Audit Lab + SHA-256 hash chain",      starter: true,  professional: true,  enterprise: true },
  { feature: "4-eyes maker/checker governance",     starter: true,  professional: true,  enterprise: true },
  { feature: "Position Desk + Cash Positions",      starter: true,  professional: true,  enterprise: true },
  { feature: "Reports Studio",                       starter: true,  professional: true,  enterprise: true },

  { feature: "ERP connectors (5 — live)",            starter: false, professional: true,  enterprise: true,  group: "Integrations" },
  { feature: "EMIR / MiFID II / CFTC reporting",     starter: false, professional: true,  enterprise: true },
  { feature: "Pre-Trade TCA",                        starter: false, professional: true,  enterprise: true },
  { feature: "Counterparty Hub",                     starter: false, professional: true,  enterprise: true },
  { feature: "Natural Hedging",                      starter: false, professional: true,  enterprise: true },
  { feature: "SWIFT MT103 + ISO 20022 pain.001",     starter: false, professional: true,  enterprise: true },

  { feature: "Custom SSO (SAML / OIDC)",             starter: false, professional: false, enterprise: true,  group: "Enterprise extras" },
  { feature: "Dedicated tenant database",            starter: false, professional: false, enterprise: true },
  { feature: "SOC 2 Type II evidence pack",          starter: false, professional: false, enterprise: true },
  { feature: "White-glove onboarding",               starter: false, professional: false, enterprise: true },
  { feature: "Source code escrow",                   starter: false, professional: false, enterprise: true },
];

interface Faq { q: string; a: string; }

const FAQS: Faq[] = [
  { q: "Why no per-user pricing?",
    a: "Treasury teams shouldn't be punished for involving their auditor or controller. Seat-count caps are generous; we don't haggle on whether a person is a 'user.'" },
  { q: "Is there a free tier?",
    a: "No, but Starter is a 90-day no-commitment trial with full functionality on a single entity. If it doesn't pay for itself in your first audit cycle, walk away." },
  { q: "Can I switch tiers mid-contract?",
    a: "Upgrade at any time, prorated. Downgrade at renewal." },
  { q: "What's the implementation timeline?",
    a: "Starter: 1 week, self-serve. Professional: 90 days from kickoff to first live hedge. Enterprise: ~120 days with custom integrations." },
  { q: "Do you charge for ERP connectors?",
    a: "No. All five ERP connectors (QuickBooks, Xero, NetSuite, Sage, Dynamics 365) are included on Professional and Enterprise." },
  { q: "What's the cancellation policy?",
    a: "Starter: cancel any time, prorated refund. Professional / Enterprise: 60-day notice before renewal." },
  { q: "Do you negotiate?",
    a: "On Enterprise pricing for multi-year, multi-entity, or strategic deals — yes. On Starter and standard Professional — no, the prices are the prices." },
];

function CellMark({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return (
      <span style={{
        fontFamily: F.mono, fontSize: 12, color: C.text, fontWeight: 600,
      }}>
        {value}
      </span>
    );
  }
  return value
    ? <Check size={18} style={{ color: ACCENT }} />
    : <Minus size={16} style={{ color: C.textMuted }} />;
}

export default function PricingPage() {
  const isMobile = useIsMobile();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <MarketingLayout>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section style={{
        padding: `${isMobile ? 80 : 120}px ${isMobile ? 24 : 48}px 60px`,
        maxWidth: 1100, margin: "0 auto", textAlign: "center",
      }}>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.18em", color: C.textMuted,
          textTransform: "uppercase", marginBottom: 16,
        }}>
          Pricing
        </div>
        <h1 style={{
          fontFamily: F.heading,
          fontSize: isMobile ? 36 : 56, fontWeight: 800,
          letterSpacing: "-0.02em", margin: "0 0 16px",
          color: C.text, lineHeight: 1.1,
        }}>
          Three tiers. No surprises.
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: isMobile ? 16 : 18,
          color: C.textSub, lineHeight: 1.55,
          maxWidth: 640, margin: "0 auto",
        }}>
          12-month contracts on Professional and Enterprise. 90-day no-commitment
          trial on Starter. Volume discounts on multi-year.
        </p>
      </section>

      {/* ── Tier cards ─────────────────────────────────────────────────────── */}
      <section style={{
        padding: `0 ${isMobile ? 24 : 48}px 60px`,
        maxWidth: 1200, margin: "0 auto",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: 20,
        }}>
          {TIERS.map((t) => (
            <div
              key={t.name}
              style={{
                position: "relative",
                padding: "36px 28px",
                background: t.highlight ? C.bgDark : C.bg,
                color: t.highlight ? C.textOnDark : C.text,
                border: `1px solid ${t.highlight ? C.bgDark : C.border}`,
                borderRadius: 10,
                boxShadow: t.highlight ? "0 16px 48px rgba(0,0,0,0.18)" : C.cardShadow,
              }}
            >
              {t.highlight && (
                <div style={{
                  position: "absolute", top: -10, left: 28,
                  fontFamily: F.mono, fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  background: ACCENT, color: "#fff",
                  padding: "4px 10px", borderRadius: 4,
                }}>
                  Most popular
                </div>
              )}

              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                letterSpacing: "0.16em", textTransform: "uppercase",
                color: t.highlight ? C.textOnDarkMuted : C.textMuted,
                marginBottom: 8,
              }}>
                {t.tagline}
              </div>
              <div style={{
                fontFamily: F.heading, fontSize: 28, fontWeight: 800,
                marginBottom: 14,
              }}>
                {t.name}
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <span style={{
                  fontFamily: F.heading, fontSize: 36, fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}>
                  {t.price}
                </span>
                <span style={{
                  fontFamily: F.ui, fontSize: 14,
                  color: t.highlight ? C.textOnDarkMuted : C.textSub,
                }}>
                  {t.priceCadence}
                </span>
              </div>
              <div style={{
                fontFamily: F.ui, fontSize: 13,
                color: t.highlight ? C.textOnDarkMuted : C.textMuted,
                marginBottom: 24,
              }}>
                Implementation: {t.implementation}
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px",
                           display: "flex", flexDirection: "column", gap: 10 }}>
                {t.meta.map((m) => (
                  <li key={m.label} style={{
                    display: "flex", justifyContent: "space-between",
                    fontFamily: F.ui, fontSize: 13,
                    color: t.highlight ? C.textOnDark : C.text,
                    paddingBottom: 8,
                    borderBottom: `1px solid ${t.highlight ? "rgba(255,255,255,0.12)" : C.borderLight}`,
                  }}>
                    <span style={{ color: t.highlight ? C.textOnDarkMuted : C.textSub }}>
                      {m.label}
                    </span>
                    <span style={{ fontFamily: F.mono, fontWeight: 600 }}>
                      {m.value}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={t.cta.href}
                style={{
                  display: "block", textAlign: "center",
                  padding: "14px 18px", borderRadius: 6,
                  background: t.highlight ? "#fff" : ACCENT,
                  color: t.highlight ? C.text : "#fff",
                  fontFamily: F.ui, fontSize: 14, fontWeight: 700,
                  letterSpacing: "0.02em",
                  textDecoration: "none",
                  border: `1px solid ${t.highlight ? "#fff" : ACCENT}`,
                }}
              >
                {t.cta.label}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Comparison table ───────────────────────────────────────────────── */}
      <section style={{
        padding: `60px ${isMobile ? 24 : 48}px`,
        maxWidth: 1100, margin: "0 auto",
      }}>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: C.textMuted, marginBottom: 12,
        }}>
          Compare features
        </div>
        <h2 style={{
          fontFamily: F.heading, fontSize: 28, fontWeight: 800,
          margin: "0 0 32px", color: C.text,
        }}>
          What's included in each tier
        </h2>

        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8,
          overflow: "hidden", background: C.bg,
        }}>
          {/* Header row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1.4fr repeat(3, 1fr)" : "2fr repeat(3, 1fr)",
            background: C.bgAlt,
            borderBottom: `1px solid ${C.border}`,
            padding: "14px 20px",
          }}>
            <div style={{
              fontFamily: F.mono, fontSize: 11, fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: C.textMuted,
            }}>
              Feature
            </div>
            {["Starter", "Professional", "Enterprise"].map((n) => (
              <div key={n} style={{
                fontFamily: F.ui, fontSize: 13, fontWeight: 700,
                color: C.text, textAlign: "center",
              }}>
                {n}
              </div>
            ))}
          </div>

          {FEATURES.map((row) => (
            <div key={row.feature}>
              {row.group && (
                <div style={{
                  padding: "14px 20px 6px",
                  fontFamily: F.mono, fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.16em", textTransform: "uppercase",
                  color: ACCENT, background: C.bg,
                }}>
                  {row.group}
                </div>
              )}
              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1.4fr repeat(3, 1fr)" : "2fr repeat(3, 1fr)",
                padding: "14px 20px",
                borderBottom: `1px solid ${C.borderLight}`,
                alignItems: "center",
              }}>
                <div style={{
                  fontFamily: F.ui, fontSize: isMobile ? 12 : 13,
                  color: C.text,
                }}>
                  {row.feature}
                </div>
                <div style={{ textAlign: "center" }}>
                  <CellMark value={row.starter} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <CellMark value={row.professional} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <CellMark value={row.enterprise} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section style={{
        padding: `60px ${isMobile ? 24 : 48}px 100px`,
        maxWidth: 820, margin: "0 auto",
      }}>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: C.textMuted, marginBottom: 12,
        }}>
          Pricing FAQ
        </div>
        <h2 style={{
          fontFamily: F.heading, fontSize: 28, fontWeight: 800,
          margin: "0 0 32px", color: C.text,
        }}>
          Common questions
        </h2>

        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8,
          background: C.bg, overflow: "hidden",
        }}>
          {FAQS.map((f, i) => {
            const open = openFaq === i;
            return (
              <div
                key={f.q}
                style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${C.borderLight}` : "none" }}
              >
                <button
                  onClick={() => setOpenFaq(open ? null : i)}
                  style={{
                    width: "100%",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "20px 24px",
                    background: "transparent", border: "none", cursor: "pointer",
                    fontFamily: F.ui, fontSize: 15, fontWeight: 600,
                    color: C.text, textAlign: "left",
                  }}
                >
                  {f.q}
                  {open
                    ? <ChevronUp size={18} style={{ color: C.textMuted }} />
                    : <ChevronDown size={18} style={{ color: C.textMuted }} />}
                </button>
                {open && (
                  <div style={{
                    padding: "0 24px 22px",
                    fontFamily: F.ui, fontSize: 14, lineHeight: 1.65,
                    color: C.textSub,
                  }}>
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </MarketingLayout>
  );
}
