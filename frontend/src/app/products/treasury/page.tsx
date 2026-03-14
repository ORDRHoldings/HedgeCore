"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Cpu, Users, Shield, FileCheck, Settings, FileSpreadsheet,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const FEATURES = [
  { icon: <Settings size={20} />, title: "Policy Engine", desc: "60 policy presets with maturity profiles, governance tiers, and evidence grades. Extended overlays for volatility, geopolitical risk, and netting." },
  { icon: <Users size={20} />, title: "4-Eyes Governance", desc: "Maker-checker approval with Separation of Duties. Sandbox to Staging to Ledger pipeline. No single point of failure." },
  { icon: <Shield size={20} />, title: "WORM Audit Trail", desc: "Append-only event log with SHA-256 hash chain per tenant. Tamper-evident, regulation-proof audit semantics." },
  { icon: <FileCheck size={20} />, title: "IFRS 9 / ASC 815", desc: "Built-in prospective effectiveness testing, hedge documentation, critical terms matching, and accounting framework alignment." },
  { icon: <FileSpreadsheet size={20} />, title: "60 Policy Presets", desc: "Pre-configured hedge policies covering every common treasury scenario. Maturity profiles, governance tiers, and evidence grades included." },
  { icon: <Cpu size={20} />, title: "Execution Pipeline", desc: "Deterministic computation engine with 41 production modules. Sub-50ms calculation, reproducible and auditable." },
];

const STATS = [
  { value: "60", label: "Presets" },
  { value: "8", label: "Risk Categories" },
  { value: "<50ms", label: "Computation" },
  { value: "SHA-256", label: "Hash Chain" },
];

export default function TreasuryPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>ORDR Treasury</h1>
        <p style={{ fontFamily: F.ui, fontSize: 18, color: C.textSub, maxWidth: 600, margin: "0 auto 32px", lineHeight: 1.6 }}>
          The institutional standard for FX hedge governance. Deterministic computation, 4-eyes approval, WORM audit trail, and IFRS 9 effectiveness testing.
        </p>
        <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Get Started <ArrowRight size={16} />
        </Link>
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
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Start managing your hedge portfolio</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>Deterministic, auditable, governed. From exposure to execution.</p>
        <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      <style>{`@media(max-width:768px){
        .feat-grid { grid-template-columns: 1fr !important; }
        .stats-row { flex-wrap: wrap; gap: 32px !important; }
      }`}</style>
    </MarketingLayout>
  );
}
