"use client";

import Link from "next/link";
import { Shield, FileCheck, ClipboardCheck, ChevronRight, Mail } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const HUB_ROWS: { topic: string; status: string; href?: string }[] = [
  { topic: "Hosting", status: "EU (Frankfurt) + US (us-east-1), customer-selected" },
  { topic: "Encryption", status: "TLS 1.3 in transit, AES-256 at rest", href: "/trust/security" },
  { topic: "Authentication", status: "JWT HS256 + bcrypt + CSRF + rate-limit", href: "/trust/security" },
  { topic: "RBAC", status: "9 roles × 41 permissions, fail-closed", href: "/trust/security" },
  { topic: "Audit ledger", status: "SHA-256 hash chain, WORM tables, per-tenant", href: "/trust/security" },
  { topic: "SOC 2 Type II", status: "In progress, Q3 2026 target", href: "/trust/soc2" },
  { topic: "GDPR", status: "DPA + SCCs Module Two + UK Addendum", href: "/trust/compliance" },
  { topic: "CCPA / CPRA", status: "Service Provider terms in DPA §13", href: "/trust/compliance" },
  { topic: "Penetration test", status: "Annual external test; summary letter on request under NDA" },
  { topic: "Status page", status: "status.ordrtreasuryfx.com — live uptime + incidents" },
  { topic: "Disclosure", status: "security@ordrtreasuryfx.com" },
];

const SECTIONS = [
  {
    href: "/trust/security",
    icon: Shield,
    title: "Security overview",
    desc: "Application security, data security, audit integrity, infrastructure, and operational controls — the full posture in one document.",
  },
  {
    href: "/trust/compliance",
    icon: FileCheck,
    title: "Compliance status",
    desc: "SOC 2, GDPR, CCPA/CPRA, hedge-accounting frameworks, OWASP, pen-test, and backup-restore drill status — updated monthly.",
  },
  {
    href: "/trust/soc2",
    icon: ClipboardCheck,
    title: "SOC 2 Type II readiness attestation",
    desc: "Control-by-control walkthrough of CC1–CC9, Availability, and Confidentiality — for procurement teams who need a buy decision before our Type II is in hand.",
  },
];

export default function TrustHubPage() {
  return (
    <MarketingLayout>
      <section style={{
        padding: "100px 24px 48px",
        maxWidth: 1080, margin: "0 auto",
      }}>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.18em", color: C.accent,
          textTransform: "uppercase", marginBottom: 18,
        }}>
          Trust Center
        </div>
        <h1 style={{
          fontFamily: F.heading, fontSize: 48, fontWeight: 800,
          letterSpacing: "-0.025em", margin: "0 0 20px",
          color: C.text, lineHeight: 1.1,
        }}>
          Security, compliance, and reliability — published.
        </h1>
        <p style={{
          fontFamily: F.ui, fontSize: 18, lineHeight: 1.6,
          color: C.textSub, maxWidth: 720, margin: "0 0 12px",
        }}>
          Short. Factual. Free of marketing prose. This is what your security team, procurement,
          and internal auditors need to evaluate ORDR TreasuryFX without an NDA.
        </p>
        <div style={{
          fontFamily: F.mono, fontSize: 11,
          color: C.textMuted, marginTop: 24,
        }}>
          Last reviewed: 2026-04-25
        </div>
      </section>

      <section style={{
        padding: "0 24px 48px",
        maxWidth: 1080, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 22, fontWeight: 800,
          margin: "0 0 18px", color: C.text,
        }}>
          At a glance
        </h2>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 8,
          overflow: "hidden",
        }}>
          {HUB_ROWS.map((r, i) => (
            <div key={r.topic} style={{
              display: "grid",
              gridTemplateColumns: "200px 1fr auto",
              gap: 16,
              padding: "14px 20px",
              borderBottom: i < HUB_ROWS.length - 1 ? `1px solid ${C.borderLight}` : "none",
              background: i % 2 === 0 ? C.bg : C.bgAlt,
              alignItems: "center",
            }}>
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                letterSpacing: "0.12em", textTransform: "uppercase",
                color: C.text,
              }}>
                {r.topic}
              </div>
              <div style={{
                fontFamily: F.ui, fontSize: 14, color: C.textSub,
              }}>
                {r.status}
              </div>
              <div>
                {r.href ? (
                  <Link href={r.href} style={{
                    fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    color: C.accent, textDecoration: "none",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    Detail <ChevronRight size={12} />
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{
        padding: "32px 24px 48px",
        maxWidth: 1080, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 22, fontWeight: 800,
          margin: "0 0 18px", color: C.text,
        }}>
          Documents
        </h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 18,
        }}>
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} style={{
              display: "block",
              border: `1px solid ${C.border}`, borderRadius: 10,
              padding: "26px 24px", background: C.bg,
              textDecoration: "none", color: C.text,
              transition: "border-color 0.15s, box-shadow 0.15s",
              boxShadow: C.cardShadow,
            }}>
              <s.icon size={22} color={C.accent} strokeWidth={1.6} />
              <div style={{
                fontFamily: F.heading, fontSize: 18, fontWeight: 700,
                margin: "14px 0 8px", color: C.text, letterSpacing: "-0.01em",
              }}>
                {s.title}
              </div>
              <div style={{
                fontFamily: F.ui, fontSize: 14, lineHeight: 1.55,
                color: C.textSub,
              }}>
                {s.desc}
              </div>
              <div style={{
                marginTop: 18,
                fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: C.accent,
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                Read <ChevronRight size={12} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section style={{
        padding: "32px 24px 48px",
        maxWidth: 1080, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 22, fontWeight: 800,
          margin: "0 0 18px", color: C.text,
        }}>
          Available under NDA
        </h2>
        <ul style={{
          paddingLeft: 22, margin: 0,
          fontFamily: F.ui, fontSize: 15, lineHeight: 1.8,
          color: C.textSub,
        }}>
          <li>Penetration test executive summary (annual, redacted)</li>
          <li>Threat model summary</li>
          <li>Disaster recovery and business continuity plan</li>
          <li>SOC 2 Type II report (when delivered)</li>
          <li>Internal security policies (access control, change management, incident response, vendor risk, retention)</li>
          <li>Most-recent backup-restore drill attestation</li>
        </ul>
        <p style={{
          fontFamily: F.ui, fontSize: 14, lineHeight: 1.6,
          color: C.textSub, marginTop: 18,
        }}>
          Email <a href="mailto:security@ordrtreasuryfx.com" style={{ color: C.accent }}>security@ordrtreasuryfx.com</a> with your NDA in hand or signed; we counter-sign within 2 business days.
        </p>
      </section>

      <section style={{
        padding: "32px 24px 100px",
        maxWidth: 1080, margin: "0 auto",
      }}>
        <div style={{
          background: C.bgDark, color: C.textOnDark,
          padding: "40px 36px", borderRadius: 12,
          display: "grid", gridTemplateColumns: "1fr auto", gap: 32,
          alignItems: "center",
        }}>
          <div>
            <div style={{
              fontFamily: F.mono, fontSize: 11, fontWeight: 700,
              letterSpacing: "0.18em", color: C.accent,
              textTransform: "uppercase", marginBottom: 12,
            }}>
              Vulnerability disclosure
            </div>
            <div style={{
              fontFamily: F.heading, fontSize: 22, fontWeight: 700,
              letterSpacing: "-0.01em", marginBottom: 8,
            }}>
              security@ordrtreasuryfx.com
            </div>
            <div style={{
              fontFamily: F.ui, fontSize: 14, lineHeight: 1.55,
              color: C.textOnDarkMuted, maxWidth: 520,
            }}>
              Acknowledgment within 1 business day. Triage within 3. Remediation by severity.
              Safe harbor for good-faith researchers.
            </div>
          </div>
          <a href="mailto:security@ordrtreasuryfx.com" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: C.bg, color: C.text,
            padding: "14px 22px", borderRadius: 6,
            fontFamily: F.mono, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase",
            textDecoration: "none",
          }}>
            <Mail size={14} /> Report
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
}
