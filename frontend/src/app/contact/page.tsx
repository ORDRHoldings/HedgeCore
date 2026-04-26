"use client";

import { useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import {
  Mail, MapPin, Clock, Shield, CheckCircle2, ArrowRight,
  Building2, BarChart3, Zap, Globe, ChevronDown,
} from "lucide-react";

const INQUIRY_TYPES = [
  { id: "demo",       label: "Request a Demo",          desc: "Structured 45-min walkthrough with a solutions engineer" },
  { id: "eval",       label: "Technical Evaluation",    desc: "Sandbox access, API docs, and integration assessment" },
  { id: "partner",    label: "Partnership / Integration", desc: "Technology partnerships, data integrations, or reseller" },
  { id: "compliance", label: "Procurement / Compliance", desc: "Security review, vendor assessment, or compliance docs" },
  { id: "press",      label: "Press & Media",           desc: "Interviews, announcements, or editorial requests" },
  { id: "general",    label: "General Inquiry",         desc: "Questions about pricing, roadmap, or capabilities" },
];

const PRODUCTS_LIST = [
  "ORDR Treasury", "ORDR Market", "ORDR Portfolio", "ORDR Labs",
  "ORDR Polisophic", "ORDR Fund", "ORDR HedgeWiki", "ORDR FinHub", "GOLDX",
];

const TIMELINE_STEPS = [
  {
    n: "01",
    title: "Inquiry reviewed",
    desc: "A solutions engineer reads your submission and researches your organisation. Within 4 business hours.",
  },
  {
    n: "02",
    title: "Discovery call",
    desc: "30-minute call to map your use case, exposure size, and regulatory requirements to the right ORDR products.",
  },
  {
    n: "03",
    title: "Tailored demo + sandbox",
    desc: "Structured walkthrough of your specific workflow. Sandbox access with real calculation engine granted post-NDA.",
  },
];

const ICP_PROFILES = [
  {
    icon: Building2,
    role: "Head of Treasury / CFO",
    org: "Corporate — $50M–$5B revenue",
    ask: "IFRS 9 hedge accounting, 4-eyes governance, policy presets, and WORM audit trail for external audit.",
  },
  {
    icon: Shield,
    role: "Chief Risk Officer",
    org: "Bank / Insurance / Asset Manager",
    ask: "R1-R8 risk decomposition, VaR / ES, concentration monitoring, Solvency II SCR modeling.",
  },
  {
    icon: BarChart3,
    role: "Fund Manager / GP",
    org: "Private Fund — $10M–$500M AUM",
    ask: "Multi-currency pooled capital, pro-rata LP allocation, dual-portal reporting, period locking.",
  },
  {
    icon: Zap,
    role: "Algorithmic Trader",
    org: "Prop Desk / Family Office",
    ask: "ORDR Market real-time charting, AI-coached journal, backtesting, Python / JS strategy engine.",
  },
];

const CHANNELS = [
  { label: "Sales & Demos",       email: "sales@ordrterminal.com",      note: "< 4h response" },
  { label: "Technical Support",   email: "support@ordrterminal.com",     note: "Business hours" },
  { label: "Legal / Compliance",  email: "legal@ordrterminal.com",       note: "NDA, security review" },
  { label: "Press & Media",       email: "press@ordrterminal.com",       note: "Media inquiries" },
];

export default function ContactPage() {
  const isMobile = useIsMobile();
  const [inquiryType, setInquiryType] = useState("demo");
  const [products, setProducts] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const toggleProduct = (p: string) =>
    setProducts((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const selectedInquiry = INQUIRY_TYPES.find((t) => t.id === inquiryType)!;

  return (
    <MarketingLayout>

      {/* Hero bar */}
      <section style={{
        background: C.accent,
        paddingTop: 100,
        paddingBottom: 56,
        paddingLeft: isMobile ? 24 : 48,
        paddingRight: isMobile ? 24 : 48,
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{
            fontFamily: F.mono, fontSize: 10, fontWeight: 600,
            letterSpacing: "0.14em", color: "rgba(255,255,255,0.45)",
            textTransform: "uppercase", marginBottom: 16,
          }}>
            ORDR TERMINAL — CONTACT &amp; INQUIRY
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
            <div>
              <h1 style={{
                fontFamily: F.heading, fontSize: 52, fontWeight: 800,
                letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
                color: "#fff",
              }}>
                Talk to a solutions engineer.
              </h1>
              <p style={{
                fontFamily: F.ui, fontSize: 17, color: "rgba(255,255,255,0.65)",
                margin: "14px 0 0", maxWidth: 560, lineHeight: 1.65,
              }}>
                Every inquiry is reviewed by a human who understands institutional FX, treasury governance,
                and risk infrastructure — not a generic sales queue.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 260 }}>
              {[
                { icon: Clock,  text: "Response within 4 business hours" },
                { icon: Shield, text: "NDA available before sandbox access" },
                { icon: Globe,  text: "Serving clients in 14+ countries" },
              ].map((b) => (
                <div key={b.text} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <b.icon size={13} color="rgba(255,255,255,0.5)" />
                  <span style={{ fontFamily: F.ui, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{b.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Compliance strip */}
      <div style={{
        background: "#0F1E30",
        padding: `10px ${isMobile ? 24 : 48}px`,
        display: "flex", gap: 32, flexWrap: "wrap",
        justifyContent: "center",
      }}>
        {["IFRS 9 Compliant", "ASC 815 Supported", "WORM Audit Trail", "SHA-256 Hash Chain", "4-Eyes Governance", "SOC-2 In Progress"].map((b) => (
          <span key={b} style={{
            fontFamily: F.mono, fontSize: 10, fontWeight: 600,
            color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}>{b}</span>
        ))}
      </div>

      {/* Main content */}
      <section style={{ background: "#F7F8FA", padding: `64px ${isMobile ? 24 : 48}px` }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto",
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 380px", gap: 32,
        }}>

          {/* LEFT: Form */}
          <div style={{
            background: "#fff", border: `1px solid ${C.border}`,
            borderRadius: 8, overflow: "hidden",
          }}>

            {submitted ? (
              <div style={{ padding: "80px 48px", textAlign: "center" }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: "rgba(34,197,94,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 24px",
                }}>
                  <CheckCircle2 size={32} color="#22C55E" />
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 28, fontWeight: 800,
                  color: C.text, margin: "0 0 12px",
                }}>
                  Inquiry received
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 15, color: C.textSub,
                  maxWidth: 380, margin: "0 auto 32px", lineHeight: 1.7,
                }}>
                  A solutions engineer will review your submission and reach out
                  within 4 business hours. Check your spam folder if you don&apos;t hear from us.
                </p>
                <div style={{
                  background: "#F9FAFB", border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: "16px 24px", display: "inline-block", textAlign: "left",
                }}>
                  <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    WHAT HAPPENS NEXT
                  </div>
                  {TIMELINE_STEPS.map((s) => (
                    <div key={s.n} style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                      <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.accent, minWidth: 20 }}>{s.n}</span>
                      <span style={{ fontFamily: F.ui, fontSize: 12, color: C.textSub }}>{s.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Inquiry type selector */}
                <div style={{ borderBottom: `1px solid ${C.border}`, padding: "28px 32px" }}>
                  <div style={{
                    fontFamily: F.mono, fontSize: 10, fontWeight: 600,
                    color: C.textMuted, letterSpacing: "0.12em",
                    textTransform: "uppercase", marginBottom: 14,
                  }}>
                    INQUIRY TYPE
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 8 }}>
                    {INQUIRY_TYPES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setInquiryType(t.id)}
                        style={{
                          background: inquiryType === t.id ? C.accent : "#FAFAFA",
                          border: `1px solid ${inquiryType === t.id ? C.accent : C.border}`,
                          borderRadius: 5, padding: "10px 12px",
                          textAlign: "left", cursor: "pointer",
                          transition: "all 0.12s ease",
                        }}
                      >
                        <div style={{
                          fontFamily: F.ui, fontSize: 12, fontWeight: 600,
                          color: inquiryType === t.id ? "#fff" : C.text,
                          marginBottom: 3,
                        }}>{t.label}</div>
                        <div style={{
                          fontFamily: F.ui, fontSize: 10,
                          color: inquiryType === t.id ? "rgba(255,255,255,0.6)" : C.textMuted,
                          lineHeight: 1.4,
                        }}>{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Form body */}
                <form
                  style={{ padding: "32px 32px" }}
                  onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
                >
                  {/* Name row */}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    {[["First Name", "text", true], ["Last Name", "text", false]].map(([label, type, req]) => (
                      <div key={label as string}>
                        <label style={{
                          display: "block", fontFamily: F.mono, fontSize: 10, fontWeight: 600,
                          color: C.textMuted, letterSpacing: "0.1em",
                          textTransform: "uppercase", marginBottom: 6,
                        }}>{label as string}{req ? " *" : ""}</label>
                        <input
                          type={type as string}
                          required={req as boolean}
                          style={{
                            width: "100%", padding: "10px 12px",
                            border: `1px solid ${C.border}`, borderRadius: 5,
                            fontFamily: F.ui, fontSize: 13, color: C.text,
                            background: "#fff", outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Work email */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                      WORK EMAIL *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="you@company.com"
                      style={{
                        width: "100%", padding: "10px 12px",
                        border: `1px solid ${C.border}`, borderRadius: 5,
                        fontFamily: F.ui, fontSize: 13, color: C.text,
                        background: "#fff", outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                      We do not accept personal email addresses for institutional inquiries.
                    </div>
                  </div>

                  {/* Company + Role */}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: "block", fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                        COMPANY *
                      </label>
                      <input
                        type="text"
                        required
                        style={{
                          width: "100%", padding: "10px 12px",
                          border: `1px solid ${C.border}`, borderRadius: 5,
                          fontFamily: F.ui, fontSize: 13, color: C.text,
                          background: "#fff", outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                        YOUR ROLE *
                      </label>
                      <div style={{ position: "relative" }}>
                        <select
                          required
                          style={{
                            width: "100%", padding: "10px 32px 10px 12px",
                            border: `1px solid ${C.border}`, borderRadius: 5,
                            fontFamily: F.ui, fontSize: 13, color: C.text,
                            background: "#fff", outline: "none",
                            appearance: "none", cursor: "pointer",
                            boxSizing: "border-box",
                          }}
                        >
                          <option value="">Select role…</option>
                          <option>Group Treasurer / Head of Treasury</option>
                          <option>CFO / VP Finance</option>
                          <option>CRO / VP Risk</option>
                          <option>Portfolio Manager</option>
                          <option>Head of FX / FX Dealer</option>
                          <option>Fund Manager / GP</option>
                          <option>Algorithmic Trader</option>
                          <option>Compliance / Regulatory</option>
                          <option>CTO / Head of Engineering</option>
                          <option>Procurement / Vendor Management</option>
                          <option>Other</option>
                        </select>
                        <ChevronDown size={14} color={C.textMuted} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                      </div>
                    </div>
                  </div>

                  {/* Company size + FX exposure */}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: "block", fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                        COMPANY SIZE
                      </label>
                      <div style={{ position: "relative" }}>
                        <select
                          style={{
                            width: "100%", padding: "10px 32px 10px 12px",
                            border: `1px solid ${C.border}`, borderRadius: 5,
                            fontFamily: F.ui, fontSize: 13, color: C.text,
                            background: "#fff", outline: "none",
                            appearance: "none", cursor: "pointer",
                            boxSizing: "border-box",
                          }}
                        >
                          <option value="">Select…</option>
                          <option>1–50 employees</option>
                          <option>51–250 employees</option>
                          <option>251–1,000 employees</option>
                          <option>1,001–5,000 employees</option>
                          <option>5,000+ employees</option>
                        </select>
                        <ChevronDown size={14} color={C.textMuted} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                        FX EXPOSURE / AUM
                      </label>
                      <div style={{ position: "relative" }}>
                        <select
                          style={{
                            width: "100%", padding: "10px 32px 10px 12px",
                            border: `1px solid ${C.border}`, borderRadius: 5,
                            fontFamily: F.ui, fontSize: 13, color: C.text,
                            background: "#fff", outline: "none",
                            appearance: "none", cursor: "pointer",
                            boxSizing: "border-box",
                          }}
                        >
                          <option value="">Select…</option>
                          <option>Under $10M</option>
                          <option>$10M – $100M</option>
                          <option>$100M – $500M</option>
                          <option>$500M – $2B</option>
                          <option>Over $2B</option>
                          <option>Not applicable</option>
                        </select>
                        <ChevronDown size={14} color={C.textMuted} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                      </div>
                    </div>
                  </div>

                  {/* Products of interest */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                      PRODUCTS OF INTEREST
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {PRODUCTS_LIST.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => toggleProduct(p)}
                          style={{
                            padding: "5px 12px",
                            border: `1px solid ${products.includes(p) ? C.accent : C.border}`,
                            borderRadius: 4, cursor: "pointer",
                            fontFamily: F.mono, fontSize: 10, fontWeight: 600,
                            color: products.includes(p) ? "#fff" : C.textSub,
                            background: products.includes(p) ? C.accent : "#FAFAFA",
                            transition: "all 0.1s",
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                      EVALUATION TIMELINE
                    </label>
                    <div style={{ position: "relative" }}>
                      <select
                        style={{
                          width: "100%", padding: "10px 32px 10px 12px",
                          border: `1px solid ${C.border}`, borderRadius: 5,
                          fontFamily: F.ui, fontSize: 13, color: C.text,
                          background: "#fff", outline: "none",
                          appearance: "none", cursor: "pointer",
                          boxSizing: "border-box",
                        }}
                      >
                        <option>Immediate — within 30 days</option>
                        <option>Q2 2026 — April–June</option>
                        <option>H2 2026 — July onwards</option>
                        <option>Exploring — no fixed timeline</option>
                      </select>
                      <ChevronDown size={14} color={C.textMuted} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                    </div>
                  </div>

                  {/* Message */}
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: "block", fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                      USE CASE / ADDITIONAL CONTEXT
                    </label>
                    <textarea
                      rows={4}
                      placeholder={`Tell us about your current setup, what you're trying to solve, or questions about ${selectedInquiry.label.toLowerCase()}…`}
                      style={{
                        width: "100%", padding: "10px 12px",
                        border: `1px solid ${C.border}`, borderRadius: 5,
                        fontFamily: F.ui, fontSize: 13, color: C.text,
                        background: "#fff", outline: "none",
                        resize: "none", lineHeight: 1.6,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    style={{
                      width: "100%", padding: "14px 24px",
                      background: C.accent, color: "#fff",
                      border: "none", borderRadius: 5,
                      fontFamily: F.ui, fontSize: 13, fontWeight: 700,
                      cursor: "pointer", letterSpacing: "0.05em",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      transition: "background 0.15s ease",
                    }}
                  >
                    SUBMIT INQUIRY <ArrowRight size={15} />
                  </button>

                  <p style={{
                    fontFamily: F.ui, fontSize: 11, color: C.textMuted,
                    textAlign: "center", marginTop: 12, lineHeight: 1.5,
                  }}>
                    By submitting you agree to our{" "}
                    <a href="/privacy" style={{ color: C.accent, textDecoration: "none" }}>Privacy Policy</a>
                    {" "}and{" "}
                    <a href="/terms" style={{ color: C.accent, textDecoration: "none" }}>Terms of Service</a>.
                    We do not sell or share your data.
                  </p>
                </form>
              </>
            )}
          </div>

          {/* RIGHT: sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* What happens next */}
            <div style={{
              background: "#fff", border: `1px solid ${C.border}`,
              borderRadius: 8, overflow: "hidden",
            }}>
              <div style={{
                padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
                background: "#FAFAFA",
              }}>
                <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  WHAT HAPPENS NEXT
                </div>
              </div>
              <div style={{ padding: "20px" }}>
                {TIMELINE_STEPS.map((s, i) => (
                  <div key={s.n} style={{
                    display: "flex", gap: 14,
                    paddingBottom: i < TIMELINE_STEPS.length - 1 ? 18 : 0,
                    borderBottom: i < TIMELINE_STEPS.length - 1 ? `1px dashed ${C.border}` : "none",
                    marginBottom: i < TIMELINE_STEPS.length - 1 ? 18 : 0,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: C.accentLight, border: `1px solid rgba(30,58,95,0.15)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.accent }}>{s.n}</span>
                    </div>
                    <div>
                      <div style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{s.title}</div>
                      <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textSub, lineHeight: 1.55 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Direct channels */}
            <div style={{
              background: "#fff", border: `1px solid ${C.border}`,
              borderRadius: 8, overflow: "hidden",
            }}>
              <div style={{
                padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
                background: "#FAFAFA",
              }}>
                <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  DIRECT CHANNELS
                </div>
              </div>
              <div style={{ padding: "12px 0" }}>
                {CHANNELS.map((ch) => (
                  <div key={ch.label} style={{
                    padding: "10px 20px",
                    borderBottom: `1px solid ${C.borderLight}`,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <Mail size={13} color={C.textMuted} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: F.ui, fontSize: 11, fontWeight: 600, color: C.textSub, marginBottom: 1 }}>{ch.label}</div>
                      <a href={`mailto:${ch.email}`} style={{
                        fontFamily: F.mono, fontSize: 11, color: C.accent, textDecoration: "none",
                        display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{ch.email}</a>
                    </div>
                    <span style={{
                      fontFamily: F.mono, fontSize: 10, color: C.textMuted,
                      letterSpacing: "0.04em", whiteSpace: "nowrap",
                    }}>{ch.note}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Office */}
            <div style={{
              background: "#fff", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "20px",
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <MapPin size={14} color={C.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontFamily: F.ui, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>Headquarters</div>
                  <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textSub, lineHeight: 1.55 }}>
                    Newport Beach, CA, USA
                  </div>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.textMuted, marginTop: 6 }}>
                    UTC–7 (PDT) · Mon–Fri 8am–6pm
                  </div>
                </div>
              </div>
            </div>

            {/* System status */}
            <div style={{
              background: "#0F1E30",
              border: "1px solid #1E3A5F",
              borderRadius: 8, padding: "20px",
            }}>
              <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
                SYSTEM STATUS
              </div>
              {[
                { label: "API", status: "OPERATIONAL" },
                { label: "Calculation Engine", status: "OPERATIONAL" },
                { label: "Audit Chain", status: "OPERATIONAL" },
                { label: "Market Data Feed", status: "OPERATIONAL" },
              ].map((s) => (
                <div key={s.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <span style={{ fontFamily: F.ui, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{s.label}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "#22C55E",
                      boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                      display: "inline-block",
                    }} />
                    <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: "#22C55E", letterSpacing: "0.06em" }}>{s.status}</span>
                  </span>
                </div>
              ))}
              <div style={{ fontFamily: F.mono, fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 10 }}>
                API LATENCY: 12ms · Uptime: 99.97%
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ICP profiles */}
      <section style={{ background: "#fff", padding: `72px ${isMobile ? 24 : 48}px`, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              fontFamily: F.mono, fontSize: 10, fontWeight: 600,
              color: C.textMuted, letterSpacing: "0.12em",
              textTransform: "uppercase", marginBottom: 12,
            }}>
              WHO WE WORK WITH
            </div>
            <h2 style={{
              fontFamily: F.heading, fontSize: 36, fontWeight: 800,
              letterSpacing: "-0.02em", margin: 0, color: C.accent,
            }}>
              Built for institutional operators
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16 }}>
            {ICP_PROFILES.map((p) => (
              <div key={p.role} style={{
                border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "24px 20px", background: "#FAFAFA",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: C.accentLight, display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 14,
                }}>
                  <p.icon size={18} color={C.accent} strokeWidth={1.5} />
                </div>
                <div style={{ fontFamily: F.heading, fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                  {p.role}
                </div>
                <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.06em", marginBottom: 10, textTransform: "uppercase" }}>
                  {p.org}
                </div>
                <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>
                  {p.ask}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: "#F7F8FA", padding: `72px ${isMobile ? 24 : 48}px`, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              fontFamily: F.mono, fontSize: 10, fontWeight: 600,
              color: C.textMuted, letterSpacing: "0.12em",
              textTransform: "uppercase", marginBottom: 12,
            }}>
              FREQUENTLY ASKED
            </div>
            <h2 style={{
              fontFamily: F.heading, fontSize: 32, fontWeight: 800,
              letterSpacing: "-0.02em", margin: 0, color: C.accent,
            }}>
              Common questions
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[
              {
                q: "How long does onboarding take?",
                a: "Most clients are fully operational within 5–10 business days. Corporate treasury teams typically go live in 3 days. Enterprise deployments with custom policy configurations take 2–3 weeks.",
              },
              {
                q: "Is ORDR Terminal a SaaS or on-premise?",
                a: "ORDR Terminal is delivered as a cloud-hosted SaaS with dedicated tenant isolation. Each client has a separate schema, separate WORM audit chain, and separate API credentials. On-premise deployment is available for regulated entities requiring data residency under a separate MSA.",
              },
              {
                q: "Do you offer an NDA before granting sandbox access?",
                a: "Yes. For institutional evaluations we require a mutual NDA before sharing sandbox credentials, engine documentation, and API specifications. Our standard NDA has a 2-year term and covers source code, pricing, and client lists.",
              },
              {
                q: "What is the minimum commitment?",
                a: "Pricing starts at a monthly subscription with no minimum contract for standard tiers. Enterprise agreements (custom SLA, dedicated support, on-premise) are annual. Contact sales for a quote based on your product selection and usage profile.",
              },
              {
                q: "Does ORDR use AI in its calculations?",
                a: "No. Every hedge calculation, risk metric, and effectiveness test runs through a deterministic, hash-locked computation kernel. AI is used exclusively as a communication layer — reading positions, surfacing anomalies, and responding in natural language. The engine never has AI-generated outputs.",
              },
            ].map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>


    </MarketingLayout>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: "#fff", border: `1px solid ${C.border}`,
      borderRadius: 6, overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "18px 24px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, paddingRight: 16 }}>
          {q}
        </span>
        <ChevronDown
          size={16}
          color={C.textMuted}
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
        />
      </button>
      {open && (
        <div style={{
          padding: "0 24px 18px",
          fontFamily: F.ui, fontSize: 13, color: C.textSub, lineHeight: 1.7,
          borderTop: `1px solid ${C.borderLight}`,
          paddingTop: 16,
        }}>
          {a}
        </div>
      )}
    </div>
  );
}
