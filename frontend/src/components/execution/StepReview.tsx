"use client";

import { useState, useCallback, useMemo } from "react";
import type { PositionRow } from "@/api/positionClient";

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
const fmtNum = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const fmtPct = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function daysBetween(a: string, b: Date): number {
  const ms = new Date(a).getTime() - b.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/* ── Props ─────────────────────────────────────────────────────────────── */
interface Props {
  positions: PositionRow[];
  loading: boolean;
  onProceed: (selected: PositionRow[]) => void;
}

/* ── Component ─────────────────────────────────────────────────────────── */
export default function StepReview({ positions, loading, onProceed }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* Sort positions: currency asc, then amount desc */
  const sorted = useMemo(
    () =>
      [...positions].sort((a, b) => {
        const cmp = a.currency.localeCompare(b.currency);
        return cmp !== 0 ? cmp : b.amount - a.amount;
      }),
    [positions],
  );

  const allSelected =
    sorted.length > 0 && selected.size === sorted.length;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((p) => p.id)));
    }
  }, [allSelected, sorted]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ── Derived exposure stats ─────────────────────────────────────────── */
  const selectedRows = useMemo(
    () => sorted.filter((p) => selected.has(p.id)),
    [sorted, selected],
  );

  const totalNotional = useMemo(
    () => selectedRows.reduce((s, p) => s + Math.abs(p.amount), 0),
    [selectedRows],
  );

  const currencyBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of selectedRows) {
      map.set(p.currency, (map.get(p.currency) ?? 0) + Math.abs(p.amount));
    }
    return Array.from(map.entries())
      .map(([ccy, notional]) => ({ ccy, notional, pct: totalNotional > 0 ? notional / totalNotional : 0 }))
      .sort((a, b) => b.notional - a.notional);
  }, [selectedRows, totalNotional]);

  const maturityBuckets = useMemo(() => {
    const now = new Date();
    const buckets = { "0-30d": 0, "30-90d": 0, "90-180d": 0, "180+d": 0 };
    for (const p of selectedRows) {
      const d = daysBetween(p.value_date, now);
      if (d <= 30) buckets["0-30d"]++;
      else if (d <= 90) buckets["30-90d"]++;
      else if (d <= 180) buckets["90-180d"]++;
      else buckets["180+d"]++;
    }
    return buckets;
  }, [selectedRows]);

  const estVaR95 = totalNotional * 0.02;

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        height: "100%",
        minHeight: 0,
        fontFamily: S.fontUI,
        color: S.primary,
      }}
    >
      {/* ═══ Left: position table (70%) ═══ */}
      <div
        style={{
          flex: "0 0 70%",
          display: "flex",
          flexDirection: "column",
          borderRight: `1px solid ${S.rim}`,
          overflow: "hidden",
        }}
      >
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "36px 1fr 1fr 68px 120px 100px 60px 1fr",
            alignItems: "center",
            height: 36,
            padding: "0 12px",
            background: S.bgSub,
            borderBottom: `1px solid ${S.rim}`,
            fontFamily: S.fontMono,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: S.tertiary,
            textTransform: "uppercase" as const,
            flexShrink: 0,
          }}
        >
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ accentColor: S.cyan, cursor: "pointer" }}
            />
          </label>
          <span>Record ID</span>
          <span>Entity</span>
          <span>CCY</span>
          <span style={{ textAlign: "right" }}>Amount</span>
          <span>Value Date</span>
          <span>Type</span>
          <span>Policy</span>
        </div>

        {/* Table body */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 120,
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.tertiary,
                letterSpacing: "0.06em",
              }}
            >
              LOADING POSITIONS...
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "48px 24px" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.amber, textTransform: "uppercase" as const }}>
                No Eligible Positions
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, textAlign: "center" as const, lineHeight: 1.6, maxWidth: 380 }}>
                No positions have status <span style={{ fontFamily: S.fontMono, color: S.cyan, fontSize: 11 }}>POLICY_ASSIGNED</span> or <span style={{ fontFamily: S.fontMono, color: S.cyan, fontSize: 11 }}>READY_TO_EXECUTE</span>.
                Assign a hedge policy to positions before running the execution pipeline.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <a href="/policy-desk" style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: S.bgPanel, background: S.cyan, padding: "5px 14px", borderRadius: 2, textDecoration: "none" }}>
                  Go to Policy Desk
                </a>
                <a href="/position-desk" style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: S.primary, background: "transparent", border: `1px solid ${S.rim}`, padding: "5px 14px", borderRadius: 2, textDecoration: "none" }}>
                  View Positions
                </a>
              </div>
            </div>
          ) : (
            sorted.map((p) => {
              const isSelected = selected.has(p.id);
              const isAR = p.type === "AR";
              return (
                <div
                  key={p.id}
                  onClick={() => toggleOne(p.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 1fr 1fr 68px 120px 100px 60px 1fr",
                    alignItems: "center",
                    height: 34,
                    padding: "0 12px",
                    background: isSelected ? "rgba(0,255,255,0.04)" : "transparent",
                    borderBottom: `1px solid ${S.soft}`,
                    cursor: "pointer",
                    transition: "background 0.1s",
                    fontSize: 12,
                  }}
                >
                  <label
                    style={{ display: "flex", alignItems: "center" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(p.id)}
                      style={{ accentColor: S.cyan, cursor: "pointer" }}
                    />
                  </label>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      color: S.secondary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.record_id}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: S.secondary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.entity}
                  </span>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      fontWeight: 600,
                      color: S.primary,
                    }}
                  >
                    {p.currency}
                  </span>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      fontWeight: 500,
                      textAlign: "right",
                      color: isAR ? S.pass : S.amber,
                    }}
                  >
                    {fmtNum.format(p.amount)}
                  </span>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      color: S.tertiary,
                    }}
                  >
                    {p.value_date}
                  </span>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 600,
                      color: isAR ? S.pass : S.amber,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {p.type}
                  </span>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      color: S.tertiary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.policy_id ? p.policy_id.slice(0, 8) + "..." : "\u2014"}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with CTA */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 52,
            padding: "0 16px",
            background: S.bgPanel,
            borderTop: `1px solid ${S.rim}`,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              color: S.tertiary,
            }}
          >
            {selected.size} of {sorted.length} selected
          </span>
          <button
            disabled={selected.size === 0}
            onClick={() => onProceed(selectedRows)}
            style={{
              height: 36,
              padding: "0 24px",
              background: selected.size > 0 ? S.cyan : S.bgSub,
              color: selected.size > 0 ? S.bgDeep : S.tertiary,
              border: "none",
              borderRadius: 4,
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.10em",
              cursor: selected.size > 0 ? "pointer" : "not-allowed",
              opacity: selected.size > 0 ? 1 : 0.5,
              transition: "all 0.15s",
            }}
          >
            PROCEED TO CALCULATION &#9656;
          </button>
        </div>
      </div>

      {/* ═══ Right: exposure summary sidebar (30%) ═══ */}
      <div
        style={{
          flex: "0 0 30%",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          overflowY: "auto",
          background: S.bgDeep,
        }}
      >
        {/* Section: Total Notional */}
        <div
          style={{
            padding: "20px 16px 16px",
            borderBottom: `1px solid ${S.soft}`,
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: S.tertiary,
              textTransform: "uppercase" as const,
              marginBottom: 6,
            }}
          >
            Total Notional
          </div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 26,
              fontWeight: 700,
              color: selected.size > 0 ? S.primary : S.tertiary,
              lineHeight: 1.1,
            }}
          >
            {fmtNum.format(totalNotional)}
          </div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              color: S.tertiary,
              marginTop: 4,
            }}
          >
            {selectedRows.length} position{selectedRows.length !== 1 ? "s" : ""} selected
          </div>
        </div>

        {/* Section: Currency Breakdown */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${S.soft}`,
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: S.tertiary,
              textTransform: "uppercase" as const,
              marginBottom: 10,
            }}
          >
            Currency Breakdown
          </div>
          {currencyBreakdown.length === 0 ? (
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                color: S.tertiary,
              }}
            >
              Select positions to view
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {currencyBreakdown.map(({ ccy, notional, pct }) => (
                <div key={ccy}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 600,
                        color: S.primary,
                      }}
                    >
                      {ccy}
                    </span>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        color: S.secondary,
                      }}
                    >
                      {fmtNum.format(notional)}{" "}
                      <span style={{ color: S.tertiary, fontSize: 10 }}>
                        {fmtPct.format(pct)}
                      </span>
                    </span>
                  </div>
                  {/* Percentage bar */}
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: S.bgSub,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(pct * 100, 1)}%`,
                        borderRadius: 2,
                        background: S.cyan,
                        transition: "width 0.2s",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section: Maturity Profile */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${S.soft}`,
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: S.tertiary,
              textTransform: "uppercase" as const,
              marginBottom: 10,
            }}
          >
            Maturity Profile
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(Object.entries(maturityBuckets) as [string, number][]).map(
              ([label, count]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      color: S.secondary,
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 600,
                      color: count > 0 ? S.primary : S.tertiary,
                      minWidth: 24,
                      textAlign: "right",
                    }}
                  >
                    {count}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>

        {/* Section: Estimated VaR */}
        <div
          style={{ padding: "14px 16px" }}
          title="Quick estimate: 2% of notional. Actual Monte Carlo VaR computed in Step 3."
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: S.tertiary,
              textTransform: "uppercase" as const,
              marginBottom: 6,
            }}
          >
            VaR 95% (2% proxy)
          </div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 18,
              fontWeight: 700,
              color: estVaR95 > 0 ? S.amber : S.tertiary,
              lineHeight: 1.2,
            }}
          >
            {fmtNum.format(estVaR95)}
          </div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              color: S.tertiary,
              marginTop: 2,
            }}
          >
            2% proxy of total notional
          </div>
        </div>
      </div>
    </div>
  );
}
