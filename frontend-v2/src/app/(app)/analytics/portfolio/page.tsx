"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import PageHeader from "@/components/layout/PageHeader";
import TierGateClient from "@/components/tier/TierGateClient";

// ─── Style constants ───────────────────────────────────────────────────────────
const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  rim: "var(--border-rim,#E2E8F0)",
  soft: "var(--border-soft,#CBD5E1)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  accentRed: "var(--accent-red,#DC2626)",
  statusPass: "var(--status-pass,#059669)",
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PortfolioSummary {
  total_exposure_usd: number;
  total_hedged_usd: number;
  total_unhedged_usd: number;
  portfolio_hedge_ratio: number;
  currency_count: number;
  var_99_1w_undiversified: number;
  var_99_1w_diversified: number;
}

interface CurrencyRow {
  currency: string;
  gross_exposure_usd: number;
  hedged_usd: number;
  unhedged_usd: number;
  hedge_ratio: number;
  weight_pct: number;
  var_99_1w: number;
  unhedged_var_99: number;
  vol_ann: number;
  carry: number;
  liquidity: "HIGH" | "MEDIUM" | "LOW";
  position_count: number;
  is_em: boolean;
}

interface HeatmapRow {
  currency: string;
  directional: number;
  volatility: number;
  liquidity: number;
  carry: number;
  tenor: number;
}

interface RunHistoryItem {
  date: string;
  runs: number;
}

interface PortfolioData {
  as_of: string;
  summary: PortfolioSummary;
  currencies: CurrencyRow[];
  heatmap: HeatmapRow[];
  run_history: RunHistoryItem[];
}

// ─── Formatters ────────────────────────────────────────────────────────────────
function fmtUSD(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}K`;
  }
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function fmtTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

// ─── Heatmap cell color ────────────────────────────────────────────────────────
function heatColor(score: number): { bg: string; text: string } {
  if (score < 0.33) {
    return { bg: "rgba(5,150,105,0.12)", text: "#059669" };
  } else if (score < 0.66) {
    return { bg: "rgba(217,119,6,0.12)", text: "#D97706" };
  } else {
    return { bg: "rgba(220,38,38,0.14)", text: "#DC2626" };
  }
}

// ─── Liquidity badge ───────────────────────────────────────────────────────────
function LiquidityBadge({ liq }: { liq: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    HIGH: { bg: "rgba(5,150,105,0.12)", color: "#059669" },
    MEDIUM: { bg: "rgba(217,119,6,0.12)", color: "#D97706" },
    LOW: { bg: "rgba(220,38,38,0.12)", color: "#DC2626" },
  };
  const style = cfg[liq] ?? { bg: "rgba(148,163,184,0.12)", color: "#94A3B8" };
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "2px 7px",
        borderRadius: 3,
        backgroundColor: style.bg,
        color: style.color,
        whiteSpace: "nowrap",
      }}
    >
      {liq}
    </span>
  );
}

// ─── Skeleton block ────────────────────────────────────────────────────────────
function SkeletonBlock({ h = 20, w = "100%", mb = 0 }: { h?: number; w?: string | number; mb?: number }) {
  return (
    <div
      style={{
        height: h,
        width: w,
        marginBottom: mb,
        borderRadius: 4,
        backgroundColor: "var(--bg-sub,#F1F5F9)",
        animation: "portfolioPulse 1.6s ease-in-out infinite",
      }}
    />
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  borderColor,
}: {
  label: string;
  value: string;
  sub?: string;
  borderColor: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 180,
        backgroundColor: S.bgPanel,
        border: `1px solid var(--border-rim,#E2E8F0)`,
        borderTop: `3px solid ${borderColor}`,
        borderRadius: 4,
        padding: "18px 20px 16px",
      }}
    >
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 22,
          fontWeight: 700,
          color: S.textPrimary,
          letterSpacing: "-0.01em",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            color: S.textTertiary,
            marginTop: 4,
            letterSpacing: "0.03em",
          }}
        >
          {sub}
        </div>
      )}
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: 11,
          color: S.textSecondary,
          marginTop: 8,
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
      }}
    >
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          fontWeight: 700,
          color: S.accentCyan,
          textTransform: "uppercase" as const,
          letterSpacing: "0.1em",
          whiteSpace: "nowrap" as const,
        }}
      >
        {title}
      </span>
      <div
        style={{
          flex: 1,
          height: 1,
          backgroundColor: "var(--border-soft,#CBD5E1)",
        }}
      />
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function PortfolioAnalyticsPage() {
  const token = useAuthStore((s) => s.token);

  const { data, isLoading, isError, error } = useQuery<PortfolioData>({
    queryKey: ["analytics", "portfolio"],
    queryFn: () => api.get<PortfolioData>("/v1/analytics/portfolio"),
    enabled: !!token,
    staleTime: 30_000,
    retry: 2,
  });

  const DIMS: { key: keyof HeatmapRow; label: string }[] = [
    { key: "directional", label: "DIRECTIONAL" },
    { key: "volatility", label: "VOLATILITY" },
    { key: "liquidity", label: "LIQUIDITY" },
    { key: "carry", label: "CARRY" },
    { key: "tenor", label: "TENOR" },
  ];

  return (
    <TierGateClient requiredTier="enterprise" featureName="portfolio-risk">
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: S.bgDeep,
          fontFamily: S.fontUI,
        }}
      >
        <PageHeader label="ANALYTICS / PORTFOLIO" title="Portfolio Risk" />

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {isLoading && (
          <div style={{ padding: "24px 32px" }}>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginBottom: 28,
                flexWrap: "wrap" as const,
              }}
            >
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    minWidth: 180,
                    backgroundColor: S.bgPanel,
                    border: `1px solid var(--border-rim,#E2E8F0)`,
                    borderRadius: 4,
                    padding: "18px 20px 16px",
                  }}
                >
                  <SkeletonBlock h={28} w="70%" mb={8} />
                  <SkeletonBlock h={12} w="50%" mb={12} />
                  <SkeletonBlock h={10} w="60%" />
                </div>
              ))}
            </div>
            <div
              style={{
                backgroundColor: S.bgPanel,
                border: `1px solid var(--border-rim,#E2E8F0)`,
                borderRadius: 4,
                padding: 20,
                marginBottom: 24,
              }}
            >
              <SkeletonBlock h={14} w={160} mb={16} />
              {[1, 2, 3].map((i) => (
                <SkeletonBlock key={i} h={40} w="100%" mb={8} />
              ))}
            </div>
            <div
              style={{
                backgroundColor: S.bgPanel,
                border: `1px solid var(--border-rim,#E2E8F0)`,
                borderRadius: 4,
                padding: 20,
              }}
            >
              <SkeletonBlock h={14} w={140} mb={16} />
              {[1, 2].map((i) => (
                <SkeletonBlock key={i} h={52} w="100%" mb={8} />
              ))}
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {isError && !isLoading && (
          <div style={{ padding: "24px 32px" }}>
            <div
              style={{
                backgroundColor: "rgba(220,38,38,0.06)",
                border: `1px solid rgba(220,38,38,0.3)`,
                borderLeft: `4px solid #DC2626`,
                borderRadius: 4,
                padding: "16px 20px",
              }}
            >
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#DC2626",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                DATA FETCH ERROR
              </div>
              <div
                style={{
                  fontFamily: S.fontUI,
                  fontSize: 13,
                  color: S.textSecondary,
                }}
              >
                {error instanceof Error
                  ? error.message
                  : "Failed to load portfolio analytics. Please try again."}
              </div>
            </div>
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {data && !isLoading && (
          <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
            {/* As-of timestamp */}
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.textTertiary,
                letterSpacing: "0.06em",
                marginBottom: 20,
                textTransform: "uppercase" as const,
              }}
            >
              AS OF &nbsp;{fmtTimestamp(data.as_of)}
            </div>

            {/* ── KPI Cards ─────────────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                gap: 16,
                marginBottom: 28,
                flexWrap: "wrap" as const,
              }}
            >
              <KpiCard
                label="Total Exposure"
                value={fmtUSD(data.summary.total_exposure_usd)}
                sub={`${data.summary.currency_count} ${data.summary.currency_count === 1 ? "currency" : "currencies"}`}
                borderColor={S.accentCyan}
              />
              <KpiCard
                label="Portfolio Hedge Ratio"
                value={fmtPct(data.summary.portfolio_hedge_ratio, 2)}
                sub={`${fmtUSD(data.summary.total_hedged_usd)} hedged`}
                borderColor={S.statusPass}
              />
              <KpiCard
                label="Unhedged VaR 99% 1W"
                value={fmtUSD(data.summary.var_99_1w_undiversified)}
                sub={`Diversified: ${fmtUSD(data.summary.var_99_1w_diversified)}`}
                borderColor={S.accentAmber}
              />
              <KpiCard
                label="Currency Count"
                value={String(data.summary.currency_count)}
                sub={`${fmtUSD(data.summary.total_unhedged_usd)} unhedged`}
                borderColor={S.accentRed}
              />
            </div>

            {/* ── Currency Breakdown Table ───────────────────────────────── */}
            <div
              style={{
                backgroundColor: S.bgPanel,
                border: `1px solid var(--border-rim,#E2E8F0)`,
                borderRadius: 4,
                padding: "20px 24px",
                marginBottom: 24,
                overflowX: "auto" as const,
              }}
            >
              <SectionHeader title="Currency Breakdown" />
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse" as const,
                  tableLayout: "fixed" as const,
                  minWidth: 900,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: `1px solid var(--border-rim,#E2E8F0)` }}>
                    {[
                      { label: "CURRENCY", w: "7%" },
                      { label: "EXPOSURE", w: "12%" },
                      { label: "HEDGED", w: "12%" },
                      { label: "UNHEDGED", w: "12%" },
                      { label: "HEDGE RATIO", w: "18%" },
                      { label: "VAR 99% 1W", w: "11%" },
                      { label: "VOLATILITY", w: "9%" },
                      { label: "LIQUIDITY", w: "9%" },
                      { label: "EM/DM", w: "5%" },
                      { label: "POS", w: "5%" },
                    ].map((col) => (
                      <th
                        key={col.label}
                        style={{
                          width: col.w,
                          padding: "8px 10px",
                          textAlign: "left" as const,
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          color: S.textTertiary,
                          textTransform: "uppercase" as const,
                          letterSpacing: "0.08em",
                          whiteSpace: "nowrap" as const,
                        }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.currencies.map((row, idx) => (
                    <tr
                      key={row.currency}
                      style={{
                        borderBottom: `1px solid var(--border-soft,#CBD5E1)`,
                        backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
                      }}
                    >
                      {/* CURRENCY */}
                      <td style={{ padding: "12px 10px" }}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 13,
                            fontWeight: 700,
                            color: S.accentCyan,
                          }}
                        >
                          {row.currency}
                        </span>
                      </td>
                      {/* EXPOSURE */}
                      <td style={{ padding: "12px 10px" }}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 12,
                            color: S.textPrimary,
                            display: "block",
                          }}
                        >
                          {fmtUSD(row.gross_exposure_usd)}
                        </span>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            color: S.textTertiary,
                          }}
                        >
                          {row.weight_pct.toFixed(1)}% of portfolio
                        </span>
                      </td>
                      {/* HEDGED */}
                      <td style={{ padding: "12px 10px" }}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 12,
                            color: "#059669",
                          }}
                        >
                          {fmtUSD(row.hedged_usd)}
                        </span>
                      </td>
                      {/* UNHEDGED */}
                      <td style={{ padding: "12px 10px" }}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 12,
                            color: S.accentAmber,
                          }}
                        >
                          {fmtUSD(row.unhedged_usd)}
                        </span>
                      </td>
                      {/* HEDGE RATIO with progress bar */}
                      <td style={{ padding: "12px 10px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              height: 5,
                              backgroundColor: "var(--bg-sub,#F1F5F9)",
                              borderRadius: 3,
                              overflow: "hidden" as const,
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${Math.min(row.hedge_ratio * 100, 100)}%`,
                                backgroundColor:
                                  row.hedge_ratio >= 0.75
                                    ? "#059669"
                                    : row.hedge_ratio >= 0.5
                                      ? "#D97706"
                                      : "#DC2626",
                                borderRadius: 3,
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 12,
                              color: S.textPrimary,
                              whiteSpace: "nowrap" as const,
                              minWidth: 40,
                            }}
                          >
                            {fmtPct(row.hedge_ratio, 1)}
                          </span>
                        </div>
                      </td>
                      {/* VAR */}
                      <td style={{ padding: "12px 10px" }}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 12,
                            color: S.accentRed,
                            display: "block",
                          }}
                        >
                          {fmtUSD(row.unhedged_var_99)}
                        </span>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            color: S.textTertiary,
                          }}
                        >
                          gross {fmtUSD(row.var_99_1w)}
                        </span>
                      </td>
                      {/* VOLATILITY */}
                      <td style={{ padding: "12px 10px" }}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 12,
                            color: S.textPrimary,
                            display: "block",
                          }}
                        >
                          {(row.vol_ann * 100).toFixed(1)}% ann
                        </span>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            color: row.carry < 0 ? S.accentRed : "#059669",
                          }}
                        >
                          carry {(row.carry * 100).toFixed(1)}%
                        </span>
                      </td>
                      {/* LIQUIDITY */}
                      <td style={{ padding: "12px 10px" }}>
                        <LiquidityBadge liq={row.liquidity} />
                      </td>
                      {/* EM/DM */}
                      <td style={{ padding: "12px 10px" }}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            padding: "2px 6px",
                            borderRadius: 3,
                            backgroundColor: row.is_em
                              ? "rgba(217,119,6,0.12)"
                              : "rgba(99,102,241,0.12)",
                            color: row.is_em ? "#D97706" : "#818CF8",
                          }}
                        >
                          {row.is_em ? "EM" : "DM"}
                        </span>
                      </td>
                      {/* POSITIONS */}
                      <td style={{ padding: "12px 10px" }}>
                        <span
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 12,
                            color: S.textSecondary,
                          }}
                        >
                          {row.position_count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.currencies.length === 0 && (
                <div
                  style={{
                    padding: "32px 0",
                    textAlign: "center" as const,
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.textTertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  NO CURRENCY DATA AVAILABLE
                </div>
              )}
            </div>

            {/* ── Risk Heatmap ───────────────────────────────────────────── */}
            <div
              style={{
                backgroundColor: S.bgPanel,
                border: `1px solid var(--border-rim,#E2E8F0)`,
                borderRadius: 4,
                padding: "20px 24px",
                marginBottom: 24,
              }}
            >
              <SectionHeader title="Risk Heatmap" />
              <div
                style={{
                  fontFamily: S.fontUI,
                  fontSize: 12,
                  color: S.textTertiary,
                  marginBottom: 16,
                  letterSpacing: "0.02em",
                }}
              >
                Risk scores 0–100 across five dimensions. Green = low risk, Amber = moderate, Red = elevated.
              </div>

              {data.heatmap.length > 0 && (
                <div style={{ overflowX: "auto" as const }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate" as const,
                      borderSpacing: 4,
                      tableLayout: "fixed" as const,
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            width: 80,
                            textAlign: "left" as const,
                            padding: "6px 8px",
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            color: S.textTertiary,
                            letterSpacing: "0.08em",
                          }}
                        >
                          CCY
                        </th>
                        {DIMS.map((d) => (
                          <th
                            key={String(d.key)}
                            style={{
                              textAlign: "center" as const,
                              padding: "6px 4px",
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              fontWeight: 700,
                              color: S.textTertiary,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase" as const,
                            }}
                          >
                            {d.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.heatmap.map((row) => (
                        <tr key={row.currency}>
                          <td
                            style={{
                              padding: "4px 8px",
                              fontFamily: S.fontMono,
                              fontSize: 12,
                              fontWeight: 700,
                              color: S.accentCyan,
                            }}
                          >
                            {row.currency}
                          </td>
                          {DIMS.map((d) => {
                            const rawScore = row[d.key] as number;
                            const displayScore = Math.round(rawScore * 100);
                            const { bg, text } = heatColor(rawScore);
                            return (
                              <td key={String(d.key)} style={{ padding: 4 }}>
                                <div
                                  style={{
                                    backgroundColor: bg,
                                    border: `1px solid ${text}33`,
                                    borderRadius: 4,
                                    padding: "14px 8px",
                                    display: "flex",
                                    flexDirection: "column" as const,
                                    alignItems: "center" as const,
                                    justifyContent: "center" as const,
                                    gap: 5,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: S.fontMono,
                                      fontSize: 20,
                                      fontWeight: 700,
                                      color: text,
                                      lineHeight: 1,
                                    }}
                                  >
                                    {displayScore}
                                  </span>
                                  <div
                                    style={{
                                      width: "80%",
                                      height: 3,
                                      backgroundColor: "rgba(0,0,0,0.06)",
                                      borderRadius: 2,
                                      overflow: "hidden" as const,
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: "100%",
                                        width: `${displayScore}%`,
                                        backgroundColor: text,
                                        borderRadius: 2,
                                        opacity: 0.65,
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.heatmap.length === 0 && (
                <div
                  style={{
                    padding: "24px 0",
                    textAlign: "center" as const,
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.textTertiary,
                    letterSpacing: "0.06em",
                  }}
                >
                  NO HEATMAP DATA AVAILABLE
                </div>
              )}

              {/* Legend */}
              <div
                style={{
                  display: "flex",
                  gap: 20,
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: `1px solid var(--border-soft,#CBD5E1)`,
                  flexWrap: "wrap" as const,
                }}
              >
                {[
                  { label: "LOW RISK (0–33)", color: "#059669" },
                  { label: "MODERATE (34–66)", color: "#D97706" },
                  { label: "ELEVATED (67–100)", color: "#DC2626" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: item.color,
                        opacity: 0.85,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.textTertiary,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Diversification Analysis ──────────────────────────────── */}
            <div
              style={{
                backgroundColor: S.bgPanel,
                border: `1px solid var(--border-rim,#E2E8F0)`,
                borderRadius: 4,
                padding: "20px 24px",
                marginBottom: 24,
              }}
            >
              <SectionHeader title="Diversification Analysis" />
              <div
                style={{
                  display: "flex",
                  gap: 32,
                  alignItems: "center",
                  flexWrap: "wrap" as const,
                }}
              >
                {/* Undiversified */}
                <div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      color: S.textTertiary,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    Undiversified VaR 99% 1W
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 22,
                      fontWeight: 700,
                      color: S.accentRed,
                    }}
                  >
                    {fmtUSD(data.summary.var_99_1w_undiversified)}
                  </div>
                </div>

                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 18,
                    color: S.textTertiary,
                  }}
                >
                  →
                </div>

                {/* Diversified */}
                <div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      color: S.textTertiary,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    Diversified VaR 99% 1W
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 22,
                      fontWeight: 700,
                      color: S.accentAmber,
                    }}
                  >
                    {fmtUSD(data.summary.var_99_1w_diversified)}
                  </div>
                </div>

                {/* Credit badge */}
                <div
                  style={{
                    marginLeft: "auto",
                    backgroundColor: "rgba(5,150,105,0.08)",
                    border: "1px solid rgba(5,150,105,0.25)",
                    borderRadius: 4,
                    padding: "12px 20px",
                    textAlign: "center" as const,
                  }}
                >
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      color: S.textTertiary,
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.08em",
                      marginBottom: 4,
                    }}
                  >
                    Diversification Credit
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#059669",
                    }}
                  >
                    {fmtUSD(
                      data.summary.var_99_1w_undiversified -
                        data.summary.var_99_1w_diversified
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      color: "#059669",
                      opacity: 0.8,
                      marginTop: 2,
                    }}
                  >
                    {data.summary.var_99_1w_undiversified > 0
                      ? fmtPct(
                          (data.summary.var_99_1w_undiversified -
                            data.summary.var_99_1w_diversified) /
                            data.summary.var_99_1w_undiversified,
                          1
                        )
                      : "0.0%"}{" "}
                    reduction
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer disclaimer ─────────────────────────────────────── */}
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.textTertiary,
                letterSpacing: "0.04em",
                lineHeight: 1.7,
                paddingBottom: 32,
                borderTop: `1px solid var(--border-soft,#CBD5E1)`,
                paddingTop: 14,
              }}
            >
              VaR estimates are parametric 99% confidence interval over a 1-week horizon. Past risk metrics
              do not guarantee future loss magnitudes. All figures in USD equivalents at prevailing spot rates.
              Data refreshed every 30 seconds.
            </div>

            <style>{`
              @keyframes portfolioPulse {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 0.25; }
              }
            `}</style>
          </div>
        )}
      </div>
    </TierGateClient>
  );
}
