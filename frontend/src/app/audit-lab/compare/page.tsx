"use client";
/**
 * /audit-lab/compare
 * Audit Lab -- side-by-side run comparison with delta indicators.
 * URL: /audit-lab/compare?run_ids=a,b
 */

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { PageShell } from "@/components/layout/PageShell";
import { Microscope } from "lucide-react";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  green:     "var(--status-pass,#22c55e)",
  red:       "var(--accent-red,#f87171)",
} as const;

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function fmt(n: number | undefined | null) {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number | undefined | null) {
  if (n == null) return "\u2014";
  return `${n.toFixed(1)}%`;
}

function deltaIndicator(a: number | null, b: number | null, invert = false) {
  if (a == null || b == null) return null;
  const diff = b - a;
  if (Math.abs(diff) < 0.01) return { symbol: "\u2192", color: S.tertiary, diff: 0 };
  const up = diff > 0;
  // For costs, higher = bad (red). For quality, higher = good (green). invert flips this.
  const good = invert ? up : !up;
  return {
    symbol: up ? "\u2191" : "\u2193",
    color: good ? S.green : S.red,
    diff,
  };
}

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface RunSummary {
  run_id: string;
  created_at: string;
  status: string;
  methodology_version: string;
  summary: {
    total_markup_usd: number;
    total_fees_usd: number;
    total_loss_usd: number;
    data_quality_score: number;
  };
  markup_by_pair: Record<string, number>;
}

/* ── KPI Comparison Card ────────────────────────────────────────────────────── */

function CompareKpiCard({
  label, values, format, invert,
}: {
  label: string;
  values: (number | null)[];
  format: (n: number | null) => string;
  invert?: boolean;
}) {
  const delta = values.length >= 2 ? deltaIndicator(values[0], values[1], invert) : null;
  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "16px 20px" }}>
      <div style={{
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
        letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 10,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        {values.map((v, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
              color: S.tertiary, marginBottom: 2,
            }}>
              RUN {i + 1}
            </div>
            <div style={{
              fontFamily: S.fontMono, fontSize: 18, fontWeight: 700,
              color: S.primary, letterSpacing: "-0.02em",
            }}>
              {format(v)}
            </div>
          </div>
        ))}
      </div>
      {delta && (
        <div style={{
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
          color: delta.color, marginTop: 8,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <span style={{ fontSize: 14 }}>{delta.symbol}</span>
          {format === pct
            ? `${delta.diff > 0 ? "+" : ""}${delta.diff.toFixed(1)} pts`
            : fmt(Math.abs(delta.diff))
          }
        </div>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */

export default function AuditLabComparePage() {
  return (
    <Suspense>
      <AuditLabComparePageInner />
    </Suspense>
  );
}

function AuditLabComparePageInner() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const runIdsParam = searchParams.get("run_ids") ?? "";

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !runIdsParam) {
      setLoading(false);
      setError("No run_ids provided. URL format: /audit-lab/compare?run_ids=a,b");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardFetch(
        `/v1/audit-lab/compare?run_ids=${encodeURIComponent(runIdsParam)}`,
        token,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as Record<string, string>).detail ?? `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setRuns((data as { runs: RunSummary[] }).runs ?? data);
    } catch {
      setError("Failed to load comparison data.");
    } finally {
      setLoading(false);
    }
  }, [token, runIdsParam]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
        Loading comparison...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: S.bgDeep, padding: "32px 40px", fontFamily: S.fontUI }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 6 }}>
          <a href="/audit-lab" style={{ color: S.cyan, textDecoration: "none" }}>AUDIT LAB</a>
          {" / "}
          <span>COMPARE</span>
        </div>
        <div style={{
          background: `color-mix(in srgb, ${S.red} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.red} 30%, transparent)`,
          padding: "12px 16px", fontFamily: S.fontMono, fontSize: 12, color: S.red, marginTop: 16,
        }}>
          {error}
        </div>
      </div>
    );
  }

  if (runs.length < 2) {
    return (
      <div style={{ minHeight: "100vh", background: S.bgDeep, padding: "32px 40px", fontFamily: S.fontUI }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
          At least 2 runs are required for comparison.
        </div>
      </div>
    );
  }

  // Collect all unique currency pairs across runs
  const allPairs = Array.from(
    new Set(runs.flatMap(r => Object.keys(r.markup_by_pair ?? {})))
  ).sort();

  return (
    <PageShell icon={Microscope} title="Run Comparison" breadcrumb={["Audit Lab", "Compare"]}>
      <div style={{ fontFamily: S.fontUI }}>
      {/* Breadcrumb + header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
          letterSpacing: "0.1em", marginBottom: 6,
        }}>
          <a href="/audit-lab" style={{ color: S.cyan, textDecoration: "none" }}>AUDIT LAB</a>
          {" / "}
          <span>COMPARE</span>
        </div>
        <h1 style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary, margin: 0 }}>
          Run Comparison
        </h1>
        <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginTop: 6 }}>
          Comparing {runs.length} audit runs side-by-side.
        </div>
      </div>

      {/* Run identification strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${runs.length}, 1fr)`,
        gap: 12, marginBottom: 20,
      }}>
        {runs.map((r, i) => (
          <div key={r.run_id} style={{
            background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "12px 16px",
            borderTop: `2px solid ${i === 0 ? S.cyan : S.amber}`,
          }}>
            <div style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
              letterSpacing: "0.1em", color: i === 0 ? S.cyan : S.amber,
              textTransform: "uppercase", marginBottom: 4,
            }}>
              Run {i + 1}
            </div>
            <a
              href={`/audit-lab/runs/${r.run_id}`}
              style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, textDecoration: "none" }}
            >
              {r.run_id.slice(0, 12)}...
            </a>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 2 }}>
              v{r.methodology_version} {"\u00B7"} {new Date(r.created_at).toLocaleDateString()} {"\u00B7"} {r.status}
            </div>
          </div>
        ))}
      </div>

      {/* KPI comparison cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <CompareKpiCard
          label="Total Markup Cost"
          values={runs.map(r => r.summary.total_markup_usd)}
          format={fmt}
        />
        <CompareKpiCard
          label="Total Fees"
          values={runs.map(r => r.summary.total_fees_usd)}
          format={fmt}
        />
        <CompareKpiCard
          label="Total Quantified Cost"
          values={runs.map(r => r.summary.total_loss_usd)}
          format={fmt}
        />
        <CompareKpiCard
          label="Data Quality Score"
          values={runs.map(r => r.summary.data_quality_score)}
          format={pct}
          invert
        />
      </div>

      {/* Markup by pair comparison table */}
      {allPairs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.06em", color: S.primary,
            textTransform: "uppercase", marginBottom: 12,
          }}>
            Markup by Currency Pair
          </div>
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: S.bgSub }}>
                  <th style={{
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                    letterSpacing: "0.08em", color: S.tertiary, textAlign: "left",
                    padding: "10px 16px", borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase",
                  }}>
                    Currency Pair
                  </th>
                  {runs.map((r, i) => (
                    <th key={r.run_id} style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                      letterSpacing: "0.08em", color: i === 0 ? S.cyan : S.amber,
                      textAlign: "right", padding: "10px 16px",
                      borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase",
                    }}>
                      Run {i + 1}
                    </th>
                  ))}
                  {runs.length >= 2 && (
                    <th style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                      letterSpacing: "0.08em", color: S.tertiary, textAlign: "right",
                      padding: "10px 16px", borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase",
                    }}>
                      Delta
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {allPairs.map(pair => {
                  const vals = runs.map(r => r.markup_by_pair?.[pair] ?? null);
                  const delta = vals.length >= 2 && vals[0] != null && vals[1] != null
                    ? deltaIndicator(vals[0], vals[1])
                    : null;
                  return (
                    <tr key={pair} style={{ borderBottom: `1px solid ${S.soft}` }}>
                      <td style={{
                        padding: "10px 16px", fontFamily: S.fontMono,
                        fontSize: 12, color: S.primary, fontWeight: 600,
                      }}>
                        {pair}
                      </td>
                      {vals.map((v, i) => (
                        <td key={i} style={{
                          padding: "10px 16px", fontFamily: S.fontMono,
                          fontSize: 12, color: v != null && v > 0 ? S.red : S.primary,
                          fontWeight: 600, textAlign: "right",
                        }}>
                          {fmt(v)}
                        </td>
                      ))}
                      {runs.length >= 2 && (
                        <td style={{
                          padding: "10px 16px", fontFamily: S.fontMono,
                          fontSize: 12, fontWeight: 700, textAlign: "right",
                          color: delta?.color ?? S.tertiary,
                        }}>
                          {delta ? (
                            <span>
                              {delta.symbol} {fmt(Math.abs(delta.diff))}
                            </span>
                          ) : "\u2014"}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {allPairs.length === 0 && (
                  <tr>
                    <td
                      colSpan={runs.length + 2}
                      style={{
                        padding: "24px 16px", fontFamily: S.fontUI,
                        fontSize: 13, color: S.tertiary, textAlign: "center",
                      }}
                    >
                      No markup data by pair available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </PageShell>
  );
}
