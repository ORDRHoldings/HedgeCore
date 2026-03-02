"use client";

/**
 * SmbRateCard — USD/MXN live rate display for SMB dashboard.
 */
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel: "var(--bg-panel)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  pass: "var(--status-pass)",
  fail: "var(--accent-red,#B91C1C)",
} as const;

interface Props {
  token: string;
}

interface RateData {
  mid: number;
  bid: number;
  ask: number;
  change_pct: number;
}

export default function SmbRateCard({ token }: Props) {
  const [rate, setRate] = useState<RateData | null>(null);
  const [lastFetch, setLastFetch] = useState<string>("");

  useEffect(() => {
    const fetch_ = () => {
      dashboardFetch("/api/market/fx/rates", token)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          // Find USD/MXN in the response (array or object)
          const rates = Array.isArray(d) ? d : d.rates ?? [];
          const mxn = rates.find(
            (r: { symbol?: string; pair?: string }) =>
              r.symbol === "USDMXN" || r.pair === "USD/MXN" || r.symbol === "USD/MXN"
          );
          if (mxn) {
            setRate({
              mid: mxn.mid ?? mxn.rate ?? mxn.price ?? 0,
              bid: mxn.bid ?? 0,
              ask: mxn.ask ?? 0,
              change_pct: mxn.change_pct ?? mxn.change ?? 0,
            });
          }
          setLastFetch(new Date().toLocaleTimeString());
        })
        .catch(() => {});
    };

    fetch_();
    const iv = setInterval(fetch_, 60_000);
    return () => clearInterval(iv);
  }, [token]);

  const isUp = (rate?.change_pct ?? 0) >= 0;

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 2,
        padding: "20px 24px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Activity size={14} color={S.cyan} />
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: S.tertiary,
            textTransform: "uppercase",
          }}
        >
          USD / MXN
        </span>
        <span style={{ flex: 1 }} />
        {lastFetch && (
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {lastFetch}
          </span>
        )}
      </div>

      {/* Main rate */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 32,
            fontWeight: 700,
            color: S.primary,
            lineHeight: 1,
          }}
        >
          {rate ? rate.mid.toFixed(4) : "—"}
        </span>
        {rate && (
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 13,
              fontWeight: 600,
              color: isUp ? S.fail : S.pass,
            }}
          >
            {isUp ? "▲" : "▼"} {Math.abs(rate.change_pct).toFixed(2)}%
          </span>
        )}
      </div>

      {/* Bid / Ask */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          borderTop: `1px solid ${S.soft}`,
          paddingTop: 12,
        }}
      >
        {[
          { label: "BID", value: rate?.bid },
          { label: "ASK", value: rate?.ask },
          { label: "SPREAD", value: rate ? (rate.ask - rate.bid) * 10000 : null, fmt: (v: number) => `${v.toFixed(1)} pips` },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: S.tertiary,
              }}
            >
              {item.label}
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 500, color: S.primary }}>
              {item.value != null
                ? "fmt" in item && item.fmt
                  ? item.fmt(item.value)
                  : item.value.toFixed(4)
                : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
