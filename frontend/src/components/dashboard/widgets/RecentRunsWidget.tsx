"use client";

import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import Link from "next/link";

const S = {
  fontUI:        "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:      "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:       "var(--bg-panel)",
  bgSurface:     "var(--bg-surface)",
  border:        "var(--border-rim)",
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary:  "var(--text-tertiary)",
  accentCyan:    "var(--accent-cyan,#22d3ee)",
  accentRed:     "var(--accent-red,#f87171)",
  accentGreen:   "var(--accent-green,#34d399)",
  accentAmber:   "var(--accent-amber,#fbbf24)",
};

type RunStatus =
  | "LEDGER"
  | "STAGING"
  | "SANDBOX"
  | "SANDBOX/REJECTED"
  | string;

interface RecentRun {
  id:            string;
  created_at:    string;
  status:        RunStatus;
  currency_pair: string;
  notional:      number;
  hedge_ratio:   number;
}

interface RecentRunsWidgetProps {
  token:     string;
  onRemove?: () => void;
}

function statusChipStyle(status: RunStatus): {
  color: string; borderColor: string; background: string;
} {
  switch (status) {
    case "LEDGER":
      return { color: S.accentGreen, borderColor: `${S.accentGreen}55`, background: `${S.accentGreen}12` };
    case "STAGING":
      return { color: S.accentAmber, borderColor: `${S.accentAmber}55`, background: `${S.accentAmber}12` };
    case "SANDBOX":
      return { color: S.accentCyan,  borderColor: `${S.accentCyan}55`,  background: `${S.accentCyan}12`  };
    case "SANDBOX/REJECTED":
      return { color: S.accentRed,   borderColor: `${S.accentRed}55`,   background: `${S.accentRed}12`   };
    default:
      return { color: S.textTertiary, borderColor: `${S.textTertiary}55`, background: "transparent" };
  }
}

function formatDate(iso: string): string {
  try { return iso.slice(0, 10); } catch { return iso; }
}
function formatNotional(n: number): string {
  return `$${(n / 1_000_000).toFixed(1)}M`;
}
function formatHedge(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      style={{
        fontFamily:    S.fontMono,
        fontSize:      9,
        fontWeight:    600,
        letterSpacing: "0.1em",
        textTransform: "uppercase" as const,
        color:         S.textTertiary,
        padding:       "4px 8px",
        textAlign:     (right ? "right" : "left") as "right" | "left",
        whiteSpace:    "nowrap" as const,
        borderBottom:  `1px solid ${S.border}`,
        background:    S.bgSurface,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children, right, mono,
}: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td
      style={{
        fontFamily:    mono ? S.fontMono : S.fontUI,
        fontSize:      11,
        color:         S.textPrimary,
        padding:       "5px 8px",
        textAlign:     (right ? "right" : "left") as "right" | "left",
        whiteSpace:    "nowrap" as const,
        borderBottom:  `1px solid ${S.border}`,
        verticalAlign: "middle" as const,
      }}
    >
      {children}
    </td>
  );
}

export default function RecentRunsWidget({
  token,
  onRemove,
}: RecentRunsWidgetProps) {
  const [runs,    setRuns]    = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchRuns = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/v1/dashboard/recent-runs", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: RecentRun[] = await res.json();
        if (!cancelled) setRuns(json);
      } catch (err: unknown) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchRuns();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div
      style={{
        fontFamily:    S.fontUI,
        background:    S.bgPanel,
        border:        error ? `1px solid ${S.accentRed}` : `1px solid ${S.border}`,
        borderLeft:    error ? `3px solid ${S.accentRed}` : undefined,
        borderRadius:  6,
        display:       "flex",
        flexDirection: "column",
        minWidth:      0,
        overflow:      "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          8,
          padding:      "8px 12px",
          borderBottom: `1px solid ${S.border}`,
          background:   S.bgSurface,
          borderRadius: "5px 5px 0 0",
        }}
      >
        <History size={13} style={{ color: S.accentCyan, flexShrink: 0 }} />
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      11,
            fontWeight:    600,
            letterSpacing: "0.08em",
            color:         S.textPrimary,
            textTransform: "uppercase",
          }}
        >
          My Recent Runs
        </span>
        <div style={{ flex: 1 }} />
        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: "none",
              border:     "none",
              cursor:     "pointer",
              padding:    2,
              color:      S.textTertiary,
              display:    "flex",
              alignItems: "center",
              lineHeight: 1,
            }}
            title="Remove widget"
            aria-label="Remove Recent Runs widget"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ overflowX: "auto", minHeight: 60 }}>
        {loading && (
          <p style={{
            fontFamily: S.fontMono, fontSize: 11,
            color: S.textTertiary, textAlign: "center",
            margin: "16px 0",
          }}>
            Loading...
          </p>
        )}
        {error && !loading && (
          <p style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, margin: 12 }}>
            Error loading runs
          </p>
        )}
        {!loading && !error && runs.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <p style={{
              fontFamily: S.fontMono, fontSize: 11,
              color: S.textTertiary, margin: "0 0 10px",
            }}>
              No recent calculations. Run your first hedge to get started.
            </p>
            <Link
              href="/currency-fx"
              style={{
                fontFamily:     S.fontMono,
                fontSize:       11,
                color:          S.accentCyan,
                textDecoration: "none",
                letterSpacing:  "0.05em",
              }}
            >
              {"→"} Open CurrencyFX
            </Link>
          </div>
        )}
        {!loading && !error && runs.length > 0 && (
          <table style={{
            width: "100%", borderCollapse: "collapse",
            tableLayout: "fixed" as const,
          }}>
            <colgroup>
              <col style={{ width: 90 }} />
              <col style={{ width: 72 }} />
              <col style={{ width: 72 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 48 }} />
            </colgroup>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Pair</Th>
                <Th right>Notional</Th>
                <Th right>Hedge%</Th>
                <Th>Status</Th>
                <Th>Open</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const chip = statusChipStyle(run.status);
                return (
                  <tr key={run.id}>
                    <Td mono>{formatDate(run.created_at)}</Td>
                    <Td mono>{run.currency_pair}</Td>
                    <Td mono right>{formatNotional(run.notional)}</Td>
                    <Td mono right>{formatHedge(run.hedge_ratio)}</Td>
                    <Td>
                      <span
                        style={{
                          fontFamily:    S.fontMono,
                          fontSize:      9,
                          fontWeight:    600,
                          letterSpacing: "0.08em",
                          color:         chip.color,
                          border:        `1px solid ${chip.borderColor}`,
                          background:    chip.background,
                          borderRadius:  3,
                          padding:       "1px 5px",
                          textTransform: "uppercase" as const,
                          whiteSpace:    "nowrap" as const,
                        }}
                      >
                        {run.status}
                      </span>
                    </Td>
                    <Td>
                      <button
                        disabled
                        style={{
                          fontFamily:   S.fontMono,
                          fontSize:     10,
                          color:        S.textTertiary,
                          background:   "none",
                          border:       `1px solid ${S.border}`,
                          borderRadius: 3,
                          padding:      "1px 5px",
                          cursor:       "not-allowed",
                          opacity:      0.45,
                        }}
                        title="Open run (coming soon)"
                        aria-label="Open run"
                      >
                        {"→"}
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}