"use client";

import { useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useMarketingTheme } from "@/components/marketing/useMarketingTheme";
import { F } from "@/components/marketing/theme";
import {
  Mail, MapPin, Send, CheckCircle2,
} from "lucide-react";

const ROLES = [
  "VP Treasury",
  "Treasury Analyst",
  "Chief Risk Officer",
  "VP Risk",
  "Portfolio Manager",
  "Head of FX Trading",
  "Compliance Officer",
  "CTO / Head of Technology",
  "Other",
];

const CONTACTS = [
  { icon: <Mail size={20} strokeWidth={1.5} />, label: "General Inquiries", value: "info@orderterminal.com", href: "mailto:info@orderterminal.com" },
  { icon: <Mail size={20} strokeWidth={1.5} />, label: "Sales", value: "sales@orderterminal.com", href: "mailto:sales@orderterminal.com" },
  { icon: <Mail size={20} strokeWidth={1.5} />, label: "Support", value: "support@orderterminal.com", href: "mailto:support@orderterminal.com" },
  { icon: <MapPin size={20} strokeWidth={1.5} />, label: "Office", value: "London, United Kingdom", href: null },
];

export default function ContactPage() {
  const { T, dk, mob } = useMarketingTheme();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", company: "", role: "", message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    fontFamily: F.ui,
    fontSize: 14,
    color: T.text,
    background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    outline: "none",
    transition: "border-color .2s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: F.ui,
    fontSize: 13,
    fontWeight: 600,
    color: T.text,
    marginBottom: 6,
  };

  return (
    <MarketingLayout>
      <style>{`
        .ct-input:focus{border-color:${T.accent} !important;box-shadow:0 0 0 3px ${dk ? "rgba(34,211,238,0.1)" : "rgba(30,58,95,0.08)"}}
        .ct-contact{transition:all .2s}
        .ct-contact:hover{background:${dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"} !important}
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
            CONTACT
          </div>
          <h1 style={{
            fontFamily: F.heading, fontSize: mob ? 36 : 56, fontWeight: 800,
            letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0,
            color: dk ? "#eeeef2" : T.accent,
          }}>
            Contact Us
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: mob ? 16 : 18, color: T.textSub,
            maxWidth: 500, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Let&apos;s discuss how ORDR can transform your hedge operations.
          </p>
        </div>
      </section>

      {/* Two-column layout */}
      <section style={{
        padding: mob ? "48px 20px 64px" : "80px 48px 96px",
        maxWidth: 1100, margin: "0 auto",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: mob ? "1fr" : "1.2fr 0.8fr",
          gap: mob ? 40 : 48,
        }}>
          {/* Left: Form */}
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: 16, padding: mob ? "28px 20px" : "40px 36px",
            boxShadow: T.cardShadow,
          }}>
            {submitted ? (
              <div style={{
                textAlign: "center", padding: "60px 20px",
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: dk ? "rgba(52,211,153,0.1)" : "rgba(22,163,74,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 24px",
                }}>
                  <CheckCircle2 size={32} style={{ color: T.green }} />
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 24, fontWeight: 700,
                  margin: "0 0 12px", color: T.text,
                }}>
                  Thank you
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 15, color: T.textSub, lineHeight: 1.6,
                  maxWidth: 360, margin: "0 auto",
                }}>
                  We have received your message and will get back to you within
                  one business day.
                </p>
              </div>
            ) : (
              <>
                <h2 style={{
                  fontFamily: F.heading, fontSize: 22, fontWeight: 700,
                  margin: "0 0 24px", color: T.text,
                }}>
                  Send us a message
                </h2>
                <form onSubmit={handleSubmit} style={{
                  display: "flex", flexDirection: "column", gap: 20,
                }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: mob ? "1fr" : "1fr 1fr",
                    gap: 16,
                  }}>
                    <div>
                      <label style={labelStyle}>Name</label>
                      <input
                        className="ct-input"
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Your name"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input
                        className="ct-input"
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="you@company.com"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: mob ? "1fr" : "1fr 1fr",
                    gap: 16,
                  }}>
                    <div>
                      <label style={labelStyle}>Company</label>
                      <input
                        className="ct-input"
                        type="text"
                        value={form.company}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        placeholder="Company name"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Role</label>
                      <select
                        className="ct-input"
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                        style={{
                          ...inputStyle,
                          appearance: "none" as const,
                          cursor: "pointer",
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(T.textDim)}' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "right 12px center",
                        }}
                      >
                        <option value="">Select role</option>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Message</label>
                    <textarea
                      className="ct-input"
                      required
                      rows={5}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Tell us about your hedging needs..."
                      style={{
                        ...inputStyle,
                        resize: "vertical" as const,
                        minHeight: 120,
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    style={{
                      fontFamily: F.ui, fontSize: 15, fontWeight: 600,
                      color: dk ? "#000" : "#fff",
                      background: T.accent,
                      padding: "13px 28px", borderRadius: 10,
                      border: "none", cursor: "pointer",
                      display: "inline-flex", alignItems: "center",
                      justifyContent: "center", gap: 8,
                      transition: "opacity .2s",
                    }}
                  >
                    <Send size={16} /> Send Message
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Right: Contact Info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{
              fontFamily: F.heading, fontSize: 22, fontWeight: 700,
              margin: "0 0 8px", color: T.text,
            }}>
              Get in touch
            </h2>
            <p style={{
              fontFamily: F.ui, fontSize: 14, color: T.textSub,
              lineHeight: 1.6, margin: "0 0 8px",
            }}>
              Reach out directly or fill in the form and our team will respond
              within one business day.
            </p>
            {CONTACTS.map((c) => (
              <div
                key={c.label}
                className="ct-contact"
                style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  padding: "16px 18px",
                  background: T.bgCard, border: `1px solid ${T.border}`,
                  borderRadius: 12,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: dk ? T.accentSoft : T.accentSoft,
                  color: T.accent,
                }}>
                  {c.icon}
                </div>
                <div>
                  <div style={{
                    fontFamily: F.ui, fontSize: 13, fontWeight: 600,
                    color: T.text, marginBottom: 2,
                  }}>
                    {c.label}
                  </div>
                  {c.href ? (
                    <a
                      href={c.href}
                      style={{
                        fontFamily: F.mono, fontSize: 13, color: T.accent,
                        textDecoration: "none",
                      }}
                    >
                      {c.value}
                    </a>
                  ) : (
                    <span style={{
                      fontFamily: F.ui, fontSize: 13, color: T.textSub,
                    }}>
                      {c.value}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
