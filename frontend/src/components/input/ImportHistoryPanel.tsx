"use client";

import { useState, useEffect, useCallback } from "react";
import { listConnectorRuns, getConnectorRunDetail } from "@/api/connectorClient";
import type { ConnectorRun, ConnectorRunDetail } from "@/api/connectorClient";
import EmptyState from "@/components/ui/EmptyState";
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
}

function statusColor(status: string) {
  if (status === "COMPLETED") return S.green;
  if (status === "FAILED")    return S.red;
  return S.amber; // RUNNING
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function ImportHistoryPanel({ token }: Props) {
  const [runs, setRuns]           = useState<ConnectorRun[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [detail, setDetail]       = useState<ConnectorRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listConnectorRuns(token, 50);
      setRuns(res.items);
    } catch (e: unknown) {
      setError(extractErrorDetail(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = useCallback(async (run: ConnectorRun) => {
    if (expanded === run.id) { setExpanded(null); setDetail(null); return; }
    setExpanded(run.id);
    setDetail(null);
    if (run.error_count > 0 && token) {
      setDetailLoading(true);
      try {
        const d = await getConnectorRunDetail(run.id, token);
        setDetail(d);
      } catch { /* ignore */ } finally {
        setDetailLoading(false);
      }
    }
  }, [expanded, token]);

  if (loading) return <EmptyState type="loading" message="Loading import history…" />;
  if (error)   return <EmptyState type="error"   title="Failed to load history" message={error} />;
  if (runs.length === 0) return (
    <EmptyState
      type="empty"
      title="No import history"
      message="Every file import creates an auditable ConnectorRun record. Import a CSV or Excel file to see it here."
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>

      {/* Column headers */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 80px 80px 80px 90px",
        gap:                 8,
        padding:             "5px 12px",
        background:          S.bgSub,
        border:              `1px solid ${S.border}`,
        fontFamily:          S.fontMono,
        fontSize:            "0.4375rem",
        letterSpacing:       "0.08em",
        color:               S.tertiary,
      }}>
        <span>FILE</span>
        <span>TYPE</span>
        <span>TOTAL</span>
        <span>OK</span>
        <span>ERRORS</span>
        <span>STARTED</span>
      </div>

      {runs.map(run => (
        <div key={run.id}>
          {/* Row */}
          <div
            onClick={() => toggleExpand(run)}
            style={{
              display:             "grid",
              gridTemplateColumns: "1fr 1fr 80px 80px 80px 90px",
              gap:                 8,
              padding:             "8px 12px",
              background:          expanded === run.id ? S.bgSub : S.bgPanel,
              border:              `1px solid ${S.border}`,
              cursor:              "pointer",
              transition:          "background 0.1s",
            }}
          >
            <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {run.source_filename ?? "—"}
            </span>
            <span style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.04em",
              color: S.tertiary, overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {run.connector_type}
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.secondary }}>
              {run.total_rows}
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.green }}>
              {run.created_ok}
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: run.error_count > 0 ? S.red : S.tertiary }}>
              {run.error_count}
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: statusColor(run.status) }}>
              {fmtDate(run.started_at)}
            </span>
          </div>

          {/* Expanded error detail */}
          {expanded === run.id && (
            <div style={{
              padding:    "10px 16px",
              background: S.bgDeep,
              border:     `1px solid ${S.border}`,
              borderTop:  "none",
            }}>
              {/* Run metadata */}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 10 }}>
                {[
                  ["Run ID",   run.id],
                  ["Status",   run.status],
                  ["Hash",     run.source_hash ? run.source_hash.slice(0, 16) + "…" : "—"],
                  ["Completed", run.completed_at ? fmtDate(run.completed_at) : "—"],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.08em", color: S.tertiary }}>{label}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Error rows */}
              {run.error_count > 0 && (
                <>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em", color: S.tertiary, marginBottom: 6 }}>
                    ROW ERRORS
                  </div>
                  {detailLoading && (
                    <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>Loading errors…</div>
                  )}
                  {detail?.errors.map((err, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex", gap: 10, alignItems: "flex-start",
                        padding: "5px 0",
                        borderBottom: `1px solid ${S.borderSoft}`,
                        fontFamily: S.fontMono, fontSize: "0.6875rem",
                      }}
                    >
                      <span style={{ color: S.amber, minWidth: 40 }}>
                        Row {err.row_number ?? "?"}
                      </span>
                      {err.field_name && (
                        <span style={{ color: S.tertiary, minWidth: 80 }}>{err.field_name}</span>
                      )}
                      <span style={{ color: S.red }}>{err.error_message}</span>
                    </div>
                  ))}
                </>
              )}
              {run.error_count === 0 && (
                <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.green }}>
                  All {run.total_rows} rows imported successfully.
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Refresh */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
        <button
          onClick={load}
          style={{
            fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.06em",
            padding: "3px 10px", border: `1px solid ${S.border}`,
            color: S.tertiary, background: "transparent", cursor: "pointer",
          }}
        >
          REFRESH
        </button>
      </div>
    </div>
  );
}
