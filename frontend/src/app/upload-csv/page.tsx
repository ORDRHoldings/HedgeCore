"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import {
  importPositionsCsv,
  type ImportResult,
} from "@/api/positionClient";
import HelpPanel from "@/components/layout/HelpPanel";
import { UPLOAD_CSV_HELP } from "@/lib/helpContent";

type ImportStatus = "idle" | "uploading" | "parsing" | "validating" | "committing" | "complete" | "error";

interface ImportResultWrapper {
  id: string;
  status: "COMPLETED" | "FAILED";
  total_rows: number;
  created_ok: number;
  error_count: number;
  started_at: string;
  completed_at: string | null;
  source_hash: string | null;
  errors: { row_number: number | null; field_name: string | null; error_message: string }[];
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        "var(--bg-deep)",
  panel:     "var(--bg-panel)",
  sub:       "var(--bg-sub)",
  border:    "var(--border-rim)",
  borderSoft:"var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red)",
  green:     "var(--status-pass)",
  fontUI:    "'IBM Plex Sans', sans-serif",
  fontMono:  "'IBM Plex Mono', monospace",
} as const;

const COLUMNS = [
  { name: "record_id",   type: "STRING",   format: "TXN-001",           req: true,  desc: "Unique position identifier. Max 64 chars. Duplicate IDs will be rejected." },
  { name: "entity",      type: "STRING",   format: "CORP-MX",           req: true,  desc: "Legal entity code. Must match registered entities in the system." },
  { name: "flow_type",   type: "ENUM",     format: "AR | AP",           req: true,  desc: "Accounts Receivable (inflow) or Accounts Payable (outflow)." },
  { name: "currency",    type: "ISO 4217", format: "USD, EUR",          req: true,  desc: "3-letter ISO currency code. 27 currencies supported." },
  { name: "amount",      type: "DECIMAL",  format: "150000.00",         req: true,  desc: "Positive decimal. No currency symbols or commas." },
  { name: "value_date",  type: "DATE",     format: "YYYY-MM-DD",        req: true,  desc: "Settlement/maturity date. Must be a future date." },
  { name: "description", type: "STRING",   format: "Free text",         req: false, desc: "Optional trade description. Max 255 characters." },
  { name: "status",      type: "ENUM",     format: "CONFIRMED|FORECAST",req: false, desc: "Defaults to CONFIRMED if omitted." },
];

const QUALITY_RULES = [
  { id: "R1", rule: "No duplicate record_id within the same import batch" },
  { id: "R2", rule: "amount must be > 0 (absolute value; sign derived from flow_type)" },
  { id: "R3", rule: "value_date must conform to ISO 8601 format (YYYY-MM-DD)" },
  { id: "R4", rule: "currency must be one of 27 supported ISO 4217 codes" },
  { id: "R5", rule: 'flow_type must be exactly "AR" or "AP" (case-insensitive)' },
  { id: "R6", rule: "Empty rows are skipped automatically — no error raised" },
  { id: "R7", rule: "Maximum 5,000 rows per file per import run" },
  { id: "R8", rule: "UTF-8 encoding required — BOM-prefixed files accepted" },
];

const CURRENCIES = ["USD","EUR","GBP","JPY","CHF","CAD","AUD","NZD","MXN","BRL","CLP","COP","ARS","PEN","CZK","HUF","PLN","RON","SEK","NOK","DKK","SGD","HKD","KRW","ZAR","INR","CNY"];

const STAGES: ImportStatus[] = ["uploading","parsing","validating","committing"];

export default function UploadCsvPage() {
  const _planAllowed = usePlanRedirect("professional");
  if (!_planAllowed) return null;
  const router = useRouter();
  const { user, token, isAuthenticated } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile]   = useState<File | null>(null);
  const [isDragOver,   setIsDragOver]     = useState(false);
  const [importStatus, setImportStatus]   = useState<ImportStatus>("idle");
  const [runResult,    setRunResult]      = useState<ImportResultWrapper | null>(null);
  const [errorMessage, setErrorMessage]   = useState<string | null>(null);
  const [showErrors,   setShowErrors]     = useState(false);
  const [clockStr,     setClockStr]       = useState("");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClockStr(d.toISOString().replace("T"," ").slice(0,19) + " UTC");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
  const handleDrop      = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    if (e.dataTransfer.files?.length) validateAndSetFile(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) validateAndSetFile(e.target.files[0]);
  };

  const validateAndSetFile = (file: File) => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (ext !== ".csv") { setErrorMessage("Invalid file type. Please upload CSV files only (.csv). XLSX support coming soon."); return; }
    if (file.size > 50 * 1024 * 1024) { setErrorMessage("File size exceeds 50 MB limit."); return; }
    setSelectedFile(file); setErrorMessage(null); setRunResult(null); setImportStatus("idle");
  };

  const handleClearFile = () => {
    setSelectedFile(null); setErrorMessage(null); setRunResult(null); setImportStatus("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    if (!selectedFile || !token) return;
    try {
      setImportStatus("uploading"); setErrorMessage(null);
      const ext = "." + selectedFile.name.split(".").pop()?.toLowerCase();
      if (ext !== ".csv") { setErrorMessage("XLSX import coming soon. Please use CSV format."); setImportStatus("error"); return; }
      await new Promise(r => setTimeout(r, 400)); setImportStatus("parsing");
      const startTime = new Date().toISOString();
      const result: ImportResult = await importPositionsCsv(selectedFile, token);
      await new Promise(r => setTimeout(r, 300)); setImportStatus("validating");
      await new Promise(r => setTimeout(r, 300)); setImportStatus("committing");
      setRunResult({
        id: `import-${Date.now()}`,
        status: "COMPLETED",
        total_rows: result.total_rows,
        created_ok: result.created,
        error_count: result.errors.length,
        started_at: startTime,
        completed_at: new Date().toISOString(),
        source_hash: null,
        errors: result.errors.map(e => ({ row_number: e.row, field_name: null, error_message: e.error })),
      });
      setImportStatus("complete");
    } catch (error: any) {
      setImportStatus("error");
      setErrorMessage(error.response?.data?.detail || error.message || "Import failed. Please try again.");
    }
  };

  const handleDownloadTemplate = (fmt: "csv" | "xlsx") => {
    if (fmt === "xlsx") { alert("XLSX template requires xlsx library. Using CSV."); }
    const csv = [
      "record_id,entity,flow_type,currency,amount,value_date,description,status",
      "TXN-001,CORP-MX,AR,USD,150000.00,2026-03-15,Q1 Receivable from US Client,CONFIRMED",
      "TXN-002,CORP-UK,AP,EUR,85000.00,2026-04-01,Supplier payment EUR zone,CONFIRMED",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "ordr_position_import_template.csv";
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const formatFileSize = (b: number) => b < 1024 ? b + " B" : b < 1024*1024 ? (b/1024).toFixed(1) + " KB" : (b/(1024*1024)).toFixed(2) + " MB";
  const formatDuration = (start: string, end: string | null) => {
    if (!end) return "—";
    const d = new Date(end).getTime() - new Date(start).getTime();
    return d < 1000 ? d + "ms" : (d/1000).toFixed(2) + "s";
  };
  const copyToClipboard = (t: string) => navigator.clipboard.writeText(t);

  const getStatusColor = () => runResult
    ? (runResult.error_count === 0 ? T.green : T.amber)
    : T.cyan;

  const isProcessing = importStatus !== "idle" && importStatus !== "complete" && importStatus !== "error";

  if (!isAuthenticated) return null;

  return (
    <>
    <style>{`
      @keyframes csvSpin { to { transform: rotate(360deg); } }
      @keyframes csvPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
      @keyframes csvSlideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      .csv-row-hover:hover { background: var(--bg-sub) !important; }
      .csv-btn-ghost:hover { border-color: var(--accent-cyan) !important; color: var(--accent-cyan) !important; }
      .csv-btn-red:hover { border-color: var(--accent-red) !important; color: var(--accent-red) !important; }
      .csv-cur:hover { background: var(--bg-deep) !important; border-color: var(--accent-cyan) !important; color: var(--accent-cyan) !important; }
    `}</style>

    <div style={{ display: "flex", minHeight: "100vh", background: T.bg }}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", fontFamily: T.fontUI, color: T.primary }}>

      {/* ══ PAGE HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{
        background: T.panel,
        borderBottom: `1px solid ${T.border}`,
        boxShadow: `0 2px 0 0 ${T.cyan}`,
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
          {/* Left */}
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <button
              onClick={() => router.push("/input")}
              className="csv-btn-ghost"
              style={{
                background: "transparent", border: `1px solid ${T.border}`, color: T.secondary,
                padding: "6px 14px", borderRadius: 3, cursor: "pointer",
                fontFamily: T.fontMono, fontSize: 10, fontWeight: 500, letterSpacing: "0.08em",
                transition: "all 0.15s",
              }}
            >
              ← BACK
            </button>
            <div style={{ width: 1, height: 20, background: T.border }} />
            <div>
              <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.tertiary, letterSpacing: "0.12em", marginBottom: 2 }}>
                POSITION DESK › BULK IMPORT
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: T.primary }}>
                CSV POSITION IMPORT
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {/* Status badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}`, display: "inline-block" }} />
              <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.tertiary, letterSpacing: "0.10em" }}>ENGINE READY</span>
            </div>
            <div style={{ width: 1, height: 20, background: T.border }} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.tertiary, letterSpacing: "0.08em" }}>{clockStr}</div>
              <div style={{ fontFamily: T.fontMono, fontSize: 9, color: T.cyan, letterSpacing: "0.10em", marginTop: 2 }}>
                {user?.full_name ?? user?.email ?? "OPERATOR"} · {user?.company?.name ?? "ORDR TERMINAL"}
              </div>
            </div>
          </div>
        </div>

        {/* Progress pipeline bar — shown during import */}
        {isProcessing && (
          <div style={{ background: T.sub, borderTop: `1px solid ${T.border}`, padding: "0 32px", height: 32, display: "flex", alignItems: "center", gap: 0 }}>
            {STAGES.map((s, i) => {
              const active = importStatus === s;
              const done = STAGES.indexOf(importStatus) > i;
              return (
                <div key={s} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "0 16px", height: 32,
                    borderBottom: active ? `2px solid ${T.cyan}` : done ? `2px solid ${T.green}` : "2px solid transparent",
                  }}>
                    {done && <span style={{ color: T.green, fontSize: 10 }}>✓</span>}
                    {active && <span style={{ width: 8, height: 8, border: `1.5px solid ${T.cyan}`, borderTopColor: "transparent", borderRadius: "50%", animation: "csvSpin 0.7s linear infinite", display: "inline-block" }} />}
                    <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", color: active ? T.cyan : done ? T.green : T.tertiary, animation: active ? "csvPulse 1.5s ease-in-out infinite" : "none" }}>
                      {s.toUpperCase()}
                    </span>
                  </div>
                  {i < STAGES.length - 1 && <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.tertiary, padding: "0 4px" }}>›</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ MAIN CONTENT — 3-COLUMN FULL WIDTH ══════════════════════════════════ */}
      <div style={{ flex: 1, padding: "28px 32px 40px", display: "grid", gridTemplateColumns: "1fr 1fr 320px", gap: 24, alignItems: "start" }}>

        {/* ── COL 1: Upload + Controls ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── DROP ZONE ── */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            {/* Card header */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.tertiary, letterSpacing: "0.14em" }}>FILE UPLOAD</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.tertiary, letterSpacing: "0.08em" }}>CSV · MAX 50 MB · UTF-8</span>
            </div>

            <div style={{ padding: 20 }}>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} style={{ display: "none" }} />

              {!selectedFile ? (
                <div
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    minHeight: 260,
                    border: `2px dashed ${isDragOver ? T.cyan : T.border}`,
                    borderRadius: 3,
                    background: isDragOver ? "rgba(0,255,255,0.03)" : T.bg,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", transition: "all 0.2s", gap: 16,
                  }}
                >
                  {/* Upload icon */}
                  <div style={{ position: "relative" }}>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={isDragOver ? T.cyan : T.tertiary} strokeWidth="1" style={{ transition: "stroke 0.2s" }}>
                      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                      <path d="M12 12v9" />
                      <path d="m16 16-4-4-4 4" />
                    </svg>
                    {isDragOver && (
                      <div style={{ position: "absolute", inset: -12, borderRadius: "50%", background: `rgba(0,255,255,0.06)`, animation: "csvPulse 1s ease-in-out infinite" }} />
                    )}
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: isDragOver ? T.cyan : T.primary, letterSpacing: "0.08em", marginBottom: 8 }}>
                      {isDragOver ? "RELEASE TO UPLOAD" : "DROP FILE HERE OR CLICK TO SELECT"}
                    </div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary, letterSpacing: "0.06em" }}>
                      Accepted: .csv only (XLSX coming soon)
                    </div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary, letterSpacing: "0.06em", marginTop: 4 }}>
                      Maximum 50 MB · Maximum 5,000 rows
                    </div>
                  </div>

                  {/* Or divider */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, width: "60%" }}>
                    <div style={{ flex: 1, height: 1, background: T.border }} />
                    <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.tertiary, letterSpacing: "0.1em" }}>OR</span>
                    <div style={{ flex: 1, height: 1, background: T.border }} />
                  </div>

                  <div style={{
                    padding: "10px 24px", background: "transparent",
                    border: `1px solid ${T.border}`, borderRadius: 3,
                    fontFamily: T.fontMono, fontSize: 10, fontWeight: 600,
                    color: T.secondary, letterSpacing: "0.10em",
                  }}>
                    BROWSE FILES
                  </div>
                </div>
              ) : (
                /* ── File selected card ── */
                <div style={{ animation: "csvSlideIn 0.25s ease" }}>
                  {/* File info row */}
                  <div style={{
                    padding: "16px 20px", background: T.sub, borderRadius: 3,
                    border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      {/* CSV badge */}
                      <div style={{
                        width: 48, height: 56, background: T.bg, border: `1px solid ${T.border}`,
                        borderRadius: 4, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                        position: "relative", overflow: "hidden",
                      }}>
                        <div style={{ position: "absolute", top: 0, right: 0, width: 0, height: 0, borderTop: "12px solid var(--bg-deep)", borderLeft: "12px solid var(--border-rim)" }} />
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.cyan} strokeWidth="1.5">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="8" y1="13" x2="16" y2="13" />
                          <line x1="8" y1="17" x2="16" y2="17" />
                        </svg>
                        <span style={{ fontFamily: T.fontMono, fontSize: 7, fontWeight: 700, color: T.cyan, letterSpacing: "0.1em" }}>CSV</span>
                      </div>

                      <div>
                        <div style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, color: T.primary, marginBottom: 4, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {selectedFile.name}
                        </div>
                        <div style={{ display: "flex", gap: 16 }}>
                          <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary }}>{formatFileSize(selectedFile.size)}</span>
                          <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary }}>UTF-8</span>
                          <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.green }}>✓ FORMAT OK</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleClearFile}
                      className="csv-btn-red"
                      style={{
                        background: "transparent", border: `1px solid ${T.border}`, color: T.secondary,
                        padding: "6px 12px", borderRadius: 3, cursor: "pointer",
                        fontFamily: T.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                        transition: "all 0.15s",
                      }}
                    >
                      × CLEAR
                    </button>
                  </div>

                  {/* Pre-flight checklist */}
                  <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: "14px 16px" }}>
                    <div style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.tertiary, letterSpacing: "0.14em", marginBottom: 12 }}>PRE-FLIGHT CHECKS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { label: "File format", value: ".csv", pass: true },
                        { label: "File size", value: formatFileSize(selectedFile.size), pass: selectedFile.size < 50*1024*1024 },
                        { label: "Encoding", value: "UTF-8 (assumed)", pass: true },
                        { label: "Column headers", value: "PENDING VALIDATION", pass: null },
                      ].map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                            background: c.pass === null ? T.sub : c.pass ? T.green : T.red,
                            border: c.pass === null ? `1px solid ${T.border}` : "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9, color: c.pass === null ? T.tertiary : "var(--bg-deep)",
                            fontWeight: 700,
                          }}>
                            {c.pass === null ? "?" : c.pass ? "✓" : "✗"}
                          </div>
                          <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.secondary, flex: 1 }}>{c.label}</span>
                          <span style={{
                            fontFamily: T.fontMono, fontSize: 10,
                            color: c.pass === null ? T.amber : c.pass ? T.green : T.red,
                            fontWeight: 600,
                          }}>{c.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(255,68,68,0.06)", border: `1px solid ${T.red}`, borderRadius: 3, fontFamily: T.fontMono, fontSize: 10, color: T.red, letterSpacing: "0.04em" }}>
                  ✕ {errorMessage}
                </div>
              )}
            </div>
          </div>

          {/* ── IMPORT BUTTON ── */}
          {selectedFile && importStatus !== "complete" && (
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4, overflow: "hidden", animation: "csvSlideIn 0.25s ease" }}>
              <button
                onClick={handleImport}
                disabled={isProcessing}
                style={{
                  width: "100%", padding: "18px 24px",
                  background: isProcessing ? T.sub : T.cyan,
                  border: "none", cursor: isProcessing ? "wait" : "pointer",
                  fontFamily: T.fontMono, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.12em", color: isProcessing ? T.secondary : "var(--bg-deep)",
                  transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                }}
                onMouseEnter={e => { if (!isProcessing) e.currentTarget.style.opacity = "0.9"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                {isProcessing ? (
                  <>
                    <span style={{ width: 13, height: 13, border: `2px solid ${T.tertiary}`, borderTopColor: T.secondary, borderRadius: "50%", animation: "csvSpin 0.7s linear infinite", display: "inline-block" }} />
                    PROCESSING…
                  </>
                ) : importStatus === "error" ? (
                  "✕ IMPORT FAILED — RETRY"
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    VALIDATE & IMPORT TO LEDGER
                  </>
                )}
              </button>

              {importStatus === "error" && (
                <div style={{ padding: "10px 20px", background: "rgba(255,68,68,0.05)", borderTop: `1px solid ${T.red}`, fontFamily: T.fontMono, fontSize: 9, color: T.red, letterSpacing: "0.06em" }}>
                  IMPORT FAILED — {errorMessage}
                </div>
              )}
            </div>
          )}

          {/* ── RESULT CARD ── */}
          {runResult && importStatus === "complete" && (
            <div style={{ background: T.panel, border: `2px solid ${getStatusColor()}`, borderRadius: 4, overflow: "hidden", animation: "csvSlideIn 0.3s ease" }}>
              {/* Result header */}
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: getStatusColor(), boxShadow: `0 0 8px ${getStatusColor()}` }} />
                  <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: T.primary, letterSpacing: "0.08em" }}>
                    IMPORT COMPLETE
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.tertiary }}>RUN·{runResult.id.slice(-8).toUpperCase()}</span>
                </div>
                <span style={{ fontFamily: T.fontMono, fontSize: 9, padding: "3px 8px", borderRadius: 2, background: getStatusColor(), color: "var(--bg-deep)", fontWeight: 700, letterSpacing: "0.08em" }}>
                  {runResult.error_count === 0 ? "CLEAN" : "WITH ERRORS"}
                </span>
              </div>

              {/* KPI grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, borderBottom: `1px solid ${T.border}` }}>
                {[
                  { label: "TOTAL ROWS", value: runResult.total_rows, color: T.primary },
                  { label: "ROWS CREATED", value: runResult.created_ok, color: T.green },
                  { label: "ERRORS", value: runResult.error_count, color: runResult.error_count > 0 ? T.red : T.tertiary },
                  { label: "DURATION", value: formatDuration(runResult.started_at, runResult.completed_at), color: T.primary },
                ].map((k, i) => (
                  <div key={i} style={{ padding: "18px 20px", borderRight: i < 3 ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ fontFamily: T.fontMono, fontSize: 8, color: T.tertiary, letterSpacing: "0.14em", marginBottom: 8 }}>{k.label}</div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* Source hash */}
              {runResult.source_hash && (
                <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 8, color: T.tertiary, letterSpacing: "0.14em", marginBottom: 4 }}>SHA-256 SOURCE HASH</div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.secondary, wordBreak: "break-all" }}>{runResult.source_hash}</div>
                  </div>
                  <button onClick={() => copyToClipboard(runResult.source_hash ?? "")}
                    className="csv-btn-ghost"
                    style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.tertiary, padding: "4px 10px", borderRadius: 2, cursor: "pointer", fontFamily: T.fontMono, fontSize: 9, flexShrink: 0, transition: "all 0.15s" }}>
                    COPY
                  </button>
                </div>
              )}

              {/* Errors collapsible */}
              {runResult.errors.length > 0 && (
                <div style={{ borderBottom: `1px solid ${T.border}` }}>
                  <button onClick={() => setShowErrors(!showErrors)}
                    style={{ width: "100%", padding: "10px 20px", background: "rgba(255,68,68,0.04)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.red, letterSpacing: "0.12em" }}>
                      {runResult.errors.length} VALIDATION ERROR{runResult.errors.length !== 1 ? "S" : ""}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.red }}>{showErrors ? "▼" : "►"}</span>
                  </button>
                  {showErrors && (
                    <div style={{ maxHeight: 240, overflowY: "auto", padding: "0 20px 12px" }}>
                      {runResult.errors.map((err, i) => (
                        <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${T.borderSoft}`, display: "flex", gap: 12 }}>
                          <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.red, flexShrink: 0 }}>ROW {err.row_number ?? "?"}</span>
                          <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.secondary }}>{err.error_message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div style={{ padding: "14px 20px", display: "flex", gap: 12 }}>
                <button onClick={() => router.push("/import-history")}
                  className="csv-btn-ghost"
                  style={{ flex: 1, background: "transparent", border: `1px solid ${T.border}`, color: T.secondary, padding: "10px", borderRadius: 3, cursor: "pointer", fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", transition: "all 0.15s" }}>
                  VIEW IMPORT HISTORY →
                </button>
                <button onClick={handleClearFile}
                  style={{ flex: 1, background: T.cyan, border: "none", color: "var(--bg-deep)", padding: "10px", borderRadius: 3, cursor: "pointer", fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em" }}>
                  IMPORT ANOTHER FILE
                </button>
              </div>
            </div>
          )}

          {/* ── AUDIT TRAIL NOTE ── */}
          <div style={{ padding: "14px 18px", background: "rgba(0,255,255,0.04)", border: `1px solid rgba(0,255,255,0.18)`, borderLeft: `3px solid ${T.cyan}`, borderRadius: 3 }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.cyan, letterSpacing: "0.12em", marginBottom: 6 }}>WORM AUDIT TRAIL</div>
            <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.secondary, lineHeight: 1.7 }}>
              Every import is recorded as an immutable ConnectorRun with SHA-256 file hash, operator identity, and row-level audit entries — fully traceable in Import History and Governance › Audit Trail.
            </div>
          </div>
        </div>

        {/* ── COL 2: Schema Reference ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── REQUIRED COLUMNS TABLE ── */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.tertiary, letterSpacing: "0.14em" }}>SCHEMA — REQUIRED COLUMNS</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.tertiary }}>8 FIELDS · 6 REQUIRED</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.fontMono, fontSize: 10 }}>
              <thead>
                <tr style={{ background: T.sub }}>
                  {["COLUMN","TYPE","FORMAT","REQ","DESCRIPTION"].map((h, i) => (
                    <th key={h} style={{ padding: "9px 12px", textAlign: i===3?"center":"left", fontSize: 8, fontWeight: 700, color: T.tertiary, letterSpacing: "0.12em", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COLUMNS.map((row, i) => (
                  <tr key={row.name} className="csv-row-hover" style={{ borderBottom: `1px solid ${T.borderSoft}`, transition: "background 0.1s" }}>
                    <td style={{ padding: "11px 12px", color: T.cyan, fontWeight: 600, whiteSpace: "nowrap" }}>{row.name}</td>
                    <td style={{ padding: "11px 12px" }}>
                      <span style={{ background: T.sub, color: T.secondary, padding: "2px 7px", borderRadius: 2, fontSize: 9, letterSpacing: "0.06em" }}>{row.type}</span>
                    </td>
                    <td style={{ padding: "11px 12px", color: T.tertiary, whiteSpace: "nowrap" }}>{row.format}</td>
                    <td style={{ padding: "11px 12px", textAlign: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 9, color: row.req ? T.red : T.tertiary, letterSpacing: "0.08em" }}>{row.req ? "YES" : "NO"}</span>
                    </td>
                    <td style={{ padding: "11px 12px", color: T.secondary, lineHeight: 1.5, fontSize: 10 }}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── DATA QUALITY RULES ── */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.tertiary, letterSpacing: "0.14em" }}>DATA QUALITY RULES</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.tertiary }}>R1–R8</span>
            </div>
            <div style={{ padding: "4px 0" }}>
              {QUALITY_RULES.map((r, i) => (
                <div key={r.id} className="csv-row-hover"
                  style={{ padding: "11px 20px", borderBottom: i < QUALITY_RULES.length-1 ? `1px solid ${T.borderSoft}` : "none", display: "flex", gap: 14, alignItems: "flex-start", transition: "background 0.1s" }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 8, fontWeight: 700, color: T.cyan, letterSpacing: "0.1em", paddingTop: 1, flexShrink: 0 }}>{r.id}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.secondary, lineHeight: 1.6 }}>{r.rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── SAMPLE DATA ── */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.tertiary, letterSpacing: "0.14em" }}>SAMPLE CSV ROW</span>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: "12px 14px", fontFamily: T.fontMono, fontSize: 10, color: T.secondary, lineHeight: 2, overflowX: "auto" }}>
                <div style={{ color: T.tertiary, fontSize: 9, marginBottom: 6 }}># HEADER ROW</div>
                <div style={{ color: T.cyan, fontSize: 9 }}>record_id,entity,flow_type,currency,amount,value_date,description,status</div>
                <div style={{ color: T.tertiary, fontSize: 9, marginTop: 8, marginBottom: 4 }}># DATA ROW</div>
                <div>
                  <span style={{ color: T.primary }}>TXN-001</span>
                  <span style={{ color: T.tertiary }}>,</span>
                  <span style={{ color: T.primary }}>CORP-MX</span>
                  <span style={{ color: T.tertiary }}>,</span>
                  <span style={{ color: T.amber }}>AR</span>
                  <span style={{ color: T.tertiary }}>,</span>
                  <span style={{ color: T.cyan }}>USD</span>
                  <span style={{ color: T.tertiary }}>,</span>
                  <span style={{ color: T.green }}>150000.00</span>
                  <span style={{ color: T.tertiary }}>,</span>
                  <span style={{ color: T.primary }}>2026-03-15</span>
                  <span style={{ color: T.tertiary }}>,</span>
                  <span style={{ color: T.secondary }}>Q1 Receivable</span>
                  <span style={{ color: T.tertiary }}>,</span>
                  <span style={{ color: T.amber }}>CONFIRMED</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── COL 3: Reference Panel ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── DOWNLOAD TEMPLATE ── */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.tertiary, letterSpacing: "0.14em" }}>DOWNLOAD TEMPLATE</span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => handleDownloadTemplate("csv")}
                className="csv-btn-ghost"
                style={{
                  width: "100%", background: "transparent", border: `1px solid ${T.border}`, color: T.primary,
                  padding: "12px 14px", borderRadius: 3, cursor: "pointer",
                  fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.10em",
                  display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.15s",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  CSV TEMPLATE
                </div>
                <span style={{ fontSize: 8, color: T.tertiary }}>2 SAMPLE ROWS</span>
              </button>

              <div style={{
                width: "100%", background: T.sub, border: `1px solid ${T.borderSoft}`, color: T.tertiary,
                padding: "12px 14px", borderRadius: 3,
                fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.10em",
                display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.5,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  XLSX TEMPLATE
                </div>
                <span style={{ fontSize: 8, color: T.tertiary, background: T.border, padding: "1px 6px", borderRadius: 2 }}>SOON</span>
              </div>
            </div>
          </div>

          {/* ── SUPPORTED CURRENCIES ── */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.tertiary, letterSpacing: "0.14em" }}>SUPPORTED CCY</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.cyan }}>27 ISO 4217</span>
            </div>
            <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {CURRENCIES.map(ccy => (
                <div key={ccy} className="csv-cur"
                  style={{
                    padding: "6px 8px", background: T.sub, border: `1px solid ${T.borderSoft}`,
                    borderRadius: 3, fontFamily: T.fontMono, fontSize: 10, fontWeight: 600,
                    color: T.secondary, textAlign: "center", cursor: "default", transition: "all 0.15s",
                  }}>
                  {ccy}
                </div>
              ))}
            </div>
          </div>

          {/* ── LIMITS & SPECS ── */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.tertiary, letterSpacing: "0.14em" }}>LIMITS & SPECS</span>
            </div>
            <div style={{ padding: "4px 0" }}>
              {[
                { k: "MAX FILE SIZE",   v: "50 MB" },
                { k: "MAX ROWS",        v: "5,000" },
                { k: "ENCODING",        v: "UTF-8" },
                { k: "DELIMITER",       v: "COMMA (,)" },
                { k: "DATE FORMAT",     v: "YYYY-MM-DD" },
                { k: "DECIMAL SEP",     v: "PERIOD (.)" },
                { k: "CURRENCIES",      v: "27 ISO codes" },
                { k: "HEADER REQUIRED", v: "YES (row 1)" },
              ].map((item, i) => (
                <div key={item.k} style={{ padding: "9px 16px", borderBottom: i < 7 ? `1px solid ${T.borderSoft}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 9, color: T.tertiary, letterSpacing: "0.08em" }}>{item.k}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, color: T.secondary }}>{item.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── IMPORT PIPELINE ── */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.tertiary, letterSpacing: "0.14em" }}>IMPORT PIPELINE</span>
            </div>
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 0 }}>
              {["UPLOAD", "PARSE", "VALIDATE", "COMMIT", "AUDIT RECORD"].map((s, i) => (
                <div key={s} style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: `1px solid ${T.border}`, background: T.sub, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fontMono, fontSize: 8, fontWeight: 700, color: T.cyan, flexShrink: 0 }}>
                      {i+1}
                    </div>
                    <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.secondary, letterSpacing: "0.06em" }}>{s}</span>
                  </div>
                  {i < 4 && <div style={{ width: 1, height: 8, background: T.border, marginLeft: 10 }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>

    <HelpPanel config={UPLOAD_CSV_HELP} storageKey="upload-csv" />
    </div>
    </>
  );
}
