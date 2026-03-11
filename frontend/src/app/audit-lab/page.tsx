"use client";
/**
 * /audit-lab
 * Audit Lab — list of uploaded datasets and past runs.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { PageShell } from "@/components/layout/PageShell";
import { Microscope } from "lucide-react";

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

interface Dataset {
  id: string;
  period_start: string;
  period_end: string;
  source_filename: string;
  source_hash: string;
  row_count: number;
  currency_pairs: string[];
  created_at: string;
}

interface DecisionRun {
  run_id: string;
  run_hash: string;
  methodology_version: string;
  status: string;
  created_at: string;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
      color, background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding: "1px 6px", borderRadius: 2,
    }}>{label}</span>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
      color: S.tertiary, textTransform: "uppercase", paddingBottom: 8,
      borderBottom: `1px solid ${S.soft}`, marginBottom: 12,
    }}>{label}</div>
  );
}

export default function AuditLabPage() {
  const { token } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<DecisionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [dsRes, runRes] = await Promise.all([
        dashboardFetch("/v1/audit-lab/datasets", token),
        dashboardFetch("/v1/audit-lab/runs", token),
      ]);
      if (dsRes.ok) {
        const d = await dsRes.json();
        setDatasets(d.items ?? []);
      }
      if (runRes.ok) {
        const r = await runRes.json();
        setRuns(r.items ?? []);
      }
    } catch {
      setError("Failed to load Audit Lab data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return (
    <PageShell icon={Microscope} title="Audit Lab" breadcrumb={["Dashboard", "Audit Lab"]}>
      <div style={{ fontFamily: S.fontUI }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: S.tertiary }}>AUDIT LAB</span>
            <Badge label="BETA" color={S.amber} />
          </div>
          <h1 style={{ fontFamily: S.fontMono, fontSize: 22, fontWeight: 700, color: S.primary, margin: 0, letterSpacing: "-0.02em" }}>
            FX Transaction Audit
          </h1>
          <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginTop: 6, maxWidth: 560 }}>
            Upload historic FX transaction records to quantify bank markup costs, explicit fees, and unhedged FX variance. All analysis is deterministic and evidence-bound.
          </p>
        </div>
        <Link
          href="/audit-lab/upload"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
            color: S.bgPanel, background: S.cyan, border: "none",
            padding: "10px 20px", borderRadius: 3, textDecoration: "none",
            cursor: "pointer",
          }}
        >
          + UPLOAD DATASET
        </Link>
      </div>

      {loading ? (
        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Loading…</div>
      ) : error ? (
        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.red }}>{error}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

          {/* Datasets panel */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "20px 24px" }}>
            <SectionHeader label="Uploaded Datasets" />
            {datasets.length === 0 ? (
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, padding: "24px 0", textAlign: "center" }}>
                No datasets uploaded yet.{" "}
                <Link href="/audit-lab/upload" style={{ color: S.cyan, textDecoration: "none" }}>Upload one →</Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {datasets.map(ds => (
                  <div key={ds.id} style={{
                    border: `1px solid ${S.soft}`, padding: "12px 16px",
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                  }}>
                    <div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.primary, marginBottom: 3 }}>
                        {ds.source_filename}
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginBottom: 6 }}>
                        {ds.period_start} → {ds.period_end} · {ds.row_count} rows
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(ds.currency_pairs ?? []).map((p: string) => (
                          <Badge key={p} label={p} color={S.cyan} />
                        ))}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginBottom: 6 }}>
                        {new Date(ds.created_at).toLocaleDateString()}
                      </div>
                      <Link
                        href={`/audit-lab/upload?dataset_id=${ds.id}`}
                        style={{
                          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                          color: S.cyan, textDecoration: "none",
                          border: `1px solid color-mix(in srgb, var(--accent-cyan) 30%, transparent)`,
                          padding: "3px 10px", borderRadius: 2,
                        }}
                      >
                        RUN AUDIT →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Runs panel */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "20px 24px" }}>
            <SectionHeader label="Past Audit Runs" />
            {runs.length === 0 ? (
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, padding: "24px 0", textAlign: "center" }}>
                No audit runs yet. Upload a dataset and run an analysis.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {runs.map(run => (
                  <Link
                    key={run.run_id}
                    href={`/audit-lab/runs/${run.run_id}`}
                    style={{ textDecoration: "none" }}
                  >
                    <div style={{
                      border: `1px solid ${S.soft}`, padding: "12px 16px",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: "pointer", transition: "border-color 100ms",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = S.cyan}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = S.soft}
                    >
                      <div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, marginBottom: 3, fontWeight: 600 }}>
                          {run.run_id.slice(0, 16)}…
                        </div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                          v{run.methodology_version} · {new Date(run.created_at).toLocaleString()}
                        </div>
                      </div>
                      <Badge label={run.status} color={run.status === "COMPLETED" ? S.green : S.amber} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
      </div>
    </PageShell>
  );
}
