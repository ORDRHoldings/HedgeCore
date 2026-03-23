"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Users, Lock, BarChart3, FileText,
  DollarSign, TrendingUp, CheckCircle, ShieldCheck, ExternalLink,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "2", label: "Portals" },
  { value: "76", label: "Automated Tests" },
  { value: "WORM", label: "Audit Trail" },
  { value: "JWT", label: "Auth + RBAC" },
  { value: "Pro-Rata", label: "Allocation Engine" },
  { value: "Live", label: "Deployed" },
];

const MANAGER_SECTIONS = [
  { title: "Dashboard", desc: "Fund-wide KPIs, equity curve, monthly returns, capital composition" },
  { title: "Clients", desc: "Client registry, onboarding, status management" },
  { title: "Contracts", desc: "Contract terms per client — cap rate, reserve, share rates" },
  { title: "Capital", desc: "Deposits, withdrawals, snapshots, capital ledger" },
  { title: "Proprietary", desc: "Manager's own capital accounts and performance" },
  { title: "Pool Results", desc: "Daily P&L entry and approval workflow" },
  { title: "Allocations", desc: "Preview and finalize profit allocation runs" },
  { title: "Reports", desc: "AUM, client credits, cap utilization, monthly return grid" },
  { title: "Expenses", desc: "Operational cost tracking and burn rate" },
  { title: "Team", desc: "Staff directory, contracts, performance goals" },
  { title: "Requests", desc: "Approve or reject client cashflow requests" },
  { title: "Market Intelligence", desc: "Live TradingView market widgets" },
  { title: "Audit Log", desc: "Full immutable action history" },
];

const INVESTOR_SECTIONS = [
  { title: "Overview", desc: "Balance, total return %, days invested, monthly cap gauge" },
  { title: "Performance", desc: "Cumulative return curve, 12-month heatmap, full allocation history" },
  { title: "Statements", desc: "Monthly account statements" },
  { title: "Activity", desc: "Capital movements with running balance" },
  { title: "Contract", desc: "Terms with live waterfall profit calculation explainer" },
  { title: "Requests", desc: "Submit and track deposit/withdrawal requests" },
  { title: "Profile", desc: "Account identity and portfolio details" },
];

const FEATURES = [
  { icon: <DollarSign size={20} />, title: "Capital Tracking", desc: "Deposits, withdrawals, and adjustments per client with a full transaction ledger. Every capital movement is recorded with timestamps, approvals, and running balances. Complete audit trail from day one." },
  { icon: <BarChart3 size={20} />, title: "Daily P&L Entry", desc: "Gross profit entry with cost deductions, proprietary vs client capital separation. Fund managers enter results through a structured approval workflow before they flow into the allocation engine." },
  { icon: <TrendingUp size={20} />, title: "Allocation Engine", desc: "Pro-rata profit distribution across clients based on capital weight. Monthly cap enforcement, reserve deductions, and manager residual calculation. Deterministic — same inputs always produce the same allocation." },
  { icon: <Lock size={20} />, title: "Period Locking", desc: "Reporting periods can be closed and locked, making historical data immutable for audit purposes. Locked periods cannot be modified without an explicit unlock action captured in the audit log." },
  { icon: <Users size={20} />, title: "Cashflow Requests", desc: "Clients submit deposit and withdrawal requests through their portal. Fund managers approve or reject through an internal workflow with full comment history and status tracking." },
  { icon: <FileText size={20} />, title: "Reporting", desc: "AUM trends, client credits, cap utilization, manager residual, monthly returns — all filterable by period. Both portals have tailored report views scoped to their access level." },
  { icon: <ShieldCheck size={20} />, title: "Security & RBAC", desc: "Role-based access control with hard route guards. No-cache session policy with complete session clearing on logout. Investor credentials will not work on the manager portal and vice versa — enforced at the server level." },
  { icon: <CheckCircle size={20} />, title: "Automated Testing", desc: "76 automated tests including a 25-step end-to-end workflow, access control tests, and unit tests for the allocation engine. The allocation math is verified in isolation before every deployment." },
];

const DEMO_MANAGER = [
  { email: "owner@ordr.fund", password: "Owner@123!", role: "Owner (full access)" },
  { email: "admin@ordr.fund", password: "Admin@123!", role: "Admin" },
];

const DEMO_INVESTOR = [
  { email: "alice.chen@example.com", password: "Investor@123!" },
  { email: "bob.williams@example.com", password: "Investor@123!" },
];

export default function FundPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#F0FDF4", border: "1px solid #86efac", borderRadius: 4, padding: "6px 14px", marginBottom: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: "#065F46", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            LIVE · AVAILABLE NOW
          </span>
        </div>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>
          ORDR Fund
        </h1>
        <p style={{ fontFamily: F.ui, fontSize: 20, color: C.textSub, maxWidth: 700, margin: "0 auto 12px", lineHeight: 1.6 }}>
          Pooled Capital Management Platform
        </p>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 660, margin: "0 auto 32px", lineHeight: 1.7 }}>
          Production-grade institutional platform for private fund managers who operate pooled capital structures.
          Replaces spreadsheets and manual processes with a precise, auditable, and professional system —
          purpose-built for funds that manage capital on behalf of multiple clients under performance-based contracts.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="https://ordr-funda.vercel.app/" target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
            Access Live Demo <ExternalLink size={15} />
          </a>
        </div>
      </section>

      {/* Stats Strip */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.bgAlt }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
          {STATS.map((s, i) => (
            <div key={s.label} style={{ padding: "32px 16px", textAlign: "center", borderRight: i < 5 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ fontFamily: F.mono, fontSize: 28, fontWeight: 800, color: C.text, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.textMuted, textTransform: "uppercase" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* What It Does */}
      <section style={{ padding: "80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: C.textMuted, textTransform: "uppercase", marginBottom: 12 }}>PLATFORM OVERVIEW</div>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 800, margin: "0 0 16px", color: C.text }}>Full Lifecycle of a Pooled Fund</h2>
        <p style={{ fontFamily: F.ui, fontSize: 16, color: C.textSub, maxWidth: 680, lineHeight: 1.7, marginBottom: 56, borderLeft: `2px solid ${C.border}`, paddingLeft: 16 }}>
          ORDR Fund handles everything from client onboarding to monthly reporting. No broker integrations,
          no real-time feeds, no unnecessary complexity — it does exactly five things with precision: track capital,
          calculate P&L, allocate profits correctly, generate reports, and present everything with institutional clarity.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: 24 }}>
              <div style={{ color: C.accent, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>{f.title}</h3>
              <p style={{ fontFamily: F.ui, fontSize: 13, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Two Portals */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: C.textMuted, textTransform: "uppercase", marginBottom: 12 }}>ACCESS</div>
          <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 800, margin: "0 0 48px", color: C.text }}>Two Completely Separate Portals</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>

            {/* Manager Portal */}
            <div style={{ background: "#0A1628", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#60a5fa", textTransform: "uppercase", marginBottom: 6 }}>FUND MANAGER PORTAL</div>
                <div style={{ fontFamily: F.heading, fontSize: 18, fontWeight: 700, color: "#fff" }}>Full Operational Control</div>
                <div style={{ fontFamily: F.ui, fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Blue theme · Admin access</div>
              </div>
              <div style={{ padding: "16px 24px 24px" }}>
                {MANAGER_SECTIONS.map((s, i) => (
                  <div key={s.title} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < MANAGER_SECTIONS.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                    <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: "#60a5fa", minWidth: 120 }}>{s.title}</div>
                    <div style={{ fontFamily: F.ui, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Investor Portal */}
            <div style={{ background: "#0A1A12", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#4ade80", textTransform: "uppercase", marginBottom: 6 }}>INVESTOR PORTAL</div>
                <div style={{ fontFamily: F.heading, fontSize: 18, fontWeight: 700, color: "#fff" }}>Private Read-Only View</div>
                <div style={{ fontFamily: F.ui, fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Green theme · Client access</div>
              </div>
              <div style={{ padding: "16px 24px 24px" }}>
                {INVESTOR_SECTIONS.map((s, i) => (
                  <div key={s.title} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < INVESTOR_SECTIONS.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                    <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: "#4ade80", minWidth: 120 }}>{s.title}</div>
                    <div style={{ fontFamily: F.ui, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section style={{ padding: "80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: C.textMuted, textTransform: "uppercase", marginBottom: 12 }}>TECHNICAL DETAILS</div>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 800, margin: "0 0 40px", color: C.text }}>Built to Production Standards</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 48 }}>
          {[
            { label: "Backend", value: "FastAPI (Python), PostgreSQL, SQLAlchemy async" },
            { label: "Frontend", value: "Next.js 14 App Router, TypeScript, Tailwind CSS, Recharts" },
            { label: "Deploy", value: "Vercel (frontend) + Render (API + database)" },
            { label: "Auth", value: "JWT, RBAC, hard route guards, no-cache session policy" },
            { label: "Tests", value: "76 automated — 25-step E2E, access control, allocation unit tests" },
            { label: "Audit", value: "Full immutable action history, period locking, WORM semantics" },
          ].map((item) => (
            <div key={item.label} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "20px 20px" }}>
              <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: C.textMuted, textTransform: "uppercase", marginBottom: 8 }}>{item.label}</div>
              <div style={{ fontFamily: F.ui, fontSize: 13, color: C.text, lineHeight: 1.5 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Demo Access */}
      <section style={{ background: "#0A0A0A", padding: "80px 48px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#10B981", textTransform: "uppercase", marginBottom: 12 }}>DEMO ACCESS</div>
          <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 800, margin: "0 0 12px", color: "#fff" }}>Live and Fully Functional</h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: "rgba(255,255,255,0.5)", marginBottom: 40, lineHeight: 1.7 }}>
            The platform is live with seeded data. Use the credentials below to access each portal.
            Role matching is enforced — investor credentials will not work on the manager portal and vice versa.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 40 }}>
            {/* Manager Credentials */}
            <div style={{ background: "#111827", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(96,165,250,0.15)", background: "rgba(96,165,250,0.05)" }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: "#60a5fa", letterSpacing: "0.12em", textTransform: "uppercase" }}>Fund Manager Login</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {DEMO_MANAGER.map((u) => (
                  <div key={u.email} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontFamily: F.mono, fontSize: 12, color: "#60a5fa", marginBottom: 4 }}>{u.email}</div>
                    <div style={{ fontFamily: F.mono, fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>{u.password}</div>
                    <div style={{ fontFamily: F.ui, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{u.role}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Investor Credentials */}
            <div style={{ background: "#0D1F13", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(74,222,128,0.15)", background: "rgba(74,222,128,0.05)" }}>
                <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: "#4ade80", letterSpacing: "0.12em", textTransform: "uppercase" }}>Investor Login</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {DEMO_INVESTOR.map((u) => (
                  <div key={u.email} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontFamily: F.mono, fontSize: 12, color: "#4ade80", marginBottom: 4 }}>{u.email}</div>
                    <div style={{ fontFamily: F.mono, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{u.password}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <a href="https://ordr-funda.vercel.app/" target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 10, fontFamily: F.ui, fontSize: 16, fontWeight: 700, color: "#000", background: "#fff", padding: "14px 36px", borderRadius: 6, textDecoration: "none" }}>
              Open ORDR Fund <ExternalLink size={16} />
            </a>
            <p style={{ fontFamily: F.ui, fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 16 }}>
              Use the Company Employee card for the manager portal · Fund Client card for the investor portal
            </p>
          </div>
        </div>
      </section>

      {/* Back CTA */}
      <section style={{ padding: "48px", textAlign: "center", background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none" }}>
          <ChevronLeft size={14} /> Back to All Products
        </Link>
      </section>
    </MarketingLayout>
  );
}
