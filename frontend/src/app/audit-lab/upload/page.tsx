"use client";
/**
 * /audit-lab/upload
 * Audit Lab — upload CSV + configure period + run analysis.
 */

import { useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        fontFamily: S.fontMono, fontSize: 12, color: S.primary,
        background: S.bgSub, border: `1px solid ${S.rim}`,
        padding: "8px 12px", width: "100%", outline: "none", borderRadius: 2,
        boxSizing: "border-box",
      }}
    />
  );
}

type Phase = "upload" | "run" | "done";

export default function AuditLabUploadPage() {
  return (
    <Suspense>
      <AuditLabUploadPageInner />
    </Suspense>
  );
}

function AuditLabUploadPageInner() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingDatasetId = searchParams.get("dataset_id");

  const [phase, setPhase] = useState<Phase>(existingDatasetId ? "run" : "upload");
  const [file, setFile] = useState<File | null>(null);
  const [periodStart, setPeriodStart] = useState("2025-01-01");
  const [periodEnd, setPeriodEnd] = useState("2025-12-31");
  const [benchmarkSource, setBenchmarkSource] = useState<"market_snapshot" | "budget_rate">("market_snapshot");
  const [budgetRate, setBudgetRate] = useState("");
  const [datasetId, setDatasetId] = useState<string>(existingDatasetId ?? "");
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [uploadResult, setUploadResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  const handleUpload = async () => {
    if (!file || !token) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("period_start", periodStart);
      form.append("period_end", periodEnd);

      const res = await fetch(`${API_BASE}/v1/audit-lab/datasets/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setError(`Duplicate dataset: SHA-256 ${(data as Record<string,string>).source_hash?.slice(0, 16)}… already exists.`);
        } else {
          setError((data as Record<string,string>).detail ?? "Upload failed.");
        }
        return;
      }
      setUploadResult(data as Record<string, unknown>);
      setDatasetId((data as Record<string,string>).dataset_id);
      setPhase("run");
    } catch (err) {
      setError("Network error during upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleRun = async () => {
    if (!datasetId || !token) return;
    setRunning(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        dataset_id: datasetId,
        benchmark_config: {
          benchmark_source: benchmarkSource,
          ...(benchmarkSource === "budget_rate" && budgetRate ? { budget_rate: parseFloat(budgetRate) } : {}),
        },
      };
      const res = await dashboardFetch("/v1/audit-lab/runs", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as Record<string,string>).detail ?? "Audit run failed.");
        return;
      }
      setPhase("done");
      router.push(`/audit-lab/runs/${(data as Record<string,string>).run_id}`);
    } catch {
      setError("Network error during audit run.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, padding: "32px 40px", fontFamily: S.fontUI }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 4 }}>
          <a href="/audit-lab" style={{ color: S.cyan, textDecoration: "none" }}>AUDIT LAB</a>
          {" / "}
          <span>UPLOAD</span>
        </div>
        <h1 style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.primary, margin: 0 }}>
          Upload FX Transaction Dataset
        </h1>
        <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginTop: 6 }}>
          CSV with columns: trade_date, currency_sold, currency_bought, amount_sold, amount_bought. Aliases supported.
        </p>
      </div>

      {/* Progress steps */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
        {(["upload", "run", "done"] as Phase[]).map((p, i) => (
          <div key={p} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: phase === p ? S.cyan : (["upload","run","done"].indexOf(phase) > i ? S.green : S.bgSub),
              border: `1px solid ${phase === p ? S.cyan : S.soft}`,
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
              color: phase === p ? S.bgPanel : (["upload","run","done"].indexOf(phase) > i ? S.bgPanel : S.tertiary),
            }}>{i + 1}</div>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: phase === p ? 700 : 400, color: phase === p ? S.primary : S.tertiary, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {p === "upload" ? "Upload CSV" : p === "run" ? "Configure & Run" : "Done"}
            </span>
            {i < 2 && <span style={{ color: S.soft, fontSize: 16 }}>›</span>}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 680 }}>
        {/* Error banner */}
        {error && (
          <div style={{ background: `color-mix(in srgb, ${S.red} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.red} 30%, transparent)`, padding: "10px 16px", marginBottom: 16, fontFamily: S.fontMono, fontSize: 11, color: S.red }}>
            {error}
          </div>
        )}

        {/* Phase 1: Upload */}
        {phase === "upload" && (
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <Label>CSV File</Label>
              <div
                ref={dropRef}
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => document.getElementById("file-input")?.click()}
                style={{
                  border: `2px dashed ${file ? S.cyan : S.rim}`, padding: "32px 24px",
                  textAlign: "center", cursor: "pointer", background: file ? `color-mix(in srgb, ${S.cyan} 4%, transparent)` : "transparent",
                  transition: "border-color 150ms, background 150ms",
                }}
              >
                <input
                  id="file-input"
                  type="file"
                  accept=".csv,.txt"
                  style={{ display: "none" }}
                  onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }}
                />
                {file ? (
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.cyan }}>{file.name}</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4 }}>
                      {(file.size / 1024).toFixed(1)} KB — click to change
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 14, color: S.secondary }}>Drag & drop CSV file here</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4 }}>or click to browse</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <Label>Period Start</Label>
                <Input value={periodStart} onChange={setPeriodStart} type="date" />
              </div>
              <div>
                <Label>Period End</Label>
                <Input value={periodEnd} onChange={setPeriodEnd} type="date" />
              </div>
            </div>

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                color: S.bgPanel, background: !file || uploading ? S.tertiary : S.cyan,
                border: "none", padding: "11px 24px", cursor: !file || uploading ? "not-allowed" : "pointer",
                borderRadius: 2, alignSelf: "flex-start",
              }}
            >
              {uploading ? "UPLOADING…" : "UPLOAD & PARSE"}
            </button>
          </div>
        )}

        {/* Phase 2: Configure & Run */}
        {phase === "run" && (
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
            {uploadResult && (
              <div style={{ background: `color-mix(in srgb, ${S.green} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${S.green} 25%, transparent)`, padding: "12px 16px" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.green, marginBottom: 4 }}>DATASET UPLOADED SUCCESSFULLY</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                  {(uploadResult as Record<string,number>).row_count} rows parsed · {((uploadResult as Record<string,string[]>).currency_pairs_detected ?? []).join(", ")}
                </div>
              </div>
            )}

            <div>
              <Label>Dataset ID</Label>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.cyan, padding: "8px 12px", background: S.bgSub, border: `1px solid ${S.soft}` }}>
                {datasetId}
              </div>
            </div>

            <div>
              <Label>Benchmark Source</Label>
              <div style={{ display: "flex", gap: 12 }}>
                {(["market_snapshot", "budget_rate"] as const).map(src => (
                  <button
                    key={src}
                    onClick={() => setBenchmarkSource(src)}
                    style={{
                      fontFamily: S.fontMono, fontSize: 11, fontWeight: benchmarkSource === src ? 700 : 400,
                      color: benchmarkSource === src ? S.bgPanel : S.secondary,
                      background: benchmarkSource === src ? S.cyan : "transparent",
                      border: `1px solid ${benchmarkSource === src ? S.cyan : S.rim}`,
                      padding: "6px 16px", cursor: "pointer", borderRadius: 2,
                    }}
                  >
                    {src === "market_snapshot" ? "Market Snapshot" : "Budget Rate"}
                  </button>
                ))}
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 6 }}>
                {benchmarkSource === "market_snapshot"
                  ? "Uses stored market snapshots as the benchmark mid-rate for markup calculation."
                  : "Uses a fixed budget rate as the reference baseline for unhedged impact."}
              </div>
            </div>

            {benchmarkSource === "budget_rate" && (
              <div>
                <Label>Budget Rate (CCY/USD)</Label>
                <Input value={budgetRate} onChange={setBudgetRate} placeholder="e.g. 0.060" />
              </div>
            )}

            <button
              onClick={handleRun}
              disabled={running}
              style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                color: S.bgPanel, background: running ? S.tertiary : S.cyan,
                border: "none", padding: "11px 24px", cursor: running ? "not-allowed" : "pointer",
                borderRadius: 2, alignSelf: "flex-start",
              }}
            >
              {running ? "RUNNING AUDIT…" : "RUN AUDIT ANALYSIS →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
