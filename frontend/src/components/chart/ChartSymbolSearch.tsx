"use client";
/**
 * ChartSymbolSearch.tsx — TradingView-style full-screen symbol search modal
 *
 * Full viewport overlay with fuzzy search, category tabs, arrow-key navigation,
 * recent symbols (localStorage), and match highlighting.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

interface Asset {
  symbol: string;
  display: string;
  category: "fx" | "crypto" | "indices" | "equities" | "commodities";
}

export interface ChartSymbolSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (symbol: string) => void;
  currentSymbol: string;
}

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const FONT_MONO = "'IBM Plex Mono', monospace";
const FONT_UI = "'IBM Plex Sans', sans-serif";
const RECENT_KEY = "ordr_recent_symbols";
const MAX_RECENT = 10;
const MAX_VISIBLE = 50;

type CategoryFilter = "all" | "fx" | "crypto" | "indices" | "equities" | "commodities";

const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "fx", label: "FX" },
  { key: "equities", label: "STOCKS" },
  { key: "crypto", label: "CRYPTO" },
  { key: "indices", label: "INDICES" },
  { key: "commodities", label: "COMMODITIES" },
];

const CATEGORY_COLORS: Record<string, string> = {
  fx: "#2962FF",
  equities: "#4CAF50",
  crypto: "#FF6D00",
  indices: "#26A69A",
  commodities: "#E91E63",
};

const ASSETS: Asset[] = [
  // FX Majors
  { symbol: "EURUSD", display: "Euro / US Dollar", category: "fx" },
  { symbol: "GBPUSD", display: "British Pound / US Dollar", category: "fx" },
  { symbol: "USDJPY", display: "US Dollar / Japanese Yen", category: "fx" },
  { symbol: "USDCAD", display: "US Dollar / Canadian Dollar", category: "fx" },
  { symbol: "AUDUSD", display: "Australian Dollar / US Dollar", category: "fx" },
  { symbol: "NZDUSD", display: "New Zealand Dollar / US Dollar", category: "fx" },
  { symbol: "USDCHF", display: "US Dollar / Swiss Franc", category: "fx" },
  // FX Crosses
  { symbol: "EURGBP", display: "Euro / British Pound", category: "fx" },
  { symbol: "EURJPY", display: "Euro / Japanese Yen", category: "fx" },
  { symbol: "GBPJPY", display: "British Pound / Japanese Yen", category: "fx" },
  { symbol: "AUDJPY", display: "Australian Dollar / Japanese Yen", category: "fx" },
  { symbol: "EURCHF", display: "Euro / Swiss Franc", category: "fx" },
  { symbol: "EURAUD", display: "Euro / Australian Dollar", category: "fx" },
  { symbol: "GBPAUD", display: "British Pound / Australian Dollar", category: "fx" },
  { symbol: "GBPNZD", display: "British Pound / New Zealand Dollar", category: "fx" },
  { symbol: "AUDNZD", display: "Australian Dollar / New Zealand Dollar", category: "fx" },
  { symbol: "CADJPY", display: "Canadian Dollar / Japanese Yen", category: "fx" },
  { symbol: "CHFJPY", display: "Swiss Franc / Japanese Yen", category: "fx" },
  { symbol: "NZDJPY", display: "New Zealand Dollar / Japanese Yen", category: "fx" },
  // FX EM
  { symbol: "USDMXN", display: "US Dollar / Mexican Peso", category: "fx" },
  { symbol: "USDCNH", display: "US Dollar / Chinese Yuan Offshore", category: "fx" },
  { symbol: "USDZAR", display: "US Dollar / South African Rand", category: "fx" },
  { symbol: "USDTRY", display: "US Dollar / Turkish Lira", category: "fx" },
  { symbol: "USDBRL", display: "US Dollar / Brazilian Real", category: "fx" },
  { symbol: "USDINR", display: "US Dollar / Indian Rupee", category: "fx" },
  { symbol: "USDSGD", display: "US Dollar / Singapore Dollar", category: "fx" },
  { symbol: "USDHKD", display: "US Dollar / Hong Kong Dollar", category: "fx" },
  { symbol: "USDNOK", display: "US Dollar / Norwegian Krone", category: "fx" },
  { symbol: "USDSEK", display: "US Dollar / Swedish Krona", category: "fx" },
  { symbol: "USDPLN", display: "US Dollar / Polish Zloty", category: "fx" },
  { symbol: "USDDKK", display: "US Dollar / Danish Krone", category: "fx" },
  { symbol: "USDCZK", display: "US Dollar / Czech Koruna", category: "fx" },
  { symbol: "USDHUF", display: "US Dollar / Hungarian Forint", category: "fx" },
  // Crypto
  { symbol: "BTCUSD", display: "Bitcoin / US Dollar", category: "crypto" },
  { symbol: "ETHUSD", display: "Ethereum / US Dollar", category: "crypto" },
  { symbol: "XRPUSD", display: "Ripple / US Dollar", category: "crypto" },
  { symbol: "SOLUSD", display: "Solana / US Dollar", category: "crypto" },
  { symbol: "ADAUSD", display: "Cardano / US Dollar", category: "crypto" },
  { symbol: "DOGEUSD", display: "Dogecoin / US Dollar", category: "crypto" },
  { symbol: "DOTUSD", display: "Polkadot / US Dollar", category: "crypto" },
  { symbol: "AVAXUSD", display: "Avalanche / US Dollar", category: "crypto" },
  { symbol: "MATICUSD", display: "Polygon / US Dollar", category: "crypto" },
  { symbol: "LINKUSD", display: "Chainlink / US Dollar", category: "crypto" },
  { symbol: "BNBUSD", display: "BNB / US Dollar", category: "crypto" },
  { symbol: "LTCUSD", display: "Litecoin / US Dollar", category: "crypto" },
  // Indices
  { symbol: "SPX", display: "S&P 500", category: "indices" },
  { symbol: "NDX", display: "NASDAQ 100", category: "indices" },
  { symbol: "DJI", display: "Dow Jones Industrial Average", category: "indices" },
  { symbol: "IXIC", display: "NASDAQ Composite", category: "indices" },
  { symbol: "RUT", display: "Russell 2000", category: "indices" },
  { symbol: "VIX", display: "CBOE Volatility Index", category: "indices" },
  { symbol: "FTSE", display: "FTSE 100", category: "indices" },
  { symbol: "DAX", display: "DAX 40", category: "indices" },
  { symbol: "CAC", display: "CAC 40", category: "indices" },
  { symbol: "N225", display: "Nikkei 225", category: "indices" },
  { symbol: "HSI", display: "Hang Seng Index", category: "indices" },
  { symbol: "STOXX50E", display: "Euro Stoxx 50", category: "indices" },
  // US Equities — Top 40
  { symbol: "SPY", display: "SPDR S&P 500 ETF", category: "equities" },
  { symbol: "QQQ", display: "Invesco QQQ Trust (NASDAQ)", category: "equities" },
  { symbol: "AAPL", display: "Apple Inc.", category: "equities" },
  { symbol: "MSFT", display: "Microsoft Corporation", category: "equities" },
  { symbol: "AMZN", display: "Amazon.com Inc.", category: "equities" },
  { symbol: "TSLA", display: "Tesla Inc.", category: "equities" },
  { symbol: "GOOGL", display: "Alphabet Inc. (Google)", category: "equities" },
  { symbol: "META", display: "Meta Platforms Inc.", category: "equities" },
  { symbol: "NVDA", display: "NVIDIA Corporation", category: "equities" },
  { symbol: "AMD", display: "Advanced Micro Devices", category: "equities" },
  { symbol: "NFLX", display: "Netflix Inc.", category: "equities" },
  { symbol: "DIS", display: "Walt Disney Co.", category: "equities" },
  { symbol: "BA", display: "Boeing Co.", category: "equities" },
  { symbol: "JPM", display: "JPMorgan Chase & Co.", category: "equities" },
  { symbol: "GS", display: "Goldman Sachs Group", category: "equities" },
  { symbol: "V", display: "Visa Inc.", category: "equities" },
  { symbol: "MA", display: "Mastercard Inc.", category: "equities" },
  { symbol: "JNJ", display: "Johnson & Johnson", category: "equities" },
  { symbol: "PFE", display: "Pfizer Inc.", category: "equities" },
  { symbol: "UNH", display: "UnitedHealth Group", category: "equities" },
  { symbol: "XOM", display: "Exxon Mobil Corp.", category: "equities" },
  { symbol: "CVX", display: "Chevron Corp.", category: "equities" },
  { symbol: "WMT", display: "Walmart Inc.", category: "equities" },
  { symbol: "HD", display: "Home Depot Inc.", category: "equities" },
  { symbol: "COST", display: "Costco Wholesale", category: "equities" },
  { symbol: "KO", display: "Coca-Cola Co.", category: "equities" },
  { symbol: "PEP", display: "PepsiCo Inc.", category: "equities" },
  { symbol: "MCD", display: "McDonald's Corp.", category: "equities" },
  { symbol: "NKE", display: "Nike Inc.", category: "equities" },
  { symbol: "INTC", display: "Intel Corp.", category: "equities" },
  { symbol: "CRM", display: "Salesforce Inc.", category: "equities" },
  { symbol: "ADBE", display: "Adobe Inc.", category: "equities" },
  { symbol: "PYPL", display: "PayPal Holdings", category: "equities" },
  { symbol: "SQ", display: "Block Inc. (Square)", category: "equities" },
  { symbol: "COIN", display: "Coinbase Global", category: "equities" },
  { symbol: "PLTR", display: "Palantir Technologies", category: "equities" },
  { symbol: "SOFI", display: "SoFi Technologies", category: "equities" },
  { symbol: "RIVN", display: "Rivian Automotive", category: "equities" },
  { symbol: "LCID", display: "Lucid Group Inc.", category: "equities" },
  // Commodities
  { symbol: "XAUUSD", display: "Gold / US Dollar", category: "commodities" },
  { symbol: "XAGUSD", display: "Silver / US Dollar", category: "commodities" },
  { symbol: "CRUDE_OIL", display: "Crude Oil (WTI)", category: "commodities" },
  { symbol: "NATURAL_GAS", display: "Natural Gas", category: "commodities" },
  { symbol: "COPPER", display: "Copper", category: "commodities" },
];

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(symbol: string): void {
  try {
    const prev = loadRecent().filter((s) => s !== symbol);
    const next = [symbol, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable
  }
}

/** Fuzzy match: returns array of character indices that match, or null if no match */
function fuzzyMatch(query: string, target: string): number[] | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      qi++;
    }
  }
  return qi === q.length ? indices : null;
}

/** Score a fuzzy match (lower = better). Prefers consecutive matches and earlier positions. */
function fuzzyScore(indices: number[]): number {
  if (indices.length === 0) return 0;
  let score = indices[0] * 10; // penalize late start
  for (let i = 1; i < indices.length; i++) {
    const gap = indices[i] - indices[i - 1] - 1;
    score += gap * 5; // penalize gaps
  }
  return score;
}

interface MatchResult {
  asset: Asset;
  symbolIndices: number[] | null;
  displayIndices: number[] | null;
  score: number;
}

function searchAssets(query: string, category: CategoryFilter): MatchResult[] {
  const filtered = category === "all" ? ASSETS : ASSETS.filter((a) => a.category === category);

  if (!query.trim()) {
    return filtered.slice(0, MAX_VISIBLE).map((asset) => ({
      asset,
      symbolIndices: null,
      displayIndices: null,
      score: 0,
    }));
  }

  const results: MatchResult[] = [];

  for (const asset of filtered) {
    const symMatch = fuzzyMatch(query, asset.symbol);
    const dispMatch = fuzzyMatch(query, asset.display);

    if (symMatch || dispMatch) {
      const symScore = symMatch ? fuzzyScore(symMatch) : 9999;
      const dispScore = dispMatch ? fuzzyScore(dispMatch) : 9999;
      results.push({
        asset,
        symbolIndices: symMatch,
        displayIndices: dispMatch,
        score: Math.min(symScore, dispScore),
      });
    }
  }

  results.sort((a, b) => a.score - b.score);
  return results.slice(0, MAX_VISIBLE);
}

/* ═══════════════════════════════════════════════════════
   Highlighted Text
   ═══════════════════════════════════════════════════════ */

function HighlightedText({
  text,
  indices,
  baseColor,
  highlightColor,
  fontWeight,
}: {
  text: string;
  indices: number[] | null;
  baseColor: string;
  highlightColor: string;
  fontWeight?: number;
}) {
  if (!indices || indices.length === 0) {
    return <span style={{ color: baseColor, fontWeight: fontWeight ?? 400 }}>{text}</span>;
  }

  const indexSet = new Set(indices);
  const segments: React.ReactNode[] = [];

  for (let i = 0; i < text.length; i++) {
    if (indexSet.has(i)) {
      segments.push(
        <span key={i} style={{ color: highlightColor, fontWeight: 700 }}>
          {text[i]}
        </span>
      );
    } else {
      segments.push(
        <span key={i} style={{ color: baseColor, fontWeight: fontWeight ?? 400 }}>
          {text[i]}
        </span>
      );
    }
  }

  return <>{segments}</>;
}

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

export default function ChartSymbolSearch({
  isOpen,
  onClose,
  onSelect,
  currentSymbol,
}: ChartSymbolSearchProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load recent on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setCategory("all");
      setHighlightIndex(0);
      setRecent(loadRecent());
      // Focus input after mount
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Search results
  const results = useMemo(() => searchAssets(query, category), [query, category]);

  // Recent assets (resolved to full asset objects)
  const recentAssets = useMemo(() => {
    if (query.trim()) return [];
    return recent
      .map((sym) => ASSETS.find((a) => a.symbol === sym))
      .filter((a): a is Asset => a !== undefined);
  }, [recent, query]);

  const showRecent = !query.trim() && recentAssets.length > 0;
  const totalItems = showRecent ? recentAssets.length + results.length : results.length;

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [query, category]);

  // Scroll highlighted row into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.children[highlightIndex] as HTMLElement | undefined;
    if (row) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const handleSelect = useCallback(
    (symbol: string) => {
      saveRecent(symbol);
      onSelect(symbol);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, totalItems - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (showRecent) {
          if (highlightIndex < recentAssets.length) {
            handleSelect(recentAssets[highlightIndex].symbol);
          } else {
            const idx = highlightIndex - recentAssets.length;
            if (results[idx]) handleSelect(results[idx].asset.symbol);
          }
        } else {
          if (results[highlightIndex]) handleSelect(results[highlightIndex].asset.symbol);
        }
        return;
      }
    },
    [onClose, totalItems, showRecent, recentAssets, results, highlightIndex, handleSelect]
  );

  if (!isOpen) return null;

  let rowCounter = 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          width: 480,
          maxHeight: 600,
          background: "#1E222D",
          borderRadius: 12,
          border: "1px solid #2A2E39",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Search Input ── */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #2A2E39",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#787B86" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: FONT_UI,
              fontSize: 16,
              color: "#D1D4DC",
              caretColor: "#2962FF",
            }}
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#787B86" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Category Tabs ── */}
        <div
          style={{
            display: "flex",
            gap: 0,
            padding: "0 16px",
            borderBottom: "1px solid #2A2E39",
          }}
        >
          {CATEGORY_TABS.map((tab) => {
            const active = category === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setCategory(tab.key)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: active ? "2px solid #2962FF" : "2px solid transparent",
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  color: active ? "#D1D4DC" : "#545B69",
                  padding: "8px 12px",
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Results List ── */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            minHeight: 0,
          }}
        >
          {/* Recent section */}
          {showRecent && (
            <>
              <div
                style={{
                  padding: "10px 16px 4px",
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#545B69",
                  letterSpacing: "0.1em",
                }}
              >
                RECENT
              </div>
              {recentAssets.map((asset) => {
                const idx = rowCounter++;
                const highlighted = idx === highlightIndex;
                const isCurrent = asset.symbol === currentSymbol;
                return (
                  <div
                    key={`recent-${asset.symbol}`}
                    onClick={() => handleSelect(asset.symbol)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "8px 16px",
                      cursor: "pointer",
                      background: highlighted ? "#2A2E39" : "transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                  >
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 13,
                        fontWeight: 700,
                        color: isCurrent ? "#2962FF" : "#D1D4DC",
                        minWidth: 90,
                      }}
                    >
                      {asset.symbol}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_UI,
                        fontSize: 12,
                        color: "#787B86",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {asset.display}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 10,
                        fontWeight: 600,
                        color: CATEGORY_COLORS[asset.category] ?? "#787B86",
                        background: `${CATEGORY_COLORS[asset.category] ?? "#787B86"}15`,
                        padding: "2px 6px",
                        borderRadius: 3,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}
                    >
                      {asset.category}
                    </span>
                  </div>
                );
              })}
              {results.length > 0 && (
                <div
                  style={{
                    height: 1,
                    background: "#2A2E39",
                    margin: "4px 16px",
                  }}
                />
              )}
            </>
          )}

          {/* All results header when showing recent */}
          {showRecent && results.length > 0 && (
            <div
              style={{
                padding: "10px 16px 4px",
                fontFamily: FONT_MONO,
                fontSize: 10,
                fontWeight: 600,
                color: "#545B69",
                letterSpacing: "0.1em",
              }}
            >
              ALL SYMBOLS
            </div>
          )}

          {/* Search results */}
          {results.map((match) => {
            const idx = rowCounter++;
            const highlighted = idx === highlightIndex;
            const isCurrent = match.asset.symbol === currentSymbol;
            return (
              <div
                key={match.asset.symbol}
                onClick={() => handleSelect(match.asset.symbol)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 16px",
                  cursor: "pointer",
                  background: highlighted ? "#2A2E39" : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
              >
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 13,
                    fontWeight: 700,
                    minWidth: 90,
                    color: isCurrent ? "#2962FF" : "#D1D4DC",
                  }}
                >
                  {query.trim() && match.symbolIndices ? (
                    <HighlightedText
                      text={match.asset.symbol}
                      indices={match.symbolIndices}
                      baseColor={isCurrent ? "#2962FF" : "#D1D4DC"}
                      highlightColor="#2962FF"
                      fontWeight={700}
                    />
                  ) : (
                    match.asset.symbol
                  )}
                </span>
                <span
                  style={{
                    fontFamily: FONT_UI,
                    fontSize: 12,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {query.trim() && match.displayIndices ? (
                    <HighlightedText
                      text={match.asset.display}
                      indices={match.displayIndices}
                      baseColor="#787B86"
                      highlightColor="#2962FF"
                    />
                  ) : (
                    <span style={{ color: "#787B86" }}>{match.asset.display}</span>
                  )}
                </span>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    fontWeight: 600,
                    color: CATEGORY_COLORS[match.asset.category] ?? "#787B86",
                    background: `${CATEGORY_COLORS[match.asset.category] ?? "#787B86"}15`,
                    padding: "2px 6px",
                    borderRadius: 3,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {match.asset.category}
                </span>
              </div>
            );
          })}

          {/* No results */}
          {results.length === 0 && query.trim() && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 16px",
                gap: 8,
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#545B69" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <span style={{ fontFamily: FONT_UI, fontSize: 13, color: "#545B69" }}>
                No symbols found for &quot;{query}&quot;
              </span>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid #2A2E39",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#545B69" }}>
            <kbd style={{ background: "#2A2E39", padding: "1px 4px", borderRadius: 3, fontSize: 10 }}>
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#545B69" }}>
            <kbd style={{ background: "#2A2E39", padding: "1px 4px", borderRadius: 3, fontSize: 10 }}>
              Enter
            </kbd>{" "}
            select
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#545B69" }}>
            <kbd style={{ background: "#2A2E39", padding: "1px 4px", borderRadius: 3, fontSize: 10 }}>
              Esc
            </kbd>{" "}
            close
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#545B69" }}>
            {ASSETS.length} symbols
          </span>
        </div>
      </div>
    </div>
  );
}
