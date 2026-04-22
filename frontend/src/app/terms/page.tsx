"use client";

import Link from "next/link";
import { ChevronLeft, FileText } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

const ACCENT = C.accent;

const SECTIONS = [
  {
    heading: "1. Acceptance",
    body: "By accessing or using ORDR Terminal — including the web application, API, and any associated services — you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, you may not use the platform. Use of the platform by an employee or agent on behalf of an organization constitutes acceptance by that organization.",
  },
  {
    heading: "2. Platform Access",
    body: "ORDR Terminal is provided as a subscription-based SaaS platform. Your credentials are personal and non-transferable. You are responsible for all activity that occurs under your account, including actions taken by team members you have granted access to. You agree to notify us immediately of any unauthorized use of your account.",
  },
  {
    heading: "3. Permitted Use",
    body: "ORDR Terminal is licensed for enterprise FX risk management, portfolio analysis, hedge governance, and related treasury and risk operations — for lawful purposes only. You may not use the platform for market manipulation, unlicensed broker-dealer activity, circumventing financial regulations, or any purpose that violates applicable law. We reserve the right to suspend access immediately if prohibited use is detected.",
  },
  {
    heading: "4. Calculation Engine",
    body: "The outputs of the ORDR Terminal calculation engine — hedge ratios, risk parameters, scenario results, and portfolio analytics — are provided for informational and governance purposes. ORDR Terminal provides computation infrastructure. Hedge decisions, execution instructions, and financial commitments are made solely by the user. ORDR Terminal is not a registered investment advisor, broker-dealer, or financial services firm. Nothing on the platform constitutes investment advice, a recommendation to buy or sell any instrument, or a guarantee of any financial outcome.",
  },
  {
    heading: "5. Audit Data & WORM Policy",
    body: "Calculation runs, policy revisions, and audit events generated during your use of the platform are stored in an immutable WORM (Write Once, Read Many) audit trail. This data cannot be modified or deleted — not by you, not by ORDR staff — where retention is required for regulatory compliance (IFRS 9, ASC 815, or applicable law). Upon account termination, your audit data is retained for the legally required period (minimum 7 years) before permanent deletion. Account data and calculation outputs not subject to regulatory retention will be deleted within 90 days of termination.",
  },
  {
    heading: "6. Intellectual Property",
    body: "ORDR Terminal, including its calculation engine, algorithms, API design, user interface, and documentation, is proprietary software owned by ORDR Edge. You are granted a limited, non-exclusive, non-transferable license to access and use the platform during your subscription period. You retain full ownership of your input data — FX positions, exposure submissions, policy configurations — and the calculation outputs generated from that data.",
  },
  {
    heading: "7. Termination",
    body: "We may suspend or terminate your access to ORDR Terminal immediately if you violate these Terms, engage in prohibited use, or fail to maintain a valid subscription. Upon termination, your ability to log in and access the platform ceases. Your data is retained as described in Section 5 and the Privacy Policy, then permanently deleted. You may request voluntary account termination at any time by contacting legal@ordrterminal.com.",
  },
  {
    heading: "8. Disclaimers & Limitation of Liability",
    body: "ORDR Terminal is provided 'as is' without warranties of any kind, express or implied. We do not warrant that the platform will be error-free, uninterrupted, or suitable for any particular regulatory or compliance purpose. To the maximum extent permitted by law, our liability for any claim arising from your use of the platform is limited to the fees paid by you in the 12 months preceding the claim.",
  },
  {
    heading: "9. Governing Law",
    body: "These Terms are governed by the laws of the State of Delaware, USA, without regard to its conflict-of-law provisions. Any disputes arising under these Terms shall be resolved exclusively in the state or federal courts of Delaware. You consent to personal jurisdiction in those courts.",
  },
  {
    heading: "10. Contact",
    body: "Questions about these Terms should be directed to: legal@ordrterminal.com. We respond to all legal inquiries within 5 business days. These Terms were last updated January 2026. Material changes will be communicated to active subscribers at least 30 days before they take effect.",
  },
];

export default function TermsPage() {
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
          <FileText size={14} />
          [LEGAL]
        </div>

        <h1 style={{
          fontFamily: F.heading, fontSize: isMobile ? 32 : 48, fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.1,
          margin: "0 0 16px", color: C.text,
        }}>
          Terms of Service
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
          Please read these terms carefully before using ORDR Terminal. They govern
          your access to and use of the platform, including all APIs, services, and
          features.
        </p>
      </section>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, maxWidth: 860, margin: "0 auto" }} />

      {/* ── Terms Sections ─────────────────────────────────────────────────── */}
      <section style={{ padding: isMobile ? "40px 24px" : "64px 48px", maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <h2 style={{
                fontFamily: F.heading, fontSize: 18, fontWeight: 800,
                color: C.text, margin: "0 0 16px",
                paddingBottom: 12, borderBottom: `1px solid ${C.border}`,
              }}>
                {section.heading}
              </h2>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: C.textSub,
                lineHeight: 1.8, margin: 0,
              }}>
                {section.body}
              </p>
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
          Legal inquiries
        </p>
        <a
          href="mailto:legal@ordrterminal.com"
          style={{
            fontFamily: F.mono, fontSize: 14, fontWeight: 700,
            color: ACCENT, textDecoration: "none",
          }}
        >
          legal@ordrterminal.com
        </a>
        <p style={{
          fontFamily: F.ui, fontSize: 12, color: C.textMuted,
          margin: "16px 0 0",
        }}>
          Governing law: State of Delaware, USA
        </p>
      </section>

    </MarketingLayout>
  );
}
