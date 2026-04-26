"use client";

import type { BucketResult } from "../../../api/types";
import { fmtPct } from "../../../utils/formatters";

// ── RPT-03: Hedge Accounting Panel (ASC 815 / IAS 39) ─────────────────────────

interface HedgeAccountingPanelProps {
  buckets: BucketResult[];
}

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  red: "var(--accent-red)",
  green: "var(--status-pass)",
} as const;

// ASC 815 / IAS 39: Highly Effective corridor is 0.80 – 1.25
const EFFECTIVENESS_LOW = 0.80;
const EFFECTIVENESS_HIGH = 1.25;

type EffectivenessStatus = "EFFECTIVE" | "NEEDS_REVIEW" | "SUPPRESSED";

interface BucketEffectivenessRow {
  bucket: string;
  hedgeRatio: number;
  status: EffectivenessStatus;
}

function computeHedgeRatio(bucket: BucketResult): number {
  const exposure = Math.abs(bucket.commercial_exposure_mxn);
  const hedged = Math.abs(bucket.hedge_position_mxn);
  if (exposure === 0) return hedged === 0 ? 1.0 : 0;
  return hedged / exposure;
}

function assessEffectiveness(ratio: number): EffectivenessStatus {
  if (ratio >= EFFECTIVENESS_LOW && ratio <= EFFECTIVENESS_HIGH) return "EFFECTIVE";
  return "NEEDS_REVIEW";
}

function statusColor(status: EffectivenessStatus): string {
  if (status === "EFFECTIVE") return "var(--status-pass)";
  if (status === "NEEDS_REVIEW") return "var(--accent-amber)";
  return "var(--text-tertiary)";
}

function statusBadge(status: EffectivenessStatus): string {
  if (status === "EFFECTIVE") return "EFFECTIVE";
  if (status === "NEEDS_REVIEW") return "NEEDS REVIEW";
  return "SUPPRESSED";
}

export default function HedgeAccountingPanel({ buckets }: HedgeAccountingPanelProps) {
  const activeBuckets = buckets.filter(b => !b.suppressed);
  const suppressedBuckets = buckets.filter(b => b.suppressed);

  const rows: BucketEffectivenessRow[] = activeBuckets.map(b => {
    const ratio = computeHedgeRatio(b);
    return {
      bucket: b.bucket,
      hedgeRatio: ratio,
      status: assessEffectiveness(ratio),
    };
  });

  const effectiveCount = rows.filter(r => r.status === "EFFECTIVE").length;
  const totalCount = rows.length;

  const summaryColor = effectiveCount === totalCount
    ? S.green
    : effectiveCount >= totalCount * 0.8
      ? S.amber
      : S.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontFamily: S.fontMono, color: S.textTertiary, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          HEDGE EFFECTIVENESS ASSESSMENT
        </span>
        <span style={{ fontSize: 12, fontFamily: S.fontMono, color: S.textTertiary }}>
          ASC 815 / IAS 39
        </span>
      </div>

      {/* Standard band label */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        background: S.bgDeep,
        border: `1px solid ${S.soft}`,
        borderRadius: 4,
      }}>
        <span style={{ fontSize: 12, fontFamily: S.fontMono, color: S.textTertiary }}>
          HIGHLY EFFECTIVE BAND:
        </span>
        <span style={{ fontSize: 12, fontFamily: S.fontMono, color: S.cyan, fontWeight: 600 }}>
          0.80 – 1.25
        </span>
        <span style={{ fontSize: 12, fontFamily: S.fontMono, color: S.textTertiary, marginLeft: "auto" }}>
          Prospective test (structural)
        </span>
      </div>

      {/* Effectiveness table */}
      {rows.length === 0 ? (
        <div style={{
          padding: "24px",
          textAlign: "center",
          fontSize: 12,
          fontFamily: S.fontMono,
          color: S.textTertiary,
          background: S.bgSub,
          border: `1px solid ${S.soft}`,
          borderRadius: 4,
        }}>
          No active buckets to assess.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            fontFamily: S.fontMono,
          }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                {["BUCKET", "HEDGE RATIO", "WITHIN BAND", "STATUS"].map(h => (
                  <th scope="col" key={h} style={{
                    padding: "6px 10px",
                    textAlign: h === "BUCKET" ? "left" : "right",
                    fontSize: 12,
                    color: S.textTertiary,
                    letterSpacing: "0.08em",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const inBand = row.hedgeRatio >= EFFECTIVENESS_LOW && row.hedgeRatio <= EFFECTIVENESS_HIGH;
                const rowColor = row.status === "EFFECTIVE" ? S.green : S.amber;
                return (
                  <tr
                    key={row.bucket}
                    style={{
                      borderBottom: `1px solid ${S.soft}`,
                      background: i % 2 === 0 ? "transparent" : `${S.bgDeep}`,
                    }}
                  >
                    <td style={{ padding: "7px 10px", color: S.textPrimary, fontSize: 12 }}>
                      {row.bucket}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: rowColor, fontWeight: 600 }}>
                      {fmtPct(row.hedgeRatio)}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>
                      <span style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: inBand ? S.green : S.amber,
                        boxShadow: `0 0 6px ${inBand ? S.green : S.amber}`,
                      }} />
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>
                      <span style={{
                        fontSize: 12,
                        color: statusColor(row.status),
                        letterSpacing: "0.06em",
                        fontWeight: 600,
                      }}>
                        {statusBadge(row.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {suppressedBuckets.map((b, i) => (
                <tr
                  key={b.bucket}
                  style={{
                    borderBottom: `1px solid ${S.soft}`,
                    opacity: 0.5,
                    background: (rows.length + i) % 2 === 0 ? "transparent" : S.bgDeep,
                  }}
                >
                  <td style={{ padding: "7px 10px", color: S.textTertiary, fontSize: 12 }}>
                    {b.bucket}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: S.textTertiary }}>
                    —
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: S.textTertiary }}>
                    —
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>
                    <span style={{ fontSize: 12, color: S.textTertiary, letterSpacing: "0.06em" }}>
                      SUPPRESSED
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        background: S.bgDeep,
        border: `1px solid ${S.soft}`,
        borderRadius: 4,
      }}>
        <span style={{ fontSize: 12, fontFamily: S.fontMono, color: summaryColor, fontWeight: 600 }}>
          {effectiveCount} of {totalCount}
        </span>
        <span style={{ fontSize: 12, fontFamily: S.fontMono, color: S.textSecondary }}>
          buckets within ASC 815 effectiveness corridor (0.80–1.25)
        </span>
        {suppressedBuckets.length > 0 && (
          <span style={{ fontSize: 12, fontFamily: S.fontMono, color: S.textTertiary, marginLeft: "auto" }}>
            {suppressedBuckets.length} suppressed (excluded)
          </span>
        )}
      </div>

      {/* Disclosure note */}
      <div style={{
        fontSize: 12,
        fontFamily: S.fontMono,
        color: S.textTertiary,
        borderLeft: `2px solid ${S.rim}`,
        paddingLeft: 10,
        lineHeight: 1.7,
      }}>
        Full retrospective regression test requires 30+ historical data points. Contact your treasury team for historical effectiveness documentation.
        This assessment is prospective and structural only — it does not constitute a complete hedge accounting designation under ASC 815 or IAS 39.
      </div>
    </div>
  );
}
