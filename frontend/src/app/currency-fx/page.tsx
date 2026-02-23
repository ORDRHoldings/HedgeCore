"use client";

/**
 * currency-fx/page.tsx — FX Rates & Forward Curve
 *
 * Position-aware currency selector: auto-detects currencies from the user's loaded
 * hedge plan (via HedgeContext). Falls back to USD/MXN if no plan is loaded.
 * Full CME 27-currency list available via "+ Add Pair" dropdown.
 * All market data fetched live from /api/market-autofill.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import { useHedge } from "../../lib/hedgeContext";
import { deriveCurrencyContext } from "../../utils/currencyContext";
import { getCurrencySpec, getTradingViewSymbol } from "../../utils/currencySymbolMap";
import { FUTURES_CURRENCY_LIST } from "../../api/types";
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
  label:        string;  // "USD/MXN"
  base:         string;  // "USD"
  quote:        string;  // "MXN"
  tvSymbol:     string;  // "FX:USDMXN"
  apiCurrency:  string;  // currency to pass to market-autofill
  fromPosition: boolean; // true = detected from user's loaded positions
}

/** Build a PairDef for a given base currency (quoted vs USD) */
function buildPairDef(ccy: string, fromPosition: boolean): PairDef {
  const PRICE_CCY = new Set(['EUR', 'GBP', 'AUD', 'NZD', 'CHF']);
  const isPriceCcy = PRICE_CCY.has(ccy);
  const [base, quote] = isPriceCcy ? [ccy, 'USD'] : ['USD', ccy];
  const label = `${base}/${quote}`;
  const tvSymbol = getTradingViewSymbol(ccy);
  return { label, base, quote, tvSymbol, apiCurrency: ccy, fromPosition };
}

/** Default pairs when no plan is loaded */
const DEFAULT_PAIRS: PairDef[] = [
  buildPairDef('MXN', false),
  buildPairDef('EUR', false),
  buildPairDef('GBP', false),
  buildPairDef('JPY', false),
  buildPairDef('BRL', false),
  buildPairDef('CAD', false),
];

// ── Market data shape ─────────────────────────────────────────────────────────
interface MarketData {
  spot:          number;
  forwardPoints: Record<string, number>;
  isLive:        boolean;
  source:        string;
  asOf:          string;
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
  const router                              = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { lastInputs }                      = useHedge();

  // ── Build dynamic pair list from positions (memoized to stable reference) ──
  const positionPairs = useMemo<PairDef[]>(() => {
    if (!lastInputs?.trades?.length) return [];
    const ctx = deriveCurrencyContext(lastInputs.trades, lastInputs.market);
    const seen = new Set<string>();
    const result: PairDef[] = [];
    for (const ccy of ctx.allCurrencies) {
      if (!seen.has(ccy) && ccy !== 'USD') {
        seen.add(ccy);
        result.push(buildPairDef(ccy, true));
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInputs]);

  const [pairs,         setPairs]         = useState<PairDef[]>(() =>
    positionPairs.length > 0 ? positionPairs : DEFAULT_PAIRS
  );
  const [activePairIdx, setActivePairIdx] = useState(0);
  const [marketData,    setMarketData]    = useState<MarketData | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [renderTs,      setRenderTs]      = useState("");
  const [showAddPair,   setShowAddPair]   = useState(false);
  const addPairRef                        = useRef<HTMLDivElement>(null);
  // Track whether we've done the initial pairs injection so we only do it once
  const didInitPairs                      = useRef(false);

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

  // When position pairs become available (plan loaded), merge them into the
  // current pair list (prepend any not already present). Only runs once per
  // unique positionPairs reference so it never fires on unrelated re-renders.
  useEffect(() => {
    if (positionPairs.length === 0) return;
    if (didInitPairs.current) return;
    didInitPairs.current = true;
    setPairs(prev => {
      // Keep manually added pairs; prepend position pairs that aren't present
      const existingCodes = new Set(prev.map(p => p.apiCurrency));
      const newOnes = positionPairs.filter(p => !existingCodes.has(p.apiCurrency));
      if (newOnes.length === 0) return prev; // nothing to add
      return [...newOnes, ...prev];
    });
    setActivePairIdx(0);
  }, [positionPairs]);

  // Close add-pair dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addPairRef.current && !addPairRef.current.contains(e.target as Node)) {
        setShowAddPair(false);
      }
    }
    if (showAddPair) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAddPair]);

  // ── Market data fetch ──────────────────────────────────────────────────────
  const fetchMarket = useCallback(async (pairIdx: number, pairsArr: PairDef[]) => {
    const pair = pairsArr[pairIdx];
    if (!pair) return;
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
      fetchMarket(activePairIdx, pairs);
    }
  }, [activePairIdx, pairs, authLoading, isAuthenticated, fetchMarket]);

  // ── Add a new pair from CME list ───────────────────────────────────────────
  const handleAddPair = useCallback((ccy: string) => {
    // Mark as initialized so position-pair injection never fires after a manual add
    didInitPairs.current = true;
    setPairs(prev => {
      const alreadyAdded = prev.some(p => p.apiCurrency === ccy);
      if (alreadyAdded) {
        // Switch to the existing pair; don't mutate
        const idx = prev.findIndex(p => p.apiCurrency === ccy);
        setActivePairIdx(idx);
        return prev;
      }
      const newPair = buildPairDef(ccy, false);
      const nextPairs = [...prev, newPair];
      setActivePairIdx(nextPairs.length - 1);
      return nextPairs;
    });
    setShowAddPair(false);
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const selectedPair = pairs[activePairIdx] ?? pairs[0];

  const next12Months = getNextNMonths(12);
  const forwardBuckets: [string, number][] = (() => {
    if (!marketData?.forwardPoints) return [];
    const fp = marketData.forwardPoints;
    return next12Months
      .filter(m => fp[m] !== undefined)
      .map(m => [m, fp[m]] as [string, number]);
  })();

  const ndfBasis12M: number | null = (() => {
    if (forwardBuckets.length === 0) return null;
    return forwardBuckets[forwardBuckets.length - 1][1];
  })();

  const sourceLabel = marketData
    ? (marketData.source === "alpha_vantage_live" ? "Alpha Vantage LIVE" : "Indicative / Fallback")
    : "—";

  const spotDecimals = (selectedPair?.label?.includes("JPY") || selectedPair?.label?.includes("KRW") || selectedPair?.label?.includes("HUF")) ? 2 : 4;

  // CME currencies not yet in pairs list (for "Add Pair" dropdown)
  const addablePairs = FUTURES_CURRENCY_LIST.filter(fc => !pairs.some(p => p.apiCurrency === fc.code));

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
            {selectedPair?.label ?? "—"}
          </span>
          {positionPairs.length > 0 && (
            <>
              <span style={{ color: S.soft }}>·</span>
              <Badge text="POSITIONS LOADED" color={S.cyan} />
            </>
          )}
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
        display:      "flex",
        alignItems:   "stretch",
        gap:          0,
        borderBottom: `1px solid ${S.rim}`,
        background:   S.bgSub,
        paddingLeft:  12,
        overflowX:    "auto",
        flexShrink:   0,
        minHeight:    36,
      }}>
        {pairs.map((p, i) => {
          const isActive = i === activePairIdx;
          return (
            <button
              key={`${p.label}-${i}`}
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
                padding:      "0 14px",
                cursor:       "pointer",
                transition:   "color 120ms",
                display:      "flex",
                alignItems:   "center",
                gap:          6,
                whiteSpace:   "nowrap",
                flexShrink:   0,
              }}
            >
              {p.label}
              {p.fromPosition && (
                <span style={{
                  fontSize:      8,
                  fontFamily:    S.fontMono,
                  color:         S.cyan,
                  background:    `color-mix(in srgb, ${S.cyan} 12%, transparent)`,
                  border:        `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`,
                  padding:       "0 4px",
                  borderRadius:  2,
                  letterSpacing: "0.05em",
                  fontWeight:    700,
                }}>
                  POS
                </span>
              )}
            </button>
          );
        })}

        {/* ── Add Pair button + dropdown ── */}
        <div ref={addPairRef} style={{ position: "relative", display: "flex", alignItems: "center", padding: "0 8px" }}>
          <button
            onClick={() => setShowAddPair(v => !v)}
            style={{
              fontFamily:   S.fontMono,
              fontSize:     11,
              fontWeight:   600,
              color:        showAddPair ? S.cyan : S.tertiary,
              background:   "transparent",
              border:       `1px solid ${showAddPair ? S.cyan : S.rim}`,
              borderRadius: 2,
              padding:      "3px 10px",
              cursor:       "pointer",
              letterSpacing:"0.04em",
              display:      "flex",
              alignItems:   "center",
              gap:          4,
              flexShrink:   0,
            }}
          >
            ＋ ADD PAIR
          </button>
          {showAddPair && (
            <div style={{
              position:   "absolute",
              top:        "calc(100% + 4px)",
              left:       0,
              background: S.bgPanel,
              border:     `1px solid ${S.rim}`,
              borderRadius: 2,
              zIndex:     100,
              minWidth:   220,
              maxHeight:  320,
              overflowY:  "auto",
              boxShadow:  "0 4px 16px rgba(0,0,0,0.4)",
            }}>
              <div style={{
                padding:      "6px 12px",
                fontFamily:   S.fontMono,
                fontSize:     9,
                letterSpacing:"0.08em",
                color:        S.tertiary,
                borderBottom: `1px solid ${S.soft}`,
                background:   S.bgSub,
              }}>
                CME-LISTED CURRENCIES
              </div>
              {addablePairs.length === 0 ? (
                <div style={{ padding: "12px", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, textAlign: "center" }}>
                  All pairs added
                </div>
              ) : (
                addablePairs.map(fc => (
                  <button
                    key={fc.code}
                    onClick={() => handleAddPair(fc.code)}
                    style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:          8,
                      width:        "100%",
                      padding:      "7px 12px",
                      fontFamily:   S.fontMono,
                      fontSize:     11,
                      color:        S.primary,
                      background:   "transparent",
                      border:       "none",
                      borderBottom: `1px solid ${S.soft}`,
                      cursor:       "pointer",
                      textAlign:    "left",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = `color-mix(in srgb, ${S.cyan} 6%, transparent)`)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontWeight: 700, minWidth: 36 }}>{fc.code}</span>
                    <span style={{ color: S.tertiary, fontSize: 10, flex: 1 }}>{fc.name}</span>
                    <span style={{ color: S.tertiary, fontSize: 9, letterSpacing: "0.06em" }}>{fc.exchange}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />
        {error && (
          <div style={{
            display:    "flex",
            alignItems: "center",
            paddingRight: 16,
            fontFamily: S.fontMono,
            fontSize:   10,
            color:      S.fail,
            flexShrink: 0,
          }}>
            FETCH ERROR — {error}
          </div>
        )}
      </div>

      {/* ── Position context banner ── */}
      {positionPairs.length > 0 && lastInputs && (
        <div style={{
          padding:    "6px 24px",
          background: `color-mix(in srgb, ${S.cyan} 4%, transparent)`,
          borderBottom: `1px solid color-mix(in srgb, ${S.cyan} 15%, transparent)`,
          display:    "flex",
          alignItems: "center",
          gap:        10,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.cyan }}>
            POSITION CONTEXT
          </span>
          <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
            Showing currencies from your loaded hedge plan ·{" "}
            {positionPairs.map(p => p.apiCurrency).join(", ")} ·{" "}
            {lastInputs.trades.length} trade{lastInputs.trades.length !== 1 ? "s" : ""}
          </span>
          <Link href="/input" style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, textDecoration: "none", marginLeft: "auto" }}>
            ← Back to Position Desk
          </Link>
        </div>
      )}

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
              onClick={() => fetchMarket(activePairIdx, pairs)}
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
                SPOT RATE · {selectedPair?.label}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 26, fontWeight: 700, color: S.primary, lineHeight: 1 }}>
                {marketData.spot.toFixed(spotDecimals)}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4 }}>
                {marketData.isLive ? "live · " : "indicative · "}{selectedPair?.quote} per {selectedPair?.base}
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
                not available via this feed
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
                {selectedPair?.quote} forward points
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
              {selectedPair?.label} — TRADINGVIEW CHART
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {selectedPair?.fromPosition && <Badge text="POSITION" color={S.cyan} />}
              <Badge text="LIVE" color={S.cyan} />
            </div>
          </div>
          {selectedPair && (
            <div style={{ height: 420, width: "100%" }} key={selectedPair.tvSymbol}>
              <TradingViewEmbed symbol={selectedPair.tvSymbol} />
            </div>
          )}
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
                {selectedPair?.label} FORWARD CURVE
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
                LOADED PAIRS — RATE STATUS
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
                  {pairs.map((row, i) => {
                    const isActiveRow = i === activePairIdx;
                    const hasSpot     = isActiveRow && marketData !== null;
                    const isJpy       = row.label.includes("JPY") || row.label.includes("KRW") || row.label.includes("HUF");
                    return (
                      <tr
                        key={`${row.label}-${i}`}
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
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {row.label}
                            {row.fromPosition && (
                              <span style={{ fontSize: 8, color: S.cyan, fontWeight: 700 }}>POS</span>
                            )}
                          </span>
                        </td>
                        <td style={{
                          padding:    "7px 14px",
                          fontFamily: S.fontMono,
                          fontSize:   11,
                          color:      hasSpot ? S.primary : S.tertiary,
                        }}>
                          {hasSpot
                            ? marketData!.spot.toFixed(isJpy ? 2 : 4)
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

            {/* CME spec card for selected pair */}
            {selectedPair && (
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
                  {selectedPair.apiCurrency} · INSTRUMENT SPECS
                </div>
                <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {(() => {
                    const spec = getCurrencySpec(selectedPair.apiCurrency);
                    const rows = [
                      { label: "TV SPOT",       value: spec.tvSpotSymbol },
                      { label: "CME FUTURES",   value: spec.tvFuturesSymbol ?? "NDF" },
                      { label: "IBKR SYMBOL",   value: spec.ibkrSymbol ?? "—" },
                      { label: "CONTRACT SIZE", value: spec.contractSize ? `${spec.contractSize.toLocaleString()} ${selectedPair.apiCurrency}` : "—" },
                      { label: "MARGIN EST.",   value: spec.marginEstimate ? `$${spec.marginEstimate.toLocaleString()} USD` : "—" },
                      { label: "INSTRUMENT",    value: spec.isNdf ? "NDF (OTC)" : "Exchange-Listed Futures" },
                    ];
                    return rows.map(r => (
                      <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.07em", color: S.tertiary }}>{r.label}</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, fontWeight: 600 }}>{r.value}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
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
          flexWrap:       "wrap",
          gap:            4,
        }}>
          <span suppressHydrationWarning>{renderTs}</span>
          <span style={{ margin: "0 8px", color: S.soft }}>·</span>
          {marketData
            ? (marketData.isLive
                ? "Live rates from Alpha Vantage · "
                : "Indicative fallback rates · configure ALPHA_VANTAGE_API_KEY for live data · ")
            : "Awaiting market data · "}
          T+2 settlement ·{" "}
          <Link href="/hedgewiki" style={{ color: S.cyan, textDecoration: "none", marginLeft: 4 }}>
            See HedgeWiki for NDF mechanics →
          </Link>
        </div>

      </div>
    </div>
  );
}
