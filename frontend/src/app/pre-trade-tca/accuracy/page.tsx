"use client";

/**
 * /pre-trade-tca/accuracy — TCA model accuracy dashboard.
 *
 * Shows mean variance, stddev, MAE, and bias direction grouped by pair,
 * instrument, or month. Empty state when no reconciled estimates exist.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { getAccuracyReport, type AccuracyReport } from "@/lib/api/tcaClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  rim: "var(--border-rim)",
  textPri: "var(--text-primary)",
  textSec: "var(--text-secondary)",
} as const;

export default function TcaAccuracyPage() {
  const { token } = useAuth();
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `Q${q}-${d.getFullYear()}`;
  });
  const [groupBy, setGroupBy] = useState<"pair" | "instrument" | "month">("pair");
  const [report, setReport] = useState<AccuracyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    getAccuracyReport(token, period, groupBy)
      .then(setReport)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "failed to load accuracy report");
      })
      .finally(() => setLoading(false));
  }, [token, period, groupBy]);

  return (
    <section style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <div>
          <label
            style={{
              display: "block",
              fontFamily: S.fontUI,
              fontSize: 11,
              color: S.textSec,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Period
          </label>
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{
              padding: 6,
              background: S.bgDeep,
              color: S.textPri,
              border: `1px solid ${S.rim}`,
              fontFamily: S.fontMono,
              fontSize: 12,
            }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontFamily: S.fontUI,
              fontSize: 11,
              color: S.textSec,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Group By
          </label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
            style={{
              padding: 6,
              background: S.bgDeep,
              color: S.textPri,
              border: `1px solid ${S.rim}`,
              fontFamily: S.fontMono,
              fontSize: 12,
            }}
          >
            <option value="pair">Pair</option>
            <option value="instrument">Instrument</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>

      {loading && (
        <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 13 }}>Loading…</p>
      )}

      {error && !loading && (
        <p
          style={{
            color: "var(--accent-red)",
            fontFamily: S.fontUI,
            fontSize: 13,
          }}
        >
          {error}
        </p>
      )}

      {!loading && !error && report && report.total_reconciled === 0 && (
        <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 13 }}>
          No reconciled estimates yet for this period. Reconciled estimates appear once
          settlements match pre-trade or post-calc estimates.
        </p>
      )}

      {!loading && !error && report && report.total_reconciled > 0 && (
        <>
          <p
            style={{
              color: S.textPri,
              fontFamily: S.fontMono,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {report.total_reconciled} reconciled estimates
          </p>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: S.fontMono,
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}`, color: S.textSec }}>
                <th style={{ textAlign: "left", padding: 8 }}>{groupBy.toUpperCase()}</th>
                <th style={{ textAlign: "right", padding: 8 }}>Samples</th>
                <th style={{ textAlign: "right", padding: 8 }}>Mean Var</th>
                <th style={{ textAlign: "right", padding: 8 }}>StdDev</th>
                <th style={{ textAlign: "right", padding: 8 }}>MAE</th>
                <th style={{ textAlign: "right", padding: 8 }}>Bias</th>
              </tr>
            </thead>
            <tbody>
              {report.buckets.map((b) => (
                <tr key={b.key} style={{ borderBottom: `1px dashed ${S.rim}` }}>
                  <td style={{ padding: 8, color: S.textPri }}>{b.key}</td>
                  <td style={{ padding: 8, color: S.textPri, textAlign: "right" }}>
                    {b.sample_size}
                  </td>
                  <td
                    style={{
                      padding: 8,
                      color:
                        b.mean_variance_bps > 0
                          ? "var(--accent-amber)"
                          : "var(--status-pass)",
                      textAlign: "right",
                    }}
                  >
                    {b.mean_variance_bps > 0 ? "+" : ""}
                    {b.mean_variance_bps.toFixed(2)} bps
                  </td>
                  <td style={{ padding: 8, color: S.textPri, textAlign: "right" }}>
                    {b.stdev_variance_bps.toFixed(2)}
                  </td>
                  <td style={{ padding: 8, color: S.textPri, textAlign: "right" }}>
                    {b.mae_bps.toFixed(2)}
                  </td>
                  <td
                    style={{
                      padding: 8,
                      color: S.textSec,
                      textAlign: "right",
                      fontSize: 10,
                    }}
                  >
                    {b.bias_direction.replace("_", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
