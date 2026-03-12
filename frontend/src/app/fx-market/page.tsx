"use client";

/**
 * fx-market/page.tsx — ORDR Terminal | FX Rates
 *
 * Institutional FX rates page with:
 *   - Left panel (320px): major pairs table with live Finnhub quotes
 *   - Right panel: TradingView chart + selected pair info stats
 *   - Header: brand, title, live badge, UTC clock
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Activity, BarChart3 } from "lucide-react"
import { useAuth } from "@/lib/authContext";
import TradingViewEmbed from "@/components/execution/TradingViewEmbed";

import { PageShell } from "@/components/layout/PageShell";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
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
  green:     "var(--status-pass,#34d399)",
  red:       "var(--accent-red,#f87171)",
} as const;

// ---------------------------------------------------------------------------
// Pair definitions
// ---------------------------------------------------------------------------
interface FxPair {
  label:   string;
  finnhub: string;
  tv:      string;
  base:    string;
  quote:   string;
}

const MAJOR_PAIRS: FxPair[] = [
  { label: "EUR/USD", finnhub: "OANDA:EUR_USD", tv: "FX:EURUSD", base: "EUR", quote: "USD" },
  { label: "GBP/USD", finnhub: "OANDA:GBP_USD", tv: "FX:GBPUSD", base: "GBP", quote: "USD" },
  { label: "USD/JPY", finnhub: "OANDA:USD_JPY", tv: "FX:USDJPY", base: "USD", quote: "JPY" },
  { label: "USD/CHF", finnhub: "OANDA:USD_CHF", tv: "FX:USDCHF", base: "USD", quote: "CHF" },
  { label: "AUD/USD", finnhub: "OANDA:AUD_USD", tv: "FX:AUDUSD", base: "AUD", quote: "USD" },
  { label: "USD/CAD", finnhub: "OANDA:USD_CAD", tv: "FX:USDCAD", base: "USD", quote: "CAD" },
  { label: "NZD/USD", finnhub: "OANDA:NZD_USD", tv: "FX:NZDUSD", base: "NZD", quote: "USD" },
  { label: "USD/MXN", finnhub: "OANDA:USD_MXN", tv: "FX:USDMXN", base: "USD", quote: "MXN" },
  { label: "USD/BRL", finnhub: "OANDA:USD_BRL", tv: "FX:USDBRL", base: "USD", quote: "BRL" },
  { label: "EUR/GBP", finnhub: "OANDA:EUR_GBP", tv: "FX:EURGBP", base: "EUR", quote: "GBP" },
  { label: "EUR/JPY", finnhub: "OANDA:EUR_JPY", tv: "FX:EURJPY", base: "EUR", quote: "JPY" },
];

// ---------------------------------------------------------------------------
// Finnhub quote shape
// ---------------------------------------------------------------------------
interface FinnhubQuote {
  c:  number; // current
  h:  number; // high
  l:  number; // low
  o:  number; // open
  pc: number; // previous close
  t:  number; // timestamp (unix)
}

type QuoteMap = Record<string, FinnhubQuote | null>;

// Finnhub calls are proxied through /api/market/finnhub — key stays server-side

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function formatPrice(val: number | undefined | null, decimals = 4): string {
  if (val === undefined || val === null || val === 0) return "--";
  return val.toFixed(decimals);
}

function priceDecimals(pair: FxPair): number {
  // JPY pairs are quoted to 2-3 dp; others to 4-5
  if (pair.quote === "JPY") return 3;
  if (pair.quote === "MXN" || pair.quote === "BRL") return 4;
  return 4;
}

function changePct(c: number, pc: number): number {
  if (!pc) return 0;
  return ((c - pc) / pc) * 100;
}

// Currency code → simple 2-letter badge (no emoji dependency)
function currencyBadge(code: string): string {
  return code.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// UTC clock hook
// ---------------------------------------------------------------------------
function useUtcClock(): string {
  const [time, setTime] = useState<string>(() => new Date().toUTCString().slice(17, 25));

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, "0");
      const mm = String(now.getUTCMinutes()).padStart(2, "0");
      const ss = String(now.getUTCSeconds()).padStart(2, "0");
      setTime(`${hh}:${mm}:${ss}`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------
async function fetchAllQuotes(): Promise<QuoteMap> {
  const results = await Promise.allSettled(
    MAJOR_PAIRS.map(async (pair) => {
      const url = `/api/market/finnhub?symbol=${encodeURIComponent(pair.finnhub)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as FinnhubQuote;
      return { key: pair.finnhub, data };
    })
  );

  const map: QuoteMap = {};
  MAJOR_PAIRS.forEach((p) => { map[p.finnhub] = null; });

  results.forEach((r) => {
    if (r.status === "fulfilled") {
      map[r.value.key] = r.value.data;
    }
  });

  return map;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Pair row in the left panel
interface PairRowProps {
  pair:       FxPair;
  quote:      FinnhubQuote | null;
  selected:   boolean;
  onSelect:   (pair: FxPair) => void;
}

function PairRow({ pair, quote, selected, onSelect }: PairRowProps) {
  const dp    = priceDecimals(pair);
  const price = quote ? formatPrice(quote.c, dp) : "--";
  const pct   = quote ? changePct(quote.c, quote.pc) : null;
  const pctStr = pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "--";
  const pctColor = pct === null ? S.tertiary : pct >= 0 ? S.green : S.red;

  return (
    <div
      onClick={() => onSelect(pair)}
      style={{
        display:         "flex",
        alignItems:      "center",
        gap:             12,
        padding:         "10px 14px",
        cursor:          "pointer",
        borderLeft:      selected ? `3px solid ${S.cyan}` : "3px solid transparent",
        background:      selected ? "rgba(0,212,255,0.06)" : "transparent",
        borderBottom:    `1px solid ${S.soft}`,
        transition:      "background 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* Badge */}
      <div style={{
        width:          32,
        height:         22,
        background:     selected ? S.cyan : "rgba(255,255,255,0.08)",
        borderRadius:   3,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontFamily:     S.fontMono,
        fontSize: 12,
        fontWeight:     700,
        color:          selected ? "#000" : S.secondary,
        flexShrink:     0,
        letterSpacing:  "0.03em",
      }}>
        {currencyBadge(pair.base)}
      </div>

      {/* Label */}
      <span style={{
        fontFamily: S.fontMono,
        fontSize:   13,
        fontWeight: selected ? 700 : 500,
        color:      selected ? S.cyan : S.primary,
        flex:       1,
        letterSpacing: "0.04em",
      }}>
        {pair.label}
      </span>

      {/* Price + change */}
      <div style={{ textAlign: "right", minWidth: 90 }}>
        <div style={{
          fontFamily: S.fontMono,
          fontSize:   13,
          fontWeight: 700,
          color:      S.primary,
        }}>
          {price}
        </div>
        <div style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          color:      pctColor,
          marginTop:  1,
        }}>
          {pctStr}
        </div>
      </div>
    </div>
  );
}

// Info stat tile
function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex:        1,
      minWidth:    0,
      padding:     "12px 14px",
      borderRight: `1px solid var(--border-soft)`,
    }}>
      <div style={{
        fontFamily:    S.fontMono,
        fontSize: 12,
        color:         S.tertiary,
        letterSpacing: "0.1em",
        marginBottom:  4,
        textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: S.fontMono,
        fontSize:   15,
        fontWeight: 700,
        color:      color ?? S.primary,
      }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function FxMarketPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const utcTime = useUtcClock();

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [quotes, setQuotes]               = useState<QuoteMap>({});
  const [fetching, setFetching]           = useState<boolean>(false);
  const [lastFetch, setLastFetch]         = useState<Date | null>(null);

  // Redirect if unauthenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/auth/login");
    }
  }, [isLoading, user, router]);

  // Fetch quotes
  const doFetch = useCallback(async () => {
    setFetching(true);
    try {
      const map = await fetchAllQuotes();
      setQuotes(map);
      setLastFetch(new Date());
    } finally {
      setFetching(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    doFetch();
  }, [doFetch]);

  if (isLoading || !user) {
    return (
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        height:         "100vh",
        background:     S.bgDeep,
        fontFamily:     S.fontMono,
        color:          S.tertiary,
        fontSize:       13,
      }}>
        AUTHENTICATING...
      </div>
    );
  }

  const selectedPair  = MAJOR_PAIRS[selectedIndex];
  const selectedQuote = quotes[selectedPair.finnhub] ?? null;
  const dp            = priceDecimals(selectedPair);

  // Info panel values
  const infoC  = selectedQuote ? formatPrice(selectedQuote.c,  dp) : "--";
  const infoO  = selectedQuote ? formatPrice(selectedQuote.o,  dp) : "--";
  const infoPc = selectedQuote ? formatPrice(selectedQuote.pc, dp) : "--";
  const infoH  = selectedQuote ? formatPrice(selectedQuote.h,  dp) : "--";
  const infoL  = selectedQuote ? formatPrice(selectedQuote.l,  dp) : "--";

  let changeStr   = "--";
  let changeColor: string = S.tertiary;
  if (selectedQuote && selectedQuote.pc) {
    const abs = selectedQuote.c - selectedQuote.pc;
    const pct = changePct(selectedQuote.c, selectedQuote.pc);
    const sign = abs >= 0 ? "+" : "";
    changeStr   = `${sign}${abs.toFixed(dp)} (${sign}${pct.toFixed(2)}%)`;
    changeColor = abs >= 0 ? S.green : S.red;
  }

  const lastFetchLabel = lastFetch
    ? lastFetch.toUTCString().slice(17, 25) + " UTC"
    : null;

  return (
    <PageShell
      icon={BarChart3}
      title="FX Rates"
      breadcrumb={["Dashboard", "FX Rates"]}
      noPadding
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 3, background: "rgba(52,211,153,0.1)", border: `1px solid rgba(52,211,153,0.3)` }}>
            <Activity size={10} color={S.green} />
            <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.green, letterSpacing: "0.1em" }}>LIVE</span>
          </div>
          <div style={{ padding: "3px 8px", borderRadius: 3, background: "rgba(0,212,255,0.08)", border: `1px solid rgba(0,212,255,0.25)`, fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, color: S.cyan, letterSpacing: "0.08em" }}>
            FINNHUB
          </div>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, letterSpacing: "0.06em" }}>{selectedPair.label}</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600, color: S.secondary }}>{utcTime} <span style={{ color: S.tertiary, fontSize: 11 }}>UTC</span></span>
        </div>
      }
    >

      <div style={{
        display:  "flex",
        flex:     1,
        overflow: "hidden",
        height:   "calc(100vh - 56px)",
        fontFamily: S.fontUI,
      }}>
        {/* ---------------------------------------------------------------- */}
        {/* LEFT PANEL — pairs table                                           */}
        {/* ---------------------------------------------------------------- */}
        <div style={{
          width:        320,
          flexShrink:   0,
          display:      "flex",
          flexDirection:"column",
          borderRight:  `1px solid ${S.rim}`,
          background:   S.bgPanel,
        }}>
          {/* Panel header */}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            padding:      "10px 14px",
            borderBottom: `1px solid ${S.rim}`,
            flexShrink:   0,
          }}>
            <span style={{
              fontFamily:    S.fontMono,
              fontSize: 12,
              fontWeight:    700,
              color:         S.secondary,
              letterSpacing: "0.1em",
              flex:          1,
            }}>
              MAJOR PAIRS
            </span>

            {lastFetchLabel && (
              <span style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color:      S.tertiary,
                marginRight: 10,
              }}>
                {lastFetchLabel}
              </span>
            )}

            <button
              onClick={doFetch}
              disabled={fetching}
              title="Refresh quotes"
              style={{
                background: "transparent",
                border:     `1px solid ${S.soft}`,
                borderRadius: 4,
                padding:    "4px 6px",
                cursor:     fetching ? "not-allowed" : "pointer",
                display:    "flex",
                alignItems: "center",
                color:      fetching ? S.tertiary : S.secondary,
                transition: "color 0.15s",
              }}
            >
              <RefreshCw
                size={12}
                style={{
                  animation: fetching ? "spin 1s linear infinite" : "none",
                }}
              />
            </button>
          </div>

          {/* Pairs list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {MAJOR_PAIRS.map((pair, idx) => (
              <PairRow
                key={pair.finnhub}
                pair={pair}
                quote={quotes[pair.finnhub] ?? null}
                selected={idx === selectedIndex}
                onSelect={() => setSelectedIndex(idx)}
              />
            ))}
          </div>

          {/* Footer note */}
          <div style={{
            padding:      "8px 14px",
            borderTop:    `1px solid ${S.soft}`,
            flexShrink:   0,
          }}>
            <span style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              color:      S.tertiary,
            }}>
              Prices via Finnhub · OANDA feed
            </span>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT PANEL — chart + info                                         */}
        {/* ---------------------------------------------------------------- */}
        <div style={{
          flex:         1,
          display:      "flex",
          flexDirection:"column",
          overflow:     "hidden",
          minWidth:     0,
        }}>
          {/* TradingView chart — 70% of remaining height */}
          <div
            key={selectedPair.tv}
            style={{
              flex:       "0 0 70%",
              minHeight:  0,
              overflow:   "hidden",
              borderBottom: `1px solid ${S.rim}`,
            }}
          >
            <div style={{ width: "100%", height: "100%", minHeight: 420 }}>
              <TradingViewEmbed symbol={selectedPair.tv} />
            </div>
          </div>

          {/* Info panel — bottom 30% */}
          <div style={{
            flex:       "0 0 30%",
            minHeight:  0,
            display:    "flex",
            flexDirection: "column",
            background: S.bgPanel,
            overflow:   "hidden",
          }}>
            {/* Info header */}
            <div style={{
              padding:      "10px 16px",
              borderBottom: `1px solid ${S.soft}`,
              display:      "flex",
              alignItems:   "center",
              gap:          12,
              flexShrink:   0,
            }}>
              <span style={{
                fontFamily:    S.fontMono,
                fontSize: 12,
                fontWeight:    700,
                color:         S.secondary,
                letterSpacing: "0.1em",
              }}>
                {selectedPair.label}
              </span>
              <span style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color:      S.tertiary,
              }}>
                {selectedPair.base} / {selectedPair.quote}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{
                fontFamily:    S.fontMono,
                fontSize: 12,
                color:         S.tertiary,
                letterSpacing: "0.06em",
              }}>
                SNAPSHOT
              </span>
            </div>

            {/* Stats grid */}
            <div style={{
              display:   "flex",
              flex:      1,
              minHeight: 0,
            }}>
              <StatTile label="CURRENT"    value={infoC} />
              <StatTile label="OPEN"       value={infoO} />
              <StatTile label="PREV CLOSE" value={infoPc} />
              <StatTile label="HIGH"       value={infoH} />
              <StatTile label="LOW"        value={infoL} />
              <div style={{
                flex:        1,
                minWidth:    0,
                padding:     "12px 14px",
              }}>
                <div style={{
                  fontFamily:    S.fontMono,
                  fontSize: 12,
                  color:         S.tertiary,
                  letterSpacing: "0.1em",
                  marginBottom:  4,
                  textTransform: "uppercase",
                }}>
                  CHANGE
                </div>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize:   13,
                  fontWeight: 700,
                  color:      changeColor,
                }}>
                  {changeStr}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframe for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

    </PageShell>
  );
}
