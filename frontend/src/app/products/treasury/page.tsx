"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Users, Shield, FileCheck, Settings,
  Bell, BarChart3, Lock, Layers, AlertTriangle, FileText,
  TrendingUp, Network, GitMerge, Zap, Upload, CreditCard,
  Microscope, Globe, Brain, Send, RefreshCw, Building2,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "46+",      label: "Engine Modules" },
  { value: "50+",      label: "Currency Pairs" },
  { value: "<50ms",    label: "Computation" },
  { value: "5",        label: "ERP Connectors" },
  { value: "8",        label: "Risk Categories" },
  { value: "3",        label: "Regulatory Frameworks" },
  { value: "SHA-256",  label: "Hash Chain" },
  { value: "4-Eyes",   label: "Governance" },
];

const FEATURE_GROUPS = [
  {
    label: "Core Engine",
    color: "#1E3A5F",
    features: [
      {
        icon: <Lock size={18} />,
        title: "Deterministic Kernel",
        desc: "46-module production kernel with zero side effects. Sub-50ms, fail-closed, cryptographically sealed. Same inputs always produce same outputs. ADR required to modify.",
      },
      {
        icon: <Settings size={18} />,
        title: "Policy Engine",
        desc: "60 institutional presets with ExtendedPolicyConfig covering volatility overlays, governance tiers, accounting modes, netting rules, instrument selection, and maturity profiles.",
      },
      {
        icon: <Layers size={18} />,
        title: "R1-R8 Risk Taxonomy",
        desc: "Eight frozen risk categories — Translation, Transaction, Economic, Strategic, Operational, Settlement, Credit, Liquidity. Every position quantified across all eight dimensions.",
      },
    ],
  },
  {
    label: "Governance & Audit",
    color: "#7C3AED",
    features: [
      {
        icon: <Users size={18} />,
        title: "4-Eyes Governance",
        desc: "Tri-state pipeline (SANDBOX → STAGING → LEDGER) with maker-checker approval and Separation of Duties. No single actor can propose and approve the same execution.",
      },
      {
        icon: <Shield size={18} />,
        title: "WORM Audit Trail",
        desc: "Append-only event log across audit_events, calculation_runs, and policy_revisions. Per-tenant SHA-256 hash chain with GENESIS_HASH verification. No UPDATE, no DELETE — ever.",
      },
      {
        icon: <Microscope size={18} />,
        title: "Audit Lab",
        desc: "Interactive investigation workspace to replay, compare, and export any calculation run. Drill into hash-chain integrity, diff policies side by side, and export evidence packages for auditors.",
      },
    ],
  },
  {
    label: "Market & Risk",
    color: "#0F766E",
    features: [
      {
        icon: <BarChart3 size={18} />,
        title: "Scenario Stress Testing",
        desc: "Configurable shock packs with vol-scaled stress tests, historical VaR/ES, and crisis replay. Pre-built scenarios for 2008 GFC, 2020 COVID, 2022 rate hikes, and EM crises.",
      },
      {
        icon: <TrendingUp size={18} />,
        title: "Pre-Trade TCA",
        desc: "Transaction cost analysis before execution. Spread decomposition, market impact estimates, and timing analysis. Benchmark against VWAP and peer execution quality.",
      },
      {
        icon: <AlertTriangle size={18} />,
        title: "Geopolitical Overlay",
        desc: "Polisophic corridor scoring integrated as a policy layer. Political risk scores feed into the hedge engine as vol adjustments across 195 jurisdictions.",
      },
    ],
  },
  {
    label: "Operations",
    color: "#B45309",
    features: [
      {
        icon: <GitMerge size={18} />,
        title: "Natural Hedging",
        desc: "Identify internal netting opportunities before placing external hedges. Currency pair netting, entity-level offset analysis, and netting efficiency scoring reduce external hedge notional.",
      },
      {
        icon: <Network size={18} />,
        title: "Counterparty Hub",
        desc: "Centralised counterparty register with credit exposure, ISDA/CSA tracking, margin utilisation, and early-warning alerts. Full counterparty lifecycle from onboarding to off-boarding.",
      },
      {
        icon: <Send size={18} />,
        title: "SWIFT Payments",
        desc: "Generate MT103, MT202, and pain.001 XML payment files directly from settled positions. Straight-through processing from hedge confirmation to bank instruction with full audit linkage.",
      },
    ],
  },
  {
    label: "Reporting & Compliance",
    color: "#065F46",
    features: [
      {
        icon: <FileCheck size={18} />,
        title: "IFRS 9 / ASC 815",
        desc: "Built-in prospective effectiveness testing with critical terms matching, statistical forecast, dual-standard support, and automated hedge documentation generation.",
      },
      {
        icon: <FileText size={18} />,
        title: "Regulatory Reporting",
        desc: "Pre-built report templates for EMIR trade reporting, MiFID II best execution, and CFTC swap data. Auto-populate from engine data. One-click export for regulator submission.",
      },
      {
        icon: <CreditCard size={18} />,
        title: "Debt & IR Risk",
        desc: "Interest rate risk management for debt portfolios alongside FX. Duration analysis, fixed/float allocation, and combined FX+IR hedge effectiveness reporting.",
      },
    ],
  },
  {
    label: "Integrations",
    color: "#1D4ED8",
    features: [
      {
        icon: <Building2 size={18} />,
        title: "ERP Connectors",
        desc: "Native connectors for SAP, Oracle ERP Cloud, NetSuite, QuickBooks Online, and Xero. Pull AP/AR automatically, sync settled positions back to the ledger. OAuth 2.0 and API key authentication.",
      },
      {
        icon: <Bell size={18} />,
        title: "Slack & Teams Alerts",
        desc: "Real-time webhook notifications to Slack and Microsoft Teams. Threshold breach alerts, governance action requests, maturity reminders, and daily portfolio summaries.",
      },
      {
        icon: <Upload size={18} />,
        title: "Bulk Position Import",
        desc: "REST endpoint (POST /v1/positions/bulk) accepts up to 500 positions per call with partial-success semantics. CSV drag-and-drop also supported. Full validation and audit on every row.",
      },
    ],
  },
];

const WORKFLOW_STEPS = [
  {
    step: "1",
    title: "Position Intake",
    desc: "Positions enter via bulk JSON API (up to 500 rows), CSV import, or manual entry. Automatic validation with per-row error reporting before any data is committed.",
  },
  {
    step: "2",
    title: "Natural Hedging Analysis",
    desc: "The platform identifies internal netting opportunities — AR against AP in the same currency. Netting reduces external hedge notional and associated transaction costs before any trade is placed.",
  },
  {
    step: "3",
    title: "Policy Assignment",
    desc: "Each net exposure receives a policy from the 60-preset library or a custom configuration built via the wizard. Policy tier (STANDARD / ENHANCED / COMMITTEE) determines governance intensity.",
  },
  {
    step: "4",
    title: "Deterministic Calculation",
    desc: "The frozen kernel computes hedge ratios, instrument selection, notional sizing, R1-R8 risk decomposition, and IFRS 9/ASC 815 effectiveness scores. Sub-50ms, hash-chained, reproducible.",
  },
  {
    step: "5",
    title: "Pre-Trade TCA",
    desc: "Before any execution proposal, transaction cost analysis is run. Spread, impact, and timing costs are estimated and surfaced to the governance reviewer alongside the hedge recommendation.",
  },
  {
    step: "6",
    title: "4-Eyes Governance",
    desc: "Proposals enter the tri-state pipeline. Maker submits to STAGING; checker reviews with full audit trail access. SoD enforcement is automatic. Large notionals trigger 3-actor committee review.",
  },
  {
    step: "7",
    title: "Settlement & Payments",
    desc: "Approved positions move to HEDGED state. MT103/pain.001 payment files are generated automatically for SWIFT dispatch. All execution details are written to the WORM audit log.",
  },
  {
    step: "8",
    title: "Regulatory Reporting",
    desc: "EMIR, MiFID II, and CFTC reports are auto-populated from the immutable audit record. AI drafts narratives and board summaries. Slack/Teams alerts notify relevant stakeholders.",
  },
];

const REG_FRAMEWORKS = [
  { name: "EMIR", region: "European Union", desc: "Trade reporting, clearing thresholds, and margin requirements for OTC derivatives." },
  { name: "MiFID II", region: "European Union", desc: "Best execution reporting, trade transparency, and systematic internaliser obligations." },
  { name: "CFTC", region: "United States", desc: "Swap data repository reporting and large trader position reporting for US-regulated entities." },
];

export default function TreasuryPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <Link
          href="/products"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}
        >
          <ChevronLeft size={14} /> All Products
        </Link>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#F0FDF4", border: "1px solid #86efac", borderRadius: 4, padding: "6px 14px", marginBottom: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, color: "#065F46", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            LIVE · AVAILABLE NOW
          </span>
        </div>

        <h1 style={{ fontFamily: F.heading, fontSize: 52, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, margin: "0 0 20px", color: C.text }}>
          ORDR Treasury
        </h1>

        <p style={{ fontFamily: F.ui, fontSize: 22, color: C.textSub, maxWidth: 740, margin: "0 auto 16px", lineHeight: 1.5, fontWeight: 500 }}>
          Institutional FX Hedge Governance — from position intake to regulatory filing.
        </p>

        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 680, margin: "0 auto 36px", lineHeight: 1.7 }}>
          Deterministic computation. Cryptographic audit trail. 4-eyes governance. Native ERP integrations.
          EMIR, MiFID II, and CFTC reporting. SWIFT payment generation. AI for communication — never for calculation.
        </p>

        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/auth/login"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "13px 32px", borderRadius: 6, textDecoration: "none" }}
          >
            Open Platform <ArrowRight size={16} />
          </Link>
          <Link
            href="/products"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, background: "transparent", border: `1px solid ${C.border}`, padding: "13px 28px", borderRadius: 6, textDecoration: "none" }}
          >
            See All Products
          </Link>
        </div>
      </section>

      {/* Stats Strip */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "36px 48px" }}>
        <div className="stats-row" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "center", gap: 0, flexWrap: "wrap" }}>
          {STATS.map((s, i) => (
            <div key={s.label} style={{ textAlign: "center", padding: "0 32px", borderRight: i < STATS.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ fontFamily: F.mono, fontSize: 26, fontWeight: 800, color: C.accent, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Platform Capabilities */}
      <section style={{ padding: "80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: F.heading, fontSize: 34, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
            Full-Stack Treasury Platform
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, maxWidth: 680, lineHeight: 1.7, margin: 0 }}>
            18 production-ready capabilities across six domains — from deterministic computation to regulatory filing.
            Every module is live, tested, and deployed.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
          {FEATURE_GROUPS.map(group => (
            <div key={group.label}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 4, height: 20, borderRadius: 2, background: group.color }} />
                <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: group.color, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  {group.label}
                </span>
              </div>
              <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                {group.features.map(f => (
                  <div
                    key={f.title}
                    style={{ padding: "24px 20px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, borderTop: `3px solid ${group.color}` }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ color: group.color }}>{f.icon}</div>
                      <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text }}>{f.title}</div>
                    </div>
                    <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ERP Integration Showcase */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 64, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 380px" }}>
              <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
                Enterprise Integrations
              </div>
              <h2 style={{ fontFamily: F.heading, fontSize: 30, fontWeight: 700, color: C.text, margin: "0 0 16px", lineHeight: 1.2 }}>
                Connect your existing stack
              </h2>
              <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.7, margin: "0 0 32px" }}>
                Pull AP/AR positions automatically from your ERP. Sync settled hedges back to the ledger.
                Dispatch SWIFT payments straight from the terminal. Push alerts to Slack or Teams.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { icon: <Building2 size={16} />, label: "ERP", detail: "SAP · Oracle · NetSuite · QuickBooks · Xero" },
                  { icon: <Zap size={16} />, label: "Payments", detail: "SWIFT MT103 · MT202 · ISO pain.001 XML" },
                  { icon: <Bell size={16} />, label: "Messaging", detail: "Slack webhooks · Microsoft Teams webhooks" },
                  { icon: <RefreshCw size={16} />, label: "Banking", detail: "MT940 · CAMT.053 bank statement import" },
                  { icon: <Upload size={16} />, label: "Bulk API", detail: "REST POST /v1/positions/bulk — 500 rows/call" },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                    <div style={{ color: C.accent, flexShrink: 0 }}>{row.icon}</div>
                    <div>
                      <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.text, letterSpacing: "0.06em" }}>{row.label}</div>
                      <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textMuted, marginTop: 2 }}>{row.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex: "1 1 380px" }}>
              <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: "#7C3AED", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
                Regulatory Compliance
              </div>
              <h2 style={{ fontFamily: F.heading, fontSize: 30, fontWeight: 700, color: C.text, margin: "0 0 16px", lineHeight: 1.2 }}>
                Built-in regulatory reporting
              </h2>
              <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.7, margin: "0 0 32px" }}>
                Report templates auto-populate from the immutable audit record. No manual re-entry.
                Export directly to regulator portals.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {REG_FRAMEWORKS.map(r => (
                  <div key={r.name} style={{ padding: "20px", background: C.bg, border: `1px solid ${C.border}`, borderLeft: "3px solid #7C3AED", borderRadius: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 800, color: "#7C3AED" }}>{r.name}</span>
                      <span style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, background: C.bgAlt, border: `1px solid ${C.border}`, padding: "2px 8px", borderRadius: 3 }}>{r.region}</span>
                    </div>
                    <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0 }}>{r.desc}</p>
                  </div>
                ))}

                <div style={{ padding: "16px 20px", background: "#F0FDF4", border: "1px solid #86efac", borderRadius: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <FileCheck size={14} color="#16A34A" />
                    <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: "#16A34A", letterSpacing: "0.08em" }}>IFRS 9 / ASC 815</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#065F46", lineHeight: 1.6, margin: 0 }}>
                    Prospective effectiveness testing, critical terms matching, and hedge documentation generation. Dual-standard support.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 34, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
          End-to-End Hedge Lifecycle
        </h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 48px", lineHeight: 1.7, maxWidth: 680 }}>
          Eight stages from position intake to regulatory filing. The engine handles all computation deterministically.
          AI assists with communication, reporting, and governance notifications — it never influences calculations.
        </p>

        <div className="workflow-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0 }}>
          {WORKFLOW_STEPS.map((w, i) => (
            <div
              key={w.step}
              style={{
                display: "flex",
                gap: 20,
                padding: "28px 24px",
                borderBottom: i < WORKFLOW_STEPS.length - 2 ? `1px solid ${C.border}` : "none",
                borderRight: i % 2 === 0 ? `1px solid ${C.border}` : "none",
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.mono, fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                {w.step}
              </div>
              <div>
                <div style={{ fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>{w.title}</div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{w.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI Communication Layer */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(30,58,95,0.08)", border: "1px solid rgba(30,58,95,0.2)", borderRadius: 4, padding: "5px 12px", marginBottom: 16 }}>
            <Brain size={13} color="#1E3A5F" />
            <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: "#1E3A5F", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Intelligence Layer
            </span>
          </div>

          <h2 style={{ fontFamily: F.heading, fontSize: 30, fontWeight: 700, color: C.text, margin: "0 0 12px" }}>
            AI for communication. Never for calculation.
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, maxWidth: 680, lineHeight: 1.7, margin: "0 0 40px" }}>
            The deterministic engine handles all computation independently. AI is your communication layer — it reads engine outputs and helps you communicate them to stakeholders.
          </p>

          <div className="ai-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              {
                icon: <Globe size={20} />,
                title: "50+ Currency Pairs",
                sub: "Market Data Coverage",
                desc: "Live spot rates, forward curves, and volatility surfaces across major, minor, and EM currency pairs. Market data feeds into the engine but is never cached as authoritative — always fetched fresh.",
              },
              {
                icon: <Brain size={20} />,
                title: "AI Policy Wizard",
                sub: "Intelligent Configuration",
                desc: "The AI helps you select and configure hedge policies in plain language. Describe your exposure profile and governance requirements; the wizard maps to the correct ExtendedPolicyConfig fields.",
              },
              {
                icon: <Bell size={20} />,
                title: "Multi-Channel Alerts",
                sub: "Slack · Teams · Terminal",
                desc: "Threshold breaches, maturity events, and governance actions are pushed to Slack, Microsoft Teams, and the in-terminal notification centre. Daily and weekly portfolio digests configurable per user.",
              },
            ].map(card => (
              <div key={card.title} style={{ padding: "28px 24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ color: C.accent, marginBottom: 14 }}>{card.icon}</div>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>{card.title}</div>
                <div style={{ fontFamily: F.mono, fontSize: 10, color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{card.sub}</div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Note */}
      <section style={{ padding: "64px 48px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <div style={{ padding: "32px 40px", background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
            Architecture Guarantee
          </div>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, lineHeight: 1.7, margin: "0 0 16px" }}>
            The v1 kernel is <strong style={{ color: C.text }}>architecturally frozen</strong>. No ML, no auto-learning, no broker execution.
            Every function is pure and deterministic — the same position data and market snapshot always produce the same hedge recommendation.
            An Architecture Decision Record (ADR) is required to modify any engine module.
          </p>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
            {["46 Engine Modules", "Zero Side Effects", "SHA-256 Hash Chain", "ADR-Gated Changes"].map(tag => (
              <span key={tag} style={{ fontFamily: F.mono, fontSize: 11, color: C.textMuted, background: C.bg, border: `1px solid ${C.border}`, padding: "4px 12px", borderRadius: 3 }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: "#1E3A5F", padding: "80px 48px", textAlign: "center" }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>
          ORDR TREASURY · LIVE NOW
        </div>
        <h2 style={{ fontFamily: F.heading, fontSize: 38, fontWeight: 700, color: "#fff", margin: "0 0 16px", lineHeight: 1.15 }}>
          Institutional FX governance,<br />from intake to regulatory filing.
        </h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)", marginBottom: 36, maxWidth: 580, margin: "0 auto 36px" }}>
          Deterministic computation. Cryptographic audit. 4-eyes governance. Native ERP. SWIFT payments. EMIR/MiFID II/CFTC reporting.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/auth/login"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#1E3A5F", background: "#fff", padding: "13px 32px", borderRadius: 6, textDecoration: "none" }}
          >
            Open Platform <ArrowRight size={16} />
          </Link>
          <Link
            href="/products"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: "transparent", border: "1px solid rgba(255,255,255,0.3)", padding: "13px 28px", borderRadius: 6, textDecoration: "none" }}
          >
            Explore All Products
          </Link>
        </div>
      </section>

      <style>{`
        @media (max-width: 900px) {
          .feat-grid { grid-template-columns: 1fr !important; }
          .ai-grid { grid-template-columns: 1fr !important; }
          .stats-row > div { border-right: none !important; border-bottom: 1px solid var(--border-rim); padding: 16px 20px !important; }
        }
        @media (max-width: 700px) {
          .workflow-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </MarketingLayout>
  );
}
