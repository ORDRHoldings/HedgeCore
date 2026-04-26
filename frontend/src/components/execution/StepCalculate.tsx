"use client";

/**
 * StepCalculate — Step 2 of the Execution Pipeline
 *
 * Runs the hedge calculation engine PER CURRENCY GROUP.
 * Each currency has its own spot rate, forward curve, and risk characteristics.
 * Results are aggregated for display and passed to Step 3.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { PositionRow } from "@/api/positionClient";
import type {
  TradeRow,
  MarketSnapshot,
  PolicyConfig,
  FuturesCurrency,
  CalculateResponse,
  BucketResult,
} from "@/api/types";
import { calculate, persistMarketSnapshot } from "@/api/client";

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
const fmtDec = new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtUsd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/* ── PRICE_CCY currencies (quoted as CCY/USD) ─────────────────────────── */
const PRICE_CCY = new Set(["EUR", "GBP", "AUD", "NZD", "CHF"]);

/* ── Per-currency calculation result ──────────────────────────────────── */
interface CurrencyCalcResult {
  currency: string;
  positions: PositionRow[];
  market: MarketSnapshot;
  snapshotId: string | null;
  result: CalculateResponse | null;
  error: string | null;
  status: "pending" | "running" | "done" | "error";
}

/* ── Props ─────────────────────────────────────────────────────────────── */
interface Props {
  positions: PositionRow[];
  token: string;
  onApprove: (calcResult: CalculateResponse, runId: string) => void;
  onBack: () => void;
}

/* ── Component ─────────────────────────────────────────────────────────── */
export default function StepCalculate({ positions, token, onApprove, onBack }: Props) {
  const [currencyResults, setCurrencyResults] = useState<CurrencyCalcResult[]>([]);
  const [running, setRunning] = useState(false);
  const [marketLoading, setMarketLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [marketDataFallback, setMarketDataFallback] = useState(false);
  const fetchedRef = useRef(false);

  /* ── Group positions by currency ────────────────────────────────────── */
  const currencyGroups = useMemo(() => {
    const map = new Map<string, PositionRow[]>();
    for (const p of positions) {
      const arr = map.get(p.currency) ?? [];
      arr.push(p);
      map.set(p.currency, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      // Sort by total notional descending
      const totalA = a[1].reduce((s, p) => s + Math.abs(p.amount), 0);
      const totalB = b[1].reduce((s, p) => s + Math.abs(p.amount), 0);
      return totalB - totalA;
    });
  }, [positions]);

  /* ── Fetch market data for each currency on mount ───────────────────── */
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchAllMarkets() {
      setMarketLoading(true);
      const results: CurrencyCalcResult[] = [];

      for (const [currency, posGroup] of currencyGroups) {
        const valueDates = posGroup.map((p) => p.value_date);
        let market: MarketSnapshot;

        try {
          const res = await fetch("/api/market-autofill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              currencies: [currency],
              trade_value_dates: valueDates,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            market = data.market;
          } else {
            market = buildFallbackMarket(currency, valueDates);
          }
        } catch {
          market = buildFallbackMarket(currency, valueDates);
        }

        // Persist market snapshot to backend WORM store (non-fatal)
        let snapshotId: string | null = null;
        try {
          const snap = await persistMarketSnapshot(market);
          snapshotId = snap.snapshot_id;
        } catch {
          // Snapshot persistence is best-effort; calculation still proceeds
        }

        results.push({
          currency,
          positions: posGroup,
          market,
          snapshotId,
          result: null,
          error: null,
          status: "pending",
        });
      }

      setCurrencyResults(results);
      // Detect if any currency used a fallback (non-live) market data source
      const anyFallback = results.some((r) => {
        const src = String(r.market.provider_metadata?.source ?? "fallback");
        return !src.includes("live");
      });
      setMarketDataFallback(anyFallback);
      setMarketLoading(false);
    }

    fetchAllMarkets();
  }, [currencyGroups]);

  /* ── Policy defaults ────────────────────────────────────────────── */
  const policy: PolicyConfig = useMemo(
    () => ({
      bucket_mode: "CALENDAR_MONTH" as const,
      hedge_ratios: { confirmed: 1.0, forecast: 0.0 },
      cost_assumptions: { spread_bps: 5 },
      execution_product: "FWD" as const,
      min_trade_size_usd: 0,
      allow_indicative_proxy: true,
    }),
    [],
  );

  /* ── Run engine for ALL currency groups ──────────────────────────── */
  const runEngine = useCallback(async () => {
    setRunning(true);
    setGlobalError(null);

    const updated = [...currencyResults];

    for (let i = 0; i < updated.length; i++) {
      const cr = { ...updated[i], status: "running" as const, error: null, result: null };
      updated[i] = cr;
      setCurrencyResults([...updated]);

      // Build trades for this currency group
      const trades: TradeRow[] = cr.positions.map((p) => ({
        record_id: p.record_id,
        entity: p.entity ?? "UNKNOWN",
        type: (p.type ?? "AR") as "AR" | "AP",
        currency: p.currency as FuturesCurrency,
        amount: p.amount,
        value_date: p.value_date,
        status: (p.status ?? "CONFIRMED") as "CONFIRMED" | "FORECAST",
        description: p.description ?? "",
      }));

      try {
        const res = await calculate({ trades, hedges: [], market: cr.market, policy, ...(cr.snapshotId ? { market_snapshot_id: cr.snapshotId } : {}) }, token);
        updated[i] = { ...cr, result: res, status: "done" };
      } catch (err: unknown) {
        let msg = "Calculation error";
        if (err instanceof Error) msg = err.message;

        // Extract validation details from 422 response
        const axiosErr = err as { response?: { data?: { detail?: string | { validation_report?: { errors?: Array<{ code?: string; message?: string }> } } } } };
        const detail = axiosErr?.response?.data?.detail;
        if (typeof detail === "string") {
          msg = detail;
        } else if (detail?.validation_report?.errors?.length) {
          msg = detail.validation_report.errors.map((e) => `[${e.code}] ${e.message}`).join(" · ");
        }
        updated[i] = { ...cr, error: msg, status: "error" };
      }

      setCurrencyResults([...updated]);
    }

    setRunning(false);
  }, [currencyResults, policy, token]);

  /* ── Derived aggregations ────────────────────────────────────────── */
  const allDone = currencyResults.length > 0 && currencyResults.every((cr) => cr.status === "done");
  const anyError = currencyResults.some((cr) => cr.status === "error");
  const allValidationPassed = currencyResults.every(
    (cr) => cr.result?.validation_report?.status === "PASS"
  );

  // Merge run IDs for downstream pipeline
  const mergedRunIds = currencyResults
    .filter((cr) => cr.result)
    .map((cr) => cr.result!.run_envelope?.run_id ?? cr.result!.run_id);

  // Build a merged CalculateResponse for passing to Step 3
  // Uses the first successful result as the base, then merges buckets
  const mergedResult: CalculateResponse | null = useMemo(() => {
    const successful = currencyResults.filter((cr) => cr.result);
    if (successful.length === 0) return null;

    const base = successful[0].result!;
    if (successful.length === 1) return base;

    // Merge buckets from all currency results
    const allBuckets: BucketResult[] = [];
    let totalExposure = 0, totalAction = 0, totalActionUsd = 0, totalFriction = 0;
    let totalHedgePos = 0, totalResidual = 0, totalExistingHedges = 0;

    for (const cr of successful) {
      const hp = cr.result!.hedge_plan;
      for (const b of hp.buckets) {
        // Tag bucket with currency for display
        allBuckets.push({
          ...b,
          bucket: `${cr.currency} ${b.bucket}`,
        });
      }
      if (hp.summary) {
        totalExposure += hp.summary.total_commercial_exposure_mxn;
        totalAction += hp.summary.total_action_mxn;
        totalActionUsd += hp.summary.total_action_usd;
        totalFriction += hp.summary.total_friction_usd;
        totalHedgePos += hp.summary.total_hedge_position_mxn;
        totalResidual += hp.summary.total_residual_mxn;
        totalExistingHedges += hp.summary.total_existing_hedges_mxn;
      }
    }

    return {
      ...base,
      hedge_plan: {
        buckets: allBuckets,
        summary: {
          total_commercial_exposure_mxn: totalExposure,
          total_existing_hedges_mxn: totalExistingHedges,
          total_action_mxn: totalAction,
          total_action_usd: totalActionUsd,
          total_friction_usd: totalFriction,
          total_hedge_position_mxn: totalHedgePos,
          total_residual_mxn: totalResidual,
        },
      },
    };
  }, [currencyResults]);

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      minHeight: 0, fontFamily: S.fontUI, color: S.primary,
    }}>
      {/* ═══ Header: Position Summary ═══ */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
        background: S.bgSub, borderBottom: `1px solid ${S.rim}`,
        flexShrink: 0, flexWrap: "wrap",
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>
          {positions.length} position{positions.length !== 1 ? "s" : ""} selected
        </span>
        <span style={{ width: 1, height: 14, background: S.soft, flexShrink: 0 }} />
        {currencyGroups.map(([ccy, posGroup]) => (
          <span key={ccy} style={{
            display: "inline-flex", alignItems: "center", height: 22,
            padding: "0 8px", borderRadius: 3, background: S.bgDeep,
            border: `1px solid ${S.soft}`, fontFamily: S.fontMono,
            fontSize: 12, fontWeight: 600, color: S.primary, letterSpacing: "0.04em",
          }}>
            {posGroup.length} {ccy}
          </span>
        ))}
        <span style={{ width: 1, height: 14, background: S.soft, flexShrink: 0 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
          {currencyGroups.length} currency group{currencyGroups.length !== 1 ? "s" : ""}
          {" · "}separate engine run per currency
        </span>
      </div>

      {/* ═══ Market Data + Engine Control ═══ */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.rim}`, flexShrink: 0 }}>
        {marketLoading ? (
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber, marginBottom: 14 }}>
            ⟳ Fetching market data for {currencyGroups.map(([c]) => c).join(", ")}...
          </div>
        ) : (
          <>
            {/* Market data per currency */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              {currencyResults.map((cr) => {
                const isPrice = PRICE_CCY.has(cr.currency);
                const pairLabel = cr.market.provider_metadata?.currency_pair
                  ? String(cr.market.provider_metadata.currency_pair)
                  : isPrice ? `${cr.currency}/USD` : `USD/${cr.currency}`;
                const src = String(cr.market.provider_metadata?.source ?? "fallback");
                const isLive = src.includes("live");
                const fwdCount = Object.keys(cr.market.forward_points_by_month ?? {}).length;

                return (
                  <div key={cr.currency} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", borderRadius: 4,
                    background: S.bgDeep, border: `1px solid ${S.soft}`,
                  }}>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                      color: S.cyan, letterSpacing: "0.04em",
                    }}>
                      {cr.currency}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                      {pairLabel}:
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.primary }}>
                      {fmtDec.format(cr.market.spot_rate)}
                    </span>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 10, padding: "1px 4px",
                      borderRadius: 2, letterSpacing: "0.06em",
                      background: isLive ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
                      color: isLive ? S.pass : S.amber,
                      border: `1px solid ${isLive ? S.pass : S.amber}`,
                    }}>
                      {isLive ? "LIVE" : "IND"}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                      {fwdCount}fwd
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Fallback market data warning banner */}
            {marketDataFallback && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 10,
                background: "rgba(251,191,36,0.08)",
                border: "1px solid var(--accent-amber)",
                color: "var(--accent-amber)",
                fontFamily: S.fontMono,
                fontSize: 12,
                padding: "8px 16px",
              }}>
                ⚠ MARKET DATA: FALLBACK — Live rates unavailable, using last-known prices. Review spot rates before approving.
              </div>
            )}
          </>
        )}

        {/* Input summary */}
        {!marketLoading && currencyGroups.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            padding: "7px 12px", marginBottom: 12,
            background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 4,
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.08em" }}>QUEUED INPUT</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, fontWeight: 600 }}>{positions.length} position{positions.length !== 1 ? "s" : ""}</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.soft }}>·</span>
            {currencyGroups.map(([ccy, grp]) => (
              <span key={ccy} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, fontWeight: 600 }}>
                {ccy} {fmtNum.format(grp.reduce((s, p) => s + p.amount, 0))}
              </span>
            ))}
          </div>
        )}

        {/* Run button */}
        <button
          onClick={runEngine}
          disabled={running || marketLoading || currencyResults.length === 0}
          style={{
            height: 44, padding: "0 32px",
            background: running || marketLoading ? S.bgSub : S.cyan,
            color: running || marketLoading ? S.tertiary : S.bgDeep,
            border: running || marketLoading ? `1px solid ${S.soft}` : `2px solid ${S.cyan}`,
            borderRadius: 4, fontFamily: S.fontMono, fontSize: 13,
            fontWeight: 700, letterSpacing: "0.10em",
            cursor: running || marketLoading ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            animation: !running && !allDone && !marketLoading ? "pulse-border 2s infinite" : "none",
          }}
        >
          {running
            ? `COMPUTING... (${currencyResults.filter((c) => c.status === "done").length}/${currencyResults.length})`
            : marketLoading
              ? "LOADING MARKET DATA..."
              : `▶ RUN HEDGE ENGINE (${currencyGroups.length} CURRENCIES)`
          }
        </button>

        {globalError && (
          <div style={{
            marginTop: 12, padding: "10px 14px", background: "rgba(239,68,68,0.08)",
            border: `1px solid ${S.fail}`, borderRadius: 4,
            fontFamily: S.fontMono, fontSize: 12, color: S.fail, lineHeight: 1.5,
          }}>
            {globalError}
          </div>
        )}
      </div>

      {/* ═══ Results: Per-Currency Cards ═══ */}
      {currencyResults.some((cr) => cr.status !== "pending") && (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "0 0 16px" }}>
          {currencyResults.map((cr) => (
            <CurrencyResultCard key={cr.currency} cr={cr} />
          ))}

          {/* Aggregate Summary */}
          {allDone && mergedResult?.hedge_plan?.summary && (
            <div style={{
              margin: "16px 16px 0", padding: "12px 16px", borderRadius: 6,
              background: S.bgSub, border: `1px solid ${S.rim}`,
            }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                letterSpacing: "0.12em", color: S.cyan, marginBottom: 10,
                textTransform: "uppercase" as const,
              }}>
                ◆ Aggregate Summary — All Currencies
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <SummaryKPI label="Total Exposure" value={fmtNum.format(mergedResult.hedge_plan.summary.total_commercial_exposure_mxn)} unit="local ccy" />
                <SummaryKPI label="Total Action" value={fmtNum.format(mergedResult.hedge_plan.summary.total_action_mxn)} unit="local ccy" />
                <SummaryKPI label="Action (USD eq.)" value={`$${fmtUsd.format(mergedResult.hedge_plan.summary.total_action_usd)}`} unit="" />
                <SummaryKPI label="Total Friction" value={`$${fmtUsd.format(mergedResult.hedge_plan.summary.total_friction_usd)}`} unit="" />
              </div>
            </div>
          )}
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
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
          letterSpacing: "0.08em", cursor: "pointer",
        }}>
          &#9666; BACK TO REVIEW
        </button>
        <button
          disabled={!allDone || !allValidationPassed || anyError}
          onClick={() => {
            if (mergedResult) {
              // Combine run IDs with semicolons
              const combinedRunId = mergedRunIds.join(";");
              onApprove(mergedResult, combinedRunId);
            }
          }}
          style={{
            height: 36, padding: "0 24px",
            background: allDone && allValidationPassed ? S.pass : S.bgSub,
            color: allDone && allValidationPassed ? S.bgDeep : S.tertiary,
            border: "none", borderRadius: 4, fontFamily: S.fontMono,
            fontSize: 12, fontWeight: 700, letterSpacing: "0.10em",
            cursor: allDone && allValidationPassed ? "pointer" : "not-allowed",
            opacity: allDone && allValidationPassed ? 1 : 0.5,
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

/* ══════════════════════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════════════════════ */

function SummaryKPI({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 12, color: "var(--text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
        {value}
      </div>
      {unit && (
        <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
          {unit}
        </div>
      )}
    </div>
  );
}

function CurrencyResultCard({ cr }: { cr: CurrencyCalcResult }) {
  const isPrice = PRICE_CCY.has(cr.currency);
  const pairLabel = isPrice ? `${cr.currency}/USD` : `USD/${cr.currency}`;
  const totalNotional = cr.positions.reduce((s, p) => s + Math.abs(p.amount), 0);
  const validationPassed = cr.result?.validation_report?.status === "PASS";
  const buckets: BucketResult[] = cr.result?.hedge_plan?.buckets ?? [];
  const summary = cr.result?.hedge_plan?.summary;
  const scenarios = cr.result?.scenario_results?.totals ?? [];

  return (
    <div style={{
      margin: "12px 16px 0", borderRadius: 6,
      border: `1px solid ${cr.status === "error" ? S.fail : cr.status === "done" ? S.pass : S.soft}`,
      overflow: "hidden",
    }}>
      {/* Card header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 14px", background: S.bgSub,
        borderBottom: `1px solid ${S.soft}`,
      }}>
        <span style={{
          fontFamily: S.fontMono, fontSize: 13, fontWeight: 700,
          color: S.cyan, letterSpacing: "0.06em",
        }}>
          {cr.currency}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
          {pairLabel}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>
          {cr.positions.length} pos · {fmtNum.format(totalNotional)} {cr.currency}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
          spot: {fmtDec.format(cr.market.spot_rate)}
        </span>
        <div style={{ flex: 1 }} />

        {/* Status badge */}
        {cr.status === "pending" && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em" }}>PENDING</span>
        )}
        {cr.status === "running" && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber, letterSpacing: "0.08em" }}>⟳ COMPUTING...</span>
        )}
        {cr.status === "done" && validationPassed && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.pass, letterSpacing: "0.08em" }}>✓ PASS</span>
        )}
        {cr.status === "done" && !validationPassed && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.fail, letterSpacing: "0.08em" }}>✗ FAIL</span>
        )}
        {cr.status === "error" && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.fail, letterSpacing: "0.08em" }}>✗ ERROR</span>
        )}
      </div>

      {/* Error */}
      {cr.error && (
        <div style={{
          padding: "8px 14px", background: "rgba(239,68,68,0.06)",
          fontFamily: S.fontMono, fontSize: 12, color: S.fail, lineHeight: 1.5,
        }}>
          {cr.error}
        </div>
      )}

      {/* Results */}
      {cr.result && (
        <div style={{ padding: "0 0 8px" }}>
          {/* Run ID */}
          {cr.result.run_id && (
            <div style={{
              padding: "6px 14px", fontFamily: S.fontMono, fontSize: 12,
              color: S.tertiary, letterSpacing: "0.06em",
            }}>
              RUN: {cr.result.run_id.slice(0, 12).toUpperCase()}
              {cr.result.run_envelope?.inputs_hash && (
                <span style={{ marginLeft: 12 }}>
                  HASH: {cr.result.run_envelope.inputs_hash.slice(0, 8).toUpperCase()}
                </span>
              )}
            </div>
          )}

          {/* Validation errors if any */}
          {cr.result.validation_report?.errors?.length > 0 && !validationPassed && (
            <div style={{
              margin: "4px 14px", padding: "6px 10px", borderRadius: 3,
              background: "rgba(239,68,68,0.06)", border: `1px solid ${S.fail}`,
              fontFamily: S.fontMono, fontSize: 12, color: S.fail,
            }}>
              {cr.result.validation_report.errors.map((e, i) => (
                <div key={i}>[{e.code}] {e.message}</div>
              ))}
            </div>
          )}

          {/* Hedge plan buckets */}
          {buckets.length > 0 && (
            <div style={{ padding: "8px 14px 0" }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "90px 110px 90px 110px 100px 80px 80px 70px",
                alignItems: "center", height: 28, padding: "0 6px",
                background: S.bgDeep, borderBottom: `1px solid ${S.rim}`,
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
                letterSpacing: "0.08em", color: S.tertiary,
                textTransform: "uppercase" as const,
              }}>
                <span>Bucket</span>
                <span style={{ textAlign: "right" }}>Exposure</span>
                <span>Direction</span>
                <span style={{ textAlign: "right" }}>Action</span>
                <span style={{ textAlign: "right" }}>USD Equiv</span>
                <span style={{ textAlign: "right" }}>Fwd Rate</span>
                <span style={{ textAlign: "right" }}>Cost</span>
                <span>Status</span>
              </div>
              {buckets.map((b) => {
                const isSell = b.action_direction?.includes("SELL");
                return (
                  <div key={b.bucket} style={{
                    display: "grid",
                    gridTemplateColumns: "90px 110px 90px 110px 100px 80px 80px 70px",
                    alignItems: "center", height: 30, padding: "0 6px",
                    borderBottom: `1px solid ${S.soft}`, fontFamily: S.fontMono, fontSize: 12,
                    opacity: b.suppressed ? 0.4 : 1,
                  }}>
                    <span style={{ color: S.primary, fontWeight: 600 }}>{b.bucket}</span>
                    <span style={{ textAlign: "right", color: S.secondary }}>{fmtNum.format(b.commercial_exposure_mxn)}</span>
                    <span>
                      {b.action_direction ? (
                        <span style={{
                          display: "inline-block", padding: "1px 5px", borderRadius: 2,
                          fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                          background: isSell ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                          color: isSell ? S.fail : S.pass,
                          border: `1px solid ${isSell ? S.fail : S.pass}`,
                        }}>
                          {b.action_direction.replace(/_/g, " ")}
                        </span>
                      ) : "—"}
                    </span>
                    <span style={{ textAlign: "right", color: S.primary }}>{fmtNum.format(b.action_mxn)}</span>
                    <span style={{ textAlign: "right", color: S.secondary }}>${fmtUsd.format(b.action_usd)}</span>
                    <span style={{ textAlign: "right", color: S.tertiary }}>{fmtDec.format(b.forward_rate)}</span>
                    <span style={{ textAlign: "right", color: b.friction_usd > 0 ? S.amber : S.tertiary }}>${fmtUsd.format(b.friction_usd)}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: b.suppressed ? S.amber : S.pass }}>
                      {b.suppressed ? "SKIP" : "ACT"}
                    </span>
                  </div>
                );
              })}

              {/* Summary row */}
              {summary && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "90px 110px 90px 110px 100px 80px 80px 70px",
                  alignItems: "center", height: 32, padding: "0 6px",
                  background: S.bgSub, borderTop: `2px solid ${S.rim}`,
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                }}>
                  <span style={{ fontSize: 12, letterSpacing: "0.08em", color: S.tertiary }}>TOTAL</span>
                  <span style={{ textAlign: "right", color: S.primary }}>{fmtNum.format(summary.total_commercial_exposure_mxn)}</span>
                  <span />
                  <span style={{ textAlign: "right", color: S.primary }}>{fmtNum.format(summary.total_action_mxn)}</span>
                  <span style={{ textAlign: "right", color: S.secondary }}>${fmtUsd.format(summary.total_action_usd)}</span>
                  <span />
                  <span style={{ textAlign: "right", color: S.amber }}>${fmtUsd.format(summary.total_friction_usd)}</span>
                  <span />
                </div>
              )}
            </div>
          )}

          {/* Scenario results (compact) */}
          {scenarios.length > 0 && (
            <div style={{ padding: "10px 14px 0" }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
                letterSpacing: "0.10em", color: S.tertiary, marginBottom: 4,
                textTransform: "uppercase" as const,
              }}>
                Stress Scenarios
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {scenarios.map((sc) => (
                  <span key={sc.sigma} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 6px", borderRadius: 3,
                    background: S.bgDeep, border: `1px solid ${S.soft}`,
                    fontFamily: S.fontMono, fontSize: 12,
                  }}>
                    <span style={{ color: sc.sigma < 0 ? S.fail : sc.sigma > 0 ? S.pass : S.primary, fontWeight: 600 }}>
                      {sc.sigma > 0 ? "+" : ""}{sc.sigma}σ
                    </span>
                    <span style={{ color: S.tertiary }}>→</span>
                    <span style={{ color: S.secondary }}>{fmtDec.format(sc.shocked_spot)}</span>
                    <span style={{ color: S.tertiary }}>benefit:</span>
                    <span style={{
                      fontWeight: 600,
                      color: sc.total_hedge_benefit_usd > 0 ? S.pass : sc.total_hedge_benefit_usd < 0 ? S.fail : S.tertiary,
                    }}>
                      ${fmtUsd.format(sc.total_hedge_benefit_usd)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Fallback market data builder ─────────────────────────────────────── */
function buildFallbackMarket(currency: string, valueDates: string[]): MarketSnapshot {
  const FALLBACK_SPOTS: Record<string, number> = {
    MXN: 18.97, EUR: 0.9210, GBP: 0.7882, JPY: 149.80,
    CAD: 1.3950, AUD: 1.5290, CHF: 0.8830, BRL: 5.0800,
    NZD: 1.5750, CNY: 7.2450, INR: 83.10, SEK: 10.85,
    NOK: 10.72, DKK: 6.87, PLN: 4.02, CZK: 23.15,
    HUF: 358.5, ZAR: 18.60, TRY: 30.50, RUB: 91.50,
  };

  const CARRY_BPS: Record<string, number> = {
    MXN: 48, EUR: -5, GBP: -2, JPY: -10,
    CAD: 2, AUD: 5, CHF: -8, BRL: 35,
    NZD: 5, CNY: 3, INR: 15, SEK: -3,
  };

  const spot = FALLBACK_SPOTS[currency] ?? 1.0;
  const carry = CARRY_BPS[currency] ?? 0;
  const now = new Date();

  // Generate forward points covering all value date months + buffer
  const fwdPoints: Record<string, number> = {};
  const months = new Set<string>();

  for (const d of valueDates) {
    const dt = new Date(d);
    for (let m = -1; m <= 18; m++) {
      const target = new Date(dt);
      target.setMonth(target.getMonth() + m);
      months.add(target.toISOString().slice(0, 7));
    }
  }

  // Also add current month + 12 months ahead
  for (let m = 0; m <= 12; m++) {
    const target = new Date(now);
    target.setMonth(target.getMonth() + m);
    months.add(target.toISOString().slice(0, 7));
  }

  const nowMonth = now.getFullYear() * 12 + now.getMonth();
  for (const bucket of Array.from(months).sort()) {
    const [y, mo] = bucket.split("-").map(Number);
    const bucketMonth = y * 12 + (mo - 1);
    const monthsAhead = Math.max(1, bucketMonth - nowMonth);
    fwdPoints[bucket] = Number((spot * (carry * monthsAhead) / 10000).toFixed(6));
  }

  const isPrice = PRICE_CCY.has(currency);

  return {
    as_of: now.toISOString(),
    spot_rate: spot,
    forward_points_by_month: fwdPoints,
    provider_metadata: {
      source: "local_fallback",
      currency_pair: isPrice ? `${currency}/USD` : `USD/${currency}`,
      primary_currency: currency,
    },
  };
}
