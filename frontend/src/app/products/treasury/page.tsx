"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Cpu, Users, Shield, FileCheck, Settings, FileSpreadsheet,
  MessageSquare, Phone, Bell, BarChart3, Lock, Layers, AlertTriangle,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "60", label: "Policy Presets" },
  { value: "8", label: "Risk Categories" },
  { value: "<50ms", label: "Computation" },
  { value: "SHA-256", label: "Hash Chain" },
  { value: "41", label: "Engine Modules" },
  { value: "4-Eyes", label: "Governance" },
];

const FEATURES = [
  { icon: <Settings size={20} />, title: "Policy Engine", desc: "60 institutional presets with ExtendedPolicyConfig covering 50+ fields across 10 sections: volatility overlays, geopolitical adjustments, scenario parameters, effectiveness thresholds, decision gates, netting rules, instrument selection, maturity profiles, governance intensity, and liquidity regimes. Every preset includes governance tier (STANDARD / ENHANCED / COMMITTEE), evidence grade, and accounting mode classification." },
  { icon: <Users size={20} />, title: "4-Eyes Governance", desc: "Tri-state pipeline (SANDBOX to STAGING to LEDGER) with maker-checker approval and Separation of Duties enforcement. No single actor can both propose and approve an execution. Threshold-based escalation triggers 3-actor review for large notionals." },
  { icon: <Shield size={20} />, title: "WORM Audit Trail", desc: "Append-only event logging across audit_events, calculation_runs, and policy_revisions tables. Per-tenant SHA-256 hash chain with GENESIS_HASH verification. No UPDATE, no DELETE -- ever. Every calculation input, output, and governance decision is permanently recorded and cryptographically chained." },
  { icon: <FileCheck size={20} />, title: "IFRS 9 / ASC 815 Effectiveness", desc: "Built-in prospective effectiveness testing with critical terms matching and statistical forecast. Grading labels (HEURISTIC / STATISTICAL), per-component rationale breakdowns, and hedge documentation generation. Dual-standard support for both IFRS 9 and ASC 815 with automatic threshold detection." },
  { icon: <Layers size={20} />, title: "R1-R8 Risk Taxonomy", desc: "Eight frozen risk categories: Translation (R1), Transaction (R2), Economic (R3), Strategic (R4), Operational (R5), Settlement (R6), Credit (R7), and Liquidity (R8). Each position is classified across all eight dimensions with quantified exposure. The taxonomy is architecturally frozen -- no additions, no modifications, no reinterpretation." },
  { icon: <BarChart3 size={20} />, title: "Scenario Stress Testing", desc: "Configurable shock packs with vol-scaled stress tests, historical VaR/ES analysis, and crisis replay. Pre-built scenarios for 2008 GFC, 2020 COVID, 2022 rate hikes, and EM currency crises. Full parametric control over every risk factor. Hedged vs. unhedged comparison with quantified downside." },
  { icon: <AlertTriangle size={20} />, title: "Geopolitical Overlay", desc: "Polisophic corridor scoring integrated as a policy overlay layer. Political risk scores feed directly into the hedge engine as vol adjustments and hedge ratio modifiers. Country-level risk profiles for 195 jurisdictions with real-time event monitoring. Neutralized by default -- activation requires governance approval." },
  { icon: <Lock size={20} />, title: "Deterministic Execution", desc: "41-module production kernel with zero side effects. Every function is pure, every output is reproducible. Sub-50ms computation with fail-closed validation. No external state, no randomness, no learning. The same inputs always produce the same outputs. The kernel is architecturally frozen and requires an Architecture Decision Record (ADR) to modify. AI never touches the calculation path." },
];

const WORKFLOW_STEPS = [
  { step: "1", title: "Position Intake", desc: "Positions enter the system in NEW state with currency pair, notional, maturity, and entity classification. Bulk import from spreadsheets with automatic data validation before ingestion." },
  { step: "2", title: "Policy Assignment", desc: "Each position receives a policy configuration from the 60-preset library or a custom policy built via the wizard. Select policies based on exposure profile, governance tier requirements, and maturity structure." },
  { step: "3", title: "Deterministic Calculation", desc: "The frozen kernel computes hedge ratios, instrument selection, notional sizing, risk decomposition, and effectiveness scores. Sub-50ms, reproducible, hash-chained. No AI involvement in computation." },
  { step: "4", title: "Communication & Reports", desc: "Use AI to communicate status updates, generate stakeholder reports, and brief your team on portfolio state via chat, voice, or phone. The AI helps you write and deliver -- it does not evaluate engine calculations." },
  { step: "5", title: "Governance Review", desc: "Proposals enter the 4-eyes pipeline. Maker submits, checker reviews. SoD enforcement is automatic. Policy rationale and audit trail references are available for the checker." },
  { step: "6", title: "Execution & Audit", desc: "Approved proposals move to HEDGED state. Every step is WORM-logged with SHA-256 hash chain. Position changes, maturity events, and rebalancing triggers are tracked deterministically." },
];

export default function TreasuryPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>
        <h1 style={{ fontFamily: F.heading, fontSize: 48, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px", color: C.text }}>
          ORDR Treasury
        </h1>
        <p style={{ fontFamily: F.ui, fontSize: 20, color: C.textSub, maxWidth: 700, margin: "0 auto 12px", lineHeight: 1.6 }}>
          Agentic AI as your Risk Assistant. Deterministic Computation as your Engine.
        </p>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 650, margin: "0 auto 32px", lineHeight: 1.7 }}>
          Communicate via chatbox, phone, or voice. Get status updates like from your employee.
          The engine is deterministic and cryptographically sealed. The AI helps you manage communications, write reports, and get status updates -- it does not evaluate or influence calculations.
        </p>
        <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      {/* Stats Strip */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 48px" }}>
        <div className="stats-row" style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "center", gap: 48 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 24, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Your AI Risk Assistant */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Your AI Communication Assistant</h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 40px", lineHeight: 1.7, maxWidth: 700 }}>
          The AI is your communication layer. It helps you get status updates, generate reports for stakeholders, and manage customer communications through whichever channel you prefer.
          It does not evaluate calculations or detect anomalies -- the deterministic engine handles all computation independently.
        </p>
        <div className="ai-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          <div style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg }}>
            <div style={{ color: C.accent, marginBottom: 16 }}><MessageSquare size={22} /></div>
            <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>Terminal Chat</div>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
              Ask questions directly in the ORDR terminal. &quot;What is my largest EUR/USD exposure?&quot; &quot;Show me positions maturing this week.&quot;
              &quot;Draft a summary for the board meeting.&quot; The AI retrieves data and helps you communicate it -- generating status summaries, drafting reports, and managing customer interactions.
            </p>
          </div>
          <div style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg }}>
            <div style={{ color: C.accent, marginBottom: 16 }}><Phone size={22} /></div>
            <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>Phone / Voice</div>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
              Call your AI assistant or use voice commands within the terminal. Get verbal status updates on your hedge portfolio and pending governance actions.
              Ideal for treasury managers who need quick updates without opening the terminal. The AI communicates portfolio status and helps you stay informed.
            </p>
          </div>
          <div style={{ padding: "28px 24px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg }}>
            <div style={{ color: C.accent, marginBottom: 16 }}><Bell size={22} /></div>
            <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>Report Writing</div>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, margin: 0 }}>
              The AI helps you generate institutional-grade reports for stakeholders, board presentations, and regulatory submissions.
              It drafts summaries from engine data, formats tables and charts, and helps you communicate complex hedge structures in clear language.
            </p>
          </div>
        </div>
      </section>

      {/* Architecture Diagram */}
      <section style={{ padding: "0 48px 80px", maxWidth: 900, margin: "0 auto" }}>
        <h3 style={{ fontFamily: F.heading, fontSize: 22, fontWeight: 700, margin: "0 0 24px", color: C.text, textAlign: "center" }}>Interaction Architecture</h3>
        <svg viewBox="0 0 800 320" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto" }}>
          {/* User column */}
          <rect x="20" y="40" width="200" height="240" rx="8" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />
          <text x="120" y="30" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#999" textAnchor="middle" letterSpacing="0.08em">USER</text>
          <rect x="45" y="70" width="150" height="32" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <text x="120" y="91" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#111" textAnchor="middle">Terminal Chat</text>
          <rect x="45" y="118" width="150" height="32" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <text x="120" y="139" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#111" textAnchor="middle">Voice Commands</text>
          <rect x="45" y="166" width="150" height="32" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <text x="120" y="187" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#111" textAnchor="middle">Phone Call</text>
          <rect x="45" y="214" width="150" height="32" rx="4" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
          <text x="120" y="235" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#111" textAnchor="middle">Dashboard UI</text>

          {/* AI Layer column */}
          <rect x="290" y="40" width="200" height="240" rx="8" fill="rgba(30,58,95,0.06)" stroke="#1E3A5F" strokeWidth="1" strokeDasharray="4 2" />
          <text x="390" y="30" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#1E3A5F" textAnchor="middle" letterSpacing="0.08em">AGENTIC AI LAYER</text>
          <rect x="315" y="70" width="150" height="32" rx="4" fill="rgba(30,58,95,0.08)" />
          <text x="390" y="91" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#1E3A5F" textAnchor="middle">Status Updates</text>
          <rect x="315" y="118" width="150" height="32" rx="4" fill="rgba(30,58,95,0.08)" />
          <text x="390" y="139" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#1E3A5F" textAnchor="middle">Report Writing</text>
          <rect x="315" y="166" width="150" height="32" rx="4" fill="rgba(30,58,95,0.08)" />
          <text x="390" y="187" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#1E3A5F" textAnchor="middle">Customer Mgmt</text>
          <rect x="315" y="214" width="150" height="32" rx="4" fill="rgba(30,58,95,0.08)" />
          <text x="390" y="235" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#1E3A5F" textAnchor="middle">Communication</text>

          {/* Engine column */}
          <rect x="560" y="40" width="220" height="240" rx="8" fill="#1E3A5F" />
          <text x="670" y="30" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="700" fill="#1E3A5F" textAnchor="middle" letterSpacing="0.08em">DETERMINISTIC ENGINE</text>
          <rect x="585" y="70" width="170" height="32" rx="4" fill="rgba(255,255,255,0.12)" />
          <text x="670" y="91" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#FFFFFF" textAnchor="middle">Hedge Kernel</text>
          <rect x="585" y="118" width="170" height="32" rx="4" fill="rgba(255,255,255,0.12)" />
          <text x="670" y="139" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#FFFFFF" textAnchor="middle">Risk Calculator</text>
          <rect x="585" y="166" width="170" height="32" rx="4" fill="rgba(255,255,255,0.12)" />
          <text x="670" y="187" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#FFFFFF" textAnchor="middle">WORM Audit</text>
          <rect x="585" y="214" width="170" height="32" rx="4" fill="rgba(255,255,255,0.12)" />
          <text x="670" y="235" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="#FFFFFF" textAnchor="middle">Governance Pipeline</text>

          {/* Arrows */}
          <line x1="220" y1="160" x2="288" y2="160" stroke="#1E3A5F" strokeWidth="1.5" markerEnd="url(#arrTr)" />
          <line x1="288" y1="160" x2="220" y2="160" stroke="#1E3A5F" strokeWidth="1.5" />
          <line x1="490" y1="160" x2="558" y2="160" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
          <text x="524" y="152" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#1E3A5F">READ</text>
          <text x="524" y="174" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#1E3A5F">ONLY</text>

          {/* Labels on arrows */}
          <text x="245" y="150" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#1E3A5F">MULTI-</text>
          <text x="241" y="162" fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="#1E3A5F">CHANNEL</text>

          <defs>
            <marker id="arrTr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <path d="M0,0 L8,3 L0,6" fill="#1E3A5F" />
            </marker>
          </defs>
        </svg>
      </section>

      {/* Capabilities */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, padding: "80px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>Capabilities</h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 48px", lineHeight: 1.7, maxWidth: 700 }}>
            The engine calculates deterministically. The AI helps you communicate, manage your team, and write reports.
          </p>
          <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ padding: "28px 24px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ color: C.accent }}>{f.icon}</div>
                  <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text }}>{f.title}</div>
                </div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: C.text }}>How It Works</h2>
        <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textSub, margin: "0 0 48px", lineHeight: 1.7, maxWidth: 700 }}>
          The hedge lifecycle flows through six stages. The deterministic engine handles all computation. AI is available only as a communication layer for status updates and report writing.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {WORKFLOW_STEPS.map((w, i) => (
            <div key={w.step} style={{ display: "flex", gap: 24, padding: "24px 0", borderBottom: i < WORKFLOW_STEPS.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.mono, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {w.step}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>{w.title}</div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0 }}>{w.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.accent, padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, color: "#fff", margin: "0 0 16px" }}>Start managing your hedge portfolio</h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", marginBottom: 32 }}>Deterministic computation. Multi-channel communication. AI for status updates and reports.</p>
        <Link href="/auth/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 15, fontWeight: 600, color: C.accent, background: "#fff", padding: "12px 28px", borderRadius: 6, textDecoration: "none" }}>
          Get Started <ArrowRight size={16} />
        </Link>
      </section>

      <style>{`@media(max-width:768px){
        .feat-grid { grid-template-columns: 1fr !important; }
        .ai-grid { grid-template-columns: 1fr !important; }
        .stats-row { flex-wrap: wrap; gap: 24px !important; }
      }`}</style>
    </MarketingLayout>
  );
}
