"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useMarketingTheme } from "@/components/marketing/useMarketingTheme";
import { F } from "@/components/marketing/theme";
import {
  Target, AlertTriangle, Puzzle, Cpu, Shield, Code2, ArrowRight,
} from "lucide-react";

const PROBLEMS = [
  {
    icon: <AlertTriangle size={24} strokeWidth={1.5} />,
    title: "Spreadsheet Risk",
    desc: "Critical hedge decisions buried in spreadsheets that break, cannot be audited, and introduce formula errors with every change.",
  },
  {
    icon: <Puzzle size={24} strokeWidth={1.5} />,
    title: "Compliance Gaps",
    desc: "IFRS 9 documentation requirements, SOX controls, and regulatory reporting demand systems that spreadsheets cannot provide.",
  },
  {
    icon: <Target size={24} strokeWidth={1.5} />,
    title: "Operational Complexity",
    desc: "Multi-entity, multi-currency hedging programs across time zones require governance workflows that email chains cannot enforce.",
  },
];

const APPROACH = [
  {
    icon: <Cpu size={24} strokeWidth={1.5} />,
    title: "Deterministic Computation",
    desc: "Same inputs produce identical outputs. No ML black boxes, no random seeds, no non-determinism. Every calculation is reproducible and explainable.",
    color: "#22d3ee",
  },
  {
    icon: <Shield size={24} strokeWidth={1.5} />,
    title: "Institutional Governance",
    desc: "4-eyes approval, Separation of Duties, WORM audit trails, SHA-256 hash chains. Built for the governance standards of regulated institutions.",
    color: "#818cf8",
  },
  {
    icon: <Code2 size={24} strokeWidth={1.5} />,
    title: "Open Architecture",
    desc: "219+ REST API endpoints, OpenAPI documentation, webhook integrations. ORDR connects to your existing infrastructure, not the other way around.",
    color: "#34d399",
  },
];

const NUMBERS = [
  { value: "7", label: "Products" },
  { value: "219+", label: "API Endpoints" },
  { value: "41", label: "Engine Modules" },
  { value: "3,463", label: "Passing Tests" },
  { value: "<50ms", label: "Computation Latency" },
  { value: "60", label: "Policy Templates" },
];

export default function AboutPage() {
  const { T, dk, mob } = useMarketingTheme();

  return (
    <MarketingLayout>
      <style>{`
        .ab-card{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .ab-card:hover{transform:translateY(-4px)}
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
            ABOUT
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: mob ? 36 : 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: dk ? "#eeeef2" : T.accent,
          }}>
            About ORDR
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: mob ? 16 : 18, color: T.textSub,
            maxWidth: 560, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            We believe hedge management should be deterministic, auditable, and accessible.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section style={{
        padding: mob ? "48px 20px" : "80px 48px",
        maxWidth: 800, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 20px", color: T.text,
        }}>
          Our Mission
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 17, color: T.textSub, lineHeight: 1.8, margin: 0,
        }}>
          ORDR Terminal was built on a simple principle: financial institutions deserve
          hedge calculation systems that are transparent, reproducible, and audit-proof.
          No black boxes. No ML guesswork. Every calculation produces the same result,
          every time. We built the platform we wished existed when we were managing
          FX risk at scale -- one that treats governance and auditability as first-class
          requirements, not afterthoughts.
        </p>
      </section>

      {/* The Problem We Solve */}
      <section style={{
        padding: mob ? "48px 20px" : "72px 48px",
        background: T.sectionAlt,
        borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 36px", textAlign: "center", color: T.text,
          }}>
            The Problem We Solve
          </h2>
          <div style={{
            display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: 24,
          }}>
            {PROBLEMS.map((p) => (
              <div key={p.title} className="ab-card" style={{
                background: T.bgCard, border: `1px solid ${T.border}`,
                borderRadius: 14, padding: "28px 24px", boxShadow: T.cardShadow,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: dk ? "rgba(248,113,113,0.08)" : "rgba(220,38,38,0.06)",
                  color: dk ? "#f87171" : "#dc2626", marginBottom: 16,
                }}>
                  {p.icon}
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 18, fontWeight: 700,
                  margin: "0 0 10px", color: T.text,
                }}>
                  {p.title}
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: T.textSub, lineHeight: 1.6, margin: 0,
                }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Approach */}
      <section style={{
        padding: mob ? "48px 20px" : "80px 48px",
        maxWidth: 1100, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 36px", textAlign: "center", color: T.text,
        }}>
          Our Approach
        </h2>
        <div style={{
          display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(3, 1fr)", gap: 24,
        }}>
          {APPROACH.map((a) => (
            <div key={a.title} className="ab-card" style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 14, padding: "28px 24px", boxShadow: T.cardShadow,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: `${a.color}12`, color: a.color, marginBottom: 16,
              }}>
                {a.icon}
              </div>
              <h3 style={{
                fontFamily: F.heading, fontSize: 18, fontWeight: 700,
                margin: "0 0 10px", color: T.text,
              }}>
                {a.title}
              </h3>
              <p style={{
                fontFamily: F.ui, fontSize: 14, color: T.textSub, lineHeight: 1.6, margin: 0,
              }}>
                {a.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* By the Numbers */}
      <section style={{
        padding: mob ? "48px 20px" : "72px 48px",
        background: T.sectionAlt,
        borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 36px", textAlign: "center", color: T.text,
          }}>
            By the Numbers
          </h2>
          <div style={{
            display: "grid", gridTemplateColumns: mob ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
            gap: mob ? 20 : 32,
          }}>
            {NUMBERS.map((n) => (
              <div key={n.label} style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{
                  fontFamily: F.mono, fontSize: mob ? 32 : 40, fontWeight: 800,
                  color: T.accent, letterSpacing: "-0.03em", lineHeight: 1,
                }}>
                  {n.value}
                </div>
                <div style={{
                  fontFamily: F.mono, fontSize: 12, fontWeight: 600,
                  letterSpacing: "0.1em", color: T.textDim,
                  marginTop: 8, textTransform: "uppercase" as const,
                }}>
                  {n.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology */}
      <section style={{
        padding: mob ? "48px 20px" : "80px 48px",
        maxWidth: 800, margin: "0 auto",
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 24 : 32, fontWeight: 700,
          letterSpacing: "-0.02em", margin: "0 0 20px", color: T.text,
        }}>
          Technology
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: T.textSub, lineHeight: 1.8, margin: "0 0 24px",
        }}>
          ORDR Terminal is built on a modern, production-hardened stack designed for
          institutional reliability and developer ergonomics.
        </p>
        <div style={{
          display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 16,
        }}>
          {[
            { label: "Backend", value: "Python 3.12, FastAPI, SQLAlchemy async" },
            { label: "Frontend", value: "Next.js 15, React 19, TypeScript 5.9" },
            { label: "Database", value: "PostgreSQL with WORM semantics" },
            { label: "Auth", value: "JWT HS256 + bcrypt + API keys" },
            { label: "Deploy", value: "Render.com (backend) + Vercel (frontend)" },
            { label: "Engine", value: "41 deterministic modules, <50ms latency" },
          ].map((item) => (
            <div key={item.label} style={{
              display: "flex", gap: 12, padding: "14px 16px",
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 10,
            }}>
              <span style={{
                fontFamily: F.mono, fontSize: 12, fontWeight: 700,
                color: T.accent, minWidth: 70, letterSpacing: "0.04em",
              }}>
                {item.label.toUpperCase()}
              </span>
              <span style={{
                fontFamily: F.ui, fontSize: 14, color: T.textSub,
              }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: mob ? "48px 20px 64px" : "64px 48px 96px",
        textAlign: "center", background: T.sectionAlt,
        borderTop: `1px solid ${T.border}`,
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: mob ? 28 : 40, fontWeight: 800,
          letterSpacing: "-0.02em", margin: "0 0 16px",
          color: dk ? "#eeeef2" : T.accent,
        }}>
          Ready to see it in action?
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: T.textSub,
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Launch the terminal and explore deterministic hedge computation first-hand.
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
            Contact Us
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
