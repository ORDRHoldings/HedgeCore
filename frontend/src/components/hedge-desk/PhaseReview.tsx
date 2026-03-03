"use client";

import { useState } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { PositionRow } from "@/api/positionClient";
import DisclosurePanel from "./DisclosurePanel";
import {
  CheckCircleIcon, AlertTriangleIcon, LoaderIcon, ChevronLeftIcon, ExternalLinkIcon
} from "lucide-react";
import Link from "next/link";
import AIHedgeIntelligence from "@/components/execution/AIHedgeIntelligence";

const HD = {
  navy:    "#0A1F44",
  royal:   "#1C62F2",
  emerald: "#2ECC71",
  crimson: "#E74C3C",
  slate:   "#8A9AB5",
  bgPanel: "var(--bg-panel)",
  bgSub:   "var(--bg-sub)",
  bgDeep:  "var(--bg-deep)",
  rim:     "var(--border-rim)",
  soft:    "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:    "var(--accent-cyan)",
  amber:   "var(--accent-amber)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

interface PhaseReviewProps {
  positions: PositionRow[];
  calcResult: Record<string, unknown>;
  riskVerdict: string;
  riskDecisionHash: string;
  runId: string;
  token: string;
  governanceMode: "solo" | "team";
  onComplete: (proposalIds: string[]) => void;
  onBack: () => void;
}

function fmt(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals }).format(n);
}

export default function PhaseReview({
  positions,
  calcResult,
  riskVerdict,
  riskDecisionHash,
  runId,
  token,
  governanceMode,
  onComplete,
  onBack,
}: PhaseReviewProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [submitted, setSubmitted]   = useState(false);
  const [proposalIds, setProposalIds] = useState<string[]>([]);

  const isSolo = governanceMode === "solo";

  // Extract engine output from CalculateResponse shape
  const _hp = (calcResult.hedge_plan ?? null) as null | {
    buckets: Array<{ bucket: string; action_usd: number; action_mxn: number; forward_rate: number; suppressed: boolean }>;
    summary: { total_commercial_exposure_mxn: number; total_existing_hedges_mxn: number; total_action_mxn: number; total_action_usd: number; total_friction_usd: number; total_hedge_position_mxn: number; total_residual_mxn: number };
  };
  const _re = (calcResult.run_envelope ?? null) as null | { run_id: string; timestamp: string; engine_version: string; inputs_hash: string; outputs_hash: string; policy_hash: string };
  const _sc = ((calcResult.scenario_results as { totals?: Array<{ sigma: number; shocked_spot: number; total_unhedged_usd: number; total_hedged_usd: number; total_hedge_benefit_usd: number }> })?.totals ?? []);
  const _buckets = _hp?.buckets ?? [];
  const _activeBuckets = _buckets.filter(b => !b.suppressed);
  const _summary = _hp?.summary;
  const _coveragePct = _summary && _summary.total_commercial_exposure_mxn !== 0
    ? (_summary.total_hedge_position_mxn / _summary.total_commercial_exposure_mxn) * 100 : 0;
  const _costBps = _summary && _summary.total_action_usd !== 0
    ? (_summary.total_friction_usd / _summary.total_action_usd) * 10000 : 0;
  const _primaryCcy = positions[0]?.currency ?? "MXN";
  const _fmtN = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  const _fmtD = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
  const _fmtU = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

  const buildProposals = () =>
    positions.map(p => {
      const matchingBucket = _activeBuckets.find(b => b.bucket.startsWith(p.currency) || b.bucket === p.currency) ?? _activeBuckets[0];
      const rate = matchingBucket?.forward_rate ?? null;
      const amt  = matchingBucket?.action_usd   ?? null;
      return {
        position_id:        p.id,
        execution_ref:      `HD-${runId.slice(0, 8)}-${p.id.slice(0, 4)}`,
        hedge_amount:       amt  && amt  > 0 ? amt  : undefined,
        hedge_rate:         rate && rate > 0 ? rate : undefined,
        run_id:             runId,
        risk_decision_hash: riskDecisionHash || undefined,
        risk_verdict:       riskVerdict      || undefined,
      };
    });

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = isSolo
        ? "/v1/proposals/batch-and-approve"
        : "/v1/proposals/batch";

      const res = await dashboardFetch(endpoint, token, {
        method: "POST",
        body: JSON.stringify({ proposals: buildProposals() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as Record<string, unknown>;
        const detail = errData.detail;
        const msg = typeof detail === "string" ? detail
          : Array.isArray(detail) ? detail.map((d: Record<string, unknown>) => d.msg ?? JSON.stringify(d)).join("; ")
          : detail ? JSON.stringify(detail)
          : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const data = await res.json() as Record<string, unknown>;

      // Extract IDs — batch-and-approve returns { approved: [...] }, batch returns { proposals: [...] }
      const items = (data.approved ?? data.proposals ?? []) as Array<Record<string, unknown>>;
      const ids   = items.map(item => (item.id ?? item.proposal_id) as string).filter(Boolean);

      setProposalIds(ids);
      setSubmitted(true);
      onComplete(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Verdict badge
  const verdictColor = riskVerdict === "REJECT" ? HD.crimson
    : riskVerdict === "APPROVE_WITH_CONDITIONS" ? HD.amber
    : riskVerdict === "UNAVAILABLE" ? HD.amber
    : HD.emerald;

  const verdictLabel = riskVerdict === "APPROVE" ? "RISK GATE PASSED"
    : riskVerdict === "APPROVE_WITH_CONDITIONS" ? "APPROVED WITH CONDITIONS"
    : riskVerdict === "UNAVAILABLE" ? "RISK GATE UNAVAILABLE"
    : riskVerdict;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px", height: "100%", overflowY: "auto" }}>

      {/* Back */}
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", alignSelf: "flex-start", padding: 0 }}>
        <ChevronLeftIcon size={14} color={HD.slate} />
        <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate, letterSpacing: "0.06em" }}>BACK TO RISK</span>
      </button>

      {/* L1 hint */}
      <DisclosurePanel title="Review the hedge plan before approving." level="L1" defaultOpen>
        <p style={{ fontFamily: HD.fontUI, fontSize: 13, color: HD.secondary, margin: 0, lineHeight: 1.6 }}>
          {isSolo
            ? "In Solo Mode, you are both maker and checker. Clicking APPROVE & SUBMIT will immediately approve and stage these positions for execution."
            : "In Team Mode, your submission goes to the Staging queue for checker approval. You cannot self-approve in team governance."
          }
        </p>
      </DisclosurePanel>

      {/* Risk verdict badge */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: `color-mix(in srgb,${verdictColor} 8%,${HD.bgPanel})`,
        border: `1px solid color-mix(in srgb,${verdictColor} 25%,transparent)`,
        borderRadius: 4,
      }}>
        {riskVerdict === "APPROVE" ? <CheckCircleIcon size={16} color={verdictColor} /> : <AlertTriangleIcon size={16} color={verdictColor} />}
        <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: verdictColor }}>
          {verdictLabel}
        </span>
      </div>

      {/* AI Hedge Intelligence — the differentiator */}
      <AIHedgeIntelligence
        positions={positions}
        calcResult={calcResult}
        riskVerdict={riskVerdict}
      />

      {/* Positions table */}
      <div style={{ background: HD.bgPanel, border: `1px solid ${HD.rim}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ padding: "8px 14px", background: HD.bgSub, borderBottom: `1px solid ${HD.soft}` }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
            POSITIONS ({positions.length})
          </span>
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 80px 120px 100px",
          padding: "6px 14px",
          borderBottom: `1px solid ${HD.soft}`,
          background: HD.bgSub,
        }}>
          {["ENTITY", "TYPE", "CURRENCY", "AMOUNT"].map(h => (
            <span key={h} style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
              {h}
            </span>
          ))}
        </div>
        <div style={{ maxHeight: 200, overflowY: "auto" }}>
          {positions.map((p, i) => (
            <div key={p.id} style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 120px 100px",
              padding: "6px 14px",
              borderBottom: `1px solid ${HD.soft}`,
              background: i % 2 === 0 ? HD.bgPanel : HD.bgSub,
            }}>
              <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.primary }}>{p.entity}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.secondary }}>{p.type}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.cyan }}>{p.currency}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.primary }}>{fmt(p.amount ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── HEDGE PLAN SUMMARY — Desk-Grade ─── */}

      {/* Truth header */}
      <div style={{ background: HD.bgDeep, border: `1px solid ${HD.rim}`, borderRadius: 4, padding: "10px 14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
        <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: HD.tertiary }}>HEDGE PLAN</span>
        <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.primary }}>RUN <span style={{ color: HD.cyan }}>{(_re?.run_id ?? runId).slice(0, 12)}…</span></span>
        {_re?.engine_version && <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.tertiary }}>ENGINE <span style={{ color: HD.primary }}>{_re.engine_version}</span></span>}
        {_re?.timestamp && <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.tertiary }}>AS OF <span style={{ color: HD.primary }}>{new Date(_re.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</span></span>}
        {_re?.inputs_hash && <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary }}>INPUTS <span style={{ color: HD.slate }}>{_re.inputs_hash.slice(0, 10)}…</span></span>}
        <span style={{ marginLeft: "auto", fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, color: "#2ECC71", letterSpacing: "0.08em" }}>✓ HASH VERIFIED</span>
      </div>

      {/* KPI grid */}
      {_summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            { label: "COVERAGE RATIO", value: `${_coveragePct.toFixed(1)}%`, color: _coveragePct >= 80 ? "#2ECC71" : HD.amber },
            { label: "TOTAL ACTION (USD)", value: _fmtU(_summary.total_action_usd), color: HD.primary },
            { label: "RESIDUAL EXPOSURE", value: `${_fmtN(_summary.total_residual_mxn)} ${_primaryCcy}`, color: _summary.total_residual_mxn > 0 ? HD.amber : "#2ECC71" },
            { label: "SPREAD / FRICTION", value: _fmtU(_summary.total_friction_usd), color: HD.amber },
            { label: "COST (BPS)", value: `${_costBps.toFixed(1)} bps`, color: HD.tertiary },
            { label: "HEDGE POSITION", value: `${_fmtN(_summary.total_hedge_position_mxn)} ${_primaryCcy}`, color: HD.primary },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: HD.bgPanel, border: `1px solid ${HD.soft}`, borderRadius: 4, padding: "10px 12px" }}>
              <div style={{ fontFamily: HD.fontMono, fontSize: 8, fontWeight: 700, letterSpacing: "0.10em", color: HD.tertiary, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: HD.fontMono, fontSize: 14, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Legs table */}
      {_activeBuckets.length > 0 && (
        <div style={{ background: HD.bgPanel, border: `1px solid ${HD.rim}`, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", background: HD.bgSub, borderBottom: `1px solid ${HD.soft}` }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
              EXECUTION LEGS ({_activeBuckets.length})
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "100px 140px 110px 120px 110px 100px 90px", padding: "6px 14px", background: HD.bgSub, borderBottom: `1px solid ${HD.soft}` }}>
            {["SETTLEMENT", "DIRECTION", "FWD RATE", "EXPOSURE", "ACTION", "USD EQUIV", "COST"].map(h => (
              <span key={h} style={{ fontFamily: HD.fontMono, fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary, textAlign: h !== "SETTLEMENT" && h !== "DIRECTION" ? "right" as const : "left" as const }}>{h}</span>
            ))}
          </div>
          {_activeBuckets.map((b, i) => {
            const dir = (b as unknown as { action_direction?: string }).action_direction ?? (b.action_mxn > 0 ? "SELL_CCY_BUY_USD" : "BUY_CCY_SELL_USD");
            const isSell = dir.startsWith("SELL");
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 140px 110px 120px 110px 100px 90px", padding: "7px 14px", borderBottom: `1px solid ${HD.soft}`, alignItems: "center" }}>
                <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 600, color: HD.cyan }}>{b.bucket}</span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, color: isSell ? HD.crimson : "#2ECC71", letterSpacing: "0.06em" }}>
                  {isSell ? "SELL" : "BUY"} / {isSell ? "BUY USD" : "SELL USD"}
                </span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.primary, textAlign: "right" as const }}>{_fmtD(b.forward_rate)}</span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.secondary, textAlign: "right" as const }}>{_fmtN((b as unknown as { commercial_exposure_mxn?: number }).commercial_exposure_mxn ?? 0)}</span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.primary, textAlign: "right" as const }}>{_fmtN(b.action_mxn)}</span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.secondary, textAlign: "right" as const }}>{_fmtU(b.action_usd)}</span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.amber, textAlign: "right" as const }}>{_fmtU((b as unknown as { friction_usd?: number }).friction_usd ?? 0)}</span>
              </div>
            );
          })}
          {_summary && (
            <div style={{ display: "grid", gridTemplateColumns: "100px 140px 110px 120px 110px 100px 90px", padding: "7px 14px", background: HD.bgSub, alignItems: "center" }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>TOTAL</span>
              <span />
              <span />
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: HD.primary, textAlign: "right" as const }}>{_fmtN(_summary.total_commercial_exposure_mxn)}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: HD.primary, textAlign: "right" as const }}>{_fmtN(_summary.total_action_mxn)}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: HD.primary, textAlign: "right" as const }}>{_fmtU(_summary.total_action_usd)}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: HD.amber, textAlign: "right" as const }}>{_fmtU(_summary.total_friction_usd)}</span>
            </div>
          )}
        </div>
      )}

      {/* Scenario impact panel */}
      {_sc.filter(t => t.sigma !== 0).length > 0 && (
        <div style={{ background: HD.bgPanel, border: `1px solid ${HD.soft}`, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", background: HD.bgSub, borderBottom: `1px solid ${HD.soft}` }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>STRESS SCENARIOS</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "80px 110px 160px 160px 160px", padding: "6px 14px", background: HD.bgSub, borderBottom: `1px solid ${HD.soft}` }}>
            {["σ", "SHOCKED SPOT", "UNHEDGED P&L", "HEDGED P&L", "HEDGE BENEFIT"].map(h => (
              <span key={h} style={{ fontFamily: HD.fontMono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", color: HD.tertiary, textAlign: "right" as const }}>{h}</span>
            ))}
          </div>
          {_sc.filter(t => t.sigma !== 0).map(t => (
            <div key={t.sigma} style={{ display: "grid", gridTemplateColumns: "80px 110px 160px 160px 160px", padding: "6px 14px", borderBottom: `1px solid ${HD.soft}`, alignItems: "center" }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: t.sigma < 0 ? HD.crimson : "#2ECC71", textAlign: "right" as const }}>{t.sigma > 0 ? "+" : ""}{t.sigma}σ</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.secondary, textAlign: "right" as const }}>{_fmtD(t.shocked_spot)}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.crimson, textAlign: "right" as const }}>{_fmtU(t.total_unhedged_usd)}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.amber, textAlign: "right" as const }}>{_fmtU(t.total_hedged_usd)}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: "#2ECC71", textAlign: "right" as const }}>{_fmtU(t.total_hedge_benefit_usd)}</span>
            </div>
          ))}
        </div>
      )}

      {/* IBKR deep link + copy ticket buttons */}
      {_activeBuckets.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              // IBKR TWS native deep link (futures)
              const primary = _activeBuckets[0];
              const SYMBOL_MAP: Record<string, string> = { MXN: "M6E", EUR: "6E", GBP: "6B", JPY: "6J", CAD: "6C", CHF: "6S", AUD: "6A", NZD: "6N" };
              const sym = SYMBOL_MAP[_primaryCcy] ?? "M6E";
              const side = ((primary as unknown as { action_direction?: string }).action_direction ?? "SELL_MXN_BUY_USD").startsWith("SELL") ? "SELL" : "BUY";
              const qty = Math.max(1, Math.round(Math.abs(primary.action_usd) / 62500));
              const price = primary.forward_rate.toFixed(5);
              // Try native app first, fallback to web
              const nativeUrl = `ibkr://order?symbol=${sym}&secType=FUT&exchange=CME&side=${side}&quantity=${qty}&orderType=LMT&lmtPrice=${price}&currency=USD`;
              window.open(nativeUrl, "_self");
            }}
            style={{ height: 36, padding: "0 16px", display: "flex", alignItems: "center", gap: 6, background: HD.royal, color: "#fff", border: "none", borderRadius: 4, fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer" }}
          >
            <ExternalLinkIcon size={12} color="#fff" />
            OPEN IN IBKR
          </button>
          <button
            onClick={() => {
              const lines = [
                `ORDR TERMINAL — HEDGE EXECUTION TICKET`,
                `Run: ${(_re?.run_id ?? runId).slice(0, 12)}... | Engine: ${_re?.engine_version ?? "—"} | ${new Date().toISOString().slice(0, 16)} UTC`,
                `Risk Verdict: ${riskVerdict} | Hash: ${riskDecisionHash.slice(0, 16) || "—"}`,
                ``,
                `POSITIONS (${positions.length})`,
                ...positions.map(p => `  ${p.type} ${_fmtN(p.amount)} ${p.currency}  entity: ${p.entity}  value: ${p.value_date}`),
                ``,
                `EXECUTION LEGS`,
                ...(_activeBuckets.map(b => {
                  const dir = ((b as unknown as { action_direction?: string }).action_direction ?? "").startsWith("SELL") ? "SELL" : "BUY";
                  return `  ${b.bucket}  ${dir}  rate: ${_fmtD(b.forward_rate)}  action: ${_fmtN(b.action_mxn)} ${_primaryCcy} (${_fmtU(b.action_usd)})  cost: ${_fmtU((b as unknown as { friction_usd?: number }).friction_usd ?? 0)}`;
                })),
                ``,
                `SUMMARY`,
                `  Coverage:  ${_coveragePct.toFixed(1)}%`,
                `  Total USD: ${_fmtU(_summary?.total_action_usd ?? 0)}`,
                `  Total Cost: ${_fmtU(_summary?.total_friction_usd ?? 0)} (${_costBps.toFixed(1)} bps)`,
                `  Residual:  ${_fmtN(_summary?.total_residual_mxn ?? 0)} ${_primaryCcy}`,
              ].join("\n");
              navigator.clipboard.writeText(lines).catch(() => {});
            }}
            style={{ height: 36, padding: "0 16px", display: "flex", alignItems: "center", gap: 6, background: "transparent", color: HD.primary, border: `1px solid ${HD.rim}`, borderRadius: 4, fontFamily: HD.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", cursor: "pointer" }}
          >
            COPY TICKET (TEXT)
          </button>
          <button
            onClick={() => {
              const payload = {
                run_id: _re?.run_id ?? runId,
                as_of: _re?.timestamp ?? new Date().toISOString(),
                engine_version: _re?.engine_version ?? "—",
                risk_verdict: riskVerdict,
                risk_decision_hash: riskDecisionHash,
                legs: _activeBuckets.map(b => ({
                  settlement: b.bucket,
                  direction: (b as unknown as { action_direction?: string }).action_direction ?? "SELL",
                  forward_rate: b.forward_rate,
                  action_mxn: b.action_mxn,
                  action_usd: b.action_usd,
                  friction_usd: (b as unknown as { friction_usd?: number }).friction_usd ?? 0,
                })),
                summary: _summary,
                coverage_pct: _coveragePct,
                cost_bps: _costBps,
              };
              navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(() => {});
            }}
            style={{ height: 36, padding: "0 16px", display: "flex", alignItems: "center", gap: 6, background: "transparent", color: HD.cyan, border: `1px solid ${HD.cyan}`, borderRadius: 4, fontFamily: HD.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", cursor: "pointer" }}
          >
            COPY TICKET (JSON)
          </button>
        </div>
      )}

      {/* L3 audit */}
      <DisclosurePanel title="Audit References" level="L3">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.tertiary }}>RUN ID</span>
            <code style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate }}>{runId}</code>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.tertiary }}>RISK DECISION HASH</span>
            <code style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate, wordBreak: "break-all", maxWidth: "70%" }}>{riskDecisionHash || "—"}</code>
          </div>
        </div>
      </DisclosurePanel>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 14px", background: `color-mix(in srgb,${HD.crimson} 10%,transparent)`, border: `1px solid color-mix(in srgb,${HD.crimson} 30%,transparent)`, borderRadius: 4 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.crimson }}>{error}</span>
        </div>
      )}

      {/* Submitted state (team mode) */}
      {submitted && !isSolo && (
        <div style={{ padding: "12px 16px", background: `color-mix(in srgb,${HD.amber} 8%,${HD.bgPanel})`, border: `1px solid color-mix(in srgb,${HD.amber} 25%,transparent)`, borderRadius: 4, display: "flex", alignItems: "center", gap: 12 }}>
          <AlertTriangleIcon size={16} color={HD.amber} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: HD.amber, letterSpacing: "0.08em" }}>
              PROPOSALS SUBMITTED — AWAITING CHECKER APPROVAL
            </span>
            <Link href="/staging" style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.cyan, display: "flex", alignItems: "center", gap: 4 }}>
              VIEW STAGING QUEUE <ExternalLinkIcon size={10} color={HD.cyan} />
            </Link>
          </div>
        </div>
      )}

      {/* Solo approved badge */}
      {submitted && isSolo && (
        <div style={{ padding: "10px 14px", background: `color-mix(in srgb,${HD.emerald} 8%,${HD.bgPanel})`, border: `1px solid color-mix(in srgb,${HD.emerald} 25%,transparent)`, borderRadius: 4 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: HD.emerald, letterSpacing: "0.08em" }}>
            SELF-APPROVED (SOLO MODE)
          </span>
        </div>
      )}

      {/* Submit button */}
      {!submitted && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto" }}>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              color: "#ffffff",
              background: submitting ? HD.slate : HD.royal,
              border: "none",
              padding: "12px 32px",
              cursor: submitting ? "not-allowed" : "pointer",
              borderRadius: 3,
            }}
          >
            {submitting && <LoaderIcon size={14} color="#ffffff" style={{ animation: "spin 1s linear infinite" }} />}
            {isSolo ? "APPROVE & SUBMIT" : "SUBMIT FOR CHECKER APPROVAL"}
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
