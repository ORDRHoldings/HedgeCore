"use client";

import Link from "next/link";
import {
  ArrowRight, Shield, BarChart2, Layers, Zap, Globe, BookOpen,
  Activity, TrendingUp, NotebookPen, Coins, Lock, Database,
  CheckCircle, GitBranch, Network,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";

/* ─── Product Catalogue ─────────────────────────────────────────────── */
type Status = "live" | "beta" | "launching" | "pilot";

interface Product {
  id: string;
  name: string;
  category: string;
  tagline: string;
  desc: string;
  status: Status;
  statusLabel: string;
  icon: React.ElementType;
  href: string;
  external?: string;
}

const PRODUCTS: Product[] = [
  {
    id: "treasury",
    name: "ORDR Treasury",
    category: "ENTERPRISE FINTECH",
    tagline: "FX hedge governance & calculation",
    desc: "Deterministic FX hedge calculation, 4-eyes governance, WORM audit trail, and IFRS 9 / ASC 815 effectiveness reporting for corporate treasury operations.",
    status: "live",
    statusLabel: "LIVE",
    icon: Shield,
    href: "/products/treasury",
  },
  {
    id: "market",
    name: "ORDR Market",
    category: "TRADING TECHNOLOGY",
    tagline: "Agentic institutional charting terminal",
    desc: "Professional charting at 60fps with 77+ indicators, Python/JS algo builder, and AI-coached trading discipline. The first agentic charting system built for institutional traders.",
    status: "launching",
    statusLabel: "LAUNCHING MID-APRIL 2026",
    icon: BarChart2,
    href: "/products/market",
    external: "https://ordr-market.vercel.app/",
  },
  {
    id: "connect",
    name: "ORDR Connect",
    category: "CUSTOMER OPERATIONS",
    tagline: "Autonomous customer operations OS",
    desc: "Event-sourced, multi-agent platform replacing passive CRM. AI agents execute customer operations across SMS, email, voice, and chat — with cryptographic audit trails. SOC 2 Type II, ISO 27001, HIPAA compliant.",
    status: "beta",
    statusLabel: "BETA · SHIPPING NOW",
    icon: Network,
    href: "/products/connect",
    external: "https://ordr-connect.vercel.app/",
  },
  {
    id: "portfolio",
    name: "ORDR Portfolio",
    category: "RISK MANAGEMENT",
    tagline: "Multi-currency portfolio risk decomposition",
    desc: "R1-R8 risk taxonomy, concentration monitoring, multi-entity netting, and AI-assisted institutional risk reports for portfolio managers.",
    status: "beta",
    statusLabel: "BETA · APRIL 1, 2026",
    icon: Layers,
    href: "/products/portfolio",
  },
  {
    id: "labs",
    name: "ORDR Labs",
    category: "SCENARIO ANALYTICS",
    tagline: "Deterministic scenario & backtesting studio",
    desc: "Monte Carlo simulation, historical VaR/ES, crisis scenario replay, and backtesting — all in a sandboxed, frozen-kernel environment.",
    status: "live",
    statusLabel: "LIVE",
    icon: Zap,
    href: "/products/labs",
  },
  {
    id: "polisophic",
    name: "ORDR Polisophic",
    category: "INTELLIGENCE",
    tagline: "Geopolitical risk intelligence platform",
    desc: "AI corridor scoring across 190+ countries, event-driven exposure alerts, and geopolitical risk integration with hedge policy engines.",
    status: "beta",
    statusLabel: "BETA · END OF MARCH 2026",
    icon: Globe,
    href: "/products/polisophic",
  },
  {
    id: "hedgewiki",
    name: "ORDR HedgeWiki",
    category: "KNOWLEDGE",
    tagline: "AI-searchable hedge accounting library",
    desc: "ISDA definitions, IFRS 9 / ASC 815 reference library, and hedge accounting decision trees — queryable in natural language.",
    status: "live",
    statusLabel: "LIVE",
    icon: BookOpen,
    href: "/products/hedgewiki",
    external: "https://hedge-wiki.vercel.app/",
  },
  {
    id: "finhub",
    name: "ORDR FinHub",
    category: "MARKET INTELLIGENCE",
    tagline: "Macro data & economic signal aggregation",
    desc: "AI-curated economic calendars, company research, earnings surveillance, and macro signal detection for institutional analysts.",
    status: "live",
    statusLabel: "LIVE",
    icon: Activity,
    href: "/products/finhub",
  },
  {
    id: "fund",
    name: "ORDR Fund",
    category: "CAPITAL MANAGEMENT",
    tagline: "Private fund management infrastructure",
    desc: "Pooled capital management for fund managers. Pro-rata allocation, period locking, cashflow workflows, and dual-portal reporting.",
    status: "live",
    statusLabel: "LIVE",
    icon: TrendingUp,
    href: "/products/fund",
  },
  {
    id: "ordr-journal",
    name: "ORDR Journal",
    category: "TRADING ANALYTICS",
    tagline: "Institutional trading journal & performance analytics",
    desc: "Equity curve analytics, monthly P&L breakdown, behavioral drift detection, AI pattern review, and full strategy comparison for professional traders.",
    status: "live",
    statusLabel: "LIVE",
    icon: NotebookPen,
    href: "/products/ordr-journal",
    external: "https://ordr-journal-client.vercel.app/",
  },
  {
    id: "goldx",
    name: "GOLDX",
    category: "DIGITAL ASSETS",
    tagline: "Gold-backed digital asset infrastructure",
    desc: "1:1 physically-backed gold token with audited vaults, DeFi compatibility, and ISO 4217 compliant denomination. Implementation complete — licensing in progress.",
    status: "pilot",
    statusLabel: "PILOT · LICENSING IN PROGRESS",
    icon: Coins,
    href: "/products/goldx",
    external: "https://goldx-sandy.vercel.app/",
  },
];

const STATUS_CONFIG: Record<Status, { bg: string; color: string; dot: string }> = {
  live:      { bg: "#F0FDF4", color: "#065F46", dot: "#22C55E" },
  beta:      { bg: "#FFFBEB", color: "#92400E", dot: "#F59E0B" },
  launching: { bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
  pilot:     { bg: "#F5F3FF", color: "#5B21B6", dot: "#8B5CF6" },
};

/* ─── Ecosystem Connection Map ──────────────────────────────────────── */
const CONNECTIONS = [
  { from: "ORDR Treasury", to: "ORDR Polisophic", desc: "Geopolitical risk scores adjust hedge ratios automatically" },
  { from: "ORDR Treasury", to: "ORDR Portfolio",  desc: "Hedge positions feed directly into portfolio risk decomposition" },
  { from: "ORDR Labs",     to: "ORDR Treasury",   desc: "Stress-tested scenarios become policy inputs for hedge execution" },
  { from: "ORDR FinHub",   to: "ORDR Portfolio",  desc: "Macro data enriches portfolio risk models in real time" },
  { from: "ORDR Market",   to: "ORDR Labs",       desc: "Live price feeds power backtesting and VaR calculation" },
  { from: "ORDR Fund",     to: "ORDR Treasury",   desc: "Fund LP capital allocated through Treasury hedge workflow" },
  { from: "GOLDX",         to: "ORDR Treasury",   desc: "Gold-denominated positions as hedge collateral and settlement" },
  { from: "ORDR HedgeWiki",to: "ORDR Treasury",   desc: "ISDA / IFRS 9 definitions validate hedge accounting eligibility" },
];

/* ─── Shared Infrastructure Pillars ────────────────────────────────── */
const PILLARS = [
  {
    icon: Zap,
    title: "Deterministic Engine",
    desc: "41 modules, <50ms. Same input, same output — always. Pure functions, no side effects, independently verifiable. Shared across all ORDR products.",
  },
  {
    icon: Database,
    title: "WORM Audit Chain",
    desc: "SHA-256 per-tenant hash chain. Append-only — no UPDATE, no DELETE. Every calculation, approval, and decision permanently sealed across the entire ecosystem.",
  },
  {
    icon: Lock,
    title: "Governance Framework",
    desc: "4-eyes maker-checker, Separation of Duties, tri-state pipeline (Sandbox → Staging → Ledger), 9 RBAC roles, 41 permissions — shared by all products.",
  },
  {
    icon: GitBranch,
    title: "Single Identity Layer",
    desc: "One account, all products. JWT + API key auth, RBAC hierarchy level 0-15. Users access the full ecosystem with one set of credentials.",
  },
];

/* ─── Roadmap ───────────────────────────────────────────────────────── */
const ROADMAP = [
  {
    quarter: "NOW",
    label: "Live Products",
    items: ["ORDR Treasury", "ORDR Labs", "ORDR HedgeWiki", "ORDR FinHub", "ORDR Fund", "ORDR Journal"],
    color: "#065F46",
    bg: "#F0FDF4",
  },
  {
    quarter: "NOW (BETA)",
    label: "Beta Shipping",
    items: ["ORDR Connect — autonomous customer operations OS, beta available at ordr-connect.vercel.app"],
    color: "#92400E",
    bg: "#FFFBEB",
  },
  {
    quarter: "END OF MARCH 2026",
    label: "Beta Launch",
    items: ["ORDR Polisophic — public beta with 190+ country coverage"],
    color: "#92400E",
    bg: "#FFFBEB",
  },
  {
    quarter: "APRIL 1, 2026",
    label: "Beta Launch",
    items: ["ORDR Portfolio — beta available to institutional clients"],
    color: "#92400E",
    bg: "#FFFBEB",
  },
  {
    quarter: "MID-APRIL 2026",
    label: "Full Launch",
    items: ["ORDR Market — institutional charting terminal goes live"],
    color: "#1D4ED8",
    bg: "#EFF6FF",
  },
  {
    quarter: "2026",
    label: "Licensing & Expansion",
    items: ["GOLDX — regulatory licenses obtained, public issuance begins"],
    color: "#5B21B6",
    bg: "#F5F3FF",
  },
];

export default function HomePage() {
  return (
    <MarketingLayout>

      {/* ── Section 1: Hero ─────────────────────────────────────────────── */}
      <section className="relative pt-[160px] pb-[120px] px-6 md:px-12 bg-white overflow-hidden border-b border-[#E5E7EB]">
        <div
          className="absolute inset-0 bg-grid pointer-events-none"
          style={{
            maskImage: "linear-gradient(to bottom, black 40%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 100%)",
          }}
        />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="max-w-4xl">
            <div className="flex items-center gap-3 mb-8 flex-wrap">
              <span className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#6B7280] uppercase flex items-center gap-2">
                <span className="w-3 h-px bg-[#6B7280] inline-block" />
                ORDR TERMINAL · INSTITUTIONAL FINANCIAL ECOSYSTEM
              </span>
              <div className="flex items-center gap-2 border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 rounded-sm">
                <span className="status-dot pulsing" />
                <span className="font-mono text-[10px] text-[#059669] font-bold tracking-widest uppercase">6 PRODUCTS LIVE</span>
              </div>
            </div>

            <h1
              className="text-[56px] md:text-[76px] leading-[1.0] font-extrabold mb-6 tracking-[-0.04em] text-[#111111]"
              style={{ fontFamily: "'Manrope', sans-serif" }}
            >
              Eleven products.<br />
              <span className="text-[#1E3A5F]">One infrastructure.</span>
            </h1>

            <p className="text-xl md:text-[22px] text-[#4B5563] font-medium mb-6 leading-relaxed max-w-3xl">
              ORDR Terminal is the holding company and operating platform for eleven institutional financial technology products — from FX treasury governance to autonomous customer operations.
            </p>
            <p className="text-[16px] text-[#6B7280] mb-10 leading-relaxed max-w-3xl border-l-2 border-[#E5E7EB] pl-4">
              Every product shares the same deterministic computation engine, 4-eyes governance framework, SHA-256 WORM audit chain, and single identity layer. One infrastructure. Compounding value across every product.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <Link
                href="/products"
                className="inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold bg-[#1E3A5F] text-white border border-[#1E3A5F] hover:bg-[#162D4A] rounded-sm tracking-wide no-underline transition-all"
              >
                Explore the Ecosystem →
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold bg-white text-[#111111] border border-[#D1D5DB] hover:border-[#1E3A5F] rounded-sm tracking-wide no-underline transition-all"
              >
                Request Demo
              </Link>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {[
                { v: "11", l: "Products" },
                { v: "6", l: "Live Now" },
                { v: "3", l: "Launching Q2 2026" },
                { v: "1", l: "Pilot (GOLDX)" },
                { v: "41", l: "Engine Modules" },
                { v: "SHA-256", l: "Audit Chain" },
              ].map((s) => (
                <div key={s.l} className="flex items-baseline gap-2">
                  <span className="font-mono text-[20px] font-extrabold text-[#111111]">{s.v}</span>
                  <span className="font-mono text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">{s.l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Ecosystem Portfolio ──────────────────────────────── */}
      <section className="py-24 px-6 md:px-12 bg-[#F4F5F7] border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 flex flex-col md:flex-row md:items-end gap-6 border-b border-[#E5E7EB] pb-10">
            <div className="flex-1">
              <span className="section-label">THE PORTFOLIO</span>
              <h2
                className="text-3xl md:text-[44px] font-extrabold"
                style={{ fontFamily: "'Manrope', sans-serif" }}
              >
                Ten products. Every stage of institutional finance.
              </h2>
            </div>
            <div className="flex gap-4 flex-wrap shrink-0">
              {(["live","beta","launching","pilot"] as Status[]).map((s) => (
                <div
                  key={s}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-sm border text-[11px] font-mono font-bold uppercase tracking-widest"
                  style={{ background: STATUS_CONFIG[s].bg, color: STATUS_CONFIG[s].color, borderColor: STATUS_CONFIG[s].color + "33" }}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ background: STATUS_CONFIG[s].dot }}
                  />
                  {s === "live" ? "Live" : s === "beta" ? "Beta" : s === "launching" ? "Launching" : "Pilot"}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {PRODUCTS.map((p) => {
              const Icon = p.icon;
              const sc = STATUS_CONFIG[p.status];
              const inner = (
                <div className="bg-white border border-[#E5E7EB] rounded-sm flex flex-col h-full group hover:shadow-md hover:border-[#1E3A5F] transition-all cursor-pointer overflow-hidden">
                  {/* Status bar */}
                  <div
                    className="px-4 py-2 flex items-center justify-between"
                    style={{ background: sc.bg, borderBottom: `1px solid ${sc.color}22` }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: sc.dot }} />
                      <span
                        className="font-mono text-[9px] font-bold uppercase tracking-[0.15em]"
                        style={{ color: sc.color }}
                      >
                        {p.statusLabel}
                      </span>
                    </div>
                    <span className="font-mono text-[9px] font-bold text-[#9CA3AF] uppercase tracking-wider">{p.category}</span>
                  </div>

                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-10 h-10 rounded-sm bg-[#F9FAFB] flex items-center justify-center text-[#1E3A5F] border border-[#E5E7EB] shrink-0">
                        <Icon size={18} />
                      </div>
                      <div>
                        <h3 className="font-mono text-[15px] font-bold text-[#111111] group-hover:text-[#1E3A5F] transition-colors mb-0.5">
                          {p.name}
                        </h3>
                        <p className="text-[12px] text-[#9CA3AF] font-medium">{p.tagline}</p>
                      </div>
                    </div>

                    <p className="text-[13px] text-[#4B5563] leading-relaxed flex-1 mb-4">{p.desc}</p>

                    <div className="flex items-center justify-between pt-4 border-t border-[#F4F5F7]">
                      <span className="text-[12px] font-bold text-[#1E3A5F] group-hover:underline">
                        Product details →
                      </span>
                      {p.external && (
                        <span className="font-mono text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest border border-[#E5E7EB] px-2 py-1 rounded-sm">
                          LIVE SITE ↗
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );

              return p.external ? (
                <a
                  key={p.id}
                  href={p.external}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-underline text-inherit"
                >
                  {inner}
                </a>
              ) : (
                <Link key={p.id} href={p.href} className="no-underline text-inherit">
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Section 3: The Shared Infrastructure ────────────────────────── */}
      <section className="py-24 px-6 md:px-12 bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="section-label">SHARED INFRASTRUCTURE</span>
              <h2
                className="text-3xl md:text-[44px] font-extrabold mb-6"
                style={{ fontFamily: "'Manrope', sans-serif" }}
              >
                One engine.<br />Ten products benefit.
              </h2>
              <p className="text-[16px] text-[#4B5563] leading-relaxed mb-6 max-w-xl">
                Every ORDR product runs on the same deterministic computation engine, governance framework, and audit chain. This is the structural advantage of the ecosystem: infrastructure built once delivers compounding value across every product.
              </p>
              <p className="text-[15px] text-[#6B7280] leading-relaxed max-w-xl border-l-2 border-[#E5E7EB] pl-4">
                A bank would spend hundreds of millions building what ORDR Terminal provides as shared infrastructure. Our clients access institutional-grade governance and auditability from day one — regardless of which product they start with.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={pillar.title}
                    className="border border-[#E5E7EB] rounded-sm p-6 bg-[#F9FAFB]"
                  >
                    <div className="w-9 h-9 rounded-sm bg-[#1E3A5F] flex items-center justify-center text-white mb-4">
                      <Icon size={16} />
                    </div>
                    <h3 className="font-bold text-[14px] text-[#111111] mb-2">{pillar.title}</h3>
                    <p className="text-[12px] text-[#6B7280] leading-relaxed">{pillar.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 4: How the Ecosystem Connects ───────────────────────── */}
      <section className="py-24 px-6 md:px-12 bg-[#0A0A0A] text-white border-b border-[#1E293B]">
        <div className="max-w-7xl mx-auto">
          <span className="section-label text-[#4B5563]">ECOSYSTEM CONNECTIONS</span>
          <h2
            className="text-3xl md:text-[44px] font-extrabold mb-4 text-white"
            style={{ fontFamily: "'Manrope', sans-serif" }}
          >
            Products that amplify each other.
          </h2>
          <p className="text-[16px] text-[#6B7280] mb-12 max-w-2xl leading-relaxed">
            Each product is independent and useful on its own. When combined, they create a compounding advantage — data and workflows from one product enhance every other.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CONNECTIONS.map((c) => (
              <div
                key={c.desc}
                className="flex items-start gap-4 p-5 border border-[#1E293B] rounded-sm bg-[#111111] hover:border-[#374151] transition-colors"
              >
                <div className="flex items-center gap-2 shrink-0 min-w-[200px]">
                  <span className="font-mono text-[11px] font-bold text-[#93C5FD]">{c.from}</span>
                  <ArrowRight size={12} className="text-[#374151] shrink-0" />
                  <span className="font-mono text-[11px] font-bold text-[#99F6E4]">{c.to}</span>
                </div>
                <p className="text-[12px] text-[#6B7280] leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 5: Launch Roadmap ────────────────────────────────────── */}
      <section className="py-24 px-6 md:px-12 bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto">
          <span className="section-label">ROADMAP</span>
          <h2
            className="text-3xl md:text-[44px] font-extrabold mb-4"
            style={{ fontFamily: "'Manrope', sans-serif" }}
          >
            Product launch timeline.
          </h2>
          <p className="text-[16px] text-[#4B5563] max-w-2xl mb-12 leading-relaxed border-l-2 border-[#E5E7EB] pl-4">
            Six products are live today. Three are in final stages before their 2026 launch. GOLDX is implementation-complete, pending regulatory licensing.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {ROADMAP.map((phase) => (
              <div
                key={phase.quarter}
                className="border rounded-sm overflow-hidden flex flex-col"
                style={{ borderColor: phase.color + "33" }}
              >
                <div
                  className="px-4 py-3 border-b"
                  style={{ background: phase.bg, borderColor: phase.color + "33" }}
                >
                  <div
                    className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] mb-1"
                    style={{ color: phase.color }}
                  >
                    {phase.quarter}
                  </div>
                  <div className="font-bold text-[13px] text-[#111111]">{phase.label}</div>
                </div>
                <div className="px-4 py-4 flex-1 bg-white">
                  <ul className="space-y-2 list-none p-0 m-0">
                    {phase.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[12px] text-[#4B5563] leading-relaxed">
                        <CheckCircle size={11} className="shrink-0 mt-0.5" style={{ color: phase.color }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 6: Vision ───────────────────────────────────────────── */}
      <section className="py-24 px-6 md:px-12 bg-[#F4F5F7] border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div>
              <span className="section-label">VISION</span>
              <h2
                className="text-3xl md:text-[44px] font-extrabold mb-6"
                style={{ fontFamily: "'Manrope', sans-serif" }}
              >
                We are building infrastructure, not features.
              </h2>
              <p className="text-[16px] text-[#4B5563] leading-relaxed mb-5">
                The infrastructure that institutional finance runs on — deterministic computation, tamper-evident audit, and governance-by-design — took banks decades and billions of dollars to build. ORDR Terminal makes this available to any institution from day one.
              </p>
              <p className="text-[16px] text-[#4B5563] leading-relaxed mb-5">
                We are not trying to replace Bloomberg or compete with point solutions. We are building the operating layer that sits beneath them — the governance, audit, and calculation infrastructure that every institutional financial workflow eventually needs.
              </p>
              <p className="text-[16px] text-[#4B5563] leading-relaxed border-l-2 border-[#1E3A5F] pl-4">
                Each product we launch adds to this infrastructure. Each client who adopts one product can access all ten. The value of the ecosystem compounds with every addition.
              </p>
            </div>

            <div className="flex flex-col gap-6">
              {[
                {
                  n: "01",
                  title: "Deterministic First",
                  desc: "All calculations across all products are deterministic. Same input, same output — always. This is not a feature. It is the only acceptable standard for institutional finance.",
                },
                {
                  n: "02",
                  title: "Governance by Design",
                  desc: "4-eyes approval, Separation of Duties, and tamper-evident audit are not add-ons. They are built into the platform architecture from the foundation — shared by every product.",
                },
                {
                  n: "03",
                  title: "AI as Assistant, Not Autopilot",
                  desc: "AI provides communication, report generation, chart analysis, and geopolitical intelligence. AI never evaluates calculations or makes financial decisions. Humans decide. Engines compute.",
                },
                {
                  n: "04",
                  title: "Compounding Ecosystem Value",
                  desc: "Every new product strengthens every existing one. Data shared across the ecosystem makes each product more powerful than it would be as a standalone tool.",
                },
              ].map((item, i) => (
                <div key={item.n} className={`flex gap-5 items-start ${i < 3 ? "pb-6 border-b border-[#E5E7EB]" : ""}`}>
                  <span className="font-mono text-[20px] font-bold text-[#D1D5DB] shrink-0">[{item.n}]</span>
                  <div>
                    <h3 className="font-bold text-[15px] text-[#111111] mb-1.5">{item.title}</h3>
                    <p className="text-[13px] text-[#6B7280] leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 7: Solutions ─────────────────────────────────────────── */}
      <section className="py-24 px-6 md:px-12 bg-[#111111] text-white">
        <div className="max-w-7xl mx-auto">
          <span className="section-label text-[#4B5563]">WHO WE SERVE</span>
          <h2
            className="text-3xl md:text-[44px] font-extrabold mb-12 text-white"
            style={{ fontFamily: "'Manrope', sans-serif" }}
          >
            Built for institutions. Accessible to professionals.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-[#374151] rounded-sm">
            {[
              { title: "Corporate Treasury", desc: "FX hedge governance, IFRS 9 effectiveness reporting, and WORM audit trail for treasury operations of any size.", products: ["ORDR Treasury", "ORDR Portfolio", "ORDR Labs"] },
              { title: "Fund Managers", desc: "Capital allocation, LP reporting, pro-rata distribution, and dual-portal fund management infrastructure.", products: ["ORDR Fund", "ORDR Portfolio", "ORDR FinHub"] },
              { title: "Risk Teams", desc: "R1-R8 risk decomposition, scenario stress testing, geopolitical risk scoring, and board-ready risk reports.", products: ["ORDR Portfolio", "ORDR Labs", "ORDR Polisophic"] },
              { title: "Institutional Traders", desc: "60fps charting, algo building, AI-coached discipline, and full trading journal with behavioral analytics.", products: ["ORDR Market", "ORDR Journal", "ORDR FinHub"] },
              { title: "Compliance & Audit", desc: "SHA-256 WORM audit chain, ISDA / IFRS 9 reference library, and regulatory exports (FINRA 17a-4, ASC 815 XML).", products: ["ORDR HedgeWiki", "ORDR Treasury"] },
              { title: "Digital Asset Operations", desc: "Gold-backed digital asset infrastructure with DeFi compatibility, physical redemption, and proof-of-reserves.", products: ["GOLDX", "ORDR Treasury"] },
            ].map((s, i) => (
              <div
                key={s.title}
                className={`p-8 border-[#374151] ${(i + 1) % 3 !== 0 ? "lg:border-r" : ""} ${i < 3 ? "border-b" : ""} hover:bg-[#1A1A1A] transition-colors`}
              >
                <h3 className="font-bold text-[16px] text-white mb-3">{s.title}</h3>
                <p className="text-[13px] text-[#9CA3AF] leading-relaxed mb-4">{s.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.products.map((prod) => (
                    <span
                      key={prod}
                      className="font-mono text-[9px] font-bold text-[#4B5563] border border-[#374151] px-2 py-1 rounded-sm uppercase tracking-widest"
                    >
                      {prod}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 8: Audit Infrastructure (proof) ──────────────────────── */}
      <section className="py-24 px-6 md:px-12 bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto">
          <span className="section-label">AUDIT INFRASTRUCTURE</span>
          <h2
            className="text-3xl md:text-[44px] font-extrabold mb-4"
            style={{ fontFamily: "'Manrope', sans-serif" }}
          >
            Every event. Permanently sealed.
          </h2>
          <p className="text-[16px] text-[#4B5563] max-w-3xl mb-12 border-l-2 border-[#E5E7EB] pl-4">
            Every calculation, approval, policy change, and governance decision across the entire ecosystem is permanently recorded in a per-tenant SHA-256 hash chain. No UPDATE. No DELETE. Ever.
          </p>

          {/* Hash chain visual */}
          <div className="w-full overflow-x-auto mb-12">
            <div className="min-w-[800px] border border-[#E5E7EB] rounded-sm bg-white overflow-hidden">
              <div className="bg-[#0A0A0A] px-5 py-2.5 flex items-center gap-2 border-b border-[#1E293B]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#374151]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#374151]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#059669]" />
                </div>
                <span className="font-mono text-[10px] text-[#6B7280] tracking-widest uppercase">ORDR · AUDIT CHAIN · TENANT: tnt_001</span>
              </div>
              <div className="flex items-center gap-0 overflow-x-auto p-6 bg-[#F9FAFB]">
                {[
                  { type: "GENESIS", hash: "0000...0000", label: "GENESIS BLOCK", extra: "IMMUTABLE", extraColor: "#059669" },
                  { type: "CALC_RUN", hash: "8f4e...a1b2", label: "CALC_RUN #1", extra: "APPEND ONLY", extraColor: "#1E3A5F" },
                  { type: "POLICY_REV", hash: "c3d4...9f8e", label: "POLICY_REV", extra: "SEALED", extraColor: "#1E3A5F" },
                  { type: "APPROVAL", hash: "7a6b...5c4d", label: "4-EYES APPROVAL", extra: "LOCKED", extraColor: "#1E3A5F" },
                  { type: "EXECUTION", hash: "...", label: "EXECUTION", extra: "PENDING", extraColor: "#9CA3AF" },
                ].map((block, i) => (
                  <div key={block.type} className="flex items-center shrink-0">
                    <div
                      className={`w-[150px] rounded-sm p-3 border ${i === 0 ? "bg-[#0f172a] border-[#1e293b]" : i === 4 ? "bg-[#F9FAFB] border-dashed border-[#D1D5DB]" : "bg-white border-[#D1D5DB]"}`}
                    >
                      <div className={`font-mono text-[10px] font-bold mb-1.5 ${i === 0 ? "text-[#93c5fd]" : i === 4 ? "text-[#9CA3AF]" : "text-[#111111]"}`}>{block.label}</div>
                      <div className={`font-mono text-[9px] mb-1 ${i === 0 ? "text-white" : i === 4 ? "text-[#9CA3AF]" : "text-[#4B5563]"}`}>HASH: {block.hash}</div>
                      <div className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded inline-block" style={{ color: block.extraColor, background: block.extraColor + "15" }}>{block.extra}</div>
                    </div>
                    {i < 4 && (
                      <div className="flex items-center px-2">
                        <div className={`w-6 h-px ${i === 3 ? "border-t border-dashed border-[#9CA3AF]" : "bg-[#0f172a]"}`} />
                        <div className={`w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] ${i === 3 ? "border-l-[#9CA3AF]" : "border-l-[#0f172a]"}`} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 border border-[#E5E7EB] rounded-sm divide-y md:divide-y-0 md:divide-x divide-[#E5E7EB] bg-[#F9FAFB]">
            {[
              { icon: Database, t: "WORM Storage", d: "Write Once, Read Many" },
              { icon: Lock,     t: "SHA-256 Chain", d: "Per-tenant, genesis-anchored" },
              { icon: Shield,   t: "Zero Deletion", d: "No UPDATE, no DELETE, ever" },
              { icon: CheckCircle, t: "Regulation-Ready", d: "IFRS 9 / ASC 815 aligned" },
            ].map((s) => (
              <div key={s.t} className="p-6 flex items-start gap-3">
                <s.icon size={16} className="text-[#1E3A5F] mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-bold text-[13px] text-[#111111] mb-0.5">{s.t}</h4>
                  <p className="text-[12px] text-[#6B7280]">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 9: CTA ───────────────────────────────────────────────── */}
      <section className="py-24 px-6 md:px-12 bg-[#0A0A0A] text-white text-center relative overflow-hidden">
        <div
          className="absolute inset-0 bg-grid-dark pointer-events-none"
          style={{
            maskImage: "linear-gradient(to bottom, black, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
          }}
        />
        <div className="max-w-3xl mx-auto relative z-10">
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-[#10B981] uppercase mb-6 block">
            ORDR TERMINAL · INSTITUTIONAL FINANCIAL ECOSYSTEM
          </span>
          <h2
            className="text-[36px] md:text-[52px] font-extrabold mb-6 text-white"
            style={{ fontFamily: "'Manrope', sans-serif" }}
          >
            Start with one product.<br />Access the ecosystem.
          </h2>
          <p className="text-[16px] text-[#9CA3AF] mb-10 leading-relaxed max-w-2xl mx-auto">
            Request a guided demo. Enterprise treasury teams, fund managers, risk professionals, and institutional traders — see the full ecosystem in action with live data.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold bg-white text-[#000000] border border-white hover:bg-[#E5E7EB] rounded-sm tracking-wide no-underline transition-all"
            >
              Request Demo →
            </Link>
            <Link
              href="/products"
              className="inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold bg-transparent text-white border border-[#374151] hover:border-white rounded-sm tracking-wide no-underline transition-all"
            >
              Browse All Products
            </Link>
          </div>
        </div>
      </section>

    </MarketingLayout>
  );
}
