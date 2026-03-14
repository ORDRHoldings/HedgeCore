"use client";

import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";
import { ArrowRight, Cpu, Eye, Shield, Minimize2 } from "lucide-react";

const VALUES = [
  { icon: <Cpu size={22} />, title: "Determinism", desc: "Same inputs produce identical outputs. No ML black boxes, no random seeds, no non-determinism. Every calculation is reproducible and explainable." },
  { icon: <Eye size={22} />, title: "Transparency", desc: "Full audit trail on every decision. Hash-chained event logs, immutable calculation records, and complete decision provenance." },
  { icon: <Shield size={22} />, title: "Governance", desc: "4-eyes approval, separation of duties, RBAC with 41 permissions, and maker-checker workflows. Built for regulated institutions." },
  { icon: <Minimize2 size={22} />, title: "Simplicity", desc: "Complex problems solved with clear interfaces. No feature bloat. Every screen serves a purpose, every calculation has a rationale." },
];

const TEAM = [
  { name: "James Harrington", role: "Chief Executive Officer", bio: "Former VP Treasury at a Fortune 500 multinational. 18 years in corporate FX risk management." },
  { name: "Dr. Sarah Chen", role: "Chief Technology Officer", bio: "PhD in Computational Finance. Previously led quantitative infrastructure at a Tier 1 investment bank." },
  { name: "Marcus Okonkwo", role: "VP Engineering", bio: "Built trading systems at scale for 12 years. Deep expertise in audit-grade financial infrastructure." },
  { name: "Elena Vasquez", role: "Head of Product", bio: "Former Head of FX Solutions at a Big 4 consulting firm. Expert in treasury operations and hedge accounting." },
];

export default function AboutPage() {
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
            About ORDR
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: 18, color: C.textSub,
            maxWidth: 560, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            We believe hedge management should be deterministic, auditable, and accessible.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section style={{
        padding: "80px 48px",
        background: C.bgAlt,
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 20px", color: C.text,
          }}>
            Our Mission
          </h2>
          <p style={{
            fontFamily: F.ui, fontSize: 17, color: C.textSub, lineHeight: 1.8, margin: 0,
          }}>
            We build institutional-grade software for FX risk management. ORDR Terminal
            was created on a simple principle: financial institutions deserve hedge
            calculation systems that are transparent, reproducible, and audit-proof.
            No black boxes. No ML guesswork. Every calculation produces the same result,
            every time. We built the platform we wished existed when we were managing
            FX risk at scale -- one that treats governance and auditability as first-class
            requirements, not afterthoughts.
          </p>
        </div>
      </section>

      {/* Values */}
      <section style={{ padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 40px", textAlign: "center", color: C.text,
          }}>
            Our Values
          </h2>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24,
          }}>
            {VALUES.map((v) => (
              <div key={v.title} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: C.accentLight, color: C.accent,
                  marginBottom: 16,
                }}>
                  {v.icon}
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 18, fontWeight: 700,
                  margin: "0 0 10px", color: C.text,
                }}>
                  {v.title}
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 14, color: C.textSub,
                  lineHeight: 1.6, margin: 0,
                }}>
                  {v.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section style={{ padding: "80px 48px", background: C.bgAlt }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 700,
            letterSpacing: "-0.02em", margin: "0 0 40px", textAlign: "center", color: C.text,
          }}>
            Leadership
          </h2>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24,
          }}>
            {TEAM.map((t) => (
              <div key={t.name} style={{
                background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "28px 24px", textAlign: "center",
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: C.bgMuted,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                  fontFamily: F.heading, fontSize: 22, fontWeight: 700,
                  color: C.accent,
                }}>
                  {t.name.split(" ").map(n => n[0]).join("")}
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 16, fontWeight: 700,
                  margin: "0 0 4px", color: C.text,
                }}>
                  {t.name}
                </h3>
                <p style={{
                  fontFamily: F.mono, fontSize: 12, fontWeight: 600,
                  color: C.accent, margin: "0 0 12px", letterSpacing: "0.02em",
                }}>
                  {t.role}
                </p>
                <p style={{
                  fontFamily: F.ui, fontSize: 13, color: C.textSub,
                  lineHeight: 1.6, margin: 0,
                }}>
                  {t.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: "80px 48px",
        textAlign: "center",
        background: C.bg,
      }}>
        <h2 style={{
          fontFamily: F.heading, fontSize: 40, fontWeight: 800,
          letterSpacing: "-0.02em", margin: "0 0 16px",
          color: C.accent,
        }}>
          Ready to see it in action?
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 16, color: C.textSub,
          maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6,
        }}>
          Launch the terminal and explore deterministic hedge computation first-hand.
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
            Contact Us
          </Link>
        </div>
      </section>

      <style>{`
        @media(max-width:768px){
          section{padding:60px 20px !important}
          h1{font-size:36px !important}
          h2{font-size:24px !important}
          div[style*="grid-template-columns: repeat(2"]{grid-template-columns:1fr !important}
          div[style*="grid-template-columns: repeat(4"]{grid-template-columns:repeat(2,1fr) !important}
        }
      `}</style>
    </MarketingLayout>
  );
}
