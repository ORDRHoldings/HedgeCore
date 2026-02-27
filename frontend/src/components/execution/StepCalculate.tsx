"use client";

import { useState, useCallback, useMemo } from "react";
import type { PositionRow } from "@/api/positionClient";
import type {
  TradeRow,
  MarketSnapshot,
  PolicyConfig,
  FuturesCurrency,
  CalculateResponse,
  BucketResult,
} from "@/api/types";
import { calculate } from "@/api/client";

/* ── Design tokens ─────────────────────────────────────────────────────── */
const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass,#22c55e)",
  fail:      "var(--accent-red,#ef4444)",
} as const;

/* ── Formatters ────────────────────────────────────────────────────────── */
const fmtNum = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const fmtUsd = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/* ── Props ─────────────────────────────────────────────────────────────── */
interface Props {
  positions: PositionRow[];
  token: string;
  onApprove: (calcResult: CalculateResponse, runId: string) => void;
  onBack: () => void;
}

/* ── Component ─────────────────────────────────────────────────────────── */
export default function StepCalculate({
  positions,
  token,
  onApprove,
  onBack,
}: Props) {
  const [result, setResult] = useState<CalculateResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Position → TradeRow mapping ──────────────────────────────────── */
  const trades: TradeRow[] = useMemo(
    () =>
      positions.map((p) => ({
        record_id: p.record_id,
        entity: p.entity ?? "UNKNOWN",
        type: (p.type ?? "AR") as "AR" | "AP",
        currency: p.currency as FuturesCurrency,
        amount: p.amount,
        value_date: p.value_date,
        status: (p.status ?? "CONFIRMED") as "CONFIRMED" | "FORECAST",
        description: p.description ?? "",
      })),
    [positions],
  );

  /* ── Defaults ─────────────────────────────────────────────────────── */
  const market: MarketSnapshot = useMemo(
    () => ({
      as_of: new Date().toISOString(),
      spot_usdmxn: 17.5,
      forward_points_by_month: {},
      provider_metadata: {},
    }),
    [],
  );

  const policy: PolicyConfig = useMemo(
    () => ({
      bucket_mode: "CALENDAR_MONTH" as const,
      hedge_ratios: { confirmed: 1.0, forecast: 0.0 },
      cost_assumptions: { spread_bps: 5 },
      execution_product: "FWD" as const,
      min_trade_size_usd: 0,
    }),
    [],
  );

  /* ── Currency summary line ────────────────────────────────────────── */
  const ccySummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of positions) {
      map.set(p.currency, (map.get(p.currency) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([ccy, count]) => ({ ccy, count }));
  }, [positions]);

  /* ── Run engine ───────────────────────────────────────────────────── */
  const runEngine = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await calculate({
        trades,
        hedges: [],
        market,
        policy,
      });
      setResult(res);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Unknown calculation error";
      setError(msg);
    } finally {
      setRunning(false);
    }
  }, [trades, market, policy]);

  /* ── Derived ──────────────────────────────────────────────────────── */
  const validationPassed =
    result?.validation_report?.status === "PASS";
  const buckets: BucketResult[] = result?.hedge_plan?.buckets ?? [];
  const summary = result?.hedge_plan?.summary;
  const scenarios = result?.scenario_results?.totals ?? [];

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        fontFamily: S.fontUI,
        color: S.primary,
      }}
    >
      {/* ═══ Section 1: Selected Positions Summary ═══ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          background: S.bgSub,
          borderBottom: `1px solid ${S.rim}`,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            color: S.secondary,
          }}
        >
          {positions.length} position{positions.length !== 1 ? "s" : ""}{" "}
          selected
        </span>
        <span
          style={{
            width: 1,
            height: 14,
            background: S.soft,
            flexShrink: 0,
          }}
        />
        {ccySummary.map(({ ccy, count }) => (
          <span
            key={ccy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 22,
              padding: "0 8px",
              borderRadius: 3,
              background: S.bgDeep,
              border: `1px solid ${S.soft}`,
              fontFamily: S.fontMono,
              fontSize: 10,
              fontWeight: 600,
              color: S.primary,
              letterSpacing: "0.04em",
            }}
          >
            {count} {ccy}
          </span>
        ))}
      </div>

      {/* ═══ Section 2: Engine Control ═══ */}
      <div
        style={{
          padding: "16px 16px",
          borderBottom: `1px solid ${S.rim}`,
          flexShrink: 0,
        }}
      >
        {/* Market snapshot info */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              letterSpacing: "0.08em",
              color: S.tertiary,
              textTransform: "uppercase" as const,
            }}
          >
            Spot USDMXN:{" "}
            <span style={{ color: S.primary, fontWeight: 600 }}>
              {fmtDec.format(market.spot_usdmxn)}
            </span>
          </span>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.tertiary,
            }}
          >
            As of: {new Date(market.as_of).toLocaleString()}
          </span>
        </div>

        {/* Run button */}
        <button
          onClick={runEngine}
          disabled={running}
          style={{
            height: 44,
            padding: "0 32px",
            background: running ? S.bgSub : S.cyan,
            color: running ? S.tertiary : S.bgDeep,
            border: running
              ? `1px solid ${S.soft}`
              : `2px solid ${S.cyan}`,
            borderRadius: 4,
            fontFamily: S.fontMono,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.10em",
            cursor: running ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            animation: !running && !result ? "pulse-border 2s infinite" : "none",
          }}
        >
          {running ? "COMPUTING HEDGE PLAN..." : "\u25B6 RUN HEDGE ENGINE"}
        </button>

        {/* Error banner */}
        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(239,68,68,0.08)",
              border: `1px solid ${S.fail}`,
              borderRadius: 4,
              fontFamily: S.fontMono,
              fontSize: 11,
              color: S.fail,
            }}
          >
            ERROR: {error}
          </div>
        )}
      </div>

      {/* ═══ Section 3: Results ═══ */}
      {result && (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {/* Validation banner */}
          <div
            style={{
              margin: "12px 16px 0",
              padding: "8px 14px",
              borderRadius: 4,
              background: validationPassed
                ? "rgba(34,197,94,0.08)"
                : "rgba(239,68,68,0.08)",
              border: `1px solid ${validationPassed ? S.pass : S.fail}`,
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: validationPassed ? S.pass : S.fail,
            }}
          >
            {validationPassed ? "VALIDATION PASSED" : "VALIDATION FAILED"}
            {result.validation_report?.errors?.length > 0 && (
              <span style={{ fontWeight: 400, marginLeft: 12 }}>
                {result.validation_report.errors
                  .map((e) => e.message)
                  .join("; ")}
              </span>
            )}
          </div>

          {/* Hedge plan table */}
          {buckets.length > 0 && (
            <div style={{ margin: "12px 16px 0" }}>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  color: S.tertiary,
                  textTransform: "uppercase" as const,
                  marginBottom: 8,
                }}
              >
                Hedge Plan
              </div>

              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "100px 120px 100px 120px 110px 90px 90px 80px",
                  alignItems: "center",
                  height: 32,
                  padding: "0 8px",
                  background: S.bgSub,
                  borderBottom: `1px solid ${S.rim}`,
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: S.tertiary,
                  textTransform: "uppercase" as const,
                }}
              >
                <span>Bucket</span>
                <span style={{ textAlign: "right" }}>Exposure (MXN)</span>
                <span>Direction</span>
                <span style={{ textAlign: "right" }}>Action (MXN)</span>
                <span style={{ textAlign: "right" }}>Action (USD)</span>
                <span style={{ textAlign: "right" }}>Fwd Rate</span>
                <span style={{ textAlign: "right" }}>Cost (USD)</span>
                <span>Status</span>
              </div>

              {/* Table rows */}
              {buckets.map((b) => {
                const isSell = b.action_direction?.includes("SELL");
                return (
                  <div
                    key={b.bucket}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "100px 120px 100px 120px 110px 90px 90px 80px",
                      alignItems: "center",
                      height: 32,
                      padding: "0 8px",
                      borderBottom: `1px solid ${S.soft}`,
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      opacity: b.suppressed ? 0.4 : 1,
                      textDecoration: b.suppressed ? "line-through" : "none",
                    }}
                  >
                    <span style={{ color: S.primary, fontWeight: 600 }}>
                      {b.bucket}
                    </span>
                    <span
                      style={{ textAlign: "right", color: S.secondary }}
                    >
                      {fmtNum.format(b.commercial_exposure_mxn)}
                    </span>
                    <span>
                      {b.action_direction ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "1px 6px",
                            borderRadius: 3,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            background: isSell
                              ? "rgba(239,68,68,0.12)"
                              : "rgba(34,197,94,0.12)",
                            color: isSell ? S.fail : S.pass,
                            border: `1px solid ${isSell ? S.fail : S.pass}`,
                          }}
                        >
                          {b.action_direction}
                        </span>
                      ) : (
                        <span style={{ color: S.tertiary }}>&mdash;</span>
                      )}
                    </span>
                    <span
                      style={{ textAlign: "right", color: S.primary }}
                    >
                      {fmtNum.format(b.action_mxn)}
                    </span>
                    <span
                      style={{ textAlign: "right", color: S.secondary }}
                    >
                      {fmtUsd.format(b.action_usd)}
                    </span>
                    <span
                      style={{ textAlign: "right", color: S.tertiary }}
                    >
                      {fmtDec.format(b.forward_rate)}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        color: b.friction_usd > 0 ? S.amber : S.tertiary,
                      }}
                    >
                      {fmtUsd.format(b.friction_usd)}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: b.suppressed ? S.amber : S.pass,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {b.suppressed ? "SUPPRESSED" : "ACTIVE"}
                    </span>
                  </div>
                );
              })}

              {/* Summary bar */}
              {summary && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "100px 120px 100px 120px 110px 90px 90px 80px",
                    alignItems: "center",
                    height: 36,
                    padding: "0 8px",
                    background: S.bgSub,
                    borderTop: `2px solid ${S.rim}`,
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      letterSpacing: "0.08em",
                      fontSize: 9,
                      color: S.tertiary,
                    }}
                  >
                    TOTAL
                  </span>
                  <span style={{ textAlign: "right", color: S.primary }}>
                    {fmtNum.format(
                      summary.total_commercial_exposure_mxn,
                    )}
                  </span>
                  <span />
                  <span style={{ textAlign: "right", color: S.primary }}>
                    {fmtNum.format(summary.total_action_mxn)}
                  </span>
                  <span style={{ textAlign: "right", color: S.secondary }}>
                    {fmtUsd.format(summary.total_action_usd)}
                  </span>
                  <span />
                  <span
                    style={{ textAlign: "right", color: S.amber }}
                  >
                    {fmtUsd.format(summary.total_friction_usd)}
                  </span>
                  <span />
                </div>
              )}
            </div>
          )}

          {/* Scenario Results */}
          {scenarios.length > 0 && (
            <div style={{ margin: "16px 16px 0" }}>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  color: S.tertiary,
                  textTransform: "uppercase" as const,
                  marginBottom: 8,
                }}
              >
                Scenario Analysis
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: 0,
                }}
              >
                {/* Header */}
                {["Sigma", "Shocked Spot", "Unhedged (USD)", "Benefit (USD)"].map(
                  (h) => (
                    <div
                      key={h}
                      style={{
                        padding: "6px 8px",
                        background: S.bgSub,
                        borderBottom: `1px solid ${S.rim}`,
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        color: S.tertiary,
                        textTransform: "uppercase" as const,
                      }}
                    >
                      {h}
                    </div>
                  ),
                )}
                {/* Rows */}
                {scenarios.map((sc) => (
                  <div key={sc.sigma} style={{ display: "contents" }}>
                    <div
                      style={{
                        padding: "6px 8px",
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        fontWeight: 600,
                        color:
                          sc.sigma < 0
                            ? S.fail
                            : sc.sigma > 0
                              ? S.pass
                              : S.primary,
                        borderBottom: `1px solid ${S.soft}`,
                      }}
                    >
                      {sc.sigma > 0 ? "+" : ""}
                      {sc.sigma}\u03C3
                    </div>
                    <div
                      style={{
                        padding: "6px 8px",
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        color: S.secondary,
                        borderBottom: `1px solid ${S.soft}`,
                      }}
                    >
                      {fmtDec.format(sc.shocked_spot)}
                    </div>
                    <div
                      style={{
                        padding: "6px 8px",
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        color: S.secondary,
                        borderBottom: `1px solid ${S.soft}`,
                      }}
                    >
                      {fmtUsd.format(sc.total_unhedged_usd)}
                    </div>
                    <div
                      style={{
                        padding: "6px 8px",
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        fontWeight: 600,
                        color:
                          sc.total_hedge_benefit_usd > 0
                            ? S.pass
                            : sc.total_hedge_benefit_usd < 0
                              ? S.fail
                              : S.tertiary,
                        borderBottom: `1px solid ${S.soft}`,
                      }}
                    >
                      {fmtUsd.format(sc.total_hedge_benefit_usd)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spacer before CTA */}
          <div style={{ height: 16 }} />
        </div>
      )}

      {/* ═══ Footer: CTA buttons ═══ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
          padding: "0 16px",
          background: S.bgPanel,
          borderTop: `1px solid ${S.rim}`,
          flexShrink: 0,
          marginTop: "auto",
        }}
      >
        <button
          onClick={onBack}
          style={{
            height: 36,
            padding: "0 20px",
            background: "transparent",
            color: S.tertiary,
            border: `1px solid ${S.soft}`,
            borderRadius: 4,
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          &#9666; BACK TO REVIEW
        </button>
        <button
          disabled={!result || !validationPassed}
          onClick={() => {
            if (result) {
              const runId =
                result.run_envelope?.run_id ?? result.run_id;
              onApprove(result, runId);
            }
          }}
          style={{
            height: 36,
            padding: "0 24px",
            background:
              result && validationPassed ? S.pass : S.bgSub,
            color:
              result && validationPassed ? S.bgDeep : S.tertiary,
            border: "none",
            borderRadius: 4,
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.10em",
            cursor:
              result && validationPassed
                ? "pointer"
                : "not-allowed",
            opacity: result && validationPassed ? 1 : 0.5,
            transition: "all 0.15s",
          }}
        >
          APPROVE HEDGE PLAN &#9656;
        </button>
      </div>

      {/* Keyframe for pulsing border */}
      <style>{`
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,255,255,0.3); }
          50% { box-shadow: 0 0 0 4px rgba(0,255,255,0.1); }
        }
      `}</style>
    </div>
  );
}
