"use client";

import { useState } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { BucketResult } from "@/api/types";
import {
  CheckCircleIcon, AlertCircleIcon, LoaderIcon, ChevronLeftIcon,
  CopyIcon, ExternalLinkIcon, ShieldCheckIcon, UserCheckIcon,
} from "lucide-react";

// ─── Design tokens ──────────────────────────────────────────────────────────
const S = {
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  bgDeep:    "var(--bg-deep)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red,#E74C3C)",
  green:     "var(--status-pass,#22c55e)",
  mono:      "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui:        "var(--font-terminal,'IBM Plex Sans',sans-serif)",
} as const;

// ─── CME contract specifications ────────────────────────────────────────────
const CME_SPECS: Record<string, {
  symbol: string; name: string; contract_size: number;
  currency: string; margin_est: number; tick_size: number; tick_value: number;
}> = {
  MXN: { symbol: "M6M", name: "Mexican Peso Futures",      contract_size: 500_000,   currency: "MXN", margin_est: 1800, tick_size: 0.000025,  tick_value: 12.50 },
  EUR: { symbol: "6E",  name: "Euro FX Futures",           contract_size: 125_000,   currency: "EUR", margin_est: 2200, tick_size: 0.00005,   tick_value: 6.25  },
  GBP: { symbol: "6B",  name: "British Pound Futures",     contract_size: 62_500,    currency: "GBP", margin_est: 1900, tick_size: 0.0001,    tick_value: 6.25  },
  JPY: { symbol: "6J",  name: "Japanese Yen Futures",      contract_size: 12_500_000, currency: "JPY", margin_est: 2000, tick_size: 0.0000005, tick_value: 6.25  },
  CAD: { symbol: "6C",  name: "Canadian Dollar Futures",   contract_size: 100_000,   currency: "CAD", margin_est: 1500, tick_size: 0.00005,   tick_value: 5.00  },
  CHF: { symbol: "6S",  name: "Swiss Franc Futures",       contract_size: 125_000,   currency: "CHF", margin_est: 2100, tick_size: 0.0001,    tick_value: 12.50 },
  AUD: { symbol: "6A",  name: "Australian Dollar Futures", contract_size: 100_000,   currency: "AUD", margin_est: 1400, tick_size: 0.0001,    tick_value: 10.00 },
  NZD: { symbol: "6N",  name: "NZ Dollar Futures",         contract_size: 100_000,   currency: "NZD", margin_est: 1300, tick_size: 0.0001,    tick_value: 10.00 },
};

const DEFAULT_SPEC = CME_SPECS.MXN;

// ─── IBKR deep link helpers ──────────────────────────────────────────────────
function ibkrNativeUrl(
  spec: typeof CME_SPECS[string],
  side: string,
  qty: number,
  rate: number,
): string {
  return `ibkr://order?symbol=${spec.symbol}&secType=FUT&exchange=CME&side=${side}&quantity=${qty}&orderType=LMT&lmtPrice=${rate.toFixed(5)}&currency=USD&tif=GTC`;
}

function openIbkr(spec: typeof CME_SPECS[string], side: string, qty: number, rate: number): void {
  const native = ibkrNativeUrl(spec, side, qty, rate);
  const web = `https://www.interactivebrokers.com/en/trading/order-ticket.php?symbol=${spec.symbol}&side=${side}&quantity=${qty}`;
  window.open(native, "_self");
  setTimeout(() => window.open(web, "_blank", "noopener,noreferrer"), 2000);
}

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmt(n: number, dec = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: dec }).format(n);
}
function fmtUsd(n: number): string {
  return "$" + fmt(Math.abs(n), 0);
}
function fmtRate(n: number): string {
  return n.toFixed(4);
}

// ─── Trade history entry ─────────────────────────────────────────────────────
interface TradeHistoryEntry {
  id: string;
  timestamp: string;
  run_id: string;
  positions: string[];
  legs: Array<{
    bucket: string;
    symbol: string;
    contracts: number;
    forward_rate: number;
    action_usd: number;
    action_mxn: number;
    margin_req: number;
    side: string;
  }>;
  total_contracts: number;
  total_action_usd: number;
  total_margin: number;
  risk_verdict: string;
  fill_price?: number;
  status: "HEDGED";
}

function saveTradeHistory(entry: TradeHistoryEntry): void {
  try {
    const existing: TradeHistoryEntry[] = JSON.parse(
      localStorage.getItem("ordr_trade_history") ?? "[]"
    );
    existing.unshift(entry);
    localStorage.setItem("ordr_trade_history", JSON.stringify(existing.slice(0, 100)));
  } catch {
    // localStorage may be unavailable
  }
}

// ─── Ticket metrics ──────────────────────────────────────────────────────────
interface TicketMetrics {
  spec: typeof CME_SPECS[string];
  side: string;
  contracts: number;
  margin: number;
  notional: number;
  estCost: number;
  hedgeEffectiveness: string;
  currency: string;
}

function computeTicket(bucket: BucketResult): TicketMetrics {
  const currency = "MXN"; // default — extend when multi-currency lands
  const spec = CME_SPECS[currency] ?? DEFAULT_SPEC;
  const contracts = Math.max(1, Math.ceil(Math.abs(bucket.action_mxn) / spec.contract_size));
  const margin = contracts * spec.margin_est;
  const notional = contracts * spec.contract_size;
  const estCost = Math.abs(bucket.action_usd) * 0.0005;
  const hedgeEffectiveness = Math.min(
    100,
    (notional / Math.abs(bucket.action_mxn || 1)) * 100,
  ).toFixed(1);
  const side = bucket.action_direction === "SELL_MXN_BUY_USD" ? "SELL" : "BUY";
  return { spec, side, contracts, margin, notional, estCost, hedgeEffectiveness, currency };
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface PhaseExecuteProps {
  proposalIds: string[];
  calcResult: Record<string, unknown>;
  token: string;
  governanceMode: "solo" | "team";
  onComplete: (fillData: { fillPrice: number; proposalIds: string[] }) => void;
  onBack: () => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 3,
      padding: "10px 14px",
      borderRight: `1px solid var(--border-soft)`,
    }}>
      <span style={{
        fontFamily: S.mono, fontSize: 10, letterSpacing: "0.1em",
        color: S.tertiary, textTransform: "uppercase",
      }}>{label}</span>
      <span style={{
        fontFamily: S.mono, fontSize: 15, fontWeight: 700,
        color: accent ?? S.primary,
      }}>{value}</span>
    </div>
  );
}

interface TicketCardProps {
  bucket: BucketResult;
  index: number;
  fillPrice: string;
}

function TicketCard({ bucket, index, fillPrice }: TicketCardProps) {
  const [copied, setCopied] = useState(false);
  const m = computeTicket(bucket);
  const displayRate = fillPrice && parseFloat(fillPrice) > 0
    ? parseFloat(fillPrice)
    : bucket.forward_rate;

  const bucketLabel = bucket.bucket ?? `BUCKET ${index + 1}`;

  const dirLabel = m.side === "SELL"
    ? "SELL MXN / BUY USD"
    : "BUY MXN / SELL USD";

  const copyTicket = () => {
    const text = [
      `TICKET #${index + 1} — ${bucketLabel}`,
      `Instrument: ${m.spec.symbol} — ${m.spec.name} (CME)`,
      `Direction: ${dirLabel}`,
      `Contracts: ${m.contracts}`,
      `Forward Rate: ${fmtRate(displayRate)}`,
      `Notional: ${fmt(m.notional)} ${m.currency}`,
      `Contract Size: ${fmt(m.spec.contract_size)} ${m.currency}`,
      `Total USD: ${fmtUsd(bucket.action_usd)}`,
      `Margin Req: ${fmtUsd(m.margin)}`,
      `Tick Size: ${m.spec.tick_size}`,
      `Tick Value: $${m.spec.tick_value}`,
      `Est Cost: ${fmtUsd(m.estCost)}`,
      `Hedge Effectiveness: ${m.hedgeEffectiveness}%`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  };

  return (
    <div style={{
      background: S.bgPanel,
      border: `1px solid var(--border-rim)`,
      borderRadius: 4,
      overflow: "hidden",
    }}>
      {/* Ticket header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        background: S.bgSub,
        borderBottom: `1px solid var(--border-rim)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontFamily: S.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.12em", color: S.tertiary,
          }}>
            TICKET #{index + 1}
          </span>
          <span style={{
            width: 1, height: 12, background: "var(--border-soft)",
            display: "inline-block",
          }} />
          <span style={{
            fontFamily: S.mono, fontSize: 12, fontWeight: 600,
            color: S.primary, letterSpacing: "0.06em",
          }}>
            {bucketLabel.toUpperCase()}
          </span>
        </div>
        <span style={{
          fontFamily: S.mono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.1em",
          color: m.side === "SELL" ? S.red : S.cyan,
          background: m.side === "SELL"
            ? "color-mix(in srgb, var(--accent-red,#E74C3C) 10%, transparent)"
            : "color-mix(in srgb, var(--accent-cyan) 10%, transparent)",
          border: m.side === "SELL"
            ? "1px solid color-mix(in srgb, var(--accent-red,#E74C3C) 25%, transparent)"
            : "1px solid color-mix(in srgb, var(--accent-cyan) 25%, transparent)",
          padding: "3px 10px", borderRadius: 2,
        }}>
          {dirLabel}
        </span>
      </div>

      {/* Instrument line */}
      <div style={{ padding: "10px 16px", borderBottom: `1px solid var(--border-soft)` }}>
        <span style={{ fontFamily: S.mono, fontSize: 11, color: S.tertiary, letterSpacing: "0.08em" }}>
          INSTRUMENT
        </span>
        <span style={{
          marginLeft: 12, fontFamily: S.mono, fontSize: 13, fontWeight: 600, color: S.primary,
        }}>
          {m.spec.symbol} — {m.spec.name} (CME)
        </span>
      </div>

      {/* Primary stats row */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
        borderBottom: `1px solid var(--border-soft)`,
      }}>
        <StatCell label="CONTRACTS"  value={fmt(m.contracts)} />
        <StatCell label="FWD RATE"   value={fmtRate(displayRate)} />
        <StatCell label="NOTIONAL"   value={fmt(m.notional)} />
        <StatCell label="SIZE / CONT" value={fmt(m.spec.contract_size)} />
        <StatCell label="TOTAL USD"  value={fmtUsd(bucket.action_usd)} accent={S.cyan} />
      </div>

      {/* Secondary stats row */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        borderBottom: `1px solid var(--border-soft)`,
      }}>
        <StatCell label="MARGIN REQ"  value={fmtUsd(m.margin)} accent={S.amber} />
        <StatCell label="TICK SIZE"   value={String(m.spec.tick_size)} />
        <StatCell label="TICK VALUE"  value={`$${m.spec.tick_value}`} />
        <StatCell label="EST COST"    value={fmtUsd(m.estCost)} />
      </div>

      {/* Effectiveness bar */}
      <div style={{
        padding: "10px 16px",
        borderBottom: `1px solid var(--border-soft)`,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{ fontFamily: S.mono, fontSize: 11, color: S.tertiary, letterSpacing: "0.08em", flexShrink: 0 }}>
          HEDGE EFFECTIVENESS
        </span>
        <div style={{
          flex: 1, height: 4, background: "var(--border-soft)", borderRadius: 2, overflow: "hidden",
        }}>
          <div style={{
            width: `${m.hedgeEffectiveness}%`,
            height: "100%",
            background: parseFloat(m.hedgeEffectiveness) >= 95
              ? S.green
              : parseFloat(m.hedgeEffectiveness) >= 80
                ? S.amber
                : S.red,
            borderRadius: 2,
            transition: "width 0.4s ease",
          }} />
        </div>
        <span style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 700, color: S.primary, flexShrink: 0 }}>
          {m.hedgeEffectiveness}%
        </span>
        <span style={{ fontFamily: S.mono, fontSize: 11, color: S.tertiary, flexShrink: 0 }}>
          of bucket exposure covered
        </span>
      </div>

      {/* Actions */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => openIbkr(m.spec, m.side, m.contracts, displayRate)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
            color: "#1C62F2",
            background: "color-mix(in srgb,#1C62F2 8%,transparent)",
            border: "1px solid color-mix(in srgb,#1C62F2 25%,transparent)",
            padding: "8px 16px", borderRadius: 3, cursor: "pointer",
          }}
        >
          <ExternalLinkIcon size={12} color="#1C62F2" />
          OPEN IN IBKR
        </button>
        <button
          onClick={copyTicket}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
            color: copied ? S.green : S.tertiary,
            background: "transparent",
            border: `1px solid var(--border-soft)`,
            padding: "8px 16px", borderRadius: 3, cursor: "pointer",
          }}
        >
          <CopyIcon size={12} color={copied ? S.green : S.tertiary} />
          {copied ? "COPIED" : "COPY TICKET"}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PhaseExecute({
  proposalIds,
  calcResult,
  token,
  governanceMode,
  onComplete,
  onBack,
}: PhaseExecuteProps) {
  const [fillPrice, setFillPrice]                 = useState<string>("");
  const [executing, setExecuting]                 = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval]   = useState(false);
  const [done, setDone]                           = useState(false);

  // Extract buckets from calcResult
  const hedgePlan = calcResult.hedge_plan as { buckets?: BucketResult[]; summary?: Record<string, number> } | undefined;
  const buckets: BucketResult[] = (hedgePlan?.buckets ?? []).filter(b => !b.suppressed && Math.abs(b.action_mxn) > 0);
  const runId = (calcResult.run_id as string) ?? "";

  // Aggregate totals across all tickets
  const totals = buckets.reduce(
    (acc, b) => {
      const m = computeTicket(b);
      acc.contracts += m.contracts;
      acc.notional  += m.notional;
      acc.margin    += m.margin;
      acc.cost      += m.estCost;
      acc.actionUsd += Math.abs(b.action_usd);
      return acc;
    },
    { contracts: 0, notional: 0, margin: 0, cost: 0, actionUsd: 0 },
  );

  const fillOk = !executing && !done;

  const handleMarkHedged = async () => {
    setExecuting(true);
    setError(null);
    setAwaitingApproval(false);

    const parsedFillPrice = fillPrice ? parseFloat(fillPrice) : 0;

    try {
      const results = await Promise.allSettled(
        proposalIds.map(async (id) => {
          const execRes = await dashboardFetch(`/v1/proposals/${id}/execute`, token, {
            method: "POST",
            body: JSON.stringify({}),
          });

          if (execRes.status === 409) {
            throw Object.assign(new Error("NOT_APPROVED"), { code: 409 });
          }
          if (!execRes.ok) {
            const errData = await execRes.json().catch(() => ({}));
            throw new Error((errData as { detail?: string }).detail ?? `HTTP ${execRes.status}`);
          }

          if (parsedFillPrice > 0) {
            await dashboardFetch(`/v1/proposals/${id}/fill`, token, {
              method: "PATCH",
              body: JSON.stringify({
                fill_price:     parsedFillPrice,
                fill_notional:  totals.actionUsd,
                fill_currency:  "MXN",
                fill_timestamp: new Date().toISOString(),
              }),
            }).catch(() => undefined);
          }
        }),
      );

      const has409 = results.some(
        r => r.status === "rejected" && (r.reason as { code?: number })?.code === 409,
      );
      const hasOtherErrors = results.some(
        r => r.status === "rejected" && (r.reason as { code?: number })?.code !== 409,
      );

      if (has409 && governanceMode === "team") {
        setAwaitingApproval(true);
        setExecuting(false);
        return;
      }

      if (hasOtherErrors) {
        const firstError = results.find(
          r => r.status === "rejected" && (r.reason as { code?: number })?.code !== 409,
        );
        throw (firstError as PromiseRejectedResult).reason;
      }

      // Save trade history
      const historyEntry: TradeHistoryEntry = {
        id: `TH-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        run_id: runId,
        positions: proposalIds,
        legs: buckets.map(b => {
          const m = computeTicket(b);
          return {
            bucket: b.bucket,
            symbol: m.spec.symbol,
            contracts: m.contracts,
            forward_rate: b.forward_rate,
            action_usd: b.action_usd,
            action_mxn: b.action_mxn,
            margin_req: m.margin,
            side: m.side,
          };
        }),
        total_contracts: totals.contracts,
        total_action_usd: totals.actionUsd,
        total_margin: totals.margin,
        risk_verdict: (calcResult.risk_verdict as string) ?? "APPROVED",
        ...(parsedFillPrice > 0 ? { fill_price: parsedFillPrice } : {}),
        status: "HEDGED",
      };
      saveTradeHistory(historyEntry);

      setDone(true);
      onComplete({ fillPrice: parsedFillPrice, proposalIds });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      minHeight: "100%", background: S.bgDeep,
    }}>
      {/* ── Header strip ───────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px",
        background: "#050d1a",
        borderBottom: `1px solid var(--border-rim)`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "none", border: "none", cursor: "pointer", padding: 0,
            }}
          >
            <ChevronLeftIcon size={13} color="var(--text-tertiary)" />
            <span style={{ fontFamily: S.mono, fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.07em" }}>
              BACK TO REVIEW
            </span>
          </button>
          <span style={{ width: 1, height: 14, background: "var(--border-soft)", display: "inline-block" }} />
          <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-primary)" }}>
            EXECUTION TERMINAL
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "color-mix(in srgb, var(--status-pass,#22c55e) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--status-pass,#22c55e) 25%, transparent)",
            padding: "4px 12px", borderRadius: 2,
          }}>
            <ShieldCheckIcon size={12} color={S.green} />
            <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.green, letterSpacing: "0.1em" }}>
              RISK: APPROVE
            </span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "color-mix(in srgb, var(--accent-cyan) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-cyan) 25%, transparent)",
            padding: "4px 12px", borderRadius: 2,
          }}>
            <UserCheckIcon size={12} color={S.cyan} />
            <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.cyan, letterSpacing: "0.1em" }}>
              4-EYES: {governanceMode === "team" ? "MAKER" : "SOLO"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0 20px" }}>

        {/* Section 1: Trade ticket cards */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: 12,
          }}>
            <span style={{
              fontFamily: S.mono, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.14em", color: S.tertiary,
            }}>
              TRADE TICKETS
            </span>
            <span style={{
              fontFamily: S.mono, fontSize: 10,
              background: "var(--border-soft)", color: S.tertiary,
              padding: "1px 7px", borderRadius: 10,
            }}>
              {buckets.length > 0 ? `${buckets.length} LEG${buckets.length !== 1 ? "S" : ""}` : "NO ACTIVE LEGS"}
            </span>
          </div>

          {buckets.length === 0 ? (
            <div style={{
              padding: "24px 20px",
              background: S.bgPanel, border: `1px solid var(--border-soft)`,
              borderRadius: 4, textAlign: "center",
            }}>
              <span style={{ fontFamily: S.mono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em" }}>
                NO ACTIONABLE BUCKETS — ALL POSITIONS SUPPRESSED OR ZERO
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Disclaimer */}
              <div style={{
                background: "color-mix(in srgb, var(--accent-amber) 8%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent-amber) 25%, transparent)",
                borderRadius: 3,
                padding: "5px 12px",
                fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
                fontSize: 11,
                color: "var(--accent-amber)",
                marginBottom: 10,
              }}>
                &#9888;&#160;&#160;ORDR Terminal does not submit orders electronically. These tickets require manual entry into your broker platform (IBKR or equivalent).
              </div>
              {buckets.map((b, i) => (
                <TicketCard key={b.bucket ?? i} bucket={b} index={i} fillPrice={fillPrice} />
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Fill price input */}
        <div style={{
          background: S.bgPanel,
          border: `1px solid var(--border-soft)`,
          borderRadius: 4,
          padding: "14px 16px",
          marginBottom: 20,
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <span style={{
            fontFamily: S.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.1em", color: S.tertiary, flexShrink: 0,
          }}>
            FILL PRICE (OPTIONAL)
          </span>
          <input
            type="number"
            step="0.000001"
            min="0"
            value={fillPrice}
            onChange={e => setFillPrice(e.target.value)}
            placeholder="Leave blank to use forward rate"
            style={{
              flex: 1,
              fontFamily: S.mono, fontSize: 13,
              color: S.primary,
              background: S.bgSub,
              border: `1px solid var(--border-soft)`,
              borderRadius: 3,
              padding: "8px 12px",
              outline: "none",
              minWidth: 0,
            }}
          />
        </div>

        {/* Section 3: Total summary row */}
        {buckets.length > 0 && (
          <div style={{
            background: S.bgPanel,
            border: `1px solid var(--border-rim)`,
            borderRadius: 4,
            marginBottom: 20,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            overflow: "hidden",
          }}>
            {[
              ["TOTAL CONTRACTS",  fmt(totals.contracts)],
              ["TOTAL NOTIONAL",   fmtUsd(totals.actionUsd)],
              ["TOTAL MARGIN REQ", fmtUsd(totals.margin)],
              ["EST TOTAL COST",   fmtUsd(totals.cost)],
            ].map(([label, value], idx) => (
              <div key={label} style={{
                padding: "14px 18px",
                borderRight: idx < 3 ? `1px solid var(--border-soft)` : "none",
              }}>
                <div style={{
                  fontFamily: S.mono, fontSize: 10, letterSpacing: "0.12em",
                  color: S.tertiary, marginBottom: 6,
                }}>
                  {label}
                </div>
                <div style={{
                  fontFamily: S.mono, fontSize: 20, fontWeight: 700,
                  color: idx === 2 ? S.amber : S.primary,
                }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Awaiting approval notice */}
        {awaitingApproval && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "12px 14px",
            background: "color-mix(in srgb, var(--accent-amber) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)",
            borderRadius: 4,
            marginBottom: 16,
          }}>
            <AlertCircleIcon size={15} color={S.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 700,
                color: S.amber, letterSpacing: "0.08em", marginBottom: 4,
              }}>
                AWAITING CHECKER APPROVAL
              </div>
              <div style={{ fontFamily: S.ui, fontSize: 13, color: S.secondary }}>
                One or more proposals are pending checker sign-off. Check the staging queue.
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: "10px 14px",
            background: "color-mix(in srgb, var(--accent-red,#E74C3C) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-red,#E74C3C) 30%, transparent)",
            borderRadius: 4, marginBottom: 16,
          }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.red }}>{error}</span>
          </div>
        )}

        {/* Done state */}
        {done && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px",
            background: "color-mix(in srgb, var(--status-pass,#22c55e) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--status-pass,#22c55e) 25%, transparent)",
            borderRadius: 4, marginBottom: 16,
          }}>
            <CheckCircleIcon size={15} color={S.green} />
            <span style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 700,
              color: S.green, letterSpacing: "0.08em",
            }}>
              HEDGED SUCCESSFULLY — ADVANCING PIPELINE...
            </span>
          </div>
        )}

        {/* Spacer so content isn't obscured by sticky bar */}
        <div style={{ height: 80 }} />
      </div>

      {/* ── Sticky bottom bar ───────────────────────────────────────────── */}
      <div style={{
        position: "sticky", bottom: 0, zIndex: 10,
        background: S.bgPanel,
        borderTop: `2px solid var(--border-rim)`,
        padding: "16px 24px",
        display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 16,
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: S.mono, fontSize: 11, color: S.secondary,
          letterSpacing: "0.04em",
        }}>
          {proposalIds.length} proposal{proposalIds.length !== 1 ? "s" : ""} —&nbsp;
          4-eyes approval required after submission
        </span>
        <button
          onClick={handleMarkHedged}
          disabled={!fillOk}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: done
              ? S.tertiary
              : executing
                ? "color-mix(in srgb, var(--status-pass,#22c55e) 60%, #000)"
                : S.green,
            color: "#000",
            border: "none",
            borderRadius: 3,
            padding: "14px 32px",
            cursor: (!fillOk) ? "default" : "pointer",
            fontFamily: S.mono, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
            transition: "background 0.2s ease",
          }}
        >
          {executing && <LoaderIcon size={14} color="#000" style={{ animation: "spin 1s linear infinite" }} />}
          {done && <CheckCircleIcon size={14} color="#000" />}
          {done ? "EXECUTION CONFIRMED" : executing ? "EXECUTING..." : "CONFIRM EXECUTION"}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
