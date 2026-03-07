"use client";

/**
 * /position-desk/import — Institutional Position CSV Import
 *
 * Bloomberg Terminal-grade 4-phase import pipeline:
 *   Phase 1: UPLOAD — drag-drop or file select, SHA-256 dedup
 *   Phase 2: MAP — auto-detected column mapping with manual override
 *   Phase 3: VALIDATE — row-by-row validation grid with error codes
 *   Phase 4: COMMIT — bulk position creation with audit trail
 *
 * Keyboard: Escape (back), Enter (advance phase), Ctrl+Shift+C (commit)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import WorkflowBreadcrumb from "@/components/layout/WorkflowBreadcrumb";

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  green: "var(--status-pass,#22c55e)",
  red: "var(--accent-red,#ef4444)",
} as const;

type Phase = "UPLOAD" | "MAP" | "VALIDATE" | "COMMIT";

interface BatchData {
  id: string;
  filename: string;
  file_hash: string;
  file_size_bytes: number;
  row_count: number;
  valid_count: number;
  error_count: number;
  duplicate_count: number;
  created_count: number;
  status: string;
  column_mapping: Record<string, string | null> | null;
  validation_errors: ValidationError[] | null;
  created_position_ids: string[] | null;
  raw_preview: Record<string, string>[] | null;
  created_at: string | null;
  validated_at: string | null;
  committed_at: string | null;
}

interface ValidationError {
  row: number;
  code: string;
  field: string | null;
  message: string;
  value: string | null;
}

const CANONICAL_FIELDS = [
  { key: "record_id", label: "Record ID", required: true },
  { key: "entity", label: "Entity", required: true },
  { key: "flow_type", label: "Flow Type", required: true },
  { key: "currency", label: "Currency", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "value_date", label: "Value Date", required: true },
  { key: "status", label: "Status", required: false },
  { key: "description", label: "Description", required: false },
];

const ERROR_CODE_LABELS: Record<string, string> = {
  "I-001": "MISSING FIELD",
  "I-002": "BAD CURRENCY",
  "I-003": "BAD FLOW TYPE",
  "I-004": "BAD STATUS",
  "I-005": "BAD AMOUNT",
  "I-006": "BAD DATE",
  "I-007": "FILE DUPLICATE",
  "I-008": "DB DUPLICATE",
  "I-009": "EMPTY ROW",
  "I-010": "PARSE ERROR",
};

export default function PositionImportPage() {
  const router = useRouter();
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("UPLOAD");
  const [batch, setBatch] = useState<BatchData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [committed, setCommitted] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (phase === "UPLOAD") router.push("/position-desk");
        else if (phase === "MAP") setPhase("UPLOAD");
        else if (phase === "VALIDATE") setPhase("MAP");
      }
      if (e.ctrlKey && e.shiftKey && e.key === "C" && phase === "VALIDATE" && batch && batch.valid_count > 0) {
        handleCommit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, batch]);

  // ── Phase 1: Upload ─────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!token) return;
    setError(null);
    setLoading(true);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/v1/positions/import/upload`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || `Upload failed: ${res.status}`);
      }
      const data: BatchData = await res.json();
      setBatch(data);

      // Extract CSV headers from preview
      if (data.raw_preview && data.raw_preview.length > 0) {
        setCsvHeaders(Object.keys(data.raw_preview[0]));
      }
      if (data.column_mapping) {
        setMapping(data.column_mapping);
      }
      setPhase("MAP");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Phase 2: Validate ───────────────────────────────────────────
  const handleValidate = useCallback(async () => {
    if (!token || !batch) return;
    setError(null);
    setLoading(true);

    try {
      const resp = await dashboardFetch("/v1/positions/import/validate", token, {
        method: "POST",
        body: JSON.stringify({ batch_id: batch.id, column_mapping: mapping }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(body.detail || `Validation failed: ${resp.status}`);
      }
      const res: BatchData = await resp.json();
      setBatch(res);
      setPhase("VALIDATE");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  }, [token, batch, mapping]);

  // ── Phase 3: Commit ─────────────────────────────────────────────
  const handleCommit = useCallback(async () => {
    if (!token || !batch) return;
    setError(null);
    setLoading(true);

    try {
      const resp = await dashboardFetch("/v1/positions/import/commit", token, {
        method: "POST",
        body: JSON.stringify({ batch_id: batch.id }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(body.detail || `Commit failed: ${resp.status}`);
      }
      const res: BatchData = await resp.json();
      setBatch(res);
      setPhase("COMMIT");
      setCommitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setLoading(false);
    }
  }, [token, batch]);

  // ── Template download ───────────────────────────────────────────
  const downloadTemplate = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/v1/positions/import/template`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const text = await res.text();
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "position_import_template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* swallow */
    }
  }, [token]);

  const phaseIndex = ["UPLOAD", "MAP", "VALIDATE", "COMMIT"].indexOf(phase);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: S.bgDeep, color: S.primary }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", gap: 10, height: 44, flexShrink: 0, padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}` }}>
        <button onClick={() => router.push("/position-desk")} style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, background: "transparent", border: `1px solid ${S.rim}`, padding: "2px 8px", cursor: "pointer" }}>← Position Desk</button>
        <span style={{ color: S.rim }}>|</span>
        <span style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary }}>Position Import</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.amber, border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`, padding: "1px 5px" }}>INSTITUTIONAL</span>
        <div style={{ flex: 1 }} />
        <button onClick={downloadTemplate} style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, background: "transparent", border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`, padding: "2px 8px", cursor: "pointer" }}>↓ TEMPLATE</button>
      </header>

      {/* Phase indicator */}
      <div style={{ display: "flex", alignItems: "center", height: 36, padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, gap: 0 }}>
        {(["UPLOAD", "MAP", "VALIDATE", "COMMIT"] as Phase[]).map((p, i) => {
          const isActive = i === phaseIndex;
          const isDone = i < phaseIndex;
          const color = isActive ? S.cyan : isDone ? S.green : S.tertiary;
          return (
            <div key={p} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                color, padding: "3px 12px",
                background: isActive ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
                borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
              }}>
                <span style={{ color: isDone ? S.green : color, marginRight: 4 }}>{isDone ? "✓" : `${i + 1}.`}</span>
                {p}
              </div>
              {i < 3 && <span style={{ color: S.rim, margin: "0 4px", fontFamily: S.fontMono, fontSize: 9 }}>→</span>}
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        {batch && (
          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary }}>
            {batch.filename} · {batch.row_count} rows · {fmtBytes(batch.file_size_bytes)}
          </span>
        )}
      </div>

      <WorkflowBreadcrumb active="position" />

      {/* Error banner */}
      {error && (
        <div style={{ background: `color-mix(in srgb, ${S.red} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.red} 25%, transparent)`, borderLeft: `3px solid ${S.red}`, padding: "7px 20px", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.red }}>{error}</span>
          <button onClick={() => setError(null)} style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, background: "transparent", border: "none", cursor: "pointer", marginLeft: "auto" }}>✕</button>
        </div>
      )}

      {/* Main content area */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {phase === "UPLOAD" && <UploadPhase dragOver={dragOver} setDragOver={setDragOver} onDrop={onDrop} onFileSelect={onFileSelect} fileRef={fileRef} loading={loading} />}
        {phase === "MAP" && batch && <MapPhase batch={batch} mapping={mapping} setMapping={setMapping} csvHeaders={csvHeaders} onValidate={handleValidate} loading={loading} />}
        {phase === "VALIDATE" && batch && <ValidatePhase batch={batch} onCommit={handleCommit} onBack={() => setPhase("MAP")} loading={loading} />}
        {phase === "COMMIT" && batch && <CommitPhase batch={batch} committed={committed} onGoToDesk={() => router.push("/position-desk")} />}
      </div>
    </div>
  );
}

// ── Phase 1: Upload Zone ──────────────────────────────────────────

function UploadPhase({ dragOver, setDragOver, onDrop, onFileSelect, fileRef, loading }: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 24 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          width: 520, height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
          border: `2px dashed ${dragOver ? S.cyan : S.rim}`,
          background: dragOver ? `color-mix(in srgb, ${S.cyan} 4%, transparent)` : S.bgPanel,
          cursor: "pointer", transition: "all 0.15s",
        }}
      >
        {loading ? (
          <span style={{ fontFamily: S.fontMono, fontSize: 13, color: S.cyan }}>PARSING FILE...</span>
        ) : (
          <>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={dragOver ? S.cyan : S.tertiary} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span style={{ fontFamily: S.fontUI, fontSize: 14, fontWeight: 700, color: S.primary, letterSpacing: "0.04em" }}>DROP CSV FILE HERE</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>or click to browse — max 10MB</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginTop: 8 }}>
              Accepted: .csv, .tsv · UTF-8, Latin-1, BOM-safe
            </span>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={onFileSelect} style={{ display: "none" }} />

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>Required: record_id, entity, flow_type, currency, amount, value_date</span>
      </div>

      <div style={{ maxWidth: 520, width: "100%" }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginBottom: 8, letterSpacing: "0.06em" }}>SUPPORTED COLUMN FORMATS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "4px 16px" }}>
          {[
            ["Record ID", "record_id, id, ref, trade_id, external_id"],
            ["Entity", "entity, company, counterparty, legal_entity, subsidiary"],
            ["Flow Type", "flow_type, type, direction, side, ar_ap"],
            ["Currency", "currency, ccy, curr, iso_currency"],
            ["Amount", "amount, notional, value, exposure, size, quantity"],
            ["Value Date", "value_date, date, settlement_date, maturity"],
            ["Status", "status, confirmation (default: CONFIRMED)"],
            ["Description", "description, desc, notes, memo, remarks"],
          ].map(([label, aliases]) => (
            <div key={label} style={{ display: "contents" }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.cyan, fontWeight: 600 }}>{label}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary }}>{aliases}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Phase 2: Column Mapping ───────────────────────────────────────

function MapPhase({ batch, mapping, setMapping, csvHeaders, onValidate, loading }: {
  batch: BatchData;
  mapping: Record<string, string | null>;
  setMapping: (m: Record<string, string | null>) => void;
  csvHeaders: string[];
  onValidate: () => void;
  loading: boolean;
}) {
  const requiredMapped = CANONICAL_FIELDS.filter(f => f.required).every(f => mapping[f.key]);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.primary, letterSpacing: "0.04em", marginBottom: 4 }}>COLUMN MAPPING</div>
      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, marginBottom: 20 }}>
        Auto-detected mapping from {batch.filename}. Adjust if needed.
      </div>

      {/* Preview */}
      {batch.raw_preview && batch.raw_preview.length > 0 && (
        <div style={{ marginBottom: 24, overflow: "auto" }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginBottom: 6, letterSpacing: "0.06em" }}>FILE PREVIEW (FIRST 5 ROWS)</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 10 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 32 }}>#</th>
                {csvHeaders.map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(batch.raw_preview || []).slice(0, 5).map((row, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{i + 1}</td>
                  {csvHeaders.map(h => <td key={h} style={tdStyle}>{row[h] || ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mapping grid */}
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 200px", gap: "8px 16px", alignItems: "center" }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>TARGET FIELD</div>
        <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>CSV COLUMN</div>
        <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>STATUS</div>

        {CANONICAL_FIELDS.map(field => {
          const value = mapping[field.key] || "";
          const isMapped = !!value;
          return (
            <div key={field.key} style={{ display: "contents" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: field.required ? S.primary : S.secondary }}>
                {field.label}
                {field.required && <span style={{ color: S.red, marginLeft: 3 }}>*</span>}
              </div>
              <select
                value={value}
                onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value || null })}
                style={{
                  fontFamily: S.fontMono, fontSize: 11, color: S.primary,
                  background: S.bgSub, border: `1px solid ${isMapped ? `color-mix(in srgb, ${S.green} 40%, transparent)` : S.rim}`,
                  padding: "4px 8px", cursor: "pointer",
                }}
              >
                <option value="">— Not mapped —</option>
                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <span style={{
                fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                color: isMapped ? S.green : field.required ? S.red : S.tertiary,
              }}>
                {isMapped ? "✓ MAPPED" : field.required ? "✕ REQUIRED" : "— OPTIONAL"}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "flex-end" }}>
        <button onClick={onValidate} disabled={!requiredMapped || loading} style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
          color: requiredMapped ? S.cyan : S.tertiary,
          background: requiredMapped ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : "transparent",
          border: `1px solid ${requiredMapped ? `color-mix(in srgb, ${S.cyan} 40%, transparent)` : S.rim}`,
          padding: "6px 24px", cursor: requiredMapped ? "pointer" : "not-allowed",
        }}>
          {loading ? "VALIDATING..." : "VALIDATE →"}
        </button>
      </div>
    </div>
  );
}

// ── Phase 3: Validation Results ───────────────────────────────────

function ValidatePhase({ batch, onCommit, onBack, loading }: {
  batch: BatchData;
  onCommit: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const errors = batch.validation_errors || [];
  const canCommit = batch.valid_count > 0;

  // Group errors by code
  const errorsByCode: Record<string, number> = {};
  errors.forEach(e => { errorsByCode[e.code] = (errorsByCode[e.code] || 0) + 1; });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <SummaryCard label="TOTAL ROWS" value={batch.row_count} color={S.primary} />
        <SummaryCard label="VALID" value={batch.valid_count} color={S.green} />
        <SummaryCard label="ERRORS" value={batch.error_count} color={batch.error_count > 0 ? S.red : S.tertiary} />
        <SummaryCard label="DUPLICATES" value={batch.duplicate_count} color={batch.duplicate_count > 0 ? S.amber : S.tertiary} />
      </div>

      {/* Error code breakdown */}
      {Object.keys(errorsByCode).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em", marginBottom: 8 }}>ERROR BREAKDOWN</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(errorsByCode).sort().map(([code, count]) => (
              <span key={code} style={{
                fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                color: S.red, background: `color-mix(in srgb, ${S.red} 8%, transparent)`,
                border: `1px solid color-mix(in srgb, ${S.red} 25%, transparent)`,
                padding: "2px 8px", borderRadius: 2,
              }}>
                {code} {ERROR_CODE_LABELS[code] || ""}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error grid */}
      {errors.length > 0 && (
        <div style={{ marginBottom: 24, maxHeight: 340, overflow: "auto" }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em", marginBottom: 6 }}>VALIDATION ERRORS ({errors.length})</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 10 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 50 }}>ROW</th>
                <th style={{ ...thStyle, width: 60 }}>CODE</th>
                <th style={{ ...thStyle, width: 90 }}>FIELD</th>
                <th style={thStyle}>MESSAGE</th>
                <th style={{ ...thStyle, width: 100 }}>VALUE</th>
              </tr>
            </thead>
            <tbody>
              {errors.slice(0, 200).map((e, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{e.row}</td>
                  <td style={{ ...tdStyle, color: S.red, fontWeight: 700 }}>{e.code}</td>
                  <td style={{ ...tdStyle, color: S.cyan }}>{e.field || "—"}</td>
                  <td style={tdStyle}>{e.message}</td>
                  <td style={{ ...tdStyle, color: S.amber }}>{e.value || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {errors.length > 200 && (
            <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, padding: "8px 0" }}>
              Showing 200 of {errors.length} errors
            </div>
          )}
        </div>
      )}

      {/* Valid rows summary */}
      {batch.valid_count > 0 && (
        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.green, marginBottom: 24, padding: "12px 16px", background: `color-mix(in srgb, ${S.green} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${S.green} 20%, transparent)` }}>
          {batch.valid_count} rows ready to commit as positions. {batch.error_count > 0 ? `${batch.error_count} rows with errors will be skipped.` : ""}
        </div>
      )}

      {batch.valid_count === 0 && (
        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.red, marginBottom: 24, padding: "12px 16px", background: `color-mix(in srgb, ${S.red} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${S.red} 20%, transparent)` }}>
          No valid rows found. Fix errors in your CSV and re-upload.
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button onClick={onBack} style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
          color: S.tertiary, background: "transparent", border: `1px solid ${S.rim}`,
          padding: "6px 16px", cursor: "pointer",
        }}>
          ← RE-MAP
        </button>
        <button onClick={onCommit} disabled={!canCommit || loading} style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
          color: canCommit ? "#000" : S.tertiary,
          background: canCommit ? S.green : "transparent",
          border: `1px solid ${canCommit ? S.green : S.rim}`,
          padding: "6px 24px", cursor: canCommit ? "pointer" : "not-allowed",
        }}>
          {loading ? "COMMITTING..." : `COMMIT ${batch.valid_count} POSITIONS`}
        </button>
      </div>

      <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginTop: 8, textAlign: "right" }}>
        Ctrl+Shift+C to commit
      </div>
    </div>
  );
}

// ── Phase 4: Commit Confirmation ──────────────────────────────────

function CommitPhase({ batch, committed, onGoToDesk }: {
  batch: BatchData;
  committed: boolean;
  onGoToDesk: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20 }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={S.green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
      </svg>

      <span style={{ fontFamily: S.fontUI, fontSize: 18, fontWeight: 700, color: S.green, letterSpacing: "0.04em" }}>
        IMPORT COMPLETE
      </span>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 8 }}>
        <SummaryCard label="CREATED" value={batch.created_count} color={S.green} />
        <SummaryCard label="SKIPPED" value={batch.error_count} color={batch.error_count > 0 ? S.amber : S.tertiary} />
        <SummaryCard label="FILE" value={batch.filename} color={S.secondary} isText />
      </div>

      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, marginTop: 8 }}>
        Batch: {batch.id} · SHA-256: {batch.file_hash.slice(0, 16)}...
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button onClick={onGoToDesk} style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
          color: S.cyan, background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.cyan} 40%, transparent)`,
          padding: "6px 20px", cursor: "pointer",
        }}>
          → POSITION DESK
        </button>
        <button onClick={() => window.location.reload()} style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
          color: S.tertiary, background: "transparent",
          border: `1px solid ${S.rim}`, padding: "6px 20px", cursor: "pointer",
        }}>
          IMPORT ANOTHER
        </button>
      </div>

      {batch.committed_at && (
        <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginTop: 12 }}>
          Committed at {new Date(batch.committed_at).toLocaleString()} · Audit trail logged
        </div>
      )}
    </div>
  );
}

// ── Summary card component ────────────────────────────────────────

function SummaryCard({ label, value, color, isText }: { label: string; value: number | string; color: string; isText?: boolean }) {
  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "12px 16px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em" }}>{label}</span>
      <span style={{
        fontFamily: S.fontMono, fontSize: isText ? 12 : 24, fontWeight: 700, color,
        letterSpacing: isText ? "0.02em" : "0.04em",
      }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

// ── Table styles ──────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const,
  color: "var(--text-tertiary)", background: "var(--bg-sub)",
  padding: "5px 8px", textAlign: "left", borderBottom: "1px solid var(--border-rim)",
  position: "sticky", top: 0, zIndex: 2,
};

const tdStyle: React.CSSProperties = {
  fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontSize: 10, color: "var(--text-secondary)", padding: "4px 8px",
  borderBottom: "1px solid var(--border-soft)", whiteSpace: "nowrap",
  overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200,
};

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
