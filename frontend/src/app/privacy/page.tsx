"use client";

import Link from "next/link";
import { ChevronLeft, Lock } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

const ACCENT = C.accent;

const SECTIONS = [
  {
    heading: "1. Information We Collect",
    body: [
      "We collect account data you provide directly: your name, email address, and company affiliation. This information is required to create and manage your ORDR Terminal subscription.",
      "We collect usage data automatically as you interact with the platform: API call logs, page views, feature usage patterns, and session metadata. This data is used in aggregate to understand how the platform is used and to improve it.",
      "We collect calculation data — including FX positions, hedge plans, exposure submissions, and policy configurations — that you enter into the platform. This data is encrypted, tenant-isolated, and used solely to operate the service you have contracted for.",
    ],
  },
  {
    heading: "2. How We Use Your Data",
    body: [
      "Your data is used to operate, maintain, and improve the ORDR Terminal platform. We use account data to authenticate you, enforce your subscription entitlements, and communicate service-related updates.",
      "We use calculation data to execute hedge computations, generate audit trails, and populate governance workflows. This data is never used for marketing, advertising, or sold to third parties.",
      "We use usage data in anonymized aggregate form to understand feature adoption and prioritize product improvements. We comply with regulatory obligations — where IFRS 9 or ASC 815 audit trail requirements apply, we retain data for the periods specified in our Retention Policy below.",
    ],
  },
  {
    heading: "3. Data Retention",
    body: [
      "Account data is retained for the duration of your active subscription plus 90 days following termination, after which it is deleted from production systems.",
      "Calculation runs, policy revisions, and audit events are retained for a minimum of 7 years to satisfy regulatory requirements for hedge accounting audit trails under IFRS 9 and ASC 815. This data cannot be deleted on demand where such retention is legally required.",
      "Anonymized usage and performance telemetry is retained indefinitely in aggregate form. This data cannot be attributed to any individual user or tenant.",
    ],
  },
  {
    heading: "4. Data Security",
    body: [
      "All data transmitted to and from ORDR Terminal is encrypted using TLS 1.3. Data stored in our database is encrypted at rest using AES-256. Tenant data is isolated at the database level — no cross-tenant data access is possible by design.",
      "The audit trail is stored in WORM tables (Write Once, Read Many) enforced by database triggers. This means the audit trail cannot be modified or deleted by any party, including ORDR staff. The hash chain provides independent cryptographic verification of audit integrity.",
      "Access to production systems is restricted to authorized personnel via multi-factor authentication. All administrative actions are logged to the same immutable audit trail.",
    ],
  },
  {
    heading: "5. Your Rights",
    body: [
      "You have the right to access the personal data we hold about you, request corrections to inaccurate data, and request deletion of your account data where we are not legally required to retain it. To exercise these rights, contact privacy@ordrterminal.com.",
      "You may request a machine-readable export of your account data and calculation outputs at any time. Data portability requests are fulfilled within 30 days.",
      "You may opt out of non-essential communications (marketing, newsletters, product announcements) at any time via account settings or by emailing privacy@ordrterminal.com. You cannot opt out of service-essential communications such as security alerts and billing notices.",
    ],
  },
  {
    heading: "6. Contact",
    body: [
      "Questions about this privacy policy or requests to exercise your data rights should be directed to: privacy@ordrterminal.com. We respond to all privacy inquiries within 5 business days.",
      "This policy was last updated January 2026. Material changes to this policy will be communicated to active subscribers via email at least 30 days before they take effect.",
    ],
  },
];

export default function PrivacyPage() {
  const isMobile = useIsMobile();
  return (
    <MarketingLayout>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section style={{ padding: isMobile ? "60px 24px 40px" : "80px 48px 64px", maxWidth: 860, margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: F.mono, fontSize: 12, color: C.textMuted,
            textDecoration: "none", marginBottom: 32,
          }}
        >
          <ChevronLeft size={14} /> Home
        </Link>

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.15em", color: ACCENT, textTransform: "uppercase",
          marginBottom: 20,
        }}>
          <Lock size={14} />
          [PRIVACY]
        </div>

        <h1 style={{
          fontFamily: F.heading, fontSize: isMobile ? 32 : 48, fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.1,
          margin: "0 0 16px", color: C.text,
        }}>
          Privacy Policy
        </h1>

        <p style={{
          fontFamily: F.mono, fontSize: 12, color: C.textMuted,
          margin: "0 0 28px",
        }}>
          Last updated: January 2026
        </p>

        <p style={{
          fontFamily: F.ui, fontSize: 16, color: C.textSub,
          maxWidth: 700, margin: 0, lineHeight: 1.8,
        }}>
          ORDR Terminal is committed to protecting the privacy and confidentiality of
          institutional data. This policy explains what data we collect, how we use it,
          and the controls you have over it.
        </p>
      </section>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, maxWidth: 860, margin: "0 auto" }} />

      {/* ── Policy Sections ─────────────────────────────────────────────────── */}
      <section style={{ padding: isMobile ? "40px 24px" : "64px 48px", maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <h2 style={{
                fontFamily: F.heading, fontSize: 20, fontWeight: 800,
                color: C.text, margin: "0 0 20px",
                paddingBottom: 12, borderBottom: `1px solid ${C.border}`,
              }}>
                {section.heading}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {section.body.map((paragraph, i) => (
                  <p
                    key={i}
                    style={{
                      fontFamily: F.ui, fontSize: 15, color: C.textSub,
                      lineHeight: 1.8, margin: 0,
                    }}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Contact Footer ──────────────────────────────────────────────────── */}
      <section style={{
        background: C.bgAlt,
        borderTop: `1px solid ${C.border}`,
        padding: isMobile ? "32px 24px" : "48px 48px",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: F.ui, fontSize: 14, color: C.textMuted,
          margin: "0 0 8px",
        }}>
          Privacy inquiries
        </p>
        <a
          href="mailto:privacy@ordrterminal.com"
          style={{
            fontFamily: F.mono, fontSize: 14, fontWeight: 700,
            color: ACCENT, textDecoration: "none",
          }}
        >
          privacy@ordrterminal.com
        </a>
      </section>

    </MarketingLayout>
  );
}
