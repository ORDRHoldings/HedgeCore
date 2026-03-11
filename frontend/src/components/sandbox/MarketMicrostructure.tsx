"use client";

import { useState, useMemo } from "react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  green:    "var(--accent-green)",
  amber:    "var(--accent-amber)",
  red:      "var(--accent-red, #f87171)",
} as const;

function fmt(n: number, dp = 0): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return sign + "$" + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return sign + "$" + (abs / 1_000).toFixed(0) + "K";
  return sign + "$" + abs.toFixed(dp);
}

// ─── Bid-ask spread table by currency × tenor ─────────────────────────────────

interface SpreadEntry {
  currency: string;
  pair: string;
  spot: number;        // bps
  onm: number;        // O/N and 1M
  m3: number;         // 3M
  m6: number;         // 6M
  y1: number;         // 1Y
  liquidity: "HIGH" | "MED" | "LOW";
  dailyVol: number;   // USD billion daily average
}

const SPREAD_TABLE: SpreadEntry[] = [
  { currency: "EUR", pair: "EUR/USD", spot: 0.5, onm: 1.0, m3: 1.5, m6: 2.0, y1: 3.0, liquidity: "HIGH", dailyVol: 1_148 },
  { currency: "JPY", pair: "USD/JPY", spot: 0.5, onm: 1.2, m3: 2.0, m6: 2.5, y1: 4.0, liquidity: "HIGH", dailyVol: 1_055 },
  { currency: "GBP", pair: "GBP/USD", spot: 0.7, onm: 1.5, m3: 2.5, m6: 3.0, y1: 5.0, liquidity: "HIGH", dailyVol: 715 },
  { currency: "AUD", pair: "AUD/USD", spot: 1.0, onm: 2.0, m3: 3.0, m6: 4.0, y1: 6.0, liquidity: "HIGH", dailyVol: 392 },
  { currency: "CAD", pair: "USD/CAD", spot: 1.0, onm: 2.0, m3: 3.0, m6: 4.0, y1: 6.0, liquidity: "HIGH", dailyVol: 329 },
  { currency: "CHF", pair: "USD/CHF", spot: 0.8, onm: 1.5, m3: 2.5, m6: 3.5, y1: 5.5, liquidity: "HIGH", dailyVol: 278 },
  { currency: "CNY", pair: "USD/CNH", spot: 2.0, onm: 3.0, m3: 5.0, m6: 7.0, y1: 10.0, liquidity: "MED", dailyVol: 313 },
  { currency: "KRW", pair: "USD/KRW", spot: 3.0, onm: 5.0, m3: 8.0, m6: 12.0, y1: 18.0, liquidity: "MED", dailyVol: 93 },
  { currency: "INR", pair: "USD/INR", spot: 3.0, onm: 5.0, m3: 8.0, m6: 12.0, y1: 18.0, liquidity: "MED", dailyVol: 65 },
  { currency: "MXN", pair: "USD/MXN", spot: 2.5, onm: 4.0, m3: 6.0, m6: 8.5, y1: 14.0, liquidity: "MED", dailyVol: 119 },
  { currency: "BRL", pair: "USD/BRL", spot: 8.0, onm: 12.0, m3: 18.0, m6: 25.0, y1: 38.0, liquidity: "MED", dailyVol: 45 },
  { currency: "ZAR", pair: "USD/ZAR", spot: 4.0, onm: 6.0, m3: 10.0, m6: 15.0, y1: 22.0, liquidity: "LOW", dailyVol: 38 },
  { currency: "TRY", pair: "USD/TRY", spot: 5.0, onm: 8.0, m3: 14.0, m6: 20.0, y1: 32.0, liquidity: "LOW", dailyVol: 29 },
  { currency: "CLP", pair: "USD/CLP", spot: 6.0, onm: 10.0, m3: 16.0, m6: 24.0, y1: 36.0, liquidity: "LOW", dailyVol: 18 },
  { currency: "COP", pair: "USD/COP", spot: 7.0, onm: 12.0, m3: 18.0, m6: 28.0, y1: 42.0, liquidity: "LOW", dailyVol: 12 },
];

// ─── Kyle's Lambda Market Impact Model ────────────────────────────────────────
// Frazzini, Israel & Moskowitz (2018) — "Trading Costs" — SSRN 3229719
// Kyle (1985) — "Continuous Auctions and Insider Trading" — Econometrica

interface KyleLambdaOutput {
  lambda: number;         // $/volume — price impact per unit volume
  priceImpact: number;    // USD basis points for a given order
  temporaryImpact: number;
  permanentImpact: number;
  halfLife: number;       // minutes for impact to decay
  recommendedSlice: number;  // optimal slice size in USD
}

/**
 * Kyle's Lambda: ΔP = λ × Q
 * λ = σ / (2 × ADV × √(T))  where T = days of execution
 * Per Almgren (2001): temporary impact = γ × σ × (v/ADV)^0.5
 *   permanent impact = η × σ × (v/ADV)^0.5
 */
function computeKyleLambda(
  orderSizeUSD: number,
  advUSD: number,        // Average daily volume in USD
  dailyVolPct: number,   // Daily return volatility (e.g. 0.008 = 0.8%)
  executionDays: number,
): KyleLambdaOutput {
  // Kyle's Lambda (simplified) — price impact per unit of order imbalance
  const lambda = dailyVolPct / (2 * advUSD * Math.sqrt(executionDays));

  // Price impact in bps for the given order
  const priceImpactFraction = lambda * orderSizeUSD;
  const priceImpactBps = priceImpactFraction * 10000;

  // Almgren-Chriss decomposition
  const participationRate = orderSizeUSD / (advUSD * executionDays);
  const tempCoeff = 0.142; // empirical from Frazzini et al. 2018
  const permCoeff = 0.071;
  const temporaryImpact = tempCoeff * dailyVolPct * Math.sqrt(participationRate) * 10000;
  const permanentImpact = permCoeff * dailyVolPct * Math.sqrt(participationRate) * 10000;

  // Half-life of price impact decay (market microstructure)
  const halfLife = 15 + 30 * Math.log(1 + orderSizeUSD / advUSD * 100); // minutes (rough)

  // Recommended VWAP slice to minimize total impact
  // Optimal: slice = ADV × T × participationRate_optimal
  const optimalParticipation = Math.min(0.05, 0.05 * Math.pow(advUSD / orderSizeUSD, 0.5));
  const recommendedSlice = advUSD * executionDays * optimalParticipation;

  return { lambda, priceImpact: priceImpactBps, temporaryImpact, permanentImpact, halfLife, recommendedSlice };
}

// ─── Almgren-Chriss Optimal Execution ─────────────────────────────────────────
// Almgren & Chriss (2001) — "Optimal Execution of Portfolio Transactions"
// Journal of Risk Vol. 3 No. 2, Winter 2000/2001

interface ACOutput {
  optimalTradingRate: number[];  // shares/period for each interval
  expectedCost: number;          // in bps
  expectedVariance: number;       // variance of execution cost
  tradeOffParam: number;          // risk-aversion parameter λ
  optimalDays: number;
  executionSchedule: Array<{ interval: number; qty: number; cumulative: number }>;
}

/**
 * Almgren-Chriss model for optimal liquidation trajectory.
 * Minimises: E[cost] + λ × Var[cost]
 * where cost = temporary + permanent impact.
 */
function computeAlmgrenChriss(
  totalQty: number,        // USD to execute
  advUSD: number,
  dailyVol: number,
  riskAversionLambda: number,
  totalIntervals: number,
): ACOutput {
  const eta = 0.142; // temp impact linear coefficient
  const gamma = 0.071; // perm impact linear coefficient

  // Almgren-Chriss trajectory: exponential with decay κ
  const kappa = Math.sqrt(riskAversionLambda * dailyVol ** 2 * advUSD / eta);
  const kappaHat = 2 * Math.sinh(kappa / 2) / Math.cosh(kappa * totalIntervals / 2);

  let remaining = totalQty;
  const schedule: Array<{ interval: number; qty: number; cumulative: number }> = [];
  const rates: number[] = [];

  for (let j = 1; j <= totalIntervals; j++) {
    const qty = totalQty * (Math.sinh(kappa * (totalIntervals - j + 1)) - Math.sinh(kappa * (totalIntervals - j)))
      / Math.sinh(kappa * totalIntervals);
    const safeQty = Math.max(0, Math.min(remaining, qty));
    rates.push(safeQty);
    remaining -= safeQty;
    schedule.push({ interval: j, qty: safeQty, cumulative: totalQty - remaining });
  }

  // If residual remains (numerical), add to last bucket
  if (remaining > 0 && schedule.length > 0) {
    schedule[schedule.length - 1].qty += remaining;
    schedule[schedule.length - 1].cumulative = totalQty;
  }

  // Expected cost in bps
  const avgQty = totalQty / totalIntervals;
  const tempCost = eta * (avgQty / advUSD) ** 0.5 * 10000;
  const permCost = gamma * (totalQty / advUSD) * 10000;
  const expectedCost = tempCost + permCost;
  const expectedVariance = (dailyVol ** 2) * (totalQty ** 2) / totalIntervals;
  const optimalDays = Math.ceil(totalQty / (advUSD * 0.05)); // 5% ADV target

  void kappaHat; // suppress unused

  return { optimalTradingRate: rates, expectedCost, expectedVariance, tradeOffParam: riskAversionLambda, optimalDays, executionSchedule: schedule };
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MarketMicrostructureProps {
  notionalUSD?: number;
  primaryCurrency?: string;
  spot?: number;
}

export default function MarketMicrostructure({
  notionalUSD = 500_000,
  primaryCurrency = "MXN",
  spot = 18.97,
}: MarketMicrostructureProps) {
  const [activeTab, setActiveTab] = useState<"spreads" | "impact" | "almgren">("spreads");
  const [selectedCcy, setSelectedCcy] = useState(primaryCurrency);
  const [orderSize, setOrderSize] = useState(notionalUSD);
  const [executionDays, setExecutionDays] = useState(1);
  const [riskAversion, setRiskAversion] = useState(0.001);

  const selectedSpread = SPREAD_TABLE.find(e => e.currency === selectedCcy) ?? SPREAD_TABLE.find(e => e.currency === "MXN")!;
  const advUSD = (selectedSpread.dailyVol ?? 100) * 1_000_000; // convert $B to $
  const dailyVol = 0.008; // 0.8% daily vol approximation for EM FX

  const kyle = useMemo(() => computeKyleLambda(orderSize, advUSD, dailyVol, executionDays), [orderSize, advUSD, executionDays]);
  const ac = useMemo(() => computeAlmgrenChriss(orderSize, advUSD, dailyVol, riskAversion, Math.max(2, executionDays * 5)), [orderSize, advUSD, riskAversion, executionDays]);

  const TABS = [
    { id: "spreads" as const, label: "Bid-Ask Spreads" },
    { id: "impact" as const, label: "Market Impact" },
    { id: "almgren" as const, label: "Optimal Execution" },
  ];

  function liquidityColor(liq: SpreadEntry["liquidity"]): string {
    if (liq === "HIGH") return S.green;
    if (liq === "MED") return S.amber;
    return S.red;
  }

  return (
    <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px", borderBottom: `1px solid ${S.rim}`,
        background: `color-mix(in srgb, ${S.sub} 60%, transparent)`,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.cyan }}>
          ◈ MARKET MICROSTRUCTURE
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
          Kyle (1985) · Almgren-Chriss (2001) · BIS Triennial 2022
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${S.rim}`, background: S.sub }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            padding: "7px 14px", border: "none",
            borderBottom: activeTab === t.id ? `2px solid ${S.cyan}` : "2px solid transparent",
            background: "transparent",
            color: activeTab === t.id ? S.cyan : S.tertiary,
            cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: "14px 16px" }}>

        {/* SPREADS TABLE */}
        {activeTab === "spreads" && (
          <div>
            <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, margin: "0 0 12px", lineHeight: 1.6 }}>
              Indicative FX forward bid-ask spreads by currency and tenor. Based on BIS 2022 Triennial Survey market depth data.
              Crisis spreads can be 5–20× normal. EM NDF spreads typically 2–5× wider than DM forwards.
            </p>
            <div style={{ overflowX: "auto" }}>
              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "70px 100px 55px 55px 55px 55px 55px 60px 80px",
                gap: 4, padding: "5px 8px",
                background: `color-mix(in srgb, ${S.rim} 30%, transparent)`,
                borderRadius: "3px 3px 0 0",
              }}>
                {["CCY", "PAIR", "SPOT", "O/N+1M", "3M", "6M", "1Y", "LIQ.", "ADV (B)"].map(h => (
                  <span key={h} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>{h}</span>
                ))}
              </div>
              {SPREAD_TABLE.map((e, i) => (
                <div key={e.currency} style={{
                  display: "grid", gridTemplateColumns: "70px 100px 55px 55px 55px 55px 55px 60px 80px",
                  gap: 4, padding: "5px 8px",
                  background: e.currency === selectedCcy ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : i % 2 === 0 ? S.sub : "transparent",
                  borderBottom: `1px solid ${S.soft}`,
                  cursor: "pointer",
                }} onClick={() => setSelectedCcy(e.currency)}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: e.currency === selectedCcy ? S.cyan : S.primary }}>{e.currency}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{e.pair}</span>
                  {[e.spot, e.onm, e.m3, e.m6, e.y1].map((bps, j) => (
                    <span key={j} style={{ fontFamily: S.fontMono, fontSize: 12, color: bps <= 3 ? S.green : bps <= 10 ? S.amber : S.red }}>
                      {bps.toFixed(1)}
                    </span>
                  ))}
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                    padding: "1px 4px", borderRadius: 2, textAlign: "center",
                    color: liquidityColor(e.liquidity),
                    background: `color-mix(in srgb, ${liquidityColor(e.liquidity)} 10%, transparent)`,
                  }}>{e.liquidity}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>${e.dailyVol}B</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
              All spreads in basis points (half-spread). Source: BIS 2022 Triennial Central Bank Survey · Bloomberg FX Desk estimates.
              Crisis spreads expand 5–20×. Spreads shown are normal market conditions.
            </div>
          </div>
        )}

        {/* MARKET IMPACT */}
        {activeTab === "impact" && (
          <div>
            <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, margin: "0 0 12px", lineHeight: 1.6 }}>
              Kyle's Lambda (1985) market impact model — measures price impact per unit of order flow.
              Price impact = λ × Q where Q = order size. Frazzini, Israel & Moskowitz (2018) empirical estimate:
              temporary impact ≈ 14.2% × σ × √(participation rate).
            </p>

            {/* Controls */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
              {[
                { label: "Order Size (USD)", value: orderSize, min: 10000, max: 10_000_000, step: 10000, format: (v: number) => fmt(v), onChg: setOrderSize },
                { label: "Execution Days", value: executionDays, min: 1, max: 20, step: 1, format: (v: number) => v + "d", onChg: setExecutionDays },
              ].map((ctrl) => (
                <div key={ctrl.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <label style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textTransform: "uppercase" }}>{ctrl.label}</label>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{ctrl.format(ctrl.value)}</span>
                  </div>
                  <input type="range" min={ctrl.min} max={ctrl.max} step={ctrl.step} value={ctrl.value}
                    onChange={e => ctrl.onChg(parseFloat(e.target.value))}
                    style={{ accentColor: S.cyan }} />
                </div>
              ))}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textTransform: "uppercase" }}>Currency</label>
                <select
                  value={selectedCcy}
                  onChange={e => setSelectedCcy(e.target.value)}
                  style={{
                    fontFamily: S.fontMono, fontSize: 12, color: S.primary,
                    background: S.sub, border: `1px solid ${S.rim}`, padding: "4px 8px",
                    borderRadius: 2,
                  }}
                >
                  {SPREAD_TABLE.map(e => <option key={e.currency} value={e.currency}>{e.pair}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: S.sub, border: `1px solid ${S.soft}`, borderRadius: 3, padding: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, marginBottom: 8 }}>KYLE'S LAMBDA MODEL</div>
                {[
                  ["Order Size", fmt(orderSize)],
                  ["ADV", fmt(advUSD) + "/day"],
                  ["Order / ADV", (orderSize / advUSD * 100).toFixed(2) + "%"],
                  ["Kyle's Lambda (λ)", kyle.lambda.toExponential(2)],
                  ["Total Price Impact", kyle.priceImpact.toFixed(2) + " bps"],
                  ["Temporary Impact", kyle.temporaryImpact.toFixed(2) + " bps"],
                  ["Permanent Impact", kyle.permanentImpact.toFixed(2) + " bps"],
                  ["Half-Life", kyle.halfLife.toFixed(0) + " min"],
                  ["Recommended Slice", fmt(kyle.recommendedSlice)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: S.sub, border: `1px solid ${S.soft}`, borderRadius: 3, padding: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, marginBottom: 8 }}>TOTAL EXECUTION COST</div>
                {[
                  ["Bid-Ask Spread", (selectedSpread.m3 * 2).toFixed(1) + " bps (2× half-spread)"],
                  ["Market Impact", kyle.priceImpact.toFixed(2) + " bps"],
                  ["Total Friction", (selectedSpread.m3 * 2 + kyle.priceImpact).toFixed(2) + " bps"],
                  ["Total Cost USD", fmt((selectedSpread.m3 * 2 + kyle.priceImpact) * orderSize / 10000)],
                  ["Cost as % Notional", ((selectedSpread.m3 * 2 + kyle.priceImpact) / 100).toFixed(3) + "%"],
                  ["Market Depth", selectedSpread.liquidity],
                  ["Institutional Access", selectedSpread.liquidity !== "LOW" ? "Direct Dealer" : "ECN/Dark Pool"],
                  ["Recommendation", orderSize / advUSD > 0.02 ? "SLICE ORDER" : "SINGLE TICKET"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
              Model: Kyle (1985) "Continuous Auctions and Insider Trading" Econometrica 53(6) ·
              Frazzini, Israel & Moskowitz (2018) "Trading Costs" SSRN 3229719 ·
              Impact half-life per Bouchaud et al. (2018) "Trades, Quotes and Prices"
            </div>
          </div>
        )}

        {/* ALMGREN-CHRISS */}
        {activeTab === "almgren" && (
          <div>
            <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, margin: "0 0 12px", lineHeight: 1.6 }}>
              Almgren-Chriss (2001) optimal liquidation trajectory. Minimises: E[cost] + λ × Var[cost].
              Higher risk-aversion (λ) → execute faster (bear higher temporary impact to reduce variance).
              Optimal VWAP schedule shown below.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <label style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>RISK AVERSION λ</label>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{riskAversion.toFixed(4)}</span>
                </div>
                <input type="range" min={0.0001} max={0.01} step={0.0001} value={riskAversion}
                  onChange={e => setRiskAversion(parseFloat(e.target.value))}
                  style={{ accentColor: S.cyan }} />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>0 (cost-only)</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>0.01 (risk-averse)</span>
                </div>
              </div>
              <div style={{ background: S.sub, border: `1px solid ${S.soft}`, borderRadius: 3, padding: 10 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginBottom: 4 }}>SUMMARY</div>
                {[
                  ["Expected Cost", ac.expectedCost.toFixed(2) + " bps"],
                  ["Optimal Days", ac.optimalDays + " trading days"],
                  ["Trade Profile", riskAversion > 0.005 ? "Front-loaded" : "TWAP/Even"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Execution schedule */}
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 100px 80px", gap: 6, padding: "4px 8px", background: S.sub, borderRadius: "3px 3px 0 0" }}>
                {["Period", "Volume Bar", "Qty", "Cumul %"].map(h => (
                  <span key={h} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary }}>{h}</span>
                ))}
              </div>
              {ac.executionSchedule.slice(0, 10).map((row, i) => {
                const pct = row.qty / orderSize;
                const cumPct = row.cumulative / orderSize;
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 100px 80px", gap: 6, padding: "4px 8px", borderBottom: `1px solid ${S.soft}` }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>P{row.interval}</span>
                    <div style={{ alignSelf: "center" }}>
                      <div style={{ height: 8, background: S.rim, borderRadius: 1 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, pct * 100).toFixed(1)}%`, background: S.cyan, borderRadius: 1 }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{fmt(row.qty)}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{(cumPct * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
              Almgren & Chriss (2001) "Optimal Execution of Portfolio Transactions" Journal of Risk 3(2) ·
              Temporary impact: η=14.2% empirical · Permanent impact: γ=7.1% ·
              Optimal decay trajectory: x_j = X × sinh(κ(T-t_j))/sinh(κT)
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
