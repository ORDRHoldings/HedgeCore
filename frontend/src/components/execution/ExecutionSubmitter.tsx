"use client";

/**
 * ExecutionSubmitter.tsx — Order Submission + Status Tracker
 *
 * Institutional-grade order submission panel that sits below ExecutionBridge.
 * Collects all approved BucketTickets from the execution plan, allows the user
 * to submit each order (to IBKR TWS, FX desk email, or FIX gateway), and tracks
 * per-order lifecycle state through PENDING → SUBMITTED → FILLED → SETTLED.
 *
 * Architecture:
 * - Pure client-side state machine (no backend order tracking in this version)
 * - Order state persisted to localStorage keyed by runId
 * - Submission modes:
 *     IBKR TWS   → window.open(ibkrFXTraderUrl) or copyJSON
 *     FX Desk    → mailto: with pre-populated JSON body
 *     Manual     → copy-to-clipboard + user confirms fill
 * - Fill reconciliation: user enters fill price, notional filled; system computes
 *   execution slippage vs forward rate
 *
 * Props:
 *   runId          — hedge plan run identifier
 *   buckets        — BucketResult[] from the engine (non-suppressed, non-zero action)
 *   mappings       — InstrumentMapping[] parallel to buckets
 *   authReady      — true when pre-flight checklist is complete
 *   fxDeskEmail    — from Settings (optional)
 *   ibkrAccountId  — from Settings (optional)
 */

import { useState, useCallback, useEffect } from "react";
import type { BucketResult } from "../../api/types";
import type { InstrumentMapping } from "../../utils/symbolMapper";

// ── Design tokens ──────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:  "var(--bg-panel,#141618)",
  bgSub:    "var(--bg-sub,#1A1D21)",
  rim:      "var(--border-rim,#2A2D34)",
  soft:     "var(--border-soft,#1F2228)",
  primary:  "var(--text-primary,#E8EAF0)",
  secondary:"var(--text-secondary,#9CA3AF)",
  tertiary: "var(--text-tertiary,#6B7280)",
  cyan:     "var(--accent-cyan,#06B6D4)",
  amber:    "var(--accent-amber,#F59E0B)",
  pass:     "var(--status-pass,#10B981)",
  fail:     "var(--accent-red,#EF4444)",
  violet:   "#3B82F6",
} as const;

// ── Order lifecycle ────────────────────────────────────────────────────────────
export type OrderStatus =
  | "PENDING"
  | "SUBMITTED"
  | "ACKNOWLEDGED"
  | "FILLED"
  | "PARTIAL_FILL"
  | "SETTLED"
  | "CANCELLED"
  | "REJECTED";

const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING:      S.tertiary,
  SUBMITTED:    S.cyan,
  ACKNOWLEDGED: S.violet,
  FILLED:       S.pass,
  PARTIAL_FILL: S.amber,
  SETTLED:      "#10B981",
  CANCELLED:    S.tertiary,
  REJECTED:     S.fail,
};

export type SubmitMode = "IBKR_TWS" | "FX_DESK" | "MANUAL";

export interface OrderRecord {
  orderId:       string;   // ORDR-{runId8}-{bucket}
  bucket:        string;
  status:        OrderStatus;
  side:          string;
  notional_usd:  number;
  ibkr_symbol:   string | null;
  contracts:     number | null;
  forward_rate:  number;
  submittedAt:   string | null;
  acknowledgedAt:string | null;
  fillPrice:     number | null;
  fillNotional:  number | null;
  settledAt:     string | null;
  slippage_bps:  number | null;
  notes:         string;
  mode:          SubmitMode | null;
}

interface FillModalState {
  orderId:     string;
  fillPrice:   string;
  fillNotional:string;
  notes:       string;
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface ExecutionSubmitterProps {
  runId:         string;
  buckets:       BucketResult[];
  mappings:      InstrumentMapping[];
  authReady:     boolean;
  fxDeskEmail?:  string;
  ibkrAccountId?:string;
  defaultMode?:  SubmitMode;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, dp = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function buildOrderId(runId: string, bucket: string): string {
  return `ORDR-${runId.slice(0, 8).toUpperCase()}-${bucket}`;
}

function buildIbkrFXTraderUrl(
  ibkrSymbol: string,
  side: string,
  notionalUsd: number,
): string {
  return `https://ndg.interactivebrokers.com/fxtrader?pair=${ibkrSymbol}&side=${side}&notional=${Math.abs(notionalUsd).toFixed(0)}`;
}

function buildMailtoUrl(
  fxDeskEmail: string,
  order: OrderRecord,
  mapping: InstrumentMapping,
  accountId: string,
): string {
  const subject = encodeURIComponent(`FX Hedge Order — ${order.orderId}`);
  const body = encodeURIComponent(
    `ORDR Execution Request\n` +
    `Order ID:   ${order.orderId}\n` +
    `Symbol:     ${order.ibkr_symbol ?? mapping.tradingview_symbol}\n` +
    `Side:       ${order.side}\n` +
    `Notional:   USD ${Math.abs(order.notional_usd).toLocaleString()}\n` +
    (order.contracts ? `Contracts:  ${order.contracts}\n` : "") +
    `Forward Rate: ${order.forward_rate}\n` +
    `\nPlease confirm acknowledgement and provide fill details.\n`,
  );
  return `mailto:${fxDeskEmail}?subject=${subject}&body=${body}`;
}

function copyToClipboard(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  });
}

// ── ExecutionSubmitter ────────────────────────────────────────────────────────
export default function ExecutionSubmitter({
  runId,
  buckets,
  mappings,
  authReady,
  fxDeskEmail,
  ibkrAccountId,
  defaultMode = "MANUAL",
}: ExecutionSubmitterProps) {
  const STORAGE_KEY = `ordr_orders_${runId.slice(0, 16)}`;

  const [mode, setMode]           = useState<SubmitMode>(defaultMode);
  const [orders, setOrders]       = useState<OrderRecord[]>([]);
  const [fillModal, setFillModal] = useState<FillModalState | null>(null);
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Initialise order records from buckets (or restore from localStorage)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setOrders(JSON.parse(saved) as OrderRecord[]); return; } catch { /* fallback */ }
    }
    const initial: OrderRecord[] = buckets
      .filter(b => !b.suppressed && Math.abs(b.action_usd) > 0 && b.action_direction)
      .map((b, i) => {
        const m = mappings[i] ?? mappings[0];
        return {
          orderId:        buildOrderId(runId, b.bucket),
          bucket:         b.bucket,
          status:         "PENDING",
          side:           b.action_direction ?? "BUY",
          notional_usd:   b.action_usd,
          ibkr_symbol:    m?.ibkr_symbol ?? null,
          contracts:      m?.suggested_contracts ?? null,
          forward_rate:   b.forward_rate,
          submittedAt:    null,
          acknowledgedAt: null,
          fillPrice:      null,
          fillNotional:   null,
          settledAt:      null,
          slippage_bps:   null,
          notes:          "",
          mode:           null,
        };
      });
    setOrders(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Persist on change
  useEffect(() => {
    if (orders.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }, [orders, STORAGE_KEY]);

  const updateOrder = useCallback((orderId: string, patch: Partial<OrderRecord>) => {
    setOrders(prev => prev.map(o => o.orderId === orderId ? { ...o, ...patch } : o));
  }, []);

  const handleSubmit = useCallback((order: OrderRecord, m: InstrumentMapping) => {
    if (!authReady) return;
    const now = new Date().toISOString();

    if (mode === "IBKR_TWS" && order.ibkr_symbol) {
      const url = buildIbkrFXTraderUrl(order.ibkr_symbol, order.side, order.notional_usd);
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (mode === "FX_DESK" && fxDeskEmail) {
      const mailto = buildMailtoUrl(fxDeskEmail, order, m, ibkrAccountId ?? "");
      window.open(mailto);
    } else {
      // MANUAL — copy JSON payload
      const payload = {
        account:     ibkrAccountId ?? "<YOUR_IBKR_ACCOUNT>",
        conid:       "<look up in TWS>",
        secType:     m.ibkr_symbol !== null && !m.ibkr_symbol.includes("/") ? "FUT" : "CASH",
        symbol:      order.ibkr_symbol ?? m.tradingview_symbol,
        exchange:    m.ibkr_symbol !== null && !m.ibkr_symbol.includes("/") ? "CME" : "IDEALPRO",
        currency:    "USD",
        orderType:   "MKT",
        side:        order.side,
        quantity:    order.contracts ?? Math.abs(order.notional_usd / 1000),
        tif:         "DAY",
        outsideRth:  false,
        referenceId: order.orderId,
        notes:       `Hedge ${order.bucket} | Run ${runId.slice(0, 8)}`,
      };
      copyToClipboard(JSON.stringify(payload, null, 2));
      setCopyFlash(order.orderId);
      setTimeout(() => setCopyFlash(null), 2000);
    }

    updateOrder(order.orderId, { status: "SUBMITTED", submittedAt: now, mode });
  }, [mode, authReady, fxDeskEmail, ibkrAccountId, runId, updateOrder]);

  const handleMarkFilled = useCallback(() => {
    if (!fillModal) return;
    const fillPrice = Number(fillModal.fillPrice);
    const fillNotional = Number(fillModal.fillNotional) || undefined;
    const order = orders.find(o => o.orderId === fillModal.orderId);
    if (!order) return;

    // Compute slippage: (fillPrice - forwardRate) / forwardRate * 10000 bps
    let slippage: number | null = null;
    if (fillPrice > 0 && order.forward_rate > 0) {
      const rawSlippage = ((fillPrice - order.forward_rate) / order.forward_rate) * 10_000;
      slippage = Math.round(rawSlippage * 10) / 10;
      // Adjust sign: BUY = worse if fill > fwd, SELL = worse if fill < fwd
      if (order.side === "SELL") slippage = -slippage;
    }

    updateOrder(fillModal.orderId, {
      status:        fillNotional && fillNotional < Math.abs(order.notional_usd) * 0.99 ? "PARTIAL_FILL" : "FILLED",
      fillPrice,
      fillNotional:  fillNotional ?? Math.abs(order.notional_usd),
      slippage_bps:  slippage,
      acknowledgedAt: new Date().toISOString(),
      notes:         fillModal.notes,
    });
    setFillModal(null);
  }, [fillModal, orders, updateOrder]);

  const handleMarkSettled = useCallback((orderId: string) => {
    updateOrder(orderId, { status: "SETTLED", settledAt: new Date().toISOString() });
  }, [updateOrder]);

  const handleCancel = useCallback((orderId: string) => {
    updateOrder(orderId, { status: "CANCELLED" });
  }, [updateOrder]);

  // Summary stats
  const pending   = orders.filter(o => o.status === "PENDING").length;
  const submitted = orders.filter(o => ["SUBMITTED", "ACKNOWLEDGED"].includes(o.status)).length;
  const filled    = orders.filter(o => ["FILLED", "PARTIAL_FILL"].includes(o.status)).length;
  const settled   = orders.filter(o => o.status === "SETTLED").length;
  const cancelled = orders.filter(o => ["CANCELLED", "REJECTED"].includes(o.status)).length;

  const avgSlippage = (() => {
    const filled_orders = orders.filter(o => o.slippage_bps !== null);
    if (filled_orders.length === 0) return null;
    return filled_orders.reduce((a, o) => a + (o.slippage_bps ?? 0), 0) / filled_orders.length;
  })();

  if (orders.length === 0) return null;

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`,
      borderRadius: 3, overflow: "hidden",
    }}>
      {/* Header */}
      <div
        style={{
          padding: "10px 16px", borderBottom: collapsed ? "none" : `1px solid ${S.rim}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer",
        }}
        onClick={() => setCollapsed(p => !p)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
            ORDER SUBMISSION &amp; STATUS TRACKER
          </span>
          {/* KPI chips */}
          {[
            { label: "PENDING",   val: pending,   color: S.tertiary },
            { label: "SUBMITTED", val: submitted, color: S.cyan   },
            { label: "FILLED",    val: filled,    color: S.pass   },
            { label: "SETTLED",   val: settled,   color: "#10B981" },
            { label: "CANCELLED", val: cancelled, color: S.amber  },
          ].filter(c => c.val > 0).map(c => (
            <span key={c.label} style={{
              fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: c.color,
              background: `color-mix(in srgb, ${c.color} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${c.color} 25%, transparent)`,
              padding: "1px 6px", borderRadius: 2, letterSpacing: "0.05em",
            }}>
              {c.val} {c.label}
            </span>
          ))}
          {avgSlippage !== null && (
            <span style={{
              fontFamily: S.fontMono, fontSize: 9, color: Math.abs(avgSlippage) > 5 ? S.amber : S.pass,
            }}>
              AVG SLIPPAGE: {avgSlippage > 0 ? "+" : ""}{avgSlippage.toFixed(1)} bps
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!authReady && (
            <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.amber }}>
              AWAITING PRE-FLIGHT AUTH
            </span>
          )}
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {collapsed ? "▼ EXPAND" : "▲ COLLAPSE"}
          </span>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Mode selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary }}>
              SUBMIT VIA
            </span>
            {(["IBKR_TWS", "FX_DESK", "MANUAL"] as SubmitMode[]).map(m => (
              <button
                key={m}
                onClick={e => { e.stopPropagation(); setMode(m); }}
                style={{
                  fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                  color: mode === m ? "#000" : S.secondary,
                  background: mode === m ? S.cyan : "transparent",
                  border: `1px solid ${mode === m ? S.cyan : S.rim}`,
                  borderRadius: 2, padding: "4px 12px", cursor: "pointer",
                }}
              >
                {m === "IBKR_TWS" ? "IBKR FXTRADER" : m === "FX_DESK" ? "FX DESK EMAIL" : "MANUAL / COPY JSON"}
              </button>
            ))}
            {mode === "FX_DESK" && !fxDeskEmail && (
              <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.amber }}>
                ⚠ Set FX desk email in Settings → Execution
              </span>
            )}
            {mode === "IBKR_TWS" && !ibkrAccountId && (
              <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.amber }}>
                ⚠ Set IBKR account ID in Settings → Execution
              </span>
            )}
          </div>

          {/* Order rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {orders.map((order, i) => {
              const m = mappings[i] ?? mappings[0];
              const statusColor = ORDER_STATUS_COLORS[order.status];
              const isActive    = !["SETTLED", "CANCELLED", "REJECTED"].includes(order.status);
              const canSubmit   = authReady && order.status === "PENDING";
              const canFill     = ["SUBMITTED", "ACKNOWLEDGED"].includes(order.status);
              const canSettle   = ["FILLED", "PARTIAL_FILL"].includes(order.status);
              const flashing    = copyFlash === order.orderId;

              return (
                <div
                  key={order.orderId}
                  style={{
                    background: S.bgSub, border: `1px solid ${S.soft}`,
                    borderLeft: `3px solid ${statusColor}`,
                    borderRadius: 2, padding: "10px 14px",
                    opacity: isActive ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    {/* Order ID */}
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, minWidth: 180 }}>
                      {order.orderId}
                    </span>

                    {/* Symbol + side */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
                        color: order.side === "BUY" ? S.pass : S.fail,
                        background: `color-mix(in srgb, ${order.side === "BUY" ? S.pass : S.fail} 10%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${order.side === "BUY" ? S.pass : S.fail} 25%, transparent)`,
                        padding: "1px 7px", borderRadius: 2,
                      }}>
                        {order.side}
                      </span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary }}>
                        {order.ibkr_symbol ?? m?.tradingview_symbol ?? order.bucket}
                      </span>
                      {order.contracts && (
                        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                          {order.contracts} contracts
                        </span>
                      )}
                      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                        {fmtUsd(Math.abs(order.notional_usd))}
                      </span>
                    </div>

                    {/* Forward rate */}
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                      FWD {order.forward_rate.toFixed(4)}
                    </span>

                    {/* Fill info */}
                    {order.fillPrice && (
                      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: order.slippage_bps !== null && Math.abs(order.slippage_bps) > 5 ? S.amber : S.pass }}>
                        FILL {order.fillPrice.toFixed(4)}
                        {order.slippage_bps !== null && ` (${order.slippage_bps > 0 ? "+" : ""}${order.slippage_bps.toFixed(1)} bps)`}
                      </span>
                    )}

                    {/* Status badge */}
                    <span style={{ flex: 1 }} />
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                      color: statusColor,
                      background: `color-mix(in srgb, ${statusColor} 10%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${statusColor} 25%, transparent)`,
                      padding: "1px 6px", borderRadius: 2, letterSpacing: "0.05em", whiteSpace: "nowrap",
                    }}>
                      {order.status}
                    </span>

                    {/* Timestamps */}
                    {order.submittedAt && (
                      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, whiteSpace: "nowrap" }}>
                        {new Date(order.submittedAt).toLocaleTimeString()}
                      </span>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {canSubmit && (
                        <button
                          onClick={() => handleSubmit(order, m)}
                          style={{
                            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                            color: "#000", background: S.cyan, border: "none",
                            borderRadius: 2, padding: "4px 10px", cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {flashing ? "✓ COPIED" : mode === "MANUAL" ? "COPY & SUBMIT" : "SUBMIT →"}
                        </button>
                      )}
                      {canFill && (
                        <button
                          onClick={() => setFillModal({ orderId: order.orderId, fillPrice: "", fillNotional: "", notes: "" })}
                          style={{
                            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                            color: S.pass, background: "transparent",
                            border: `1px solid ${S.pass}`, borderRadius: 2,
                            padding: "4px 10px", cursor: "pointer",
                          }}
                        >
                          MARK FILLED
                        </button>
                      )}
                      {canSettle && (
                        <button
                          onClick={() => handleMarkSettled(order.orderId)}
                          style={{
                            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                            color: "#10B981", background: "transparent",
                            border: `1px solid #10B981`, borderRadius: 2,
                            padding: "4px 10px", cursor: "pointer",
                          }}
                        >
                          MARK SETTLED
                        </button>
                      )}
                      {["PENDING", "SUBMITTED"].includes(order.status) && (
                        <button
                          onClick={() => handleCancel(order.orderId)}
                          style={{
                            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                            color: S.fail, background: "transparent",
                            border: `1px solid ${S.fail}40`, borderRadius: 2,
                            padding: "4px 10px", cursor: "pointer",
                          }}
                        >
                          CANCEL
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  {order.notes && (
                    <div style={{ marginTop: 4, fontFamily: S.fontUI, fontSize: 10, color: S.tertiary }}>
                      {order.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reconciliation summary */}
          {filled > 0 && (
            <div style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2,
              padding: "10px 14px",
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 8 }}>
                FILL RECONCILIATION
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {[
                  { label: "ORDERS FILLED", value: `${filled}/${orders.length}`, color: S.pass },
                  { label: "ORDERS SETTLED", value: `${settled}`, color: "#10B981" },
                  {
                    label: "AVG SLIPPAGE",
                    value: avgSlippage !== null
                      ? `${avgSlippage > 0 ? "+" : ""}${avgSlippage.toFixed(1)} bps`
                      : "—",
                    color: avgSlippage !== null && Math.abs(avgSlippage) > 5 ? S.amber : S.pass,
                  },
                  {
                    label: "TOTAL NOTIONAL FILLED",
                    value: fmtUsd(
                      orders
                        .filter(o => o.fillNotional !== null)
                        .reduce((a, o) => a + (o.fillNotional ?? 0), 0),
                    ),
                    color: S.cyan,
                  },
                ].map(k => (
                  <div key={k.label}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.07em", marginBottom: 2 }}>
                      {k.label}
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color: k.color }}>
                      {k.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fill Modal */}
      {fillModal && (() => {
        const order = orders.find(o => o.orderId === fillModal.orderId);
        if (!order) return null;
        return (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9000,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
            onClick={() => setFillModal(null)}
          >
            <div
              style={{
                background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3,
                padding: 24, width: 440, maxWidth: "90vw",
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary, marginBottom: 16 }}>
                MARK FILLED — {order.orderId}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.secondary, display: "block", marginBottom: 4, letterSpacing: "0.06em" }}>
                    FILL PRICE
                  </label>
                  <input
                    type="number" step="0.0001"
                    value={fillModal.fillPrice}
                    onChange={e => setFillModal(p => p ? { ...p, fillPrice: e.target.value } : p)}
                    placeholder={`e.g. ${order.forward_rate.toFixed(4)}`}
                    style={{
                      width: "100%", fontFamily: S.fontMono, fontSize: 12, color: S.primary,
                      background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
                      padding: "6px 10px", outline: "none", boxSizing: "border-box",
                    }}
                  />
                  {fillModal.fillPrice && order.forward_rate > 0 && (() => {
                    const fp = Number(fillModal.fillPrice);
                    const slip = ((fp - order.forward_rate) / order.forward_rate) * 10_000;
                    const adj = order.side === "SELL" ? -slip : slip;
                    return (
                      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: Math.abs(adj) > 5 ? S.amber : S.pass, marginTop: 3 }}>
                        Slippage: {adj > 0 ? "+" : ""}{adj.toFixed(1)} bps vs forward rate {order.forward_rate.toFixed(4)}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.secondary, display: "block", marginBottom: 4, letterSpacing: "0.06em" }}>
                    FILL NOTIONAL (USD) — leave blank for full fill
                  </label>
                  <input
                    type="number"
                    value={fillModal.fillNotional}
                    onChange={e => setFillModal(p => p ? { ...p, fillNotional: e.target.value } : p)}
                    placeholder={`${Math.abs(order.notional_usd).toFixed(0)}`}
                    style={{
                      width: "100%", fontFamily: S.fontMono, fontSize: 12, color: S.primary,
                      background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
                      padding: "6px 10px", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.secondary, display: "block", marginBottom: 4, letterSpacing: "0.06em" }}>
                    NOTES (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    value={fillModal.notes}
                    onChange={e => setFillModal(p => p ? { ...p, notes: e.target.value } : p)}
                    placeholder="e.g. Filled via IBKR TWS, partial fill reason…"
                    style={{
                      width: "100%", fontFamily: S.fontUI, fontSize: 12, color: S.primary,
                      background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
                      padding: "6px 10px", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={handleMarkFilled}
                    disabled={!fillModal.fillPrice}
                    style={{
                      flex: 1, fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                      color: "#000", background: fillModal.fillPrice ? S.pass : S.tertiary,
                      border: "none", borderRadius: 2, padding: "8px",
                      cursor: fillModal.fillPrice ? "pointer" : "not-allowed",
                    }}
                  >
                    CONFIRM FILL
                  </button>
                  <button
                    onClick={() => setFillModal(null)}
                    style={{
                      fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                      color: S.secondary, background: "transparent",
                      border: `1px solid ${S.rim}`, borderRadius: 2, padding: "8px 16px",
                      cursor: "pointer",
                    }}
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
