"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";

export default function AboutPage() {
  return (
    <MarketingLayout>
      <div className="bg-white pt-[84px] pb-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <span className="section-label">ABOUT ORDR</span>
          <h1 className="text-[44px] md:text-[64px] font-extrabold mb-8 max-w-4xl leading-[1.05] tracking-[-0.04em]" style={{ fontFamily: "'Manrope', sans-serif" }}>
            Institutional-Grade Financial Infrastructure.
          </h1>
          <p className="text-xl md:text-[22px] text-[#4B5563] max-w-3xl mb-16 leading-relaxed">
            We built ORDR Terminal on a single uncompromising principle: <strong className="text-[#111111]">financial computation must be deterministic.</strong> Same inputs must produce identical outputs. No machine learning black boxes. No probabilistic guesses.
          </p>

          {/* Two-panel approach */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-[#E5E7EB] rounded-sm mb-24 bg-[#F9FAFB]">
            <div className="p-10 border-b md:border-b-0 md:border-r border-[#E5E7EB] bg-white">
              <span className="font-mono text-[10px] font-bold text-[#1E3A5F] tracking-[0.2em] uppercase mb-4 block">CORE COMPONENT 01</span>
              <h3 className="text-[28px] font-extrabold mb-4" style={{ fontFamily: "'Manrope', sans-serif" }}>The Engine</h3>
              <p className="text-[#4B5563] text-[15px] leading-relaxed">Our core is a purely deterministic engine composed of 41 isolated modules. It calculates hedge ratios, risk parameters, and scenario simulations in under 50 milliseconds with cryptographically proven consistency.</p>
            </div>
            <div className="p-10 bg-white">
              <span className="font-mono text-[10px] font-bold text-[#059669] tracking-[0.2em] uppercase mb-4 block">CORE COMPONENT 02</span>
              <h3 className="text-[28px] font-extrabold mb-4" style={{ fontFamily: "'Manrope', sans-serif" }}>The AI Layer</h3>
              <p className="text-[#4B5563] text-[15px] leading-relaxed">We deploy agentic AI exclusively as a communication, analysis, and management layer. It reads charts, drafts reports, and answers queries. It never auto-executes, and it never touches a calculation.</p>
            </div>
          </div>

          {/* Core Values */}
          <h2 className="text-[32px] md:text-[40px] font-extrabold mb-8" style={{ fontFamily: "'Manrope', sans-serif" }}>Core Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-0 border border-[#E5E7EB] rounded-sm mb-24">
            {[
              { t: "Determinism", d: "Same inputs → identical outputs. 41 modules, sub-50ms, reproducible." },
              { t: "Transparency", d: "Full audit trail. SHA-256 hash-chained, complete provenance." },
              { t: "Governance", d: "4-eyes, SoD, 41 permissions, 9 roles, tri-state pipeline." },
              { t: "Simplicity", d: "Complex problems, clear interfaces. AI in plain language." },
            ].map((v, i) => (
              <div key={v.t} className={`p-8 bg-[#F9FAFB] hover:bg-white transition-colors ${i !== 3 ? "border-b md:border-b-0 md:border-r border-[#E5E7EB]" : ""}`}>
                <h4 className="font-mono text-[14px] font-bold text-[#1E3A5F] mb-3 uppercase tracking-wide">[{v.t}]</h4>
                <p className="text-[13px] text-[#6B7280] leading-relaxed">{v.d}</p>
              </div>
            ))}
          </div>

          {/* Numbers Strip */}
          <div className="bg-[#111111] text-white p-0 rounded-sm border border-[#374151] overflow-hidden">
            <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-[#374151]">
              {[
                { v: "41", l: "Engine Modules" },
                { v: "219+", l: "API Endpoints" },
                { v: "<50ms", l: "Latency" },
                { v: "7", l: "Product Suite" },
                { v: "60", l: "Policy Presets" },
              ].map((n) => (
                <div key={n.l} className="p-8 text-center hover:bg-[#1A1A1A] transition-colors">
                  <span className="font-mono text-[32px] font-bold block mb-2 text-white">{n.v}</span>
                  <span className="font-mono text-[10px] text-[#9CA3AF] tracking-widest uppercase">{n.l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
