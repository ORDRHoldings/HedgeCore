"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Menu, X, ChevronDown } from "lucide-react";
import {
  Shield, BarChart2, Layers, Zap, Globe, BookOpen, Activity,
  Building, ShieldAlert, Briefcase, Landmark, FileText,
} from "lucide-react";

const PRODUCTS = [
  { id: "treasury", name: "ORDR Treasury", desc: "FX hedge calculation, policy governance", icon: Shield, external: null },
  { id: "market", name: "ORDR Market", desc: "Agentic charting and algo trading", icon: BarChart2, external: "https://ordr-market.vercel.app/" },
  { id: "portfolio", name: "ORDR Portfolio", desc: "Portfolio risk decomposition", icon: Layers, external: null },
  { id: "labs", name: "ORDR Labs", desc: "Scenario studio and backtesting", icon: Zap, external: null },
  { id: "polisophic", name: "ORDR Polisophic", desc: "Geopolitical risk intelligence", icon: Globe, external: null },
  { id: "hedgewiki", name: "ORDR HedgeWiki", desc: "ISDA / IFRS 9 / ASC 815 reference", icon: BookOpen, external: "https://hedge-wiki.vercel.app/" },
  { id: "finhub", name: "ORDR FinHub", desc: "AI-curated market intelligence", icon: Activity, external: null },
];

const SOLUTIONS = [
  { id: "corporate-treasury", name: "Corporate Treasury", icon: Building },
  { id: "risk-management", name: "Risk Management", icon: ShieldAlert },
  { id: "asset-management", name: "Asset Management", icon: Briefcase },
  { id: "banking", name: "Banking & Capital Markets", icon: Landmark },
  { id: "insurance", name: "Insurance", icon: FileText },
  { id: "energy", name: "Energy & Commodities", icon: Zap },
];

export default function MarketingNav() {
  const [mob, setMob] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const c = () => setMob(window.innerWidth < 900);
    c();
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const enter = useCallback((n: string) => {
    if (timeout.current) clearTimeout(timeout.current);
    setActiveDropdown(n);
  }, []);

  const leave = useCallback(() => {
    timeout.current = setTimeout(() => setActiveDropdown(null), 100);
  }, []);

  return (
    <>
      <nav className="fixed top-0 w-full h-[56px] bg-[#000000] text-white z-50 flex items-center px-4 md:px-8 border-b border-[#333333]">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-[#1E3A5F]" />

        {/* Logo */}
        <div className="flex-1 flex items-center">
          <Link href="/" className="font-mono text-[18px] font-extrabold tracking-[0.06em] hover:text-[#D1D5DB] transition-colors no-underline text-white">
            ORDR
          </Link>
        </div>

        {/* Desktop Menu */}
        {!mob && (
          <div className="flex flex-1 justify-center items-center gap-8 text-[12px] font-bold tracking-wide uppercase h-full text-[#9CA3AF]">
            {/* Products Dropdown */}
            <div className="relative h-full flex items-center cursor-pointer hover:text-white transition-colors"
              onMouseEnter={() => enter("products")} onMouseLeave={leave}>
              <span className="flex items-center gap-1">Products <ChevronDown size={14} /></span>
              {activeDropdown === "products" && (
                <div className="absolute top-[56px] left-1/2 -translate-x-1/2 w-[520px] bg-white text-[#111111] shadow-2xl border border-[#D1D5DB] rounded-b-sm p-4 grid grid-cols-2 gap-x-4 gap-y-2 normal-case tracking-normal">
                  <div className="col-span-2 mb-2 px-2 pb-2 border-b border-[#E5E7EB]">
                    <span className="font-mono text-[10px] font-bold text-[#6B7280] tracking-widest uppercase">Ecosystem Modules</span>
                  </div>
                  {PRODUCTS.map(p => {
                    const Icon = p.icon;
                    const inner = (
                      <div className="p-3 hover:bg-[#F9FAFB] rounded-sm cursor-pointer group/item flex items-start gap-3 border border-transparent hover:border-[#E5E7EB] transition-all">
                        <div className="w-6 h-6 rounded-sm bg-[#F4F5F7] flex items-center justify-center shrink-0 border border-[#E5E7EB]">
                          <Icon size={12} className="text-[#4B5563] group-hover/item:text-[#1E3A5F]" />
                        </div>
                        <div>
                          <div className="font-bold text-[13px] leading-tight mb-1 group-hover/item:text-[#1E3A5F]">{p.name}</div>
                          <div className="text-[11px] text-[#6B7280] truncate max-w-[170px] font-medium">{p.desc}</div>
                        </div>
                      </div>
                    );
                    return p.external ? (
                      <a key={p.id} href={p.external} target="_blank" rel="noopener noreferrer" className="no-underline text-inherit" onClick={() => setActiveDropdown(null)}>{inner}</a>
                    ) : (
                      <Link key={p.id} href={`/products/${p.id}`} className="no-underline text-inherit" onClick={() => setActiveDropdown(null)}>{inner}</Link>
                    );
                  })}
                  <div className="col-span-2 mt-2 pt-3 border-t border-[#E5E7EB] px-2 text-center bg-[#F9FAFB] rounded-sm">
                    <Link href="/products" className="text-[#1E3A5F] text-[11px] font-bold uppercase tracking-widest hover:underline no-underline" onClick={() => setActiveDropdown(null)}>
                      VIEW ALL MODULES →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Solutions Dropdown */}
            <div className="relative h-full flex items-center cursor-pointer hover:text-white transition-colors"
              onMouseEnter={() => enter("solutions")} onMouseLeave={leave}>
              <span className="flex items-center gap-1">Solutions <ChevronDown size={14} /></span>
              {activeDropdown === "solutions" && (
                <div className="absolute top-[56px] left-1/2 -translate-x-1/2 w-[380px] bg-white text-[#111111] shadow-2xl border border-[#D1D5DB] rounded-b-sm p-3 flex flex-col gap-1 normal-case tracking-normal">
                  <div className="mb-2 px-2 pb-2 border-b border-[#E5E7EB]">
                    <span className="font-mono text-[10px] font-bold text-[#6B7280] tracking-widest uppercase">Industries Served</span>
                  </div>
                  {SOLUTIONS.map(s => {
                    const Icon = s.icon;
                    return (
                      <Link key={s.id} href={`/solutions/${s.id}`} className="no-underline text-inherit" onClick={() => setActiveDropdown(null)}>
                        <div className="p-3 hover:bg-[#F9FAFB] rounded-sm cursor-pointer group/item flex items-center gap-3 border border-transparent hover:border-[#E5E7EB] transition-all">
                          <Icon size={14} className="text-[#6B7280] group-hover/item:text-[#1E3A5F]" />
                          <div className="font-bold text-[13px] group-hover/item:text-[#1E3A5F]">{s.name}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <Link href="/about" className="hover:text-white transition-colors no-underline text-[#9CA3AF]">About</Link>
            <Link href="/contact" className="hover:text-white transition-colors no-underline text-[#9CA3AF]">Contact</Link>
          </div>
        )}

        {/* Right Side */}
        <div className="flex-1 flex justify-end items-center gap-6 text-[12px] font-bold tracking-wide">
          {!mob && (
            <>
              <Link href="/auth/login" className="text-[#9CA3AF] hover:text-white transition-colors no-underline uppercase">Sign In</Link>
              <Link href="/contact" className="bg-white text-[#000000] px-5 py-2 rounded-sm hover:bg-[#E5E7EB] transition-colors no-underline uppercase">
                Request Demo
              </Link>
            </>
          )}
          {mob && (
            <button onClick={() => setMobileOpen(p => !p)} aria-label="Menu"
              className="w-9 h-9 rounded-sm flex items-center justify-center cursor-pointer bg-[rgba(255,255,255,0.1)] border-none text-white">
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {mob && mobileOpen && (
        <div className="fixed top-[56px] left-0 w-full h-[calc(100vh-56px)] bg-[#0A0A0A] text-white p-6 flex flex-col gap-6 overflow-y-auto z-[99]">
          <div className="text-[10px] font-mono font-bold text-[#6B7280] tracking-widest uppercase">NAVIGATION</div>
          <Link href="/" onClick={() => setMobileOpen(false)} className="text-[18px] font-bold border-b border-[#333333] pb-4 uppercase no-underline text-white">Home</Link>
          <Link href="/products" onClick={() => setMobileOpen(false)} className="text-[18px] font-bold border-b border-[#333333] pb-4 uppercase no-underline text-white">Products</Link>
          <Link href="/about" onClick={() => setMobileOpen(false)} className="text-[18px] font-bold border-b border-[#333333] pb-4 uppercase no-underline text-white">About</Link>
          <Link href="/contact" onClick={() => setMobileOpen(false)} className="text-[18px] font-bold border-b border-[#333333] pb-4 uppercase no-underline text-white">Contact</Link>
          <div className="mt-auto flex flex-col gap-4">
            <Link href="/auth/login" onClick={() => setMobileOpen(false)}
              className="block text-center py-4 border border-[#374151] rounded-sm text-white no-underline uppercase text-[13px] font-bold tracking-wide hover:bg-[#111827]">
              Sign In
            </Link>
            <Link href="/contact" onClick={() => setMobileOpen(false)}
              className="block text-center py-4 bg-white text-black rounded-sm no-underline uppercase text-[13px] font-bold tracking-wide">
              Request Demo
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
