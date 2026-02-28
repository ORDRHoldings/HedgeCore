"use client";

import { useEffect, useState } from "react";
import {
  Globe2,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

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

interface CurrencyIntel {
  currency: string;
  name: string;
  flag: string;
  centralBank: string;
  policyRate: string;
  rateDirection: "hawkish" | "dovish" | "neutral";
  nextMeeting: string;
  inflationYoY: string;
  inflationTrend: "rising" | "falling" | "stable";
  gdpGrowth: string;
  currentAccount: string;
  volatilityIndex: number; // 0-100
  riskScore: number;       // 0-100
  headlines: string[];
}

const INTEL_DB: Record<string, CurrencyIntel> = {
  USD: {
    currency: "USD", name: "US Dollar", flag: "$",
    centralBank: "Federal Reserve", policyRate: "4.50%", rateDirection: "neutral",
    nextMeeting: "2026-03-18", inflationYoY: "2.8%", inflationTrend: "falling",
    gdpGrowth: "2.3%", currentAccount: "-3.1%", volatilityIndex: 12, riskScore: 15,
    headlines: [
      "Fed holds rates steady, signals data-dependent path",
      "USD DXY consolidates near 104 amid mixed payroll data",
      "US Treasury yields stabilize after Q1 volatility",
    ],
  },
  MXN: {
    currency: "MXN", name: "Mexican Peso", flag: "$",
    centralBank: "Banxico", policyRate: "9.50%", rateDirection: "dovish",
    nextMeeting: "2026-03-27", inflationYoY: "4.1%", inflationTrend: "falling",
    gdpGrowth: "1.8%", currentAccount: "-1.2%", volatilityIndex: 28, riskScore: 35,
    headlines: [
      "Banxico signals further easing as inflation moderates",
      "MXN carry trade remains attractive despite rate cuts",
      "Near-shoring flows continue to support peso fundamentals",
    ],
  },
  EUR: {
    currency: "EUR", name: "Euro", flag: "€",
    centralBank: "ECB", policyRate: "3.15%", rateDirection: "dovish",
    nextMeeting: "2026-04-03", inflationYoY: "2.2%", inflationTrend: "stable",
    gdpGrowth: "0.9%", currentAccount: "2.8%", volatilityIndex: 14, riskScore: 20,
    headlines: [
      "ECB maintains accommodative stance amid weak PMI data",
      "EUR/USD range-bound as policy divergence narrows",
      "German industrial output shows tentative recovery signs",
    ],
  },
  GBP: {
    currency: "GBP", name: "British Pound", flag: "£",
    centralBank: "Bank of England", policyRate: "4.25%", rateDirection: "neutral",
    nextMeeting: "2026-03-20", inflationYoY: "2.6%", inflationTrend: "stable",
    gdpGrowth: "1.1%", currentAccount: "-2.9%", volatilityIndex: 16, riskScore: 22,
    headlines: [
      "BoE holds rates as wage growth remains sticky",
      "UK services PMI surprises to the upside at 53.2",
      "Sterling supported by relative yield advantage",
    ],
  },
  JPY: {
    currency: "JPY", name: "Japanese Yen", flag: "¥",
    centralBank: "Bank of Japan", policyRate: "0.50%", rateDirection: "hawkish",
    nextMeeting: "2026-03-14", inflationYoY: "3.0%", inflationTrend: "rising",
    gdpGrowth: "1.2%", currentAccount: "3.5%", volatilityIndex: 22, riskScore: 30,
    headlines: [
      "BoJ signals potential further tightening as inflation persists",
      "JPY intervention risk elevated above 155 level",
      "Japan wage growth accelerates, supporting policy normalization",
    ],
  },
  BRL: {
    currency: "BRL", name: "Brazilian Real", flag: "R$",
    centralBank: "BCB", policyRate: "13.25%", rateDirection: "hawkish",
    nextMeeting: "2026-03-19", inflationYoY: "5.1%", inflationTrend: "rising",
    gdpGrowth: "2.1%", currentAccount: "-2.4%", volatilityIndex: 32, riskScore: 45,
    headlines: [
      "BCB raises Selic to combat persistent inflation pressures",
      "BRL under pressure from fiscal concerns and EM risk aversion",
      "Brazil trade surplus narrows but remains structurally positive",
    ],
  },
  CAD: {
    currency: "CAD", name: "Canadian Dollar", flag: "C$",
    centralBank: "Bank of Canada", policyRate: "3.25%", rateDirection: "neutral",
    nextMeeting: "2026-04-02", inflationYoY: "2.4%", inflationTrend: "stable",
    gdpGrowth: "1.5%", currentAccount: "-1.8%", volatilityIndex: 14, riskScore: 18,
    headlines: [
      "BoC pauses after aggressive easing cycle",
      "CAD finds support from stabilizing oil prices",
      "Canadian housing market shows early signs of recovery",
    ],
  },
  ZAR: {
    currency: "ZAR", name: "South African Rand", flag: "R",
    centralBank: "SARB", policyRate: "7.50%", rateDirection: "neutral",
    nextMeeting: "2026-03-27", inflationYoY: "4.5%", inflationTrend: "stable",
    gdpGrowth: "1.0%", currentAccount: "-2.0%", volatilityIndex: 35, riskScore: 50,
    headlines: [
      "SARB maintains cautious stance amid rand volatility",
      "SA load-shedding risks weigh on growth outlook",
      "Rand finds support from improved commodity terms of trade",
    ],
  },
};

// ─── Live news ────────────────────────────────────────────────────────────────
interface FxNewsItem {
  id: number;
  headline: string;
  source: string;
  url: string;
  datetime: number;
}

const CCY_KEYWORDS: Record<string, string[]> = {
  USD: ["dollar", "federal reserve", "fed ", " fed,", "treasury", "fomc", "usd"],
  MXN: ["peso", "mexico", "mxn", "banxico"],
  EUR: ["euro", "ecb", "european central", "eurozone", "eur/", "/eur"],
  GBP: ["pound", "sterling", "bank of england", "gbp", "boe"],
  JPY: ["yen", "japan", "boj", "bank of japan", "jpy"],
  BRL: ["real", "brazil", "bcb", "brl", "selic"],
  CAD: ["canada", "loonie", "cad", "bank of canada"],
  ZAR: ["rand", "south africa", "sarb", "zar"],
};

function getNewsForCurrency(ccy: string, news: FxNewsItem[]): FxNewsItem[] {
  const keys = CCY_KEYWORDS[ccy] ?? [ccy.toLowerCase()];
  return news
    .filter((a) => {
      const text = a.headline.toLowerCase();
      return keys.some((k) => text.includes(k));
    })
    .slice(0, 3);
}

function relativeTime(datetime: number): string {
  const diffMs   = Date.now() - datetime * 1_000;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1)  return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const h = Math.floor(diffMins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function riskLabel(score: number): { text: string; color: string } {
  if (score <= 20) return { text: "LOW", color: S.green };
  if (score <= 40) return { text: "MODERATE", color: S.cyan };
  if (score <= 60) return { text: "ELEVATED", color: S.amber };
  return { text: "HIGH", color: S.red };
}

function volLabel(vol: number): { text: string; color: string } {
  if (vol <= 15) return { text: "LOW", color: S.green };
  if (vol <= 25) return { text: "NORMAL", color: S.cyan };
  if (vol <= 35) return { text: "ELEVATED", color: S.amber };
  return { text: "HIGH", color: S.red };
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

/* ─── Arc gauge ─────────────────────────────────────────────────────────── */
function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPathStr(
  cx: number, cy: number, r: number, startDeg: number, endDeg: number,
): string {
  const s = polarToXY(cx, cy, r, startDeg);
  const e = polarToXY(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function ScoreArc({
  score,
  color,
  label,
  maxScore = 100,
  size = 90,
}: {
  score: number;
  color: string;
  label: string;
  maxScore?: number;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size * 0.6;
  const r = size * 0.37;
  const sw = size * 0.085;
  const START = 150;
  const SWEEP = 240;
  const pct = Math.min(score / maxScore, 1);
  const bgPath = arcPathStr(cx, cy, r, START, START + SWEEP);
  const fgPath = pct > 0.01 ? arcPathStr(cx, cy, r, START, START + pct * SWEEP) : "";

  return (
    <svg width={size} height={size * 0.75} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <filter id={`arc-glow-${label}`}>
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Track */}
      <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw} strokeLinecap="round" />
      {/* Score arc */}
      {fgPath && (
        <path
          d={fgPath}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          filter={`url(#arc-glow-${label})`}
        />
      )}
      {/* Value */}
      <text
        x={cx} y={cy - 1}
        textAnchor="middle"
        style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: size * 0.24, fontWeight: 700, fill: color }}
      >
        {score}
      </text>
      <text
        x={cx} y={cy + size * 0.16}
        textAnchor="middle"
        style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: size * 0.085, fill: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}
      >
        {label}
      </text>
    </svg>
  );
}

/* ─── Cross-currency comparison mini-bars ──────────────────────────────── */
function CompareBar({
  label, score, maxScore = 100, color, active,
}: {
  label: string;
  score: number;
  maxScore?: number;
  color: string;
  active: boolean;
}) {
  const pct = (score / maxScore) * 100;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: active ? 1 : 0.55,
      }}
    >
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: 9,
          fontWeight: 700,
          color: active ? color : S.tertiary,
          width: 28,
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: S.bgDeep,
          border: `1px solid ${S.soft}`,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: active
              ? `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 60%, transparent))`
              : color,
            borderRadius: 3,
            transition: "width 500ms ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: 8,
          color: active ? color : S.tertiary,
          fontWeight: active ? 700 : 400,
          width: 22,
          textAlign: "right",
        }}
      >
        {score}
      </span>
    </div>
  );
}

export default function CurrencyIntelWidget({ token, user, onRemove }: Props) {
  const [exposureCurrencies, setExposureCurrencies] = useState<string[]>([]);
  const [selectedCcy, setSelectedCcy] = useState<string>("USD");
  const [loading, setLoading] = useState(true);
  const [showCompare, setShowCompare] = useState(false);
  const [liveNews, setLiveNews]     = useState<FxNewsItem[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await dashboardFetch("/v1/positions/exposure", token);
        if (res.ok) {
          const data = await res.json();
          const currencies: string[] = (data.exposures ?? data ?? [])
            .map((e: { currency: string }) => e.currency)
            .filter(Boolean);
          if (!cancelled && currencies.length > 0) {
            setExposureCurrencies(currencies);
            setSelectedCcy(currencies[0]);
          }
        }
      } catch {
        // Fall back to USD
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    async function fetchNews() {
      try {
        const res = await fetch("/api/market/news/fx");
        if (!res.ok) return;
        const data = await res.json() as { articles?: FxNewsItem[] };
        if (cancelled) return;
        setLiveNews(data.articles ?? []);
        setNewsLoaded(true);
      } catch {
        // keep static headlines on error
      }
    }
    fetchNews();
    const id = setInterval(fetchNews, 300_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const tabs = exposureCurrencies.length > 0 ? exposureCurrencies : ["USD"];
  const intel = INTEL_DB[selectedCcy] ?? INTEL_DB.USD!;
  const risk = riskLabel(intel.riskScore);
  const vol = volLabel(intel.volatilityIndex);

  const dirIcon =
    intel.rateDirection === "hawkish" ? (
      <TrendingUp size={9} color={S.red} />
    ) : intel.rateDirection === "dovish" ? (
      <TrendingDown size={9} color={S.green} />
    ) : (
      <Minus size={9} color={S.tertiary} />
    );

  const infIcon =
    intel.inflationTrend === "rising" ? (
      <TrendingUp size={9} color={S.red} />
    ) : intel.inflationTrend === "falling" ? (
      <TrendingDown size={9} color={S.green} />
    ) : (
      <Minus size={9} color={S.tertiary} />
    );

  // All currencies for comparison
  const allCcys = Object.keys(INTEL_DB);

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
        <Globe2 size={13} color={S.cyan} style={{ flexShrink: 0 }} />
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
          Currency Intelligence
        </span>

        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 8,
            letterSpacing: "0.1em",
            color: newsLoaded ? S.green : S.tertiary,
            background: `color-mix(in srgb, ${newsLoaded ? S.green : S.tertiary} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${newsLoaded ? S.green : S.tertiary} 30%, transparent)`,
            borderRadius: 3,
            padding: "1px 5px",
            textTransform: "uppercase",
          }}
        >
          {newsLoaded ? "● FINNHUB" : "○ REFERENCE"}
        </span>


        <div style={{ flex: 1 }} />

        {/* Compare toggle */}
        <button
          onClick={() => setShowCompare((p) => !p)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 8,
            letterSpacing: "0.08em",
            color: showCompare ? S.cyan : S.tertiary,
            background: showCompare
              ? `color-mix(in srgb, ${S.cyan} 10%, transparent)`
              : "transparent",
            border: `1px solid ${showCompare ? `color-mix(in srgb, ${S.cyan} 30%, transparent)` : S.soft}`,
            borderRadius: 3,
            padding: "2px 7px",
            cursor: "pointer",
          }}
        >
          {showCompare ? "DETAIL" : "COMPARE"}
        </button>

        {exposureCurrencies.length === 0 && !loading && (
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              color: S.amber,
              letterSpacing: "0.06em",
            }}
          >
            DEFAULT: USD
          </span>
        )}

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

      {/* Currency tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: `1px solid ${S.rim}`,
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {tabs.map((ccy) => {
          const isActive = ccy === selectedCcy;
          const ccyIntel = INTEL_DB[ccy];
          const ccyRisk = ccyIntel ? riskLabel(ccyIntel.riskScore) : null;
          return (
            <button
              key={ccy}
              onClick={() => setSelectedCcy(ccy)}
              style={{
                padding: "6px 14px",
                fontFamily: S.fontMono,
                fontSize: 10,
                letterSpacing: "0.08em",
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
                gap: 6,
              }}
            >
              {ccy}
              {ccyRisk && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: ccyRisk.color,
                    display: "inline-block",
                    boxShadow: isActive ? `0 0 4px ${ccyRisk.color}` : "none",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>

        {/* ── COMPARE VIEW ─────────────────────────────────────────────── */}
        {showCompare && (
          <div style={{ padding: "12px 14px" }}>
            {/* Risk score comparison */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 8,
                  color: S.tertiary,
                  letterSpacing: "0.1em",
                  marginBottom: 10,
                }}
              >
                RISK SCORE COMPARISON
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {allCcys.map((ccy) => {
                  const c = INTEL_DB[ccy]!;
                  const r = riskLabel(c.riskScore);
                  return (
                    <CompareBar
                      key={ccy}
                      label={ccy}
                      score={c.riskScore}
                      color={r.color}
                      active={ccy === selectedCcy}
                    />
                  );
                })}
              </div>
            </div>

            {/* Volatility comparison */}
            <div
              style={{
                paddingTop: 12,
                borderTop: `1px solid ${S.soft}`,
              }}
            >
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 8,
                  color: S.tertiary,
                  letterSpacing: "0.1em",
                  marginBottom: 10,
                }}
              >
                IMPLIED VOLATILITY INDEX
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {allCcys.map((ccy) => {
                  const c = INTEL_DB[ccy]!;
                  const v = volLabel(c.volatilityIndex);
                  return (
                    <CompareBar
                      key={ccy}
                      label={ccy}
                      score={c.volatilityIndex}
                      color={v.color}
                      active={ccy === selectedCcy}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── DETAIL VIEW ──────────────────────────────────────────────── */}
        {!showCompare && (
          <div style={{ padding: "10px 12px" }}>

            {/* Risk + Vol gauges row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 12,
                padding: "10px",
                background: `linear-gradient(135deg,
                  color-mix(in srgb, ${risk.color} 6%, transparent),
                  color-mix(in srgb, ${vol.color} 4%, transparent))`,
                border: `1px solid ${S.soft}`,
                borderRadius: 6,
              }}
            >
              {/* Risk score arc */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <ScoreArc
                  score={intel.riskScore}
                  color={risk.color}
                  label="RISK"
                  size={88}
                />
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 9,
                    fontWeight: 700,
                    color: risk.color,
                    letterSpacing: "0.08em",
                    background: `color-mix(in srgb, ${risk.color} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${risk.color} 25%, transparent)`,
                    borderRadius: 3,
                    padding: "2px 8px",
                  }}
                >
                  {risk.text}
                </span>
              </div>

              {/* Volatility arc */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <ScoreArc
                  score={intel.volatilityIndex}
                  color={vol.color}
                  label="VOL"
                  size={88}
                />
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 9,
                    fontWeight: 700,
                    color: vol.color,
                    letterSpacing: "0.08em",
                    background: `color-mix(in srgb, ${vol.color} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${vol.color} 25%, transparent)`,
                    borderRadius: 3,
                    padding: "2px 8px",
                  }}
                >
                  {vol.text}
                </span>
              </div>
            </div>

            {/* Currency name + direction */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
                padding: "6px 10px",
                background: S.bgSub,
                border: `1px solid ${S.soft}`,
                borderRadius: 4,
              }}
            >
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 22,
                  fontWeight: 700,
                  color: S.cyan,
                  lineHeight: 1,
                }}
              >
                {intel.currency}
              </span>
              <div>
                <div
                  style={{
                    fontFamily: S.fontUI,
                    fontSize: 12,
                    fontWeight: 600,
                    color: S.primary,
                  }}
                >
                  {intel.name}
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 9,
                    color: S.tertiary,
                    marginTop: 1,
                  }}
                >
                  {intel.centralBank} · Next: {intel.nextMeeting.slice(5)}
                </div>
              </div>
              <div style={{ flex: 1 }} />
              {/* Rate direction badge */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    fontWeight: 700,
                    color: S.primary,
                  }}
                >
                  {intel.policyRate}
                </span>
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 8,
                    fontWeight: 700,
                    color:
                      intel.rateDirection === "hawkish"
                        ? S.red
                        : intel.rateDirection === "dovish"
                        ? S.green
                        : S.amber,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {intel.rateDirection === "hawkish"
                    ? "▲ HAWKISH"
                    : intel.rateDirection === "dovish"
                    ? "▼ DOVISH"
                    : "● NEUTRAL"}
                </span>
              </div>
            </div>

            {/* Macro grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                border: `1px solid ${S.soft}`,
                borderRadius: 4,
                overflow: "hidden",
                marginBottom: 10,
              }}
            >
              {[
                {
                  label: "POLICY RATE",
                  value: intel.policyRate,
                  icon: dirIcon,
                  sub: intel.rateDirection.toUpperCase(),
                },
                {
                  label: "CPI YOY",
                  value: intel.inflationYoY,
                  icon: infIcon,
                  sub: intel.inflationTrend.toUpperCase(),
                },
                {
                  label: "GDP GROWTH",
                  value: intel.gdpGrowth,
                  icon: null,
                  sub: "ANNUAL",
                },
              ].map(({ label, value, icon, sub }, i) => (
                <div
                  key={label}
                  style={{
                    padding: "8px 10px",
                    textAlign: "center",
                    borderRight: i < 2 ? `1px solid ${S.soft}` : "none",
                    background: i === 0 ? S.bgSub : "transparent",
                  }}
                >
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 7.5,
                      color: S.tertiary,
                      letterSpacing: "0.1em",
                      marginBottom: 3,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 14,
                      fontWeight: 700,
                      color: S.primary,
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 3,
                      marginTop: 4,
                    }}
                  >
                    {icon}
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 7.5,
                        color: S.tertiary,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {sub}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Current account */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                background: S.bgSub,
                border: `1px solid ${S.soft}`,
                borderRadius: 4,
                marginBottom: 10,
              }}
            >
              <span
                style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.08em" }}
              >
                CURRENT ACCOUNT
              </span>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 13,
                  fontWeight: 700,
                  color: intel.currentAccount.startsWith("-") ? S.red : S.green,
                }}
              >
                {intel.currentAccount}
              </span>
              <span style={{ fontFamily: S.fontUI, fontSize: 9, color: S.tertiary }}>
                % of GDP
              </span>
            </div>

            {/* Headlines */}
            <div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 8,
                  color: S.tertiary,
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                MACRO HEADLINES
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 7,
                    color: newsLoaded ? S.green : S.amber,
                    letterSpacing: "0.08em",
                  }}
                >
                  {newsLoaded ? "FINNHUB LIVE" : "REFERENCE DATA"}
                </span>
              </div>
              {(() => {
                const articles = newsLoaded ? getNewsForCurrency(selectedCcy, liveNews) : [];
                const headlines = articles.length > 0 ? null : intel.headlines;
                return headlines
                  ? headlines.map((h, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "5px 8px",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          borderBottom: i < headlines.length - 1 ? `1px solid ${S.soft}` : "none",
                        }}
                      >
                        <ArrowRight size={8} color={S.cyan} style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.4 }}>
                          {h}
                        </span>
                      </div>
                    ))
                  : articles.map((a, i) => (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "block", textDecoration: "none", color: "inherit" }}
                      >
                        <div
                          style={{
                            padding: "5px 8px",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 6,
                            borderBottom: i < articles.length - 1 ? `1px solid ${S.soft}` : "none",
                            transition: "background 120ms ease",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${S.cyan} 4%, transparent)`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                              <span style={{ fontFamily: S.fontMono, fontSize: 7.5, color: S.cyan, fontWeight: 700, letterSpacing: "0.05em" }}>
                                {a.source}
                              </span>
                              <span style={{ fontFamily: S.fontMono, fontSize: 7.5, color: S.tertiary }}>
                                · {relativeTime(a.datetime)}
                              </span>
                              <ExternalLink size={7} color={S.tertiary} style={{ marginLeft: "auto" }} />
                            </div>
                            <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.4 }}>
                              {a.headline}
                            </span>
                          </div>
                        </div>
                      </a>
                    ));
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "5px 12px",
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
        <span>Source: Institutional macro data · {newsLoaded ? "Finnhub live news" : "Reference headlines"}</span>
        <span>Informational only</span>
      </div>
    </div>
  );
}
