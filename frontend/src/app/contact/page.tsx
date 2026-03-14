"use client";

import { useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <MarketingLayout>
      <div className="bg-[#F4F5F7] min-h-screen pt-[84px] pb-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Left: Form */}
            <div className="w-full lg:w-[65%] bg-white p-8 md:p-12 rounded-sm border border-[#E5E7EB] shadow-sm">
              <span className="section-label">CONTACT / INQUIRY</span>
              <h1 className="text-[36px] md:text-[48px] font-extrabold mb-8 tracking-[-0.04em]" style={{ fontFamily: "'Manrope', sans-serif" }}>Request Demo &amp; Access</h1>

              {submitted ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-full bg-[rgba(22,163,74,0.08)] flex items-center justify-center mx-auto mb-6">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
                  </div>
                  <h3 className="text-2xl font-extrabold mb-3" style={{ fontFamily: "'Manrope', sans-serif" }}>Thank you</h3>
                  <p className="text-[15px] text-[#4B5563] max-w-sm mx-auto leading-relaxed">We have received your message and will get back to you within one business day.</p>
                </div>
              ) : (
                <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[12px] font-bold text-[#4B5563] mb-2 uppercase tracking-wide">First Name</label>
                      <input type="text" required className="w-full p-3 border border-[#D1D5DB] rounded-sm bg-white focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] outline-none transition-all text-[14px]" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-bold text-[#4B5563] mb-2 uppercase tracking-wide">Last Name</label>
                      <input type="text" className="w-full p-3 border border-[#D1D5DB] rounded-sm bg-white focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] outline-none transition-all text-[14px]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-[#4B5563] mb-2 uppercase tracking-wide">Work Email</label>
                    <input type="email" required className="w-full p-3 border border-[#D1D5DB] rounded-sm bg-white focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] outline-none transition-all text-[14px]" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[12px] font-bold text-[#4B5563] mb-2 uppercase tracking-wide">Company</label>
                      <input type="text" className="w-full p-3 border border-[#D1D5DB] rounded-sm bg-white focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] outline-none transition-all text-[14px]" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-bold text-[#4B5563] mb-2 uppercase tracking-wide">Role</label>
                      <select className="w-full p-3 border border-[#D1D5DB] rounded-sm bg-white focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] outline-none transition-all text-[14px] appearance-none cursor-pointer">
                        <option>VP Treasury</option>
                        <option>Treasury Analyst</option>
                        <option>CRO</option>
                        <option>VP Risk</option>
                        <option>Portfolio Manager</option>
                        <option>Head of FX</option>
                        <option>Compliance</option>
                        <option>CTO</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-[#4B5563] mb-2 uppercase tracking-wide">Message or Use Case</label>
                    <textarea rows={4} className="w-full p-3 border border-[#D1D5DB] rounded-sm bg-white focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] outline-none transition-all text-[14px] resize-none" />
                  </div>
                  <div className="pt-2">
                    <button type="submit" className="w-full py-4 bg-[#1E3A5F] text-white border border-[#1E3A5F] hover:bg-[#162D4A] rounded-sm uppercase tracking-widest text-[12px] font-bold cursor-pointer transition-all">
                      SUBMIT INQUIRY
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Right: Cards */}
            <div className="w-full lg:w-[35%] space-y-4">
              {[
                { t: "General Inquiries", d: "info@ordrterminal.com" },
                { t: "Sales & Demos", d: "sales@ordrterminal.com" },
                { t: "Technical Support", d: "support@ordrterminal.com" },
                { t: "Headquarters", d: "Newport Beach, CA, USA" },
              ].map((c) => (
                <div key={c.t} className="bg-white p-6 rounded-sm border border-[#E5E7EB] hover:border-[#D1D5DB] transition-colors">
                  <h4 className="font-mono text-[10px] font-bold text-[#6B7280] tracking-widest uppercase mb-2">{c.t}</h4>
                  <p className="font-bold text-[14px] text-[#111111]">{c.d}</p>
                </div>
              ))}
              <div className="bg-[#111111] p-6 rounded-sm border border-[#374151] mt-8 text-white">
                <h4 className="font-mono text-[10px] font-bold text-[#9CA3AF] tracking-widest uppercase mb-3">SYSTEM_STATUS</h4>
                <div className="flex items-center gap-3 mb-2">
                  <span className="status-dot pulsing" />
                  <span className="text-[13px] font-bold">ALL SYSTEMS OPERATIONAL</span>
                </div>
                <p className="text-[12px] text-[#9CA3AF] font-mono mt-4 border-t border-[#374151] pt-4">API LATENCY: 12ms</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
