"use client";
/**
 * /decision-desk
 * Decision Desk — select positions + generate hedge action proposals with IBKR packets.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

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

const ACTION_COLORS: Record<string, string> = {
  HEDGE_IMMEDIATE: S.red,
  HEDGE_STAGED:    S.amber,
  REDUCE_RATIO:    "#a78bfa",
  NO_ACTION:       S.tertiary,
};

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

interface Position {
  id: string;
  currency: string;
  amount: number;
  flow_type: string;
  execution_status: string;
}

interface DecisionProposal {
  rank: number;
  action: string;
  currency_pair: string;
  instrument: string;
  side: string;
  notional_amount: number;
  notional_currency: string;
  hedge_ratio_pct: number;
  residual_exposure: number;
  cost_estimate_usd: number;
  margin_proxy_usd: number;
  rationale: string;
  schedule: Array<{ tranche: number; date: string; amount: number; pct: number }> | null;
  position_ids: string[];
  proposal_hash: string;
}

interface RunResult {
  run_id: string;
  run_hash: string;
  proposals: DecisionProposal[];
  summary: {
    total_hedge_usd: number;
    residual_usd: number;
    cost_usd: number;
    position_count: number;
    proposal_count: number;
  };
  market_snapshot_id: string;
}

interface PastRun {
  run_id: string;
  run_hash: string;
  methodology_version: string;
  status: string;
  created_at: string;
}

export default function DecisionDeskPage() {
  const { token } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pastRuns, setPastRuns] = useState<PastRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [posRes, runRes] = await Promise.all([
        dashboardFetch("/v1/positions?limit=200", token),
        dashboardFetch("/v1/decisions/runs", token),
      ]);
      if (posRes.ok) {
        const d = await posRes.json();
        setPositions((d.items ?? d.positions ?? []).filter(
          (p: Position) => ["READY_TO_EXECUTE", "POLICY_ASSIGNED", "NEW"].includes(p.execution_status)
        ));
      }
      if (runRes.ok) {
        const r = await runRes.json();
        setPastRuns(r.items ?? []);
      }
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const togglePosition = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleRun = async () => {
    if (!token || selected.size === 0) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await dashboardFetch("/v1/decisions/run", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position_ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = (data as Record<string, unknown>).detail;
        if (typeof detail === "object" && detail !== null && (detail as Record<string, string>).error === "NO_MARKET_SNAPSHOT") {
          setError("No market snapshot available. Please capture a market snapshot via FX Rates first.");
        } else {
          setError(typeof detail === "string" ? detail : "Decision run failed.");
        }
        return;
      }
      setResult(data as RunResult);
    } finally { setRunning(false); }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedHash(key);
      setTimeout(() => setCopiedHash(null), 1500);
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, padding: "28px 40px", fontFamily: S.fontUI }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: S.tertiary }}>DECISION DESK</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.cyan, background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`, padding: "1px 6px", borderRadius: 2 }}>DETERMINISTIC</span>
          </div>
          <h1 style={{ fontFamily: S.fontMono, fontSize: 22, fontWeight: 700, color: S.primary, margin: 0, letterSpacing: "-0.02em" }}>
            Hedge Action Generator
          </h1>
          <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginTop: 6, maxWidth: 560 }}>
            Select positions to analyze. The engine applies policy rules deterministically to generate ranked hedge proposals and broker-ready execution packets.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" }}>

        {/* Left: position selector */}
        <div>
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 12 }}>
              Select Positions ({selected.size} selected)
            </div>

            {loading ? (
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>Loading positions…</div>
            ) : positions.length === 0 ? (
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, textAlign: "center", padding: "20px 0" }}>
                No active positions.{" "}
                <Link href="/input" style={{ color: S.cyan, textDecoration: "none" }}>Add one →</Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <button
                    onClick={() => setSelected(new Set(positions.map(p => p.id)))}
                    style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, background: "transparent", border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`, padding: "3px 10px", cursor: "pointer", borderRadius: 2 }}
                  >
                    ALL
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, background: "transparent", border: `1px solid ${S.soft}`, padding: "3px 10px", cursor: "pointer", borderRadius: 2 }}
                  >
                    NONE
                  </button>
                </div>
                {positions.map(pos => {
                  const checked = selected.has(pos.id);
                  return (
                    <div
                      key={pos.id}
                      onClick={() => togglePosition(pos.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 12px", cursor: "pointer",
                        border: `1px solid ${checked ? S.cyan : S.soft}`,
                        background: checked ? `color-mix(in srgb, ${S.cyan} 5%, transparent)` : "transparent",
                        transition: "border-color 100ms",
                      }}
                    >
                      <div style={{
                        width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                        border: `1px solid ${checked ? S.cyan : S.rim}`,
                        background: checked ? S.cyan : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {checked && <span style={{ color: S.bgPanel, fontSize: 9, fontWeight: 900 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, fontWeight: 600 }}>
                          {pos.currency} {new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(pos.amount)}
                        </div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                          {pos.flow_type} · {pos.execution_status}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={handleRun}
            disabled={running || selected.size === 0}
            style={{
              width: "100%",
              fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
              color: S.bgPanel, background: (running || selected.size === 0) ? S.tertiary : S.cyan,
              border: "none", padding: "13px 24px", cursor: (running || selected.size === 0) ? "not-allowed" : "pointer",
              borderRadius: 2,
            }}
          >
            {running ? "GENERATING DECISIONS…" : "GENERATE HEDGE DECISIONS →"}
          </button>

          {/* Past runs */}
          {pastRuns.length > 0 && (
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "16px 20px", marginTop: 20 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 10 }}>
                Past Runs
              </div>
              {pastRuns.slice(0, 5).map(run => (
                <Link
                  key={run.run_id}
                  href={`/decision-desk/runs/${run.run_id}`}
                  style={{ textDecoration: "none", display: "block" }}
                >
                  <div style={{ padding: "8px 0", borderBottom: `1px solid ${S.soft}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.primary }}>{run.run_id.slice(0, 14)}…</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{new Date(run.created_at).toLocaleDateString()}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right: results */}
        <div>
          {error && (
            <div style={{ background: `color-mix(in srgb, ${S.red} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.red} 30%, transparent)`, padding: "12px 16px", marginBottom: 16, fontFamily: S.fontMono, fontSize: 11, color: S.red }}>
              {error}
            </div>
          )}

          {!result && !running && !error && (
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                Select positions on the left and click GENERATE HEDGE DECISIONS to run the analysis.
              </div>
            </div>
          )}

          {result && (
            <div>
              {/* Summary bar */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total Hedge Notional", value: fmt(result.summary.total_hedge_usd), color: S.cyan },
                  { label: "Estimated Cost", value: fmt(result.summary.cost_usd), color: S.amber },
                  { label: "Residual Exposure", value: fmt(result.summary.residual_usd), color: S.primary },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "14px 18px" }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Run hash */}
              <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
                <span>RUN:</span>
                <span style={{ color: S.cyan }}>{result.run_id.slice(0, 16)}…</span>
                <span>HASH:</span>
                <span style={{ color: S.secondary }}>{result.run_hash.slice(0, 16)}…</span>
                <Link href={`/decision-desk/runs/${result.run_id}`} style={{ color: S.cyan, textDecoration: "none", marginLeft: 8, fontSize: 9, fontWeight: 700 }}>
                  FULL DETAIL →
                </Link>
              </div>

              {/* Proposals */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {result.proposals.map(p => {
                  const color = ACTION_COLORS[p.action] ?? S.tertiary;
                  return (
                    <div
                      key={p.proposal_hash}
                      style={{
                        background: S.bgPanel, border: `1px solid ${S.rim}`,
                        borderLeft: `3px solid ${color}`,
                        padding: "16px 20px",
                      }}
                    >
                      {/* Proposal header */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, fontWeight: 700 }}>#{p.rank}</span>
                          <span style={{
                            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                            color, background: `color-mix(in srgb, ${color} 12%, transparent)`,
                            border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
                            padding: "2px 8px", borderRadius: 2,
                          }}>{p.action}</span>
                          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{p.currency_pair}</span>
                          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>{p.instrument}</span>
                          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: p.side === "BUY" ? S.green : S.amber, fontWeight: 700 }}>{p.side}</span>
                        </div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.primary }}>
                          {fmt(p.notional_amount)} {p.notional_currency}
                        </div>
                      </div>

                      {/* Stats row */}
                      {p.action !== "NO_ACTION" && (
                        <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
                          {[
                            { label: "Hedge Ratio", value: `${p.hedge_ratio_pct.toFixed(0)}%` },
                            { label: "Cost ~", value: fmt(p.cost_estimate_usd) },
                            { label: "Margin ~", value: fmt(p.margin_proxy_usd) },
                            { label: "Residual", value: fmt(p.residual_exposure) },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>{label}</div>
                              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, fontWeight: 600 }}>{value}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Rationale */}
                      <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.5, marginBottom: p.action !== "NO_ACTION" ? 10 : 0 }}>
                        {p.rationale}
                      </div>

                      {/* Staged schedule */}
                      {p.schedule && p.schedule.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 6 }}>STAGED SCHEDULE</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {p.schedule.map(t => (
                              <div key={t.tranche} style={{ background: S.bgSub, border: `1px solid ${S.soft}`, padding: "6px 10px", borderRadius: 2 }}>
                                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>Tranche {t.tranche}</div>
                                <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.primary }}>{fmt(t.amount)}</div>
                                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{t.date}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* IBKR copy button */}
                      {p.action !== "NO_ACTION" && (
                        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                          <button
                            onClick={() => {
                              const ibkr = {
                                symbol: `${p.currency_pair.slice(0, 3)}.${p.currency_pair.slice(3)}`,
                                action: p.side,
                                totalQuantity: p.notional_amount,
                                instrument: p.instrument,
                                notionalCurrency: p.notional_currency,
                              };
                              copyToClipboard(JSON.stringify(ibkr, null, 2), p.proposal_hash);
                            }}
                            style={{
                              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                              color: copiedHash === p.proposal_hash ? S.green : S.cyan,
                              background: "transparent",
                              border: `1px solid ${copiedHash === p.proposal_hash ? S.green : `color-mix(in srgb, ${S.cyan} 30%, transparent)`}`,
                              padding: "4px 12px", cursor: "pointer", borderRadius: 2,
                            }}
                          >
                            {copiedHash === p.proposal_hash ? "✓ COPIED" : "COPY IBKR PAYLOAD"}
                          </button>
                          <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, alignSelf: "center" }}>
                            {p.proposal_hash.slice(0, 12)}…
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
