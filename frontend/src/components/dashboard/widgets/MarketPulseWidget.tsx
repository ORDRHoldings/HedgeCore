"use client";

import { useState, useEffect, useRef } from "react";
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
  category: "sector" | "market";
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

/* ─── Sparkline helpers ─────────────────────────────────────────────────── */

function genSparkData(symbol: string, changePct: number, n = 18): number[] {
  const seed = symbol.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const pts: number[] = [50];
  for (let i = 1; i < n; i++) {
    const r = ((seed * i * 9301 + 49297) % 233280) / 233280;
    const drift = changePct > 0 ? 0.4 : changePct < 0 ? -0.4 : 0;
    pts.push(Math.max(8, Math.min(92, pts[i - 1]! + (r - 0.5) * 10 + drift)));
  }
  return pts;
}

function sparklineSvgPath(pts: number[], w: number, h: number): string {
  if (pts.length < 2) return "";
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  return pts
    .map((d, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((d - min) / range) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function SparkLine({
  data,
  color,
  width = 64,
  height = 28,
  id,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  id: string;
}) {
  const line = sparklineSvgPath(data, width, height);
  const fill = line + ` L${width},${height} L0,${height} Z`;
  const gradId = `spk-${id}`;
  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── Scrolling ticker ──────────────────────────────────────────────────── */

function TickerTape({ quotes }: { quotes: QuoteData[] }) {
  if (!quotes.length) return null;
  const items = [...quotes, ...quotes]; // duplicate for seamless loop
  return (
    <div
      style={{
        overflow: "hidden",
        borderBottom: `1px solid ${S.soft}`,
        background: S.bgDeep,
        height: 22,
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 0,
          animation: "ticker-scroll 40s linear infinite",
          whiteSpace: "nowrap",
        }}
      >
        {items.map((q, i) => {
          const up = q.changePercent > 0;
          const down = q.changePercent < 0;
          const clr = up ? S.green : down ? S.red : S.tertiary;
          return (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "0 14px",
                borderRight: `1px solid ${S.soft}`,
                fontFamily: S.fontMono,
                fontSize: 9,
              }}
            >
              <span style={{ color: S.cyan, fontWeight: 700, letterSpacing: "0.06em" }}>
                {q.symbol}
              </span>
              <span style={{ color: S.primary, fontWeight: 600 }}>
                ${q.price.toFixed(2)}
              </span>
              <span style={{ color: clr, fontWeight: 700 }}>
                {up ? "▲" : down ? "▼" : "─"} {Math.abs(q.changePercent).toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
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
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hour = new Date().getUTCHours();
  const session =
    hour >= 13 && hour < 21
      ? "US"
      : hour >= 7 && hour < 16
      ? "EU"
      : hour >= 0 && hour < 7
      ? "ASIA"
      : "US";

  const marketQuotes = quotes.filter((q) => q.category === "market");
  const sectorQuotes = quotes.filter((q) => q.category === "sector");
  const displayQuotes = activeTab === "market" ? marketQuotes : sectorQuotes;

  // Compute overall sentiment
  const allQuotes = [...marketQuotes, ...sectorQuotes];
  const gainers = allQuotes.filter((q) => q.changePercent > 0).length;
  const losers = allQuotes.filter((q) => q.changePercent < 0).length;
  const sentimentPct =
    allQuotes.length > 0 ? (gainers / allQuotes.length) * 100 : 50;
  const sentimentLabel =
    sentimentPct >= 60 ? "RISK-ON" : sentimentPct <= 40 ? "RISK-OFF" : "MIXED";
  const sentimentColor =
    sentimentPct >= 60 ? S.green : sentimentPct <= 40 ? S.red : S.amber;

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        className="widget-drag-handle"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: `1px solid ${S.rim}`,
          background: S.bgDeep,
          flexShrink: 0,
          cursor: "grab",
        }}
      >
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }}>⠿</span>
        <Radio size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: S.primary,
            textTransform: "uppercase",
          }}
        >
          Market Pulse
        </span>

        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 8,
            letterSpacing: "0.08em",
            color: S.cyan,
            background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`,
            borderRadius: 3,
            padding: "1px 5px",
            textTransform: "uppercase",
          }}
        >
          WALL STREET
        </span>

        <div style={{ flex: 1 }} />

        {/* Sentiment badge */}
        {!loading && allQuotes.length > 0 && (
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 8,
              letterSpacing: "0.08em",
              color: sentimentColor,
              background: `color-mix(in srgb, ${sentimentColor} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${sentimentColor} 25%, transparent)`,
              borderRadius: 3,
              padding: "1px 5px",
              textTransform: "uppercase",
            }}
          >
            {sentimentLabel}
          </span>
        )}

        {/* Data source badge — only shown when data is loaded */}
        {!loading && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 8, letterSpacing: "0.08em",
            color: dataSource === "live" ? S.green : S.amber,
            background: `color-mix(in srgb, ${dataSource === "live" ? S.green : S.amber} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${dataSource === "live" ? S.green : S.amber} 25%, transparent)`,
            borderRadius: 3, padding: "1px 5px", textTransform: "uppercase",
          }}>
            {dataSource === "live" ? "LIVE" : "DELAYED"}
          </span>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: S.green,
              boxShadow: `0 0 4px ${S.green}`,
              animation: "mkt-pulse 2s infinite",
              display: "inline-block",
            }}
          />
          <span
            style={{ fontFamily: S.fontMono, fontSize: 9, color: S.green, fontWeight: 700 }}
          >
            {session}
          </span>
        </div>

        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
          {time.slice(11, 16)} UTC
        </span>

        {onRemove && (
          <button
            onClick={onRemove}
            title="Remove widget"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: S.tertiary,
              display: "flex",
              alignItems: "center",
              padding: 2,
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Ticker tape */}
      {!loading && !error && <TickerTape quotes={allQuotes} />}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `1px solid ${S.rim}`,
          flexShrink: 0,
        }}
      >
        {[
          { key: "market" as const, label: "MAJOR INDICES", count: marketQuotes.length },
          { key: "sectors" as const, label: "SECTOR ETFS", count: sectorQuotes.length },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: "6px 10px",
                fontFamily: S.fontMono,
                fontSize: 9,
                letterSpacing: "0.06em",
                fontWeight: 700,
                cursor: "pointer",
                color: isActive ? S.cyan : S.tertiary,
                background: isActive
                  ? `color-mix(in srgb, ${S.cyan} 6%, transparent)`
                  : "transparent",
                borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
                border: "none",
                borderRight: `1px solid ${S.soft}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: 8,
                  color: isActive ? S.cyan : S.tertiary,
                  background: isActive
                    ? `color-mix(in srgb, ${S.cyan} 15%, transparent)`
                    : `color-mix(in srgb, ${S.tertiary} 10%, transparent)`,
                  padding: "0 4px",
                  borderRadius: 3,
                  fontWeight: 600,
                }}
              >
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
          <div
            style={{
              padding: "20px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              textAlign: "center",
            }}
          >
            <Radio size={28} color={S.cyan} style={{ opacity: 0.4 }} />
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.secondary,
                letterSpacing: "0.04em",
                fontWeight: 600,
              }}
            >
              MARKET DATA UNAVAILABLE
            </div>
            <div
              style={{
                fontFamily: S.fontUI,
                fontSize: 11,
                color: S.tertiary,
                lineHeight: 1.5,
                maxWidth: 260,
              }}
            >
              Unable to fetch market quotes. Please check your connection.
            </div>
          </div>
        )}

        {!loading && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                activeTab === "market" ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
              gap: 0,
            }}
          >
            {displayQuotes.map((quote, i) => {
              const isUp = quote.changePercent > 0;
              const isDown = quote.changePercent < 0;
              const changeColor = isUp ? S.green : isDown ? S.red : S.tertiary;
              const TrendIcon = isUp
                ? TrendingUp
                : isDown
                ? TrendingDown
                : Minus;
              const colCount = activeTab === "market" ? 2 : 3;
              const sparkData = genSparkData(quote.symbol, quote.changePercent);

              return (
                <div
                  key={quote.symbol}
                  style={{
                    padding: "10px 12px 8px",
                    borderRight:
                      (i + 1) % colCount !== 0
                        ? `1px solid ${S.soft}`
                        : "none",
                    borderBottom: `1px solid ${S.soft}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Symbol row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        color: S.cyan,
                        letterSpacing: "0.08em",
                        fontWeight: 700,
                      }}
                    >
                      {quote.symbol}
                    </span>
                    <TrendIcon size={9} color={changeColor} />
                  </div>

                  {/* Price + sparkline */}
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 4 }}>
                    <div>
                      <div
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 17,
                          fontWeight: 700,
                          color: S.primary,
                          lineHeight: 1,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        ${quote.price.toFixed(2)}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 3,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            color: changeColor,
                            fontWeight: 700,
                            background: `color-mix(in srgb, ${changeColor} 12%, transparent)`,
                            padding: "1px 4px",
                            borderRadius: 2,
                          }}
                        >
                          {isUp ? "+" : ""}{quote.changePercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <SparkLine
                      data={sparkData}
                      color={changeColor}
                      width={60}
                      height={26}
                      id={`${quote.symbol}-${i}`}
                    />
                  </div>

                  {/* Name + volume bar */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                    <span
                      style={{
                        fontFamily: S.fontUI,
                        fontSize: 8,
                        color: S.tertiary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "70%",
                      }}
                    >
                      {quote.name}
                    </span>
                    {/* Mini volume indicator */}
                    <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 8 }}>
                      {[0.4, 0.6, 0.8, 0.5, 1.0, 0.7, 0.9].map((h, vi) => (
                        <div
                          key={vi}
                          style={{
                            width: 2,
                            height: `${h * 8}px`,
                            background: changeColor,
                            opacity: 0.4,
                            borderRadius: 1,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sentiment bar */}
      {!loading && !error && allQuotes.length > 0 && (
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${S.soft}`,
            background: S.bgSub,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span
            style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.08em" }}
          >
            BREADTH
          </span>
          <div
            style={{
              flex: 1,
              height: 5,
              background: S.bgDeep,
              borderRadius: 3,
              overflow: "hidden",
              display: "flex",
            }}
          >
            <div
              style={{
                width: `${sentimentPct}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${S.green}, color-mix(in srgb, ${S.green} 70%, ${S.amber}))`,
                transition: "width 600ms ease",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 8,
              color: S.green,
              fontWeight: 700,
            }}
          >
            {gainers}↑
          </span>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 8,
              color: S.red,
              fontWeight: 700,
            }}
          >
            {losers}↓
          </span>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          padding: "4px 12px",
          borderTop: `1px solid ${S.soft}`,
          background: S.bgSub,
          fontFamily: S.fontMono,
          fontSize: 8,
          color: S.tertiary,
          display: "flex",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span>
          {dataSource === "live"
            ? "Alpha Vantage live quotes"
            : "Indicative reference data"}{" "}
          · Not investment advice
        </span>
        <span>{time.slice(11, 16)} UTC · {session}</span>
      </div>

      <style>{`
        @keyframes mkt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
