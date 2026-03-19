"use client";

import Link from "next/link";
import {
  Shield, BarChart2, Layers, Zap, Globe, BookOpen, Activity, TrendingUp,
  ArrowRight, BrainCircuit,
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

export default function ProductsPage() {
  return (
    <MarketingLayout>
      <div className="bg-[#F4F5F7] pt-[84px] pb-24 min-h-screen">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center mb-16">
          <span className="section-label justify-center text-center mb-4">ORDR TERMINAL PLATFORM</span>
          <h1 className="text-[44px] md:text-[64px] font-extrabold mb-6 tracking-[-0.04em]" style={{ fontFamily: "'Manrope', sans-serif" }}>Eight Products. One Ecosystem.</h1>
          <p className="text-xl md:text-[22px] text-[#4B5563] max-w-3xl mx-auto leading-relaxed">
            Enterprise treasury governance, professional trading tools, and retail-friendly charting -- all on one deterministic platform. AI is not used in calculations.
          </p>
        </div>

        <div className="max-w-7xl mx-auto px-6 md:px-12 mb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map((p) => {
              const Icon = p.icon;
              const content = (
                <div className="mkt-card bg-white hover:shadow-md transition-shadow cursor-pointer flex flex-col h-full border border-[#E5E7EB]">
                  <div className="flex items-start gap-5 mb-5">
                    <div className="w-12 h-12 rounded-sm bg-[#F9FAFB] flex items-center justify-center text-[#1E3A5F] shrink-0 border border-[#E5E7EB]">
                      <Icon size={20} />
                    </div>
                    <div>
                      <h3 className="font-mono text-[16px] font-bold mb-1">{p.name}</h3>
                      <p className="text-[13px] text-[#6B7280] leading-relaxed">{p.desc}</p>
                    </div>
                  </div>
                  <div className="mt-auto bg-[#F9FAFB] p-4 rounded-sm border border-[#E5E7EB]">
                    <div className="font-mono text-[9px] font-bold text-[#9CA3AF] tracking-widest uppercase mb-1.5 flex items-center gap-1.5">
                      <BrainCircuit size={10} /> AI Boundary Constraint
                    </div>
                    <div className="text-[12px] text-[#4B5563] font-medium leading-snug">{p.ai}</div>
                  </div>
                </div>
              );
              return (p as { external?: string }).external ? (
                <a key={p.id} href={(p as { external: string }).external} target="_blank" rel="noopener noreferrer" className="no-underline text-inherit">{content}</a>
              ) : (
                <Link key={p.id} href={`/products/${p.id}`} className="no-underline text-inherit">{content}</Link>
              );
            })}
          </div>
        </div>

        <div className="bg-[#111111] py-20 px-6 text-center text-white mx-6 md:mx-12 rounded-sm border border-[#374151] max-w-7xl xl:mx-auto">
          <h2 className="text-[32px] md:text-[40px] font-extrabold mb-8" style={{ fontFamily: "'Manrope', sans-serif" }}>See the ecosystem in action</h2>
          <Link href="/contact" className="inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold bg-white text-[#111111] hover:bg-[#E5E7EB] border border-white rounded-sm tracking-wide no-underline transition-all uppercase">
            REQUEST DEMO →
          </Link>
        </div>
      </div>
    </MarketingLayout>
  );
}
