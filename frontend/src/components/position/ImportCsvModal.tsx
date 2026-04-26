"use client";

/**
 * ImportCsvModal — Modal for bulk CSV position import.
 *
 * Extracted from /upload-csv page. Preserves all upload logic,
 * validation, progress stages, result display, and template download.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { T } from "@/lib/design/tokens";
import {
  importPositionsCsv,
  type ImportResult,
} from "@/api/positionClient";
import { X, Upload, FileText, CheckCircle, AlertTriangle } from "lucide-react";

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  token: string;
  onSuccess: () => void;
}

// ── Types ────────────────────────────────────────────────────────────────────
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

// ── Local tokens ─────────────────────────────────────────────────────────────
const S = {
  bgDeep:    T.bgDeep,
  bgPanel:   T.bgPanel,
  bgSub:     T.bgSub,
  rim:       T.rim,
  soft:      T.soft,
  primary:   T.primary,
  secondary: T.secondary,
  tertiary:  T.tertiary,
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red)",
  green:     "var(--status-pass)",
  fontMono:  T.fontMono,
  fontUI:    T.fontUI,
} as const;

const COLUMNS = [
  { name: "record_id",   type: "STRING",   format: "TXN-001",           req: true,  desc: "Unique position identifier" },
  { name: "entity",      type: "STRING",   format: "CORP-MX",           req: true,  desc: "Legal entity code" },
  { name: "flow_type",   type: "ENUM",     format: "AR | AP",           req: true,  desc: "Receivable or Payable" },
  { name: "currency",    type: "ISO 4217", format: "USD, EUR",          req: true,  desc: "3-letter ISO currency code" },
  { name: "amount",      type: "DECIMAL",  format: "150000.00",         req: true,  desc: "Positive decimal" },
  { name: "value_date",  type: "DATE",     format: "YYYY-MM-DD",        req: true,  desc: "Settlement date (future)" },
  { name: "description", type: "STRING",   format: "Free text",         req: false, desc: "Optional (max 255 chars)" },
  { name: "status",      type: "ENUM",     format: "CONFIRMED|FORECAST",req: false, desc: "Defaults to CONFIRMED" },
];

const STAGES: ImportStatus[] = ["uploading", "parsing", "validating", "committing"];

// ── Component ────────────────────────────────────────────────────────────────
export default function ImportCsvModal({ open, onClose, token, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile]   = useState<File | null>(null);
  const [isDragOver,   setIsDragOver]     = useState(false);
  const [importStatus, setImportStatus]   = useState<ImportStatus>("idle");
  const [runResult,    setRunResult]      = useState<ImportResultWrapper | null>(null);
  const [errorMessage, setErrorMessage]   = useState<string | null>(null);
  const [showErrors,   setShowErrors]     = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedFile(null);
      setIsDragOver(false);
      setImportStatus("idle");
      setRunResult(null);
      setErrorMessage(null);
      setShowErrors(false);
    }
  }, [open]);

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
    if (ext !== ".csv") { setErrorMessage("Invalid file type. Please upload CSV files only (.csv)."); return; }
    if (file.size > 50 * 1024 * 1024) { setErrorMessage("File size exceeds 50 MB limit."); return; }
    setSelectedFile(file); setErrorMessage(null); setRunResult(null); setImportStatus("idle");
  };

  const handleClearFile = () => {
    setSelectedFile(null); setErrorMessage(null); setRunResult(null); setImportStatus("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = useCallback(async () => {
    if (!selectedFile || !token) return;
    try {
      setImportStatus("uploading"); setErrorMessage(null);
      const ext = "." + selectedFile.name.split(".").pop()?.toLowerCase();
      if (ext !== ".csv") { setErrorMessage("Only CSV format supported."); setImportStatus("error"); return; }
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
      if (result.created > 0) onSuccess();
    } catch (error: unknown) {
      setImportStatus("error");
      const anyErr = error as { response?: { data?: { detail?: string } }; message?: string };
      setErrorMessage(anyErr.response?.data?.detail || anyErr.message || "Import failed. Please try again.");
    }
  }, [selectedFile, token, onSuccess]);

  const handleDownloadTemplate = useCallback(() => {
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
  }, []);

  const formatFileSize = (b: number) => b < 1024 ? b + " B" : b < 1024*1024 ? (b/1024).toFixed(1) + " KB" : (b/(1024*1024)).toFixed(2) + " MB";
  const formatDuration = (start: string, end: string | null) => {
    if (!end) return "--";
    const d = new Date(end).getTime() - new Date(start).getTime();
    return d < 1000 ? d + "ms" : (d/1000).toFixed(2) + "s";
  };

  const isProcessing = importStatus !== "idle" && importStatus !== "complete" && importStatus !== "error";

  const getStatusColor = () => runResult
    ? (runResult.error_count === 0 ? S.green : S.amber)
    : S.cyan;

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes csvModalSpin { to { transform: rotate(360deg); } }
        @keyframes csvModalPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes csvModalSlideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={isProcessing ? undefined : onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 300,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {/* Modal */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: S.bgDeep,
            border: `1px solid ${S.rim}`,
            boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
            width: 680, maxWidth: "95vw", maxHeight: "90vh",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: `1px solid ${S.rim}`,
            background: S.bgPanel,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Upload size={16} color={S.cyan} />
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: S.primary }}>
                  CSV POSITION IMPORT
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 1 }}>
                  Bulk import positions from CSV file
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isProcessing}
              style={{ background: "none", border: "none", cursor: isProcessing ? "not-allowed" : "pointer", color: S.tertiary, padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Progress bar (during import) */}
          {isProcessing && (
            <div style={{ background: S.bgSub, borderBottom: `1px solid ${S.rim}`, padding: "0 20px", height: 32, display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
              {STAGES.map((s, i) => {
                const active = importStatus === s;
                const done = STAGES.indexOf(importStatus) > i;
                return (
                  <div key={s} style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", height: 32, borderBottom: active ? `2px solid ${S.cyan}` : done ? `2px solid ${S.green}` : "2px solid transparent" }}>
                      {done && <CheckCircle size={10} color={S.green} />}
                      {active && <span style={{ width: 8, height: 8, border: `1.5px solid ${S.cyan}`, borderTopColor: "transparent", borderRadius: "50%", animation: "csvModalSpin 0.7s linear infinite", display: "inline-block" }} />}
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", color: active ? S.cyan : done ? S.green : S.tertiary, animation: active ? "csvModalPulse 1.5s ease-in-out infinite" : "none" }}>
                        {s.toUpperCase()}
                      </span>
                    </div>
                    {i < STAGES.length - 1 && <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, padding: "0 4px" }}>{"\u203A"}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} style={{ display: "none" }} />

            {/* Drop zone (when no file selected) */}
            {!selectedFile && !runResult && (
              <div
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  minHeight: 180,
                  border: `2px dashed ${isDragOver ? S.cyan : S.rim}`,
                  borderRadius: 3,
                  background: isDragOver ? "rgba(0,255,255,0.03)" : S.bgSub,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", transition: "all 0.2s", gap: 12, padding: 24,
                }}
              >
                <Upload size={40} color={isDragOver ? S.cyan : S.tertiary} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: isDragOver ? S.cyan : S.primary, letterSpacing: "0.08em", marginBottom: 6 }}>
                    {isDragOver ? "RELEASE TO UPLOAD" : "DROP FILE HERE OR CLICK TO SELECT"}
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                    Accepted: .csv only | Max 50 MB | Max 5,000 rows
                  </div>
                </div>
              </div>
            )}

            {/* File selected card */}
            {selectedFile && importStatus !== "complete" && (
              <div style={{ animation: "csvModalSlideIn 0.25s ease" }}>
                <div style={{
                  padding: "12px 16px", background: S.bgSub, borderRadius: 3,
                  border: `1px solid ${S.rim}`, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <FileText size={20} color={S.cyan} />
                    <div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.primary, marginBottom: 2, maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selectedFile.name}
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{formatFileSize(selectedFile.size)}</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.green }}>FORMAT OK</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={handleClearFile} disabled={isProcessing}
                    style={{
                      background: "transparent", border: `1px solid ${S.rim}`, color: S.secondary,
                      padding: "4px 10px", borderRadius: 3, cursor: isProcessing ? "not-allowed" : "pointer",
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
                    }}
                  >CLEAR</button>
                </div>

                {/* Import button */}
                <button
                  onClick={handleImport}
                  disabled={isProcessing}
                  style={{
                    width: "100%", padding: "14px 20px",
                    background: isProcessing ? S.bgSub : S.cyan,
                    border: "none", cursor: isProcessing ? "wait" : "pointer",
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                    letterSpacing: "0.12em", color: isProcessing ? S.secondary : S.bgDeep,
                    transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    borderRadius: 3,
                  }}
                >
                  {isProcessing ? (
                    <>
                      <span style={{ width: 13, height: 13, border: `2px solid ${S.tertiary}`, borderTopColor: S.secondary, borderRadius: "50%", animation: "csvModalSpin 0.7s linear infinite", display: "inline-block" }} />
                      PROCESSING...
                    </>
                  ) : importStatus === "error" ? (
                    "RETRY IMPORT"
                  ) : (
                    "VALIDATE & IMPORT"
                  )}
                </button>

                {importStatus === "error" && errorMessage && (
                  <div style={{ marginTop: 10, padding: "10px 14px", background: `color-mix(in srgb, ${S.red} 6%, transparent)`, border: `1px solid ${S.red}`, borderRadius: 3, fontFamily: S.fontMono, fontSize: 12, color: S.red }}>
                    {errorMessage}
                  </div>
                )}
              </div>
            )}

            {/* Error message (no file selected) */}
            {errorMessage && !selectedFile && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: `color-mix(in srgb, ${S.red} 6%, transparent)`, border: `1px solid ${S.red}`, borderRadius: 3, fontFamily: S.fontMono, fontSize: 12, color: S.red }}>
                {errorMessage}
              </div>
            )}

            {/* Result card */}
            {runResult && importStatus === "complete" && (
              <div style={{ border: `2px solid ${getStatusColor()}`, borderRadius: 4, overflow: "hidden", animation: "csvModalSlideIn 0.3s ease" }}>
                {/* Result header */}
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.rim}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: S.bgPanel }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {runResult.error_count === 0
                      ? <CheckCircle size={16} color={S.green} />
                      : <AlertTriangle size={16} color={S.amber} />}
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary, letterSpacing: "0.08em" }}>
                      IMPORT COMPLETE
                    </span>
                  </div>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, padding: "3px 8px", borderRadius: 2, background: getStatusColor(), color: S.bgDeep, fontWeight: 700, letterSpacing: "0.08em" }}>
                    {runResult.error_count === 0 ? "CLEAN" : "WITH ERRORS"}
                  </span>
                </div>

                {/* KPI grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, borderBottom: `1px solid ${S.rim}` }}>
                  {[
                    { label: "TOTAL ROWS", value: runResult.total_rows, color: S.primary },
                    { label: "CREATED", value: runResult.created_ok, color: S.green },
                    { label: "ERRORS", value: runResult.error_count, color: runResult.error_count > 0 ? S.red : S.tertiary },
                    { label: "DURATION", value: formatDuration(runResult.started_at, runResult.completed_at), color: S.primary },
                  ].map((k, i) => (
                    <div key={i} style={{ padding: "14px 16px", borderRight: i < 3 ? `1px solid ${S.rim}` : "none" }}>
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.14em", marginBottom: 6 }}>{k.label}</div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
                    </div>
                  ))}
                </div>

                {/* Errors collapsible */}
                {runResult.errors.length > 0 && (
                  <div style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <button onClick={() => setShowErrors(!showErrors)}
                      style={{ width: "100%", padding: "8px 16px", background: `color-mix(in srgb, ${S.red} 4%, transparent)`, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.red, letterSpacing: "0.12em" }}>
                        {runResult.errors.length} VALIDATION ERROR{runResult.errors.length !== 1 ? "S" : ""}
                      </span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.red }}>{showErrors ? "\u25BC" : "\u25BA"}</span>
                    </button>
                    {showErrors && (
                      <div style={{ maxHeight: 160, overflowY: "auto", padding: "0 16px 10px" }}>
                        {runResult.errors.map((err, i) => (
                          <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${S.soft}`, display: "flex", gap: 10 }}>
                            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.red, flexShrink: 0 }}>ROW {err.row_number ?? "?"}</span>
                            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{err.error_message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Post-import actions */}
                <div style={{ padding: "12px 16px", display: "flex", gap: 10 }}>
                  <button onClick={handleClearFile}
                    style={{
                      flex: 1, background: S.cyan, border: "none", color: S.bgDeep,
                      padding: "8px", borderRadius: 3, cursor: "pointer",
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                    }}>
                    IMPORT ANOTHER
                  </button>
                  <button onClick={onClose}
                    style={{
                      flex: 1, background: "transparent", border: `1px solid ${S.rim}`, color: S.secondary,
                      padding: "8px", borderRadius: 3, cursor: "pointer",
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
                    }}>
                    CLOSE
                  </button>
                </div>
              </div>
            )}

            {/* Schema reference (collapsed) */}
            {!runResult && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.14em", marginBottom: 8 }}>REQUIRED COLUMNS</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: S.bgSub }}>
                      {["COLUMN", "TYPE", "FORMAT", "REQ"].map(h => (
                        <th scope="col" key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.12em", borderBottom: `1px solid ${S.rim}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COLUMNS.map(row => (
                      <tr key={row.name} style={{ borderBottom: `1px solid ${S.soft}` }}>
                        <td style={{ padding: "6px 10px", color: S.cyan, fontWeight: 600, whiteSpace: "nowrap" }}>{row.name}</td>
                        <td style={{ padding: "6px 10px" }}>
                          <span style={{ background: S.bgSub, color: S.secondary, padding: "1px 5px", borderRadius: 2, fontSize: 12 }}>{row.type}</span>
                        </td>
                        <td style={{ padding: "6px 10px", color: S.tertiary }}>{row.format}</td>
                        <td style={{ padding: "6px 10px", textAlign: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: row.req ? S.red : S.tertiary }}>{row.req ? "YES" : "NO"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Template download */}
                <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                  <button onClick={handleDownloadTemplate}
                    style={{
                      flex: 1, background: "transparent", border: `1px solid ${S.rim}`, color: S.primary,
                      padding: "10px 14px", borderRadius: 3, cursor: "pointer",
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.10em",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                    <FileText size={13} />
                    DOWNLOAD CSV TEMPLATE
                  </button>
                </div>

                {/* Audit note */}
                <div style={{ marginTop: 16, padding: "10px 14px", background: `color-mix(in srgb, ${S.cyan} 4%, transparent)`, border: `1px solid color-mix(in srgb, ${S.cyan} 18%, transparent)`, borderLeft: `3px solid ${S.cyan}`, borderRadius: 3 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan, letterSpacing: "0.12em", marginBottom: 4 }}>WORM AUDIT TRAIL</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, lineHeight: 1.6 }}>
                    Every import is recorded as an immutable ConnectorRun with SHA-256 file hash, operator identity, and row-level audit entries.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
