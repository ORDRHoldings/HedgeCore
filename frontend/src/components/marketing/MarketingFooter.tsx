"use client";

import Link from "next/link";
import { Linkedin, Github } from "lucide-react";
import type { MarketingTheme } from "./theme";
import { F, PRODUCTS, SOLUTIONS } from "./theme";

interface Props {
  theme: MarketingTheme;
}

export default function MarketingFooter({ theme: T }: Props) {
  return (
    <footer style={{
      background: T.footerBg,
      borderTop: `1px solid rgba(255,255,255,0.06)`,
      padding: "56px 48px 32px",
      color: "rgba(255,255,255,0.4)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr",
          gap: 40,
        }}>
          {/* ── Brand column ── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: F.mono,
                fontSize: 13,
                fontWeight: 800,
                background: "linear-gradient(135deg, #22d3ee, #818cf8)",
                color: "#000",
              }}>O</div>
              <span style={{
                fontFamily: F.mono,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.8)",
              }}>ORDR Terminal</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 260, margin: 0 }}>
              Institutional-grade FX hedge governance. Built for Treasury teams, risk committees, and regulators.
            </p>
          </div>

          {/* ── Products column ── */}
          <div>
            <div style={{
              fontFamily: F.mono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.25)",
              marginBottom: 16,
            }}>PRODUCTS</div>
            {PRODUCTS.map(p => (
              <div key={p.slug} style={{ marginBottom: 10 }}>
                <Link
                  href={`/products/${p.slug}`}
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.4)",
                    textDecoration: "none",
                  }}
                >{p.name}</Link>
              </div>
            ))}
          </div>

          {/* ── Solutions column ── */}
          <div>
            <div style={{
              fontFamily: F.mono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.25)",
              marginBottom: 16,
            }}>SOLUTIONS</div>
            {SOLUTIONS.map(s => (
              <div key={s.slug} style={{ marginBottom: 10 }}>
                <Link
                  href={`/solutions/${s.slug}`}
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.4)",
                    textDecoration: "none",
                  }}
                >{s.name}</Link>
              </div>
            ))}
          </div>

          {/* ── Company column ── */}
          <div>
            <div style={{
              fontFamily: F.mono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.25)",
              marginBottom: 16,
            }}>COMPANY</div>
            {[
              { label: "About", href: "/about" },
              { label: "Careers", href: "/careers" },
              { label: "Blog", href: "/blog" },
              { label: "Contact", href: "mailto:info@orderterminal.com" },
            ].map(l => (
              <div key={l.label} style={{ marginBottom: 10 }}>
                {l.href.startsWith("mailto:") ? (
                  <a
                    href={l.href}
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.4)",
                      textDecoration: "none",
                    }}
                  >{l.label}</a>
                ) : (
                  <Link
                    href={l.href}
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.4)",
                      textDecoration: "none",
                    }}
                  >{l.label}</Link>
                )}
              </div>
            ))}
          </div>

          {/* ── Legal column ── */}
          <div>
            <div style={{
              fontFamily: F.mono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.25)",
              marginBottom: 16,
            }}>LEGAL</div>
            {[
              { label: "Privacy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
              { label: "Security", href: "/security" },
            ].map(l => (
              <div key={l.label} style={{ marginBottom: 10 }}>
                <Link
                  href={l.href}
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.4)",
                    textDecoration: "none",
                  }}
                >{l.label}</Link>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          marginTop: 48,
          paddingTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <span style={{
            fontFamily: F.ui,
            fontSize: 12,
            color: "rgba(255,255,255,0.25)",
          }}>
            &copy; {new Date().getFullYear()} ORDR Terminal. All rights reserved.
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <a
              href="mailto:info@orderterminal.com"
              style={{
                fontFamily: F.mono,
                fontSize: 12,
                color: "rgba(255,255,255,0.3)",
                textDecoration: "none",
                marginRight: 12,
              }}
            >info@orderterminal.com</a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            ><Linkedin size={14} /></a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            ><Github size={14} /></a>
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                fontFamily: F.mono,
                fontSize: 13,
                fontWeight: 700,
              }}
            >X</a>
          </div>
        </div>
      </div>

      {/* ── Responsive overrides for mobile ── */}
      <style>{`
        @media (max-width: 900px) {
          footer > div > div:first-child {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
        }
      `}</style>
    </footer>
  );
}
