"use client";

/**
 * Guided Calculation Wizard
 *
 * 5-step flow: Select Positions -> Policy -> Market Data -> Review -> Results
 * Replaces the expert-mode /input page with a guided, step-by-step experience.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import WorkflowBreadcrumb from "@/components/layout/WorkflowBreadcrumb";
import WorkflowGuide from "@/components/layout/WorkflowGuide";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { listPositions, type PositionRow } from "@/api/positionClient";
import { getActivePolicy, listPolicyTemplates, type PolicyInstance, type PolicyTemplate } from "@/api/policyClient";
import { calculate } from "@/api/client";
import type { TradeRow, PolicyConfig, MarketSnapshot, CalculateResponse, BucketResult } from "@/api/types";

import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { PageShell } from "@/components/layout/PageShell";
import { LayoutDashboard } from "lucide-react";

/* ── Design tokens ──────────────────────────────────────────────────────── */
const S = {
  bg:        "#F8FAFC",
  panel:     "#FFFFFF",
  sub:       "#F1F5F9",
  rim:       "#E2E8F0",
  soft:      "#CBD5E1",
  primary:   "#0F172A",
  secondary: "#334155",
  tertiary:  "#64748B",
  muted:     "#94A3B8",
  blue:      "#1C62F2",
  blueDim:   "rgba(28,98,242,0.06)",
  blueBdr:   "rgba(28,98,242,0.18)",
  green:     "#059669",
  greenDim:  "rgba(5,150,105,0.06)",
  greenBdr:  "rgba(5,150,105,0.20)",
  amber:     "#D97706",
  amberDim:  "rgba(217,119,6,0.06)",
  amberBdr:  "rgba(217,119,6,0.20)",
  red:       "#DC2626",
  redDim:    "rgba(220,38,38,0.06)",
  redBdr:    "rgba(220,38,38,0.20)",
  mono:      "'IBM Plex Mono','JetBrains Mono',monospace",
  ui:        "'IBM Plex Sans',sans-serif",
  white:     "#fff",
  blueLight: "#3B82F6",
} as const;

const STEP_LABELS = ["POSITIONS", "POLICY", "MARKET", "REVIEW", "RESULTS"] as const;
type Step = 0 | 1 | 2 | 3 | 4;

/* ── Formatters ─────────────────────────────────────────────────────────── */
function fmtNum(n: number, d = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtUsd(n: number): string {
  return "$" + fmtNum(Math.abs(n), 2);
}

/* ── Step indicator ─────────────────────────────────────────────────────── */
function StepBar({ step, onStep }: { step: Step; onStep: (s: Step) => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "stretch", height: 48, flexShrink: 0,
      background: S.panel, borderBottom: `1px solid ${S.rim}`,
    }}>
      {STEP_LABELS.map((label, i) => {
        const isActive = i === step;
        const isDone = i < step;
        const canClick = i < step || (i === step);
        return (
          <button
            key={label}
            onClick={() => canClick && onStep(i as Step)}
            disabled={!canClick}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: isActive ? S.blueDim : "transparent",
              borderBottom: isActive ? `2px solid ${S.blue}` : "2px solid transparent",
              border: "none", borderRight: i < 4 ? `1px solid ${S.rim}` : "none",
              cursor: canClick ? "pointer" : "default",
              transition: "background 120ms, border-color 120ms",
              opacity: !canClick && !isDone ? 0.4 : 1,
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: "50%", display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0,
              fontFamily: S.mono, fontSize: 12, fontWeight: 700,
              background: isDone ? S.green : isActive ? S.blue : S.soft,
              color: isDone || isActive ? "#fff" : S.tertiary,
              transition: "background 120ms",
            }}>
              {isDone ? "\u2713" : i + 1}
            </span>
            <span style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 600,
              letterSpacing: "0.1em",
              color: isActive ? S.blue : isDone ? S.green : S.muted,
            }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Step 0: Select Positions ───────────────────────────────────────────── */
function StepPositions({
  positions, selected, onToggle, onSelectAll, loading, error,
}: {
  positions: PositionRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  loading: boolean;
  error: string | null;
}) {
  const eligible = positions.filter(p =>
    ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE"].includes(p.execution_status)
  );
  const grouped = useMemo(() => {
    const map = new Map<string, PositionRow[]>();
    for (const p of eligible) {
      const key = p.currency;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [eligible]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", fontFamily: S.mono, fontSize: 12, color: S.muted, letterSpacing: "0.12em" }}>LOADING POSITIONS...</div>;
  if (error) return <div style={{ padding: 40, textAlign: "center", fontFamily: S.mono, fontSize: 12, color: S.red }}>{error}</div>;
  if (eligible.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={{ fontFamily: S.mono, fontSize: 13, color: S.muted, letterSpacing: "0.08em", marginBottom: 12 }}>NO ELIGIBLE POSITIONS</div>
        <div style={{ fontFamily: S.ui, fontSize: 13, color: S.tertiary, lineHeight: 1.6 }}>
          Create positions in the Position Desk first, then return here to calculate.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.primary, letterSpacing: "0.08em" }}>
            SELECT POSITIONS
          </div>
          <div style={{ fontFamily: S.ui, fontSize: 12, color: S.tertiary, marginTop: 2 }}>
            Choose which FX exposures to include in this calculation run.
          </div>
        </div>
        <button onClick={onSelectAll} style={{
          fontFamily: S.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
          color: S.blue, background: S.blueDim, border: `1px solid ${S.blueBdr}`,
          padding: "4px 12px", borderRadius: 2, cursor: "pointer",
        }}>
          {selected.size === eligible.length ? "DESELECT ALL" : "SELECT ALL"}
        </button>
      </div>

      {grouped.map(([ccy, rows]) => (
        <div key={ccy} style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
            color: S.muted, padding: "6px 0", borderBottom: `1px solid ${S.rim}`,
          }}>
            {ccy} EXPOSURES ({rows.length})
          </div>
          {rows.map(p => {
            const checked = selected.has(p.id);
            return (
              <div
                key={p.id}
                onClick={() => onToggle(p.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 8px", cursor: "pointer",
                  borderBottom: `1px solid ${S.rim}`,
                  background: checked ? S.blueDim : "transparent",
                  transition: "background 80ms",
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                  border: checked ? `2px solid ${S.blue}` : `2px solid ${S.soft}`,
                  background: checked ? S.blue : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 80ms",
                }}>
                  {checked && <span style={{ color: S.white, fontSize: 12, fontWeight: 700 }}>{"\u2713"}</span>}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.primary }}>
                      {p.record_id}
                    </span>
                    <span style={{
                      fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                      color: p.type === "AR" ? S.green : S.amber,
                      background: p.type === "AR" ? S.greenDim : S.amberDim,
                      border: `1px solid ${p.type === "AR" ? S.greenBdr : S.amberBdr}`,
                      padding: "1px 5px", borderRadius: 2,
                    }}>
                      {p.type}
                    </span>
                    <span style={{
                      fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                      color: p.status === "CONFIRMED" ? S.blue : S.amber,
                      background: p.status === "CONFIRMED" ? S.blueDim : S.amberDim,
                      border: `1px solid ${p.status === "CONFIRMED" ? S.blueBdr : S.amberBdr}`,
                      padding: "1px 5px", borderRadius: 2,
                    }}>
                      {p.status}
                    </span>
                    <span style={{
                      fontFamily: S.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
                      color: S.tertiary, background: S.sub, padding: "1px 5px", borderRadius: 2,
                    }}>
                      {p.execution_status}
                    </span>
                  </div>
                  <div style={{ fontFamily: S.ui, fontSize: 12, color: S.tertiary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.description || p.entity}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.primary }}>
                    {p.currency} {fmtNum(p.amount)}
                  </div>
                  <div style={{ fontFamily: S.mono, fontSize: 12, color: S.muted }}>
                    {p.value_date}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div style={{
        marginTop: 12, padding: "8px 12px", background: S.sub, borderRadius: 3,
        fontFamily: S.mono, fontSize: 12, color: S.tertiary,
      }}>
        {selected.size} of {eligible.length} positions selected
      </div>
    </div>
  );
}

/* ── Step 1: Policy ─────────────────────────────────────────────────────── */
function StepPolicy({
  activePolicy, templates, selectedTemplateId, onSelect, policyOverride, onOverride, loading,
}: {
  activePolicy: PolicyInstance | null;
  templates: PolicyTemplate[];
  selectedTemplateId: string | null;
  onSelect: (id: string) => void;
  policyOverride: Partial<PolicyConfig>;
  onOverride: (patch: Partial<PolicyConfig>) => void;
  loading: boolean;
}) {
  const isMobile = useIsMobile();
  const chosen = selectedTemplateId
    ? templates.find(t => t.id === selectedTemplateId) ?? null
    : activePolicy?.template ?? null;

  const config: PolicyConfig = {
    bucket_mode: "CALENDAR_MONTH",
    hedge_ratios: {
      confirmed: policyOverride.hedge_ratios?.confirmed ?? chosen?.config?.hedge_ratios?.confirmed ?? 0.80,
      forecast:  policyOverride.hedge_ratios?.forecast  ?? chosen?.config?.hedge_ratios?.forecast  ?? 0.50,
    },
    cost_assumptions: {
      spread_bps: policyOverride.cost_assumptions?.spread_bps ?? chosen?.config?.cost_assumptions?.spread_bps ?? 5.0,
    },
    execution_product: policyOverride.execution_product ?? chosen?.config?.execution_product ?? "NDF",
    min_trade_size_usd: policyOverride.min_trade_size_usd ?? chosen?.config?.min_trade_size_usd ?? 0,
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", fontFamily: S.mono, fontSize: 12, color: S.muted, letterSpacing: "0.12em" }}>LOADING POLICIES...</div>;

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.primary, letterSpacing: "0.08em", marginBottom: 4 }}>
        HEDGE POLICY
      </div>
      <div style={{ fontFamily: S.ui, fontSize: 12, color: S.tertiary, marginBottom: 20 }}>
        Select a policy template or adjust parameters for this calculation run.
      </div>

      {/* Active policy badge */}
      {activePolicy?.template && (
        <div style={{
          padding: "10px 14px", marginBottom: 16, borderRadius: 4,
          background: S.greenDim, border: `1px solid ${S.greenBdr}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.green, letterSpacing: "0.1em" }}>ACTIVE</span>
          <span style={{ fontFamily: S.ui, fontSize: 12, fontWeight: 600, color: S.primary }}>{activePolicy.template.name}</span>
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.tertiary }}>{activePolicy.template.risk_posture}</span>
        </div>
      )}

      {/* Template selector */}
      {templates.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: S.muted, marginBottom: 8 }}>
            AVAILABLE TEMPLATES
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            {templates.slice(0, 8).map(t => {
              const isSel = selectedTemplateId === t.id || (!selectedTemplateId && activePolicy?.template?.id === t.id);
              return (
                <button key={t.id} onClick={() => onSelect(t.id)} style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 4, cursor: "pointer",
                  background: isSel ? S.blueDim : S.panel,
                  border: `1px solid ${isSel ? S.blue : S.rim}`,
                  transition: "all 80ms",
                }}>
                  <div style={{ fontFamily: S.ui, fontSize: 12, fontWeight: 600, color: S.primary }}>{t.name}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.tertiary, background: S.sub, padding: "1px 4px", borderRadius: 2 }}>
                      {t.risk_posture}
                    </span>
                    <span style={{ fontFamily: S.mono, fontSize: 12, color: S.muted }}>
                      {t.config?.hedge_ratios?.confirmed ? `${(t.config.hedge_ratios.confirmed * 100).toFixed(0)}%/${(t.config.hedge_ratios.forecast * 100).toFixed(0)}%` : ""}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Parameter overrides */}
      <div style={{
        padding: 16, background: S.sub, borderRadius: 4,
        border: `1px solid ${S.rim}`,
      }}>
        <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: S.muted, marginBottom: 12 }}>
          CALCULATION PARAMETERS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <ParamField label="Confirmed ratio" value={config.hedge_ratios.confirmed} suffix="%" scale={100}
            onChange={v => onOverride({ hedge_ratios: { ...config.hedge_ratios, confirmed: v / 100 } })} />
          <ParamField label="Forecast ratio" value={config.hedge_ratios.forecast} suffix="%" scale={100}
            onChange={v => onOverride({ hedge_ratios: { ...config.hedge_ratios, forecast: v / 100 } })} />
          <ParamField label="Spread (bps)" value={config.cost_assumptions.spread_bps} suffix="bps" scale={1}
            onChange={v => onOverride({ cost_assumptions: { spread_bps: v } })} />
          <ParamField label="Min trade (USD)" value={config.min_trade_size_usd} suffix="USD" scale={1}
            onChange={v => onOverride({ min_trade_size_usd: v })} />
          <div>
            <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.tertiary, marginBottom: 4, letterSpacing: "0.06em" }}>Execution product</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["NDF", "FWD"] as const).map(prod => (
                <button key={prod} onClick={() => onOverride({ execution_product: prod })} style={{
                  fontFamily: S.mono, fontSize: 12, fontWeight: 600, padding: "4px 14px", borderRadius: 2, cursor: "pointer",
                  background: config.execution_product === prod ? S.blue : S.panel,
                  color: config.execution_product === prod ? "#fff" : S.tertiary,
                  border: `1px solid ${config.execution_product === prod ? S.blue : S.rim}`,
                }}>
                  {prod}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ParamField({ label, value, suffix, scale, onChange }: {
  label: string; value: number; suffix: string; scale: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.tertiary, marginBottom: 4, letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          value={(value * scale).toFixed(scale > 1 ? 0 : 2)}
          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
          style={{
            width: 80, fontFamily: S.mono, fontSize: 12, padding: "4px 8px",
            border: `1px solid ${S.rim}`, borderRadius: 2, background: S.panel,
            color: S.primary, outline: "none",
          }}
        />
        <span style={{ fontFamily: S.mono, fontSize: 12, color: S.muted }}>{suffix}</span>
      </div>
    </div>
  );
}

/* ── Step 2: Market Data ────────────────────────────────────────────────── */
function StepMarket({
  market, onUpdate, currency, loading, onAutoFetch,
}: {
  market: MarketSnapshot;
  onUpdate: (m: MarketSnapshot) => void;
  currency: string;
  loading: boolean;
  onAutoFetch: () => void;
}) {
  const isMobile = useIsMobile();
  const months = Object.keys(market.forward_points_by_month).sort();

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.primary, letterSpacing: "0.08em" }}>
          MARKET DATA
        </div>
        <button onClick={onAutoFetch} disabled={loading} style={{
          fontFamily: S.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
          color: loading ? S.muted : S.blue, background: S.blueDim, border: `1px solid ${S.blueBdr}`,
          padding: "4px 12px", borderRadius: 2, cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "FETCHING..." : "AUTO-FETCH RATES"}
        </button>
      </div>
      <div style={{ fontFamily: S.ui, fontSize: 12, color: S.tertiary, marginBottom: 20 }}>
        Spot rate and forward points for {currency || "selected currency"}. Auto-fetch pulls live data; edit manually if needed.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.tertiary, marginBottom: 4, letterSpacing: "0.06em" }}>SPOT RATE</div>
          <input
            type="number"
            step="0.0001"
            value={market.spot_rate || ""}
            onChange={e => onUpdate({ ...market, spot_rate: parseFloat(e.target.value) || 0 })}
            style={{
              width: "100%", fontFamily: S.mono, fontSize: 14, fontWeight: 600, padding: "8px 12px",
              border: `1px solid ${S.rim}`, borderRadius: 3, background: S.panel, color: S.primary,
              outline: "none",
            }}
          />
        </div>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.tertiary, marginBottom: 4, letterSpacing: "0.06em" }}>AS OF DATE</div>
          <input
            type="date"
            value={market.as_of}
            onChange={e => onUpdate({ ...market, as_of: e.target.value })}
            style={{
              width: "100%", fontFamily: S.mono, fontSize: 13, padding: "8px 12px",
              border: `1px solid ${S.rim}`, borderRadius: 3, background: S.panel, color: S.primary,
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Forward points */}
      <div style={{
        padding: 16, background: S.sub, borderRadius: 4, border: `1px solid ${S.rim}`,
      }}>
        <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: S.muted, marginBottom: 12 }}>
          FORWARD POINTS BY MONTH
        </div>
        {months.length === 0 ? (
          <div style={{ fontFamily: S.ui, fontSize: 12, color: S.muted }}>
            Forward points will be populated based on selected position dates.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {months.map(m => (
              <div key={m}>
                <div style={{ fontFamily: S.mono, fontSize: 12, color: S.muted, marginBottom: 2 }}>{m}</div>
                <input
                  type="number"
                  step="0.0001"
                  value={market.forward_points_by_month[m] ?? ""}
                  onChange={e => {
                    const pts = { ...market.forward_points_by_month, [m]: parseFloat(e.target.value) || 0 };
                    onUpdate({ ...market, forward_points_by_month: pts });
                  }}
                  style={{
                    width: "100%", fontFamily: S.mono, fontSize: 12, padding: "4px 8px",
                    border: `1px solid ${S.rim}`, borderRadius: 2, background: S.panel,
                    color: S.primary, outline: "none",
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provider metadata */}
      <div style={{ marginTop: 12, fontFamily: S.mono, fontSize: 12, color: S.muted, letterSpacing: "0.06em" }}>
        SOURCE: {(market.provider_metadata?.source as string) || "MANUAL"} | DATA CLASS: {(market.provider_metadata?.data_class as string) || "USER_INPUT"}
      </div>
    </div>
  );
}

/* ── Step 3: Review & Calculate ─────────────────────────────────────────── */
function StepReview({
  positions, policy, market, currency, calculating, error, onCalculate,
}: {
  positions: PositionRow[];
  policy: PolicyConfig;
  market: MarketSnapshot;
  currency: string;
  calculating: boolean;
  error: string | null;
  onCalculate: () => void;
}) {
  const isMobile = useIsMobile();
  const totalAR = positions.filter(p => p.type === "AR").reduce((s, p) => s + p.amount, 0);
  const totalAP = positions.filter(p => p.type === "AP").reduce((s, p) => s + p.amount, 0);
  const months = new Set(positions.map(p => p.value_date.slice(0, 7)));

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.primary, letterSpacing: "0.08em", marginBottom: 4 }}>
        REVIEW INPUTS
      </div>
      <div style={{ fontFamily: S.ui, fontSize: 12, color: S.tertiary, marginBottom: 20 }}>
        Confirm all parameters before running the calculation engine.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        <ReviewCard title="POSITIONS" items={[
          `${positions.length} positions`,
          `${currency} AR: ${fmtNum(totalAR)}`,
          `${currency} AP: ${fmtNum(totalAP)}`,
          `${months.size} monthly buckets`,
        ]} color={S.blue} />
        <ReviewCard title="POLICY" items={[
          `Confirmed: ${(policy.hedge_ratios.confirmed * 100).toFixed(0)}%`,
          `Forecast: ${(policy.hedge_ratios.forecast * 100).toFixed(0)}%`,
          `Spread: ${policy.cost_assumptions.spread_bps} bps`,
          `Product: ${policy.execution_product}`,
        ]} color={S.amber} />
        <ReviewCard title="MARKET" items={[
          `Spot: ${market.spot_rate.toFixed(4)}`,
          `As of: ${market.as_of}`,
          `Fwd pts: ${Object.keys(market.forward_points_by_month).length} months`,
          `Source: ${(market.provider_metadata?.source as string) || "MANUAL"}`,
        ]} color={S.green} />
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", marginBottom: 16, borderRadius: 4,
          background: S.redDim, border: `1px solid ${S.redBdr}`,
          fontFamily: S.mono, fontSize: 12, color: S.red, lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={onCalculate}
        disabled={calculating}
        style={{
          width: "100%", height: 48, borderRadius: 4, cursor: calculating ? "default" : "pointer",
          background: calculating ? S.muted : `linear-gradient(135deg, ${S.blue} 0%, ${S.blueLight} 100%)`,
          border: "none", color: S.white,
          fontFamily: S.mono, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em",
          boxShadow: calculating ? "none" : "0 4px 16px rgba(28,98,242,0.30)",
          transition: "all 120ms",
        }}
      >
        {calculating ? "CALCULATING..." : "RUN CALCULATION ENGINE"}
      </button>
    </div>
  );
}

function ReviewCard({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 4, background: S.panel,
      border: `1px solid ${S.rim}`, borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color, marginBottom: 8 }}>{title}</div>
      {items.map((item, i) => (
        <div key={i} style={{ fontFamily: S.mono, fontSize: 12, color: S.secondary, lineHeight: 1.8 }}>{item}</div>
      ))}
    </div>
  );
}

/* ── Step 4: Results ────────────────────────────────────────────────────── */
function StepResults({ result, currency }: { result: CalculateResponse; currency: string }) {
  const isMobile = useIsMobile();
  const { hedge_plan, scenario_results, run_envelope, validation_report } = result;
  const buckets = hedge_plan.buckets;
  const summary = hedge_plan.summary;

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Run header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.primary, letterSpacing: "0.08em" }}>
            HEDGE PLAN RESULTS
          </div>
          <div style={{ fontFamily: S.mono, fontSize: 12, color: S.muted, marginTop: 2 }}>
            RUN {run_envelope.run_id.slice(0, 8)} | ENGINE {run_envelope.engine_version} | {validation_report.status === "PASS" ? "VALIDATED" : "WARNINGS"}
          </div>
        </div>
        <span style={{
          fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          color: validation_report.status === "PASS" ? S.green : S.amber,
          background: validation_report.status === "PASS" ? S.greenDim : S.amberDim,
          border: `1px solid ${validation_report.status === "PASS" ? S.greenBdr : S.amberBdr}`,
          padding: "3px 10px", borderRadius: 2,
        }}>
          {validation_report.status}
        </span>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <KpiBox label="TOTAL EXPOSURE" value={`${currency} ${fmtNum(Math.abs(summary.total_commercial_exposure_mxn))}`} color={S.blue} />
        <KpiBox label="HEDGE ACTION" value={fmtUsd(summary.total_action_usd)} color={S.amber} />
        <KpiBox label="FRICTION COST" value={fmtUsd(summary.total_friction_usd)} color={S.red} />
        <KpiBox label="RESIDUAL" value={`${currency} ${fmtNum(Math.abs(summary.total_residual_mxn))}`} color={summary.total_residual_mxn === 0 ? S.green : S.amber} />
      </div>

      {/* Bucket table */}
      <div style={{
        border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden",
        overflowX: "auto",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "100px repeat(6, 1fr)",
          background: S.sub, padding: "8px 12px",
          borderBottom: `1px solid ${S.rim}`,
        }}>
          {["BUCKET", "EXPOSURE", "EXISTING", "ACTION", "USD EQUIV", "FRICTION", "RESIDUAL"].map(h => (
            <span key={h} style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.muted }}>{h}</span>
          ))}
        </div>
        {buckets.map((b: BucketResult) => (
          <div key={b.bucket} style={{
            display: "grid",
            gridTemplateColumns: "100px repeat(6, 1fr)",
            padding: "8px 12px",
            borderBottom: `1px solid ${S.rim}`,
            background: b.suppressed ? S.amberDim : "transparent",
          }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.primary }}>{b.bucket}</span>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.secondary }}>{fmtNum(b.commercial_exposure_mxn)}</span>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.secondary }}>{fmtNum(b.existing_hedges_mxn)}</span>
            <span style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 600,
              color: b.action_mxn > 0 ? S.green : b.action_mxn < 0 ? S.red : S.muted,
            }}>
              {b.suppressed ? "SUPPRESSED" : fmtNum(b.action_mxn)}
            </span>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.secondary }}>{fmtUsd(b.action_usd)}</span>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.red }}>{fmtUsd(b.friction_usd)}</span>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.secondary }}>{fmtNum(b.residual_mxn)}</span>
          </div>
        ))}
      </div>

      {/* Scenario summary */}
      {scenario_results.totals.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: S.muted, marginBottom: 8 }}>
            SCENARIO STRESS TEST
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {scenario_results.totals.map(t => (
              <div key={t.sigma} style={{
                padding: "10px 12px", background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4,
              }}>
                <div style={{ fontFamily: S.mono, fontSize: 12, color: S.muted, marginBottom: 4 }}>
                  {t.sigma > 0 ? "+" : ""}{(t.sigma * 100).toFixed(0)}% SHOCK
                </div>
                <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.primary }}>
                  Spot: {t.shocked_spot.toFixed(4)}
                </div>
                <div style={{
                  fontFamily: S.mono, fontSize: 12, fontWeight: 600,
                  color: t.total_hedge_benefit_usd >= 0 ? S.green : S.red,
                }}>
                  Benefit: {fmtUsd(t.total_hedge_benefit_usd)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit hash */}
      <div style={{
        marginTop: 20, padding: "10px 14px", background: S.sub, borderRadius: 4,
        fontFamily: S.mono, fontSize: 12, color: S.muted, lineHeight: 1.8,
      }}>
        <span style={{ fontWeight: 700, letterSpacing: "0.08em" }}>AUDIT ENVELOPE</span><br />
        inputs_hash: {run_envelope.inputs_hash?.slice(0, 16)}...<br />
        outputs_hash: {run_envelope.outputs_hash?.slice(0, 16)}...<br />
        run_hash: {(run_envelope as unknown as Record<string, unknown>).run_hash ? String((run_envelope as unknown as Record<string, unknown>).run_hash).slice(0, 16) + "..." : "N/A"}
      </div>
    </div>
  );
}

function KpiBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: "10px 12px", background: S.panel, border: `1px solid ${S.rim}`,
      borderTop: `3px solid ${color}`, borderRadius: 4,
    }}>
      <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 700, color: S.primary }}>{value}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════════ */
export default function CalculateWizardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, token } = useAuth();

  // Step state
  const [step, setStep] = useState<Step>(0);

  // Step 0: Positions
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [posLoading, setPosLoading] = useState(true);
  const [posError, setPosError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Step 1: Policy
  const [activePolicy, setActivePolicy] = useState<PolicyInstance | null>(null);
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [policyOverride, setPolicyOverride] = useState<Partial<PolicyConfig>>({});
  const [polLoading, setPolLoading] = useState(true);

  // Step 2: Market
  const [market, setMarket] = useState<MarketSnapshot>({
    as_of: new Date().toISOString().slice(0, 10),
    spot_rate: 0,
    forward_points_by_month: {},
    provider_metadata: { source: "MANUAL", data_class: "USER_INPUT" },
  });
  const [mktLoading, setMktLoading] = useState(false);

  // Step 3-4: Calculate & Results
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [result, setResult] = useState<CalculateResponse | null>(null);

  // Derived: primary currency
  const selectedPositions = useMemo(
    () => positions.filter(p => selected.has(p.id)),
    [positions, selected]
  );
  const primaryCurrency = useMemo(() => {
    const ccys = new Set(selectedPositions.map(p => p.currency));
    return ccys.size === 1 ? Array.from(ccys)[0] : ccys.size > 0 ? Array.from(ccys)[0] : "MXN";
  }, [selectedPositions]);

  // Load positions
  useEffect(() => {
    if (!token) return;
    setPosLoading(true);
    listPositions(token)
      .then(res => { setPositions(res.items); setPosError(null); })
      .catch(err => setPosError(err?.message || "Failed to load positions"))
      .finally(() => setPosLoading(false));
  }, [token]);

  // Load policies
  useEffect(() => {
    if (!token) return;
    setPolLoading(true);
    Promise.all([
      getActivePolicy(token).catch(() => null),
      listPolicyTemplates(token).catch(() => [] as PolicyTemplate[]),
    ]).then(([active, tmpl]) => {
      setActivePolicy(active);
      setTemplates(tmpl);
    }).finally(() => setPolLoading(false));
  }, [token]);

  // Auto-populate forward points when positions change
  useEffect(() => {
    if (selectedPositions.length === 0) return;
    const months = new Set(selectedPositions.map(p => p.value_date.slice(0, 7)));
    const newPts: Record<string, number> = {};
    const sorted = Array.from(months).sort();
    sorted.forEach((m, i) => {
      newPts[m] = market.forward_points_by_month[m] ?? ((i + 1) * 0.0220);
    });
    setMarket(prev => ({ ...prev, forward_points_by_month: newPts }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPositions.length]);

  // Auto-fetch market data
  const autoFetchMarket = useCallback(async () => {
    if (!token || !primaryCurrency) return;
    setMktLoading(true);
    try {
      const pair = (primaryCurrency as string) === "USD" ? "EURUSD" : `USD${primaryCurrency}`;
      const res = await dashboardFetch(`/api/market/finnhub?symbol=${pair}`, token);
      if (res.ok) {
        const data = await res.json();
        if (data?.c && data.c > 0) {
          setMarket(prev => ({
            ...prev,
            spot_rate: data.c,
            as_of: new Date().toISOString().slice(0, 10),
            provider_metadata: { source: "finnhub_live", data_class: "LIVE", primary_currency: primaryCurrency },
          }));
        }
      }
    } catch { /* swallow — user can enter manually */ }
    setMktLoading(false);
  }, [token, primaryCurrency]);

  // Toggle position selection
  const togglePosition = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const eligible = positions.filter(p => ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE"].includes(p.execution_status));
    if (selected.size === eligible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible.map(p => p.id)));
    }
  }, [positions, selected.size]);

  // Build final PolicyConfig
  const finalPolicy = useMemo((): PolicyConfig => {
    const chosen = selectedTemplateId
      ? templates.find(t => t.id === selectedTemplateId)?.config
      : activePolicy?.template?.config;
    return {
      bucket_mode: "CALENDAR_MONTH",
      hedge_ratios: {
        confirmed: policyOverride.hedge_ratios?.confirmed ?? chosen?.hedge_ratios?.confirmed ?? 0.80,
        forecast:  policyOverride.hedge_ratios?.forecast  ?? chosen?.hedge_ratios?.forecast  ?? 0.50,
      },
      cost_assumptions: {
        spread_bps: policyOverride.cost_assumptions?.spread_bps ?? chosen?.cost_assumptions?.spread_bps ?? 5.0,
      },
      execution_product: policyOverride.execution_product ?? chosen?.execution_product ?? "NDF",
      min_trade_size_usd: policyOverride.min_trade_size_usd ?? chosen?.min_trade_size_usd ?? 0,
    };
  }, [selectedTemplateId, templates, activePolicy, policyOverride]);

  // Run calculation
  const runCalculation = useCallback(async () => {
    if (!token || selectedPositions.length === 0) return;
    setCalculating(true);
    setCalcError(null);

    const trades: TradeRow[] = selectedPositions.map(p => ({
      record_id: p.record_id,
      entity: p.entity,
      type: p.type,
      currency: p.currency,
      amount: p.amount,
      value_date: p.value_date,
      status: p.status,
      description: p.description,
    }));

    try {
      const res = await calculate({ trades, hedges: [], market, policy: finalPolicy, pair: `USD${primaryCurrency}` }, token);
      setResult(res);
      setStep(4);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Calculation failed";
      // Try to extract backend error detail
      const axErr = err as { response?: { data?: { detail?: string } } };
      setCalcError(axErr?.response?.data?.detail || msg);
    } finally {
      setCalculating(false);
    }
  }, [token, selectedPositions, market, finalPolicy, primaryCurrency]);

  // Navigation guards
  const canAdvance = (s: Step): boolean => {
    if (s === 0) return selected.size > 0;
    if (s === 1) return true; // policy always has defaults
    if (s === 2) return market.spot_rate > 0;
    if (s === 3) return true;
    return false;
  };

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated || !user || !token) {
    return (

    
      <div style={{
        height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: S.bg, fontFamily: S.mono, fontSize: 12, color: S.muted, letterSpacing: "0.14em",
      }}>
        LOADING...
      </div>
    
    
    );
  }

  return (
    <PageShell icon={LayoutDashboard} title="Calculate" breadcrumb={["Dashboard", "Calculate"]} noPadding>

    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: S.bg, overflow: "hidden",
    }}>
      {/* Workflow breadcrumb + guide */}
      <WorkflowBreadcrumb active="calculate" />
      <WorkflowGuide active="calculate" />

      {/* Step bar */}
      <StepBar step={step} onStep={setStep} />

      {/* Content area */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {step === 0 && (
          <StepPositions
            positions={positions} selected={selected}
            onToggle={togglePosition} onSelectAll={selectAll}
            loading={posLoading} error={posError}
          />
        )}
        {step === 1 && (
          <StepPolicy
            activePolicy={activePolicy} templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
            policyOverride={policyOverride}
            onOverride={patch => setPolicyOverride(prev => ({ ...prev, ...patch }))}
            loading={polLoading}
          />
        )}
        {step === 2 && (
          <StepMarket
            market={market} onUpdate={setMarket}
            currency={primaryCurrency} loading={mktLoading}
            onAutoFetch={autoFetchMarket}
          />
        )}
        {step === 3 && (
          <StepReview
            positions={selectedPositions} policy={finalPolicy}
            market={market} currency={primaryCurrency}
            calculating={calculating} error={calcError}
            onCalculate={runCalculation}
          />
        )}
        {step === 4 && result && (
          <StepResults result={result} currency={primaryCurrency} />
        )}
      </div>

      {/* Bottom nav */}
      {step < 4 && (
        <div style={{
          height: 56, flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 24px",
          background: S.panel, borderTop: `1px solid ${S.rim}`,
        }}>
          <button
            onClick={() => step > 0 ? setStep((step - 1) as Step) : router.push("/position-desk")}
            style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
              color: S.tertiary, background: "none", border: `1px solid ${S.rim}`,
              padding: "6px 18px", borderRadius: 2, cursor: "pointer",
            }}
          >
            {step === 0 ? "POSITION DESK" : "BACK"}
          </button>

          {step < 3 && (
            <button
              onClick={() => canAdvance(step) && setStep((step + 1) as Step)}
              disabled={!canAdvance(step)}
              style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                color: canAdvance(step) ? "#fff" : S.muted,
                background: canAdvance(step) ? S.blue : S.sub,
                border: "none", padding: "6px 24px", borderRadius: 2,
                cursor: canAdvance(step) ? "pointer" : "default",
                transition: "all 80ms",
              }}
            >
              NEXT: {STEP_LABELS[step + 1]}
            </button>
          )}
          {step === 3 && (
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.muted }}>
              Press the calculate button above to run
            </span>
          )}
        </div>
      )}

      {/* Results bottom nav */}
      {step === 4 && (
        <div style={{
          height: 56, flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 24px",
          background: S.panel, borderTop: `1px solid ${S.rim}`,
        }}>
          <button
            onClick={() => { setResult(null); setStep(0); }}
            style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
              color: S.tertiary, background: "none", border: `1px solid ${S.rim}`,
              padding: "6px 18px", borderRadius: 2, cursor: "pointer",
            }}
          >
            NEW CALCULATION
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => router.push("/results")}
              style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
                color: S.blue, background: S.blueDim, border: `1px solid ${S.blueBdr}`,
                padding: "6px 18px", borderRadius: 2, cursor: "pointer",
              }}
            >
              COMMITTEE PACK
            </button>
            <button
              onClick={() => router.push("/hedge-desk")}
              style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                color: S.white, background: S.blue, border: "none",
                padding: "6px 24px", borderRadius: 2, cursor: "pointer",
              }}
            >
              HEDGE DESK
            </button>
          </div>
        </div>
      )}
    </div>
  
    </PageShell>
  );
}
