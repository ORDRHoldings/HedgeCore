"use client";

import Link from "next/link";
import { C, F, PRODUCTS, SOLUTIONS } from "./theme";

const COMPANY = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Careers", href: "/careers" },
];

const LEGAL = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Security", href: "/security" },
];

export default function MarketingFooter() {
  const col: React.CSSProperties = { fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", marginBottom: 16 };
  const lnk: React.CSSProperties = { fontSize: 13, color: "rgba(255,255,255,0.45)", textDecoration: "none", display: "block", marginBottom: 10, fontFamily: F.ui };

  return (
    <footer style={{ background: C.bgDark, padding: "64px 48px 32px", color: "rgba(255,255,255,0.4)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr", gap: 40 }}>
          {/* Brand */}
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "0.06em", marginBottom: 16 }}>ORDR</div>
            <p style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 260, margin: 0 }}>
              Institutional-grade FX hedge governance. Deterministic computation, tamper-evident audit, regulatory alignment.
            </p>
          </div>

          {/* Products */}
          <div>
            <div style={col}>PRODUCTS</div>
            {PRODUCTS.map(p => <Link key={p.slug} href={`/products/${p.slug}`} style={lnk}>{p.name}</Link>)}
          </div>

          {/* Solutions */}
          <div>
            <div style={col}>SOLUTIONS</div>
            {SOLUTIONS.map(s => <Link key={s.slug} href={`/solutions/${s.slug}`} style={lnk}>{s.name}</Link>)}
          </div>

          {/* Company */}
          <div>
            <div style={col}>COMPANY</div>
            {COMPANY.map(l => <Link key={l.label} href={l.href} style={lnk}>{l.label}</Link>)}
          </div>

          {/* Legal */}
          <div>
            <div style={col}>LEGAL</div>
            {LEGAL.map(l => <Link key={l.label} href={l.href} style={lnk}>{l.label}</Link>)}
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 48, paddingTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontFamily: F.ui, fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
            &copy; {new Date().getFullYear()} ORDR Terminal. All rights reserved.
          </span>
          <a href="mailto:info@orderterminal.com" style={{ fontFamily: F.mono, fontSize: 12, color: "rgba(255,255,255,0.25)", textDecoration: "none" }}>info@orderterminal.com</a>
        </div>
      </div>

      <style>{`@media(max-width:900px){footer>div>div:first-child{grid-template-columns:1fr !important;gap:32px !important}}`}</style>
    </footer>
  );
}
