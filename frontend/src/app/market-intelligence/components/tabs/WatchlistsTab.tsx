"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";

function getStorageKey(userId?: string): string {
  return `ordr_watchlist_${userId ?? "anon"}`;
}

const DEFAULT_WATCHLIST = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
  "JPM", "GS", "V", "XOM", "UNH",
];

export default function WatchlistsTab({ userId }: { userId?: string }) {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState("");

  // Load from localStorage
  useEffect(() => {
    const key = getStorageKey(userId);
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setWatchlist(JSON.parse(stored));
      } catch {
        setWatchlist(DEFAULT_WATCHLIST);
      }
    } else {
      setWatchlist(DEFAULT_WATCHLIST);
    }
  }, [userId]);

  // Persist changes
  const persist = useCallback(
    (list: string[]) => {
      localStorage.setItem(getStorageKey(userId), JSON.stringify(list));
    },
    [userId]
  );

  const addSymbol = () => {
    const sym = newSymbol.trim().toUpperCase();
    if (sym && !watchlist.includes(sym)) {
      const next = [...watchlist, sym];
      setWatchlist(next);
      persist(next);
      setNewSymbol("");
    }
  };

  const removeSymbol = (sym: string) => {
    const next = watchlist.filter((s) => s !== sym);
    setWatchlist(next);
    persist(next);
  };

  return (
    <div style={{ padding: "12px 24px 24px" }}>
      {/* Watchlist management bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 600,
            color: S.tertiary,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginRight: 8,
          }}
        >
          WATCHLIST ({watchlist.length})
        </span>

        {/* Symbol pills */}
        {watchlist.map((sym) => (
          <div
            key={sym}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 600,
              color: S.primary,
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 4,
              padding: "3px 8px",
            }}
          >
            {sym}
            <button
              onClick={() => removeSymbol(sym)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: S.tertiary,
                display: "flex",
                alignItems: "center",
                padding: 0,
              }}
            >
              <X size={10} />
            </button>
          </div>
        ))}

        {/* Add input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            border: `1px solid ${S.rim}`,
            borderRadius: 4,
            padding: "3px 8px",
            background: S.bgPanel,
          }}
        >
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSymbol()}
            placeholder="Add symbol"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.primary,
              width: 80,
            }}
          />
          <button
            onClick={addSymbol}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: S.cyan,
              display: "flex",
              alignItems: "center",
              padding: 0,
            }}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Screener widget */}
      <div
        style={{
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <TradingViewWidget
          scriptSrc="embed-widget-screener.js"
          config={{
            width: "100%",
            height: "100%",
            defaultColumn: "overview",
            defaultScreen: "most_capitalized",
            market: "us",
            showToolbar: true,
            locale: "en",
          }}
          height="calc(100vh - 260px)"
        />
      </div>

      {/* Mini charts for top items */}
      {watchlist.length > 0 && (
        <>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 600,
              color: S.tertiary,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "8px 0",
              borderBottom: `1px solid ${S.rim}`,
              marginBottom: 12,
            }}
          >
            QUICK VIEW
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 12,
            }}
          >
            {watchlist.slice(0, 6).map((sym) => (
              <div
                key={sym}
                style={{
                  border: `1px solid ${S.rim}`,
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <TradingViewWidget
                  scriptSrc="embed-widget-mini-symbol-overview.js"
                  config={{
                    symbol: sym,
                    width: "100%",
                    height: "100%",
                    locale: "en",
                    dateRange: "1M",
                    largeChartUrl: "",
                    trendLineColor: "rgba(28, 98, 242, 1)",
                    underLineColor: "rgba(28, 98, 242, 0.3)",
                    underLineBottomColor: "rgba(28, 98, 242, 0)",
                    noTimeScale: true,
                  }}
                  height={160}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
