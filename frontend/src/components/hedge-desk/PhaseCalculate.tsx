"use client";

import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { PositionRow } from "@/api/positionClient";
import DisclosurePanel from "./DisclosurePanel";
import { LoaderIcon, AlertCircleIcon, CheckCircleIcon, ChevronLeftIcon } from "lucide-react";

const HD = {
  navy:    "#0A1F44",
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

export default function PhaseCalculate({ positions, token, onComplete, onBack }: PhaseCalculateProps) {
  const [marketSnapshot, setMarketSnapshot] = useState<Record<string, unknown> | null>(null);
  const [marketLoading, setMarketLoading]   = useState(true);
  const [marketError, setMarketError]       = useState<string | null>(null);
  const [calculating, setCalculating]       = useState(false);
  const [calcError, setCalcError]           = useState<string | null>(null);
  const [calcResult, setCalcResult]         = useState<Record<string, unknown> | null>(null);

  // Derive unique currencies and value dates from positions
  const currencies = Array.from(new Set(positions.map(p => p.currency)));
  const valueDates = positions.map(p => p.value_date).filter(Boolean) as string[];

  const loadMarket = useCallback(async () => {
    setMarketLoading(true);
    setMarketError(null);

    async function fetchMarket() {
      const res = await fetch("/api/market-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currencies, trade_value_dates: valueDates }),
      });
      if (!res.ok) throw new Error(`Market autofill HTTP ${res.status}`);
      const data = await res.json();
      const mkt = data.market as Record<string, unknown> | undefined;
      if (!mkt) throw new Error("No market data in response");
      return mkt;
    }

    try {
      // First attempt
      let mkt: Record<string, unknown>;
      try {
        mkt = await fetchMarket();
      } catch {
        // Single automatic retry after 1 second
        await new Promise(r => setTimeout(r, 1000));
        mkt = await fetchMarket();
      }
      setMarketSnapshot(mkt);
      setMarketError(null);
    } catch (e) {
      setMarketError(e instanceof Error ? e.message : "Market autofill unavailable");
      setMarketSnapshot(null);
    } finally {
      setMarketLoading(false);
    }
  }, [currencies.join(","), valueDates.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadMarket(); }, [loadMarket]);

  const runCalculation = async () => {
    setCalculating(true);
    setCalcError(null);
    try {
      // 1. Fetch active policy
      let policyConfig = DEFAULT_POLICY;
      let policyInstanceId: string | undefined;
      try {
        const polRes = await dashboardFetch("/v1/policies/active", token);
        if (polRes.ok) {
          const polData = await polRes.json();
          policyConfig = (polData.config ?? polData.parameters ?? DEFAULT_POLICY) as typeof DEFAULT_POLICY;
          policyInstanceId = (polData.id ?? polData.policy_instance_id) as string | undefined;
        }
      } catch {
        // Use default policy
      }

      // 2. Build market snapshot — use live data if already loaded, else fetch now
      let mktSnap: Record<string, unknown>;
      if (marketSnapshot) {
        mktSnap = { ...marketSnapshot };
      } else {
        // marketSnapshot not yet available — fetch it directly so we never use a hardcoded rate
        const fallbackRes = await fetch("/api/market-autofill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currencies, trade_value_dates: valueDates }),
        });
        if (!fallbackRes.ok) throw new Error("Market data unavailable — please retry");
        const fallbackData = await fallbackRes.json();
        const fallbackMkt = fallbackData.market as Record<string, unknown> | undefined;
        if (!fallbackMkt) throw new Error("Market data unavailable — please retry");
        mktSnap = { ...fallbackMkt };
        setMarketSnapshot(fallbackMkt);
      }

      // 3. Build trades payload
      const trades = positions.map(p => ({
        record_id:  p.record_id ?? p.id,
        entity:     p.entity,
        type:       p.type ?? "AP",
        currency:   p.currency,
        amount:     p.amount ?? 0,
        value_date: p.value_date,
        status:     "CONFIRMED",
      }));

      // 4. POST /v1/calculate
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
        const errData = await res.json().catch(() => ({}));
        const detail = (errData as Record<string, unknown>).detail;
        const msg = typeof detail === "string" ? detail
          : detail ? JSON.stringify(detail)
          : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const data = await res.json() as Record<string, unknown>;
      setCalcResult(data);

      // 5. Build result
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
      setCalcError(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px", height: "100%", overflowY: "auto" }}>

      {/* Top action strip — always visible */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: `1px solid ${HD.rim}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.cyan }}>
            STEP 2 OF 4 — CALCULATE
          </span>
          <span style={{ fontFamily: HD.fontUI, fontSize: 11, color: HD.secondary }}>
            {positions.length} position{positions.length !== 1 ? "s" : ""} · {currencies.join(", ")} · Confirm snapshot and run.
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {marketLoading && (
          <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate, letterSpacing: "0.06em" }}>
            ● LOADING MARKET DATA...
          </span>
        )}
        {!marketLoading && marketSnapshot && (() => {
          const meta = marketSnapshot.provider_metadata as Record<string, unknown> | undefined;
          const dataClass = (meta?.data_class ?? "UNKNOWN") as string;
          const isLive = dataClass === "LIVE";
          return (
            <span style={{
              fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: isLive ? HD.emerald : HD.amber,
              padding: "2px 6px", borderRadius: 2,
              background: isLive ? "color-mix(in srgb,#2ECC71 10%,transparent)" : "color-mix(in srgb,var(--accent-amber) 10%,transparent)",
            }}>
              {isLive ? "● LIVE" : "● INDICATIVE"}
            </span>
          );
        })()}
        <button
          onClick={runCalculation}
          disabled={calculating || marketLoading}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            color: "#ffffff",
            background: calculating || marketLoading ? HD.slate : HD.royal,
            border: "none", padding: "10px 24px",
            cursor: calculating || marketLoading ? "not-allowed" : "pointer",
            borderRadius: 3, transition: "background 0.15s",
          }}
        >
          {calculating && <LoaderIcon size={14} color="#ffffff" style={{ animation: "spin 1s linear infinite" }} />}
          {calculating ? "RUNNING..." : "RUN CALCULATION"}
        </button>
      </div>

      {/* Back */}
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", alignSelf: "flex-start", padding: 0 }}>
        <ChevronLeftIcon size={14} color={HD.slate} />
        <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate, letterSpacing: "0.06em" }}>BACK TO SELECT</span>
      </button>

      {/* Positions summary */}
      <div style={{ background: HD.bgPanel, border: `1px solid ${HD.rim}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ padding: "8px 14px", background: HD.bgSub, borderBottom: `1px solid ${HD.soft}` }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
            POSITIONS IN THIS RUN ({positions.length})
          </span>
        </div>
        <div style={{ maxHeight: 180, overflowY: "auto" }}>
          {positions.map((p, i) => (
            <div key={p.id} style={{
              display: "flex",
              gap: 16,
              padding: "6px 14px",
              borderBottom: `1px solid ${HD.soft}`,
              background: i % 2 === 0 ? HD.bgPanel : HD.bgSub,
            }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.secondary, minWidth: 80 }}>{p.entity}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.cyan, minWidth: 40 }}>{p.currency}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.primary }}>{fmtInt(p.amount ?? 0)}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.tertiary, marginLeft: "auto" }}>{p.value_date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Market data */}
      <div style={{ background: HD.bgPanel, border: `1px solid ${HD.soft}`, borderRadius: 4, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
            MARKET SNAPSHOT
          </span>
          {marketLoading && <LoaderIcon size={12} color={HD.slate} style={{ animation: "spin 1s linear infinite" }} />}
          {marketError && <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.amber }}>{marketError} — using defaults</span>}
          {!marketLoading && marketSnapshot && (() => {
            const meta = marketSnapshot.provider_metadata as Record<string, unknown> | undefined;
            const dataClass = (meta?.data_class ?? "UNKNOWN") as string;
            const isLive = dataClass === "LIVE";
            return (
              <span style={{
                fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                color: isLive ? HD.emerald : HD.amber,
                background: isLive ? "color-mix(in srgb,#2ECC71 12%,transparent)" : "color-mix(in srgb,var(--accent-amber) 12%,transparent)",
                padding: "2px 6px", borderRadius: 2,
              }}>
                {isLive ? "● LIVE" : "● INDICATIVE"}
              </span>
            );
          })()}
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {marketLoading ? (
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.tertiary }}>Loading live rates from Finnhub...</span>
          ) : marketSnapshot ? (() => {
            const spot = marketSnapshot.spot_rate as number;
            const meta = marketSnapshot.provider_metadata as Record<string, unknown> | undefined;
            const pair = (meta?.currency_pair ?? "USD/MXN") as string;
            const fwd = marketSnapshot.forward_points_by_month as Record<string, number> | undefined;
            const fwdEntries = fwd ? Object.entries(fwd).sort(([a],[b]) => a.localeCompare(b)).slice(0, 4) : [];
            return (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>{pair} SPOT</span>
                  <span style={{ fontFamily: HD.fontMono, fontSize: 15, fontWeight: 700, color: HD.primary }}>{fmt(spot)}</span>
                </div>
                {fwdEntries.map(([bucket, pts]) => (
                  <div key={bucket} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>{bucket} FWD</span>
                    <span style={{ fontFamily: HD.fontMono, fontSize: 13, fontWeight: 600, color: HD.primary }}>{fmt(spot + pts)}</span>
                    <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: pts >= 0 ? HD.emerald : HD.crimson }}>
                      {pts >= 0 ? "+" : ""}{fmt(pts)} pts
                    </span>
                  </div>
                ))}
              </>
            );
          })() : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.amber, letterSpacing: "0.1em" }}>
                ⚠ MARKET DATA UNAVAILABLE
              </span>
              {marketError && (
                <span style={{ fontFamily: HD.fontUI, fontSize: 11, color: HD.tertiary }}>{marketError}</span>
              )}
              <button
                onClick={loadMarket}
                style={{
                  fontFamily: HD.fontMono, fontSize: 9, letterSpacing: "0.08em",
                  color: HD.cyan, background: "none",
                  border: `1px solid ${HD.soft}`, padding: "4px 10px",
                  cursor: "pointer", borderRadius: 3, alignSelf: "flex-start",
                }}
              >
                ↻ RETRY
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Calc error */}
      {calcError && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: `color-mix(in srgb,${HD.crimson} 10%,transparent)`, border: `1px solid color-mix(in srgb,${HD.crimson} 30%,transparent)`, borderRadius: 4 }}>
          <AlertCircleIcon size={14} color={HD.crimson} />
          <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.crimson }}>{calcError}</span>
        </div>
      )}

      {/* Calc result (shown after success — but onComplete is called immediately, so this is transient) */}
      {calcResult && !calculating && (
        <DisclosurePanel title="Calculation Details" level="L2" defaultOpen>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              ["Hedge Action", calcResult.hedge_action as string],
              ["Hedge Amount", calcResult.hedge_amount != null ? fmtInt(calcResult.hedge_amount as number) : "—"],
              ["Hedge Rate",   calcResult.hedge_rate   != null ? fmt(calcResult.hedge_rate as number) : "—"],
              ["Instrument",   calcResult.instrument   as string ?? "—"],
              ["Run ID",       ((calcResult.run_id ?? calcResult.id) as string ?? "—").slice(0, 16) + "..."],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${HD.soft}`, paddingBottom: 6 }}>
                <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.tertiary }}>{k}</span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.primary, fontWeight: 600 }}>{v ?? "—"}</span>
              </div>
            ))}
          </div>
        </DisclosurePanel>
      )}

      {/* Run button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto" }}>
        <button
          onClick={runCalculation}
          disabled={calculating || marketLoading}
          title="Run deterministic hedge calculation"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: HD.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "#ffffff",
            background: calculating || marketLoading ? HD.slate : HD.royal,
            border: "none",
            padding: "12px 28px",
            cursor: calculating || marketLoading ? "not-allowed" : "pointer",
            borderRadius: 3,
            transition: "background 0.15s",
          }}
        >
          {calculating && <LoaderIcon size={14} color="#ffffff" style={{ animation: "spin 1s linear infinite" }} />}
          {!calculating && <CheckCircleIcon size={14} color="#ffffff" />}
          {calculating ? "RUNNING CALCULATION..." : "RUN CALCULATION"}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
