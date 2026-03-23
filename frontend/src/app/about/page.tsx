"use client";

import Link from "next/link";
import {
  ChevronLeft,
  Building2,
  Cpu,
  Brain,
  Layers,
  Mail,
  Github,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const ACCENT = C.accent;

const PRODUCTS = [
  { name: "ORDR Treasury", desc: "FX hedge calculation, policy governance, and execution pipeline for corporate treasury operations." },
  { name: "ORDR Market", desc: "Professional charting terminal with real-time market data, AI-read charts, and cross-asset intelligence." },
  { name: "ORDR Portfolio", desc: "Portfolio risk decomposition, factor exposure analysis, and multi-currency attribution." },
  { name: "ORDR Labs", desc: "Scenario studio with Monte Carlo simulation, backtesting, and stress-testing infrastructure." },
  { name: "ORDR Polisophic", desc: "Geopolitical risk intelligence platform with corridor scoring and event-driven exposure alerts." },
  { name: "ORDR HedgeWiki", desc: "ISDA definitions, IFRS 9 / ASC 815 reference library, and hedge accounting decision trees." },
  { name: "ORDR FinHub", desc: "Economic calendars, company research, macro signal detection, and earnings surveillance." },
  { name: "ORDR Fund", desc: "Pooled capital management infrastructure for private fund managers and family offices." },
  { name: "ORDR Reports", desc: "Board-ready hedge effectiveness reports, regulatory disclosures, and audit-grade documentation." },
  { name: "GOLDX", desc: "Gold-backed digital asset with 1:1 physical backing, audited vaults, and DeFi compatibility." },
];

const PRINCIPLES = [
  {
    number: "01",
    title: "Deterministic Computation",
    desc: "The calculation engine produces identical outputs for identical inputs — always. No probabilistic approximation, no ML black boxes. Same input, same output. This is a guarantee, not a goal.",
  },
  {
    number: "02",
    title: "Governance by Design",
    desc: "4-eyes maker-checker, Separation of Duties, and an immutable WORM audit trail are not features we added — they are architectural primitives present from day one. Governance cannot be switched off.",
  },
  {
    number: "03",
    title: "AI as Assistant, Not Autopilot",
    desc: "AI reads charts, drafts reports, synthesizes geopolitical signals, and answers questions in plain language. It never touches a calculation, never auto-executes a trade, never makes a financial decision unilaterally.",
  },
];

export default function AboutPage() {
  return (
    <MarketingLayout>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 1100, margin: "0 auto" }}>
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
          <Building2 size={14} />
          [ABOUT]
        </div>

        <h1 style={{
          fontFamily: F.heading, fontSize: 52, fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.08,
          margin: "0 0 20px", color: C.text, maxWidth: 780,
        }}>
          About ORDR Terminal
        </h1>

        <p style={{
          fontFamily: F.ui, fontSize: 18, color: C.textSub,
          maxWidth: 680, margin: 0, lineHeight: 1.7,
        }}>
          The institutional fintech platform for treasury, risk, and trading.
        </p>
      </section>

      {/* ── Mission ────────────────────────────────────────────────────────── */}
      <section style={{
        background: C.bgAlt,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "80px 48px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.15em", color: C.textMuted,
            textTransform: "uppercase", marginBottom: 12,
          }}>
            MISSION
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 800,
            margin: "0 0 28px", color: C.text,
          }}>
            Why ORDR Terminal exists
          </h2>

          <div className="about-mission-grid" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48,
            alignItems: "start",
          }}>
            <div>
              <p style={{
                fontFamily: F.ui, fontSize: 17, color: C.text,
                lineHeight: 1.8, margin: "0 0 20px",
                fontStyle: "italic",
                borderLeft: `3px solid ${ACCENT}`,
                paddingLeft: 20,
              }}>
                &ldquo;We build the infrastructure that institutional finance runs on
                — deterministic, auditable, and governance-ready.&rdquo;
              </p>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: C.textSub,
                lineHeight: 1.8, margin: 0,
              }}>
                ORDR Terminal exists because too many treasury teams still manage FX
                risk in spreadsheets. Too many fund managers still track allocations
                in shared Google Sheets. Too many risk reports are assembled by hand
                the night before the board meeting.
              </p>
            </div>
            <div>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: C.textSub,
                lineHeight: 1.8, margin: "0 0 16px",
              }}>
                The infrastructure that institutional finance depends on should be
                deterministic, verifiable, and governed. It should produce the same
                answer every time. It should have an immutable audit trail. It should
                enforce separation of duties by default.
              </p>
              <p style={{
                fontFamily: F.ui, fontSize: 15, color: C.textSub,
                lineHeight: 1.8, margin: 0,
              }}>
                That is what we built. Not a spreadsheet replacement — a genuine
                institutional platform, designed from first principles for the
                organizations that cannot afford to get it wrong.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Products ───────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 12 }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.15em", color: C.textMuted, textTransform: "uppercase",
          }}>
            THE PLATFORM
          </div>
        </div>
        <h2 style={{
          fontFamily: F.heading, fontSize: 32, fontWeight: 800,
          margin: "0 0 12px", color: C.text,
        }}>
          10 products. One ecosystem.
        </h2>
        <p style={{
          fontFamily: F.ui, fontSize: 15, color: C.textSub,
          margin: "0 0 48px", maxWidth: 640, lineHeight: 1.7,
        }}>
          ORDR Terminal is not a point solution. It is a unified platform spanning
          treasury operations, risk management, capital markets, and institutional
          intelligence.
        </p>

        <div className="about-products-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1,
          border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden",
          background: C.border,
        }}>
          {PRODUCTS.map((product, i) => (
            <div
              key={product.name}
              style={{
                padding: "28px 28px",
                background: C.bg,
              }}
            >
              <div style={{
                fontFamily: F.mono, fontSize: 11, fontWeight: 700,
                letterSpacing: "0.1em", color: ACCENT,
                textTransform: "uppercase", marginBottom: 8,
              }}>
                {String(i + 1).padStart(2, "0")} · {product.name}
              </div>
              <p style={{
                fontFamily: F.ui, fontSize: 13, color: C.textSub,
                lineHeight: 1.7, margin: 0,
              }}>
                {product.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How We Think About AI ───────────────────────────────────────────── */}
      <section style={{
        background: C.bgDark, padding: "80px 48px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.15em", color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase", marginBottom: 12,
          }}>
            AI PHILOSOPHY
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 32, fontWeight: 800,
            margin: "0 0 24px", color: "#FFFFFF",
          }}>
            How we think about AI
          </h2>

          <div className="about-ai-grid" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48,
            alignItems: "start",
          }}>
            <div>
              <p style={{
                fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.75)",
                lineHeight: 1.8, margin: "0 0 20px",
              }}>
                AI is a communication and intelligence layer. It drafts reports, reads
                charts, synthesizes geopolitical data, and translates complex risk
                metrics into plain language for board-level audiences.
              </p>
              <p style={{
                fontFamily: F.ui, fontSize: 16, color: "rgba(255,255,255,0.75)",
                lineHeight: 1.8, margin: 0,
              }}>
                It never touches calculations. The engine is deterministic. Same input,
                same output. Always.
              </p>
            </div>
            <div style={{
              background: "#111111",
              border: "1px solid rgba(255,255,255,0.08)",
              borderLeft: `4px solid ${ACCENT}`,
              borderRadius: 6, padding: "28px 28px",
            }}>
              <div style={{
                display: "flex", flexDirection: "column", gap: 16,
              }}>
                {[
                  { label: "AI does", items: ["Reads and annotates charts", "Drafts governance reports", "Synthesizes geopolitical signals", "Answers risk questions in plain language", "Suggests policy configurations"] },
                  { label: "AI never does", items: ["Modifies a calculation result", "Auto-executes a trade or proposal", "Bypasses maker-checker approval", "Writes to the WORM audit trail directly", "Makes a financial decision autonomously"] },
                ].map((group) => (
                  <div key={group.label}>
                    <div style={{
                      fontFamily: F.mono, fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.15em", textTransform: "uppercase",
                      color: group.label === "AI does" ? "#16a34a" : "#ef4444",
                      marginBottom: 10,
                    }}>
                      {group.label}
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                      {group.items.map((item) => (
                        <li key={item} style={{
                          fontFamily: F.ui, fontSize: 13,
                          color: "rgba(255,255,255,0.55)",
                          display: "flex", alignItems: "center", gap: 8,
                        }}>
                          <span style={{
                            width: 4, height: 4, borderRadius: "50%",
                            background: group.label === "AI does" ? "#16a34a" : "#ef4444",
                            flexShrink: 0,
                          }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Architecture Principles ─────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{
          fontFamily: F.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.15em", color: C.textMuted,
          textTransform: "uppercase", marginBottom: 12,
        }}>
          ARCHITECTURE PHILOSOPHY
        </div>
        <h2 style={{
          fontFamily: F.heading, fontSize: 32, fontWeight: 800,
          margin: "0 0 48px", color: C.text,
        }}>
          Three principles we do not compromise on
        </h2>

        <div className="about-principles-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24,
        }}>
          {PRINCIPLES.map((p) => (
            <div
              key={p.number}
              style={{
                padding: "32px 28px",
                border: `1px solid ${C.border}`,
                borderTop: `3px solid ${ACCENT}`,
                borderRadius: 6,
                background: C.bg,
                boxShadow: C.cardShadow,
              }}
            >
              <div style={{
                fontFamily: F.mono, fontSize: 28, fontWeight: 800,
                color: C.bgMuted, marginBottom: 16, lineHeight: 1,
              }}>
                {p.number}
              </div>
              <div style={{
                fontFamily: F.ui, fontSize: 16, fontWeight: 700,
                color: C.text, marginBottom: 14,
              }}>
                {p.title}
              </div>
              <p style={{
                fontFamily: F.ui, fontSize: 14, color: C.textSub,
                lineHeight: 1.7, margin: 0,
              }}>
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <section style={{
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        background: C.bgAlt,
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
        }}>
          {[
            { v: "10",    l: "Products" },
            { v: "41",    l: "Engine Modules" },
            { v: "<50ms", l: "Engine Latency" },
            { v: "SHA-256", l: "Hash Chain" },
            { v: "WORM",  l: "Audit Tables" },
          ].map((s, i) => (
            <div
              key={s.l}
              style={{
                padding: "32px 16px", textAlign: "center",
                borderRight: i < 4 ? `1px solid ${C.border}` : "none",
              }}
            >
              <div style={{
                fontFamily: F.mono, fontSize: 24, fontWeight: 800,
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

      {/* ── Contact ────────────────────────────────────────────────────────── */}
      <section style={{
        padding: "80px 48px", textAlign: "center",
        background: C.bg,
      }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.15em", color: C.textMuted,
            textTransform: "uppercase", marginBottom: 20,
          }}>
            CONTACT
          </div>
          <h2 style={{
            fontFamily: F.heading, fontSize: 28, fontWeight: 800,
            margin: "0 0 24px", color: C.text,
          }}>
            Get in touch
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
            <a
              href="mailto:contact@ordrterminal.com"
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                fontFamily: F.ui, fontSize: 15, color: ACCENT,
                textDecoration: "none", fontWeight: 600,
              }}
            >
              <Mail size={16} />
              contact@ordrterminal.com
            </a>
            <a
              href="https://github.com/Synexiun"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                fontFamily: F.ui, fontSize: 15, color: C.textSub,
                textDecoration: "none",
              }}
            >
              <Github size={16} />
              github.com/Synexiun
            </a>
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 900px) {
          .about-mission-grid     { grid-template-columns: 1fr !important; }
          .about-ai-grid          { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .about-products-grid    { grid-template-columns: 1fr !important; }
          .about-principles-grid  { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </MarketingLayout>
  );
}
