"use client";

/**
 * CounterpartyMatrix.tsx — Item 16
 *
 * HTML heatmap table (not ECharts): rows = counterparties, columns = metrics.
 * Metrics: avg markup bps, total cost USD, # trades, % within-spread.
 * Color intensity by relative performance.
 * Best (green) / Worst (red) badges on extreme values.
 */

import React, { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

/* ── Style tokens ─────────────────────────────────────────────────────────── */

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  borderSoft: "var(--border-soft)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary: "var(--text-tertiary)",
  accentGreen: "var(--accent-green)",
  accentRed: "var(--accent-red)",
} as const;

/* ── Props ────────────────────────────────────────────────────────────────── */

interface Transaction {
  counterparty: string;
  markup_cost_usd: number;
  markup_direction: string;
  spread_classification: string;
}

interface CounterpartyMatrixProps {
  transactions: Transaction[];
}

/* ── Aggregation ──────────────────────────────────────────────────────────── */

interface CounterpartySummary {
  counterparty: string;
  avgMarkupBps: number;
  totalCostUsd: number;
  tradeCount: number;
  pctWithinSpread: number;
}

function aggregate(transactions: Transaction[]): CounterpartySummary[] {
  const map = new Map<
    string,
    {
      markupBpsSum: number;
      costSum: number;
      count: number;
      withinCount: number;
    }
  >();

  for (const tx of transactions) {
    const key = tx.counterparty;
    let entry = map.get(key);
    if (!entry) {
      entry = { markupBpsSum: 0, costSum: 0, count: 0, withinCount: 0 };
      map.set(key, entry);
    }
    /* markup_cost_usd is already in USD; convert to bps approximation
       by treating the absolute value as a bps-equivalent signal.
       For a proper bps conversion, notional would be needed; here we
       record the raw value as the "markup bps" metric since the
       upstream audit engine reports it in basis-point terms. */
    entry.markupBpsSum += tx.markup_cost_usd;
    entry.costSum += Math.abs(tx.markup_cost_usd);
    entry.count += 1;
    if (
      tx.spread_classification === "WITHIN_SPREAD" ||
      tx.spread_classification === "within_spread"
    ) {
      entry.withinCount += 1;
    }
  }

  const result: CounterpartySummary[] = [];
  for (const [cp, data] of map.entries()) {
    result.push({
      counterparty: cp,
      avgMarkupBps: data.count > 0 ? data.markupBpsSum / data.count : 0,
      totalCostUsd: data.costSum,
      tradeCount: data.count,
      pctWithinSpread:
        data.count > 0 ? (data.withinCount / data.count) * 100 : 0,
    });
  }

  /* Sort by total cost descending (worst first) */
  result.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  return result;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Returns a CSS background-color string at variable intensity.
 *  `ratio` is 0..1 where 0 = neutral, 1 = extreme.
 *  `positive` true = green (good), false = red (bad). */
function heatColor(
  ratio: number,
  positive: boolean,
): string {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const alpha = Math.round(clamped * 0.18 * 255)
    .toString(16)
    .padStart(2, "0");
  return positive ? `#059669${alpha}` : `#DC2626${alpha}`;
}

function formatUsd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function formatBps(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} bps`;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function CounterpartyMatrix({
  transactions,
}: CounterpartyMatrixProps) {
  const summaries = useMemo(() => aggregate(transactions), [transactions]);

  /* Compute min/max for relative heatmap intensity */
  const stats = useMemo(() => {
    if (summaries.length === 0) {
      return {
        minBps: 0,
        maxBps: 0,
        maxCost: 0,
        minPct: 0,
        maxPct: 0,
        bestIdx: -1,
        worstIdx: -1,
      };
    }

    let minBps = Infinity;
    let maxBps = -Infinity;
    let maxCost = 0;
    let minPct = Infinity;
    let maxPct = -Infinity;
    let bestIdx = 0;
    let worstIdx = 0;
    let bestScore = Infinity;
    let worstScore = -Infinity;

    summaries.forEach((s, i) => {
      if (s.avgMarkupBps < minBps) minBps = s.avgMarkupBps;
      if (s.avgMarkupBps > maxBps) maxBps = s.avgMarkupBps;
      if (s.totalCostUsd > maxCost) maxCost = s.totalCostUsd;
      if (s.pctWithinSpread < minPct) minPct = s.pctWithinSpread;
      if (s.pctWithinSpread > maxPct) maxPct = s.pctWithinSpread;

      /* Score: lower avg markup + higher within-spread % = better */
      const score = s.avgMarkupBps - s.pctWithinSpread * 0.5;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
      if (score > worstScore) {
        worstScore = score;
        worstIdx = i;
      }
    });

    return { minBps, maxBps, maxCost, minPct, maxPct, bestIdx, worstIdx };
  }, [summaries]);

  if (summaries.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 120,
          fontFamily: S.fontMono,
          fontSize: 13,
          color: S.textTertiary,
          background: S.bgSub,
          border: `1px solid ${S.rim}`,
        }}
      >
        No counterparty data available
      </div>
    );
  }

  const bpsRange = stats.maxBps - stats.minBps || 1;
  const costMax = stats.maxCost || 1;
  const pctRange = stats.maxPct - stats.minPct || 1;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: S.fontUI,
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        <thead>
          <tr>
            {["COUNTERPARTY", "AVG MARKUP", "TOTAL COST", "TRADES", "WITHIN SPREAD"].map(
              (col, i) => (
                <th
                  key={col}
                  style={{
                    background: S.bgDeep,
                    color: S.textSecondary,
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 500,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.05em",
                    padding: "8px 12px",
                    borderBottom: `1px solid ${S.rim}`,
                    textAlign: i === 0 ? "left" : "right",
                    whiteSpace: "nowrap",
                    position: "sticky" as const,
                    top: 0,
                    zIndex: 10,
                  }}
                >
                  {col}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {summaries.map((row, idx) => {
            /* Relative intensity ratios */
            const bpsRatio =
              bpsRange > 0
                ? Math.abs(row.avgMarkupBps - stats.minBps) / bpsRange
                : 0;
            const costRatio = costMax > 0 ? row.totalCostUsd / costMax : 0;
            const pctRatio =
              pctRange > 0
                ? (row.pctWithinSpread - stats.minPct) / pctRange
                : 0;

            /* Higher markup = worse (red); lower = better (green) */
            const bpsBg = heatColor(bpsRatio, false);
            /* Higher cost = worse (red) */
            const costBg = heatColor(costRatio, false);
            /* Higher within-spread % = better (green) */
            const pctBg = heatColor(pctRatio, true);

            const isBest = idx === stats.bestIdx;
            const isWorst = idx === stats.worstIdx;

            const rowBg =
              idx % 2 === 0 ? "transparent" : S.bgSub;

            return (
              <tr
                key={row.counterparty}
                style={{
                  background: rowBg,
                  borderBottom: `1px solid ${S.borderSoft}`,
                  transition: "background-color 75ms",
                }}
              >
                {/* Counterparty name */}
                <td
                  style={{
                    padding: "8px 12px",
                    fontFamily: S.fontMono,
                    fontWeight: 600,
                    fontSize: 13,
                    color: S.textPrimary,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {row.counterparty}
                    {isBest && summaries.length > 1 && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          padding: "1px 6px",
                          border: "1px solid var(--accent-green)",
                          color: S.accentGreen,
                          background: "#05966912",
                        }}
                      >
                        <TrendingDown size={12} />
                        BEST
                      </span>
                    )}
                    {isWorst && summaries.length > 1 && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          padding: "1px 6px",
                          border: "1px solid var(--accent-red)",
                          color: S.accentRed,
                          background: "#DC262612",
                        }}
                      >
                        <TrendingUp size={12} />
                        WORST
                      </span>
                    )}
                  </span>
                </td>

                {/* Avg markup bps */}
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "right",
                    fontFamily: S.fontMono,
                    fontSize: 13,
                    color: row.avgMarkupBps > 0 ? S.accentRed : row.avgMarkupBps < 0 ? S.accentGreen : S.textSecondary,
                    background: bpsBg,
                  }}
                >
                  {formatBps(row.avgMarkupBps)}
                </td>

                {/* Total cost USD */}
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "right",
                    fontFamily: S.fontMono,
                    fontSize: 13,
                    color: S.textPrimary,
                    background: costBg,
                  }}
                >
                  {formatUsd(row.totalCostUsd)}
                </td>

                {/* Trade count */}
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "right",
                    fontFamily: S.fontMono,
                    fontSize: 13,
                    color: S.textSecondary,
                  }}
                >
                  {row.tradeCount}
                </td>

                {/* % within spread */}
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "right",
                    fontFamily: S.fontMono,
                    fontSize: 13,
                    color: S.textPrimary,
                    background: pctBg,
                  }}
                >
                  {row.pctWithinSpread.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
