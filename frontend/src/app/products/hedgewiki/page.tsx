"use client";

import Link from "next/link";
import {
  ChevronLeft, ExternalLink, FileText, Scale, Library, ShieldCheck, Award, Search,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const FEATURES = [
  { icon: <FileText size={20} />, title: "ISDA Definitions", desc: "Complete reference for ISDA 2006 Definitions, FX supplements, protocol documentation. The definitive derivatives glossary." },
  { icon: <Scale size={20} />, title: "IFRS 9 / ASC 815 Guide", desc: "Hedge accounting standards, effectiveness testing requirements, documentation templates. Everything for compliance." },
  { icon: <Library size={20} />, title: "Methodology Library", desc: "Valuation methodologies, risk metrics, pricing models for FX derivatives. From Black-Scholes to Monte Carlo." },
  { icon: <ShieldCheck size={20} />, title: "Regulatory Reference", desc: "EMIR, MiFID II, Dodd-Frank, BCBS FRTB requirements and compliance checklists. Always current, always accessible." },
  { icon: <Award size={20} />, title: "Best Practices", desc: "Treasury management frameworks, hedge policy templates, governance playbooks. Learn from institutional standards." },
  { icon: <Search size={20} />, title: "Searchable Index", desc: "Full-text search across thousands of definitions, standards, and guidelines. Find what you need in seconds." },
];

const STATS = [
  { value: "1,000+", label: "Entries" },
  { value: "6", label: "Standards" },
  { value: "Full-Text", label: "Search" },
];

export default function HedgeWikiPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>ORDR HedgeWiki</h1>
        <p style={{ fontFamily: F.ui, fontSize: 18, color: C.textSub, maxWidth: 600, margin: "0 auto 32px", lineHeight: 1.6 }}>
          The institutional knowledge base. ISDA definitions, IFRS 9 / ASC 815 guidance, regulatory reference, and methodology library.
        </p>
        <a href="https://hedge-wiki.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Open HedgeWiki <ExternalLink size={16} />
        </a>
      </section>

      {/* Stats */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 48px" }}>
        <div className="stats-row" style={{ maxWidth: 800, margin: "0 auto", display: "flex", justifyContent: "center", gap: 64 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 28, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 48px", color: C.text }}>Capabilities</h2>
        <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ color: C.accent, marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>{f.title}</div>
              <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Explore the knowledge base</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>ISDA definitions, regulatory guides, and methodology reference.</p>
        <a href="https://hedge-wiki.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Open HedgeWiki <ExternalLink size={16} />
        </a>
      </section>

      <style>{`@media(max-width:768px){
        .feat-grid { grid-template-columns: 1fr !important; }
        .stats-row { flex-wrap: wrap; gap: 32px !important; }
      }`}</style>
    </MarketingLayout>
  );
}
