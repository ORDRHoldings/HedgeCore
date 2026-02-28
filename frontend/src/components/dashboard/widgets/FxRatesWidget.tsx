"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, RefreshCw, X } from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import type { FxRateEntry } from "@/lib/market/types";

const S = {
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel:   "var(--bg-panel)",
  bgDeep:    "var(--bg-deep)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber,#F59E0B)",
  green:     "var(--status-pass,#34d399)",
  red:       "var(--accent-red,#f87171)",
} as const;

const PAIR_META: Record<string, { display: string; label: string }> = {
  USDMXN: { display: "USD/MXN", label: "Mexico" },
  EURUSD: { display: "EUR/USD", label: "Eurozone" },
  GBPUSD: { display: "GBP/USD", label: "UK" },
  USDJPY: { display: "USD/JPY", label: "Japan" },
  USDCAD: { display: "USD/CAD", label: "Canada" },
  USDCHF: { display: "USD/CHF", label: "Switzerland" },
  AUDUSD: { display: "AUD/USD", label: "Australia" },
  USDCNH: { display: "USD/CNH", label: "China" },
};

interface RateRow {
  symbol: string;
  display: string;
  label: string;
  mid: number | null;
  prevMid: number | null;
  bid: number | null;
  ask: number | null;
  source: "finnhub" | "cache" | "fallback";
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function FxRatesWidget({ onRemove }: Props) {
  const [rows, setRows] = useState<RateRow[]>([]);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [dataSource, setDataSource] = useState<"finnhub" | "cache" | "fallback" | null>(null);

  const fetchRates = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/market/fx/rates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { rates?: FxRateEntry[]; source?: string };

      const incoming = data.rates ?? [];
      setDataSource((data.source as "finnhub" | "cache" | "fallback") ?? "fallback");

      setRows((prev) =>
        incoming.map((entry) => {
          const prevRow = prev.find((r) => r.symbol === entry.symbol);
          const meta = PAIR_META[entry.symbol] ?? { display: entry.symbol, label: "" };
          return {
            symbol:  entry.symbol,
            display: meta.display,
            label:   meta.label,
            prevMid: prevRow?.mid ?? null,
            mid:     entry.mid,
            bid:     entry.bid,
            ask:     entry.ask,
            source:  (data.source as "finnhub" | "cache" | "fallback") ?? "fallback",
          };
        })
      );
      setLastFetch(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      // Keep existing rows on error
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 60_000);
    return () => clearInterval(interval);
  }, [fetchRates]);

  const isLive = dataSource === "finnhub" || dataSource === "cache";

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
      display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 200,
    }}>
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
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, fontWeight: 700 }}>⊕</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.primary, flex: 1, textTransform: "uppercase" }}>
          FX Rates
        </span>

        {/* Live / Fallback indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: isLive ? S.green : S.amber, flexShrink: 0,
          }} />
          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: isLive ? S.green : S.amber, fontWeight: 700 }}>
            {isLive ? "LIVE" : dataSource === "fallback" ? "BIS FALLBACK" : "—"}
          </span>
          {lastFetch && (
            <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{lastFetch}</span>
          )}
        </div>

        <button
          onClick={fetchRates}
          disabled={fetching}
          title="Refresh rates"
          style={{ background: "transparent", border: "none", cursor: fetching ? "default" : "pointer", padding: 2, display: "flex", alignItems: "center", opacity: fetching ? 0.4 : 1 }}
        >
          <RefreshCw size={11} color={S.tertiary} />
        </button>

        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
            <X size={12} color={S.tertiary} />
          </button>
        )}
      </div>

      {/* Rate table */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {fetching ? "LOADING…" : "NO DATA"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {["Pair", "Region", "Bid", "Mid", "Ask", "Δ"].map((h) => (
                  <th key={h} style={{
                    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                    color: S.tertiary, textTransform: "uppercase", textAlign: "left",
                    padding: "6px 10px", borderBottom: `1px solid ${S.rim}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const change = row.prevMid && row.mid
                  ? ((row.mid - row.prevMid) / row.prevMid) * 100
                  : null;
                const isUp   = change !== null && change > 0;
                const isDown = change !== null && change < 0;

                return (
                  <tr
                    key={row.symbol}
                    style={{
                      borderBottom: `1px solid ${S.soft}`,
                      background: idx % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
                    }}
                  >
                    <td style={{ padding: "7px 10px" }}>
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan }}>
                        {row.display}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <span style={{
                          width: 4, height: 4, borderRadius: "50%",
                          background: row.source === "fallback" ? S.amber : S.green,
                          flexShrink: 0,
                        }} />
                        <span style={{ fontFamily: S.fontMono, fontSize: 8, color: row.source === "fallback" ? S.amber : S.green, fontWeight: 700 }}>
                          {row.source === "fallback" ? "BIS" : "LIVE"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "7px 10px", fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>
                      {row.label}
                    </td>
                    <td style={{ padding: "7px 10px", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                      {row.bid !== null ? row.bid.toFixed(4) : "—"}
                    </td>
                    <td style={{ padding: "7px 10px", fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.primary }}>
                      {row.mid !== null ? row.mid.toFixed(4) : "—"}
                    </td>
                    <td style={{ padding: "7px 10px", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                      {row.ask !== null ? row.ask.toFixed(4) : "—"}
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      {change !== null ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          {isUp   && <TrendingUp   size={10} color={S.green} />}
                          {isDown && <TrendingDown size={10} color={S.red} />}
                          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: isUp ? S.green : isDown ? S.red : S.tertiary }}>
                            {isUp ? "+" : ""}{change.toFixed(3)}%
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 10px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
        fontFamily: S.fontMono, fontSize: 9, color: S.tertiary,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>Finnhub · {dataSource === "fallback" ? "BIS Triennial fallback" : "Live forex rates"}</span>
        <span>Indicative only — not investment advice</span>
      </div>
    </div>
  );
}
