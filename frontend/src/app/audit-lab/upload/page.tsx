"use client";
/**
 * /audit-lab/upload
 * Audit Lab — upload CSV + configure period + run analysis.
 */

import { useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import dynamic from "next/dynamic";

import { PageShell } from "@/components/layout/PageShell";
import { Microscope } from "lucide-react";

const CsvPreview = dynamic(() => import("@/components/audit-lab/CsvPreview"), { ssr: false });

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
    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 6 }}>
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

/** Returns { start: "YYYY-01-01", end: "YYYY-12-31" } for the previous calendar year */
function lastYearPeriod() {
  const y = new Date().getFullYear() - 1;
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

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
  const defaultPeriod = lastYearPeriod();
  const [periodStart, setPeriodStart] = useState(defaultPeriod.start);
  const [periodEnd,   setPeriodEnd]   = useState(defaultPeriod.end);
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

      const res = await dashboardFetch("/v1/audit-lab/datasets/upload", token, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          // Dataset already exists — recover by advancing to run phase with the existing dataset_id
          const det = (data as Record<string, unknown>).detail as Record<string, string> | undefined;
          let existingId = det?.dataset_id;

          // Fallback: if backend didn't include dataset_id, look it up via GET /datasets by source_hash
          if (!existingId && det?.source_hash) {
            try {
              const listRes = await dashboardFetch("/v1/audit-lab/datasets", token);
              if (listRes.ok) {
                const listData = await listRes.json() as { items: Array<{ id: string; source_hash: string }> };
                const match = listData.items?.find(d => d.source_hash === det!.source_hash);
                existingId = match?.id;
              }
            } catch { /* ignore — fall through to error */ }
          }

          if (existingId) {
            setDatasetId(existingId);
            setUploadResult({ row_count: 0, currency_pairs_detected: [], _reused: true });
            setPhase("run");
            return;
          }
          setError(`Duplicate dataset: SHA-256 ${det?.source_hash?.slice(0, 16) ?? "?"}… already exists.`);
        } else {
          const det = (data as Record<string, unknown>).detail;
          setError(typeof det === "string" ? det : det != null ? JSON.stringify(det) : "Upload failed.");
        }
        return;
      }
      setUploadResult(data as Record<string, unknown>);
      setDatasetId((data as Record<string,string>).dataset_id);
      setPhase("run");
    } catch {
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
        const det = (data as Record<string, unknown>).detail;
        setError(typeof det === "string" ? det : det != null ? JSON.stringify(det) : "Audit run failed.");
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
    <PageShell icon={Microscope} title="Upload Dataset" breadcrumb={["Audit Lab","Upload"]}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 4 }}>
          <a href="/audit-lab" style={{ color: S.cyan, textDecoration: "none" }}>AUDIT LAB</a>
          {" / "}
          <span>UPLOAD</span>
        </div>
        <h1 style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.primary, margin: 0 }}>
          Upload FX Transaction Dataset
        </h1>
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
      </div>

      {/* Progress steps */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
        {(["upload", "run", "done"] as Phase[]).map((p, i) => (
          <div key={p} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: phase === p ? S.cyan : (["upload","run","done"].indexOf(phase) > i ? S.green : S.bgSub),
              border: `1px solid ${phase === p ? S.cyan : S.soft}`,
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
              color: phase === p ? S.bgPanel : (["upload","run","done"].indexOf(phase) > i ? S.bgPanel : S.tertiary),
            }}>{i + 1}</div>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: phase === p ? 700 : 400, color: phase === p ? S.primary : S.tertiary, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {p === "upload" ? "Upload File" : p === "run" ? "Configure" : "View Results"}
            </span>
            {i < 2 && <span style={{ color: S.soft, fontSize: 16 }}>›</span>}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 680 }}>
        {/* Error banner */}
        {error && (
          <div style={{ background: `color-mix(in srgb, ${S.red} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.red} 30%, transparent)`, padding: "10px 16px", marginBottom: 16, fontFamily: S.fontMono, fontSize: 12, color: S.red }}>
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
                  accept=".csv,.txt,.xlsx,.xls,.pdf"
                  style={{ display: "none" }}
                  onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }}
                />
                {file ? (
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.cyan }}>{file.name}</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 4 }}>
                      {(file.size / 1024).toFixed(1)} KB — click to change
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 14, color: S.secondary }}>Drag & drop CSV file here</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 4 }}>or click to browse</div>
                  </div>
                )}
              </div>
            </div>

            {/* CSV Preview — shown after file selection, before upload */}
            {file && file.name.toLowerCase().endsWith(".csv") && (
              <div>
                <Label>File Preview</Label>
                <CsvPreview file={file} />
              </div>
            )}

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
              {uploading ? "UPLOADING…" : "UPLOAD & CONTINUE →"}
            </button>
          </div>
        )}

        {/* Phase 2: Configure & Run */}
        {phase === "run" && (
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
            {uploadResult && (
              <div style={{ background: `color-mix(in srgb, ${S.green} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${S.green} 25%, transparent)`, padding: "12px 16px" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.green, marginBottom: 4 }}>DATASET UPLOADED SUCCESSFULLY</div>
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
              </div>
            )}

            {/* datasetId kept in state for the API call — not shown to user */}

            <div>
              <Label>Benchmark Source</Label>
              <div style={{ display: "flex", gap: 12 }}>
                {(["market_snapshot", "budget_rate"] as const).map(src => (
                  <button
                    key={src}
                    onClick={() => setBenchmarkSource(src)}
                    style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: benchmarkSource === src ? 700 : 400,
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
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 6, lineHeight: 1.6 }}>
                {benchmarkSource === "market_snapshot"
                  ? (
                      <>
                        <strong style={{ color: S.secondary }}>Recommended for most audits.</strong>{" "}
                        Compares each trade rate against the interbank mid-rate at time of trade. Best for quantifying bank markup cost.
                      </>
                    )
                  : "Compares your trade rates against a fixed rate you set. Best for FX budget variance analysis. You will be asked to enter the rate below."
                }
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
    </PageShell>
  );
}
