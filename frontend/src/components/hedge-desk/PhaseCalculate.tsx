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
  hedge_ratio: 1.0,
  instrument: "FORWARD",
  max_notional_usd: 50000000,
  allow_indicative_proxy: true,
};

function fmt(n: number, decimals = 4): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export default function PhaseCalculate({ positions, token, onComplete, onBack }: PhaseCalculateProps) {
  const [marketData, setMarketData]   = useState<Record<string, number>>({});
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError]     = useState<string | null>(null);
  const [calcResult, setCalcResult]   = useState<Record<string, unknown> | null>(null);

  // Derive unique currencies from positions
  const currencies = Array.from(new Set(positions.map(p => p.currency)));

  const loadMarket = useCallback(async () => {
    setMarketLoading(true);
    setMarketError(null);
    try {
      const qs = currencies.map(c => `currencies=${c}`).join("&");
      const res = await fetch(`/api/market-autofill?${qs}`);
      if (!res.ok) throw new Error(`Market autofill HTTP ${res.status}`);
      const data = await res.json();
      setMarketData(data as Record<string, number>);
    } catch (e) {
      // Non-fatal — we use defaults
      setMarketError(e instanceof Error ? e.message : "Market autofill unavailable");
      setMarketData({});
    } finally {
      setMarketLoading(false);
    }
  }, [currencies.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

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

      // 2. Build market snapshot
      const today = new Date().toISOString().split("T")[0];
      const spot = (marketData["usdmxn"] ?? marketData["USDMXN"] ?? 19.5) as number;

      // Generate forward point buckets for each trade's value_date month
      // Uses flat curve (0 fwd points) as sensible default when no live data
      const fwdPoints: Record<string, number> = {};
      for (const p of positions) {
        if (p.value_date) {
          const bucket = String(p.value_date).slice(0, 7); // "YYYY-MM"
          if (!fwdPoints[bucket]) fwdPoints[bucket] = 0;
        }
      }
      // Also add current month and next 3 months for coverage
      const now = new Date();
      for (let i = 0; i < 4; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!fwdPoints[key]) fwdPoints[key] = 0;
      }

      const marketSnapshot: Record<string, unknown> = {
        as_of: today,
        spot_usdmxn: spot,
        forward_points_by_month: fwdPoints,
        provider_metadata: { source: "autofill", data_class: "INDICATIVE" },
      };

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
        market: marketSnapshot,
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
        marketSnapshot: marketSnapshot as Record<string, unknown>,
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
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {marketLoading ? (
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.tertiary }}>Loading...</span>
          ) : Object.keys(marketData).length > 0 ? (
            Object.entries(marketData).map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>{k.toUpperCase()}</span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 13, fontWeight: 600, color: HD.primary }}>{fmt(v as number)}</span>
              </div>
            ))
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>USD/MXN (DEFAULT)</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 13, fontWeight: 600, color: HD.amber }}>19.5000</span>
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
