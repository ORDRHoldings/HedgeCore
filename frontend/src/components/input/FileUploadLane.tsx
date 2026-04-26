"use client";

import { useState, useRef, useCallback } from "react";
import { importCsvAudited, importExcelAudited } from "@/api/connectorClient";
import type { ConnectorRun } from "@/api/connectorClient";
import { extractErrorDetail } from "@/lib/errors/extractDetail";

const S = {
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  border:    "var(--border-rim)",
  borderSoft:"var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  green:     "var(--status-pass)",
  red:       "var(--accent-red)",
  fontMono:  "'IBM Plex Mono', monospace",
  fontUI:    "'IBM Plex Sans', sans-serif",
} as const;

interface Props {
  token?: string;
  onImportComplete?: () => void;   // signal parent to refresh positions
}

export default function FileUploadLane({ token, onImportComplete }: Props) {
  const [dragging, setDragging]   = useState(false);
  const [file, setFile]           = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]       = useState<ConnectorRun | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = ".csv,.xlsx";

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleCommit = useCallback(async () => {
    if (!file || !token) return;
    setUploading(true);
    setError(null);
    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const run = isCsv
        ? await importCsvAudited(file, token)
        : await importExcelAudited(file, token);
      setResult(run);
      if (run.created_ok > 0) onImportComplete?.();
    } catch (e: unknown) {
      setError(extractErrorDetail(e));
    } finally {
      setUploading(false);
    }
  }, [file, token, onImportComplete]);

  const isExcel = file?.name.toLowerCase().endsWith(".xlsx");
  const isCsv   = file?.name.toLowerCase().endsWith(".csv");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border:       `2px dashed ${dragging ? S.cyan : S.border}`,
          borderRadius:  4,
          padding:       "40px 24px",
          textAlign:     "center",
          cursor:        "pointer",
          background:    dragging
            ? `color-mix(in srgb, ${S.cyan} 4%, ${S.bgDeep})`
            : S.bgDeep,
          transition:    "all 0.15s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
        />
        <div style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.08em", marginBottom: 8 }}>
          DROP FILE HERE OR CLICK TO BROWSE
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary }}>
          Accepted: <span style={{ color: S.cyan }}>.csv</span> and <span style={{ color: S.cyan }}>.xlsx</span>
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.tertiary, marginTop: 4 }}>
          Required columns: record_id · entity · flow_type · currency · amount · value_date
        </div>
      </div>

      {/* Selected file info */}
      {file && (
        <div style={{
          display:        "flex",
          alignItems:     "center",
          gap:            12,
          padding:        "10px 14px",
          background:     S.bgPanel,
          border:         `1px solid ${S.border}`,
          borderRadius:   3,
        }}>
          <span style={{
            fontFamily:    S.fontMono,
            fontSize:      "0.75rem",
            letterSpacing: "0.06em",
            padding:       "2px 6px",
            border:        `1px solid ${isExcel ? S.amber : S.cyan}`,
            color:         isExcel ? S.amber : S.cyan,
          }}>
            {isExcel ? "XLSX" : isCsv ? "CSV" : "FILE"}
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.primary, flex: 1 }}>
            {file.name}
          </span>
          <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.tertiary }}>
            {(file.size / 1024).toFixed(1)} KB
          </span>
          <button
            onClick={e => { e.stopPropagation(); setFile(null); setResult(null); setError(null); }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: S.tertiary, fontFamily: S.fontMono, fontSize: "0.75rem",
            }}
          >×</button>
        </div>
      )}

      {/* Commit button */}
      {file && !result && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleCommit}
            disabled={uploading}
            style={{
              fontFamily:    S.fontMono,
              fontSize:      "0.75rem",
              letterSpacing: "0.06em",
              fontWeight:    700,
              padding:       "6px 20px",
              border:        `1px solid ${uploading ? S.tertiary : S.cyan}`,
              color:         uploading ? S.tertiary : S.cyan,
              background:    uploading ? "transparent" : `color-mix(in srgb, ${S.cyan} 6%, transparent)`,
              cursor:        uploading ? "not-allowed" : "pointer",
              transition:    "all 0.1s",
            }}
          >
            {uploading ? "IMPORTING…" : "COMMIT IMPORT"}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: "10px 14px",
          border:  `1px solid ${S.red}`,
          background: `color-mix(in srgb, ${S.red} 5%, ${S.bgPanel})`,
          fontFamily: S.fontMono,
          fontSize:   "0.75rem",
          color:      S.red,
          borderRadius: 3,
        }}>
          {error}
        </div>
      )}

      {/* Result banner */}
      {result && (
        <ConnectorRunBanner run={result} onDismiss={() => { setResult(null); setFile(null); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result banner
// ---------------------------------------------------------------------------

function ConnectorRunBanner({ run, onDismiss }: { run: ConnectorRun; onDismiss: () => void }) {
  const S2 = S;
  const success = run.status === "COMPLETED" && run.error_count === 0;
  const partial  = run.status === "COMPLETED" && run.error_count > 0;
  const _failed  = run.status === "FAILED";

  const color = success ? S2.green : partial ? S2.amber : S2.red;

  return (
    <div style={{
      border:       `1px solid ${color}`,
      background:   `color-mix(in srgb, ${color} 4%, ${S2.bgPanel})`,
      borderRadius: 3,
    }}>
      {/* Header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "8px 14px",
        borderBottom:   `1px solid ${color}`,
      }}>
        <span style={{ fontFamily: S2.fontMono, fontSize: "0.75rem", letterSpacing: "0.08em", color }}>
          {success ? "IMPORT COMPLETE" : partial ? "IMPORT PARTIAL" : "IMPORT FAILED"}
        </span>
        <span style={{ fontFamily: S2.fontUI, fontSize: "0.75rem", color: S2.secondary }}>
          {run.created_ok}/{run.total_rows} rows created
          {run.error_count > 0 && ` · ${run.error_count} errors`}
        </span>
        <button
          onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", color: S2.tertiary, fontFamily: S2.fontMono }}
        >×</button>
      </div>

      {/* Metadata row */}
      <div style={{
        display:    "flex",
        gap:        20,
        padding:    "7px 14px",
        flexWrap:   "wrap",
      }}>
        {[
          ["Type",       run.connector_type],
          ["File",       run.source_filename ?? "—"],
          ["Status",     run.status],
          ["Run ID",     run.id.slice(0, 8) + "…"],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: S2.fontMono, fontSize: "0.75rem", color: S2.tertiary, letterSpacing: "0.08em" }}>
              {label}
            </span>
            <span style={{ fontFamily: S2.fontMono, fontSize: "0.75rem", color: S2.primary }}>
              {val}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
