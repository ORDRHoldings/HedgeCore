"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { TrendingUp, X } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { UserContext } from "@/lib/authContext";
import type { AppDispatch, RootState } from "@/lib/store";
import { fetchExposureThunk } from "@/lib/store/slices/positionSlice";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:  "var(--bg-panel)",
  bgDeep:   "var(--bg-deep)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  borderSoft: "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass)",
} as const;

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

export default function ExposureSummaryWidget({ token, onRemove }: Props) {
  const router   = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { exposure, exposureLoading } = useSelector((s: RootState) => s.positions);

  // Fetch on mount (and whenever token changes)
  useEffect(() => {
    if (!token) return;
    dispatch(fetchExposureThunk({ token }));
  }, [dispatch, token]);

  const hasData = exposure.length > 0;

  // Sort by total exposure descending
  const sorted = [...exposure].sort(
    (a, b) => (b.total_confirmed + b.total_forecast) - (a.total_confirmed + a.total_forecast),
  );

  // Total across all currencies (for relative bar widths)
  const maxTotal = sorted.length > 0
    ? Math.max(...sorted.map(e => e.total_confirmed + e.total_forecast))
    : 1;

  return (
    <div
      style={{
        background:    S.bgPanel,
        border:        `1px solid ${S.rim}`,
        borderRadius:  4,
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
        minHeight:     160,
      }}
    >
      {/* Header */}
      <div
        className="widget-drag-handle"
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          6,
          padding:      "6px 10px",
          borderBottom: `1px solid ${S.rim}`,
          background:   S.bgDeep,
          flexShrink:   0,
          cursor:       "grab",
        }}
      >
        <TrendingUp size={12} color={S.cyan} />
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      "0.625rem",
            letterSpacing: "0.1em",
            color:         S.cyan,
            fontWeight:    700,
          }}
        >
          FX EXPOSURE SUMMARY
        </span>
        <span style={{ flex: 1 }} />
        {exposureLoading && (
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>
            LOADING…
          </span>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: S.tertiary, display: "flex", alignItems: "center", padding: 2, lineHeight: 1,
            }}
            title="Remove widget"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {!hasData ? (
          <div style={{ padding: 10 }}>
            <EmptyState
              type="empty"
              title="No exposure data"
              message="Enter positions to see your FX exposure summary."
              action={{
                label: "Enter Positions",
                onClick: () => router.push("/input"),
              }}
            />
          </div>
        ) : (
          <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Legend */}
            <div style={{ display: "flex", gap: 12, marginBottom: 2 }}>
              {[
                { label: "CONFIRMED", color: S.cyan },
                { label: "FORECAST",  color: S.amber },
              ].map(({ label, color }) => (
                <span key={label} style={{ fontFamily: S.fontMono, fontSize: "0.4rem", color, letterSpacing: "0.08em" }}>
                  ● {label}
                </span>
              ))}
            </div>

            {/* Per-currency rows */}
            {sorted.map((row) => {
              const total    = row.total_confirmed + row.total_forecast;
              const pctConf  = total > 0 ? (row.total_confirmed / total) * 100 : 0;
              const pctFcst  = total > 0 ? (row.total_forecast  / total) * 100 : 0;
              const barWidth = total > 0 ? (total / maxTotal) * 100 : 0;
              const countTotal = row.count_confirmed + row.count_forecast;

              return (
                <div key={row.currency}>
                  {/* Currency label + total */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontFamily:    S.fontMono,
                        fontSize:      "0.5rem",
                        fontWeight:    700,
                        color:         S.primary,
                        letterSpacing: "0.06em",
                      }}>
                        {row.currency}
                      </span>
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>
                        {countTotal} pos
                      </span>
                    </div>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary }}>
                      {fmtCompact(total)}
                    </span>
                  </div>

                  {/* Stacked bar */}
                  <div style={{
                    height: 6,
                    background: S.bgSub,
                    border: `1px solid ${S.borderSoft}`,
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    {/* Outer bar scaled to max */}
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${barWidth}%`, display: "flex" }}>
                      {/* Confirmed segment */}
                      {row.total_confirmed > 0 && (
                        <div style={{
                          width: `${pctConf}%`, height: "100%",
                          background: S.cyan,
                          opacity: 0.8,
                        }} />
                      )}
                      {/* Forecast segment */}
                      {row.total_forecast > 0 && (
                        <div style={{
                          width: `${pctFcst}%`, height: "100%",
                          background: S.amber,
                          opacity: 0.65,
                        }} />
                      )}
                    </div>
                  </div>

                  {/* Sub-labels */}
                  <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                    {row.total_confirmed > 0 && (
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.4rem", color: S.tertiary }}>
                        <span style={{ color: S.cyan }}>Conf</span> {fmtCompact(row.total_confirmed)}
                      </span>
                    )}
                    {row.total_forecast > 0 && (
                      <span style={{ fontFamily: S.fontMono, fontSize: "0.4rem", color: S.tertiary }}>
                        <span style={{ color: S.amber }}>Fcst</span> {fmtCompact(row.total_forecast)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
