"use client";

import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { PositionRow } from "@/api/positionClient";
import { translateError, translateCaughtError, type TranslatedError } from "@/lib/errors/hedgeErrors";
import HedgeErrorBanner from "./ErrorBanner";
import {
  LoaderIcon, CheckCircleIcon, ChevronLeftIcon,
  ShieldIcon, TrendingUpIcon, FileTextIcon, RefreshCwIcon,
} from "lucide-react";

/* ── Design tokens ────────────────────────────────────────────────────────── */

const HD = {
  royal:   "#1C62F2",
  emerald: "#2ECC71",
  crimson: "#E74C3C",
  slate:   "#8A9AB5",
  bgPanel: "var(--bg-panel)",
  bgSub:   "var(--bg-sub)",
  bgDeep:  "var(--bg-deep)",
  rim:     "var(--border-rim)",
  soft:    "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:    "var(--accent-cyan)",
  amber:   "var(--accent-amber)",
  green:   "var(--status-pass,#22c55e)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

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

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PhaseCalculate — Step 2: Confirm & run calculation                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function PhaseCalculate({ positions, token, onComplete, onBack }: PhaseCalculateProps) {
  const [marketSnapshot, setMarketSnapshot] = useState<Record<string, unknown> | null>(null);
  const [marketLoading, setMarketLoading]   = useState(true);
  const [marketError, setMarketError]       = useState<TranslatedError | null>(null);

  const [policyName, setPolicyName]         = useState<string | null>(null);
  const [policyConfig, setPolicyConfig]     = useState(DEFAULT_POLICY);
  const [policyInstanceId, setPolicyInstanceId] = useState<string | undefined>(undefined);
  const [policyLoading, setPolicyLoading]   = useState(true);

  const [calculating, setCalculating]       = useState(false);
  const [calcError, setCalcError]           = useState<TranslatedError | null>(null);

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
    try {
      const polRes = await dashboardFetch("/v1/policies/active", token);
      if (polRes.ok) {
        const polData = await polRes.json();
        setPolicyConfig((polData.config ?? polData.parameters ?? DEFAULT_POLICY) as typeof DEFAULT_POLICY);
        setPolicyInstanceId((polData.id ?? polData.policy_instance_id) as string | undefined);
        setPolicyName((polData.name ?? polData.policy_name ?? null) as string | null);
      }
    } catch {
      // Use default policy
    } finally {
      setPolicyLoading(false);
    }
  }, [token]);

  useEffect(() => { loadMarket(); }, [loadMarket]);
  useEffect(() => { loadPolicy(); }, [loadPolicy]);

  // ── Run calculation ──────────────────────────────────────────────────

  const runCalculation = async () => {
    setCalculating(true);
    setCalcError(null);
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

      onComplete({
        runId,
        calcResponse: data,
        marketSnapshot: mktSnap,
        policyInstanceId,
        riskDecisionHash,
      });

    } catch (e) {
      setCalcError(translateCaughtError(e));
    } finally {
      setCalculating(false);
    }
  };

  const isReady = !marketLoading && !policyLoading && !calculating;
  const canRun = isReady && !calcError;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Scrollable content ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Step header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: HD.cyan }}>
            STEP 2 OF 5 — CALCULATE
          </span>
          <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
            Review inputs and run the hedge engine
          </span>
        </div>

        {/* ── Card 1: Positions ─────────────────────────────────────── */}
        <SummaryCard
          icon={FileTextIcon}
          title="POSITIONS"
          badge={`${positions.length}`}
          badgeColor={HD.cyan}
        >
          {/* Currency aggregation */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
            {Object.entries(currencyAgg).map(([ccy, { count, total }]) => (
              <div key={ccy} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>
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
          ) : HD.crimson}
        >
          {marketLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LoaderIcon size={14} color={HD.slate} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.tertiary }}>Fetching live rates...</span>
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
                    <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>{pair} SPOT</span>
                    <span style={{ fontFamily: HD.fontMono, fontSize: 18, fontWeight: 700, color: HD.primary }}>{fmt(spot)}</span>
                    {asOf && (
                      <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary }}>
                        as of {new Date(asOf).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>

                  {/* Forward buckets */}
                  {fwdEntries.map(([bucket, pts]) => (
                    <div key={bucket} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>{bucket}</span>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 14, fontWeight: 600, color: HD.primary }}>{fmt(spot + pts)}</span>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: pts >= 0 ? HD.emerald : HD.crimson }}>
                        {pts >= 0 ? "+" : ""}{fmt(pts)} pts
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })() : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.amber }}>
                Market data unavailable
              </span>
              {marketError && (
                <span style={{ fontFamily: HD.fontUI, fontSize: 11, color: HD.tertiary }}>{marketError.message}</span>
              )}
              <button
                onClick={loadMarket}
                style={{
                  fontFamily: HD.fontMono, fontSize: 9, letterSpacing: "0.08em",
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
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.tertiary }}>Loading policy...</span>
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
            fontFamily: HD.fontMono, fontSize: 10, letterSpacing: "0.06em",
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
            <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate, display: "flex", alignItems: "center", gap: 4 }}>
              <LoaderIcon size={10} style={{ animation: "spin 1s linear infinite" }} />
              MARKET
            </span>
          )}
          {policyLoading && (
            <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate, display: "flex", alignItems: "center", gap: 4 }}>
              <LoaderIcon size={10} style={{ animation: "spin 1s linear infinite" }} />
              POLICY
            </span>
          )}
          {isReady && !calculating && (
            <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.emerald, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircleIcon size={10} />
              READY
            </span>
          )}
        </div>

        <button
          onClick={runCalculation}
          disabled={!canRun}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            color: "#ffffff",
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
      borderRadius: 4,
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 14px",
        background: HD.bgSub,
        borderBottom: `1px solid ${HD.soft}`,
      }}>
        <Icon size={13} color={HD.tertiary} />
        <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
          {title}
        </span>
        <span style={{
          fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          color: badgeColor,
          background: `color-mix(in srgb, ${badgeColor} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${badgeColor} 30%, transparent)`,
          padding: "1px 6px", borderRadius: 2,
        }}>
          {badge}
        </span>
      </div>
      <div style={{ padding: "12px 14px" }}>
        {children}
      </div>
    </div>
  );
}

function PolicyField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>{label}</span>
      <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 600, color: HD.primary }}>{value}</span>
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
        borderRadius: 3,
        overflow: "hidden",
      }}>
        {/* Mini header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 80px 100px 90px",
          gap: 0,
          padding: "4px 10px",
          background: HD.bgDeep,
        }}>
          {["ENTITY", "CCY", "AMOUNT", "DATE"].map(h => (
            <span key={h} style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 600, color: HD.tertiary, letterSpacing: "0.08em" }}>{h}</span>
          ))}
        </div>

        {shown.map((p, i) => (
          <div key={p.id} style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 100px 90px",
            gap: 0,
            padding: "5px 10px",
            borderTop: `1px solid ${HD.soft}`,
            background: i % 2 === 0 ? HD.bgPanel : HD.bgSub,
          }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.entity}</span>
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.cyan }}>{p.currency}</span>
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.primary }}>{fmtInt(p.amount ?? 0)}</span>
            <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.tertiary }}>{p.value_date}</span>
          </div>
        ))}
      </div>

      {positions.length > 3 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            fontFamily: HD.fontMono, fontSize: 9, letterSpacing: "0.06em",
            color: HD.cyan, background: "none",
            border: "none", padding: "6px 0",
            cursor: "pointer",
          }}
        >
          {expanded ? "▲ COLLAPSE" : `▼ SHOW ALL ${positions.length} POSITIONS`}
        </button>
      )}
    </div>
  );
}
