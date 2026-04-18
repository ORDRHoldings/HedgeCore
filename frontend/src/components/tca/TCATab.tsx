"use client";

/**
 * TCATab — reusable component that displays TCA breakdown for a calc run.
 *
 * Fetches /v1/tca/calc-runs/{runId}. On 404 (pre-TCA runs) shows a
 * placeholder instead of blocking the tab. Otherwise renders:
 *   - Total cost + all-in bps headline
 *   - Horizontal component bar chart (slippage, commission, fees, vol drift)
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { getCalcRunTCA, type TCAEstimate } from "@/lib/api/tcaClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  rim: "var(--border-rim)",
  textPri: "var(--text-primary)",
  textSec: "var(--text-secondary)",
} as const;

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export function TCATab({ runId }: { runId: string }) {
  const { token } = useAuth();
  const [tca, setTca] = useState<TCAEstimate | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setError(null);
    setNotFound(false);
    setTca(null);
    getCalcRunTCA(token, runId)
      .then((r) => {
        if (r === null) setNotFound(true);
        else setTca(r);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "failed to load TCA");
      });
  }, [token, runId]);

  if (notFound) {
    return (
      <p style={{ color: S.textSec, fontFamily: S.fontUI, padding: 20 }}>
        No TCA data for this run (predates TCA feature).
      </p>
    );
  }
  if (error) {
    return (
      <p style={{ color: "var(--accent-red)", fontFamily: S.fontUI, padding: 20 }}>
        {error}
      </p>
    );
  }
  if (!tca) {
    return (
      <p style={{ color: S.textSec, fontFamily: S.fontUI, padding: 20 }}>Loading…</p>
    );
  }

  const b = tca.breakdown;
  const components = [
    { label: "Slippage", val: b.slippage_cost, color: "var(--accent-cyan)" },
    { label: "Commission", val: b.broker_commission, color: "var(--accent-amber)" },
    { label: "Exch fee", val: b.exchange_fee, color: "var(--text-secondary)" },
    { label: "Clearing", val: b.clearing_fee, color: "var(--text-secondary)" },
    {
      label: "Vol drift",
      val: b.vol_drift_adjustment,
      color: "var(--accent-purple, #a78bfa)",
    },
  ];
  const max = Math.max(...components.map((c) => c.val), 1);
  const totalForPct = b.total_cost > 0 ? b.total_cost : 1;

  return (
    <div style={{ background: S.bgPanel, padding: 20 }}>
      <div style={{ display: "flex", gap: 32, marginBottom: 20 }}>
        <div>
          <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 11 }}>
            TOTAL COST
          </p>
          <p style={{ color: S.textPri, fontFamily: S.fontMono, fontSize: 20 }}>
            {fmtUsd(b.total_cost)}
          </p>
        </div>
        <div>
          <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 11 }}>ALL-IN</p>
          <p style={{ color: S.textPri, fontFamily: S.fontMono, fontSize: 20 }}>
            {b.total_cost_bps.toFixed(2)} bps
          </p>
        </div>
      </div>
      <div>
        {components.map((c) => (
          <div
            key={c.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                width: 100,
                color: S.textSec,
                fontFamily: S.fontUI,
                fontSize: 12,
              }}
            >
              {c.label}
            </span>
            <div
              style={{
                flex: 1,
                height: 20,
                background: S.bgDeep,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${(c.val / max) * 100}%`,
                  height: "100%",
                  background: c.color,
                }}
              />
            </div>
            <span
              style={{
                width: 80,
                textAlign: "right",
                color: S.textPri,
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            >
              {fmtUsd(c.val)}
            </span>
            <span
              style={{
                width: 48,
                textAlign: "right",
                color: S.textSec,
                fontFamily: S.fontMono,
                fontSize: 11,
              }}
            >
              {((c.val / totalForPct) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TCATab;
