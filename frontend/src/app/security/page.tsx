"use client";

import Link from "next/link";
import {
  ChevronLeft,
  Shield,
  Lock,
  Key,
  Hash,
  Users,
  AlertTriangle,
  CheckCircle,
  Server,
  Eye,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

const ACCENT = C.accent;

const SECTIONS = [
  {
    icon: <Server size={20} />,
    title: "Infrastructure Security",
    items: [
      "Hosted on Render.com — SOC 2-compliant cloud environment",
      "TLS 1.3 enforced for all data in transit",
      "AES-256 encryption for data at rest",
      "Environment variable isolation — no secrets in source code",
      "Gitleaks pre-commit hook enforces secret scanning on every commit",
    ],
  },
  {
    icon: <Key size={20} />,
    title: "Authentication & Access Control",
    items: [
      "JWT HS256 tokens — 30-minute access tokens, 7-day refresh tokens",
      "API keys with HK_live_ prefix, bcrypt-hashed server-side",
      "RBAC: 9 roles, 41 permissions, hierarchy levels 0–15",
      "Fail-closed authorization — missing permission always = denied",
      "CSRF protection: csrf_token cookie + X-CSRF-Token header on all mutations",
    ],
  },
  {
    icon: <Hash size={20} />,
    title: "Audit & Integrity",
    items: [
      "SHA-256 hash chain per tenant — tamper-evident append-only log",
      "GENESIS_HASH = 64 zero characters (canonical, verifiable)",
      "WORM tables: audit_events, calculation_runs, policy_revisions",
      "NO UPDATE, NO DELETE enforced at database trigger level",
      "Hash chain verified at session start — broken chain triggers escalation",
    ],
  },
  {
    icon: <Users size={20} />,
    title: "Governance Controls",
    items: [
      "4-eyes maker-checker for all execution proposals",
      "Separation of Duties — same user cannot make and check a proposal",
      "Tri-state pipeline: Sandbox → Staging → Ledger",
      "Rate limiting: 60 requests per minute per user/IP (TokenBucket)",
      "All privilege escalation requests logged to immutable audit trail",
    ],
  },
  {
    icon: <Lock size={20} />,
    title: "Request Security",
    items: [
      "X-Content-Type-Options: nosniff on all responses",
      "X-Frame-Options: DENY — no iframe embedding",
      "Referrer-Policy: strict-origin-when-cross-origin",
      "CORS configured per environment — no wildcard in production",
      "Middleware order enforced: Audit → Rate Limit → Auth (never reordered)",
    ],
  },
  {
    icon: <AlertTriangle size={20} />,
    title: "Responsible Disclosure",
    items: [
      "Report findings to security@ordrterminal.com",
      "We acknowledge all reports within 48 hours",
      "We do not pursue legal action against good-faith researchers",
      "Critical vulnerabilities patched within 72 hours of confirmation",
      "We credit researchers publicly upon request after patch release",
    ],
  },
];

export default function SecurityPage() {
  const isMobile = useIsMobile();
  return (
    <MarketingLayout>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section style={{ padding: `80px ${isMobile ? 24 : 48}px 64px`, maxWidth: 1100, margin: "0 auto" }}>
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
          <Shield size={14} />
          [SECURITY &amp; TRUST]
        </div>

        <h1 style={{
          fontFamily: F.heading, fontSize: 48, fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.1,
          margin: "0 0 20px", color: C.text,
        }}>
          Security &amp; Trust
        </h1>

        <p style={{
          fontFamily: F.ui, fontSize: 17, color: C.textSub,
          maxWidth: 640, margin: "0 0 16px", lineHeight: 1.7,
        }}>
          Institutional-grade security architecture for enterprise fintech.
          ORDR Terminal is built from the ground up for organizations where data
          integrity, access control, and auditability are non-negotiable.
        </p>

        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textMuted,
          maxWidth: 640, margin: 0, lineHeight: 1.7,
        }}>
          Every component — authentication, audit trail, governance pipeline, and
          data storage — has been designed with institutional security requirements
          as a baseline, not an afterthought.
        </p>
      </section>

      {/* ── Stats Strip ────────────────────────────────────────────────────── */}
      <section style={{
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        background: C.bgAlt,
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto",
          display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)",
        }}>
          {[
            { v: "TLS 1.3", l: "In Transit" },
            { v: "AES-256", l: "At Rest" },
            { v: "9 Roles", l: "RBAC" },
            { v: "SHA-256", l: "Hash Chain" },
            { v: "WORM", l: "Audit Trail" },
          ].map((s, i) => (
            <div
              key={s.l}
              style={{
                padding: "32px 16px", textAlign: "center",
                borderRight: i < 4 ? `1px solid ${C.border}` : "none",
              }}
            >
              <div style={{
                fontFamily: F.mono, fontSize: 22, fontWeight: 800,
                color: ACCENT, marginBottom: 6,
              }}>
                {s.v}
              </div>
              <div style={{
                fontFamily: F.mono, fontSize: 10, fontWeight: 700,
                letterSpacing: "0.12em", color: C.textMuted, textTransform: "uppercase",
              }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Security Sections Grid ──────────────────────────────────────────── */}
      <section style={{ padding: `80px ${isMobile ? 24 : 48}px`, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.15em", color: C.textMuted,
          textTransform: "uppercase", marginBottom: 12,
        }}>
          SECURITY ARCHITECTURE
        </div>
        <h2 style={{
          fontFamily: F.heading, fontSize: 32, fontWeight: 800,
          margin: "0 0 48px", color: C.text,
        }}>
          Defense in depth, by design
        </h2>

        <div className="sec-grid" style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 24,
        }}>
          {SECTIONS.map((section) => (
            <div
              key={section.title}
              style={{
                padding: "32px 28px", border: `1px solid ${C.border}`,
                borderRadius: 8, background: C.bg, boxShadow: C.cardShadow,
              }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                marginBottom: 20,
              }}>
                <div style={{ color: ACCENT }}>{section.icon}</div>
                <div style={{
                  fontFamily: F.ui, fontSize: 16, fontWeight: 700,
                  color: C.text,
                }}>
                  {section.title}
                </div>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {section.items.map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      fontFamily: F.ui, fontSize: 13, color: C.textSub,
                      lineHeight: 1.6,
                    }}
                  >
                    <CheckCircle
                      size={14}
                      style={{ color: "#16a34a", flexShrink: 0, marginTop: 2 }}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── WORM Detail Section ─────────────────────────────────────────────── */}
      <section style={{
        background: C.bgDark, padding: `80px ${isMobile ? 24 : 48}px`,
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase", marginBottom: 12,
          }}>
            IMMUTABLE AUDIT TRAIL
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 800,
            margin: "0 0 16px", color: "#FFFFFF",
          }}>
            WORM — Write Once, Read Many
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.6)",
            maxWidth: 680, margin: "0 0 48px", lineHeight: 1.7,
          }}>
            The three core audit tables cannot be modified or deleted by anyone —
            including ORDR staff. This is enforced at the database level by
            triggers, not application logic. The hash chain provides independent
            cryptographic verification.
          </p>

          <div className="sec-worm-grid" style={{
            display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 20,
          }}>
            {[
              {
                table: "audit_events",
                desc: "Every privileged action, login, permission check, and system event. Append-only. Hash-chained.",
              },
              {
                table: "calculation_runs",
                desc: "Every hedge calculation output with full input snapshot. Reproducible and tamper-evident.",
              },
              {
                table: "policy_revisions",
                desc: "Full version history of every hedge policy change. Maker, checker, timestamp immutable.",
              },
            ].map((t) => (
              <div
                key={t.table}
                style={{
                  background: "#111111",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderTop: `3px solid ${ACCENT}`,
                  borderRadius: 6, padding: "28px 24px",
                }}
              >
                <div style={{
                  fontFamily: F.mono, fontSize: 12, fontWeight: 700,
                  color: "rgba(255,255,255,0.9)", letterSpacing: "0.05em",
                  marginBottom: 12,
                }}>
                  {t.table}
                </div>
                <p style={{
                  fontFamily: F.ui, fontSize: 13,
                  color: "rgba(255,255,255,0.5)",
                  lineHeight: 1.7, margin: 0,
                }}>
                  {t.desc}
                </p>
                <div style={{
                  marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap",
                }}>
                  {["NO UPDATE", "NO DELETE", "HASH-CHAINED"].map((badge) => (
                    <span
                      key={badge}
                      style={{
                        fontFamily: F.mono, fontSize: 9, fontWeight: 700,
                        letterSpacing: "0.12em", color: "#ef4444",
                        border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: 3, padding: "2px 6px",
                        textTransform: "uppercase",
                      }}
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Disclosure CTA ──────────────────────────────────────────────────── */}
      <section style={{
        background: C.bgAlt,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: `64px ${isMobile ? 24 : 48}px`,
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ color: ACCENT, marginBottom: 16 }}>
            <Eye size={28} />
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 28, fontWeight: 800,
            margin: "0 0 16px", color: C.text,
          }}>
            Responsible Disclosure
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 15, color: C.textSub,
            margin: "0 0 28px", lineHeight: 1.7,
          }}>
            Found a vulnerability? We take security reports seriously and respond
            within 48 hours. We do not pursue legal action against good-faith
            security researchers.
          </p>
          <a
            href="mailto:security@ordrterminal.com"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: F.ui, fontSize: 15, fontWeight: 600,
              color: "#fff", background: ACCENT,
              padding: "12px 28px", borderRadius: 6, textDecoration: "none",
            }}
          >
            security@ordrterminal.com
          </a>
        </div>
      </section>


    </MarketingLayout>
  );
}
