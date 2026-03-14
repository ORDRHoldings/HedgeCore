"use client";

import { useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";
import { Mail, MapPin, Send, CheckCircle2 } from "lucide-react";

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
    color: C.text,
    background: "#fff",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: F.ui,
    fontSize: 13,
    fontWeight: 600,
    color: C.text,
    marginBottom: 6,
  };

  return (
    <MarketingLayout>
      <style>{`
        .ct-input:focus{border-color:${C.accent} !important;box-shadow:0 0 0 3px rgba(30,58,95,0.08)}
      `}</style>

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
            Contact Us
          </h1>
          <p style={{
            fontFamily: F.ui, fontSize: 18, color: C.textSub,
            maxWidth: 500, margin: "20px auto 0", lineHeight: 1.6,
          }}>
            Let&apos;s discuss how ORDR can transform your hedge operations.
          </p>
        </div>
      </section>

      {/* Two-column layout */}
      <section style={{
        padding: "80px 48px 96px",
        maxWidth: 1100, margin: "0 auto",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 48,
        }}>
          {/* Left: Form */}
          <div style={{
            background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "40px 36px",
          }}>
            {submitted ? (
              <div style={{
                textAlign: "center", padding: "60px 20px",
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: "rgba(22,163,74,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 24px",
                }}>
                  <CheckCircle2 size={32} style={{ color: "#16a34a" }} />
                </div>
                <h3 style={{
                  fontFamily: F.heading, fontSize: 24, fontWeight: 700,
                  margin: "0 0 12px", color: C.text,
                }}>
                  Thank you
                </h3>
                <p style={{
                  fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.6,
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
                  margin: "0 0 24px", color: C.text,
                }}>
                  Send us a message
                </h2>
                <form onSubmit={handleSubmit} style={{
                  display: "flex", flexDirection: "column", gap: 20,
                }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
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
                    gridTemplateColumns: "1fr 1fr",
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
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
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
                      color: "#fff",
                      background: C.accent,
                      padding: "13px 28px", borderRadius: 8,
                      border: "none", cursor: "pointer",
                      display: "inline-flex", alignItems: "center",
                      justifyContent: "center", gap: 8,
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
              margin: "0 0 8px", color: C.text,
            }}>
              Get in touch
            </h2>
            <p style={{
              fontFamily: F.ui, fontSize: 14, color: C.textSub,
              lineHeight: 1.6, margin: "0 0 8px",
            }}>
              Reach out directly or fill in the form and our team will respond
              within one business day.
            </p>
            {CONTACTS.map((c) => (
              <div
                key={c.label}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  padding: "16px 18px",
                  background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 10,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: C.accentLight, color: C.accent,
                }}>
                  {c.icon}
                </div>
                <div>
                  <div style={{
                    fontFamily: F.ui, fontSize: 13, fontWeight: 600,
                    color: C.text, marginBottom: 2,
                  }}>
                    {c.label}
                  </div>
                  {c.href ? (
                    <a
                      href={c.href}
                      style={{
                        fontFamily: F.mono, fontSize: 13, color: C.accent,
                        textDecoration: "none",
                      }}
                    >
                      {c.value}
                    </a>
                  ) : (
                    <span style={{
                      fontFamily: F.ui, fontSize: 13, color: C.textSub,
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

      <style>{`
        @media(max-width:768px){
          section{padding:60px 20px !important}
          h1{font-size:36px !important}
          div[style*="grid-template-columns: 1.2fr"]{grid-template-columns:1fr !important}
          div[style*="grid-template-columns: 1fr 1fr"]{grid-template-columns:1fr !important}
        }
      `}</style>
    </MarketingLayout>
  );
}
