"use client";

import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { PositionRow } from "@/api/positionClient";
import { translateError, translateCaughtError, type TranslatedError } from "@/lib/errors/hedgeErrors";
import HedgeErrorBanner from "./ErrorBanner";
import {
  LoaderIcon, CheckCircleIcon, ChevronLeftIcon, ChevronDownIcon, ChevronRightIcon,
  ShieldIcon, TrendingUpIcon, FileTextIcon, RefreshCwIcon,
  ZapIcon, InfoIcon, ArrowRightIcon,
} from "lucide-react";
import { T } from "./tokens";

/* ── Aliases for backward compat inside this file ─────────────────────────── */

const HD = T;

export interface CalculateResult {
  runId: string;
  calcResponse: Record<string, unknown>;
  marketSnapshot: Record<string, unknown>;
  policyInstanceId?: string;
  riskDecisionHash?: string;
}

interface PhaseCalculateProps {
  positions: PositionRow[];
  token: string;
  onComplete: (result: CalculateResult) => void;
  onBack: () => void;
  initialPolicyInstanceId?: string;
}

const DEFAULT_POLICY = {
  bucket_mode: "CALENDAR_MONTH",
  hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
  cost_assumptions: { spread_bps: 5.0 },
  execution_product: "NDF",
  min_trade_size_usd: 0,
  dual_key_threshold_usd: 1000000,
  dual_key_required: false,
  allow_indicative_proxy: true,
  execution_window_hours: 24.0,
};

function fmt(n: number, decimals = 4): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PhaseCalculate — Step 2: Confirm & run calculation                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function PhaseCalculate({ positions, token, onComplete, onBack, initialPolicyInstanceId }: PhaseCalculateProps) {
  const [marketSnapshot, setMarketSnapshot] = useState<Record<string, unknown> | null>(null);
  const [marketLoading, setMarketLoading]   = useState(true);
  const [marketError, setMarketError]       = useState<TranslatedError | null>(null);

  const [policyName, setPolicyName]         = useState<string | null>(null);
  const [policyConfig, setPolicyConfig]     = useState(DEFAULT_POLICY);
  const [policyInstanceId, setPolicyInstanceId] = useState<string | undefined>(undefined);
  const [policyLoading, setPolicyLoading]   = useState(true);

  const [calculating, setCalculating]       = useState(false);
  const [calcError, setCalcError]           = useState<TranslatedError | null>(null);

  // Post-calculation state: hold result locally instead of immediately calling onComplete
  const [calcDone, setCalcDone]             = useState(false);
  const [calcResultLocal, setCalcResultLocal] = useState<CalculateResult | null>(null);

  // Derived data
  const currencies = Array.from(new Set(positions.map(p => p.currency)));
  const valueDates = positions.map(p => p.value_date).filter(Boolean) as string[];

  const currencyAgg = positions.reduce<Record<string, { count: number; total: number }>>((acc, p) => {
    const c = p.currency;
    if (!acc[c]) acc[c] = { count: 0, total: 0 };
    acc[c].count++;
    acc[c].total += p.amount ?? 0;
    return acc;
  }, {});

  const totalExposure = positions.reduce((s, p) => s + Math.abs(p.amount ?? 0), 0);
  const primaryCurrency = currencies[0] ?? "USD";

  // Date range for narrative
  const sortedDates = [...valueDates].sort();
  const earliestDate = sortedDates[0] ?? null;
  const latestDate = sortedDates[sortedDates.length - 1] ?? null;
  const dateRangeText = earliestDate && latestDate
    ? earliestDate === latestDate
      ? earliestDate
      : `${earliestDate} to ${latestDate}`
    : "unspecified dates";

  // ── Load market data ─────────────────────────────────────────────────

  const loadMarket = useCallback(async () => {
    setMarketLoading(true);
    setMarketError(null);

    async function fetchMarket() {
      const res = await fetch("/api/market-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currencies, trade_value_dates: valueDates }),
      });
      if (!res.ok) {
        throw Object.assign(new Error("market_fetch_failed"), { status: res.status });
      }
      const data = await res.json();
      const mkt = data.market as Record<string, unknown> | undefined;
      if (!mkt) {
        throw Object.assign(new Error("no_market_data"), { status: 200 });
      }
      return mkt;
    }

    try {
      let mkt: Record<string, unknown>;
      try {
        mkt = await fetchMarket();
      } catch {
        await new Promise(r => setTimeout(r, 1000));
        mkt = await fetchMarket();
      }
      setMarketSnapshot(mkt);
      setMarketError(null);
    } catch (e) {
      const status = (e as { status?: number }).status ?? null;
      setMarketError(translateError(status, "Market data is temporarily unavailable. You can retry or proceed with default rates."));
      setMarketSnapshot(null);
    } finally {
      setMarketLoading(false);
    }
  }, [currencies.join(","), valueDates.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load active policy ───────────────────────────────────────────────

  const loadPolicy = useCallback(async () => {
    setPolicyLoading(true);
    // If policy was already assigned in Step 2, use that ID
    if (initialPolicyInstanceId) {
      setPolicyInstanceId(initialPolicyInstanceId);
    }
    try {
      const polRes = await dashboardFetch("/v1/policies/active", token);
      if (polRes.ok) {
        const polData = await polRes.json();
        setPolicyConfig((polData.config ?? polData.parameters ?? DEFAULT_POLICY) as typeof DEFAULT_POLICY);
        if (!initialPolicyInstanceId) {
          setPolicyInstanceId((polData.id ?? polData.policy_instance_id) as string | undefined);
        }
        setPolicyName((polData.name ?? polData.policy_name ?? null) as string | null);
      }
    } catch {
      // Use default policy
    } finally {
      setPolicyLoading(false);
    }
  }, [token, initialPolicyInstanceId]);

  useEffect(() => { loadMarket(); }, [loadMarket]);
  useEffect(() => { loadPolicy(); }, [loadPolicy]);

  // ── Run calculation ──────────────────────────────────────────────────

  const runCalculation = async () => {
    setCalculating(true);
    setCalcError(null);
    setCalcDone(false);
    setCalcResultLocal(null);
    try {
      // Ensure market snapshot
      let mktSnap: Record<string, unknown>;
      if (marketSnapshot) {
        mktSnap = { ...marketSnapshot };
      } else {
        const fallbackRes = await fetch("/api/market-autofill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currencies, trade_value_dates: valueDates }),
        });
        if (!fallbackRes.ok) {
          setCalcError(translateError(fallbackRes.status, "Market data could not be loaded. Please retry."));
          setCalculating(false);
          return;
        }
        const fallbackData = await fallbackRes.json();
        const fallbackMkt = fallbackData.market as Record<string, unknown> | undefined;
        if (!fallbackMkt) {
          setCalcError(translateError(null, "Market snapshot returned no data. Please retry."));
          setCalculating(false);
          return;
        }
        mktSnap = { ...fallbackMkt };
        setMarketSnapshot(fallbackMkt);
      }

      // Build trades payload
      const trades = positions.map(p => ({
        record_id:  p.record_id ?? p.id,
        entity:     p.entity,
        type:       p.type ?? "AP",
        currency:   p.currency,
        amount:     p.amount ?? 0,
        value_date: p.value_date,
        status:     "CONFIRMED",
      }));

      // POST /v1/calculate
      const payload = {
        trades,
        hedges: [],
        market: mktSnap,
        policy: policyConfig,
      };

      const res = await dashboardFetch("/v1/calculate", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let detail: string | undefined;
        try {
          const errData = await res.json();
          detail = typeof errData?.detail === "string" ? errData.detail
            : errData?.detail ? JSON.stringify(errData.detail) : undefined;
        } catch { /* body not JSON */ }
        setCalcError(translateError(res.status, detail));
        setCalculating(false);
        return;
      }

      const data = await res.json() as Record<string, unknown>;
      const runId = (data.run_id ?? data.id ?? `RUN-${Date.now()}`) as string;
      const riskDecisionHash = data.decision_hash as string | undefined;

      const result: CalculateResult = {
        runId,
        calcResponse: data,
        marketSnapshot: mktSnap,
        policyInstanceId,
        riskDecisionHash,
      };

      // Store locally instead of immediately calling onComplete
      setCalcResultLocal(result);
      setCalcDone(true);

    } catch (e) {
      setCalcError(translateCaughtError(e));
    } finally {
      setCalculating(false);
    }
  };

  // ── Extract recommendation preview data from calc result ──────────
  const previewData = (() => {
    if (!calcResultLocal) return null;
    const resp = calcResultLocal.calcResponse;
    const hedgePlan = resp.hedge_plan as Record<string, unknown> | undefined;
    const summary = (hedgePlan?.summary ?? resp.summary) as Record<string, unknown> | undefined;
    const buckets = (hedgePlan?.buckets ?? resp.buckets) as Array<Record<string, unknown>> | undefined;
    const actions = (hedgePlan?.actions ?? resp.actions ?? resp.execution_legs) as Array<Record<string, unknown>> | undefined;

    const coveragePct = (summary?.coverage_pct ?? summary?.hedge_ratio ?? summary?.coverage_ratio) as number | undefined;
    const totalActionUsd = (summary?.total_action_usd ?? summary?.total_hedge_usd ?? summary?.notional_usd) as number | undefined;
    const estimatedCostBps = (summary?.estimated_cost_bps ?? summary?.cost_bps ?? summary?.spread_cost_bps) as number | undefined;
    const numLegs = actions?.length ?? buckets?.length ?? 0;

    return { coveragePct, totalActionUsd, estimatedCostBps, numLegs };
  })();

  const handleProceedToRisk = () => {
    if (calcResultLocal) {
      onComplete(calcResultLocal);
    }
  };

  const isReady = !marketLoading && !policyLoading && !calculating;
  const canRun = isReady && !calcError && !calcDone;

  // Forward point analysis for market context
  const forwardPointsAnalysis = (() => {
    if (!marketSnapshot) return null;
    const fwd = marketSnapshot.forward_points_by_month as Record<string, number> | undefined;
    if (!fwd) return null;
    const entries = Object.entries(fwd);
    if (entries.length === 0) return null;
    const avgPts = entries.reduce((s, [, v]) => s + v, 0) / entries.length;
    const isNegative = avgPts < 0;
    return { avgPts, isNegative };
  })();

  // Market snapshot timestamp
  const marketAsOf = marketSnapshot
    ? ((marketSnapshot.as_of ?? (marketSnapshot.provider_metadata as Record<string, unknown> | undefined)?.fetched_at) as string | undefined)
    : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Scrollable content ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px 44px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Step header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: HD.cyan }}>
            STEP 3 OF 7 — CALCULATE
          </span>
          <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
            Review inputs and run the hedge engine
          </span>
        </div>

        {/* ── Exposure Narrative Block ────────────────────────────────── */}
        {!policyLoading && (
          <div style={{
            background: `color-mix(in srgb, ${HD.cyan} 4%, ${HD.bgPanel})`,
            border: `1px solid color-mix(in srgb, ${HD.cyan} 20%, transparent)`,
            borderLeft: `3px solid ${HD.cyan}`,
            borderRadius: 6,
            padding: "16px 20px",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <InfoIcon size={14} color={HD.cyan} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontFamily: HD.fontUI, fontSize: 13, color: HD.primary, lineHeight: 1.6 }}>
                  You are hedging <strong style={{ fontFamily: HD.fontMono }}>{fmtInt(totalExposure)}</strong>{" "}
                  <strong style={{ fontFamily: HD.fontMono }}>{primaryCurrency}</strong> exposure across{" "}
                  <strong>{positions.length}</strong> position{positions.length !== 1 ? "s" : ""} maturing{" "}
                  {dateRangeText !== "unspecified dates" ? (
                    <span>in <strong style={{ fontFamily: HD.fontMono }}>{dateRangeText}</strong></span>
                  ) : (
                    <span>at {dateRangeText}</span>
                  )}.
                </span>
                <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.5 }}>
                  Your active policy mandates{" "}
                  <strong style={{ fontFamily: HD.fontMono }}>{(policyConfig.hedge_ratios.confirmed * 100).toFixed(0)}%</strong>{" "}
                  coverage on confirmed flows and{" "}
                  <strong style={{ fontFamily: HD.fontMono }}>{(policyConfig.hedge_ratios.forecast * 100).toFixed(0)}%</strong>{" "}
                  on forecasts.
                  {" "}Instrument: <strong style={{ fontFamily: HD.fontMono }}>{policyConfig.execution_product}</strong>.
                  {" "}Bucket mode: <strong style={{ fontFamily: HD.fontMono }}>{policyConfig.bucket_mode.replace(/_/g, " ")}</strong>.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Card 1: Positions ─────────────────────────────────────── */}
        <SummaryCard
          icon={FileTextIcon}
          title="POSITIONS"
          badge={`${positions.length}`}
          badgeColor={HD.cyan}
        >
          {/* Currency aggregation */}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14 }}>
            {Object.entries(currencyAgg).map(([ccy, { count, total }]) => (
              <div key={ccy} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, letterSpacing: "0.1em" }}>
                  {ccy} ({count})
                </span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 14, fontWeight: 700, color: HD.primary }}>
                  {fmtInt(total)}
                </span>
              </div>
            ))}
          </div>

          {/* Collapsible detail rows */}
          <PositionDetailList positions={positions} />
        </SummaryCard>

        {/* ── Card 2: Market Snapshot ───────────────────────────────── */}
        <SummaryCard
          icon={TrendingUpIcon}
          title="MARKET SNAPSHOT"
          badge={marketLoading ? "LOADING" : marketSnapshot ? (
            ((marketSnapshot.provider_metadata as Record<string, unknown> | undefined)?.data_class === "LIVE") ? "LIVE" : "INDICATIVE"
          ) : "UNAVAILABLE"}
          badgeColor={marketLoading ? HD.slate : marketSnapshot ? (
            ((marketSnapshot.provider_metadata as Record<string, unknown> | undefined)?.data_class === "LIVE") ? HD.emerald : HD.amber
          ) : HD.red}
        >
          {marketLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LoaderIcon size={14} color={HD.slate} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary }}>Fetching live rates...</span>
            </div>
          ) : marketSnapshot ? (() => {
            const spot = marketSnapshot.spot_rate as number;
            const meta = marketSnapshot.provider_metadata as Record<string, unknown> | undefined;
            const pair = (meta?.currency_pair ?? `USD/${currencies[0] ?? "MXN"}`) as string;
            const asOf = (marketSnapshot.as_of ?? meta?.fetched_at) as string | undefined;
            const fwd = marketSnapshot.forward_points_by_month as Record<string, number> | undefined;
            const fwdEntries = fwd ? Object.entries(fwd).sort(([a],[b]) => a.localeCompare(b)).slice(0, 6) : [];
            return (
              <>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {/* Spot */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, letterSpacing: "0.1em" }}>{pair} SPOT</span>
                    <span style={{ fontFamily: HD.fontMono, fontSize: 18, fontWeight: 700, color: HD.primary }}>{fmt(spot)}</span>
                    {asOf && (
                      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary }}>
                        as of {new Date(asOf).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>

                  {/* Forward buckets */}
                  {fwdEntries.map(([bucket, pts]) => (
                    <div key={bucket} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, letterSpacing: "0.1em" }}>{bucket}</span>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 14, fontWeight: 600, color: HD.primary }}>{fmt(spot + pts)}</span>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: pts >= 0 ? HD.emerald : HD.red }}>
                        {pts >= 0 ? "+" : ""}{fmt(pts)} pts
                      </span>
                    </div>
                  ))}
                </div>

                {/* Forward points context note */}
                {forwardPointsAnalysis && (
                  <div style={{ marginTop: 14, padding: "10px 14px", background: HD.bgDeep, borderRadius: 4, border: `1px solid ${HD.soft}` }}>
                    <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.5 }}>
                      Forward points indicate{" "}
                      <strong style={{ color: HD.primary }}>
                        {forwardPointsAnalysis.isNegative ? "weakening" : "strengthening"}
                      </strong>{" "}
                      of {primaryCurrency} over the hedge horizon.
                      {forwardPointsAnalysis.isNegative && (
                        <span style={{ color: HD.amber }}>
                          {" "}Negative carry — hedging locks in a rate that is less favorable than the current spot.
                        </span>
                      )}
                      {!forwardPointsAnalysis.isNegative && (
                        <span style={{ color: HD.emerald }}>
                          {" "}Positive carry — hedging locks in a rate that is more favorable than the current spot.
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </>
            );
          })() : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.amber }}>
                Market data unavailable
              </span>
              {marketError && (
                <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.tertiary }}>{marketError.message}</span>
              )}
              <button
                onClick={loadMarket}
                style={{
                  fontFamily: HD.fontMono, fontSize: 12, letterSpacing: "0.08em",
                  color: HD.cyan, background: "none",
                  border: `1px solid ${HD.soft}`, padding: "4px 10px",
                  cursor: "pointer", borderRadius: 3,
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                <RefreshCwIcon size={10} />
                RETRY
              </button>
            </div>
          )}
        </SummaryCard>

        {/* ── Card 3: Policy ────────────────────────────────────────── */}
        <SummaryCard
          icon={ShieldIcon}
          title="HEDGE POLICY"
          badge={policyLoading ? "LOADING" : policyName ? policyName.toUpperCase() : "DEFAULT"}
          badgeColor={policyLoading ? HD.slate : policyName ? HD.cyan : HD.amber}
        >
          {policyLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LoaderIcon size={14} color={HD.slate} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary }}>Loading policy...</span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <PolicyField label="BUCKET MODE" value={policyConfig.bucket_mode} />
              <PolicyField label="CONFIRMED RATIO" value={`${(policyConfig.hedge_ratios.confirmed * 100).toFixed(0)}%`} />
              <PolicyField label="FORECAST RATIO" value={`${(policyConfig.hedge_ratios.forecast * 100).toFixed(0)}%`} />
              <PolicyField label="INSTRUMENT" value={policyConfig.execution_product} />
              <PolicyField label="SPREAD" value={`${policyConfig.cost_assumptions.spread_bps} bps`} />
              {policyConfig.min_trade_size_usd > 0 && (
                <PolicyField label="MIN TRADE" value={`$${fmtInt(policyConfig.min_trade_size_usd)}`} />
              )}
            </div>
          )}
        </SummaryCard>

        {/* Calc error */}
        {calcError && (
          <HedgeErrorBanner
            error={calcError}
            onRetry={() => { setCalcError(null); runCalculation(); }}
            onReconnect={() => window.location.href = "/auth/login"}
            onGoBack={onBack}
            onDismiss={() => setCalcError(null)}
          />
        )}

        {/* ── Post-Calculation: Recommendation Preview ──────────────── */}
        {calcDone && previewData && (
          <div style={{
            background: `color-mix(in srgb, ${HD.emerald} 4%, ${HD.bgPanel})`,
            border: `1px solid color-mix(in srgb, ${HD.emerald} 25%, transparent)`,
            borderLeft: `4px solid ${HD.emerald}`,
            borderRadius: 6,
          }}>
            {/* Section header */}
            <div style={{
              padding: "12px 18px",
              borderRadius: "6px 6px 0 0",
              background: `color-mix(in srgb, ${HD.emerald} 8%, ${HD.bgSub})`,
              borderBottom: `1px solid color-mix(in srgb, ${HD.emerald} 15%, transparent)`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <ZapIcon size={13} color={HD.emerald} />
              <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: HD.emerald }}>
                RECOMMENDATION PREVIEW
              </span>
            </div>

            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Metric row */}
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                {previewData.coveragePct != null && (
                  <PreviewMetric
                    label="COVERAGE RATIO"
                    value={`${(previewData.coveragePct * (previewData.coveragePct < 1 ? 100 : 1)).toFixed(1)}%`}
                  />
                )}
                {previewData.totalActionUsd != null && (
                  <PreviewMetric
                    label="TOTAL ACTION"
                    value={fmtUsd(previewData.totalActionUsd)}
                  />
                )}
                {previewData.numLegs > 0 && (
                  <PreviewMetric
                    label="EXECUTION LEGS"
                    value={String(previewData.numLegs)}
                  />
                )}
                {previewData.estimatedCostBps != null && (
                  <PreviewMetric
                    label="ESTIMATED COST"
                    value={`${previewData.estimatedCostBps.toFixed(1)} bps`}
                  />
                )}
              </div>

              {/* Plain-English summary */}
              <div style={{
                padding: "12px 16px",
                background: HD.bgDeep,
                borderRadius: 4,
                border: `1px solid ${HD.soft}`,
              }}>
                <span style={{ fontFamily: HD.fontUI, fontSize: 13, color: HD.secondary, lineHeight: 1.6 }}>
                  The engine recommends{" "}
                  <strong style={{ fontFamily: HD.fontMono, color: HD.primary }}>
                    {previewData.numLegs > 0 ? previewData.numLegs : "multiple"}
                  </strong>{" "}
                  hedge leg{previewData.numLegs !== 1 ? "s" : ""}
                  {previewData.coveragePct != null && (
                    <> covering{" "}
                      <strong style={{ fontFamily: HD.fontMono, color: HD.primary }}>
                        {(previewData.coveragePct * (previewData.coveragePct < 1 ? 100 : 1)).toFixed(1)}%
                      </strong>{" "}
                      of exposure
                    </>
                  )}
                  {previewData.estimatedCostBps != null && (
                    <> at an estimated cost of{" "}
                      <strong style={{ fontFamily: HD.fontMono, color: HD.primary }}>
                        {previewData.estimatedCostBps.toFixed(1)} bps
                      </strong>
                    </>
                  )}.
                </span>
              </div>

              {/* Unhedged risk note */}
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "10px 14px",
                background: `color-mix(in srgb, ${HD.amber} 6%, transparent)`,
                border: `1px solid color-mix(in srgb, ${HD.amber} 20%, transparent)`,
                borderRadius: 4,
              }}>
                <InfoIcon size={12} color={HD.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.5 }}>
                  <strong style={{ color: HD.amber }}>What happens if you don{"'"}t hedge:</strong>{" "}
                  Your {fmtInt(totalExposure)} {primaryCurrency} exposure remains fully subject to exchange rate movements.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Assumptions Block (collapsible) ───────────────────────── */}
        {!policyLoading && (
          <AssumptionsBlock
            marketAsOf={marketAsOf}
            spreadBps={policyConfig.cost_assumptions.spread_bps}
            minTradeSizeUsd={policyConfig.min_trade_size_usd}
          />
        )}
      </div>

      {/* ── Action bar ────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 24px",
        background: HD.bgSub,
        borderTop: `1px solid ${HD.soft}`,
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            fontFamily: HD.fontMono, fontSize: 12, letterSpacing: "0.06em",
            color: HD.slate, background: "none",
            border: `1px solid ${HD.rim}`, padding: "8px 14px",
            cursor: "pointer", borderRadius: 3,
          }}
        >
          <ChevronLeftIcon size={12} />
          BACK
        </button>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          {/* Loading indicators */}
          {marketLoading && (
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.slate, display: "flex", alignItems: "center", gap: 4 }}>
              <LoaderIcon size={10} style={{ animation: "spin 1s linear infinite" }} />
              MARKET
            </span>
          )}
          {policyLoading && (
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.slate, display: "flex", alignItems: "center", gap: 4 }}>
              <LoaderIcon size={10} style={{ animation: "spin 1s linear infinite" }} />
              POLICY
            </span>
          )}
          {isReady && !calculating && !calcDone && (
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.emerald, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircleIcon size={10} />
              READY
            </span>
          )}
          {calcDone && (
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.emerald, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircleIcon size={10} />
              CALCULATION COMPLETE
            </span>
          )}
        </div>

        {/* Recalculate button (visible after calc is done) */}
        {calcDone && (
          <button
            onClick={runCalculation}
            disabled={calculating}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: HD.fontMono, fontSize: 12, letterSpacing: "0.06em",
              color: HD.slate, background: "none",
              border: `1px solid ${HD.rim}`, padding: "8px 14px",
              cursor: calculating ? "not-allowed" : "pointer", borderRadius: 3,
            }}
          >
            <RefreshCwIcon size={10} />
            RECALCULATE
          </button>
        )}

        {/* Primary CTA: switches between RUN CALCULATION and PROCEED TO RISK */}
        {!calcDone ? (
          <button
            onClick={runCalculation}
            disabled={!canRun}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              color: HD.white,
              background: canRun ? HD.royal : HD.slate,
              border: "none", padding: "10px 28px",
              cursor: canRun ? "pointer" : "not-allowed",
              borderRadius: 3, transition: "background 0.15s",
            }}
          >
            {calculating && <LoaderIcon size={14} color="#ffffff" style={{ animation: "spin 1s linear infinite" }} />}
            {!calculating && <CheckCircleIcon size={14} color="#ffffff" />}
            {calculating ? "RUNNING..." : "RUN CALCULATION"}
          </button>
        ) : (
          <button
            onClick={handleProceedToRisk}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              color: HD.white,
              background: HD.royal,
              border: "none", padding: "10px 28px",
              cursor: "pointer",
              borderRadius: 3, transition: "background 0.15s",
            }}
          >
            <ArrowRightIcon size={14} color="#ffffff" />
            PROCEED TO RISK
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Subcomponents                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SummaryCard({ icon: Icon, title, badge, badgeColor, children }: {
  icon: typeof FileTextIcon;
  title: string;
  badge: string;
  badgeColor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: HD.bgPanel,
      border: `1px solid ${HD.rim}`,
      borderRadius: 6,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 16px",
        background: HD.bgSub,
        borderBottom: `1px solid ${HD.soft}`,
        borderRadius: "6px 6px 0 0",
      }}>
        <Icon size={13} color={HD.tertiary} />
        <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
          {title}
        </span>
        <span style={{
          fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
          color: badgeColor,
          background: `color-mix(in srgb, ${badgeColor} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${badgeColor} 30%, transparent)`,
          padding: "2px 8px", borderRadius: 3,
        }}>
          {badge}
        </span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        {children}
      </div>
    </div>
  );
}

function PolicyField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, letterSpacing: "0.1em" }}>{label}</span>
      <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 600, color: HD.primary }}>{value}</span>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, letterSpacing: "0.1em" }}>{label}</span>
      <span style={{ fontFamily: HD.fontMono, fontSize: 18, fontWeight: 700, color: HD.primary }}>{value}</span>
    </div>
  );
}

function AssumptionsBlock({ marketAsOf, spreadBps, minTradeSizeUsd }: {
  marketAsOf?: string;
  spreadBps: number;
  minTradeSizeUsd: number;
}) {
  const [open, setOpen] = useState(false);
  const asOfText = marketAsOf
    ? new Date(marketAsOf).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "latest available";

  return (
    <div style={{
      border: `1px solid ${HD.soft}`,
      borderRadius: 6,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 6,
          padding: "10px 14px",
          background: HD.bgSub,
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          borderRadius: open ? "6px 6px 0 0" : "6px",
          borderBottom: open ? `1px solid ${HD.soft}` : "none",
        }}
      >
        {open ? <ChevronDownIcon size={12} color={HD.slate} /> : <ChevronRightIcon size={12} color={HD.slate} />}
        <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
          ASSUMPTIONS
        </span>
      </button>
      {open && (
        <div style={{ padding: "12px 16px", background: HD.bgPanel, borderRadius: "0 0 6px 6px" }}>
          <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.6 }}>
            Market rates as of <strong style={{ fontFamily: HD.fontMono }}>{asOfText}</strong>.
            {" "}Spread: <strong style={{ fontFamily: HD.fontMono }}>{spreadBps} bps</strong>.
            {minTradeSizeUsd > 0 && (
              <> Min trade size: <strong style={{ fontFamily: HD.fontMono }}>${fmtInt(minTradeSizeUsd)}</strong>.</>
            )}
            {minTradeSizeUsd === 0 && (
              <> Min trade size: <strong style={{ fontFamily: HD.fontMono }}>none</strong>.</>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function PositionDetailList({ positions }: { positions: PositionRow[] }) {
  const [expanded, setExpanded] = useState(false);

  if (positions.length === 0) return null;

  const visibleCount = expanded ? positions.length : Math.min(positions.length, 3);
  const shown = positions.slice(0, visibleCount);

  return (
    <div>
      <div style={{
        border: `1px solid ${HD.soft}`,
        borderRadius: 4,
      }}>
        {/* Mini header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 80px 100px 90px",
          gap: 0,
          padding: "6px 12px",
          background: HD.bgDeep,
          borderRadius: "4px 4px 0 0",
        }}>
          {["ENTITY", "CCY", "AMOUNT", "DATE"].map(h => (
            <span key={h} style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 600, color: HD.tertiary, letterSpacing: "0.08em" }}>{h}</span>
          ))}
        </div>

        {shown.map((p, i) => (
          <div key={p.id} style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 100px 90px",
            gap: 0,
            padding: "6px 12px",
            borderTop: `1px solid ${HD.soft}`,
            background: i % 2 === 0 ? HD.bgPanel : HD.bgSub,
          }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.entity}</span>
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.cyan }}>{p.currency}</span>
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.primary }}>{fmtInt(p.amount ?? 0)}</span>
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary }}>{p.value_date}</span>
          </div>
        ))}
      </div>

      {positions.length > 3 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            fontFamily: HD.fontMono, fontSize: 12, letterSpacing: "0.06em",
            color: HD.cyan, background: "none",
            border: "none", padding: "6px 0",
            cursor: "pointer",
          }}
        >
          {expanded ? "COLLAPSE" : `SHOW ALL ${positions.length} POSITIONS`}
        </button>
      )}
    </div>
  );
}
