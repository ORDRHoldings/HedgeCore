"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { T } from "@/lib/design/tokens";
import { PageShell } from "@/components/layout/PageShell";
import { Icon } from "@/components/ui/Icon";
import { BarChart3, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface FxPair {
  pair: string;
  rate: number;
  change?: number;
}

/* ── Section Box ────────────────────────────────────────────────────────── */
function SectionBox({ title, icon, children }: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: T.bgPanel,
      border: `1px solid ${T.rim}`,
      borderRadius: 4,
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderBottom: `1px solid ${T.rim}`,
        background: T.bgSub,
      }}>
        {icon && <Icon icon={icon} size={14} color={T.tertiary} />}
        <span style={{
          fontFamily: T.fontMono,
          fontSize: 12,
          fontWeight: 600,
          color: T.tertiary,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          {title}
        </span>
      </div>
      <div style={{ padding: 16 }}>
        {children}
      </div>
    </div>
  );
}

/* ── FX Heatmap ─────────────────────────────────────────────────────────── */
function FxHeatmap({ pairs, loading }: { pairs: FxPair[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ height: 56, background: T.soft, borderRadius: 3 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
      {pairs.map(p => {
        const positive = (p.change ?? 0) >= 0;
        const bg = positive ? "rgba(5, 150, 105, 0.08)" : "rgba(220, 38, 38, 0.08)";
        const color = positive ? T.pass : T.fail;
        return (
          <div key={p.pair} style={{
            background: bg,
            border: `1px solid ${T.rim}`,
            borderRadius: 3,
            padding: "8px 10px",
          }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, color: T.primary }}>
              {p.pair}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: T.primary }}>
                {p.rate.toFixed(4)}
              </span>
              {p.change !== undefined && (
                <span style={{ fontFamily: T.fontMono, fontSize: 12, color }}>
                  {positive ? "+" : ""}{(p.change * 100).toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── TradingView Embed ──────────────────────────────────────────────────── */
function TvEmbed({ widgetType, symbols, height = 400 }: {
  widgetType: "mini-chart" | "calendar";
  symbols?: string[];
  height?: number;
}) {
  if (widgetType === "calendar") {
    return (
      <iframe
        title="Economic Calendar"
        src="https://s.tradingview.com/embed-widget/events/?locale=en#%7B%22colorTheme%22%3A%22dark%22%2C%22isTransparent%22%3Atrue%2C%22width%22%3A%22100%25%22%2C%22height%22%3A%22100%25%22%7D"
        style={{ width: "100%", height, border: "none" }}
        sandbox="allow-scripts allow-same-origin"
      />
    );
  }

  const sym = (symbols ?? ["FX:EURUSD"]).join(",");
  return (
    <iframe
      title="TradingView Chart"
      src={`https://s.tradingview.com/embed-widget/symbol-overview/?locale=en#%7B%22symbols%22%3A%22${encodeURIComponent(sym)}%22%2C%22chartOnly%22%3Afalse%2C%22width%22%3A%22100%25%22%2C%22height%22%3A%22100%25%22%2C%22colorTheme%22%3A%22dark%22%2C%22isTransparent%22%3Atrue%2C%22showVolume%22%3Afalse%7D`}
      style={{ width: "100%", height, border: "none" }}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function MarketOverviewPage() {
  const { token } = useAuth();
  const [pairs, setPairs] = useState<FxPair[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRates = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await dashboardFetch("/v1/market-data/status", token);
      if (res.ok) {
        const data = await res.json();
        const spotRates = data?.spot_rates ?? data?.rates ?? {};
        const fxPairs: FxPair[] = Object.entries(spotRates).map(([pair, info]: [string, unknown]) => {
          const rate = typeof info === "number" ? info : (info as Record<string, number>)?.rate ?? 0;
          const change = typeof info === "object" && info !== null ? (info as Record<string, number>)?.daily_change : undefined;
          return { pair, rate, change };
        });
        setPairs(fxPairs.length > 0 ? fxPairs : defaultPairs);
      } else {
        setPairs(defaultPairs);
      }
    } catch {
      setPairs(defaultPairs);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchRates();
    const id = setInterval(fetchRates, 60_000);
    return () => clearInterval(id);
  }, [fetchRates]);

  return (
    <PageShell
      icon={BarChart3}
      title="Market Overview"
      actions={
        <button
          onClick={fetchRates}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: T.fontMono, fontSize: 12, fontWeight: 600,
            color: T.secondary, background: "transparent",
            border: `1px solid ${T.rim}`, borderRadius: 3,
            padding: "6px 12px", cursor: "pointer",
            letterSpacing: "0.06em",
          }}
        >
          <Icon icon={RefreshCw} size={12} color={T.tertiary} />
          REFRESH
        </button>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Row 1 */}
        <SectionBox title="FX Heatmap" icon={BarChart3}>
          <FxHeatmap pairs={pairs} loading={loading} />
        </SectionBox>
        <SectionBox title="Major Indices">
          <TvEmbed widgetType="mini-chart" symbols={["AMEX:SPY", "FTSE:UKX", "XETR:DAX", "TVC:NI225"]} height={280} />
        </SectionBox>

        {/* Row 2 */}
        <SectionBox title="Commodities">
          <TvEmbed widgetType="mini-chart" symbols={["TVC:GOLD", "TVC:USOIL", "TVC:SILVER"]} height={280} />
        </SectionBox>
        <SectionBox title="Economic Calendar">
          <TvEmbed widgetType="calendar" height={280} />
        </SectionBox>
      </div>
    </PageShell>
  );
}

/* ── Fallback data ──────────────────────────────────────────────────────── */
const defaultPairs: FxPair[] = [
  { pair: "EUR/USD", rate: 1.0847, change: 0.0012 },
  { pair: "GBP/USD", rate: 1.2710, change: -0.0008 },
  { pair: "USD/JPY", rate: 149.50, change: 0.0025 },
  { pair: "USD/CHF", rate: 0.8812, change: -0.0004 },
  { pair: "AUD/USD", rate: 0.6543, change: 0.0018 },
  { pair: "NZD/USD", rate: 0.6012, change: 0.0009 },
  { pair: "USD/CAD", rate: 1.3567, change: -0.0015 },
  { pair: "EUR/GBP", rate: 0.8534, change: 0.0006 },
];
