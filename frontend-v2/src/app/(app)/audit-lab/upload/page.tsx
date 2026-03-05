"use client";

import { Suspense, useRef, useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import PageHeader from "@/components/layout/PageHeader";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://hedgecore.onrender.com/api";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontHeading: "var(--font-heading,'Manrope',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  rim: "var(--border-rim,#E2E8F0)",
  soft: "var(--border-soft,#CBD5E1)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  accentRed: "var(--accent-red,#DC2626)",
  statusPass: "var(--status-pass,#059669)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

// Sample CSV content for download
const SAMPLE_CSV = `date,currency_pair,direction,notional,client_rate,tenor,counterparty,reference
2024-01-15,EURUSD,BUY,250000,1.0892,SPOT,HSBC,TXN-001
2024-01-17,GBPUSD,SELL,180000,1.2734,SPOT,Barclays,TXN-002
2024-01-22,EURUSD,BUY,320000,1.0876,1M,JPMorgan,TXN-003
2024-02-01,USDJPY,SELL,500000,148.72,SPOT,HSBC,TXN-004
2024-02-08,GBPEUR,BUY,150000,0.8542,SPOT,Deutsche,TXN-005
2024-02-14,EURUSD,BUY,275000,1.0815,3M,Barclays,TXN-006
2024-02-20,USDCHF,SELL,200000,0.8823,SPOT,UBS,TXN-007
2024-03-01,EURUSD,BUY,400000,1.0867,SPOT,JPMorgan,TXN-008
2024-03-12,GBPUSD,BUY,220000,1.2798,1M,HSBC,TXN-009
2024-03-18,USDJPY,BUY,600000,149.34,SPOT,Barclays,TXN-010
`;

const SAMPLE_COLUMNS = ["date", "currency_pair", "direction", "notional", "client_rate", "tenor", "counterparty", "reference"];

// Demo results for client-side fallback
const DEMO_RUN = {
  run_id: "demo-sample-run",
  status: "COMPLETED",
  markup_total_usd: 8420,
  total_fees_usd: 1230,
  unhedged_impact_usd: 14500,
  transaction_count: 10,
  dataset_id: "demo",
  findings: [
    { id: "1", type: "MARKUP", currency_pair: "EURUSD", counterparty: "HSBC", amount_usd: 2100, status: "CONFIRMED" },
    { id: "2", type: "MARKUP", currency_pair: "GBPUSD", counterparty: "Barclays", amount_usd: 1850, status: "CONFIRMED" },
    { id: "3", type: "FEE", currency_pair: "USDJPY", counterparty: "HSBC", amount_usd: 780, status: "CONFIRMED" },
    { id: "4", type: "MARKUP", currency_pair: "EURUSD", counterparty: "JPMorgan", amount_usd: 1640, status: "CONFIRMED" },
    { id: "5", type: "UNHEDGED_IMPACT", currency_pair: "GBPEUR", counterparty: "Deutsche", amount_usd: 3200, status: "ANALYTICAL" },
  ],
};

function downloadSampleCSV() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ordr_sample_fx_transactions.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSVPreview(text: string): { rowCount: number; columns: string[]; detectedPairs: string[] } {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return { rowCount: 0, columns: [], detectedPairs: [] };
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rowCount = lines.length - 1;
  const pairIdx = headers.findIndex((h) => h.includes("pair") || h.includes("currency"));
  const pairs = new Set<string>();
  if (pairIdx >= 0) {
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const v = cols[pairIdx]?.trim().toUpperCase();
      if (v && /^[A-Z]{6}$/.test(v)) pairs.add(v);
    }
  }
  return { rowCount, columns: headers, detectedPairs: Array.from(pairs) };
}

type Phase = "upload" | "configure" | "done";

function UploadWizardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuthStore();
  const initialDatasetId = searchParams.get("dataset_id");

  const [phase, setPhase] = useState<Phase>(initialDatasetId ? "configure" : "upload");
  const [step, setStep] = useState<1 | 2 | 3>(initialDatasetId ? 2 : 1);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<{ rowCount: number; columns: string[]; detectedPairs: string[] } | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configure state
  const [datasetId, setDatasetId] = useState<string>(initialDatasetId ?? "");
  const [benchmarkSource, setBenchmarkSource] = useState<"market" | "budget">("market");
  const [budgetRate, setBudgetRate] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (initialDatasetId) {
      setDatasetId(initialDatasetId);
    }
  }, [initialDatasetId]);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setUploadError(null);
    setShowFallback(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const p = parseCSVPreview(text);
      setPreview(p);
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith(".csv")) handleFile(f);
    },
    [handleFile]
  );

  const handleUpload = async () => {
    if (!file || !token) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (periodStart) formData.append("period_start", periodStart);
      if (periodEnd) formData.append("period_end", periodEnd);

      const res = await fetch(`${API_BASE}/v1/audit-lab/datasets/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setDatasetId(data.id ?? data.dataset_id);
      setStep(2);
      setPhase("configure");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
      setShowFallback(true);
    } finally {
      setUploading(false);
    }
  };

  const handleDemoRun = () => {
    // Store demo results in session and redirect
    sessionStorage.setItem("audit_demo_run", JSON.stringify(DEMO_RUN));
    router.push(`/audit-lab/runs/demo-sample-run`);
  };

  const handleRunAudit = async () => {
    if (!datasetId || !token) return;
    setRunning(true);
    setRunError(null);
    try {
      const payload: Record<string, unknown> = {
        dataset_id: datasetId,
        benchmark_source: benchmarkSource,
      };
      if (benchmarkSource === "budget" && budgetRate) {
        payload.budget_rate = parseFloat(budgetRate);
      }
      const data = await api.post<{ run_id: string }>("/v1/audit-lab/runs", payload);
      setStep(3);
      setPhase("done");
      router.push(`/audit-lab/runs/${data.run_id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start audit run";
      setRunError(msg);
    } finally {
      setRunning(false);
    }
  };

  // Step indicators
  const steps = [
    { n: 1, label: "Upload CSV" },
    { n: 2, label: "Configure" },
    { n: 3, label: "Done" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, fontFamily: S.fontUI }}>
      <PageHeader title="New Audit" subtitle="FX transaction cost analysis" />

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px 60px" }}>
        {/* Step progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
          {steps.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: step >= s.n ? S.accentCyan : S.bgPanel,
                    border: `2px solid ${step >= s.n ? S.accentCyan : S.soft}`,
                    color: step >= s.n ? "#fff" : S.textTertiary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    transition: "all 0.2s",
                  }}
                >
                  {step > s.n ? "✓" : s.n}
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    color: step >= s.n ? S.textPrimary : S.textTertiary,
                    marginTop: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.label}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: step > s.n ? S.accentCyan : S.rim,
                    margin: "0 4px",
                    marginBottom: 20,
                    transition: "background 0.2s",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* STEP 1: Upload */}
        {step === 1 && (
          <div>
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 12,
                padding: 28,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontFamily: S.fontHeading,
                  fontSize: 18,
                  fontWeight: 700,
                  color: S.textPrimary,
                  marginBottom: 6,
                }}
              >
                Upload FX Transaction Data
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, marginBottom: 20 }}>
                Upload a CSV export from your bank or treasury system.{" "}
                <button
                  onClick={downloadSampleCSV}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    fontWeight: 600,
                    color: S.accentCyan,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Download sample CSV
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? S.accentCyan : file ? S.statusPass : S.soft}`,
                  borderRadius: 10,
                  padding: "32px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "#EFF6FF" : file ? "#F0FDF4" : S.bgSub,
                  transition: "all 0.15s",
                  marginBottom: 16,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {!file ? (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 14, fontWeight: 600, color: S.textPrimary, marginBottom: 4 }}>
                      Drag & drop your CSV here
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                      or click to browse — .csv files only
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 14, fontWeight: 600, color: S.textPrimary, marginBottom: 3 }}>
                      {file.name}
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary }}>
                      {(file.size / 1024).toFixed(1)} KB
                      {preview && (
                        <> · {preview.rowCount.toLocaleString()} rows parsed · {preview.detectedPairs.length} pairs detected</>
                      )}
                    </div>
                    {preview && preview.detectedPairs.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 4 }}>
                        {preview.detectedPairs.map((p) => (
                          <span
                            key={p}
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              fontWeight: 600,
                              background: "#DBEAFE",
                              color: S.accentCyan,
                              padding: "2px 6px",
                              borderRadius: 3,
                            }}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginTop: 6 }}>
                      Click to change file
                    </div>
                  </>
                )}
              </div>

              {/* Period pickers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.07em",
                      color: S.textTertiary,
                      textTransform: "uppercase",
                      marginBottom: 5,
                    }}
                  >
                    Period Start
                  </label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    style={{
                      width: "100%",
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      color: S.textPrimary,
                      background: S.bgPanel,
                      border: `1px solid ${S.soft}`,
                      borderRadius: 6,
                      padding: "8px 10px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.07em",
                      color: S.textTertiary,
                      textTransform: "uppercase",
                      marginBottom: 5,
                    }}
                  >
                    Period End
                  </label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    style={{
                      width: "100%",
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      color: S.textPrimary,
                      background: S.bgPanel,
                      border: `1px solid ${S.soft}`,
                      borderRadius: 6,
                      padding: "8px 10px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Error state */}
              {uploadError && (
                <div
                  style={{
                    background: "#FEF2F2",
                    border: `1px solid #FECACA`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    marginBottom: 16,
                    fontFamily: S.fontUI,
                    fontSize: 13,
                    color: S.accentRed,
                  }}
                >
                  <strong>Upload failed:</strong> {uploadError}
                </div>
              )}

              {/* Fallback options */}
              {showFallback && (
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.07em",
                      color: S.textTertiary,
                      textTransform: "uppercase",
                      marginBottom: 10,
                    }}
                  >
                    Continue with
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {/* Option A: Manual column mapping */}
                    <div
                      style={{
                        background: S.bgSub,
                        border: `1px solid ${S.soft}`,
                        borderRadius: 8,
                        padding: "14px 14px",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: S.fontUI,
                          fontSize: 13,
                          fontWeight: 600,
                          color: S.textPrimary,
                          marginBottom: 6,
                        }}
                      >
                        Option A: Map columns manually
                      </div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary, marginBottom: 10 }}>
                        Match your file's columns to our expected fields.
                      </div>
                      {preview?.columns && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {["date", "currency_pair", "notional", "client_rate"].map((field) => (
                            <div key={field} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span
                                style={{
                                  fontFamily: S.fontMono,
                                  fontSize: 10,
                                  color: S.textTertiary,
                                  width: 88,
                                  flexShrink: 0,
                                }}
                              >
                                {field}
                              </span>
                              <select
                                value={columnMap[field] ?? ""}
                                onChange={(e) => setColumnMap((prev) => ({ ...prev, [field]: e.target.value }))}
                                style={{
                                  flex: 1,
                                  fontFamily: S.fontMono,
                                  fontSize: 10,
                                  color: S.textPrimary,
                                  background: S.bgPanel,
                                  border: `1px solid ${S.soft}`,
                                  borderRadius: 4,
                                  padding: "3px 6px",
                                }}
                              >
                                <option value="">— select —</option>
                                {preview.columns.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Option B: Demo */}
                    <div
                      style={{
                        background: "#FFFBEB",
                        border: `1px solid #FCD34D`,
                        borderRadius: 8,
                        padding: "14px 14px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: S.fontUI,
                            fontSize: 13,
                            fontWeight: 600,
                            color: S.textPrimary,
                            marginBottom: 6,
                          }}
                        >
                          Option B: Demo with sample data
                        </div>
                        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary, marginBottom: 12 }}>
                          See a real audit analysis using our pre-loaded sample FX transactions.
                        </div>
                      </div>
                      <button
                        onClick={handleDemoRun}
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          background: "#D97706",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "8px 12px",
                          cursor: "pointer",
                          width: "100%",
                        }}
                      >
                        📊 See Demo Audit →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload button */}
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                style={{
                  width: "100%",
                  fontFamily: S.fontMono,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  background: !file || uploading ? S.soft : S.accentCyan,
                  color: !file || uploading ? S.textTertiary : "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "13px 20px",
                  cursor: !file || uploading ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                }}
              >
                {uploading ? "Uploading…" : "Upload & Continue →"}
              </button>
            </div>

            {/* Trust signals */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 10,
                padding: "14px 18px",
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                justifyContent: "center",
              }}
            >
              {[
                "🔒 Bank-grade encryption",
                "⚡ Processed in memory",
                "🗑️ Auto-deletes in 30 days",
                "🚫 Never used to train models",
              ].map((t) => (
                <span
                  key={t}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    color: S.textSecondary,
                    letterSpacing: "0.03em",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: Configure & Run */}
        {step === 2 && (
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 12,
              padding: 28,
            }}
          >
            <div
              style={{
                fontFamily: S.fontHeading,
                fontSize: 18,
                fontWeight: 700,
                color: S.textPrimary,
                marginBottom: 6,
              }}
            >
              Configure Audit Analysis
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, marginBottom: 20 }}>
              Dataset ready. Choose your benchmark to compare client rates against.
            </div>

            {/* Dataset summary */}
            <div
              style={{
                background: S.bgSub,
                border: `1px solid ${S.rim}`,
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 20,
              }}
            >
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginBottom: 4 }}>
                DATASET
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textPrimary, fontWeight: 600 }}>
                {datasetId}
              </div>
              {preview && (
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary, marginTop: 3 }}>
                  {preview.rowCount} rows · {preview.detectedPairs.length} currency pairs
                </div>
              )}
            </div>

            {/* Benchmark source */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  color: S.textTertiary,
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Benchmark Source
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { v: "market", label: "Market Snapshot", desc: "Compare against live mid-market rates at time of trade" },
                  { v: "budget", label: "Budget Rate", desc: "Compare against your internal treasury budget rate" },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      background: benchmarkSource === opt.v ? "#EFF6FF" : S.bgSub,
                      border: `2px solid ${benchmarkSource === opt.v ? S.accentCyan : S.rim}`,
                      borderRadius: 8,
                      padding: "12px 14px",
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    <input
                      type="radio"
                      name="benchmark"
                      value={opt.v}
                      checked={benchmarkSource === opt.v}
                      onChange={() => setBenchmarkSource(opt.v as "market" | "budget")}
                      style={{ marginTop: 2, accentColor: S.accentCyan }}
                    />
                    <div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.textPrimary }}>
                        {opt.label}
                      </div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary }}>
                        {opt.desc}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Budget rate input */}
            {benchmarkSource === "budget" && (
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    color: S.textTertiary,
                    textTransform: "uppercase",
                    marginBottom: 5,
                  }}
                >
                  Budget Rate
                </label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="e.g. 1.0850"
                  value={budgetRate}
                  onChange={(e) => setBudgetRate(e.target.value)}
                  style={{
                    width: "100%",
                    fontFamily: S.fontMono,
                    fontSize: 14,
                    color: S.textPrimary,
                    background: S.bgPanel,
                    border: `1px solid ${S.soft}`,
                    borderRadius: 6,
                    padding: "10px 12px",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
            )}

            {runError && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: `1px solid #FECACA`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 16,
                  fontFamily: S.fontUI,
                  fontSize: 13,
                  color: S.accentRed,
                }}
              >
                <strong>Run failed:</strong> {runError}
              </div>
            )}

            <button
              onClick={handleRunAudit}
              disabled={running || !datasetId}
              style={{
                width: "100%",
                fontFamily: S.fontMono,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: running || !datasetId ? S.soft : S.accentCyan,
                color: running || !datasetId ? S.textTertiary : "#fff",
                border: "none",
                borderRadius: 8,
                padding: "13px 20px",
                cursor: running || !datasetId ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {running ? "Running analysis…" : "Run Audit Analysis →"}
            </button>
          </div>
        )}

        {/* STEP 3: Done */}
        {step === 3 && (
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 12,
              padding: "48px 28px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div
              style={{
                fontFamily: S.fontHeading,
                fontSize: 20,
                fontWeight: 700,
                color: S.textPrimary,
                marginBottom: 6,
              }}
            >
              Audit running…
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
              Redirecting to results…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "var(--bg-deep,#F8FAFC)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
            fontSize: 13,
            color: "var(--text-tertiary,#94A3B8)",
          }}
        >
          Loading…
        </div>
      }
    >
      <UploadWizardInner />
    </Suspense>
  );
}
