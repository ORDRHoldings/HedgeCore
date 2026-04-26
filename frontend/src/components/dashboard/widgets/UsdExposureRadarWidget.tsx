"use client";

import { useEffect, useState } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, Minus, X, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import type { FxRateEntry } from "@/lib/market/types";
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
  radarCyan: "#22D3EE",
} as const;

interface UsdMetric {
  label: string;
  value: string;
  subValue: string;
  trend: "up" | "down" | "flat";
  color: string;
}

interface CurrencyPairRow {
  pair: string;
  spot: string;
  change24h: number;
  vol1m: string;
  forwardPts: string;
  carryBps: string;
}

// Static USD metrics — DXY gets overridden with live data when available
const USD_METRICS_STATIC: UsdMetric[] = [
  { label: "DXY INDEX",     value: "—",     subValue: "vs. basket of 6 majors",    trend: "flat", color: S.cyan },
  { label: "USD REAL YIELD",value: "1.48%", subValue: "10Y TIPS breakeven",         trend: "up",   color: S.green },
  { label: "FED FUNDS RATE",value: "4.50%", subValue: "Target range: 4.25-4.50",   trend: "flat", color: S.amber },
  { label: "FED NEXT MOVE", value: "HOLD",  subValue: "72% probability via CME",   trend: "flat", color: S.tertiary },
];

interface StrengthBar {
  label: string;
  vs: string;
  strength: number;
}

// Reference rates for strength computation (deviation = strength)
const REF_RATES: Record<string, number> = {
  EUR: 1.08, GBP: 1.26, AUD: 0.65,
  MXN: 17.5, JPY: 145,  CAD: 1.36, CHF: 0.89, CNH: 7.25,
};

const INVERTED_PAIRS = new Set(["EURUSD", "GBPUSD", "AUDUSD"]);

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

interface MarketData {
  pair: string;
  baseCurrency: string;
  spot: number;
  change24h: number;
  strength: number;
}

/* ─── Radar chart (SVG) ─────────────────────────────────────────────────── */
function RadarChart({
  bars,
  size = 180,
}: {
  bars: StrengthBar[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  const n = bars.length;

  const angleOf = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;

  const rings = [0.25, 0.5, 0.75, 1.0].map((frac) => {
    return bars
      .map((_, i) => {
        const a = angleOf(i);
        const x = cx + frac * r * Math.cos(a);
        const y = cy + frac * r * Math.sin(a);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z";
  });

  const axes = bars.map((_, i) => {
    const a = angleOf(i);
    return {
      x2: cx + r * Math.cos(a),
      y2: cy + r * Math.sin(a),
    };
  });

  const dataPath =
    bars
      .map((b, i) => {
        const a = angleOf(i);
        const norm = Math.max(0, Math.min(1, (b.strength + 100) / 200));
        const dr = norm * r;
        return `${i === 0 ? "M" : "L"}${(cx + dr * Math.cos(a)).toFixed(1)},${(cy + dr * Math.sin(a)).toFixed(1)}`;
      })
      .join(" ") + " Z";

  const labels = bars.map((b, i) => {
    const a = angleOf(i);
    const lx = cx + (r + 18) * Math.cos(a);
    const ly = cy + (r + 18) * Math.sin(a);
    const ta: "middle" | "start" | "end" =
      Math.abs(Math.cos(a)) < 0.1 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
    const color = b.strength > 5 ? "#22c55e" : b.strength < -5 ? "#ef4444" : "#888";
    return { b, lx, ly, ta, color };
  });

  const zeroPath =
    bars
      .map((_, i) => {
        const a = angleOf(i);
        const dr = 0.5 * r;
        return `${i === 0 ? "M" : "L"}${(cx + dr * Math.cos(a)).toFixed(1)},${(cy + dr * Math.sin(a)).toFixed(1)}`;
      })
      .join(" ") + " Z";

  return (
    <svg
      width={size}
      height={size}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <radialGradient id="radar-fill" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.05} />
        </radialGradient>
      </defs>

      {rings.map((path, i) => (
        <path key={i} d={path} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray={i < 3 ? "3 3" : "none"} />
      ))}
      <path d={zeroPath} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      {axes.map((ax, i) => (
        <line key={i} x1={cx} y1={cy} x2={ax.x2} y2={ax.y2} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      ))}

      <path d={dataPath} fill="url(#radar-fill)" />
      <path d={dataPath} fill="none" stroke="#22D3EE" strokeWidth={1.5} strokeLinejoin="round" />

      {bars.map((b, i) => {
        const a = angleOf(i);
        const norm = Math.max(0, Math.min(1, (b.strength + 100) / 200));
        const dr = norm * r;
        const px = cx + dr * Math.cos(a);
        const py = cy + dr * Math.sin(a);
        const dotColor = b.strength > 5 ? "#22c55e" : b.strength < -5 ? "#ef4444" : "#888";
        return <circle key={i} cx={px} cy={py} r={3} fill={dotColor} />;
      })}
      <circle cx={cx} cy={cy} r={2} fill="rgba(255,255,255,0.3)" />

      {labels.map(({ b, lx, ly, ta, color }, i) => (
        <g key={i}>
          <text x={lx} y={ly + 3} textAnchor={ta} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fill: color, fontWeight: 700, letterSpacing: "0.05em" }}>
            {b.label}
          </text>
          <text x={lx} y={ly + 13} textAnchor={ta} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, fill: color, opacity: 0.8 }}>
            {b.strength > 0 ? "+" : ""}{b.strength}
          </text>
        </g>
      ))}

      <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fill: S.radarCyan, fontWeight: 700, letterSpacing: "0.08em" }}>USD</text>
      <text x={cx} y={cy + 6} textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fill: "rgba(255,255,255,0.3)" }}>STRENGTH</text>
    </svg>
  );
}

interface MacroItem {
  label: string; value: number; display: string;
  trend: "up" | "down" | "flat";
}

export default function UsdExposureRadarWidget({ onRemove }: Props) {
  const [activeView, setActiveView] = useState<"overview" | "pairs" | "strength">("overview");
  const [time, setTime] = useState("");
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dataSource, setDataSource] = useState<"live" | "fallback">("fallback");
  const [liveDxy, setLiveDxy] = useState<{ value: string; trend: "up" | "down" | "flat" } | null>(null);

  useEffect(() => {
    const update = () =>
      setTime(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError(false);
      try {
        const [ratesRes, changeRes, macroRes] = await Promise.all([
          fetch("/api/market/fx/rates"),
          fetch("/api/market/fx/change"),
          fetch("/api/market/macro"),
        ]);
        if (cancelled) return;

        const ratesData  = ratesRes.ok  ? await ratesRes.json()  as { rates?: FxRateEntry[]; source?: string }                        : null;
        const changeData = changeRes.ok ? await changeRes.json() as { changes?: Record<string, number> }                              : null;
        const macroRaw   = macroRes.ok  ? await macroRes.json()  as { macroData?: Record<string, MacroItem>; dataSource?: string }    : null;
        if (cancelled) return;

        const rates   = ratesData?.rates   ?? [];
        const changes = changeData?.changes ?? {};
        const dxy     = macroRaw?.macroData?.["DXY INDEX"];

        const isLive = ratesData?.source === "finnhub" || ratesData?.source === "cache";
        setDataSource(isLive ? "live" : "fallback");

        if (dxy) {
          setLiveDxy({ value: dxy.display, trend: dxy.trend });
        }

        const md: MarketData[] = rates.map((rate: FxRateEntry) => {
          const isInverted  = INVERTED_PAIRS.has(rate.symbol);
          const baseCurrency = isInverted ? rate.symbol.slice(0, 3) : rate.symbol.slice(3);
          const change24h   = changes[rate.symbol] ?? 0;
          const ref         = REF_RATES[baseCurrency] ?? 1;

          // Strength: positive = USD stronger
          const strength = isInverted
            ? ((ref - rate.mid) / ref) * 100      // EUR/USD up = USD weaker → negative
            : ((rate.mid - ref) / ref) * 100;     // USD/MXN up = USD stronger → positive

          return {
            pair:         isInverted ? `${baseCurrency}/USD` : `USD/${baseCurrency}`,
            baseCurrency,
            spot:         rate.mid,
            change24h,
            strength:     Math.round(strength * 10) / 10,
          };
        });

        if (!cancelled) {
          setMarketData(md);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const views = [
    { key: "overview"  as const, label: "USD OVERVIEW" },
    { key: "pairs"     as const, label: "FX MATRIX" },
    { key: "strength"  as const, label: "USD STRENGTH" },
  ];

  const currencyPairs: CurrencyPairRow[] =
    marketData.length > 0
      ? marketData.map((md) => ({
          pair:       md.pair,
          spot:       md.spot.toFixed(md.baseCurrency === "JPY" ? 2 : 4),
          change24h:  md.change24h,
          vol1m:      "N/A",
          forwardPts: "N/A",
          carryBps:   "N/A",
        }))
      : [];

  // Use 7 bars for radar (exclude CNH to keep shape clean)
  const strengthBars: StrengthBar[] =
    marketData.length > 0
      ? marketData
          .filter((md) => md.baseCurrency !== "CNH")
          .slice(0, 7)
          .map((md) => ({
            label:    md.baseCurrency,
            vs:       md.pair,
            strength: Math.round(md.strength),
          }))
      : [];

  const avgStrength =
    strengthBars.length > 0
      ? strengthBars.reduce((s, b) => s + b.strength, 0) / strengthBars.length
      : 0;

  // Build USD metrics with live DXY override
  const usdMetrics: UsdMetric[] = USD_METRICS_STATIC.map((m, i) =>
    i === 0 && liveDxy
      ? { ...m, value: liveDxy.value, trend: liveDxy.trend }
      : m,
  );

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
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderBottom: `1px solid ${S.rim}`,
          background: S.bgDeep, flexShrink: 0, cursor: "grab",
        }}
      >
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }}>⠿</span>
        <div
          style={{
            width: 18, height: 18, borderRadius: "50%",
            background: `linear-gradient(135deg, #22D3EE, #3B82F6)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <DollarSign size={10} color="#fff" strokeWidth={2.5} />
        </div>
        <span
          style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase",
          }}
        >
          USD Exposure Radar
        </span>
        <div style={{ flex: 1 }} />

        {/* DXY live badge */}
        {!loading && liveDxy && (
          <span
            style={{
              fontFamily: S.fontMono, fontSize: 12,
              color: S.green,
              background: `color-mix(in srgb, ${S.green} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.green} 25%, transparent)`,
              borderRadius: 3, padding: "1px 5px",
            }}
          >
            ● LIVE
          </span>
        )}

        {/* Avg USD strength badge */}
        {!loading && strengthBars.length > 0 && (
          <span
            style={{
              fontFamily: S.fontMono, fontSize: 12,
              color: avgStrength >= 0 ? S.green : S.red,
              background: `color-mix(in srgb, ${avgStrength >= 0 ? S.green : S.red} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${avgStrength >= 0 ? S.green : S.red} 25%, transparent)`,
              borderRadius: 3, padding: "1px 5px",
            }}
          >
            USD {avgStrength >= 0 ? "+" : ""}{avgStrength.toFixed(1)}
          </span>
        )}

        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
          {time.slice(11, 16)} UTC
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            title="Remove widget"
            style={{ background: "none", border: "none", cursor: "pointer", color: S.tertiary, display: "flex", alignItems: "center", padding: 2 }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${S.rim}`, flexShrink: 0 }}>
        {views.map((v) => {
          const isActive = activeView === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              style={{
                flex: 1, padding: "6px 10px",
                fontFamily: S.fontMono, fontSize: 12,
                letterSpacing: "0.06em", fontWeight: 700, cursor: "pointer",
                color: isActive ? S.cyan : S.tertiary,
                background: isActive ? `color-mix(in srgb, ${S.cyan} 6%, transparent)` : "transparent",
                borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
                border: "none",
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div style={{ padding: 12 }}>
            <EmptyState type="loading" message="Fetching live FX rates..." />
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <DollarSign size={28} color={S.cyan} style={{ opacity: 0.4 }} />
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, letterSpacing: "0.04em", fontWeight: 600 }}>
              MARKET DATA UNAVAILABLE
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Overview Tab */}
            {activeView === "overview" && (
              <div style={{ padding: 0 }}>
                <div
                  style={{
                    display: "flex", justifyContent: "center", alignItems: "center",
                    padding: "16px 12px 8px", borderBottom: `1px solid ${S.soft}`,
                    background: `linear-gradient(135deg, color-mix(in srgb, #22D3EE 4%, transparent), color-mix(in srgb, #3B82F6 3%, transparent))`,
                  }}
                >
                  <RadarChart bars={strengthBars.length > 0 ? strengthBars : [{ label: "—", vs: "—", strength: 0 }]} size={192} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0 }}>
                  {usdMetrics.map((m, i) => {
                    const TIcon = m.trend === "up" ? TrendingUp : m.trend === "down" ? TrendingDown : Minus;
                    const tColor = m.trend === "up" ? S.green : m.trend === "down" ? S.red : S.tertiary;
                    return (
                      <div
                        key={m.label}
                        style={{
                          padding: "10px 12px",
                          borderRight: i % 2 === 0 ? `1px solid ${S.soft}` : "none",
                          borderBottom: i < 2 ? `1px solid ${S.soft}` : "none",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em" }}>{m.label}</span>
                          <TIcon size={9} color={tColor} />
                        </div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: m.color, lineHeight: 1, marginBottom: 3 }}>
                          {m.value}
                        </div>
                        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.3 }}>
                          {m.subValue}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* FX Matrix Tab */}
            {activeView === "pairs" && (
              <div>
                <div
                  style={{
                    display: "grid", gridTemplateColumns: "80px 70px 58px 50px 55px 55px",
                    padding: "6px 12px", background: S.bgSub, borderBottom: `1px solid ${S.soft}`,
                  }}
                >
                  {["PAIR", "SPOT", "24H %", "1M VOL", "FWD PTS", "CARRY"].map((h) => (
                    <span key={h} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.06em" }}>{h}</span>
                  ))}
                </div>

                {currencyPairs.map((cp, i) => (
                  <div
                    key={cp.pair}
                    style={{
                      display: "grid", gridTemplateColumns: "80px 70px 58px 50px 55px 55px",
                      padding: "7px 12px", alignItems: "center",
                      borderBottom: i < currencyPairs.length - 1 ? `1px solid ${S.soft}` : "none",
                      background: i % 2 === 0 ? "transparent" : S.bgSub,
                    }}
                  >
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan }}>{cp.pair}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{cp.spot}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: cp.change24h >= 0 ? S.green : S.red }}>
                        {cp.change24h >= 0 ? "+" : ""}{cp.change24h.toFixed(2)}%
                      </span>
                      <div style={{ height: 2, width: "100%", background: S.bgDeep, overflow: "hidden", borderRadius: 1 }}>
                        <div style={{ height: "100%", width: `${Math.min(Math.abs(cp.change24h) * 40, 100)}%`, background: cp.change24h >= 0 ? S.green : S.red }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{cp.vol1m}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{cp.forwardPts}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber, fontWeight: 600 }}>{cp.carryBps}</span>
                  </div>
                ))}
              </div>
            )}

            {/* USD Strength Tab */}
            {activeView === "strength" && (
              <div style={{ padding: "12px 14px" }}>
                <div
                  style={{
                    fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
                    letterSpacing: "0.08em", marginBottom: 14,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <span>USD STRENGTH INDEX</span>
                  <span style={{ color: avgStrength >= 0 ? S.green : S.red, fontWeight: 700 }}>
                    AVG {avgStrength >= 0 ? "+" : ""}{avgStrength.toFixed(1)}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {strengthBars.map((sb) => {
                    const normalized = (sb.strength + 100) / 200;
                    const barWidth = Math.abs(normalized - 0.5) * 100;
                    const isPositive = sb.strength > 0;
                    const barColor = isPositive ? S.green : S.red;
                    const intensity = Math.min(Math.abs(sb.strength) / 50, 1);

                    return (
                      <div key={sb.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.secondary, width: 28 }}>{sb.label}</span>
                            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{sb.vs}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {isPositive ? <ArrowUpRight size={10} color={S.green} /> : <ArrowDownRight size={10} color={S.red} />}
                            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: barColor }}>
                              {sb.strength > 0 ? "+" : ""}{sb.strength}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            height: 10, background: S.bgDeep,
                            border: `1px solid ${S.soft}`, borderRadius: 3,
                            overflow: "hidden", position: "relative",
                          }}
                        >
                          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: S.tertiary, opacity: 0.3 }} />
                          <div
                            style={{
                              position: "absolute",
                              left: isPositive ? "50%" : `${50 - barWidth}%`,
                              width: `${barWidth}%`,
                              top: 0, bottom: 0,
                              background: `linear-gradient(${isPositive ? "90deg" : "270deg"}, ${barColor}, color-mix(in srgb, ${barColor} ${40 + intensity * 60}%, transparent))`,
                              borderRadius: 2,
                              transition: "all 400ms ease",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, padding: "6px 0", borderTop: `1px solid ${S.soft}` }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.red, letterSpacing: "0.06em" }}>◀ USD WEAK</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>NEUTRAL</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.green, letterSpacing: "0.06em" }}>USD STRONG ▶</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "5px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
          fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
          display: "flex", justifyContent: "space-between", flexShrink: 0,
        }}
      >
        <span>
          {dataSource === "live" ? "Finnhub · Yahoo Finance live rates" : "Indicative reference data"} · Not investment advice
        </span>
        <span>Auto-refresh: 60s</span>
      </div>
    </div>
  );
}
