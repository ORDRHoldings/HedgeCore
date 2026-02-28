"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, RefreshCw, X } from "lucide-react";
import type { UserContext } from "@/lib/authContext";

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
  amber:     "var(--accent-amber)",
  green:     "var(--status-pass,#34d399)",
  red:       "var(--accent-red,#f87171)",
} as const;

// BIS-calibrated institutional reference rates (static fallbacks)
const REFERENCE_RATES: { pair: string; base: number; label: string }[] = [
  { pair: "USD/MXN", base: 18.97, label: "Mexico" },
  { pair: "USD/BRL", base:  5.31, label: "Brazil" },
  { pair: "USD/EUR", base:  0.92, label: "Eurozone" },
  { pair: "USD/JPY", base: 149.8, label: "Japan" },
  { pair: "USD/GBP", base:  0.79, label: "UK" },
  { pair: "USD/CAD", base:  1.37, label: "Canada" },
  { pair: "EUR/MXN", base: 20.62, label: "Cross" },
  { pair: "USD/ZAR", base: 18.65, label: "S. Africa" },
];

interface RateRow {
  pair: string;
  label: string;
  rate: number | null;
  prevRate: number | null;
  status: "live" | "calibrated" | "loading";
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function FxRatesWidget({ token, onRemove }: Props) {
  const [rows, setRows] = useState<RateRow[]>(
    REFERENCE_RATES.map((r) => ({
      pair: r.pair,
      label: r.label,
      rate: r.base,
      prevRate: null,
      status: "calibrated",
    }))
  );
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const fetchRates = useCallback(async () => {
    setFetching(true);
    try {
      // Try live spot for primary pairs via market-autofill endpoint
      const res = await fetch(`/api/market-autofill?currency=MXN&buckets=2026-06`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Record<string, unknown>;

      const liveSpot = (data.spot_usdmxn ?? data.spot ?? data.spot_rate) as number | undefined;

      setRows((prev) =>
        prev.map((row) => {
          if (row.pair === "USD/MXN" && liveSpot && liveSpot > 0) {
            return { ...row, prevRate: row.rate, rate: liveSpot, status: "live" };
          }
          return { ...row, status: row.status === "loading" ? "calibrated" : row.status };
        })
      );
      setLastFetch(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      // Keep calibrated rates on error
    } finally {
      setFetching(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 5 * 60 * 1000); // 5-min refresh
    return () => clearInterval(interval);
  }, [fetchRates]);

  return (
    <div style={{
      background:    S.bgPanel,
      border:        `1px solid ${S.rim}`,
      borderRadius:  6,
      display:       "flex",
      flexDirection: "column",
      overflow:      "hidden",
      minHeight:     200,
    }}>
      {/* Header */}
      <div
        className="widget-drag-handle"
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          8,
          padding:      "8px 12px",
          borderBottom: `1px solid ${S.rim}`,
          background:   S.bgDeep,
          flexShrink:   0,
          cursor:       "grab",
        }}
      >
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }}>⠿</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, fontWeight: 700 }}>⊕</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.primary, flex: 1, textTransform: "uppercase" }}>
          FX Rates
        </span>

        <span style={{
          fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "var(--accent-amber,#F59E0B)",
          background: "color-mix(in srgb, var(--accent-amber,#F59E0B) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent-amber,#F59E0B) 30%, transparent)",
          padding: "1px 5px",
          borderRadius: 2,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          SIM DATA
        </span>

        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: rows.some(r => r.status === "live") ? S.green : S.amber,
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: rows.some(r => r.status === "live") ? S.green : S.amber, fontWeight: 700 }}>
            {rows.some(r => r.status === "live") ? "LIVE" : "CALIBRATED"}
          </span>
          {lastFetch && (
            <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
              {lastFetch}
            </span>
          )}
        </div>

        <button
          onClick={fetchRates}
          disabled={fetching}
          title="Refresh rates"
          style={{
            background: "transparent", border: "none", cursor: fetching ? "default" : "pointer",
            padding: 2, display: "flex", alignItems: "center",
            opacity: fetching ? 0.4 : 1,
          }}
        >
          <RefreshCw size={11} color={S.tertiary} />
        </button>

        {onRemove && (
          <button
            onClick={onRemove}
            title="Remove widget"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}
          >
            <X size={12} color={S.tertiary} />
          </button>
        )}
      </div>

      {/* Rate table */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: S.bgSub }}>
              {["Pair", "Region", "Rate", "Change"].map((h) => (
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
              const change = row.prevRate && row.rate
                ? ((row.rate - row.prevRate) / row.prevRate) * 100
                : null;
              const isUp = change !== null && change > 0;
              const isDown = change !== null && change < 0;

              return (
                <tr
                  key={row.pair}
                  style={{
                    borderBottom: `1px solid ${S.soft}`,
                    background: idx % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
                  }}
                >
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan }}>
                      {row.pair}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <span style={{
                        width: 4, height: 4, borderRadius: "50%",
                        background: row.status === "live" ? S.green : S.amber,
                        flexShrink: 0,
                      }} />
                      <span style={{ fontFamily: S.fontMono, fontSize: 8, color: row.status === "live" ? S.green : S.amber, fontWeight: 700 }}>
                        {row.status === "live" ? "LIVE" : "BIS"}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px", fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>
                    {row.label}
                  </td>
                  <td style={{ padding: "8px 10px", fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.primary }}>
                    {row.rate !== null ? row.rate.toFixed(4) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {change !== null ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        {isUp && <TrendingUp size={10} color={S.green} />}
                        {isDown && <TrendingDown size={10} color={S.red} />}
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                          color: isUp ? S.green : isDown ? S.red : S.tertiary,
                        }}>
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
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 10px",
        borderTop: `1px solid ${S.soft}`,
        background: S.bgSub,
        fontFamily: S.fontMono,
        fontSize: 9,
        color: S.tertiary,
        display: "flex",
        justifyContent: "space-between",
      }}>
        <span>BIS Triennial · Alpha Vantage</span>
        <span>Indicative only — not investment advice</span>
      </div>
    </div>
  );
}
