"use client";

import Link from "next/link";
import {
  LayoutGrid, TrendingUp, PieChart, FlaskConical, Globe, BookOpen, Newspaper,
  ArrowRight, Upload, Settings, Calculator, ShieldCheck,
  Shield, Users, Layers, FileCheck, Cpu, Eye,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F, PRODUCTS, SOLUTIONS } from "@/components/marketing/theme";

/* ── Icon resolver ── */
const ICONS: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid size={22} strokeWidth={1.6} />,
  TrendingUp: <TrendingUp size={22} strokeWidth={1.6} />,
  PieChart: <PieChart size={22} strokeWidth={1.6} />,
  FlaskConical: <FlaskConical size={22} strokeWidth={1.6} />,
  Globe: <Globe size={22} strokeWidth={1.6} />,
  BookOpen: <BookOpen size={22} strokeWidth={1.6} />,
  Newspaper: <Newspaper size={22} strokeWidth={1.6} />,
};

/* ── Data ── */
const STATS = [
  { value: "7", label: "Products" },
  { value: "219+", label: "API Endpoints" },
  { value: "41", label: "Engine Modules" },
  { value: "<50ms", label: "Latency" },
];

const CAPABILITIES = [
  { icon: <Shield size={20} />, title: "WORM Audit Trail", desc: "Append-only event log with SHA-256 hash chain. Tamper-evident, regulation-proof audit semantics." },
  { icon: <Users size={20} />, title: "4-Eyes Governance", desc: "Maker-checker approval with Separation of Duties. Sandbox to Staging to Ledger pipeline." },
  { icon: <Cpu size={20} />, title: "Deterministic Engine", desc: "Same inputs produce same outputs, always. 41 production modules, sub-50ms computation." },
  { icon: <FileCheck size={20} />, title: "IFRS 9 / ASC 815", desc: "Built-in prospective effectiveness testing, hedge documentation, and accounting framework alignment." },
  { icon: <Eye size={20} />, title: "Real-Time Risk", desc: "R1-R8 risk taxonomy, exposure decomposition, concentration analysis, and scenario stress testing." },
  { icon: <Layers size={20} />, title: "Policy Engine", desc: "60 policy presets with maturity profiles, governance tiers, evidence grades, and extended overlays." },
];

const WORKFLOW = [
  { step: "01", icon: <Upload size={20} />, title: "Import Exposures", desc: "Upload FX positions from ERP, TMS, or spreadsheet. Automatic classification and validation." },
  { step: "02", icon: <Settings size={20} />, title: "Configure Policy", desc: "Select from 60 presets or build custom policies. Hedge ratios, instruments, governance tier." },
  { step: "03", icon: <Calculator size={20} />, title: "Calculate", desc: "Deterministic engine computes hedge recommendations. Sub-50ms, reproducible, auditable." },
  { step: "04", icon: <ShieldCheck size={20} />, title: "Execute", desc: "4-eyes approval, governed execution, WORM audit trail. Every decision hash-chained and immutable." },
];

const SOLUTION_ICONS: Record<string, React.ReactNode> = {
  "corporate-treasury": <LayoutGrid size={20} />,
  "risk-management": <Shield size={20} />,
  "asset-management": <PieChart size={20} />,
  "banking": <TrendingUp size={20} />,
  "insurance": <FileCheck size={20} />,
  "energy": <Cpu size={20} />,
};

export default function LandingPage() {
  return (
    <MarketingLayout>
      {/* ── Hero ── */}
      <section style={{ padding: "100px 48px 80px", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <h1 style={{ fontFamily: F.heading, fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, margin: "0 0 20px", color: C.text }}>
          Institutional FX Risk Management
        </h1>
        <p style={{ fontFamily: F.ui, fontSize: 19, color: C.textSub, maxWidth: 620, margin: "0 auto 36px", lineHeight: 1.6 }}>
          Deterministic computation, 4-eyes governance, and WORM audit trails.
          Built for treasury teams that cannot afford ambiguity.
        </p>
        <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "13px 32px", borderRadius: 6, textDecoration: "none" }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      {/* ── Stats Strip ── */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 48px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "center", gap: 80 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 28, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Products Grid ── */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Products</div>
          <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: 0, color: C.text }}>
            Seven products. One institutional platform.
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.6, marginTop: 12, maxWidth: 560 }}>
            Each product is purpose-built for a specific function in the hedge lifecycle.
          </p>
        </div>
        <div className="products-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {PRODUCTS.map((p, i) => (
            <Link key={p.slug} href={`/products/${p.slug}`} style={{ textDecoration: "none", color: "inherit", ...(!!(i === 6) ? { gridColumn: "2 / 3" } : {}) }}>
              <div style={{ padding: "24px", border: `1px solid ${C.border}`, borderRadius: 8, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: C.bgAlt, color: C.accent }}>
                    {ICONS[p.icon] || <LayoutGrid size={22} />}
                  </div>
                  <div style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", color: C.text }}>{p.name}</div>
                </div>
                <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, flex: 1, margin: 0 }}>{p.desc}</p>
                <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, color: C.accent, display: "flex", alignItems: "center", gap: 4 }}>
                  Learn More <ArrowRight size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Solutions Grid ── */}
      <section style={{ background: C.bgAlt, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Solutions</div>
            <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: 0, color: C.text }}>
              Built for your industry
            </h2>
          </div>
          <div className="solutions-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {SOLUTIONS.map(s => (
              <Link key={s.slug} href={`/solutions/${s.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ padding: "24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, height: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ color: C.accent }}>{SOLUTION_ICONS[s.slug] || <LayoutGrid size={20} />}</div>
                    <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text }}>{s.name}</div>
                  </div>
                  <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Workflow</div>
          <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: 0, color: C.text }}>
            Four steps. Full governance.
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.6, marginTop: 12, maxWidth: 520, margin: "12px auto 0" }}>
            From raw exposure data to audited execution -- every step deterministic, every decision recorded.
          </p>
        </div>
        <div className="workflow-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          {WORKFLOW.map(w => (
            <div key={w.step} style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8, position: "relative" }}>
              <div style={{ fontFamily: F.mono, fontSize: 44, fontWeight: 900, color: C.bgMuted, position: "absolute", top: 12, right: 16, lineHeight: 1 }}>{w.step}</div>
              <div style={{ width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: C.bgAlt, color: C.accent, marginBottom: 16 }}>
                {w.icon}
              </div>
              <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>{w.title}</div>
              <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Platform Capabilities ── */}
      <section style={{ background: C.bgAlt, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.15em", color: C.textMuted, marginBottom: 12, textTransform: "uppercase" }}>Platform</div>
            <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: 0, color: C.text }}>
              Built to institutional standards
            </h2>
          </div>
          <div className="cap-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {CAPABILITIES.map(cap => (
              <div key={cap.title} style={{ padding: "24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ color: C.accent, marginBottom: 16 }}>{cap.icon}</div>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>{cap.title}</div>
                <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 40, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>
          Ready to transform your hedge operations?
        </h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32, maxWidth: 500, margin: "0 auto 32px" }}>
          Join the treasury teams that trust ORDR Terminal for deterministic, auditable, governed hedge management.
        </p>
        <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "13px 32px", borderRadius: 6, textDecoration: "none" }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      <style>{`
        @media(max-width:768px){
          .products-grid, .solutions-grid, .cap-grid { grid-template-columns: 1fr !important; }
          .workflow-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </MarketingLayout>
  );
}
