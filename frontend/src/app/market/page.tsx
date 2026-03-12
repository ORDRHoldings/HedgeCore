"use client";
/**
 * /market — ORDR Market (Free)
 *
 * Professional dark chart page with:
 *  - Header OHLC ticker showing current bar data
 *  - Inline symbol search with grouped dropdown
 *  - Full-width chart canvas (no sidebar)
 *  - No auth required
 */
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Bar } from "@/components/chart/indicators/types";
import { usePublicChartData } from "@/hooks/usePublicChartData";

const ChartEngine = dynamic(() => import("@/components/chart/ChartEngine"), {
  ssr: false,
});

const FM = "'IBM Plex Mono', monospace";
const FU = "'IBM Plex Sans', sans-serif";
const BG      = "#131722";
const BG_DEEP = "#0D1117";
const BG_PANEL= "#1A1E2E";
const BG_HOVER= "rgba(255,255,255,0.04)";
const BORDER  = "#2A2E39";
const TEXT    = "#D1D4DC";
const TEXT_DIM= "#545B69";
const GREEN   = "#26A69A";
const RED     = "#EF5350";
const BLUE    = "#4A90D9";

interface AssetItem { symbol: string; display: string; group: string; }

const ASSET_GROUPS: { label: string; items: AssetItem[] }[] = [
  { label: "FX Majors", items: [
    { symbol: "EURUSD", display: "EUR/USD", group: "FX Majors" },
    { symbol: "GBPUSD", display: "GBP/USD", group: "FX Majors" },
    { symbol: "USDJPY", display: "USD/JPY", group: "FX Majors" },
    { symbol: "USDCAD", display: "USD/CAD", group: "FX Majors" },
    { symbol: "AUDUSD", display: "AUD/USD", group: "FX Majors" },
    { symbol: "NZDUSD", display: "NZD/USD", group: "FX Majors" },
    { symbol: "USDCHF", display: "USD/CHF", group: "FX Majors" },
  ]},
  { label: "FX Crosses", items: [
    { symbol: "EURGBP", display: "EUR/GBP", group: "FX Crosses" },
    { symbol: "EURJPY", display: "EUR/JPY", group: "FX Crosses" },
    { symbol: "GBPJPY", display: "GBP/JPY", group: "FX Crosses" },
    { symbol: "AUDJPY", display: "AUD/JPY", group: "FX Crosses" },
    { symbol: "EURCHF", display: "EUR/CHF", group: "FX Crosses" },
    { symbol: "EURAUD", display: "EUR/AUD", group: "FX Crosses" },
    { symbol: "GBPAUD", display: "GBP/AUD", group: "FX Crosses" },
    { symbol: "GBPNZD", display: "GBP/NZD", group: "FX Crosses" },
    { symbol: "AUDNZD", display: "AUD/NZD", group: "FX Crosses" },
    { symbol: "CADJPY", display: "CAD/JPY", group: "FX Crosses" },
    { symbol: "CHFJPY", display: "CHF/JPY", group: "FX Crosses" },
    { symbol: "NZDJPY", display: "NZD/JPY", group: "FX Crosses" },
  ]},
  { label: "FX EM", items: [
    { symbol: "USDMXN", display: "USD/MXN", group: "FX EM" },
    { symbol: "USDCNH", display: "USD/CNH", group: "FX EM" },
    { symbol: "USDZAR", display: "USD/ZAR", group: "FX EM" },
    { symbol: "USDTRY", display: "USD/TRY", group: "FX EM" },
    { symbol: "USDBRL", display: "USD/BRL", group: "FX EM" },
    { symbol: "USDINR", display: "USD/INR", group: "FX EM" },
    { symbol: "USDSGD", display: "USD/SGD", group: "FX EM" },
    { symbol: "USDHKD", display: "USD/HKD", group: "FX EM" },
    { symbol: "USDNOK", display: "USD/NOK", group: "FX EM" },
    { symbol: "USDSEK", display: "USD/SEK", group: "FX EM" },
    { symbol: "USDPLN", display: "USD/PLN", group: "FX EM" },
  ]},
  { label: "Commodities", items: [
    { symbol: "XAUUSD", display: "Gold", group: "Commodities" },
    { symbol: "XAGUSD", display: "Silver", group: "Commodities" },
    { symbol: "CRUDE_OIL", display: "Crude Oil", group: "Commodities" },
    { symbol: "NATURAL_GAS", display: "Nat Gas", group: "Commodities" },
    { symbol: "COPPER", display: "Copper", group: "Commodities" },
  ]},
  { label: "Indices", items: [
    { symbol: "SPX", display: "S&P 500", group: "Indices" },
    { symbol: "NDX", display: "NASDAQ 100", group: "Indices" },
    { symbol: "DJI", display: "Dow Jones", group: "Indices" },
    { symbol: "RUT", display: "Russell 2000", group: "Indices" },
    { symbol: "VIX", display: "VIX", group: "Indices" },
    { symbol: "FTSE", display: "FTSE 100", group: "Indices" },
    { symbol: "DAX", display: "DAX", group: "Indices" },
    { symbol: "N225", display: "Nikkei 225", group: "Indices" },
  ]},
  { label: "Crypto", items: [
    { symbol: "BTCUSD", display: "BTC/USD", group: "Crypto" },
    { symbol: "ETHUSD", display: "ETH/USD", group: "Crypto" },
    { symbol: "XRPUSD", display: "XRP/USD", group: "Crypto" },
    { symbol: "SOLUSD", display: "SOL/USD", group: "Crypto" },
    { symbol: "ADAUSD", display: "ADA/USD", group: "Crypto" },
  ]},
  { label: "US Equities", items: [
    { symbol: "AAPL", display: "AAPL", group: "US Equities" },
    { symbol: "MSFT", display: "MSFT", group: "US Equities" },
    { symbol: "AMZN", display: "AMZN", group: "US Equities" },
    { symbol: "TSLA", display: "TSLA", group: "US Equities" },
    { symbol: "GOOGL", display: "GOOGL", group: "US Equities" },
    { symbol: "META", display: "META", group: "US Equities" },
    { symbol: "NVDA", display: "NVDA", group: "US Equities" },
  ]},
];

const ALL_SYMBOLS: AssetItem[] = ASSET_GROUPS.flatMap((g) => g.items);

const TIMEFRAMES = [
  { label: "1m",  value: "1min"  },
  { label: "5m",  value: "5min"  },
  { label: "15m",  value: "15min"  },
  { label: "1H",  value: "1h"  },
  { label: "4H",  value: "4h"  },
  { label: "1D",  value: "1day"  },
  { label: "1W",  value: "1week"  },
];

function formatPrice(symbol: string, price: number): string {
  if (!price) return "\u2014";
  const s = symbol.toUpperCase();
  if (s.endsWith("JPY"))                                          return price.toFixed(3);
  if (s === "BTCUSD" || s === "ETHUSD")                          return price.toFixed(2);
  if (s.includes("XAU") || s.includes("XAG"))                   return price.toFixed(3);
  if (["SPX","NDX","DJI","RUT","FTSE","DAX","N225"].includes(s)) return price.toFixed(2);
  if (price > 1000)                                              return price.toFixed(2);
  return price.toFixed(5);
}

function formatChangePct(pct: number): string {
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

/* -- DropdownItem ---------------------------------------------------------- */

function DropdownItem({ item, onSelect, isActive }: {
  item: AssetItem; onSelect: (s: string) => void; isActive: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onMouseDown={() => onSelect(item.symbol)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "7px 12px",
        background: isActive ? "rgba(38,166,154,0.10)" : hovered ? BG_HOVER : "transparent",
        border: "none", cursor: "pointer", textAlign: "left",
      }}
    >
      <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 700,
        color: isActive ? GREEN : TEXT, minWidth: 68 }}>
        {item.display}
      </span>
      <span style={{ fontFamily: FM, fontSize: 10, color: TEXT_DIM }}>{item.group}</span>
    </button>
  );
}

/* -- SymbolSearch ---------------------------------------------------------- */

function SymbolSearch({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);
  const containerRef        = useRef<HTMLDivElement>(null);

  const currentDisplay = ALL_SYMBOLS.find((s) => s.symbol === value)?.display ?? value;

  const filtered = query.length > 0
    ? ALL_SYMBOLS.filter((s) =>
        s.symbol.includes(query.toUpperCase()) ||
        s.display.toUpperCase().includes(query.toUpperCase())
      ).slice(0, 10)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = useCallback((symbol: string) => {
    onChange(symbol); setOpen(false); setQuery("");
  }, [onChange]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 10); }}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "#1E222D",
          borderRadius: 6, padding: "4px 10px",
          border: "1px solid " + (open ? GREEN : BORDER),
          cursor: "pointer", minWidth: 120,
        }}
      >
        {open
          ? <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..." autoFocus
              style={{ fontFamily: FM, fontSize: 12, color: TEXT,
                background: "transparent", border: "none", outline: "none", width: 90 }} />
          : <span style={{ fontFamily: FM, fontSize: 13, fontWeight: 700,
              color: TEXT, letterSpacing: "0.02em" }}>
              {currentDisplay}
            </span>
        }
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={TEXT_DIM}
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 9999,
          background: BG_PANEL, border: "1px solid " + BORDER, borderRadius: 6,
          minWidth: 240, maxHeight: 320, overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}>
          {query.length === 0
            ? ASSET_GROUPS.map((group) => (
                <div key={group.label}>
                  <div style={{ padding: "6px 12px 3px", fontFamily: FM, fontSize: 9,
                    color: TEXT_DIM, letterSpacing: "0.12em", fontWeight: 700 }}>
                    {group.label.toUpperCase()}
                  </div>
                  {group.items.slice(0, 5).map((item) => (
                    <DropdownItem key={item.symbol} item={item}
                      onSelect={handleSelect} isActive={value === item.symbol} />
                  ))}
                </div>
              ))
            : filtered.length > 0
              ? filtered.map((item) => (
                  <DropdownItem key={item.symbol} item={item}
                    onSelect={handleSelect} isActive={value === item.symbol} />
                ))
              : <div style={{ padding: "12px 16px", fontFamily: FM, fontSize: 11, color: TEXT_DIM }}>
                  No results
                </div>
          }
        </div>
      )}
    </div>
  );
}

/* -- OHLCTicker ------------------------------------------------------------ */

function OHLCTicker({ bars, pair }: { bars: Bar[]; pair: string }) {
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  const prev = bars.length >= 2 ? bars[bars.length - 2] : null;
  const changePct = prev && prev.c !== 0 ? ((last.c - prev.c) / prev.c) * 100 : null;
  const isUp = changePct !== null && changePct >= 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: FM, fontSize: 11 }}>
      <span style={{ fontSize: 14, fontWeight: 700,
        color: changePct === null ? TEXT : isUp ? GREEN : RED }}>
        {formatPrice(pair, last.c)}
      </span>
      {changePct !== null && (
        <span style={{ fontSize: 11, fontWeight: 600,
          color: isUp ? GREEN : RED,
          background: isUp ? "rgba(38,166,154,0.12)" : "rgba(239,83,80,0.12)",
          padding: "2px 6px", borderRadius: 3 }}>
          {formatChangePct(changePct)}
        </span>
      )}
      <span style={{ color: TEXT_DIM }}>O <span style={{ color: TEXT }}>{formatPrice(pair, last.o)}</span></span>
      <span style={{ color: TEXT_DIM }}>H <span style={{ color: GREEN }}>{formatPrice(pair, last.h)}</span></span>
      <span style={{ color: TEXT_DIM }}>L <span style={{ color: RED   }}>{formatPrice(pair, last.l)}</span></span>
      <span style={{ color: TEXT_DIM }}>C <span style={{ color: TEXT  }}>{formatPrice(pair, last.c)}</span></span>
    </div>
  );
}

/* -- MarketPageInner ------------------------------------------------------- */

function MarketPageInner() {
  const [pair, setPair]             = useState("EURUSD");
  const [interval, setInterval]     = useState("1day");
  const { bars, loading, error, source, refetch } = usePublicChartData(pair, interval, 500);

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: BG_DEEP, overflow: "hidden", position: "fixed", inset: 0,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8,
        padding: "0 16px", background: BG, borderBottom: "1px solid " + BORDER,
        minHeight: 48, flexShrink: 0, zIndex: 10 }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 5, marginRight: 4 }}>
          <span style={{ fontFamily: FM, fontSize: 15, fontWeight: 700, color: TEXT, letterSpacing: "0.06em" }}>ORDR</span>
          <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 500, color: TEXT_DIM, letterSpacing: "0.04em" }}>MARKET</span>
        </Link>
        <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: GREEN,
          background: "rgba(38,166,154,0.15)", padding: "2px 6px", borderRadius: 3,
          letterSpacing: "0.10em" }}>FREE</span>
        <div style={{ width: 1, height: 24, background: BORDER, margin: "0 6px" }} />
        <SymbolSearch value={pair} onChange={setPair} />
        <div style={{ width: 1, height: 24, background: BORDER, margin: "0 6px" }} />
        <OHLCTicker bars={bars} pair={pair} />
        <div style={{ width: 1, height: 24, background: BORDER, margin: "0 6px" }} />
        <div style={{ display: "flex", gap: 2, background: "#1E222D", borderRadius: 6, padding: 2 }}>
          {TIMEFRAMES.map((tf) => (
            <button key={tf.value} onClick={() => setInterval(tf.value)} style={{
              fontFamily: FM, fontSize: 11, fontWeight: interval === tf.value ? 700 : 500,
              padding: "4px 9px", borderRadius: 4, border: "none",
              background: interval === tf.value ? "#2A2E39" : "transparent",
              color: interval === tf.value ? TEXT : TEXT_DIM,
              cursor: "pointer", transition: "all 0.12s" }}>
              {tf.label}
            </button>))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: FM, fontSize: 10, color: TEXT_DIM }}>{source}</span>
        <div style={{ width: 1, height: 24, background: BORDER, margin: "0 6px" }} />
        <button onClick={refetch} title="Refresh" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, background: "transparent",
          border: "1px solid " + BORDER, borderRadius: 4,
          color: TEXT_DIM, cursor: "pointer", fontSize: 14, fontFamily: FM,
        }}>{"\u21BB"}</button>
        <div style={{ width: 1, height: 24, background: BORDER, margin: "0 6px" }} />
        <Link href="/auth/login" style={{ fontFamily: FU, fontSize: 12, fontWeight: 600,
          color: BLUE, textDecoration: "none", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
          SIGN IN {"\u2192"}
        </Link>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {loading && !bars.length
          ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", fontFamily: FM, fontSize: 13, color: TEXT_DIM, background: "#131722" }}>
              Loading {pair}...
            </div>
          : error && !bars.length
            ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: "100%", gap: 8,
                fontFamily: FM, fontSize: 12, color: RED, background: "#131722" }}>
                <span>{error}</span>
                <button onClick={refetch} style={{ fontFamily: FM, fontSize: 11,
                  padding: "4px 12px", borderRadius: 4, border: "1px solid " + BORDER,
                  background: "#1E222D", color: TEXT, cursor: "pointer" }}>RETRY</button>
              </div>
            : <ChartEngine bars={bars} pair={pair} interval={interval}
                source={source} loading={loading} error={error} onPairChange={setPair} />
        }
      </div>
    </div>
  );
}

/* -- Export ---------------------------------------------------------------- */

export default function MarketPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: BG_DEEP, color: TEXT_DIM, fontFamily: FM, fontSize: 13 }}>
        Loading ORDR Market...
      </div>
    }>
      <MarketPageInner />
    </Suspense>
  );
}
