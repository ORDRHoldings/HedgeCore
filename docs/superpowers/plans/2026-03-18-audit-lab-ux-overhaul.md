# Audit Lab UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the Audit Lab from a functional internal tool into an institutional-grade first impression that builds immediate trust with non-client prospects.

**Architecture:** Six focused chunks, each independently shippable. No new routes or API endpoints. All changes are frontend-only within existing files plus one new fixture enrichment file. The demo page is the highest-leverage surface — it gets the most work. Every other chunk incrementally raises the bar.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript 5.9, ECharts (echarts-for-react), IBM Plex fonts, CSS variables via `--var()` design tokens (`frontend/src/lib/design/tokens.ts`). No new dependencies.

---

## Files Touched

| File | Action | Chunk |
|------|--------|-------|
| `frontend/src/lib/fixtures/audit-lab-demo.ts` | Enrich with markup_by_month, counterparty scores, findings, transactions | 1 |
| `frontend/src/app/audit-lab/demo/page.tsx` | Full rebuild — narrative, charts, trust signals, strong CTA | 1 |
| `frontend/src/app/audit-lab/upload/page.tsx` | Sample CSV download, dynamic dates, better labels, UUID hidden | 2 |
| `frontend/src/app/audit-lab/page.tsx` | Remove BETA, enrich run list, guided empty state | 3 |
| `frontend/src/app/audit-lab/runs/[run_id]/page.tsx` | Export hierarchy, hash in header, findings expand, accessibility | 4 |
| `frontend/src/components/layout/AppSidebar.tsx` | Rename `/audit-lab/audit-trail` nav label to "Activity Log" | 5 |
| `frontend/src/app/audit-lab/audit-trail/page.tsx` | Update page title/header to "Activity Log" | 5 |

---

## Chunk 1: Demo Page — Full Rebuild

**Goal:** Transform the 80-line static table into a narrative-first, chart-rich, trust-signalled showcase that converts a first-time prospect.

**Files:**
- Modify: `frontend/src/lib/fixtures/audit-lab-demo.ts`
- Rewrite: `frontend/src/app/audit-lab/demo/page.tsx`

### Task 1.1 — Enrich the Demo Fixture

The current fixture has positions and high-level audit results. The demo now needs:
- `markupByMonth` — for `MarkupByMonthChart`
- `counterpartyScores` — for `CounterpartyMatrix`
- `transactions` — for `CounterpartyMatrix` (it takes raw transactions)
- `findings` — 3 pre-written findings with severity, narrative, amount
- `trustSignals` — static list of 3 trust callouts

- [ ] **Step 1.1.1: Open fixture and replace with enriched version**

Replace the entire contents of `frontend/src/lib/fixtures/audit-lab-demo.ts`:

```typescript
/**
 * Static sample dataset for the public Audit Lab demo.
 * No API calls — all data is hardcoded here.
 * Keep in sync with the demo page narrative callouts.
 */

export const DEMO_DATASET = {
  name: "Sample Corporation — Q4 2025 FX Audit",
  period: "Q4 2025 (Oct – Dec)",
  tradeCount: 94,

  // KPI summary
  auditResults: {
    totalExposureUsd: 11_200_000,
    hedgedExposureUsd: 7_840_000,
    coverageRatio: 0.70,
    markupBps: 23,
    totalMarkupUsd: 186_400,
    totalFeesUsd: 22_100,
    totalCostUsd: 208_500,
    dataQualityScore: 91,
  },

  // Used by MarkupByMonthChart — positive = adverse (red), negative = favorable (green)
  markupByMonth: {
    "2025-10": 68_200,
    "2025-11": 71_400,
    "2025-12": 46_800,
  } as Record<string, number>,

  // Used by CounterpartyMatrix
  transactions: [
    // HSBC — worst performer
    // spread_classification is required by CounterpartyMatrix — "ADVERSE" = outside spread, "FAVORABLE" = within spread
    { id: "t1",  row_index: 1,  trade_date: "2025-10-03", currency_sold: "EUR", currency_bought: "USD", amount_sold: 800_000,  amount_bought: 872_400,   effective_rate: 1.0905, benchmark_rate: 1.0870, markup_cost_usd: 2_800, markup_direction: "ADVERSE", markup_bps: 32, counterparty: "HSBC",         spread_classification: "ADVERSE" },
    { id: "t2",  row_index: 2,  trade_date: "2025-10-08", currency_sold: "GBP", currency_bought: "USD", amount_sold: 500_000,  amount_bought: 631_500,   effective_rate: 1.2630, benchmark_rate: 1.2710, markup_cost_usd: 4_000, markup_direction: "ADVERSE", markup_bps: 63, counterparty: "HSBC",         spread_classification: "ADVERSE" },
    { id: "t3",  row_index: 3,  trade_date: "2025-10-14", currency_sold: "EUR", currency_bought: "USD", amount_sold: 1_200_000, amount_bought: 1_308_000, effective_rate: 1.0900, benchmark_rate: 1.0847, markup_cost_usd: 6_360, markup_direction: "ADVERSE", markup_bps: 49, counterparty: "HSBC",         spread_classification: "ADVERSE" },
    { id: "t4",  row_index: 4,  trade_date: "2025-11-02", currency_sold: "EUR", currency_bought: "USD", amount_sold: 600_000,  amount_bought: 653_820,   effective_rate: 1.0897, benchmark_rate: 1.0847, markup_cost_usd: 3_000, markup_direction: "ADVERSE", markup_bps: 50, counterparty: "HSBC",         spread_classification: "ADVERSE" },
    // Deutsche Bank — best performer
    { id: "t5",  row_index: 5,  trade_date: "2025-10-05", currency_sold: "EUR", currency_bought: "USD", amount_sold: 2_000_000, amount_bought: 2_172_000, effective_rate: 1.0860, benchmark_rate: 1.0847, markup_cost_usd: 2_600, markup_direction: "ADVERSE", markup_bps: 13, counterparty: "Deutsche Bank", spread_classification: "FAVORABLE" },
    { id: "t6",  row_index: 6,  trade_date: "2025-11-10", currency_sold: "GBP", currency_bought: "USD", amount_sold: 800_000,  amount_bought: 1_017_600, effective_rate: 1.2720, benchmark_rate: 1.2710, markup_cost_usd: 800,   markup_direction: "ADVERSE", markup_bps: 10, counterparty: "Deutsche Bank", spread_classification: "FAVORABLE" },
    { id: "t7",  row_index: 7,  trade_date: "2025-12-04", currency_sold: "EUR", currency_bought: "USD", amount_sold: 1_500_000, amount_bought: 1_629_750, effective_rate: 1.0865, benchmark_rate: 1.0847, markup_cost_usd: 2_700, markup_direction: "ADVERSE", markup_bps: 12, counterparty: "Deutsche Bank", spread_classification: "FAVORABLE" },
    { id: "t8",  row_index: 8,  trade_date: "2025-12-15", currency_sold: "EUR", currency_bought: "USD", amount_sold: 900_000,  amount_bought: 978_300,   effective_rate: 1.0870, benchmark_rate: 1.0847, markup_cost_usd: 2_070, markup_direction: "ADVERSE", markup_bps: 23, counterparty: "Deutsche Bank", spread_classification: "FAVORABLE" },
    // Barclays — mid performer
    { id: "t9",  row_index: 9,  trade_date: "2025-10-20", currency_sold: "EUR", currency_bought: "USD", amount_sold: 700_000,  amount_bought: 762_300,   effective_rate: 1.0890, benchmark_rate: 1.0847, markup_cost_usd: 3_010, markup_direction: "ADVERSE", markup_bps: 43, counterparty: "Barclays",      spread_classification: "ADVERSE" },
    { id: "t10", row_index: 10, trade_date: "2025-11-18", currency_sold: "GBP", currency_bought: "USD", amount_sold: 400_000,  amount_bought: 507_360,   effective_rate: 1.2684, benchmark_rate: 1.2710, markup_cost_usd: 1_040, markup_direction: "ADVERSE", markup_bps: 26, counterparty: "Barclays",      spread_classification: "ADVERSE" },
    { id: "t11", row_index: 11, trade_date: "2025-12-02", currency_sold: "EUR", currency_bought: "USD", amount_sold: 550_000,  amount_bought: 598_806,   effective_rate: 1.0887, benchmark_rate: 1.0847, markup_cost_usd: 2_200, markup_direction: "ADVERSE", markup_bps: 40, counterparty: "Barclays",      spread_classification: "ADVERSE" },
  ],

  // Pre-written audit findings for the demo
  findings: [
    {
      id: "f1",
      finding_type: "MARKUP_EXCESS",
      severity: "HIGH",
      currency_pair: "EUR/USD",
      counterparty: "HSBC",
      amount_usd: 89_600,
      narrative: "HSBC charged an average of 49 bps above the mid-market rate on EUR/USD trades — 3.8× the rate observed from Deutsche Bank on identical settlement conditions.",
    },
    {
      id: "f2",
      finding_type: "FEE_OPACITY",
      severity: "MEDIUM",
      currency_pair: "GBP/USD",
      counterparty: "HSBC",
      amount_usd: 22_100,
      narrative: "Explicit settlement fees were not itemised separately in 6 of 14 GBP/USD trade confirmations. Estimated fee embedded in rate: $22,100. Confidence: MEDIUM — request itemised fee schedules from counterparty.",
    },
    {
      id: "f3",
      finding_type: "COUNTERPARTY_DIVERGENCE",
      severity: "LOW",
      currency_pair: null,
      counterparty: null,
      amount_usd: 74_800,
      narrative: "Switching the 8 HSBC EUR/USD trades to Deutsche Bank's observed rate for the same period would have saved an estimated $74,800 — with no change to settlement timeline or credit terms.",
    },
  ],

  // Static trust signals shown in the demo footer
  trustSignals: [
    { label: "Deterministic methodology", detail: "Same inputs always produce same outputs. No model drift." },
    { label: "SHA-256 audit chain", detail: "Every result is cryptographically fingerprinted. Tamper-evident by design." },
    { label: "Evidence binder export", detail: "Download a court-ready JSON package with all hashes and source data." },
  ],
};

/** Counterparty-level aggregates derived from transactions — used for narrative callouts */
export function getDemoCounterpartyStats() {
  const byCounterparty: Record<string, { totalCost: number; tradeCount: number; bpsSum: number }> = {};
  for (const t of DEMO_DATASET.transactions) {
    const cp = t.counterparty;
    if (!byCounterparty[cp]) byCounterparty[cp] = { totalCost: 0, tradeCount: 0, bpsSum: 0 };
    byCounterparty[cp].totalCost  += t.markup_cost_usd;
    byCounterparty[cp].tradeCount += 1;
    byCounterparty[cp].bpsSum     += t.markup_bps;
  }
  return Object.entries(byCounterparty).map(([name, d]) => ({
    name,
    totalCostUsd: d.totalCost,
    tradeCount: d.tradeCount,
    avgBps: Math.round(d.bpsSum / d.tradeCount),
  })).sort((a, b) => b.avgBps - a.avgBps);
}
```

---

### Task 1.2 — Rebuild the Demo Page

The new page tells a story in four acts:
1. **Hero** — headline value prop + period badge
2. **Findings callout** — 3 boxed findings, severity-badged, with full narrative
3. **Charts** — MarkupByMonthChart + CounterpartyMatrix side-by-side
4. **KPI strip** — headline numbers
5. **Trust rail** — 3 trust signals
6. **CTA block** — strong action, not "create account"

- [ ] **Step 1.2.1: Write the new demo page**

Replace the entire contents of `frontend/src/app/audit-lab/demo/page.tsx`:

```tsx
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

function SevColor(sev: string) {
  if (sev === "HIGH")   return S.red;
  if (sev === "MEDIUM") return S.amber;
  return S.green;
}

function SevIcon({ sev }: { sev: string }) {
  const color = SevColor(sev);
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
                {Math.round(worst.avgBps / best.avgBps)}× higher than{" "}
                <strong style={{ color: S.primary }}>{best.name}</strong> ({best.avgBps} bps) on comparable trades.{" "}
                Switching those {worst.tradeCount} trades would have saved approximately{" "}
                <strong style={{ color: S.green }}>{fmt(d.findings[2].amount_usd)}</strong>.
              </div>
            </div>
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase", marginBottom: 12 }}>
            COUNTERPARTY PERFORMANCE MATRIX
          </div>
          <CounterpartyMatrix transactions={d.transactions as never[]} />
        </div>

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
```

- [ ] **Step 1.2.2: Verify TypeScript and build (both files must be updated before this check)**
```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "audit-lab-demo|demo/page" | head -10
cd frontend && npx next build 2>&1 | tail -20
```
Expected: no errors on the fixture or demo page. `✓ Compiled successfully`.

- [ ] **Step 1.2.3: Commit**
```bash
git add frontend/src/lib/fixtures/audit-lab-demo.ts frontend/src/app/audit-lab/demo/page.tsx
git commit -m "feat(audit-lab): rebuild demo page — narrative, charts, trust signals, strong CTA"
```

---

## Chunk 2: Upload Flow Improvements

**Goal:** Eliminate the top three conversion blockers in the upload wizard: no sample file, hardcoded stale dates, and technical language.

**Files:**
- Modify: `frontend/src/app/audit-lab/upload/page.tsx`

### Task 2.1 — Dynamic Default Dates

Current hardcoded: `"2025-01-01"` / `"2025-12-31"`. Replace with last calendar year, computed at mount.

- [ ] **Step 2.1.1: Add a `defaultPeriod` helper at the top of the file (before the component)**

In `frontend/src/app/audit-lab/upload/page.tsx`, find the section just before the `AuditLabUploadPageInner` function and add:

```typescript
/** Returns { start: "YYYY-01-01", end: "YYYY-12-31" } for last calendar year */
function lastYearPeriod() {
  const y = new Date().getFullYear() - 1;
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}
```

- [ ] **Step 2.1.2: Replace hardcoded state initializers**

Find:
```typescript
const [periodStart, setPeriodStart] = useState("2025-01-01");
const [periodEnd, setPeriodEnd]   = useState("2025-12-31");
```

Replace with:
```typescript
const defaultPeriod = lastYearPeriod();
const [periodStart, setPeriodStart] = useState(defaultPeriod.start);
const [periodEnd,   setPeriodEnd]   = useState(defaultPeriod.end);
```

### Task 2.2 — Sample CSV Download Button

- [ ] **Step 2.2.1: Add `downloadSampleCsv` helper before the component**

Add this function directly after `lastYearPeriod`:

```typescript
function downloadSampleCsv() {
  const rows = [
    "trade_date,currency_sold,currency_bought,amount_sold,amount_bought,counterparty,reference",
    "2025-10-03,EUR,USD,800000,872400,HSBC,TXN-001",
    "2025-10-05,EUR,USD,2000000,2172000,Deutsche Bank,TXN-002",
    "2025-10-08,GBP,USD,500000,631500,HSBC,TXN-003",
    "2025-11-02,EUR,USD,600000,653820,HSBC,TXN-004",
    "2025-11-10,GBP,USD,800000,1017600,Deutsche Bank,TXN-005",
    "2025-12-04,EUR,USD,1500000,1629750,Deutsche Bank,TXN-006",
    "2025-12-15,EUR,USD,900000,978300,Deutsche Bank,TXN-007",
  ].join("\n");
  const blob = new Blob([rows], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "sample-fx-transactions.csv";
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2.2.2: Add the download button below the format description**

In the page header section, find the `<p>` tag that describes the CSV format:
```tsx
<p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginTop: 6 }}>
  CSV, XLSX, or PDF with columns: trade_date, currency_sold, currency_bought, amount_sold, amount_bought. Aliases supported.
</p>
```

Replace with:
```tsx
<div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
  <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, margin: 0 }}>
    CSV, XLSX, or PDF with columns: trade_date, currency_sold, currency_bought, amount_sold, amount_bought. Aliases supported.
  </p>
  <button
    onClick={downloadSampleCsv}
    style={{
      fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
      color: S.cyan, background: "transparent", flexShrink: 0,
      border: `1px solid color-mix(in srgb, var(--accent-cyan) 30%, transparent)`,
      padding: "4px 12px", cursor: "pointer", borderRadius: 2, whiteSpace: "nowrap",
    }}
  >
    ↓ SAMPLE CSV
  </button>
</div>
```

### Task 2.3 — Better Button Labels & Step Names

- [ ] **Step 2.3.1: Fix the Upload button label**

Find:
```tsx
{uploading ? "UPLOADING…" : "UPLOAD & PARSE"}
```
Replace with:
```tsx
{uploading ? "UPLOADING…" : "UPLOAD & CONTINUE →"}
```

- [ ] **Step 2.3.2: Fix the progress step labels**

Find:
```tsx
{p === "upload" ? "Upload CSV" : p === "run" ? "Configure & Run" : "Done"}
```
Replace with:
```tsx
{p === "upload" ? "Upload File" : p === "run" ? "Configure" : "View Results"}
```

### Task 2.4 — Hide UUID in Phase 2, Show Human-Readable Confirmation

- [ ] **Step 2.4.1: Replace the Dataset ID display block**

Find the block that renders the Dataset ID label:
```tsx
<div>
  <Label>Dataset ID</Label>
  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, padding: "8px 12px", background: S.bgSub, border: `1px solid ${S.soft}` }}>
    {datasetId}
  </div>
</div>
```

Replace with (this removes the UUID display entirely — datasetId is still in state for the API call):
```tsx
{/* Dataset ID kept in state (datasetId) for API call — not shown to user */}
```

- [ ] **Step 2.4.2: Enrich the upload success banner to show human context**

Find:
```tsx
<div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>
  {(uploadResult as Record<string,number>).row_count} rows parsed · {((uploadResult as Record<string,string[]>).currency_pairs_detected ?? []).join(", ")}
</div>
```

Replace with:
```tsx
<div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>
  {(uploadResult as Record<string,number>).row_count > 0
    ? `${(uploadResult as Record<string,number>).row_count} rows parsed`
    : "Dataset ready"
  }
  {((uploadResult as Record<string,string[]>).currency_pairs_detected ?? []).length > 0
    ? ` · ${((uploadResult as Record<string,string[]>).currency_pairs_detected ?? []).join(", ")}`
    : ""
  }
  {(uploadResult as Record<string,boolean>)._reused && " · Using existing dataset"}
</div>
```

### Task 2.5 — Benchmark Source Tooltip

- [ ] **Step 2.5.1: Add explanatory helper text to benchmark choice**

Find the benchmark description line:
```tsx
<div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 6 }}>
  {benchmarkSource === "market_snapshot"
    ? "Uses stored market snapshots as the benchmark mid-rate for markup calculation."
    : "Uses a fixed budget rate as the reference baseline for unhedged impact."}
</div>
```

Replace with:
```tsx
<div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 6, lineHeight: 1.6 }}>
  {benchmarkSource === "market_snapshot"
    ? <>
        <strong style={{ color: S.secondary }}>Recommended for most audits.</strong> Compares each trade rate against the interbank mid-rate at time of trade. Best for quantifying bank markup cost.
      </>
    : <>
        Compares your trade rates against a fixed rate you set. Best for FX budget variance analysis. You will be asked to enter the rate below.
      </>
  }
</div>
```

- [ ] **Step 2.5.2: Build and verify**
```bash
cd frontend && npx next build 2>&1 | tail -10
```
Expected: clean build.

- [ ] **Step 2.5.3: Commit**
```bash
git add frontend/src/app/audit-lab/upload/page.tsx
git commit -m "feat(audit-lab): upload UX — sample CSV, dynamic dates, cleaner labels, hidden UUID"
```

---

## Chunk 3: Audit Lab Hub — BETA Removal + Run List + Empty State

**Goal:** Remove the trust-damaging BETA badge. Show meaningful run list entries. Replace dead-end empty panels with guided first-run experience.

**Files:**
- Modify: `frontend/src/app/audit-lab/page.tsx`

### Task 3.1 — Remove BETA Badge

- [ ] **Step 3.1.1: Delete the BETA badge**

Find:
```tsx
<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: S.tertiary }}>AUDIT LAB</span>
  <Badge label="BETA" color={S.amber} />
</div>
```

Replace with:
```tsx
<div style={{ marginBottom: 6 }}>
  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: S.tertiary }}>AUDIT LAB</span>
</div>
```

### Task 3.2 — Guided Empty State for Datasets Panel

- [ ] **Step 3.2.1: Replace the datasets empty state**

Find:
```tsx
<div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, padding: "24px 0", textAlign: "center" }}>
  No datasets uploaded yet.{" "}
  <Link href="/audit-lab/upload" style={{ color: S.cyan, textDecoration: "none" }}>Upload one →</Link>
</div>
```

Replace with:
```tsx
<div style={{ padding: "28px 0", textAlign: "center" }}>
  <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.primary, marginBottom: 8 }}>
    No datasets yet
  </div>
  <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, marginBottom: 16, lineHeight: 1.6, maxWidth: 280, margin: "0 auto 16px" }}>
    Upload a CSV or XLSX of your FX transactions to start your first audit. A sample file is available on the upload page.
  </div>
  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
    <Link
      href="/audit-lab/upload"
      style={{
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
        color: S.bgPanel, background: S.cyan, padding: "9px 20px",
        textDecoration: "none", borderRadius: 2, display: "inline-block",
      }}
    >
      + UPLOAD YOUR DATA
    </Link>
    <Link href="/audit-lab/demo" style={{ fontFamily: S.fontUI, fontSize: 12, color: S.cyan, textDecoration: "none" }}>
      See a sample result first →
    </Link>
  </div>
</div>
```

### Task 3.3 — Meaningful Run List Entries

The current run list shows truncated UUID and methodology version. Show dataset name (source_filename) by cross-referencing with datasets, or at minimum show the period and row count from the run's linked dataset.

The run object does not carry dataset filename directly — only `dataset_id`. Join locally from datasets list.

- [ ] **Step 3.3.1: Add `useMemo` to the React import and add dataset lookup map**

First, update the import at line 7 of `frontend/src/app/audit-lab/page.tsx`. Find:
```tsx
import { useState, useEffect, useCallback } from "react";
```
Replace with:
```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
```

Then, inside `AuditLabPage` after `const [error, setError] = useState<string | null>(null);`, add:
```tsx
const datasetMap = useMemo(
  () => Object.fromEntries(datasets.map(ds => [ds.id, ds])),
  [datasets],
);
```

- [ ] **Step 3.3.2: Add `dataset_id` to the `DecisionRun` interface**

Find:
```typescript
interface DecisionRun {
  run_id: string;
  run_hash: string;
  methodology_version: string;
  status: string;
  created_at: string;
}
```
Replace with:
```typescript
interface DecisionRun {
  run_id: string;
  dataset_id: string;
  run_hash: string;
  methodology_version: string;
  status: string;
  created_at: string;
}
```

- [ ] **Step 3.3.3: Replace the run card content**

Find the run card content (inside the `runs.map(run => (...))`):
```tsx
<div>
  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, marginBottom: 3, fontWeight: 600 }}>
    {run.run_id.slice(0, 16)}…
  </div>
  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
    v{run.methodology_version} · {new Date(run.created_at).toLocaleString()}
  </div>
</div>
```

Replace with (uses the typed `dataset_id` from the updated interface):
```tsx
<div>
  {(() => {
    const ds = datasetMap[run.dataset_id ?? ""];
    return (
      <>
        <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.primary, marginBottom: 3 }}>
          {ds ? ds.source_filename : `Run ${run.run_id.slice(0, 8)}…`}
        </div>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
          {ds ? `${ds.period_start} → ${ds.period_end} · ${ds.row_count} rows` : `v${run.methodology_version}`}
          {" · "}{new Date(run.created_at).toLocaleDateString()}
        </div>
      </>
    );
  })()}
</div>
```

- [ ] **Step 3.3.3: Build and verify**
```bash
cd frontend && npx next build 2>&1 | tail -10
```

- [ ] **Step 3.3.4: Commit**
```bash
git add frontend/src/app/audit-lab/page.tsx
git commit -m "feat(audit-lab): remove BETA badge, guided empty state, meaningful run list entries"
```

---

## Chunk 4: Run Detail — Export Hierarchy + Evidence Rail + Findings Expand + Accessibility

**Goal:** Make the Board Summary the primary CTA. Surface the hash chain on the page header. Add expand-on-click to findings narratives. Fix red/green accessibility.

**Files:**
- Modify: `frontend/src/app/audit-lab/runs/[run_id]/page.tsx`

### Task 4.1 — Export Button Visual Hierarchy

- [ ] **Step 4.1.1: Replace the export button group**

In `frontend/src/app/audit-lab/runs/[run_id]/page.tsx`, find the export buttons block. Use this surrounding context to locate the exact block — it is the `<div>` that contains all three export `<button>` elements in the page header section, immediately to the right of the `<h1>Audit Analysis Report</h1>`:

```tsx
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleExport}
              disabled={exporting}
```

Replace the entire `<div style={{ display: "flex", gap: 8 }}>` block (from the opening `<div>` through its closing `</div>`) with:

```tsx
<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
  {/* Board Summary — primary CTA */}
  <button
    onClick={handleBoardSummary}
    disabled={exportingBoard}
    style={{
      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
      color: S.bgPanel, background: exportingBoard ? S.tertiary : S.cyan,
      border: "none", padding: "9px 18px", cursor: exportingBoard ? "not-allowed" : "pointer",
      borderRadius: 2,
    }}
  >
    {exportingBoard ? "EXPORTING…" : "↓ BOARD SUMMARY"}
  </button>
  {/* Evidence Binder — secondary */}
  <button
    onClick={handleExport}
    disabled={exporting}
    style={{
      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
      color: S.primary, background: "transparent",
      border: `1px solid ${S.rim}`, padding: "9px 18px", cursor: exporting ? "not-allowed" : "pointer",
      borderRadius: 2,
    }}
  >
    {exporting ? "EXPORTING…" : "↓ EVIDENCE BINDER"}
  </button>
  {/* XLSX — tertiary */}
  <button
    onClick={handleXlsxExport}
    disabled={exportingXlsx}
    style={{
      fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
      color: S.tertiary, background: "transparent",
      border: "none", padding: "9px 12px", cursor: exportingXlsx ? "not-allowed" : "pointer",
      textDecoration: "underline",
    }}
  >
    {exportingXlsx ? "…" : "↓ XLSX"}
  </button>
</div>
```

### Task 4.2 — Hash Fingerprint in Page Header

Show a compact run hash in the header so the first thing a CFO or auditor sees is the tamper-evidence indicator.

- [ ] **Step 4.2.1: Add hash badge to the page header**

Find the metadata line under the `<h1>`:
```tsx
<div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 4 }}>
  v{run.methodology_version} · {new Date(run.created_at).toLocaleString()} · {run.status}
</div>
```

Replace with:
```tsx
<div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
    v{run.methodology_version} · {new Date(run.created_at).toLocaleString()}
  </span>
  <span style={{
    fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
    color: S.green, background: `color-mix(in srgb, ${S.green} 8%, transparent)`,
    border: `1px solid color-mix(in srgb, ${S.green} 20%, transparent)`,
    padding: "2px 8px", borderRadius: 2,
  }}>
    ✓ {run.status}
  </span>
  {run.run_hash && (
    <span
      title={`SHA-256 Run Hash: ${run.run_hash}`}
      style={{
        fontFamily: S.fontMono, fontSize: 11, color: S.tertiary,
        background: S.bgSub, border: `1px solid ${S.soft}`,
        padding: "2px 8px", borderRadius: 2, cursor: "help",
        display: "inline-flex", alignItems: "center", gap: 4,
      }}
    >
      <Lock size={10} style={{ color: S.tertiary }} />
      {run.run_hash.slice(0, 12)}…
    </span>
  )}
</div>
```

### Task 4.3 — Expandable Findings Narratives

- [ ] **Step 4.3.1: Add expanded-row state**

Near the top of the component where other state is declared, add:
```tsx
const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
```

- [ ] **Step 4.3.2: Replace the findings table row to support expand**

Find the `<tr>` for each finding in the findings tab. Replace:
```tsx
<tr key={f.id} style={{ borderBottom: `1px solid ${S.soft}` }}>
  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.cyan }}>{f.finding_type}</td>
  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{f.currency_pair ?? "—"}</td>
  <td style={{ padding: "10px 16px" }}>
    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: SevColor(f.severity), background: `color-mix(in srgb, ${SevColor(f.severity)} 10%, transparent)`, padding: "2px 8px", borderRadius: 2 }}>
      {f.severity}
    </span>
  </td>
  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: f.amount_usd > 0 ? S.red : S.green }}>{fmt(f.amount_usd)}</td>
  <td style={{ padding: "10px 16px", fontFamily: S.fontUI, fontSize: 12, color: S.secondary, maxWidth: 400 }}>{f.narrative}</td>
</tr>
```

Replace with:
```tsx
<React.Fragment key={f.id}>
  <tr
    onClick={() => setExpandedFinding(expandedFinding === f.id ? null : f.id)}
    style={{ borderBottom: expandedFinding === f.id ? "none" : `1px solid ${S.soft}`, cursor: "pointer" }}
    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = S.bgSub}
    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}
  >
    <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.cyan }}>{f.finding_type}</td>
    <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{f.currency_pair ?? "—"}</td>
    <td style={{ padding: "10px 16px" }}>
      <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: SevColor(f.severity), background: `color-mix(in srgb, ${SevColor(f.severity)} 10%, transparent)`, padding: "2px 8px", borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 4 }}>
        {f.severity === "HIGH" ? "▲" : f.severity === "MEDIUM" ? "●" : "▼"} {f.severity}
      </span>
    </td>
    <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: f.amount_usd > 0 ? S.red : S.green }}>{fmt(f.amount_usd)}</td>
    <td style={{ padding: "10px 16px", fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expandedFinding === f.id ? "normal" : "nowrap", display: "block", maxWidth: 340 }}>
        {f.narrative}
      </span>
    </td>
    <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, whiteSpace: "nowrap" }}>
      {expandedFinding === f.id ? "▲ collapse" : "▼ expand"}
    </td>
  </tr>
  {expandedFinding === f.id && (
    <tr style={{ borderBottom: `1px solid ${S.soft}`, background: S.bgSub }}>
      <td colSpan={6} style={{ padding: "12px 16px 16px 48px", fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.7 }}>
        {f.narrative}
        <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
          FINDING ID: {f.id} · HASH: {f.finding_hash?.slice(0, 20) ?? "—"}…
        </div>
      </td>
    </tr>
  )}
</React.Fragment>
```

**React import:** The file currently imports `{ useState, useEffect, useCallback }` from react. Update the top-of-file import to include `React` as default (needed for `React.Fragment` with a `key` prop):

Find:
```typescript
import { useState, useEffect, useCallback } from "react";
```
Replace with:
```typescript
import React, { useState, useEffect, useCallback } from "react";
```

**Add `Lock` icon import:** The `Lock` icon is used in Task 4.2. Add it to the existing lucide-react import. Find:
```typescript
import { PageShell } from "@/components/layout/PageShell";
import { Microscope } from "lucide-react";
```
Replace with:
```typescript
import { PageShell } from "@/components/layout/PageShell";
import { Microscope, Lock } from "lucide-react";
```

Update the findings table `<thead>` to add the expand column. Find the 5-column thead:
```tsx
{["Type", "Pair", "Severity", "Amount (USD)", "Narrative"].map(h => (
  <th key={h} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, textAlign: "left", padding: "10px 16px", borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase" }}>{h}</th>
))}
```
Replace with:
```tsx
{(["Type", "Pair", "Severity", "Amount (USD)", "Narrative", "expand"] as const).map(h => (
  <th key={h} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, textAlign: "left", padding: "10px 16px", borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase" }}>
    {h === "expand" ? "" : h}
  </th>
))}
```

### Task 4.4 — Evidence Rail Improvements

- [ ] **Step 4.4.1: Rename the tab and add plain-English context**

Find the tab labels map:
```typescript
const labels: Record<string, string> = {
  findings: `Findings (${run.findings.length})`,
  pairs: "By Pair",
  counterparties: "By Counterparty",
  transactions: "Transactions",
  evidence: "Evidence Rail",
};
```
Change `evidence: "Evidence Rail"` to `evidence: "Verification"`.

- [ ] **Step 4.4.2: Add plain-English explanation and Verify button to the evidence tab**

Find the Evidence rail tab content opening:
```tsx
{activeTab === "evidence" && (
  <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 4 }}>
      SHA-256 Evidence Chain
    </div>
```

Replace that opening block with:
```tsx
{activeTab === "evidence" && (
  <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ background: `color-mix(in srgb, ${S.green} 5%, transparent)`, border: `1px solid color-mix(in srgb, ${S.green} 20%, transparent)`, padding: "12px 16px", marginBottom: 4 }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.green, marginBottom: 4 }}>
        ✓ TAMPER-EVIDENT AUDIT CHAIN
      </div>
      <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.65 }}>
        Every analysis is cryptographically fingerprinted using SHA-256. These hashes prove this result was never modified after it was computed. Share them with your auditor, legal team, or board.
      </div>
    </div>
    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 4 }}>
      SHA-256 FINGERPRINTS
    </div>
```

### Task 4.5 — Remove Disclaimer from Rate Variance KPI

- [ ] **Step 4.5.1: Clean up the Rate Variance KPI subtitle**

Find:
```tsx
<KpiCard label="Rate Variance" value={fmt(s.total_rate_variance_usd ?? s.total_unhedged_impact_usd)} sub="Reference baseline — analytical what-if" color={S.amber} />
```
Replace with:
```tsx
<KpiCard label="Rate Variance" value={fmt(s.total_rate_variance_usd ?? s.total_unhedged_impact_usd)} sub="vs. benchmark mid-rate" color={S.amber} />
```

### Task 4.6 — Split Data Quality into Its Own KPI

- [ ] **Step 4.6.1: Replace the 4-column KPI grid with 5 columns**

Find:
```tsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
  <KpiCard label="Total Markup Cost" value={fmt(s.total_markup_usd)} color={s.total_markup_usd > 0 ? S.red : S.primary} />
  <KpiCard label="Explicit Fees" value={fmt(s.total_fees_usd)} sub={`Confidence: ${s.fee_confidence}`} />
  <KpiCard label="Rate Variance" value={fmt(s.total_rate_variance_usd ?? s.total_unhedged_impact_usd)} sub="Reference baseline — analytical what-if" color={S.amber} />
  <KpiCard label="Total Quantified Cost" value={fmt(s.total_loss_usd)} color={S.red} sub={`Data quality: ${s.data_quality_score?.toFixed(0)}%`} />
</div>
```

Replace with:
```tsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
  <KpiCard label="Total Markup Cost"     value={fmt(s.total_markup_usd)}                                        color={s.total_markup_usd > 0 ? S.red : S.primary} />
  <KpiCard label="Explicit Fees"         value={fmt(s.total_fees_usd)}                                          sub={`Confidence: ${s.fee_confidence}`} />
  <KpiCard label="Rate Variance"         value={fmt(s.total_rate_variance_usd ?? s.total_unhedged_impact_usd)}  sub="vs. benchmark mid-rate" color={S.amber} />
  <KpiCard label="Total Quantified Cost" value={fmt(s.total_loss_usd)}                                          color={S.red} />
  <KpiCard label="Data Quality"          value={`${s.data_quality_score != null ? s.data_quality_score.toFixed(0) : "—"}%`} color={s.data_quality_score != null && s.data_quality_score >= 85 ? S.green : s.data_quality_score != null && s.data_quality_score >= 65 ? S.amber : S.red} sub={s.markup_rejections_count > 0 ? `${s.markup_rejections_count} rows flagged` : "All rows clean"} />
</div>
```

- [ ] **Step 4.6.2: Build and verify**
```bash
cd frontend && npx next build 2>&1 | tail -10
```
Expected: clean build, no TS errors.

- [ ] **Step 4.6.3: Commit**
```bash
git add frontend/src/app/audit-lab/runs/[run_id]/page.tsx
git commit -m "feat(audit-lab): export hierarchy, hash in header, findings expand, verification tab, split KPIs"
```

---

## Chunk 5: Navigation — Rename Audit Trail Collision

**Goal:** Remove the naming collision between the governance Audit Trail and the Audit Lab activity log. Rename the Audit Lab one to "Activity Log."

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx`
- Modify: `frontend/src/app/audit-lab/audit-trail/page.tsx`

### Task 5.1 — Update Sidebar Label

- [ ] **Step 5.1.1: Update the sidebar nav entry for `/audit-lab/audit-trail`**

Open `frontend/src/components/layout/AppSidebar.tsx`. Find this exact line (it is in the Audit Lab sub-items section):

```typescript
{ label: "Audit Trail",    desc: "Immutable event log",   href: "/audit-lab/audit-trail", icon: Shield },
```

Replace with:
```typescript
{ label: "Activity Log",   desc: "Immutable event log",   href: "/audit-lab/audit-trail", icon: Shield },
```

The governance `/audit-trail` entry (different section, no `/audit-lab/` prefix) must **not** be changed.

- [ ] **Step 5.1.2: Update all "Audit Trail" strings in the audit-trail page**

Open `frontend/src/app/audit-lab/audit-trail/page.tsx`. There are four strings that must change:

**1. PageShell title and breadcrumb** — find:
```tsx
<PageShell icon={Microscope} title="Audit Trail" breadcrumb={["Audit Lab", "Audit Trail"]}>
```
Replace with:
```tsx
<PageShell icon={Microscope} title="Activity Log" breadcrumb={["Audit Lab", "Activity Log"]}>
```

**2. The `<h1>` page heading** — find (the exact heading text inside the h1):
```tsx
Audit Trail
```
(inside the `<h1>` element). Change that text to `Activity Log`.

**3. The manual inline breadcrumb** — find the `<span>` in the page's own breadcrumb render that reads:
```tsx
<span>AUDIT TRAIL</span>
```
Replace with:
```tsx
<span>ACTIVITY LOG</span>
```

**4. Any `<title>` or document title string** — search for `"Audit Trail"` in the file and rename any remaining occurrences to `"Activity Log"` that are specific to this page (not referencing the governance `/audit-trail` page).

- [ ] **Step 5.1.3: Build and verify**
```bash
cd frontend && npx next build 2>&1 | tail -10
```

- [ ] **Step 5.1.4: Commit**
```bash
git add frontend/src/components/layout/AppSidebar.tsx frontend/src/app/audit-lab/audit-trail/page.tsx
git commit -m "fix(nav): rename Audit Lab 'Audit Trail' to 'Activity Log' — remove naming collision with governance trail"
```

---

## Chunk 6: Final Validation Pass

- [ ] **Step 6.1: Full frontend build**
```bash
cd frontend && npx next build 2>&1 | tail -30
```
Expected: `✓ Compiled successfully`, all pages listed, no TS errors.

- [ ] **Step 6.2: TypeScript strict check**
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors on any audit-lab files.

- [ ] **Step 6.3: Spot-check routes in browser (if dev server available)**
```bash
cd frontend && npx next dev --port 3001
```
Visit:
- `/audit-lab/demo` — verify hero, charts, findings, trust rail, CTA
- `/audit-lab` — verify no BETA badge, guided empty state
- `/audit-lab/upload` — verify sample CSV button, dynamic dates, clean labels
- `/audit-lab/runs/{any_id}` — verify 5 KPIs, hash in header, Board Summary primary, Verification tab
- Sidebar — verify "Activity Log" label, no duplicate "Audit Trail"

- [ ] **Step 6.4: Final commit**
```bash
git add \
  frontend/src/lib/fixtures/audit-lab-demo.ts \
  frontend/src/app/audit-lab/demo/page.tsx \
  frontend/src/app/audit-lab/upload/page.tsx \
  frontend/src/app/audit-lab/page.tsx \
  "frontend/src/app/audit-lab/runs/[run_id]/page.tsx" \
  frontend/src/components/layout/AppSidebar.tsx \
  frontend/src/app/audit-lab/audit-trail/page.tsx
git commit -m "chore(audit-lab): validation pass — audit lab UX overhaul complete"
```

---

## Summary

| Chunk | Changes | Files |
|-------|---------|-------|
| 1 — Demo Rebuild | Hero, charts, findings, trust signals, CTA | `fixtures/audit-lab-demo.ts`, `demo/page.tsx` |
| 2 — Upload Flow | Sample CSV, dynamic dates, clean labels, hidden UUID, benchmark tooltip | `upload/page.tsx` |
| 3 — Hub Page | Remove BETA, guided empty state, meaningful run list | `audit-lab/page.tsx` |
| 4 — Run Detail | Export hierarchy, hash in header, findings expand, Verification tab, 5 KPIs | `runs/[run_id]/page.tsx` |
| 5 — Navigation | Rename Activity Log, remove collision | `AppSidebar.tsx`, `audit-trail/page.tsx` |
| 6 — Validation | Build + TS + smoke test | — |

Each chunk is independently shippable. Chunk 1 delivers the highest trust ROI.
