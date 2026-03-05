"use client";
/**
 * /audit-lab/runs/[run_id]
 * Audit Lab — run detail: summary cards + findings table + evidence hash rail.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

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

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function SevColor(sev: string) {
  if (sev === "HIGH") return S.red;
  if (sev === "MEDIUM") return S.amber;
  if (sev === "LOW") return S.green;
  return S.tertiary;
}

interface Summary {
  total_markup_usd: number;
  total_fees_usd: number;
  total_unhedged_impact_usd: number;
  total_loss_usd: number;
  data_quality_score: number;
  fee_confidence: string;
  markup_rejections_count: number;
}

interface Finding {
  id: string;
  finding_type: string;
  currency_pair: string | null;
  counterparty: string | null;
  amount_usd: number;
  severity: string;
  narrative: string;
  finding_hash: string;
  created_at: string;
}

interface RunDetail {
  run_id: string;
  dataset_id: string;
  methodology_version: string;
  run_hash: string;
  inputs_hash: string;
  outputs_hash: string;
  status: string;
  created_at: string;
  summary: Summary;
  findings: Finding[];
  markup_by_pair: Record<string, number>;
  markup_by_counterparty: Record<string, number>;
  markup_by_month: Record<string, number>;
  unhedged_results: Array<Record<string, unknown>>;
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "16px 20px" }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: 22, fontWeight: 700, color: color ?? S.primary, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function AuditRunDetailPage() {
  const { run_id } = useParams<{ run_id: string }>();
  const { token } = useAuth();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"findings" | "pairs" | "counterparties" | "evidence">("findings");

  const load = useCallback(async () => {
    if (!token || !run_id) return;
    setLoading(true);
    try {
      const res = await dashboardFetch(`/v1/audit-lab/runs/${run_id}`, token);
      if (!res.ok) { setError("Run not found."); return; }
      setRun(await res.json());
    } catch { setError("Failed to load run."); }
    finally { setLoading(false); }
  }, [token, run_id]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    if (!token || !run_id) return;
    setExporting(true);
    try {
      const res = await dashboardFetch(`/v1/audit-lab/runs/${run_id}/export`, token);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-evidence-binder-${run_id.slice(0, 8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally { setExporting(false); }
  };

  if (loading) return <div style={{ padding: 40, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Loading…</div>;
  if (error || !run) return <div style={{ padding: 40, fontFamily: S.fontMono, fontSize: 12, color: S.red }}>{error ?? "Run not found."}</div>;

  const s = run.summary;

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, padding: "28px 40px", fontFamily: S.fontUI }}>

      {/* Breadcrumb + header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 6 }}>
          <a href="/audit-lab" style={{ color: S.cyan, textDecoration: "none" }}>AUDIT LAB</a>
          {" / "}
          <span>RUN {run_id.slice(0, 12)}…</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary, margin: 0 }}>
              Audit Analysis Report
            </h1>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4 }}>
              v{run.methodology_version} · {new Date(run.created_at).toLocaleString()} · {run.status}
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
              color: S.primary, background: S.bgPanel,
              border: `1px solid ${S.rim}`, padding: "8px 16px", cursor: "pointer", borderRadius: 2,
            }}
          >
            {exporting ? "EXPORTING…" : "↓ EVIDENCE BINDER"}
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Total Markup Cost" value={fmt(s.total_markup_usd)} color={s.total_markup_usd > 0 ? S.red : S.primary} />
        <KpiCard label="Explicit Fees" value={fmt(s.total_fees_usd)} sub={`Confidence: ${s.fee_confidence}`} />
        <KpiCard label="Unhedged Variance" value={fmt(s.total_unhedged_impact_usd)} sub="Reference baseline — analytical what-if" color={S.amber} />
        <KpiCard label="Total Quantified Cost" value={fmt(s.total_loss_usd)} color={S.red} sub={`Data quality: ${s.data_quality_score?.toFixed(0)}%`} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 0, borderBottom: `1px solid ${S.rim}` }}>
        {(["findings", "pairs", "counterparties", "evidence"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              fontFamily: S.fontMono, fontSize: 11, fontWeight: activeTab === tab ? 700 : 400,
              color: activeTab === tab ? S.cyan : S.secondary,
              background: "transparent", border: "none",
              borderBottom: `2px solid ${activeTab === tab ? S.cyan : "transparent"}`,
              padding: "10px 20px", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            {tab === "findings" ? `Findings (${run.findings.length})` : tab === "pairs" ? "By Pair" : tab === "counterparties" ? "By Counterparty" : "Evidence Rail"}
          </button>
        ))}
      </div>

      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderTop: "none" }}>
        {/* Findings tab */}
        {activeTab === "findings" && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {["Type", "Pair", "Severity", "Amount (USD)", "Narrative"].map(h => (
                  <th key={h} style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, textAlign: "left", padding: "10px 16px", borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {run.findings.map(f => (
                <tr key={f.id} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 10, color: S.cyan }}>{f.finding_type}</td>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 10, color: S.primary }}>{f.currency_pair ?? "—"}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: SevColor(f.severity), background: `color-mix(in srgb, ${SevColor(f.severity)} 10%, transparent)`, padding: "2px 8px", borderRadius: 2 }}>
                      {f.severity}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: f.amount_usd > 0 ? S.red : S.green }}>{fmt(f.amount_usd)}</td>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontUI, fontSize: 11, color: S.secondary, maxWidth: 400 }}>{f.narrative}</td>
                </tr>
              ))}
              {run.findings.length === 0 && (
                <tr><td colSpan={5} style={{ padding: "24px 16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, textAlign: "center" }}>No findings.</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* By pair tab */}
        {activeTab === "pairs" && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: S.bgSub }}>
              {["Currency Pair", "Markup Cost (USD)"].map(h => <th key={h} style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, textAlign: "left", padding: "10px 16px", borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {Object.entries(run.markup_by_pair).sort(([, a], [, b]) => b - a).map(([pair, usd]) => (
                <tr key={pair} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.primary, fontWeight: 600 }}>{pair}</td>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 13, color: S.red, fontWeight: 700 }}>{fmt(usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* By counterparty tab */}
        {activeTab === "counterparties" && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: S.bgSub }}>
              {["Counterparty", "Markup Cost (USD)"].map(h => <th key={h} style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, textAlign: "left", padding: "10px 16px", borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {Object.entries(run.markup_by_counterparty).sort(([, a], [, b]) => b - a).map(([cp, usd]) => (
                <tr key={cp} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontUI, fontSize: 13, color: S.primary, fontWeight: 600 }}>{cp}</td>
                  <td style={{ padding: "10px 16px", fontFamily: S.fontMono, fontSize: 13, color: S.red, fontWeight: 700 }}>{fmt(usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Evidence rail tab */}
        {activeTab === "evidence" && (
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 4 }}>
              SHA-256 Evidence Chain
            </div>
            {[
              { label: "RUN HASH", value: run.run_hash, color: S.cyan },
              { label: "INPUTS HASH", value: run.inputs_hash, color: S.amber },
              { label: "OUTPUTS HASH", value: run.outputs_hash, color: S.green },
              { label: "DATASET ID", value: run.dataset_id, color: S.tertiary },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: S.bgSub, padding: "10px 14px", border: `1px solid ${S.soft}` }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color, marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, wordBreak: "break-all" }}>{value}</div>
              </div>
            ))}
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 4, padding: "8px 12px", background: `color-mix(in srgb, ${S.amber} 5%, transparent)`, border: `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)` }}>
              DISCLAIMER: Unhedged variance figures are reference-baseline analytical what-ifs. They are not factual loss claims. Markup and fee figures reflect computed transaction costs vs. market benchmark rates.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
