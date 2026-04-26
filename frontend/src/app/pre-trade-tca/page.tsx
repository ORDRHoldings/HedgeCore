"use client";

/**
 * /pre-trade-tca — Pre-Trade TCA estimator page.
 *
 * Left pane: trade inputs form.
 * Right pane: cost breakdown card (components + all-in bps + benchmark).
 * Bottom: recent estimates table with variance once reconciled.
 */

import { useEffect, useState } from "react";
import { TrendingDown } from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { useAuth } from "@/lib/authContext";
import { PageShell } from "@/components/layout/PageShell";
import {
  estimatePreTrade,
  listEstimates,
  type TCAEstimate,
  type PreTradeEstimateRequest,
} from "@/lib/api/tcaClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  rim: "var(--border-rim)",
  textPri: "var(--text-primary)",
  textSec: "var(--text-secondary)",
} as const;

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
const fmtBps = (n: number) => `${n.toFixed(2)} bps`;

export default function PreTradeTcaPage() {
  const { token } = useAuth();
  const isMobile = useIsMobile();
  const [req, setReq] = useState<PreTradeEstimateRequest>({
    pair: "EURUSD",
    notional_usd: 5_000_000,
    direction: "BUY",
    instrument: "FWD",
    execution_window_hours: 24,
  });
  const [result, setResult] = useState<TCAEstimate | null>(null);
  const [recent, setRecent] = useState<TCAEstimate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listEstimates(token, { type: "pre_trade", limit: 10 })
      .then(setRecent)
      .catch(() => {
        /* silent — table renders empty state */
      });
  }, [token]);

  const onEstimate = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await estimatePreTrade(token, req);
      setResult(r);
      listEstimates(token, { type: "pre_trade", limit: 10 })
        .then(setRecent)
        .catch(() => {
          /* noop */
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "estimate failed");
    } finally {
      setLoading(false);
    }
  };

  const row = (label: string, value: string | number) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        borderBottom: `1px dashed ${S.rim}`,
      }}
    >
      <span style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 12 }}>{label}</span>
      <span style={{ color: S.textPri, fontFamily: S.fontMono, fontSize: 13 }}>{value}</span>
    </div>
  );

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 8,
    marginBottom: 12,
    background: S.bgDeep,
    color: S.textPri,
    border: `1px solid ${S.rim}`,
    fontFamily: S.fontMono,
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: S.fontUI,
    fontSize: 12,
    color: S.textSec,
    marginBottom: 4,
  };

  return (
    <PageShell icon={TrendingDown} title="Pre-Trade TCA">
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24 }}>
      {/* ───────── Inputs ───────── */}
      <section style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20 }}>
        <h3
          style={{
            fontFamily: S.fontUI,
            fontSize: 13,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginBottom: 16,
            color: S.textPri,
          }}
        >
          Trade Inputs
        </h3>

        <label style={labelStyle}>Pair</label>
        <input
          value={req.pair}
          onChange={(e) => setReq({ ...req, pair: e.target.value.toUpperCase() })}
          style={inputStyle}
        />

        <label style={labelStyle}>Notional (USD)</label>
        <input
          type="number"
          value={req.notional_usd}
          onChange={(e) => setReq({ ...req, notional_usd: Number(e.target.value) })}
          style={inputStyle}
        />

        <label style={labelStyle}>Direction</label>
        <select
          value={req.direction}
          onChange={(e) =>
            setReq({ ...req, direction: e.target.value as "BUY" | "SELL" })
          }
          style={inputStyle}
        >
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>

        <label style={labelStyle}>Instrument</label>
        <select
          value={req.instrument}
          onChange={(e) =>
            setReq({
              ...req,
              instrument: e.target.value as "FWD" | "SPOT" | "NDF" | "OPT",
            })
          }
          style={inputStyle}
        >
          <option>FWD</option>
          <option>SPOT</option>
          <option>NDF</option>
          <option>OPT</option>
        </select>

        <label style={labelStyle}>Execution window (hours)</label>
        <input
          type="number"
          value={req.execution_window_hours}
          onChange={(e) =>
            setReq({ ...req, execution_window_hours: Number(e.target.value) })
          }
          style={{ ...inputStyle, marginBottom: 20 }}
        />

        <button
          onClick={onEstimate}
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            background: "var(--accent-cyan)",
            color: S.bgDeep,
            border: "none",
            fontFamily: S.fontUI,
            fontSize: 13,
            letterSpacing: 1,
            textTransform: "uppercase",
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "ESTIMATING…" : "ESTIMATE COST →"}
        </button>
        {error && (
          <p
            style={{
              color: "var(--accent-red)",
              marginTop: 12,
              fontFamily: S.fontUI,
              fontSize: 12,
            }}
          >
            {error}
          </p>
        )}
      </section>

      {/* ───────── Breakdown ───────── */}
      <section style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20 }}>
        <h3
          style={{
            fontFamily: S.fontUI,
            fontSize: 13,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginBottom: 16,
            color: S.textPri,
          }}
        >
          Cost Breakdown
        </h3>
        {!result ? (
          <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 12 }}>
            Enter trade details and click Estimate to see cost breakdown.
          </p>
        ) : (
          <>
            {row("Slippage", fmtUsd(result.breakdown.slippage_cost))}
            {row("Broker commission", fmtUsd(result.breakdown.broker_commission))}
            {row("Exchange fee", fmtUsd(result.breakdown.exchange_fee))}
            {row("Clearing fee", fmtUsd(result.breakdown.clearing_fee))}
            {row("Vol drift", fmtUsd(result.breakdown.vol_drift_adjustment))}
            <div style={{ marginTop: 12, padding: "12px 0", borderTop: `2px solid ${S.rim}` }}>
              {row("TOTAL", fmtUsd(result.breakdown.total_cost))}
              {row("ALL-IN", fmtBps(result.breakdown.total_cost_bps))}
            </div>
            {result.benchmark && (
              <div
                style={{
                  marginTop: 20,
                  padding: 12,
                  background: S.bgDeep,
                  border: `1px dashed ${S.rim}`,
                }}
              >
                <p
                  style={{
                    color: S.textSec,
                    fontFamily: S.fontUI,
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  BENCHMARK ({result.benchmark.sample_size} samples, 90d)
                </p>
                <p style={{ color: S.textPri, fontFamily: S.fontMono, fontSize: 12 }}>
                  Same-pair avg: {fmtBps(result.benchmark.historical_avg_bps_same_pair)}
                </p>
                <p
                  style={{
                    color:
                      result.benchmark.percentile < 50
                        ? "var(--status-pass)"
                        : "var(--accent-amber)",
                    fontFamily: S.fontMono,
                    fontSize: 12,
                  }}
                >
                  This trade:{" "}
                  {result.benchmark.percentile < 50 ? "▼ CHEAPER" : "▲ MORE EXPENSIVE"} (p
                  {result.benchmark.percentile})
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* ───────── Recent estimates ───────── */}
      <section
        style={{
          gridColumn: "1 / -1",
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          padding: 20,
        }}
      >
        <h3
          style={{
            fontFamily: S.fontUI,
            fontSize: 13,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginBottom: 16,
            color: S.textPri,
          }}
        >
          Recent Estimates
        </h3>
        {recent.length === 0 ? (
          <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 12 }}>
            No estimates yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                <th scope="col" style={{ textAlign: "left", padding: 8 }}>Date</th>
                <th scope="col" style={{ textAlign: "left", padding: 8 }}>Pair</th>
                <th scope="col" style={{ textAlign: "right", padding: 8 }}>Notional</th>
                <th scope="col" style={{ textAlign: "right", padding: 8 }}>All-in</th>
                <th scope="col" style={{ textAlign: "center", padding: 8 }}>Reconciled</th>
                <th scope="col" style={{ textAlign: "right", padding: 8 }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => {
                const inputs = r.inputs as Record<string, unknown>;
                return (
                  <tr key={r.estimate_id} style={{ borderBottom: `1px dashed ${S.rim}` }}>
                    <td style={{ padding: 8, color: S.textPri }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 8, color: S.textPri }}>
                      {String(inputs.pair ?? "—")}
                    </td>
                    <td style={{ padding: 8, color: S.textPri, textAlign: "right" }}>
                      {fmtUsd(Number(inputs.notional_usd ?? 0))}
                    </td>
                    <td style={{ padding: 8, color: S.textPri, textAlign: "right" }}>
                      {fmtBps(r.breakdown.total_cost_bps)}
                    </td>
                    <td
                      style={{
                        padding: 8,
                        textAlign: "center",
                        color: r.reconciled_at ? "var(--status-pass)" : S.textSec,
                      }}
                    >
                      {r.reconciled_at ? "✓" : "—"}
                    </td>
                    <td
                      style={{
                        padding: 8,
                        textAlign: "right",
                        color:
                          r.variance_bps == null
                            ? S.textSec
                            : r.variance_bps > 0
                              ? "var(--accent-amber)"
                              : "var(--status-pass)",
                      }}
                    >
                      {r.variance_bps == null
                        ? "—"
                        : `${r.variance_bps > 0 ? "+" : ""}${r.variance_bps.toFixed(2)} bps`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
    </PageShell>
  );
}
