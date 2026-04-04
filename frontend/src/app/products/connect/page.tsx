"use client";

import Link from "next/link";
import {
  ChevronLeft, ArrowRight, Network, Users, Activity, Zap, Globe, Lock,
  Bot, Shield, CheckCircle, Database, Radio, Cpu, Server,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { C, F } from "@/components/marketing/theme";

const STATS = [
  { value: "<500ms", label: "End-to-End" },
  { value: "100K/s", label: "Events" },
  { value: "8", label: "Channels" },
  { value: "L1–L5", label: "Autonomy" },
  { value: "SOC2+HIPAA", label: "Compliance" },
  { value: "7yr WORM", label: "Audit" },
];

const PRIMITIVES = [
  {
    icon: <Users size={20} />,
    title: "Customer Graph",
    sub: "Neo4j + pgvector",
    desc: "Temporal knowledge graph with entity resolution, relationship inference, and confidence scoring. Zero institutional memory loss when employees leave. Every relationship versioned.",
    color: "#3b82f6",
  },
  {
    icon: <Activity size={20} />,
    title: "Event Stream",
    sub: "Kafka — Confluent",
    desc: "Immutable append-only event log. Single source of truth for every signal, decision, and action. Sub-second latency, infinite replay. Never lose a customer interaction.",
    color: "#10b981",
  },
  {
    icon: <Zap size={20} />,
    title: "Decision Engine",
    sub: "ClickHouse + Redis",
    desc: "Three-layer cascade — deterministic rules, ML scoring models, LLM reasoning — evaluating every event in under 100ms. No batch windows. No manual handoffs. No lag.",
    color: "#f59e0b",
  },
  {
    icon: <Bot size={20} />,
    title: "Agent Runtime",
    sub: "LangGraph + Claude",
    desc: "8 specialized agent types with 5-level graduated autonomy (L1–L5), budget enforcement, confidence thresholds, and 4-layer hallucination containment. Agents act. Humans govern.",
    color: "#8b5cf6",
  },
  {
    icon: <Globe size={20} />,
    title: "Execution Layer",
    sub: "Omnichannel Delivery",
    desc: "Unified delivery across SMS, email, voice, WhatsApp, IVR, Slack, and webhooks. Dynamic channel selection based on customer preference and compliance constraints. Provider failover built in.",
    color: "#ec4899",
  },
  {
    icon: <Lock size={20} />,
    title: "Governance Layer",
    sub: "Merkle DAG + WORM",
    desc: "Cryptographic audit trail with SHA-256 hash chain and Merkle tree batch verification. Write-once storage. Zero-trust architecture with mTLS on every internal connection.",
    color: "#06b6d4",
  },
];

const INDUSTRIES = [
  { icon: <Database size={16} />, name: "Collections & Finance", desc: "FDCPA/Reg F compliant recovery workflows", metric: "$0.02–0.15/op" },
  { icon: <Shield size={16} />, name: "Healthcare & Clinics", desc: "HIPAA-native patient communication", metric: "PHI field-encrypted" },
  { icon: <Server size={16} />, name: "Real Estate & Mortgage", desc: "RESPA/TILA compliant outreach", metric: "<5s speed-to-lead" },
  { icon: <Activity size={16} />, name: "B2B SaaS", desc: "Sales-to-CS handoff automation", metric: "67% churn reduction" },
  { icon: <Radio size={16} />, name: "Political Campaigns", desc: "FEC compliant voter outreach at scale", metric: "10K msg/s burst" },
  { icon: <Cpu size={16} />, name: "Franchises & Multi-Location", desc: "Brand consistency with per-location RBAC", metric: "Per-location isolation" },
];

const COMPLIANCE = [
  { label: "SOC 2 Type II", sub: "CC1–CC9, A1, PI1, C1, P1" },
  { label: "ISO 27001:2022", sub: "93 Annex A Controls" },
  { label: "HIPAA", sub: "§164.308 / .310 / .312" },
  { label: "GDPR", sub: "Right to erasure via key destruction" },
  { label: "FDCPA / TCPA", sub: "Quiet hours + frequency limits" },
  { label: "PCI DSS", sub: "Payment data isolation" },
];

const TECH_SPECS = [
  ["Event publish latency", "p99 < 15ms", "Kafka + Confluent Cloud"],
  ["Policy evaluation", "p99 < 10ms", "OPA / Rego engine"],
  ["Decision engine", "p99 < 100ms", "Rules + ML + LLM cascade"],
  ["Agent dispatch", "p99 < 200ms", "LangGraph orchestration"],
  ["Channel delivery", "p99 < 500ms", "Multi-provider failover"],
  ["API throughput", "10K req/s sustained", "50K burst capacity"],
  ["Event throughput", "100K events/s", "500K burst capacity"],
  ["Agent concurrency", "1K executions/min", "5K burst capacity"],
  ["Tenant isolation", "Row-Level Security", "PostgreSQL RLS + JWT"],
  ["Encryption at rest", "AES-256-GCM", "HSM-backed key management"],
  ["Encryption in transit", "TLS 1.3 + mTLS", "Zero-trust internal mesh"],
  ["Audit retention", "7 years WORM", "SHA-256 Merkle DAG"],
];

const AUTONOMY_LEVELS = [
  { level: "L1", name: "Human Confirms All", desc: "Agent suggests, human executes every action", pct: 20, color: "#ef4444" },
  { level: "L2", name: "Human Approves", desc: "Agent proposes plan, human approves before execution", pct: 40, color: "#f59e0b" },
  { level: "L3", name: "Human on Exception", desc: "Agent executes, human reviews exceptions only", pct: 60, color: "#eab308" },
  { level: "L4", name: "Human Monitors", desc: "Agent fully autonomous, human audits post-hoc", pct: 80, color: "#22c55e" },
  { level: "L5", name: "Full Autonomy", desc: "Agent operates independently within defined bounds", pct: 100, color: "#10b981" },
];

const SECURITY_FEATURES = [
  {
    icon: <Lock size={16} />,
    title: "AES-256-GCM + HSM",
    desc: "Field-level encryption on all restricted data. HSM-backed key management with 90-day automated rotation. Cryptographic erasure for right-to-deletion compliance.",
  },
  {
    icon: <Shield size={16} />,
    title: "Zero Trust Architecture",
    desc: "mTLS on every internal connection. JWT claims derive tenant scope server-side. Row-Level Security enforced at PostgreSQL. Default deny at every boundary.",
  },
  {
    icon: <Database size={16} />,
    title: "WORM Audit Storage",
    desc: "Append-only audit tables with database triggers blocking UPDATE/DELETE. SHA-256 hash chain with Merkle tree batch verification every 1,000 events. 7-year retention.",
  },
  {
    icon: <CheckCircle size={16} />,
    title: "10-Gate PR Enforcement",
    desc: "Every code change passes static analysis, dependency scan, secret scan, type safety, 80%+ coverage, audit check, access control, PHI check, encryption check, and peer review.",
  },
];

export default function ConnectPage() {
  return (
    <MarketingLayout>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px 64px", maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <Link href="/products" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 12, color: C.textMuted, textDecoration: "none", marginBottom: 24 }}>
          <ChevronLeft size={14} /> All Products
        </Link>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#FFFBEB", border: "1px solid #fcd34d", borderRadius: 4, padding: "6px 14px", marginBottom: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B", display: "inline-block" }} />
          <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: "#92400E", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            BETA · SHIPPING NOW
          </span>
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 12px", marginBottom: 20, marginLeft: 8 }}>
          <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            CUSTOMER OPERATIONS OS
          </span>
        </div>

        <h1 style={{ fontFamily: F.heading, fontSize: 52, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, margin: "0 0 16px", color: C.text }}>
          ORDR Connect
        </h1>
        <p style={{ fontFamily: F.ui, fontSize: 22, color: C.textSub, maxWidth: 680, margin: "0 auto 16px", lineHeight: 1.5, fontWeight: 600 }}>
          The autonomous platform that replaces CRM.
        </p>
        <p style={{ fontFamily: F.ui, fontSize: 16, color: C.textMuted, maxWidth: 660, margin: "0 auto 36px", lineHeight: 1.75 }}>
          Event-sourced architecture. Multi-agent orchestration. Cryptographic audit trail.
          ORDR Connect is the operating system for enterprise customer operations —
          where AI agents execute and humans govern.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="https://ordr-connect.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 14, fontWeight: 700, color: "#fff", background: C.accent, padding: "12px 28px", borderRadius: 4, textDecoration: "none" }}
          >
            Open ORDR Connect <ArrowRight size={16} />
          </a>
          <Link
            href="/contact"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, background: C.bg, border: `1px solid ${C.border}`, padding: "12px 28px", borderRadius: 4, textDecoration: "none" }}
          >
            Request Demo
          </Link>
        </div>

        {/* Trust strip */}
        <div style={{ marginTop: 40, display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center" }}>
          {["SOC 2 Type II", "ISO 27001:2022", "HIPAA", "GDPR", "Zero Trust"].map(b => (
            <div key={b} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F.mono, fontSize: 10, color: C.textMuted }}>
              <CheckCircle size={12} color="#059669" /> {b}
            </div>
          ))}
        </div>
      </section>

      {/* ── Stats Strip ──────────────────────────────────────────────── */}
      <section style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 48px" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap" }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: F.mono, fontSize: 22, fontWeight: 800, color: C.accent }}>{s.value}</div>
              <div style={{ fontFamily: F.ui, fontSize: 11, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Six Primitives ───────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            SYSTEM ARCHITECTURE
          </span>
          <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 700, margin: "12px 0 12px", color: C.text }}>
            Six primitives. One coherent system.
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 16, color: C.textMuted, maxWidth: 560, margin: "0 auto", lineHeight: 1.6 }}>
            Not six products stitched together — six architectural building blocks with well-defined interfaces,
            independently scalable, cryptographically linked.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 16 }}>
          {PRIMITIVES.map(p => (
            <div
              key={p.title}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: 24,
                background: C.bg,
                borderLeft: `3px solid ${p.color}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 6, display: "flex", alignItems: "center",
                  justifyContent: "center", background: `${p.color}12`, color: p.color,
                }}>
                  {p.icon}
                </div>
                <div>
                  <div style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, color: C.text }}>{p.title}</div>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: C.textMuted }}>{p.sub}</div>
                </div>
              </div>
              <p style={{ fontFamily: F.ui, fontSize: 13, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Event Pipeline ───────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: "#10b981", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              DATA FLOW
            </span>
            <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "12px 0 12px", color: C.text }}>
              Signal to action in under 500ms.
            </h2>
            <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 520, margin: "0 auto", lineHeight: 1.65 }}>
              Every customer signal flows through a deterministic pipeline — ingested, evaluated,
              decided, executed, and cryptographically logged. No batch processing. No manual handoffs.
            </p>
          </div>

          {/* Pipeline stages */}
          <div style={{ display: "flex", gap: 0, overflowX: "auto", paddingBottom: 8 }}>
            {[
              { label: "Signal Ingestion", sub: "Webhook / API / Channel", color: "#3b82f6", abbr: "IN" },
              { label: "Event Stream", sub: "Kafka — Append-Only Log", color: "#10b981", abbr: "ES" },
              { label: "Decision Engine", sub: "Rules + ML + LLM", color: "#f59e0b", abbr: "DE" },
              { label: "Agent Runtime", sub: "LangGraph Orchestration", color: "#8b5cf6", abbr: "AR" },
              { label: "Channel Exec", sub: "SMS / Email / Voice / Chat", color: "#ec4899", abbr: "EX" },
              { label: "Audit + WORM", sub: "Merkle DAG / Hash Chain", color: "#06b6d4", abbr: "AU" },
            ].map((s, i, arr) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 100 }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 10, border: `1px solid ${s.color}40`,
                    background: `${s.color}08`, display: "flex", alignItems: "center",
                    justifyContent: "center", margin: "0 auto 8px",
                  }}>
                    <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: s.color }}>{s.abbr}</span>
                  </div>
                  <div style={{ fontFamily: F.ui, fontSize: 11, fontWeight: 600, color: C.text }}>{s.label}</div>
                  <div style={{ fontFamily: F.mono, fontSize: 9, color: C.textMuted, marginTop: 2 }}>{s.sub}</div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ width: 20, height: 1, background: `linear-gradient(to right, ${s.color}40, ${arr[i + 1]!.color}40)`, flexShrink: 0 }} />
                )}
              </div>
            ))}
          </div>

          {/* Latency table */}
          <div style={{ marginTop: 40, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", background: C.bg }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <Cpu size={14} color={C.textMuted} />
              <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.text }}>End-to-End Latency Waterfall</span>
              <span style={{ fontFamily: F.mono, fontSize: 10, color: C.textMuted }}>p99 targets</span>
            </div>
            {[
              ["Signal Received", "0ms", 0, 2, "#3b82f6"],
              ["Event Published (Kafka)", "<15ms", 2, 15, "#10b981"],
              ["Policy Evaluated", "<10ms", 17, 10, "#06b6d4"],
              ["Decision Computed", "<100ms", 27, 73, "#f59e0b"],
              ["Agent Dispatched", "<200ms", 100, 100, "#8b5cf6"],
              ["Channel Delivered", "<500ms", 200, 300, "#ec4899"],
            ].map(([label, latency, offset, width, color]) => (
              <div key={String(label)} style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderBottom: `1px solid ${C.borderLight}` }}>
                <span style={{ width: 160, fontFamily: F.ui, fontSize: 12, color: C.textMuted, textAlign: "right", flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 14, background: "#F4F5F7", borderRadius: 3, position: "relative" }}>
                  <div style={{
                    position: "absolute", top: 2, height: 10, borderRadius: 2,
                    left: `${(Number(offset) / 500) * 100}%`,
                    width: `${(Number(width) / 500) * 100}%`,
                    background: `linear-gradient(90deg, ${color}80, ${color})`,
                  }} />
                </div>
                <span style={{ width: 60, fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.accent }}>{latency}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px" }}>
              <span style={{ width: 160, fontFamily: F.ui, fontSize: 12, fontWeight: 700, color: C.text, textAlign: "right", flexShrink: 0 }}>End-to-End</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ width: 60, fontFamily: F.mono, fontSize: 13, fontWeight: 800, color: "#10b981" }}>&lt;500ms</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Agent Autonomy ───────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
          <div>
            <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: "#8b5cf6", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              AGENT RUNTIME
            </span>
            <h2 style={{ fontFamily: F.heading, fontSize: 30, fontWeight: 700, margin: "12px 0 12px", color: C.text }}>
              Bounded autonomy.<br />Not unbounded risk.
            </h2>
            <p style={{ fontFamily: F.ui, fontSize: 14, color: C.textMuted, lineHeight: 1.7, marginBottom: 24 }}>
              Every agent operates within explicit boundaries — permission allowlists,
              budget enforcement, confidence thresholds, and kill switches at four levels.
              Five graduated autonomy levels let you start conservative and expand as trust is established.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["Budget enforcement — hard cap on spend per agent per epoch",
                "Confidence thresholds — minimum score before autonomous execution",
                "Kill switches — four levels, operator to system-wide",
                "Full reasoning chain logged — every decision auditable"
              ].map(item => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <CheckCircle size={14} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontFamily: F.ui, fontSize: 13, color: C.textSub }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 24, background: C.bg }}>
            <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 20 }}>Autonomy Levels</div>
            {AUTONOMY_LEVELS.map(l => (
              <div key={l.level} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <span style={{ width: 24, fontFamily: F.mono, fontSize: 12, fontWeight: 800, color: l.color, flexShrink: 0 }}>{l.level}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: F.ui, fontSize: 12, fontWeight: 600, color: C.text }}>{l.name}</span>
                    <span style={{ fontFamily: F.ui, fontSize: 10, color: C.textMuted }}>{l.desc}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: C.bgAlt }}>
                    <div style={{ height: 5, borderRadius: 3, width: `${l.pct}%`, background: `linear-gradient(90deg, ${l.color}60, ${l.color})` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Compliance & Security ────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: "#10b981", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              GOVERNANCE
            </span>
            <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "12px 0 12px", color: C.text }}>
              Compliance is architectural. Not bolted on.
            </h2>
          </div>

          {/* Compliance badges */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 40 }}>
            {COMPLIANCE.map(b => (
              <div key={b.label} style={{
                border: "1px solid rgba(16,185,129,0.15)", borderRadius: 6,
                background: "rgba(16,185,129,0.03)", padding: "16px 12px", textAlign: "center",
              }}>
                <CheckCircle size={18} color="#10b981" style={{ margin: "0 auto 8px" }} />
                <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 4 }}>{b.label}</div>
                <div style={{ fontFamily: F.mono, fontSize: 9, color: C.textMuted }}>{b.sub}</div>
              </div>
            ))}
          </div>

          {/* Security features */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {SECURITY_FEATURES.map(f => (
              <div key={f.title} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 20, background: C.bg }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#10b981" }}>
                  {f.icon}
                  <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: C.text }}>{f.title}</span>
                </div>
                <p style={{ fontFamily: F.ui, fontSize: 12, color: C.textMuted, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Industries ───────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            INDUSTRIES
          </span>
          <h2 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 700, margin: "12px 0 12px", color: C.text }}>
            Built for regulated operations.
          </h2>
          <p style={{ fontFamily: F.ui, fontSize: 15, color: C.textMuted, maxWidth: 500, margin: "0 auto", lineHeight: 1.65 }}>
            Every vertical has unique compliance requirements. ORDR Connect ships with
            pre-built compliance rules for the industries that can&apos;t afford mistakes.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
          {INDUSTRIES.map(ind => (
            <div key={ind.name} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "20px 24px", background: C.bg, display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 6, background: C.bgAlt, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, flexShrink: 0 }}>
                {ind.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>{ind.name}</div>
                <div style={{ fontFamily: F.ui, fontSize: 12, color: C.textMuted, marginBottom: 8 }}>{ind.desc}</div>
                <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.accent, background: C.bgAlt, border: `1px solid ${C.border}`, padding: "2px 8px", borderRadius: 3, display: "inline-block" }}>{ind.metric}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Technical Specs ──────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", background: C.bgAlt, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              SPECIFICATIONS
            </span>
            <h2 style={{ fontFamily: F.heading, fontSize: 28, fontWeight: 700, margin: "12px 0", color: C.text }}>
              Production-grade by default.
            </h2>
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", background: C.bg }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: F.ui }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bgAlt }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>METRIC</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>SPECIFICATION</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>NOTES</th>
                </tr>
              </thead>
              <tbody>
                {TECH_SPECS.map(([metric, spec, note], i) => (
                  <tr key={String(metric)} style={{ borderBottom: i < TECH_SPECS.length - 1 ? `1px solid ${C.borderLight}` : "none" }}>
                    <td style={{ padding: "10px 16px", color: C.textSub }}>{metric}</td>
                    <td style={{ padding: "10px 16px", fontFamily: F.mono, fontWeight: 700, color: C.accent }}>{spec}</td>
                    <td style={{ padding: "10px 16px", color: C.textMuted }}>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "80px 48px", maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontFamily: F.heading, fontSize: 36, fontWeight: 800, margin: "0 0 16px", color: C.text }}>
          Replace your CRM with an operating system.
        </h2>
        <p style={{ fontFamily: F.ui, fontSize: 16, color: C.textMuted, lineHeight: 1.7, marginBottom: 36 }}>
          ORDR Connect is in beta. Early access clients get direct input into the product roadmap,
          dedicated onboarding, and locked-in beta pricing.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="https://ordr-connect.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 14, fontWeight: 700, color: "#fff", background: C.accent, padding: "14px 32px", borderRadius: 4, textDecoration: "none" }}
          >
            Open ORDR Connect <ArrowRight size={16} />
          </a>
          <Link
            href="/contact"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: F.ui, fontSize: 14, fontWeight: 600, color: C.text, background: C.bg, border: `1px solid ${C.border}`, padding: "14px 32px", borderRadius: 4, textDecoration: "none" }}
          >
            Talk to Sales
          </Link>
        </div>
      </section>

    </MarketingLayout>
  );
}
