"use client";

import { useState, useEffect } from "react";
import { Radio, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import EmptyState from "@/components/ui/EmptyState";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  green: "var(--status-pass,#15803D)",
  red: "var(--accent-red,#B91C1C)",
} as const;

interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  category: 'sector' | 'market';
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function MarketPulseWidget({ token, user, onRemove }: Props) {
  const [time, setTime] = useState("");
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dataSource, setDataSource] = useState<"live" | "fallback">("fallback");
  const [activeTab, setActiveTab] = useState<"market" | "sectors">("market");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toISOString().replace("T", " ").slice(0, 19) + " UTC");
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/market-sectors");
        if (!res.ok) {
          if (!cancelled) setError(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setQuotes(data.quotes ?? []);
          setDataSource(data.dataSource ?? "fallback");
        }
      } catch (err) {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Determine market session
  const hour = new Date().getUTCHours();
  const session = hour >= 13 && hour < 21 ? "US" : hour >= 7 && hour < 16 ? "EU" : hour >= 0 && hour < 7 ? "ASIA" : "US";

  // Filter quotes by category
  const marketQuotes = quotes.filter(q => q.category === 'market');
  const sectorQuotes = quotes.filter(q => q.category === 'sector');
  const displayQuotes = activeTab === 'market' ? marketQuotes : sectorQuotes;

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
      display: "flex", flexDirection: "column", overflow: "hidden", height: "100%",
    }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab",
      }}>
        <Radio size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase",
        }}>
          Market Pulse
        </span>

        <span style={{
          fontFamily: S.fontMono, fontSize: 8, letterSpacing: "0.08em",
          color: S.cyan, background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`,
          borderRadius: 3, padding: "1px 5px", textTransform: "uppercase",
        }}>
          WALL STREET
        </span>

        <div style={{ flex: 1 }} />

        {dataSource === "live" && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 8, letterSpacing: "0.08em",
            color: S.green, background: `color-mix(in srgb, ${S.green} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.green} 25%, transparent)`,
            borderRadius: 3, padding: "1px 5px", textTransform: "uppercase",
          }}>
            LIVE
          </span>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%", background: S.green,
            boxShadow: `0 0 4px ${S.green}`, animation: "pulse 2s infinite",
            display: "inline-block",
          }} />
          <span style={{
            fontFamily: S.fontMono, fontSize: 9, color: S.green, fontWeight: 700,
          }}>
            {session}
          </span>
        </div>

        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
          {time}
        </span>

        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{
            background: "none", border: "none", cursor: "pointer",
            color: S.tertiary, display: "flex", alignItems: "center", padding: 2,
          }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        {[
          { key: "market" as const, label: "MAJOR INDICES", count: marketQuotes.length },
          { key: "sectors" as const, label: "SECTOR ETFS", count: sectorQuotes.length },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              flex: 1, padding: "6px 10px", fontFamily: S.fontMono, fontSize: 9,
              letterSpacing: "0.06em", fontWeight: 700, cursor: "pointer",
              color: isActive ? S.cyan : S.tertiary,
              background: isActive ? `color-mix(in srgb, ${S.cyan} 6%, transparent)` : "transparent",
              borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
              border: "none", borderRight: `1px solid ${S.soft}`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}>
              {tab.label}
              <span style={{
                fontSize: 8, color: isActive ? S.cyan : S.tertiary,
                background: isActive
                  ? `color-mix(in srgb, ${S.cyan} 15%, transparent)`
                  : `color-mix(in srgb, ${S.tertiary} 10%, transparent)`,
                padding: "0 4px", borderRadius: 3, fontWeight: 600,
              }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div style={{ padding: 12 }}>
            <EmptyState type="loading" message="Fetching market data..." />
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <Radio size={28} color={S.cyan} style={{ opacity: 0.4 }} />
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, letterSpacing: "0.04em", fontWeight: 600 }}>
              MARKET DATA UNAVAILABLE
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.5, maxWidth: 260 }}>
              Unable to fetch market quotes. Please check your connection.
            </div>
          </div>
        )}

        {!loading && !error && (
          <div style={{
            display: "grid",
            gridTemplateColumns: activeTab === "market" ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
            gap: 0,
          }}>
            {displayQuotes.map((quote, i) => {
              const isUp = quote.changePercent > 0;
              const isDown = quote.changePercent < 0;
              const changeColor = isUp ? S.green : isDown ? S.red : S.tertiary;
              const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
              const colCount = activeTab === "market" ? 2 : 3;

              return (
                <div key={quote.symbol} style={{
                  padding: "10px 12px",
                  borderRight: (i + 1) % colCount !== 0 ? `1px solid ${S.soft}` : "none",
                  borderBottom: i < (activeTab === "market" ? 2 : 6) ? `1px solid ${S.soft}` : "none",
                  display: "flex", flexDirection: "column", gap: 3,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 9, color: S.cyan,
                      letterSpacing: "0.08em", fontWeight: 700,
                    }}>
                      {quote.symbol}
                    </span>
                    <TrendIcon size={9} color={changeColor} />
                  </div>

                  <div style={{
                    fontFamily: S.fontMono, fontSize: 16, fontWeight: 700,
                    color: S.primary, lineHeight: 1,
                  }}>
                    ${quote.price.toFixed(2)}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 9, color: changeColor, fontWeight: 700,
                    }}>
                      {isUp ? "+" : ""}{quote.changePercent.toFixed(2)}%
                    </span>
                    <span style={{
                      fontFamily: S.fontUI, fontSize: 9, color: S.tertiary,
                    }}>
                      {quote.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
        fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
        display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span>
          {dataSource === "live" ? "Alpha Vantage live quotes" : "Indicative reference data"} · Not investment advice
        </span>
        <span>{time.slice(11, 16)} UTC · {session}</span>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
