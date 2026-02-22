"use client";

/**
 * currency-fx/page.tsx — FX Rates & Forward Curve
 *
 * Live TradingView chart, currency pair selector, forward curve table,
 * cross rates. All market data fetched live from /api/market-autofill.
 * No hardcoded demo rates or fake data.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import TradingViewEmbed from "../../components/execution/TradingViewEmbed";

// ── Design tokens ──────────────────────────────────────────────────────────────
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
  pass:      "var(--status-pass,#4ade80)",
  fail:      "var(--accent-red,#B91C1C)",
} as const;

// ── Pair definitions ─────────────────────────────────────────────────────────
interface PairDef {
  label:       string; // "USD/MXN"
  base:        string; // "USD"
  quote:       string; // "MXN"
  tvSymbol:    string; // "FX:USDMXN"
  apiCurrency: string; // currency to pass to market-autofill
}

const ALL_PAIRS: PairDef[] = [
  { label: "USD/MXN", base: "USD", quote: "MXN", tvSymbol: "FX:USDMXN", apiCurrency: "MXN" },
  { label: "EUR/MXN", base: "EUR", quote: "MXN", tvSymbol: "FX:EURMXN", apiCurrency: "MXN" },
  { label: "GBP/MXN", base: "GBP", quote: "MXN", tvSymbol: "FX:GBPMXN", apiCurrency: "MXN" },
  { label: "JPY/MXN", base: "JPY", quote: "MXN", tvSymbol: "FX:JPYMXN", apiCurrency: "MXN" },
  { label: "BRL/MXN", base: "BRL", quote: "MXN", tvSymbol: "FX:BRLMXN", apiCurrency: "MXN" },
  { label: "CNY/MXN", base: "CNY", quote: "MXN", tvSymbol: "FX:CNYMXN", apiCurrency: "MXN" },
];

// ── Market data shape ─────────────────────────────────────────────────────────
interface MarketData {
  spot:         number;
  forwardPoints: Record<string, number>;
  isLive:       boolean;
  source:       string;
  asOf:         string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

function getNextNMonths(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    result.push(d.toISOString().slice(0, 7));
  }
  return result;
}

// ── Badge helper ──────────────────────────────────────────────────────────────
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontFamily:    S.fontMono,
      fontSize:      9,
      fontWeight:    700,
      letterSpacing: "0.08em",
      color,
      background:    `color-mix(in srgb, ${color} 12%, transparent)`,
      border:        `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding:       "1px 5px",
      borderRadius:  2,
    }}>
      {text}
    </span>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function KpiSkeleton() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{
          background: S.bgPanel,
          border:     `1px solid ${S.rim}`,
          padding:    "16px 20px",
          minWidth:   160,
          flex:       1,
        }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 10 }}>
            &nbsp;
          </div>
          <div style={{
            fontFamily:  S.fontMono,
            fontSize:    13,
            color:       S.tertiary,
            letterSpacing: "0.12em",
            animation:   "pulse 1.4s ease-in-out infinite",
          }}>
            FETCHING MARKET DATA
            <span style={{ display: "inline-block", animation: "ellipsis 1.2s steps(3,end) infinite" }}>…</span>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes ellipsis {
          0%   { content: ""; }
          33%  { content: "."; }
          66%  { content: ".."; }
          100% { content: "..."; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CurrencyFxPage() {
  const router              = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [activePairIdx, setActivePairIdx] = useState(0);
  const [marketData,    setMarketData]    = useState<MarketData | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [renderTs,      setRenderTs]      = useState("");

  // Hydration-safe timestamp
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // ── Market data fetch ──
  const fetchMarket = useCallback(async (pairIdx: number) => {
    const pair = ALL_PAIRS[pairIdx];
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/market-autofill", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ currencies: [pair.apiCurrency] }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const market = data.market;

      if (!market) {
        throw new Error("Malformed response from /api/market-autofill");
      }

      setMarketData({
        spot:          market.spot_usdmxn as number,
        forwardPoints: (market.forward_points_by_month as Record<string, number>) ?? {},
        isLive:        market.provider_metadata?.data_class === "LIVE",
        source:        market.provider_metadata?.source ?? "unknown",
        asOf:          market.as_of ?? new Date().toISOString(),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error fetching market data");
      setMarketData(null);
    } finally {
      setLoading(false);
      setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
    }
  }, []);

  // Fetch on mount and when active pair changes
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchMarket(activePairIdx);
    }
  }, [activePairIdx, authLoading, isAuthenticated, fetchMarket]);

  // ── Derived values ──
  const selectedPair = ALL_PAIRS[activePairIdx];

  // Next 12 months of forward curve buckets (intersect with what API returned)
  const next12Months = getNextNMonths(12);
  const forwardBuckets: [string, number][] = (() => {
    if (!marketData?.forwardPoints) return [];
    const fp = marketData.forwardPoints;
    return next12Months
      .filter(m => fp[m] !== undefined)
      .map(m => [m, fp[m]] as [string, number]);
  })();

  // 12M NDF basis: last available forward point in the next 12 months
  const ndfBasis12M: number | null = (() => {
    if (forwardBuckets.length === 0) return null;
    return forwardBuckets[forwardBuckets.length - 1][1];
  })();

  // Source label
  const sourceLabel = marketData
    ? (marketData.source === "alpha_vantage_live" ? "Alpha Vantage LIVE" : "Indicative / Fallback")
    : "—";

  // Spot decimal precision
  const spotDecimals = selectedPair.label.includes("JPY") ? 3 : 4;

  if (authLoading) {
    return (
      <div style={{ background: S.bgDeep, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.1em" }}>
          AUTHENTICATING…
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI }}>

      {/* ── Page header ── */}
      <div style={{
        height:        44,
        padding:       "0 24px",
        borderBottom:  `1px solid ${S.rim}`,
        background:    S.bgPanel,
        display:       "flex",
        alignItems:    "center",
        justifyContent:"space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
            FX RATES
          </span>
          <span style={{ color: S.soft }}>·</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, letterSpacing: "0.06em", color: S.cyan }}>
            {selectedPair.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {loading ? (
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.amber }}>● FETCHING…</span>
          ) : marketData?.isLive ? (
            <Badge text="LIVE" color={S.pass} />
          ) : marketData ? (
            <Badge text="INDICATIVE" color={S.amber} />
          ) : null}
          <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {renderTs}
          </span>
        </div>
      </div>

      {/* ── Currency Pair Selector Bar ── */}
      <div style={{
        height:       36,
        display:      "flex",
        alignItems:   "stretch",
        gap:          0,
        borderBottom: `1px solid ${S.rim}`,
        background:   S.bgSub,
        paddingLeft:  12,
      }}>
        {ALL_PAIRS.map((p, i) => {
          const isActive = i === activePairIdx;
          return (
            <button
              key={p.label}
              onClick={() => setActivePairIdx(i)}
              style={{
                fontFamily:   S.fontMono,
                fontSize:     11,
                fontWeight:   isActive ? 700 : 400,
                letterSpacing:"0.04em",
                color:        isActive ? S.cyan : S.secondary,
                background:   "transparent",
                border:       "none",
                borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
                padding:      "0 16px",
                cursor:       "pointer",
                transition:   "color 120ms",
                display:      "flex",
                alignItems:   "center",
                gap:          6,
              }}
            >
              {p.label}
              {/* Directional indicator — show dash when no data loaded for this pair */}
              <span style={{
                fontSize:  9,
                color:     S.tertiary,
                fontWeight:600,
              }}>
                —
              </span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {error && (
          <div style={{
            display:    "flex",
            alignItems: "center",
            paddingRight: 16,
            fontFamily: S.fontMono,
            fontSize:   10,
            color:      S.fail,
          }}>
            FETCH ERROR — {error}
          </div>
        )}
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1440, margin: "0 auto" }}>

        {/* ── KPI cards ── */}
        {loading ? (
          <KpiSkeleton />
        ) : error ? (
          <div style={{
            background:  S.bgPanel,
            border:      `1px solid ${S.rim}`,
            borderLeft:  `3px solid ${S.fail}`,
            padding:     "16px 20px",
            fontFamily:  S.fontMono,
            fontSize:    12,
            color:       S.fail,
          }}>
            MARKET DATA UNAVAILABLE — {error}
            <button
              onClick={() => fetchMarket(activePairIdx)}
              style={{
                marginLeft:   16,
                fontFamily:   S.fontMono,
                fontSize:     10,
                fontWeight:   700,
                letterSpacing:"0.07em",
                color:        S.bgPanel,
                background:   S.amber,
                border:       "none",
                padding:      "4px 10px",
                borderRadius: 2,
                cursor:       "pointer",
              }}
            >
              RETRY
            </button>
          </div>
        ) : marketData ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {/* Spot Rate */}
            <div style={{
              background:  S.bgPanel,
              border:      `1px solid ${S.rim}`,
              borderTop:   `2px solid ${S.cyan}`,
              padding:     "16px 20px",
              minWidth:    160,
              flex:        1,
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 6 }}>
                SPOT RATE · {selectedPair.label}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 26, fontWeight: 700, color: S.primary, lineHeight: 1 }}>
                {marketData.spot.toFixed(spotDecimals)}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4 }}>
                {marketData.isLive ? "live · " : "indicative · "}{selectedPair.quote} per {selectedPair.base}
              </div>
            </div>

            {/* Implied Vol — not available from this endpoint */}
            <div style={{
              background:  S.bgPanel,
              border:      `1px solid ${S.rim}`,
              padding:     "16px 20px",
              minWidth:    160,
              flex:        1,
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 6 }}>
                IMPLIED VOL · 1Y
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.secondary, lineHeight: 1 }}>
                —
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4 }}>
                not available
              </div>
            </div>

            {/* NDF Basis 12M */}
            <div style={{
              background:  S.bgPanel,
              border:      `1px solid ${S.rim}`,
              padding:     "16px 20px",
              minWidth:    160,
              flex:        1,
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 6 }}>
                NDF BASIS · 12M
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.primary, lineHeight: 1 }}>
                {ndfBasis12M !== null ? `+${ndfBasis12M.toFixed(4)}` : "—"}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4 }}>
                {selectedPair.quote} fwd pts
              </div>
            </div>

            {/* Source */}
            <div style={{
              background:  S.bgPanel,
              border:      `1px solid ${S.rim}`,
              padding:     "16px 20px",
              minWidth:    160,
              flex:        1,
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 6 }}>
                SOURCE
              </div>
              <div style={{
                fontFamily:   S.fontMono,
                fontSize:     13,
                fontWeight:   700,
                color:        marketData.isLive ? S.pass : S.amber,
                lineHeight:   1.2,
              }}>
                {sourceLabel}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4 }}>
                {marketData.isLive
                  ? `as of ${marketData.asOf.slice(0, 16).replace("T", " ")} UTC`
                  : "configure ALPHA_VANTAGE_API_KEY for live rates"}
              </div>
            </div>
          </div>
        ) : null}

        {/* ── TradingView Chart ── */}
        <div style={{
          background:  S.bgPanel,
          border:      `1px solid ${S.rim}`,
          borderTop:   `2px solid ${S.cyan}`,
          overflow:    "hidden",
        }}>
          <div style={{
            padding:        "8px 16px",
            borderBottom:   `1px solid ${S.soft}`,
            background:     S.bgSub,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.08em", color: S.tertiary }}>
              {selectedPair.label} — TRADINGVIEW CHART
            </span>
            <Badge text="LIVE" color={S.cyan} />
          </div>
          <div style={{ height: 420, width: "100%" }} key={selectedPair.tvSymbol}>
            <TradingViewEmbed symbol={selectedPair.tvSymbol} />
          </div>
        </div>

        {/* ── 2-column: Forward curve + Cross rates ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* ── Forward curve table ── */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}` }}>
            <div style={{
              padding:      "10px 16px",
              borderBottom: `1px solid ${S.rim}`,
              background:   S.bgSub,
              display:      "flex",
              alignItems:   "center",
              justifyContent: "space-between",
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.08em", color: S.tertiary }}>
                {selectedPair.label} FORWARD CURVE
              </span>
              {marketData && (
                <Badge
                  text={marketData.isLive ? "LIVE CARRY" : "EST. CARRY"}
                  color={marketData.isLive ? S.pass : S.amber}
                />
              )}
            </div>

            {loading ? (
              <div style={{ padding: "24px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, textAlign: "center" }}>
                LOADING FORWARD CURVE…
              </div>
            ) : forwardBuckets.length === 0 ? (
              <div style={{ padding: "24px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, textAlign: "center" }}>
                {error ? "UNAVAILABLE" : "NO FORWARD DATA"}
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.soft}` }}>
                    {["BUCKET", "FWD PTS", "ALL-IN RATE", "ANN. BASIS"].map(h => (
                      <th key={h} style={{
                        padding:      "7px 14px",
                        textAlign:    "left",
                        fontFamily:   S.fontMono,
                        fontSize:     9,
                        letterSpacing:"0.07em",
                        color:        S.tertiary,
                        fontWeight:   600,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {forwardBuckets.map(([month, pts], i) => {
                    const allin    = marketData!.spot + pts;
                    const monthsOut = i + 1;
                    const annlzd   = ((pts / marketData!.spot) / (monthsOut / 12) * 100).toFixed(2);
                    return (
                      <tr key={month} style={{
                        borderBottom: `1px solid ${S.soft}`,
                        background:   i % 2 === 0
                          ? "transparent"
                          : `color-mix(in srgb, ${S.rim} 12%, transparent)`,
                      }}>
                        <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.cyan }}>
                          {fmtMonth(month)}
                        </td>
                        <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.pass }}>
                          +{pts.toFixed(4)}
                        </td>
                        <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary }}>
                          {allin.toFixed(spotDecimals)}
                        </td>
                        <td style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                          {annlzd}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Right column: cross rates + sandbox CTA ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}` }}>
              <div style={{
                padding:      "10px 16px",
                borderBottom: `1px solid ${S.rim}`,
                background:   S.bgSub,
                fontFamily:   S.fontMono,
                fontSize:     10,
                letterSpacing:"0.08em",
                color:        S.tertiary,
              }}>
                CROSS RATES vs MXN
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.soft}` }}>
                    {["PAIR", "SPOT", "STATUS"].map(h => (
                      <th key={h} style={{
                        padding:      "7px 14px",
                        textAlign:    "left",
                        fontFamily:   S.fontMono,
                        fontSize:     9,
                        letterSpacing:"0.07em",
                        color:        S.tertiary,
                        fontWeight:   600,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PAIRS.map((row, i) => {
                    const isActiveRow = i === activePairIdx;
                    const hasSpot     = isActiveRow && marketData !== null;
                    return (
                      <tr
                        key={row.label}
                        onClick={() => setActivePairIdx(i)}
                        style={{
                          borderBottom: `1px solid ${S.soft}`,
                          background:   isActiveRow
                            ? "color-mix(in srgb, var(--accent-cyan) 8%, transparent)"
                            : i % 2 === 0
                              ? "transparent"
                              : `color-mix(in srgb, ${S.rim} 12%, transparent)`,
                          cursor: "pointer",
                        }}
                      >
                        <td style={{
                          padding:    "7px 14px",
                          fontFamily: S.fontMono,
                          fontSize:   11,
                          fontWeight: 700,
                          color:      isActiveRow ? S.cyan : S.primary,
                        }}>
                          {row.label}
                        </td>
                        <td style={{
                          padding:    "7px 14px",
                          fontFamily: S.fontMono,
                          fontSize:   11,
                          color:      hasSpot ? S.primary : S.tertiary,
                        }}>
                          {hasSpot
                            ? marketData!.spot.toFixed(row.label.includes("JPY") ? 3 : 4)
                            : "—"}
                        </td>
                        <td style={{
                          padding:    "7px 14px",
                          fontFamily: S.fontMono,
                          fontSize:   10,
                          color:      isActiveRow
                            ? (loading ? S.amber : (marketData?.isLive ? S.pass : S.amber))
                            : S.tertiary,
                        }}>
                          {isActiveRow
                            ? (loading
                                ? "FETCHING…"
                                : (marketData
                                    ? (marketData.isLive ? "LIVE" : "INDICATIVE")
                                    : "ERROR"))
                            : "select to load"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Sandbox CTA */}
            <div style={{
              background:     S.bgPanel,
              border:         `1px solid ${S.rim}`,
              borderLeft:     `3px solid ${S.cyan}`,
              padding:        "14px 18px",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              gap:            16,
            }}>
              <div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.primary, marginBottom: 3 }}>
                  Stress-Test Your Portfolio
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
                  Simulate P&L impact of custom shocks and scenario analysis.
                </div>
              </div>
              <Link href="/sandbox" style={{
                fontFamily:    S.fontMono,
                fontSize:      11,
                fontWeight:    700,
                letterSpacing: "0.07em",
                color:         S.bgPanel,
                background:    S.cyan,
                padding:       "7px 16px",
                borderRadius:  2,
                textDecoration:"none",
                whiteSpace:    "nowrap",
                flexShrink:    0,
              }}>
                OPEN SANDBOX →
              </Link>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          height:         32,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontFamily:     S.fontMono,
          fontSize:       10,
          color:          S.tertiary,
        }}>
          <span suppressHydrationWarning>{renderTs}</span>
          <span style={{ margin: "0 8px", color: S.soft }}>·</span>
          {marketData
            ? (marketData.isLive
                ? "Live rates from Alpha Vantage · "
                : "Indicative fallback rates · configure ALPHA_VANTAGE_API_KEY for live data · ")
            : "Awaiting market data · "}
          Banxico official fix · T+2 settlement ·{" "}
          <Link href="/hedgewiki" style={{ color: S.cyan, textDecoration: "none", marginLeft: 4 }}>
            See HedgeWiki for NDF mechanics →
          </Link>
        </div>

      </div>
    </div>
  );
}
