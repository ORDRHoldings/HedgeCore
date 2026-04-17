"use client";

/**
 * /audit-lab/demo — Public demo (no auth required).
 * Four-act narrative: hero → findings → charts → trust → CTA.
 * Uses static fixture data only. No API calls. No useAuth().
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { ShieldCheck, Lock, FileDown, TrendingDown, AlertTriangle, ArrowRight } from "lucide-react";
import { DEMO_DATASET, getDemoCounterpartyStats } from "@/lib/fixtures/audit-lab-demo";

const MarkupByMonthChart = dynamic(() => import("@/components/audit-lab/MarkupByMonthChart"), { ssr: false });
const CounterpartyMatrix  = dynamic(() => import("@/components/audit-lab/CounterpartyMatrix"),  { ssr: false });

/* ── Design tokens (inline — no import to keep this page self-contained for demo) */
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass,#22c55e)",
  red:      "var(--accent-red,#f87171)",
} as const;

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function sevColor(sev: string) {
  if (sev === "HIGH")   return S.red;
  if (sev === "MEDIUM") return S.amber;
  return S.green;
}

function SevIcon({ sev }: { sev: string }) {
  const color = sevColor(sev);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
      fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
      color, background: `color-mix(in srgb, ${color} 10%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding: "2px 8px", borderRadius: 2 }}>
      {sev === "HIGH" ? "▲ HIGH" : sev === "MEDIUM" ? "● MED" : "▼ LOW"}
    </span>
  );
}

export default function AuditLabDemoPage() {
  const d  = DEMO_DATASET;
  const ar = d.auditResults;
  const cpStats = getDemoCounterpartyStats();
  const worst = cpStats[0];
  const best  = cpStats[cpStats.length - 1];

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, fontFamily: S.fontUI }}>

      {/* ── Nav strip ─────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${S.soft}`, padding: "12px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.primary, letterSpacing: "0.06em" }}>
          ORDR <span style={{ color: S.cyan }}>AUDIT LAB</span>
        </span>
        <Link href="/auth/login" style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
          color: S.cyan, border: `1px solid color-mix(in srgb, var(--accent-cyan) 40%, transparent)`,
          padding: "6px 16px", textDecoration: "none", borderRadius: 2 }}>
          SIGN IN →
        </Link>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 40px" }}>

        {/* ── Act 1: Hero ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: S.cyan, marginBottom: 12 }}>
            LIVE DEMO · {d.period} · {d.tradeCount} FX TRANSACTIONS
          </div>
          <h1 style={{ fontFamily: S.fontUI, fontSize: 32, fontWeight: 700, color: S.primary, margin: "0 0 12px", lineHeight: 1.2 }}>
            Find out exactly what your bank<br />
            <span style={{ color: S.red }}>is charging you on FX.</span>
          </h1>
          <p style={{ fontFamily: S.fontUI, fontSize: 15, color: S.secondary, margin: 0, maxWidth: 600, lineHeight: 1.7 }}>
            Sample Corporation paid <strong style={{ color: S.red }}>{fmt(ar.totalCostUsd)}</strong> in avoidable FX costs last quarter.
            Audit Lab quantified it in under 60 seconds — with a court-ready evidence trail.
          </p>
        </div>

        {/* ── Act 2: KPI strip ─────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: S.rim, border: `1px solid ${S.rim}`, marginBottom: 40, borderRadius: 3, overflow: "hidden" }}>
          {[
            { label: "Bank Markup Cost",  value: fmt(ar.totalMarkupUsd),   color: S.red,   sub: `${ar.markupBps} bps avg` },
            { label: "Explicit Fees",     value: fmt(ar.totalFeesUsd),     color: S.amber, sub: "partially opaque" },
            { label: "Total Quantified",  value: fmt(ar.totalCostUsd),     color: S.red,   sub: `${d.tradeCount} trades audited` },
            { label: "Data Quality",      value: `${ar.dataQualityScore}%`, color: S.green, sub: "of rows parsed cleanly" },
          ].map(k => (
            <div key={k.label} style={{ background: S.bgPanel, padding: "18px 20px" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontFamily: S.fontMono, fontSize: 22, fontWeight: 700, color: k.color, letterSpacing: "-0.02em" }}>{k.value}</div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 3 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Act 3: Charts ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase", marginBottom: 16 }}>
            MARKUP BY MONTH
          </div>
          <MarkupByMonthChart markupByMonth={d.markupByMonth} />
        </div>

        {/* Counterparty callout + matrix */}
        {cpStats.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          {/* Narrative callout */}
          <div style={{ background: `color-mix(in srgb, ${S.amber} 5%, transparent)`, border: `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`,
            padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 14 }}>
            <TrendingDown size={18} style={{ color: S.amber, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.amber, marginBottom: 4 }}>
                COUNTERPARTY GAP: {worst.avgBps} bps vs {best.avgBps} bps
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6 }}>
                <strong style={{ color: S.primary }}>{worst.name}</strong> charged {worst.avgBps} bps on average —{" "}
                {best.avgBps > 0 ? Math.round(worst.avgBps / best.avgBps) : "N/A"}× higher than{" "}
                <strong style={{ color: S.primary }}>{best.name}</strong> ({best.avgBps} bps) on comparable trades.{" "}
                Switching those {worst.tradeCount} trades would have saved approximately{" "}
                <strong style={{ color: S.green }}>{fmt(d.findings.find(f => f.id === "f3")?.amount_usd ?? 0)}</strong>.
              </div>
            </div>
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase", marginBottom: 12 }}>
            COUNTERPARTY PERFORMANCE MATRIX
          </div>
          <CounterpartyMatrix transactions={d.transactions as never[]} />
        </div>)}

        {/* ── Act 4: Findings ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase", marginBottom: 16 }}>
            AUDIT FINDINGS ({d.findings.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {d.findings.map(f => (
              <div key={f.id} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <SevIcon sev={f.severity} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.cyan }}>{f.finding_type.replace(/_/g, " ")}</span>
                  {f.currency_pair && <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{f.currency_pair}</span>}
                  {f.counterparty && <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>· {f.counterparty}</span>}
                  <span style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.red }}>{fmt(f.amount_usd)}</span>
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.65 }}>{f.narrative}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Act 5: Trust rail ────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 48 }}>
          {d.trustSignals.map((sig, i) => {
            const icons = [ShieldCheck, Lock, FileDown];
            const Icon = icons[i];
            return (
              <div key={sig.label} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={14} style={{ color: S.cyan }} />
                </div>
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary, marginBottom: 3 }}>{sig.label}</div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.55 }}>{sig.detail}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Act 6: CTA ───────────────────────────────────────────────────── */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "36px 40px", textAlign: "center" }}>
          <AlertTriangle size={20} style={{ color: S.amber, marginBottom: 12 }} />
          <h2 style={{ fontFamily: S.fontUI, fontSize: 22, fontWeight: 700, color: S.primary, margin: "0 0 10px" }}>
            Is your bank doing this to you?
          </h2>
          <p style={{ fontFamily: S.fontUI, fontSize: 14, color: S.secondary, maxWidth: 480, margin: "0 auto 28px", lineHeight: 1.65 }}>
            Upload your own FX transaction records. Audit Lab will quantify exactly what you paid,
            who charged the most, and what you could recover — with a tamper-evident evidence binder you can take to your board.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/auth/signup" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
              color: S.bgDeep, background: S.cyan, padding: "12px 28px",
              textDecoration: "none", borderRadius: 3,
            }}>
              AUDIT MY FX DATA <ArrowRight size={14} />
            </Link>
            <Link href="/auth/login" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
              color: S.primary, background: "transparent",
              border: `1px solid ${S.rim}`, padding: "12px 28px",
              textDecoration: "none", borderRadius: 3,
            }}>
              SIGN IN
            </Link>
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 16 }}>
            No commitment. Your data stays private. Evidence binder exports included.
          </div>
        </div>

        {/* ── Disclaimer ───────────────────────────────────────────────────── */}
        <div style={{ marginTop: 24, fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.6, textAlign: "center" }}>
          DISCLAIMER: All figures shown use static sample data. Rate variance figures are reference-baseline analytical what-ifs,
          not factual loss claims. Markup and fee figures reflect computed transaction costs vs. market benchmark rates.
        </div>

      </div>
    </div>
  );
}
