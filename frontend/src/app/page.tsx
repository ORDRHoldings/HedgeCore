"use client";

import Link from "next/link";
import {
  ArrowRight, Activity, Shield, Lock, BarChart2, FileText, Database, Globe,
  BrainCircuit, CheckCircle, Layers, Zap, Briefcase, Building, Landmark,
  ShieldAlert, BookOpen, TrendingUp,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";

const products = [
  { id: "treasury", name: "ORDR Treasury", desc: "Deterministic FX hedge calculation with 60 policy presets, 41 engine modules, 4-eyes governance, and WORM audit trail.", ai: "AI serves as communication layer -- chat, phone, voice. AI does not evaluate calculations.", icon: Shield },
  { id: "market", name: "ORDR Market", desc: "The first Agentic charting system with AI integrated. Built for algorithmic trading. Python, JavaScript, natural language.", ai: "AI coaches trading discipline, reads charts, provides insight. Not a signal service.", icon: BarChart2, external: "https://ordr-market.vercel.app/" },
  { id: "portfolio", name: "ORDR Portfolio", desc: "Multi-currency portfolio risk decomposition with deterministic R1-R8 risk taxonomy, concentration monitoring.", ai: "AI assists with customer management and institutional reports. All calculations deterministic.", icon: Layers },
  { id: "labs", name: "ORDR Labs", desc: "Pure deterministic scenario studio with backtesting, Monte Carlo simulation, historical VaR/ES, crisis replay.", ai: "No AI involvement. Full sandbox isolation with frozen kernel.", icon: Zap },
  { id: "polisophic", name: "ORDR Polisophic", desc: "Geopolitical risk intelligence powered by AI corridor scoring. 190+ countries monitored.", ai: "AI synthesizes risk signals into hedging recommendations.", icon: Globe },
  { id: "hedgewiki", name: "ORDR HedgeWiki", desc: "AI-searchable ISDA definitions, IFRS 9 / ASC 815 reference library. Natural language queries.", ai: "AI navigates knowledge graph with citation-backed answers.", icon: BookOpen, external: "https://hedge-wiki.vercel.app/" },
  { id: "finhub", name: "ORDR FinHub", desc: "AI-curated economic calendars, company research, signal detection. Macro data aggregation.", ai: "AI filters noise, prioritizes events relevant to portfolio.", icon: Activity },
  { id: "fund", name: "ORDR Fund", desc: "Pooled capital management for private fund managers. Capital tracking, pro-rata allocation, period locking, cashflow workflows, and dual-portal reporting.", ai: "No AI involvement. Pure deterministic allocation engine with WORM audit trail.", icon: TrendingUp },
];

const solutions = [
  { id: "corporate-treasury", name: "Corporate Treasury", desc: "End-to-end FX risk management for corporate treasury operations", icon: Building },
  { id: "risk-management", name: "Risk Management", desc: "Enterprise risk quantification, monitoring, and governance", icon: ShieldAlert },
  { id: "asset-management", name: "Asset Management", desc: "Multi-currency portfolio hedging and exposure analysis", icon: Briefcase },
  { id: "banking", name: "Banking & Capital Markets", desc: "Institutional FX infrastructure for banks and dealers", icon: Landmark },
  { id: "insurance", name: "Insurance", desc: "ALM currency risk and regulatory hedge accounting", icon: FileText },
  { id: "energy", name: "Energy & Commodities", desc: "Commodity-linked FX exposure and cross-currency hedging", icon: Zap },
];

/* ── SVG Diagrams ── */
const SvgArchitecture = () => (
  <svg viewBox="0 0 940 560" className="w-full h-auto bg-white border border-[#E5E7EB] shadow-sm rounded-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
    <defs>
      <pattern id="grid-arch" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#F4F5F7" strokeWidth="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid-arch)" />
    {/* UI Layer */}
    <rect x="40" y="40" width="860" height="120" fill="#FFFFFF" stroke="#D1D5DB" strokeWidth="1" rx="2" />
    <text x="60" y="70" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, fill: "#6B7280", letterSpacing: "0.15em" }}>LAYER 01: USER INTERFACE [PRESENTATION]</text>
    {["Terminal UI", "Charts Canvas", "Voice Bridge", "Chat Interface", "Report Viewer"].map((label, i) => (
      <g key={label}>
        <rect x={60 + i * 168} y={90} width={148} height={48} fill="#F9FAFB" stroke="#E5E7EB" rx="2" />
        <text x={60 + i * 168 + 74} y={118} textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: "#111111" }}>{label}</text>
      </g>
    ))}
    {/* AI Layer */}
    <rect x="40" y="220" width="860" height="120" fill="#115e59" stroke="#0f766e" strokeWidth="1" rx="2" />
    <text x="60" y="250" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, fill: "#99f6e4", letterSpacing: "0.15em" }}>LAYER 02: AGENTIC INTELLIGENCE [COMMUNICATION &amp; INSIGHT]</text>
    {["Customer Mgmt", "Report Generation", "Chart Analysis", "Trading Coaching", "Geopolitical Intel"].map((label, i) => (
      <g key={label}>
        <rect x={60 + i * 168} y={270} width={148} height={48} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" rx="2" />
        <text x={60 + i * 168 + 74} y={298} textAnchor="middle" style={{ fontSize: 13, fontWeight: 600, fill: "white" }}>{label}</text>
      </g>
    ))}
    {/* Engine Layer */}
    <rect x="40" y="400" width="860" height="120" fill="#0f172a" stroke="#1e293b" strokeWidth="1" rx="2" />
    <text x="60" y="430" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, fill: "#93c5fd", letterSpacing: "0.15em" }}>LAYER 03: DETERMINISTIC ENGINE [CORE COMPUTATION]</text>
    {["kernel.py [41M]", "validator.py", "audit.py [SHA-256]", "Policy Engine", "WORM Storage"].map((label, i) => (
      <g key={label}>
        <rect x={60 + i * 168} y={450} width={148} height={48} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" rx="2" />
        <text x={60 + i * 168 + 74} y={478} textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fill: "#e2e8f0", fontWeight: 500 }}>{label}</text>
      </g>
    ))}
    {/* Connections */}
    <g stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="3 3" fill="none">
      <path d="M 470 160 L 470 220" />
      <path d="M 470 340 L 470 400" />
      <polygon points="466,215 474,215 470,220" fill="#9CA3AF" stroke="none" />
      <polygon points="466,395 474,395 470,400" fill="#9CA3AF" stroke="none" />
    </g>
    <text x="485" y="195" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: "#6B7280", fontWeight: 700 }}>QUERIES / RESPONSES</text>
    <text x="485" y="375" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: "#6B7280", fontWeight: 700 }}>READ ONLY [NEVER EXECUTES]</text>
  </svg>
);

const SvgHashChain = () => (
  <svg viewBox="0 0 900 200" className="w-full h-auto border border-[#E5E7EB] bg-white rounded-sm" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
    <defs>
      <pattern id="grid-hash" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#F9FAFB" strokeWidth="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid-hash)" />
    <g transform="translate(20, 50)">
      {/* Block 0 */}
      <rect x="0" y="0" width="150" height="100" fill="#0f172a" rx="2" />
      <text x="10" y="25" style={{ fontSize: 12, fill: "#93c5fd", fontWeight: 700 }}>GENESIS_BLOCK</text>
      <text x="10" y="50" style={{ fontSize: 10, fill: "white" }}>HASH: 0000...0000</text>
      <text x="10" y="70" style={{ fontSize: 10, fill: "white" }}>TENANT: tnt_001</text>
      <rect x="10" y="80" width="60" height="14" fill="#059669" rx="2" />
      <text x="14" y="90" style={{ fontSize: 8, fill: "white", fontWeight: 700 }}>IMMUTABLE</text>
      {/* Arrow 1 */}
      <line x1="150" y1="50" x2="180" y2="50" stroke="#0f172a" strokeWidth="2" />
      <polygon points="175,46 182,50 175,54" fill="#0f172a" />
      {/* Block 1 */}
      <rect x="180" y="0" width="150" height="100" fill="#FFFFFF" stroke="#D1D5DB" strokeWidth="1" rx="2" />
      <text x="190" y="25" style={{ fontSize: 12, fill: "#111111", fontWeight: 700 }}>CALC_RUN_#1</text>
      <text x="190" y="50" style={{ fontSize: 10, fill: "#4B5563" }}>HASH: 8f4e...a1b2</text>
      <text x="190" y="70" style={{ fontSize: 10, fill: "#4B5563" }}>REQ_IDX: 44</text>
      <rect x="190" y="80" width="65" height="14" fill="#F3F4F6" stroke="#E5E7EB" strokeWidth="1" rx="2" />
      <text x="194" y="90" style={{ fontSize: 8, fill: "#4B5563", fontWeight: 700 }}>APPEND_ONLY</text>
      {/* Arrow 2 */}
      <line x1="330" y1="50" x2="360" y2="50" stroke="#0f172a" strokeWidth="2" />
      <polygon points="355,46 362,50 355,54" fill="#0f172a" />
      {/* Block 2 */}
      <rect x="360" y="0" width="150" height="100" fill="#FFFFFF" stroke="#D1D5DB" strokeWidth="1" rx="2" />
      <text x="370" y="25" style={{ fontSize: 12, fill: "#111111", fontWeight: 700 }}>POLICY_REV</text>
      <text x="370" y="50" style={{ fontSize: 10, fill: "#4B5563" }}>HASH: c3d4...9f8e</text>
      <text x="370" y="70" style={{ fontSize: 10, fill: "#4B5563" }}>USR: jdoe</text>
      <rect x="370" y="80" width="45" height="14" fill="#F3F4F6" stroke="#E5E7EB" strokeWidth="1" rx="2" />
      <text x="374" y="90" style={{ fontSize: 8, fill: "#4B5563", fontWeight: 700 }}>SEALED</text>
      {/* Arrow 3 */}
      <line x1="510" y1="50" x2="540" y2="50" stroke="#0f172a" strokeWidth="2" />
      <polygon points="535,46 542,50 535,54" fill="#0f172a" />
      {/* Block 3 */}
      <rect x="540" y="0" width="150" height="100" fill="#FFFFFF" stroke="#D1D5DB" strokeWidth="1" rx="2" />
      <text x="550" y="25" style={{ fontSize: 12, fill: "#111111", fontWeight: 700 }}>APPROVAL</text>
      <text x="550" y="50" style={{ fontSize: 10, fill: "#4B5563" }}>HASH: 7a6b...5c4d</text>
      <text x="550" y="70" style={{ fontSize: 10, fill: "#4B5563" }}>USR: msmith</text>
      <rect x="550" y="80" width="45" height="14" fill="#F3F4F6" stroke="#E5E7EB" strokeWidth="1" rx="2" />
      <text x="554" y="90" style={{ fontSize: 8, fill: "#4B5563", fontWeight: 700 }}>LOCKED</text>
      {/* Arrow 4 */}
      <line x1="690" y1="50" x2="720" y2="50" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="3 3" />
      <polygon points="715,46 722,50 715,54" fill="#9CA3AF" />
      {/* Block 4 */}
      <rect x="720" y="0" width="140" height="100" fill="#F9FAFB" stroke="#D1D5DB" strokeWidth="1" strokeDasharray="4 4" rx="2" />
      <text x="730" y="25" style={{ fontSize: 12, fill: "#6B7280", fontWeight: 700 }}>EXECUTION</text>
      <text x="730" y="55" style={{ fontSize: 10, fill: "#9CA3AF" }}>[AWAITING</text>
      <text x="730" y="70" style={{ fontSize: 10, fill: "#9CA3AF" }}> COMPUTATION]</text>
    </g>
  </svg>
);

const SvgPillars = () => (
  <svg viewBox="0 0 900 300" className="w-full h-auto border border-[#E5E7EB] bg-white rounded-sm" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
    <g transform="translate(0, 20)">
      {[
        { x: 10, fill: "#0f172a", title: "WORM AUDIT", textFill: "#93c5fd", items: ["SHA-256 Chain","Append-only log","Tenant chains","Tamper-evident"], reds: ["No UPDATE","No DELETE"] },
        { x: 186, fill: "#115e59", title: "4-EYES GOV", textFill: "#99f6e4", items: ["Maker-checker","Separation Duty","Tri-state pipe","9 RBAC roles","41 permissions","Threshold-based"], reds: [] },
        { x: 362, fill: "#0f172a", title: "DET. ENGINE", textFill: "#93c5fd", items: ["41 core modules","Sub-50ms latency","Pure functions","No side effects","Reproducible","Verifiable"], reds: [] },
        { x: 538, fill: "#115e59", title: "AI INSIGHT", textFill: "#99f6e4", items: ["Customer Mgmt","Report writing","Chart analysis","Status updates","Voice & chat"], reds: [], yellows: ["Never executes"] },
        { x: 714, fill: "#0f172a", title: "MULTI-CH", textFill: "#93c5fd", items: ["Voice (WebRTC)","Chat (NL)","Terminal UI","REST API","219+ endpoints","Mobile-ready"], reds: [] },
      ].map((pillar) => (
        <g key={pillar.title}>
          <rect x={pillar.x} y="0" width="166" height="260" fill={pillar.fill} rx="2" />
          <text x={pillar.x + 83} y="40" textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fill: "white", fontWeight: 700, letterSpacing: "0.05em" }}>{pillar.title}</text>
          <line x1={pillar.x + 10} y1="55" x2={pillar.x + 156} y2="55" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          {pillar.items.map((item, i) => (
            <text key={item} x={pillar.x + 83} y={85 + i * 30} textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fill: pillar.textFill }}>{item}</text>
          ))}
          {(pillar.reds || []).map((item, i) => (
            <text key={item} x={pillar.x + 83} y={85 + (pillar.items.length + i) * 30} textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fill: "#ef4444" }}>{item}</text>
          ))}
          {(pillar.yellows || []).map((item, i) => (
            <text key={item} x={pillar.x + 83} y={85 + (pillar.items.length + i) * 30} textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fill: "#fde047" }}>{item}</text>
          ))}
        </g>
      ))}
    </g>
  </svg>
);

export default function HomePage() {
  return (
    <MarketingLayout>
      {/* Section 1: Hero */}
      <section className="relative pt-[160px] pb-[120px] px-6 md:px-12 bg-white overflow-hidden border-b border-[#E5E7EB]">
        <div className="absolute inset-0 bg-grid pointer-events-none" style={{ maskImage: "linear-gradient(to bottom, black 40%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 100%)" }} />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="max-w-4xl">
            <div className="flex items-center gap-4 mb-8">
              <span className="section-label" style={{ marginBottom: 0 }}>THE FINTECH ECOSYSTEM</span>
              <div className="flex items-center gap-2 border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1 rounded-sm">
                <span className="status-dot pulsing" />
                <span className="font-mono text-[10px] text-[#4B5563] font-bold tracking-widest uppercase">SYS_ACTIVE</span>
              </div>
            </div>
            <h1 className="text-[52px] md:text-[72px] leading-[1.05] font-extrabold mb-6 tracking-[-0.04em] text-[#111111]" style={{ fontFamily: "'Manrope', sans-serif" }}>
              Deterministic Computation.<br />
              <span className="text-[#1E3A5F]">Agentic Intelligence.</span>
            </h1>
            <p className="text-xl md:text-2xl text-[#4B5563] font-medium mb-8 leading-relaxed">
              Seven products for enterprise, midsize, and retail. Treasury hedge governance, agentic charting, portfolio risk, scenario simulation, geopolitical intelligence, and knowledge navigation <span className="text-[#9CA3AF]">-- all on one deterministic platform.</span>
            </p>
            <div className="border-l-2 border-[#1E3A5F] pl-4 mb-10 max-w-3xl">
              <p className="text-[14px] font-mono text-[#6B7280] leading-relaxed">
                [ENGINE_RULE_01]: Engines are deterministic -- same input, same output, always.<br />
                [ENGINE_RULE_02]: AI provides communication, chart analysis, and intelligence.<br />
                [ENGINE_RULE_03]: AI never touches calculations.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Link href="/contact" className="inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold bg-[#1E3A5F] text-white border border-[#1E3A5F] hover:bg-[#162D4A] rounded-sm tracking-wide no-underline transition-all">
                Request Demo →
              </Link>
              <Link href="/products" className="inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold bg-white text-[#111111] border border-[#D1D5DB] hover:border-[#1E3A5F] rounded-sm tracking-wide no-underline transition-all">
                Explore Products
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Stats Strip */}
      <section className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-[#E5E7EB]">
          {[
            { v: "7", l: "Products" }, { v: "3", l: "Market Tiers" }, { v: "41", l: "Engine Modules" },
            { v: "<50ms", l: "Computation" }, { v: "SHA-256", l: "Audit Chain" },
          ].map((stat) => (
            <div key={stat.l} className="flex flex-col items-center justify-center py-10 px-4 hover:bg-[#F9FAFB] transition-colors">
              <span className="font-mono text-[36px] font-extrabold text-[#111111] mb-1">{stat.v}</span>
              <span className="font-mono text-[11px] font-bold tracking-[0.15em] text-[#6B7280] uppercase">{stat.l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Architecture */}
      <section className="py-24 px-6 md:px-12 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-12 items-end mb-12 border-b border-[#E5E7EB] pb-8">
          <div className="flex-1">
            <span className="section-label">ARCHITECTURE</span>
            <h2 className="text-3xl md:text-[44px] font-extrabold" style={{ fontFamily: "'Manrope', sans-serif" }}>The ORDR Platform Architecture</h2>
          </div>
          <div className="flex-1">
            <p className="text-[15px] text-[#4B5563] leading-relaxed">
              Three layers, one principle: deterministic computation with intelligent assistance. The engine never guesses. The AI never executes. Strict separation of concerns enforced by cryptographically sealed governance pipelines.
            </p>
          </div>
        </div>
        <div className="w-full overflow-x-auto">
          <div className="min-w-[800px] p-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-sm">
            <SvgArchitecture />
          </div>
        </div>
      </section>

      {/* Section 4: Interface Showcase */}
      <section className="py-24 px-6 md:px-12 bg-[#F4F5F7] border-y border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="section-label justify-center">INTERFACE</span>
            <h2 className="text-3xl md:text-[44px] font-extrabold" style={{ fontFamily: "'Manrope', sans-serif" }}>Built for professionals. Used by institutions.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { id: "TRM_01", title: "Treasury Terminal", desc: "Hedge calculation output with hash envelope, policy governance, execution pipeline.", bullets: ["Deterministic kernel output","SHA-256 hash envelope","4-eyes execution gate","WORM audit log"] },
              { id: "MKT_02", title: "ORDR Market", desc: "60fps Canvas 2D charting engine with AI-coached algo trading.", bullets: ["77+ indicators","Multi-language algo builder","Real-time data feeds","AI discipline coaching"] },
              { id: "PRT_03", title: "Portfolio Risk", desc: "R1-R8 risk taxonomy with institutional exposure decomposition.", bullets: ["8 risk categories","Concentration analysis (HHI)","Multi-entity netting","Hedge plan generation"] },
            ].map((item) => (
              <div key={item.id} className="bg-[#0A0A0A] rounded-sm border border-[#374151] flex flex-col overflow-hidden group hover:border-[#4B5563] transition-colors shadow-xl">
                <div className="border-b border-[#374151] px-4 py-2.5 flex items-center justify-between bg-[#111111]">
                  <span className="font-mono text-[10px] text-[#9CA3AF] tracking-widest uppercase">PROCESS: {item.id}</span>
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#374151]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#374151]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#059669]" />
                  </div>
                </div>
                <div className="p-8 flex-1">
                  <h3 className="font-mono text-lg font-bold mb-3 text-white">{item.title}</h3>
                  <p className="text-[#9CA3AF] text-[13px] mb-8 min-h-[40px] leading-relaxed">{item.desc}</p>
                  <ul className="space-y-4 border-t border-[#374151] pt-6 list-none p-0 m-0">
                    {item.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-[12px] font-mono text-[#D1D5DB]">
                        <span className="text-[#059669] mt-0.5 shrink-0">&gt;</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 5: Audit Trail */}
      <section className="py-24 px-6 md:px-12 bg-white">
        <div className="max-w-7xl mx-auto">
          <span className="section-label">AUDIT INFRASTRUCTURE</span>
          <h2 className="text-3xl md:text-[44px] font-extrabold mb-6" style={{ fontFamily: "'Manrope', sans-serif" }}>Tamper-Evident Hash Chain</h2>
          <p className="text-[16px] text-[#4B5563] max-w-3xl mb-12 border-l-2 border-[#E5E7EB] pl-4">
            Every calculation, decision, and approval is permanently recorded in an append-only, cryptographically sealed audit trail. <strong className="text-[#111111]">No UPDATE, no DELETE -- ever.</strong>
          </p>
          <div className="w-full overflow-x-auto mb-12">
            <div className="min-w-[800px]"><SvgHashChain /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 border border-[#E5E7EB] rounded-sm divide-y md:divide-y-0 md:divide-x divide-[#E5E7EB] bg-[#F9FAFB]">
            {[
              { t: "WORM Storage", d: "Write Once, Read Many", I: Database },
              { t: "SHA-256", d: "Per-tenant hash chain", I: Lock },
              { t: "Zero Deletion", d: "No UPDATE, no DELETE", I: ShieldAlert },
              { t: "Regulation-Ready", d: "IFRS 9 / ASC 815 aligned", I: FileText },
            ].map((s) => (
              <div key={s.t} className="p-6">
                <s.I size={18} className="text-[#1E3A5F] mb-3" />
                <h4 className="font-bold text-[#111111] mb-1 text-[14px]">{s.t}</h4>
                <p className="text-[#6B7280] text-[13px]">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 6: Products Grid */}
      <section className="py-24 px-6 md:px-12 max-w-7xl mx-auto bg-white border-t border-[#E5E7EB]">
        <span className="section-label">PRODUCTS</span>
        <h2 className="text-3xl md:text-[44px] font-extrabold mb-6" style={{ fontFamily: "'Manrope', sans-serif" }}>Eight products. One ecosystem.</h2>
        <p className="text-[16px] text-[#4B5563] max-w-3xl mb-16 border-l-2 border-[#E5E7EB] pl-4">
          Enterprise treasury governance, professional trading tools, and retail-friendly charting -- each product powered by the same deterministic computation engine.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p, i) => {
            const Icon = p.icon;
            const isLast = i === products.length - 1;
            const wrapper = (children: React.ReactNode) =>
              p.external ? (
                <a key={p.id} href={p.external} target="_blank" rel="noopener noreferrer" className={`mkt-card flex flex-col group cursor-pointer bg-[#F9FAFB] no-underline text-inherit ${isLast ? "lg:col-start-2" : ""}`}>{children}</a>
              ) : (
                <Link key={p.id} href={`/products/${p.id}`} className={`mkt-card flex flex-col group cursor-pointer bg-[#F9FAFB] no-underline text-inherit ${isLast ? "lg:col-start-2" : ""}`}>{children}</Link>
              );
            return wrapper(
              <>
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#E5E7EB]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-sm bg-white flex items-center justify-center text-[#1E3A5F] border border-[#D1D5DB]">
                      <Icon size={16} />
                    </div>
                    <h3 className="font-mono text-[15px] font-bold group-hover:text-[#1E3A5F] transition-colors">{p.name}</h3>
                  </div>
                  <ArrowRight size={16} className="text-[#9CA3AF] group-hover:text-[#1E3A5F] transition-colors" />
                </div>
                <p className="text-[14px] text-[#4B5563] mb-6 flex-grow leading-relaxed">{p.desc}</p>
                <div className="bg-white p-4 rounded-sm border border-[#E5E7EB] mt-auto">
                  <div className="font-mono text-[9px] font-bold text-[#9CA3AF] mb-1 uppercase tracking-widest flex items-center gap-1.5">
                    <BrainCircuit size={10} /> AI Boundary
                  </div>
                  <p className="text-[12px] text-[#6B7280] leading-snug">{p.ai}</p>
                </div>
              </>
            );
          })}
        </div>
      </section>

      {/* Section 7: AI Works */}
      <section className="py-24 px-6 md:px-12 max-w-7xl mx-auto bg-white border-t border-[#E5E7EB]">
        <span className="section-label">INTELLIGENCE</span>
        <h2 className="text-3xl md:text-[44px] font-extrabold mb-12" style={{ fontFamily: "'Manrope', sans-serif" }}>How the AI Layer Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border border-[#E5E7EB] rounded-sm bg-[#F9FAFB]">
          {[
            { n: "01", t: "Engine Calculates", d: "The deterministic engine processes inputs through 41 production modules. Same input always produces the same output. Sub-50ms. Hash-chained. Reproducible." },
            { n: "02", t: "AI Communicates", d: "AI is a communication and management layer for specific products. Treasury uses chat, voice, phone. Market uses AI for chart analysis. Polisophic for geopolitical intelligence. AI does not evaluate engine calculations." },
            { n: "03", t: "AI Assists", d: "Where AI is present, it assists through communication channels: status updates, report writing, chart reading, algo building, geopolitical analysis. AI is not involved in any calculation." },
            { n: "04", t: "Human Decides", d: "AI never auto-executes. Every trade, hedge, and decision is made by the human operator. 4-eyes governance and separation of duties on all execution." },
          ].map((item, i) => (
            <div key={item.n} className={`p-8 ${i !== 3 ? "border-b lg:border-b-0 lg:border-r border-[#E5E7EB]" : ""}`}>
              <span className="font-mono text-[24px] font-bold text-[#D1D5DB] block mb-4">[{item.n}]</span>
              <h3 className="font-bold text-[16px] mb-3 text-[#111111]">{item.t}</h3>
              <p className="text-[13px] text-[#6B7280] leading-relaxed">{item.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 8: Solutions */}
      <section className="py-24 px-6 md:px-12 bg-[#111111] text-white">
        <div className="max-w-7xl mx-auto">
          <span className="section-label text-[#9CA3AF]" style={{ ["--before-bg" as string]: "white" }}>SOLUTIONS</span>
          <h2 className="text-3xl md:text-[44px] font-extrabold mb-12 text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>Built for your industry</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-[#374151] rounded-sm">
            {solutions.map((s, i) => {
              const Icon = s.icon;
              return (
                <Link key={s.id} href={`/solutions/${s.id}`} className="no-underline text-inherit">
                  <div className={`p-8 cursor-pointer group hover:bg-[#1A1A1A] transition-colors border-[#374151] ${(i + 1) % 3 !== 0 ? "lg:border-r" : ""} ${i < 3 ? "border-b" : ""} ${i % 2 === 0 ? "md:border-r" : "md:border-r-0 lg:border-r"}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 rounded-sm bg-[#1A1A1A] flex items-center justify-center text-white border border-[#374151]">
                        <Icon size={18} />
                      </div>
                      <ArrowRight size={16} className="text-[#4B5563] group-hover:text-white transition-colors" />
                    </div>
                    <h3 className="font-bold text-[16px] mb-2 text-white">{s.name}</h3>
                    <p className="text-[13px] text-[#9CA3AF]">{s.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 9: Infrastructure Detail */}
      <section className="py-24 px-6 md:px-12 max-w-7xl mx-auto bg-white">
        <span className="section-label">INFRASTRUCTURE</span>
        <h2 className="text-3xl md:text-[44px] font-extrabold mb-12" style={{ fontFamily: "'Manrope', sans-serif" }}>The ORDR Architecture</h2>
        <div className="w-full overflow-x-auto">
          <div className="min-w-[800px] p-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-sm">
            <SvgPillars />
          </div>
        </div>
      </section>

      {/* Section 10: Workflow */}
      <section className="py-24 px-6 md:px-12 bg-[#F4F5F7] border-y border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto">
          <span className="section-label">WORKFLOW</span>
          <h2 className="text-3xl md:text-[44px] font-extrabold mb-12" style={{ fontFamily: "'Manrope', sans-serif" }}>Five steps. Full governance. AI-assisted.</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { n: "01", t: "Import Exposures", d: "Upload FX positions from ERP, TMS, or spreadsheet. Automatic classification, validation, enrichment." },
              { n: "02", t: "Configure Policy", d: "Select from 60 presets or build custom. Hedge ratios, instruments, governance tiers, risk parameters." },
              { n: "03", t: "Calculate", d: "Deterministic engine computes. Sub-50ms, reproducible, auditable. Every calculation hash-chained." },
              { n: "04", t: "Review & Report", d: "Review engine outputs. AI helps communicate status and write reports. AI does not evaluate calculations." },
              { n: "05", t: "Execute", d: "4-eyes approval, governed execution, WORM audit trail. Every decision recorded, hash-chained, immutable." },
            ].map((item) => (
              <div key={item.n} className="bg-white border border-[#E5E7EB] p-6 rounded-sm relative shadow-sm">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#1E3A5F]" />
                <span className="font-mono text-xs font-bold text-[#9CA3AF] mb-4 block">STEP {item.n}</span>
                <h3 className="font-bold text-[14px] mb-2 text-[#111111]">{item.t}</h3>
                <p className="text-[12px] text-[#6B7280] leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 11: Capabilities */}
      <section className="py-24 px-6 md:px-12 max-w-7xl mx-auto bg-white">
        <span className="section-label">PLATFORM</span>
        <h2 className="text-3xl md:text-[44px] font-extrabold mb-12" style={{ fontFamily: "'Manrope', sans-serif" }}>Built to institutional standards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
          {[
            { t: "WORM Audit Trail", d: "Append-only event log with SHA-256 hash chain. Per-tenant chains with GENESIS_HASH verification." },
            { t: "4-Eyes Governance", d: "Maker-checker with SoD. Tri-state pipeline. Threshold-based escalation with 3-actor SoD." },
            { t: "Deterministic Engine", d: "41 modules, sub-50ms. Pure functions, no side effects, no randomness. Independently verifiable." },
            { t: "IFRS 9 / ASC 815", d: "Prospective effectiveness testing, critical terms matching, dual-standard support, evidence grading." },
            { t: "Real-Time Risk Intelligence", d: "R1-R8 taxonomy, exposure decomposition, concentration analysis, scenario stress testing." },
            { t: "Policy Engine", d: "60 presets, 7-layer extension architecture, volatility overlays, geopolitical risk, netting." },
          ].map((item) => (
            <div key={item.t} className="flex gap-4 items-start">
              <div className="w-6 h-6 rounded bg-[#F4F5F7] border border-[#E5E7EB] flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle size={12} className="text-[#1E3A5F]" />
              </div>
              <div>
                <h3 className="font-bold mb-1.5 text-[15px]">{item.t}</h3>
                <p className="text-[13px] text-[#6B7280] leading-relaxed">{item.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 12: CTA */}
      <section className="py-24 px-6 md:px-12 bg-[#0A0A0A] text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-dark pointer-events-none" style={{ maskImage: "linear-gradient(to bottom, black, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent)" }} />
        <div className="max-w-3xl mx-auto relative z-10">
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-[#10B981] uppercase mb-6 block">ENTERPRISE-GRADE INFRASTRUCTURE</span>
          <h2 className="text-[36px] md:text-[48px] font-extrabold mb-6 text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>See the platform in action</h2>
          <p className="text-[16px] text-[#9CA3AF] mb-10 leading-relaxed max-w-2xl mx-auto">
            Request a guided demo with live data. Enterprise treasury teams, professional traders, and risk managers -- experience the full deterministic ecosystem.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/contact" className="inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold bg-white text-[#000000] border border-white hover:bg-[#E5E7EB] rounded-sm tracking-wide no-underline transition-all">
              Request Demo →
            </Link>
            <Link href="/auth/login" className="inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold bg-transparent text-white border border-[#374151] hover:border-white rounded-sm tracking-wide no-underline transition-all">
              Sign In
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
