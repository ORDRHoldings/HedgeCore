"use client";

import Link from "next/link";

const PRODUCTS = [
  { name: "ORDR Treasury", href: "/products/treasury" },
  { name: "ORDR Market", href: "https://ordr-market.vercel.app/", external: true },
  { name: "ORDR Connect", href: "https://ordr-connect.vercel.app/", external: true },
  { name: "ORDR Portfolio", href: "/products/portfolio" },
  { name: "ORDR Labs", href: "/products/labs" },
  { name: "ORDR Polisophic", href: "/products/polisophic" },
  { name: "ORDR HedgeWiki", href: "https://hedge-wiki.vercel.app/", external: true },
  { name: "ORDR FinHub", href: "/products/finhub" },
  { name: "ORDR Fund", href: "/products/fund" },
];

const SOLUTIONS = [
  { name: "Corporate Treasury", href: "/solutions/corporate-treasury" },
  { name: "Risk Management", href: "/solutions/risk-management" },
  { name: "Asset Management", href: "/solutions/asset-management" },
  { name: "Banking & Capital Markets", href: "/solutions/banking" },
  { name: "Insurance", href: "/solutions/insurance" },
  { name: "Energy & Commodities", href: "/solutions/energy" },
];

const COMPANY = [
  { name: "About", href: "/about" },
  { name: "Contact", href: "/contact" },
  { name: "Careers", href: "/careers" },
];

const LEGAL = [
  { name: "Privacy Policy", href: "/privacy" },
  { name: "Terms of Service", href: "/terms" },
  { name: "Security", href: "/security" },
];

export default function MarketingFooter() {
  return (
    <footer className="bg-[#050505] text-[#9CA3AF] pt-20 pb-10 px-6 md:px-12 text-[13px] border-t border-[#1E3A5F]">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
        {/* Brand */}
        <div>
          <span className="font-mono text-[20px] font-extrabold tracking-[0.06em] text-white block mb-4">ORDR</span>
          <p className="leading-relaxed mb-6">The fintech ecosystem for enterprise, midsize, and retail. Deterministic computation, agentic intelligence, tamper-evident audit.</p>
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold text-[#059669] border border-[#333333] bg-[#0A0A0A] px-2 py-1 rounded-sm w-fit">
            <span className="status-dot" /> SYSTEMS ONLINE
          </div>
        </div>

        {/* Products */}
        <div>
          <h4 className="font-mono text-[10px] font-bold text-white tracking-widest uppercase mb-6">Products</h4>
          <ul className="space-y-4 list-none p-0 m-0">
            {PRODUCTS.map(p => (
              <li key={p.name}>
                {p.external ? (
                  <a href={p.href} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors no-underline text-[#9CA3AF]">{p.name}</a>
                ) : (
                  <Link href={p.href} className="hover:text-white transition-colors no-underline text-[#9CA3AF]">{p.name}</Link>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Solutions */}
        <div>
          <h4 className="font-mono text-[10px] font-bold text-white tracking-widest uppercase mb-6">Solutions</h4>
          <ul className="space-y-4 list-none p-0 m-0">
            {SOLUTIONS.map(s => (
              <li key={s.name}>
                <Link href={s.href} className="hover:text-white transition-colors no-underline text-[#9CA3AF]">{s.name}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Company */}
        <div>
          <h4 className="font-mono text-[10px] font-bold text-white tracking-widest uppercase mb-6">Company</h4>
          <ul className="space-y-4 list-none p-0 m-0">
            {COMPANY.map(c => (
              <li key={c.name}>
                <Link href={c.href} className="hover:text-white transition-colors no-underline text-[#9CA3AF]">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h4 className="font-mono text-[10px] font-bold text-white tracking-widest uppercase mb-6">Legal</h4>
          <ul className="space-y-4 list-none p-0 m-0">
            {LEGAL.map(l => (
              <li key={l.name}>
                <Link href={l.href} className="hover:text-white transition-colors no-underline text-[#9CA3AF]">{l.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto border-t border-[#333333] pt-8 flex flex-col md:flex-row justify-between items-center text-[11px] font-mono text-[#6B7280]">
        <span>© {new Date().getFullYear()} ORDR TERMINAL INC. ALL RIGHTS RESERVED.</span>
        <span className="mt-4 md:mt-0">INFO@ORDRTERMINAL.COM</span>
      </div>
    </footer>
  );
}
