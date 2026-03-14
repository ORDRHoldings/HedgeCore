"use client";

import Link from "next/link";
import {
  ChevronLeft, ExternalLink, FileText, Scale, Library, ShieldCheck, Award, Search,
  Brain, MessageSquare, BookOpen, Layers,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "1,000+", label: "Entries" },
  { value: "6", label: "Standards" },
  { value: "Full-Text", label: "Search" },
  { value: "AI-Enhanced", label: "Navigation" },
  { value: "Citation", label: "Backed" },
];

const FEATURES = [
  { icon: <FileText size={20} />, title: "ISDA Definitions Reference", desc: "Complete reference for ISDA 2006 Definitions, FX and Currency Option Definitions, supplemental provisions, protocol documentation, and master agreement terms. Every definition is cross-referenced with related terms, usage examples, and practical implications. The AI can explain any ISDA term in context of your specific transaction structure -- ask it what a particular fallback provision means for your EUR/USD forward book and get a targeted, citation-backed answer." },
  { icon: <Scale size={20} />, title: "IFRS 9 Hedge Accounting Guide", desc: "Comprehensive coverage of IFRS 9 hedge accounting requirements: qualifying criteria, hedge effectiveness testing methodologies (prospective and retrospective), documentation requirements, hedge ratio optimization, and rebalancing triggers. Practical guidance on critical terms matching, dollar-offset, regression analysis, and hypothetical derivative approaches. AI navigates the standard for you -- describe your hedge structure and it identifies the relevant IFRS 9 paragraphs, effectiveness test requirements, and documentation templates." },
  { icon: <Library size={20} />, title: "ASC 815 Derivatives Guide", desc: "Full ASC 815 (formerly FAS 133) reference covering derivative instrument classification, fair value and cash flow hedge accounting, net investment hedges, embedded derivatives, and the shortcut method. Cross-referenced with ASC 820 fair value measurement and ASC 830 foreign currency matters. AI provides comparative analysis between ASC 815 and IFRS 9, highlighting where the standards diverge and what the implications are for dual-reporting entities." },
  { icon: <ShieldCheck size={20} />, title: "Regulatory Framework Library", desc: "EMIR trade reporting and clearing obligations, MiFID II transaction reporting, Dodd-Frank swap dealer requirements, BCBS FRTB capital rules, and Basel III counterparty credit risk. Compliance checklists, implementation timelines, and jurisdictional comparison tables. AI tracks regulatory changes and flags updates that affect your operations, explaining new requirements in terms of your existing compliance framework." },
  { icon: <Award size={20} />, title: "Best Practices & Playbooks", desc: "Treasury management frameworks from GARP, AFP, and ACT. Hedge policy templates with governance structures. Board reporting formats, risk appetite statement templates, and treasury committee charter examples. Case studies from institutional implementations. AI recommends relevant playbooks based on your organization size, industry, and regulatory jurisdiction, and helps adapt templates to your specific governance structure." },
  { icon: <Search size={20} />, title: "AI-Powered Semantic Search", desc: "Beyond keyword matching -- the AI understands financial concepts and finds relevant content even when you use different terminology. Search for 'how do I test hedge effectiveness' and get results spanning IFRS 9 B6.4.4, ASC 815-20-25, and practical methodology guides. Contextual search considers your recent queries and portfolio structure to rank results by relevance to your current work." },
  { icon: <BookOpen size={20} />, title: "Methodology Library", desc: "Valuation methodologies for FX forwards, vanilla options, barrier options, and structured products. Risk metrics: VaR, CVaR/ES, PFE, Greeks, and duration. Pricing models from Black-Scholes through Monte Carlo to local volatility. Each methodology includes mathematical derivation, implementation notes, and practical limitations. AI explains mathematical concepts at your preferred technical level -- from executive summary to quantitative detail." },
  { icon: <Layers size={20} />, title: "Cross-Reference Engine", desc: "Every entry is linked to related definitions, standards paragraphs, methodology papers, and regulatory requirements. Navigate from an ISDA term to its IFRS 9 implications, to the relevant regulatory reporting requirement, to the methodology used for valuation. AI-powered traversal suggests related content you might not have thought to look up, building a comprehensive understanding of interconnected concepts." },
];

export default function HedgeWikiPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>ORDR HedgeWiki</h1>
        <p style={{ fontFamily: F.ui, fontSize: 20, color: C.textSub, maxWidth: 700, margin: "0 auto 12px", lineHeight: 1.6 }}>
          AI-Enhanced Institutional Knowledge Base
        </p>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 650, margin: "0 auto 32px", lineHeight: 1.7 }}>
          ISDA definitions, IFRS 9, ASC 815, regulatory frameworks, and methodology reference -- all searchable with AI-powered
          semantic navigation. Ask questions in natural language and receive contextual, citation-backed answers from the knowledge graph.
        </p>
        <a href="https://hedge-wiki.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Open HedgeWiki <ExternalLink size={16} />
        </a>
      </section>

      {/* Stats */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 48px" }}>
        <div className="stats-row" style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "center", gap: 48 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 24, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Knowledge Graph SVG */}
      <section style={{ padding: "80px 48px 40px", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Knowledge Graph Architecture</h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 32px", lineHeight: 1.7, maxWidth: 700 }}>
          Every entry is cross-referenced across standards, definitions, and methodologies. The AI navigates the graph on your behalf.
        </p>
        <svg viewBox="0 0 800 340" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto" }}>
          {/* Central AI Node */}
          <circle cx="400" cy="170" r="50" fill="rgba(30,58,95,0.06)" stroke="#1E3A5F" strokeWidth="1.5" strokeDasharray="4 2" />
          <text x="400" y="165" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#1E3A5F" textAnchor="middle">AI</text>
          <text x="400" y="180" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#1E3A5F" textAnchor="middle">SEARCH</text>

          {/* Knowledge domains around the center */}
          {[
            { x: 130, y: 80, label: "ISDA", sub: "Definitions" },
            { x: 670, y: 80, label: "IFRS 9", sub: "Hedge Acctg" },
            { x: 130, y: 260, label: "ASC 815", sub: "Derivatives" },
            { x: 670, y: 260, label: "Regulatory", sub: "EMIR/MiFID" },
            { x: 400, y: 30, label: "Methodology", sub: "Models" },
            { x: 400, y: 310, label: "Best Practice", sub: "Playbooks" },
          ].map(n => (
            <g key={n.label}>
              <rect x={n.x - 60} y={n.y - 22} width="120" height="44" rx="6" fill="#1E3A5F" />
              <text x={n.x} y={n.y - 2} fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="700" fill="#FFFFFF" textAnchor="middle">{n.label}</text>
              <text x={n.x} y={n.y + 14} fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="rgba(255,255,255,0.6)" textAnchor="middle">{n.sub}</text>
            </g>
          ))}

          {/* Connection lines to AI center */}
          {[
            { x1: 190, y1: 80, x2: 355, y2: 155 },
            { x1: 610, y1: 80, x2: 445, y2: 155 },
            { x1: 190, y1: 260, x2: 355, y2: 185 },
            { x1: 610, y1: 260, x2: 445, y2: 185 },
            { x1: 400, y1: 52, x2: 400, y2: 120 },
            { x1: 400, y1: 288, x2: 400, y2: 220 },
          ].map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#E5E7EB" strokeWidth="1" />
          ))}

          {/* Cross-reference lines between domains */}
          <line x1="190" y1="80" x2="610" y2="80" stroke="#E5E7EB" strokeWidth="0.5" strokeDasharray="3 3" />
          <line x1="190" y1="260" x2="610" y2="260" stroke="#E5E7EB" strokeWidth="0.5" strokeDasharray="3 3" />
          <line x1="130" y1="102" x2="130" y2="238" stroke="#E5E7EB" strokeWidth="0.5" strokeDasharray="3 3" />
          <line x1="670" y1="102" x2="670" y2="238" stroke="#E5E7EB" strokeWidth="0.5" strokeDasharray="3 3" />

          {/* User query */}
          <rect x="10" y="148" width="80" height="44" rx="6" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="50" y="166" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fontWeight="600" fill="#111" textAnchor="middle">USER</text>
          <text x="50" y="180" fontFamily="IBM Plex Sans, sans-serif" fontSize="9" fill="#555" textAnchor="middle">QUERY</text>
          <line x1="90" y1="170" x2="350" y2="170" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrHw)" />

          <defs>
            <marker id="arrHw" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#1E3A5F" /></marker>
          </defs>
        </svg>
      </section>

      {/* AI Navigation Examples */}
      <section style={{ padding: "40px 48px 80px", maxWidth: 900, margin: "0 auto" }}>
        <h3 style={{ fontFamily: F.heading, fontSize: 22, fontWeight: 700, margin: "0 0 24px", color: C.text }}>Ask the Knowledge Base</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { q: "What are the IFRS 9 effectiveness testing requirements for a cash flow hedge?", a: "Returns IFRS 9 B6.4.1-B6.4.14, effectiveness testing methodologies, critical terms matching criteria, and links to the ORDR engine effectiveness calculator." },
            { q: "How does ISDA define 'Calculation Agent' and what are my obligations?", a: "Returns ISDA 2006 Section 1.14 definition, related sections on determination, dispute resolution, and practical guidance on calculation agent responsibilities." },
            { q: "Compare ASC 815 shortcut method vs IFRS 9 critical terms match", a: "Returns side-by-side comparison with qualifying criteria, practical differences, and implications for dual-reporting entities with specific paragraph references." },
            { q: "What EMIR reporting changes take effect this quarter?", a: "Returns current EMIR Refit timeline, new XML schemas, updated field definitions, and compliance checklist for your jurisdiction." },
          ].map(item => (
            <div key={item.q} style={{ padding: "20px 24px", border: `1px solid ${C.border}`, borderRadius: 8, borderLeft: `3px solid ${C.accent}` }}>
              <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>{item.q}</div>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 48px", color: C.text }}>Capabilities</h2>
          <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ padding: "28px 24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ color: C.accent }}>{f.icon}</div>
                  <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text }}>{f.title}</div>
                </div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Explore the knowledge base</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>AI-enhanced search across ISDA, IFRS 9, ASC 815, and regulatory frameworks.</p>
        <a href="https://hedge-wiki.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Open HedgeWiki <ExternalLink size={16} />
        </a>
      </section>

      <style>{`@media(max-width:768px){
        .feat-grid { grid-template-columns: 1fr !important; }
        .stats-row { flex-wrap: wrap; gap: 24px !important; }
      }`}</style>
    </MarketingLayout>
  );
}
