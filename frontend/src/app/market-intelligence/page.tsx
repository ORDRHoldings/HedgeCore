"use client";

/**
 * /market-intelligence — Market Intelligence Hub
 *
 * Institutional FX market decision surface. Displays live FX rates with
 * heatmap-style cards, equity sector performance, market index ticker ribbon,
 * and provider health status. Data refreshes on configurable intervals.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  WifiOff,
  Clock,
  BarChart3,
  Globe,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";

// ── Design tokens ────────────────────────────────────────────────────────────
const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  green: "var(--accent-green,#059669)",
  red: "var(--accent-red,#DC2626)",
  cyan: "var(--accent-cyan,#1C62F2)",
  amber: "var(--accent-amber,#D97706)",
} as const;

// ── FX pair list ─────────────────────────────────────────────────────────────
/** Supported FX pairs (backend returns all by default). */
const FX_PAIRS = [
  "USDMXN", "USDBRL", "USDCOP", "USDCLP", "USDPEN",
  "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "USDCHF",
  "USDCNY", "USDINR", "USDSGD", "USDKRW", "USDHKD",
  "USDAUD", "USDNZD",
] as const;

const JPY_PAIRS = new Set(["USDJPY"]);
const HIGH_VALUE_PAIRS = new Set(["USDCOP", "USDCLP", "USDKRW"]);

// ── Types ────────────────────────────────────────────────────────────────────
interface FXRate {
  symbol: string;
  mid: number;
  bid: number;
  ask: number;
  change_pct: number;
  source: string;
  timestamp: string;
}

interface SectorQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  category: string;
}

interface ProviderStatus {
  name: string;
  connected: boolean;
  latency_ms: number | null;
  error: string | null;
}

interface HealthReport {
  timestamp: string;
  providers: ProviderStatus[];
  overall_healthy: boolean;
  stale_count: number;
  fresh_count: number;
}

interface ForwardCurveData {
  pair: string;
  spot_mid: number | null;
  forward_points: Record<string, number>;
  source: string;
}

// ── Polling intervals ────────────────────────────────────────────────────────
const FX_POLL_MS = 60_000;
const SECTOR_POLL_MS = 300_000;

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatMid(pair: string, mid: number): string {
  if (HIGH_VALUE_PAIRS.has(pair)) return mid.toFixed(2);
  if (JPY_PAIRS.has(pair)) return mid.toFixed(3);
  return mid.toFixed(4);
}

function formatBidAsk(pair: string, val: number): string {
  if (HIGH_VALUE_PAIRS.has(pair)) return val.toFixed(2);
  if (JPY_PAIRS.has(pair)) return val.toFixed(3);
  return val.toFixed(4);
}

function spreadPips(pair: string, bid: number, ask: number): string {
  const multiplier = JPY_PAIRS.has(pair) ? 100 : 10000;
  const pips = (ask - bid) * multiplier;
  return pips.toFixed(1);
}

function sourceLabel(src: string): string {
  if (src.includes("twelvedata") || src === "TD") return "TD";
  if (src.includes("interactive") || src === "IB") return "IB";
  if (src.includes("yahoo") || src === "YF") return "YF";
  if (src.includes("fallback") || src === "FB") return "FB";
  return src.substring(0, 2).toUpperCase();
}

function isLiveSource(src: string): boolean {
  const label = sourceLabel(src);
  return label !== "FB";
}

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function utcNow(): string {
  const d = new Date();
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

// ── Section Title ────────────────────────────────────────────────────────────
function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `1px solid ${S.rim}`,
      }}
    >
      <Icon size={16} style={{ color: S.cyan, flexShrink: 0 }} />
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: 13,
          fontWeight: 600,
          color: S.secondary,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </span>
    </div>
  );
}

// ── Ticker Ribbon ────────────────────────────────────────────────────────────
function TickerRibbon({ quotes }: { quotes: SectorQuote[] }) {
  const indices = quotes.filter((q) => q.category === "market");
  if (indices.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 1,
        background: S.rim,
        borderRadius: 6,
        overflow: "hidden",
        marginBottom: 20,
      }}
    >
      {indices.map((q) => {
        const up = q.changePercent >= 0;
        return (
          <div
            key={q.symbol}
            style={{
              flex: 1,
              background: S.bgPanel,
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  color: S.secondary,
                  letterSpacing: "0.04em",
                }}
              >
                {q.symbol}
              </span>
              <span
                style={{
                  fontFamily: S.fontUI,
                  fontSize: 12,
                  color: S.tertiary,
                }}
              >
                {q.name}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 14,
                  fontWeight: 600,
                  color: S.primary,
                }}
              >
                {q.price.toFixed(2)}
              </span>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 500,
                  color: up ? S.green : S.red,
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                {up ? (
                  <ArrowUpRight size={12} />
                ) : (
                  <ArrowDownRight size={12} />
                )}
                {up ? "+" : ""}
                {q.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── FX Heatmap Card ──────────────────────────────────────────────────────────
function FXCard({ rate }: { rate: FXRate }) {
  const up = rate.change_pct > 0;
  const flat = rate.change_pct === 0;
  const changeColor = flat ? S.tertiary : up ? S.green : S.red;
  const srcLabel = sourceLabel(rate.source);
  const live = isLiveSource(rate.source);

  const base = rate.symbol.substring(0, 3);
  const quote = rate.symbol.substring(3);

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 6,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "border-color 0.15s",
        borderLeft: `3px solid ${flat ? S.rim : up ? S.green : S.red}`,
      }}
    >
      {/* Row 1: pair + source badge */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 14,
            fontWeight: 700,
            color: S.primary,
            letterSpacing: "0.03em",
          }}
        >
          {base}
          <span style={{ color: S.tertiary }}>/</span>
          {quote}
        </span>
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 3,
            background: live ? "rgba(5,150,105,0.1)" : "rgba(217,119,6,0.1)",
            color: live ? S.green : S.amber,
            letterSpacing: "0.05em",
          }}
        >
          {srcLabel}
        </span>
      </div>

      {/* Row 2: mid price (large) + change */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 20,
            fontWeight: 700,
            color: S.primary,
            letterSpacing: "-0.02em",
          }}
        >
          {formatMid(rate.symbol, rate.mid)}
        </span>
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 13,
            fontWeight: 600,
            color: changeColor,
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          {flat ? (
            <Minus size={12} />
          ) : up ? (
            <TrendingUp size={12} />
          ) : (
            <TrendingDown size={12} />
          )}
          {flat ? "0.00" : (up ? "+" : "") + rate.change_pct.toFixed(2)}%
        </span>
      </div>

      {/* Row 3: bid / ask / spread */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: `1px solid ${S.rim}`,
          paddingTop: 6,
        }}
      >
        <div style={{ display: "flex", gap: 12 }}>
          <div>
            <span
              style={{
                fontFamily: S.fontUI,
                fontSize: 12,
                color: S.tertiary,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Bid
            </span>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.secondary,
              }}
            >
              {formatBidAsk(rate.symbol, rate.bid)}
            </div>
          </div>
          <div>
            <span
              style={{
                fontFamily: S.fontUI,
                fontSize: 12,
                color: S.tertiary,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Ask
            </span>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.secondary,
              }}
            >
              {formatBidAsk(rate.symbol, rate.ask)}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span
            style={{
              fontFamily: S.fontUI,
              fontSize: 12,
              color: S.tertiary,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Spread
          </span>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.secondary,
            }}
          >
            {spreadPips(rate.symbol, rate.bid, rate.ask)} pips
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FX Heatmap Grid ──────────────────────────────────────────────────────────
function FXHeatmapGrid({ rates }: { rates: FXRate[] }) {
  if (rates.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          fontFamily: S.fontUI,
          fontSize: 14,
          color: S.tertiary,
        }}
      >
        No FX rate data available
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}
    >
      {rates.map((r) => (
        <FXCard key={r.symbol} rate={r} />
      ))}
    </div>
  );
}

// ── Sector Grid ──────────────────────────────────────────────────────────────
function SectorGrid({ quotes }: { quotes: SectorQuote[] }) {
  const sectors = quotes.filter((q) => q.category === "sector");
  if (sectors.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          fontFamily: S.fontUI,
          fontSize: 14,
          color: S.tertiary,
        }}
      >
        No sector data available
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 8,
      }}
    >
      {sectors.map((q) => {
        const up = q.changePercent >= 0;
        return (
          <div
            key={q.symbol}
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 6,
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  color: S.primary,
                }}
              >
                {q.symbol}
              </span>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  color: up ? S.green : S.red,
                }}
              >
                {up ? "+" : ""}
                {q.changePercent.toFixed(2)}%
              </span>
            </div>
            <span
              style={{
                fontFamily: S.fontUI,
                fontSize: 12,
                color: S.tertiary,
              }}
            >
              {q.name}
            </span>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: 2,
              }}
            >
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 14,
                  fontWeight: 600,
                  color: S.primary,
                }}
              >
                ${q.price.toFixed(2)}
              </span>
              {q.volume > 0 && (
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.tertiary,
                  }}
                >
                  {formatVolume(q.volume)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Market Health Bar ────────────────────────────────────────────────────────
function MarketHealthBar({
  health,
  lastRefresh,
  onForceRefresh,
  refreshing,
}: {
  health: HealthReport | null;
  lastRefresh: string;
  onForceRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        background: S.bgPanel,
        borderTop: `1px solid ${S.rim}`,
        padding: "8px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: S.fontMono,
        fontSize: 12,
      }}
    >
      {/* Provider dots */}
      {health && health.providers.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontFamily: S.fontUI,
              fontSize: 12,
              color: S.tertiary,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Providers
          </span>
          {health.providers.map((p) => (
            <div
              key={p.name}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
              title={
                p.connected
                  ? `${p.name}: OK${p.latency_ms != null ? ` (${p.latency_ms.toFixed(0)}ms)` : ""}`
                  : `${p.name}: ${p.error || "disconnected"}`
              }
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: p.connected ? S.green : S.red,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: S.secondary, fontSize: 12 }}>
                {p.name}
              </span>
              {p.latency_ms != null && (
                <span style={{ color: S.tertiary, fontSize: 12 }}>
                  {p.latency_ms.toFixed(0)}ms
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <WifiOff size={12} style={{ color: S.tertiary }} />
          <span style={{ color: S.tertiary, fontSize: 12 }}>
            No provider data
          </span>
        </div>
      )}

      {/* Staleness badges */}
      {health && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginLeft: 8,
          }}
        >
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 3,
              fontSize: 12,
              fontWeight: 600,
              background: "rgba(5,150,105,0.1)",
              color: S.green,
            }}
          >
            FRESH: {health.fresh_count}
          </span>
          {health.stale_count > 0 && (
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 3,
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(217,119,6,0.1)",
                color: S.amber,
              }}
            >
              STALE: {health.stale_count}
            </span>
          )}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Last refresh */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          color: S.tertiary,
          fontSize: 12,
        }}
      >
        <Clock size={12} />
        <span>Last: {lastRefresh || "\u2014"}</span>
      </div>

      {/* Force refresh button */}
      <button
        onClick={onForceRefresh}
        disabled={refreshing}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 12px",
          borderRadius: 4,
          border: `1px solid ${S.rim}`,
          background: S.bgSub,
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 600,
          color: S.secondary,
          cursor: refreshing ? "not-allowed" : "pointer",
          opacity: refreshing ? 0.5 : 1,
          letterSpacing: "0.04em",
        }}
      >
        <RefreshCw
          size={12}
          style={{
            animation: refreshing ? "mi-spin 1s linear infinite" : "none",
          }}
        />
        FORCE REFRESH
      </button>
    </div>
  );
}

// ── Carry Scorecard ──────────────────────────────────────────────────────
function CarryScorecard({
  rates,
  forwardCurves,
}: {
  rates: FXRate[];
  forwardCurves: Record<string, ForwardCurveData>;
}) {
  const carryData = rates
    .map((r) => {
      const curve = forwardCurves[r.symbol];
      const pts12m = curve?.forward_points?.["12M"] ?? 0;
      const pts3m = curve?.forward_points?.["3M"] ?? 0;
      const isJpy = JPY_PAIRS.has(r.symbol);
      const mult = isJpy ? 100 : HIGH_VALUE_PAIRS.has(r.symbol) ? 1 : 10000;
      const carryPips = pts12m * mult;
      return { symbol: r.symbol, mid: r.mid, pts3m, pts12m, carryPips };
    })
    .filter((c) => c.pts12m !== 0)
    .sort((a, b) => b.carryPips - a.carryPips);

  if (carryData.length === 0) {
    return (
      <div
        style={{
          padding: 20,
          textAlign: "center",
          fontFamily: S.fontUI,
          fontSize: 13,
          color: S.tertiary,
          background: S.bgPanel,
          borderRadius: 6,
          border: `1px solid ${S.rim}`,
        }}
      >
        No forward curve data available — ingest snapshots to see carry rankings
      </div>
    );
  }

  return (
    <div
      style={{
        background: S.bgPanel,
        borderRadius: 6,
        border: `1px solid ${S.rim}`,
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 90px 90px 90px 80px",
          padding: "8px 16px",
          background: S.bgSub,
          borderBottom: `1px solid ${S.rim}`,
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 600,
          color: S.tertiary,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        <span>Pair</span>
        <span style={{ textAlign: "right" }}>Spot</span>
        <span style={{ textAlign: "right" }}>3M Pts</span>
        <span style={{ textAlign: "right" }}>12M Pts</span>
        <span style={{ textAlign: "right" }}>Carry</span>
      </div>
      {/* Data rows */}
      {carryData.map((c, i) => {
        const isJpy = JPY_PAIRS.has(c.symbol);
        const isHigh = HIGH_VALUE_PAIRS.has(c.symbol);
        return (
          <div
            key={c.symbol}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 90px 90px 90px 80px",
              padding: "6px 16px",
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.primary,
              borderBottom:
                i < carryData.length - 1
                  ? `1px solid ${S.rim}`
                  : "none",
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {c.symbol.slice(0, 3)}
              <span style={{ color: S.tertiary }}>/</span>
              {c.symbol.slice(3)}
            </span>
            <span style={{ textAlign: "right" }}>
              {isHigh
                ? c.mid.toFixed(2)
                : isJpy
                  ? c.mid.toFixed(3)
                  : c.mid.toFixed(4)}
            </span>
            <span
              style={{
                textAlign: "right",
                color: c.pts3m >= 0 ? S.green : S.red,
              }}
            >
              {c.pts3m >= 0 ? "+" : ""}
              {c.pts3m.toFixed(4)}
            </span>
            <span
              style={{
                textAlign: "right",
                color: c.pts12m >= 0 ? S.green : S.red,
              }}
            >
              {c.pts12m >= 0 ? "+" : ""}
              {c.pts12m.toFixed(4)}
            </span>
            <span
              style={{
                textAlign: "right",
                fontWeight: 700,
                color: c.carryPips >= 0 ? S.green : S.red,
              }}
            >
              {c.carryPips >= 0 ? "+" : ""}
              {c.carryPips.toFixed(0)}p
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function MarketIntelligencePage() {
  const { token, user } = useAuth();

  const [fxRates, setFxRates] = useState<FXRate[]>([]);
  const [sectorQuotes, setSectorQuotes] = useState<SectorQuote[]>([]);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("");
  const [utcClock, setUtcClock] = useState(utcNow());
  const [forwardCurves, setForwardCurves] = useState<Record<string, ForwardCurveData>>({});
  const [fxError, setFxError] = useState<string | null>(null);
  const [sectorError, setSectorError] = useState<string | null>(null);

  const fxTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sectorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── UTC clock tick ───────────────────────────────────────────────────────
  useEffect(() => {
    clockTimerRef.current = setInterval(() => setUtcClock(utcNow()), 1000);
    return () => {
      if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    };
  }, []);

  // ── Fetchers ─────────────────────────────────────────────────────────────
  const fetchFxRates = useCallback(async () => {
    if (!token) return;
    try {
      const res = await dashboardFetch("/v1/market/fx/rates", token);
      if (res.ok) {
        const data = await res.json();
        setFxRates(data.rates ?? []);
        setFxError(null);
      } else {
        setFxError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setFxError(err instanceof Error ? err.message : "Network error");
    }
  }, [token]);

  const fetchSectors = useCallback(async () => {
    if (!token) return;
    try {
      const res = await dashboardFetch("/v1/market/sectors", token);
      if (res.ok) {
        const data = await res.json();
        setSectorQuotes(data.quotes ?? []);
        setSectorError(null);
      } else {
        setSectorError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setSectorError(err instanceof Error ? err.message : "Network error");
    }
  }, [token]);

  const fetchForwardCurves = useCallback(async () => {
    if (!token) return;
    try {
      const pairsParam = FX_PAIRS.join(",");
      const res = await dashboardFetch(`/v1/forward-curves/bulk-latest?pairs=${pairsParam}`, token);
      if (res.ok) {
        const data = await res.json();
        setForwardCurves(data.curves ?? {});
      }
    } catch {
      // Forward curves are supplemental, silently ignore
    }
  }, [token]);

  const fetchHealth = useCallback(async () => {
    if (!token) return;
    try {
      const res = await dashboardFetch("/v1/market-data/status", token);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      // Health is non-critical, silently ignore
    }
  }, [token]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchFxRates(), fetchSectors(), fetchHealth(), fetchForwardCurves()]);
    setLastRefresh(utcNow());
    setLoading(false);
  }, [fetchFxRates, fetchSectors, fetchHealth, fetchForwardCurves]);

  // ── Initial load + polling ───────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    fetchAll();

    fxTimerRef.current = setInterval(fetchFxRates, FX_POLL_MS);
    sectorTimerRef.current = setInterval(() => {
      fetchSectors();
      fetchHealth();
    }, SECTOR_POLL_MS);

    return () => {
      if (fxTimerRef.current) clearInterval(fxTimerRef.current);
      if (sectorTimerRef.current) clearInterval(sectorTimerRef.current);
    };
  }, [token, fetchAll, fetchFxRates, fetchSectors, fetchHealth]);

  // ── Pause polling when tab is hidden (saves API quota) ─────────────────
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        if (fxTimerRef.current) clearInterval(fxTimerRef.current);
        if (sectorTimerRef.current) clearInterval(sectorTimerRef.current);
        fxTimerRef.current = null;
        sectorTimerRef.current = null;
      } else {
        fetchAll();
        fxTimerRef.current = setInterval(fetchFxRates, FX_POLL_MS);
        sectorTimerRef.current = setInterval(() => {
          fetchSectors();
          fetchHealth();
        }, SECTOR_POLL_MS);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchAll, fetchFxRates, fetchSectors, fetchHealth]);

  // ── Force refresh handler ────────────────────────────────────────────────
  const handleForceRefresh = useCallback(async () => {
    setRefreshing(true);
    // Trigger backend provider refresh first
    try {
      await dashboardFetch("/v1/market-data/refresh", token!, {
        method: "POST",
        body: JSON.stringify({ data_type: "fx_spot" }),
      });
    } catch {
      // Best-effort, continue to re-fetch frontend data
    }
    await fetchAll();
    setRefreshing(false);
  }, [token, fetchAll]);

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (!token || !user) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: S.fontUI,
          fontSize: 14,
          color: S.tertiary,
          background: S.bgDeep,
        }}
      >
        Redirecting to login...
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <PageShell
      icon={BarChart3}
      title="Market Intelligence"
      breadcrumb={["Dashboard","Market Intelligence"]}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 3,
              background: "rgba(5,150,105,0.12)",
              color: S.green,
              letterSpacing: "0.08em",
              animation: "mi-pulse 2s ease-in-out infinite",
            }}
          >
            LIVE
          </span>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 13,
              color: S.secondary,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Clock size={14} style={{ color: S.tertiary }} />
            {utcClock}
          </span>
          <button
            onClick={handleForceRefresh}
            disabled={refreshing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              borderRadius: 5,
              border: `1px solid ${S.rim}`,
              background: S.bgSub,
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 600,
              color: S.secondary,
              cursor: refreshing ? "not-allowed" : "pointer",
              opacity: refreshing ? 0.5 : 1,
              letterSpacing: "0.04em",
            }}
          >
            <RefreshCw
              size={13}
              style={{
                animation: refreshing ? "mi-spin 1s linear infinite" : "none",
              }}
            />
            REFRESH
          </button>
        </div>
      }
    >
      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "calc(100vh - 64px)",
          margin: "-24px -28px",
        }}
      >
        <div
          style={{
            flex: 1,
            padding: "20px 24px",
            overflow: "auto",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 64,
                fontFamily: S.fontMono,
                fontSize: 14,
                color: S.tertiary,
              }}
            >
              <RefreshCw
                size={16}
                style={{
                  animation: "mi-spin 1s linear infinite",
                  marginRight: 8,
                }}
              />
              Loading market data...
            </div>
          ) : (
            <>
              {/* Ticker Ribbon */}
              <TickerRibbon quotes={sectorQuotes} />

              {/* FX Heatmap */}
              <div style={{ marginBottom: 24 }}>
                <SectionTitle icon={Globe} title="FX Spot Rates" />
                {fxError && (
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      color: S.red,
                      marginBottom: 8,
                      padding: "6px 10px",
                      background: "rgba(220,38,38,0.06)",
                      borderRadius: 4,
                    }}
                  >
                    FX data error: {fxError}
                  </div>
                )}
                <FXHeatmapGrid rates={fxRates} />
              </div>

              {/* Carry Scorecard */}
              <div style={{ marginBottom: 24 }}>
                <SectionTitle icon={TrendingUp} title="Carry Scorecard — 12M Ranked" />
                <CarryScorecard rates={fxRates} forwardCurves={forwardCurves} />
              </div>

              {/* Sector Performance */}
              <div style={{ marginBottom: 24 }}>
                <SectionTitle icon={BarChart3} title="Sector Performance" />
                {sectorError && (
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      color: S.red,
                      marginBottom: 8,
                      padding: "6px 10px",
                      background: "rgba(220,38,38,0.06)",
                      borderRadius: 4,
                    }}
                  >
                    Sector data error: {sectorError}
                  </div>
                )}
                <SectorGrid quotes={sectorQuotes} />
              </div>
            </>
          )}
        </div>

        {/* ── Health Footer ─────────────────────────────────────────────── */}
        <MarketHealthBar
          health={health}
          lastRefresh={lastRefresh}
          onForceRefresh={handleForceRefresh}
          refreshing={refreshing}
        />
      </div>
    </PageShell>
  );
}
