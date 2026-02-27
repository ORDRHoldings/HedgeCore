"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import type { PositionRow } from "@/api/positionClient";
import type {
  TradeRow,
  MarketSnapshot,
  PolicyConfig,
  FuturesCurrency,
  CalculateResponse,
  BucketResult,
} from "@/api/types";
import { calculate } from "@/api/client";

/* ── Design tokens ─────────────────────────────────────────────────────── */
const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass,#22c55e)",
  fail:      "var(--accent-red,#ef4444)",
} as const;

/* ── Formatters ────────────────────────────────────────────────────────── */
const fmtNum = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const fmtUsd = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/* ── Props ─────────────────────────────────────────────────────────────── */
interface Props {
  positions: PositionRow[];
  token: string;
  onApprove: (calcResult: CalculateResponse, runId: string) => void;
  onBack: () => void;
}

/* ── Component ─────────────────────────────────────────────────────────── */
export default function StepCalculate({
  positions,
  token,
  onApprove,
  onBack,
}: Props) {
  const [result, setResult] = useState<CalculateResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Market data state — auto-fetched on mount
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketSource, setMarketSource] = useState<string>("");

  /* ── Detect currencies and value dates from positions ─────────────── */
  const detectedCurrencies = useMemo(
    () => [...new Set(positions.map((p) => p.currency))],
    [positions]
  );
  const tradeValueDates = useMemo(
    () => positions.map((p) => p.value_date),
    [positions]
  );
  const primaryCurrency = detectedCurrencies[0] ?? "MXN";

  /* ── Auto-fetch market data on mount ──────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    async function fetchMarket() {
      setMarketLoading(true);
      setMarketError(null);
      try {
        const res = await fetch("/api/market-autofill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currencies: detectedCurrencies,
            trade_value_dates: tradeValueDates,
          }),
        });
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            setMarket(data.market);
            const src = data.market?.provider_metadata?.source ?? "unknown";
            setMarketSource(src);
          } else {
            setMarketError(`Market data fetch failed (HTTP ${res.status})`);
            // Fallback: construct minimal market data
            setMarket(buildFallbackMarket(primaryCurrency, tradeValueDates));
            setMarketSource("local_fallback");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setMarketError(`Market data unavailable: ${err instanceof Error ? err.message : "Network error"}`);
          setMarket(buildFallbackMarket(primaryCurrency, tradeValueDates));
          setMarketSource("local_fallback");
        }
      } finally {
        if (!cancelled) setMarketLoading(false);
      }
    }
    fetchMarket();
    return () => { cancelled = true; };
  }, [detectedCurrencies, tradeValueDates, primaryCurrency]);

  /* ── Position → TradeRow mapping ──────────────────────────────────── */
  const trades: TradeRow[] = useMemo(
    () =>
      positions.map((p) => ({
        record_id: p.record_id,
        entity: p.entity ?? "UNKNOWN",
        type: (p.type ?? "AR") as "AR" | "AP",
        currency: p.currency as FuturesCurrency,
        amount: p.amount,
        value_date: p.value_date,
        status: (p.status ?? "CONFIRMED") as "CONFIRMED" | "FORECAST",
        description: p.description ?? "",
      })),
    [positions],
  );

  /* ── Policy defaults ────────────────────────────────────────────── */
  const policy: PolicyConfig = useMemo(
    () => ({
      bucket_mode: "CALENDAR_MONTH" as const,
      hedge_ratios: { confirmed: 1.0, forecast: 0.0 },
      cost_assumptions: { spread_bps: 5 },
      execution_product: "FWD" as const,
      min_trade_size_usd: 0,
    }),
    [],
  );

  /* ── Currency summary line ────────────────────────────────────────── */
  const ccySummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of positions) {
      map.set(p.currency, (map.get(p.currency) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([ccy, count]) => ({ ccy, count }));
  }, [positions]);

  /* ── Run engine ───────────────────────────────────────────────────── */
  const runEngine = useCallback(async () => {
    if (!market) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await calculate({
        trades,
        hedges: [],
        market,
        policy,
      });
      setResult(res);
    } catch (err: unknown) {
      // Extract detailed validation errors from 422 response
      let msg = "Unknown calculation error";
      if (err instanceof Error) {
        msg = err.message;
      }
      // Try to get validation details from axios response
      const axiosErr = err as { response?: { data?: { detail?: { validation_report?: { errors?: Array<{ code?: string; message?: string }> } } } } };
      const valErrors = axiosErr?.response?.data?.detail?.validation_report?.errors;
      if (valErrors && valErrors.length > 0) {
        msg = valErrors.map((e) => `[${e.code}] ${e.message}`).join(" · ");
      }
      setError(msg);
    } finally {
      setRunning(false);
    }
  }, [trades, market, policy]);

  /* ── Derived ──────────────────────────────────────────────────────── */
  const validationPassed = result?.validation_report?.status === "PASS";
  const buckets: BucketResult[] = result?.hedge_plan?.buckets ?? [];
  const summary = result?.hedge_plan?.summary;
  const scenarios = result?.scenario_results?.totals ?? [];

  /* ── Spot display label ────────────────────────────────────────────── */
  const spotLabel = market?.provider_metadata?.currency_pair
    ? String(market.provider_metadata.currency_pair)
    : `USD/${primaryCurrency}`;

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        fontFamily: S.fontUI,
        color: S.primary,
      }}
    >
      {/* ═══ Section 1: Selected Positions Summary ═══ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          background: S.bgSub,
          borderBottom: `1px solid ${S.rim}`,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
          {positions.length} position{positions.length !== 1 ? "s" : ""} selected
        </span>
        <span style={{ width: 1, height: 14, background: S.soft, flexShrink: 0 }} />
        {ccySummary.map(({ ccy, count }) => (
          <span
            key={ccy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 22,
              padding: "0 8px",
              borderRadius: 3,
              background: S.bgDeep,
              border: `1px solid ${S.soft}`,
              fontFamily: S.fontMono,
              fontSize: 10,
              fontWeight: 600,
              color: S.primary,
              letterSpacing: "0.04em",
            }}
          >
            {count} {ccy}
          </span>
        ))}
      </div>

      {/* ═══ Section 2: Engine Control ═══ */}
      <div style={{ padding: "16px 16px", borderBottom: `1px solid ${S.rim}`, flexShrink: 0 }}>
        {/* Market snapshot info */}
        {marketLoading ? (
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.amber, marginBottom: 14 }}>
            ⟳ Fetching live market data for {detectedCurrencies.join(", ")}...
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.08em", color: S.tertiary, textTransform: "uppercase" as const }}>
              Spot {spotLabel}:{" "}
              <span style={{ color: S.primary, fontWeight: 600 }}>
                {market ? fmtDec.format(market.spot_usdmxn) : "—"}
              </span>
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
              As of: {market ? new Date(market.as_of).toLocaleString() : "—"}
            </span>
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 8,
                letterSpacing: "0.06em",
                padding: "1px 6px",
                borderRadius: 2,
                background: marketSource.includes("live") ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
                color: marketSource.includes("live") ? S.pass : S.amber,
                border: `1px solid ${marketSource.includes("live") ? S.pass : S.amber}`,
              }}
            >
              {marketSource.includes("live") ? "LIVE" : marketSource.includes("fallback") ? "INDICATIVE" : "FALLBACK"}
            </span>
            {market?.forward_points_by_month && (
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                {Object.keys(market.forward_points_by_month).length} fwd points loaded
              </span>
            )}
          </div>
        )}

        {marketError && (
          <div style={{
            marginBottom: 10, padding: "6px 10px", background: "rgba(245,158,11,0.08)",
            border: `1px solid ${S.amber}`, borderRadius: 3,
            fontFamily: S.fontMono, fontSize: 10, color: S.amber,
          }}>
            ⚠ {marketError} — using fallback rates
          </div>
        )}

        {/* Run button */}
        <button
          onClick={runEngine}
          disabled={running || marketLoading || !market}
          style={{
            height: 44,
            padding: "0 32px",
            background: running || marketLoading ? S.bgSub : S.cyan,
            color: running || marketLoading ? S.tertiary : S.bgDeep,
            border: running || marketLoading ? `1px solid ${S.soft}` : `2px solid ${S.cyan}`,
            borderRadius: 4,
            fontFamily: S.fontMono,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.10em",
            cursor: running || marketLoading ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            animation: !running && !result && !marketLoading && market ? "pulse-border 2s infinite" : "none",
          }}
        >
          {running ? "COMPUTING HEDGE PLAN..." : marketLoading ? "LOADING MARKET DATA..." : "\u25B6 RUN HEDGE ENGINE"}
        </button>

        {/* Error banner */}
        {error && (
          <div style={{
            marginTop: 12, padding: "10px 14px",
            background: "rgba(239,68,68,0.08)", border: `1px solid ${S.fail}`,
            borderRadius: 4, fontFamily: S.fontMono, fontSize: 11, color: S.fail,
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* ═══ Section 3: Results ═══ */}
      {result && (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {/* Validation banner */}
          <div style={{
            margin: "12px 16px 0", padding: "8px 14px", borderRadius: 4,
            background: validationPassed ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${validationPassed ? S.pass : S.fail}`,
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", color: validationPassed ? S.pass : S.fail,
          }}>
            {validationPassed ? "✓ VALIDATION PASSED" : "✗ VALIDATION FAILED"}
            {result.validation_report?.errors?.length > 0 && (
              <span style={{ fontWeight: 400, marginLeft: 12 }}>
                {result.validation_report.errors.map((e) => e.message).join("; ")}
              </span>
            )}
          </div>

          {/* Run ID */}
          {result.run_id && (
            <div style={{
              margin: "8px 16px 0", fontFamily: S.fontMono, fontSize: 9,
              color: S.tertiary, letterSpacing: "0.06em",
            }}>
              RUN ID: {result.run_id.slice(0, 12).toUpperCase()}
              {result.run_envelope?.inputs_hash && (
                <span style={{ marginLeft: 12 }}>
                  HASH: {result.run_envelope.inputs_hash.slice(0, 8).toUpperCase()}
                </span>
              )}
            </div>
          )}

          {/* Hedge plan table */}
          {buckets.length > 0 && (
            <div style={{ margin: "12px 16px 0" }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 9, fontWeight: 600,
                letterSpacing: "0.12em", color: S.tertiary,
                textTransform: "uppercase" as const, marginBottom: 8,
              }}>
                Hedge Plan — Per-Bucket Actions
              </div>

              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "100px 120px 100px 120px 110px 90px 90px 80px",
                alignItems: "center", height: 32, padding: "0 8px",
                background: S.bgSub, borderBottom: `1px solid ${S.rim}`,
                fontFamily: S.fontMono, fontSize: 9, fontWeight: 600,
                letterSpacing: "0.08em", color: S.tertiary,
                textTransform: "uppercase" as const,
              }}>
                <span>Bucket</span>
                <span style={{ textAlign: "right" }}>Exposure</span>
                <span>Direction</span>
                <span style={{ textAlign: "right" }}>Action</span>
                <span style={{ textAlign: "right" }}>Action (USD)</span>
                <span style={{ textAlign: "right" }}>Fwd Rate</span>
                <span style={{ textAlign: "right" }}>Cost (USD)</span>
                <span>Status</span>
              </div>

              {/* Table rows */}
              {buckets.map((b) => {
                const isSell = b.action_direction?.includes("SELL");
                return (
                  <div
                    key={b.bucket}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "100px 120px 100px 120px 110px 90px 90px 80px",
                      alignItems: "center", height: 32, padding: "0 8px",
                      borderBottom: `1px solid ${S.soft}`,
                      fontFamily: S.fontMono, fontSize: 11,
                      opacity: b.suppressed ? 0.4 : 1,
                      textDecoration: b.suppressed ? "line-through" : "none",
                    }}
                  >
                    <span style={{ color: S.primary, fontWeight: 600 }}>{b.bucket}</span>
                    <span style={{ textAlign: "right", color: S.secondary }}>
                      {fmtNum.format(b.commercial_exposure_mxn)}
                    </span>
                    <span>
                      {b.action_direction ? (
                        <span style={{
                          display: "inline-block", padding: "1px 6px", borderRadius: 3,
                          fontSize: 8, fontWeight: 700, letterSpacing: "0.06em",
                          background: isSell ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                          color: isSell ? S.fail : S.pass,
                          border: `1px solid ${isSell ? S.fail : S.pass}`,
                        }}>
                          {b.action_direction.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span style={{ color: S.tertiary }}>&mdash;</span>
                      )}
                    </span>
                    <span style={{ textAlign: "right", color: S.primary }}>{fmtNum.format(b.action_mxn)}</span>
                    <span style={{ textAlign: "right", color: S.secondary }}>{fmtUsd.format(b.action_usd)}</span>
                    <span style={{ textAlign: "right", color: S.tertiary }}>{fmtDec.format(b.forward_rate)}</span>
                    <span style={{ textAlign: "right", color: b.friction_usd > 0 ? S.amber : S.tertiary }}>
                      {fmtUsd.format(b.friction_usd)}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                      color: b.suppressed ? S.amber : S.pass,
                    }}>
                      {b.suppressed ? "SUPPRESSED" : "ACTIVE"}
                    </span>
                  </div>
                );
              })}

              {/* Summary bar */}
              {summary && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "100px 120px 100px 120px 110px 90px 90px 80px",
                  alignItems: "center", height: 36, padding: "0 8px",
                  background: S.bgSub, borderTop: `2px solid ${S.rim}`,
                  fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
                }}>
                  <span style={{ letterSpacing: "0.08em", fontSize: 9, color: S.tertiary }}>TOTAL</span>
                  <span style={{ textAlign: "right", color: S.primary }}>{fmtNum.format(summary.total_commercial_exposure_mxn)}</span>
                  <span />
                  <span style={{ textAlign: "right", color: S.primary }}>{fmtNum.format(summary.total_action_mxn)}</span>
                  <span style={{ textAlign: "right", color: S.secondary }}>{fmtUsd.format(summary.total_action_usd)}</span>
                  <span />
                  <span style={{ textAlign: "right", color: S.amber }}>{fmtUsd.format(summary.total_friction_usd)}</span>
                  <span />
                </div>
              )}
            </div>
          )}

          {/* Scenario Results */}
          {scenarios.length > 0 && (
            <div style={{ margin: "16px 16px 0" }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 9, fontWeight: 600,
                letterSpacing: "0.12em", color: S.tertiary,
                textTransform: "uppercase" as const, marginBottom: 8,
              }}>
                Scenario Analysis
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 0 }}>
                {["Sigma", "Shocked Spot", "Unhedged (USD)", "Benefit (USD)"].map((h) => (
                  <div key={h} style={{
                    padding: "6px 8px", background: S.bgSub,
                    borderBottom: `1px solid ${S.rim}`, fontFamily: S.fontMono,
                    fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
                    color: S.tertiary, textTransform: "uppercase" as const,
                  }}>
                    {h}
                  </div>
                ))}
                {scenarios.map((sc) => (
                  <div key={sc.sigma} style={{ display: "contents" }}>
                    <div style={{
                      padding: "6px 8px", fontFamily: S.fontMono, fontSize: 11, fontWeight: 600,
                      color: sc.sigma < 0 ? S.fail : sc.sigma > 0 ? S.pass : S.primary,
                      borderBottom: `1px solid ${S.soft}`,
                    }}>
                      {sc.sigma > 0 ? "+" : ""}{sc.sigma}σ
                    </div>
                    <div style={{ padding: "6px 8px", fontFamily: S.fontMono, fontSize: 11, color: S.secondary, borderBottom: `1px solid ${S.soft}` }}>
                      {fmtDec.format(sc.shocked_spot)}
                    </div>
                    <div style={{ padding: "6px 8px", fontFamily: S.fontMono, fontSize: 11, color: S.secondary, borderBottom: `1px solid ${S.soft}` }}>
                      {fmtUsd.format(sc.total_unhedged_usd)}
                    </div>
                    <div style={{
                      padding: "6px 8px", fontFamily: S.fontMono, fontSize: 11, fontWeight: 600,
                      color: sc.total_hedge_benefit_usd > 0 ? S.pass : sc.total_hedge_benefit_usd < 0 ? S.fail : S.tertiary,
                      borderBottom: `1px solid ${S.soft}`,
                    }}>
                      {fmtUsd.format(sc.total_hedge_benefit_usd)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ height: 16 }} />
        </div>
      )}

      {/* ═══ Footer: CTA buttons ═══ */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 56, padding: "0 16px", background: S.bgPanel,
        borderTop: `1px solid ${S.rim}`, flexShrink: 0, marginTop: "auto",
      }}>
        <button onClick={onBack} style={{
          height: 36, padding: "0 20px", background: "transparent",
          color: S.tertiary, border: `1px solid ${S.soft}`, borderRadius: 4,
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 600,
          letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.15s",
        }}>
          &#9666; BACK TO REVIEW
        </button>
        <button
          disabled={!result || !validationPassed}
          onClick={() => {
            if (result) {
              const runId = result.run_envelope?.run_id ?? result.run_id;
              onApprove(result, runId);
            }
          }}
          style={{
            height: 36, padding: "0 24px",
            background: result && validationPassed ? S.pass : S.bgSub,
            color: result && validationPassed ? S.bgDeep : S.tertiary,
            border: "none", borderRadius: 4, fontFamily: S.fontMono,
            fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
            cursor: result && validationPassed ? "pointer" : "not-allowed",
            opacity: result && validationPassed ? 1 : 0.5,
            transition: "all 0.15s",
          }}
        >
          APPROVE HEDGE PLAN &#9656;
        </button>
      </div>

      <style>{`
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,255,255,0.3); }
          50% { box-shadow: 0 0 0 4px rgba(0,255,255,0.1); }
        }
      `}</style>
    </div>
  );
}

/* ── Fallback market data builder ─────────────────────────────────────── */
function buildFallbackMarket(currency: string, valueDates: string[]): MarketSnapshot {
  // Fallback spot rates (indicative)
  const FALLBACK_SPOTS: Record<string, number> = {
    MXN: 18.97, EUR: 0.9210, GBP: 0.7882, JPY: 149.80,
    CAD: 1.3950, AUD: 1.5290, CHF: 0.8830, BRL: 5.0800,
    NZD: 1.5750, CNY: 7.2450, INR: 83.10, SEK: 10.85,
    NOK: 10.72, DKK: 6.87, PLN: 4.02, CZK: 23.15,
    HUF: 358.5, ZAR: 18.60, TRY: 30.50, RUB: 91.50,
  };

  // Carry rate (bps/month) for forward point estimation
  const CARRY_BPS: Record<string, number> = {
    MXN: 48, EUR: -5, GBP: -2, JPY: -10,
    CAD: 2, AUD: 5, CHF: -8, BRL: 35,
    NZD: 5, CNY: 3, INR: 15, SEK: -3,
  };

  const spot = FALLBACK_SPOTS[currency] ?? 1.0;
  const carry = CARRY_BPS[currency] ?? 0;

  // Generate forward points for all months covered by value dates + 3 months buffer
  const fwdPoints: Record<string, number> = {};
  const now = new Date();
  const allDates = [...valueDates, now.toISOString().slice(0, 10)];
  const months = new Set<string>();

  for (const d of allDates) {
    const dt = new Date(d);
    // Add this month and surrounding months
    for (let m = -1; m <= 18; m++) {
      const target = new Date(dt);
      target.setMonth(target.getMonth() + m);
      months.add(target.toISOString().slice(0, 7)); // YYYY-MM
    }
  }

  // Also ensure we cover from now to the farthest value date
  const nowMonth = now.getFullYear() * 12 + now.getMonth();
  for (const bucket of Array.from(months).sort()) {
    const [y, m] = bucket.split("-").map(Number);
    const bucketMonth = y * 12 + (m - 1);
    const monthsAhead = Math.max(0, bucketMonth - nowMonth);
    fwdPoints[bucket] = Number((spot * (carry * monthsAhead) / 10000).toFixed(6));
  }

  return {
    as_of: now.toISOString(),
    spot_usdmxn: spot,
    forward_points_by_month: fwdPoints,
    provider_metadata: { source: "local_fallback", currency_pair: `USD/${currency}` },
  };
}
