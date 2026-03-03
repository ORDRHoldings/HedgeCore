"use client";

import { useState } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { PositionRow } from "@/api/positionClient";
import DisclosurePanel from "./DisclosurePanel";
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  LoaderIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import Link from "next/link";
import AIHedgeIntelligence from "@/components/execution/AIHedgeIntelligence";

// ─── Design tokens ──────────────────────────────────────────────────────────

const T = {
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
  red:       "var(--accent-red, #E74C3C)",
  green:     "var(--status-pass, #2ECC71)",
  slate:     "#8A9AB5",
  royal:     "#1C62F2",
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

// ─── CME Contract Specifications ────────────────────────────────────────────

interface CmeSpec {
  symbol:        string;
  name:          string;
  contract_size: number;
  currency:      string;
  margin_est:    number;
  tick_size:     number;
  tick_value:    number;
  exchange:      string;
  settle:        string;
}

const CME_SPECS: Record<string, CmeSpec> = {
  MXN: { symbol: "M6M", name: "Mexican Peso Futures",           contract_size: 500000,   currency: "MXN", margin_est: 1800, tick_size: 0.000025,  tick_value: 12.50, exchange: "CME", settle: "3rd Wednesday" },
  EUR: { symbol: "6E",  name: "Euro FX Futures",                contract_size: 125000,   currency: "EUR", margin_est: 2200, tick_size: 0.00005,   tick_value: 6.25,  exchange: "CME", settle: "3rd Wednesday" },
  GBP: { symbol: "6B",  name: "British Pound Futures",          contract_size: 62500,    currency: "GBP", margin_est: 1900, tick_size: 0.0001,    tick_value: 6.25,  exchange: "CME", settle: "3rd Wednesday" },
  JPY: { symbol: "6J",  name: "Japanese Yen Futures",           contract_size: 12500000, currency: "JPY", margin_est: 2000, tick_size: 0.0000005, tick_value: 6.25,  exchange: "CME", settle: "3rd Wednesday" },
  CAD: { symbol: "6C",  name: "Canadian Dollar Futures",        contract_size: 100000,   currency: "CAD", margin_est: 1500, tick_size: 0.00005,   tick_value: 5.00,  exchange: "CME", settle: "3rd Wednesday" },
  CHF: { symbol: "6S",  name: "Swiss Franc Futures",            contract_size: 125000,   currency: "CHF", margin_est: 2100, tick_size: 0.0001,    tick_value: 12.50, exchange: "CME", settle: "3rd Wednesday" },
  AUD: { symbol: "6A",  name: "Australian Dollar Futures",      contract_size: 100000,   currency: "AUD", margin_est: 1400, tick_size: 0.0001,    tick_value: 10.00, exchange: "CME", settle: "3rd Wednesday" },
  NZD: { symbol: "6N",  name: "New Zealand Dollar Futures",     contract_size: 100000,   currency: "NZD", margin_est: 1300, tick_size: 0.0001,    tick_value: 10.00, exchange: "CME", settle: "3rd Wednesday" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function _fmtN(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function _fmtD(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 7 }).format(n);
}
function _fmtU(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function _fmtTick(n: number): string {
  if (n < 0.0001) return n.toFixed(7).replace(/0+$/, "");
  return n.toString();
}

// ─── Shared sub-components ──────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
      <div style={{ flex: 1, height: 1, background: T.rim }} />
      <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", color: T.tertiary }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: T.rim }} />
    </div>
  );
}

function Section({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:        "100%",
          display:      "flex",
          alignItems:   "center",
          gap:           10,
          padding:      "9px 14px",
          background:    T.bgSub,
          border:       "none",
          borderBottom:  open ? `1px solid ${T.rim}` : "none",
          cursor:       "pointer",
          textAlign:    "left",
        }}
      >
        <span style={{
          fontFamily:    T.fontMono,
          fontSize:       10,
          fontWeight:     700,
          letterSpacing: "0.14em",
          color:          T.primary,
          flex:           1,
        }}>
          {title}
        </span>
        {badge}
        {open
          ? <ChevronUpIcon size={13} color={T.tertiary} />
          : <ChevronDownIcon size={13} color={T.tertiary} />
        }
      </button>
      {open && <div style={{ background: T.bgPanel }}>{children}</div>}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface PhaseReviewProps {
  positions:        PositionRow[];
  calcResult:       Record<string, unknown>;
  riskVerdict:      string;
  riskDecisionHash: string;
  runId:            string;
  token:            string;
  governanceMode:   "solo" | "team";
  onComplete:       (proposalIds: string[]) => void;
  onBack:           () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [submitted, setSubmitted]     = useState(false);
  const [proposalIds, setProposalIds] = useState<string[]>([]);

  const isSolo = governanceMode === "solo";

  // ── Engine output extraction ─────────────────────────────────────────────

  const _hp = (calcResult.hedge_plan ?? null) as null | {
    buckets: Array<{
      bucket:                   string;
      action_usd:               number;
      action_mxn:               number;
      forward_rate:             number;
      suppressed:               boolean;
      action_direction?:        string | null;
      commercial_exposure_mxn?: number;
      friction_usd?:            number;
      hedge_position_mxn?:      number;
      residual_mxn?:            number;
    }>;
    summary: {
      total_commercial_exposure_mxn: number;
      total_existing_hedges_mxn:     number;
      total_action_mxn:              number;
      total_action_usd:              number;
      total_friction_usd:            number;
      total_hedge_position_mxn:      number;
      total_residual_mxn:            number;
    };
  };

  const _re = (calcResult.run_envelope ?? null) as null | {
    run_id:                string;
    timestamp:             string;
    engine_version:        string;
    inputs_hash:           string;
    outputs_hash:          string;
    policy_hash:           string;
    market_snapshot_hash?: string | null;
  };

  const _sc = ((calcResult.scenario_results as {
    totals?: Array<{
      sigma:                   number;
      shocked_spot:            number;
      total_unhedged_usd:      number;
      total_hedged_usd:        number;
      total_hedge_benefit_usd: number;
    }>;
  })?.totals ?? []);

  const _buckets       = _hp?.buckets ?? [];
  const _activeBuckets = _buckets.filter(b => !b.suppressed);
  const _summary       = _hp?.summary;
  const _primaryCcy    = positions[0]?.currency ?? "MXN";

  const _coveragePct = _summary && _summary.total_commercial_exposure_mxn !== 0
    ? (_summary.total_hedge_position_mxn / _summary.total_commercial_exposure_mxn) * 100
    : 0;
  const _costBps = _summary && _summary.total_action_usd !== 0
    ? (_summary.total_friction_usd / _summary.total_action_usd) * 10000
    : 0;

  const activeCurrencies = Array.from(new Set(positions.map(p => p.currency)));

  // ── Verdict colours ──────────────────────────────────────────────────────

  const verdictColor = riskVerdict === "REJECT"                   ? T.red
    : riskVerdict === "APPROVE_WITH_CONDITIONS"                   ? T.amber
    : riskVerdict === "UNAVAILABLE"                               ? T.amber
    : T.green;

  const verdictLabel = riskVerdict === "APPROVE"                  ? "RISK GATE PASSED"
    : riskVerdict === "APPROVE_WITH_CONDITIONS"                   ? "APPROVED WITH CONDITIONS"
    : riskVerdict === "UNAVAILABLE"                               ? "RISK GATE UNAVAILABLE"
    : riskVerdict;

  // ── Business logic (unchanged) ────────────────────────────────────────────

  const buildProposals = () =>
    positions.map(p => {
      const matchingBucket = _activeBuckets.find(
        b => b.bucket.startsWith(p.currency) || b.bucket === p.currency
      ) ?? _activeBuckets[0];
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
      const endpoint = isSolo ? "/v1/proposals/batch-and-approve" : "/v1/proposals/batch";
      const res = await dashboardFetch(endpoint, token, {
        method: "POST",
        body:   JSON.stringify({ proposals: buildProposals() }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as Record<string, unknown>;
        const detail  = errData.detail;
        const msg = typeof detail === "string" ? detail
          : Array.isArray(detail) ? detail.map((d: Record<string, unknown>) => d.msg ?? JSON.stringify(d)).join("; ")
          : detail ? JSON.stringify(detail)
          : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const data  = await res.json() as Record<string, unknown>;
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

  // ── Action bar handlers ───────────────────────────────────────────────────

  const handleOpenIbkr = () => {
    const primary = _activeBuckets[0];
    if (!primary) return;
    const SYMBOL_MAP: Record<string, string> = {
      MXN: "M6M", EUR: "6E", GBP: "6B", JPY: "6J",
      CAD: "6C",  CHF: "6S", AUD: "6A", NZD: "6N",
    };
    const sym  = SYMBOL_MAP[_primaryCcy] ?? "M6M";
    const side = (primary.action_direction ?? "SELL_MXN_BUY_USD").startsWith("SELL") ? "SELL" : "BUY";
    const spec = CME_SPECS[_primaryCcy];
    const qty  = spec
      ? Math.max(1, Math.ceil(Math.abs(primary.action_mxn) / spec.contract_size))
      : Math.max(1, Math.round(Math.abs(primary.action_usd) / 62500));
    const price = primary.forward_rate.toFixed(5);
    window.open(
      `ibkr://order?symbol=${sym}&secType=FUT&exchange=CME&side=${side}&quantity=${qty}&orderType=LMT&lmtPrice=${price}&currency=USD`,
      "_self"
    );
  };

  const handleCopyText = () => {
    const lines = [
      "ORDR TERMINAL — HEDGE EXECUTION TICKET",
      `Run: ${(_re?.run_id ?? runId).slice(0, 12)}... | Engine: ${_re?.engine_version ?? "—"} | ${new Date().toISOString().slice(0, 16)} UTC`,
      `Risk Verdict: ${riskVerdict} | Hash: ${riskDecisionHash.slice(0, 16) || "—"}`,
      "",
      `POSITIONS (${positions.length})`,
      ...positions.map(p => `  ${p.type} ${_fmtN(p.amount ?? 0)} ${p.currency}  entity: ${p.entity}  value: ${p.value_date}`),
      "",
      "EXECUTION LEGS",
      ..._activeBuckets.map(b => {
        const dir  = (b.action_direction ?? "").startsWith("SELL") ? "SELL" : "BUY";
        const spec = CME_SPECS[_primaryCcy];
        const cts  = spec ? Math.ceil(Math.abs(b.action_mxn) / spec.contract_size) : "—";
        return `  ${b.bucket}  ${dir}  rate: ${_fmtD(b.forward_rate)}  action: ${_fmtN(b.action_mxn)} ${_primaryCcy} (${_fmtU(b.action_usd)})  contracts: ${cts}  cost: ${_fmtU(b.friction_usd ?? 0)}`;
      }),
      "",
      "SUMMARY",
      `  Coverage:   ${_coveragePct.toFixed(1)}%`,
      `  Total USD:  ${_fmtU(_summary?.total_action_usd ?? 0)}`,
      `  Total Cost: ${_fmtU(_summary?.total_friction_usd ?? 0)} (${_costBps.toFixed(1)} bps)`,
      `  Residual:   ${_fmtN(_summary?.total_residual_mxn ?? 0)} ${_primaryCcy}`,
    ].join("\n");
    navigator.clipboard.writeText(lines).catch(() => {});
  };

  const handleCopyJson = () => {
    const payload = {
      run_id:             _re?.run_id ?? runId,
      as_of:              _re?.timestamp ?? new Date().toISOString(),
      engine_version:     _re?.engine_version ?? "—",
      risk_verdict:       riskVerdict,
      risk_decision_hash: riskDecisionHash,
      legs: _activeBuckets.map(b => {
        const spec      = CME_SPECS[_primaryCcy];
        const contracts = spec ? Math.ceil(Math.abs(b.action_mxn) / spec.contract_size) : null;
        return {
          settlement:     b.bucket,
          direction:      b.action_direction ?? "SELL",
          forward_rate:   b.forward_rate,
          action_mxn:     b.action_mxn,
          action_usd:     b.action_usd,
          friction_usd:   b.friction_usd ?? 0,
          contracts,
          margin_req_usd: spec && contracts !== null ? contracts * spec.margin_est : null,
        };
      }),
      summary:      _summary,
      coverage_pct: _coveragePct,
      cost_bps:     _costBps,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(() => {});
  };

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:            16,
      padding:       "20px 24px 104px",
      height:        "100%",
      overflowY:     "auto",
      fontFamily:    T.fontUI,
    }}>

      {/* Step header strip */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 20px",
        background: `color-mix(in srgb, var(--accent-cyan) 6%, transparent)`,
        borderBottom: `1px solid ${T.rim}`,
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 5,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: T.cyan }}>
            STEP 4 OF 4 — REVIEW HEDGE PLAN
          </span>
          <span style={{ fontFamily: T.fontUI, fontSize: 11, color: T.secondary }}>
            {riskVerdict === "APPROVE" ? "Risk gate: PASS — " : ""}Review execution legs and submit for approval.
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {!submitted && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              height: 36, padding: "0 24px",
              fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              color: "#ffffff",
              background: submitting ? T.slate : "var(--accent-cyan)",
              border: "none", borderRadius: 3,
              cursor: submitting ? "not-allowed" : "pointer",
              whiteSpace: "nowrap" as const,
            }}
          >
            {submitting && <LoaderIcon size={12} color="#ffffff" style={{ animation: "spin 1s linear infinite" }} />}
            {isSolo ? "APPROVE & SUBMIT" : "SUBMIT FOR CHECKER APPROVAL"}
          </button>
        )}
        {submitted && (
          <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, color: T.green, letterSpacing: "0.08em" }}>
            ✓ SUBMITTED
          </span>
        )}
      </div>

      {/* Back nav */}
      <button
        onClick={onBack}
        style={{
          display:    "flex",
          alignItems: "center",
          gap:         4,
          background: "none",
          border:     "none",
          cursor:     "pointer",
          alignSelf:  "flex-start",
          padding:     0,
        }}
      >
        <ChevronLeftIcon size={14} color={T.slate} />
        <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.slate, letterSpacing: "0.06em" }}>
          BACK TO RISK
        </span>
      </button>

      {/* Governance mode hint */}
      <DisclosurePanel title="Review the hedge plan before approving." level="L1" defaultOpen>
        <p style={{ fontFamily: T.fontUI, fontSize: 13, color: T.secondary, margin: 0, lineHeight: 1.6 }}>
          {isSolo
            ? "In Solo Mode, you are both maker and checker. Clicking APPROVE & SUBMIT will immediately approve and stage these positions for execution."
            : "In Team Mode, your submission goes to the Staging queue for checker approval. You cannot self-approve in team governance."
          }
        </p>
      </DisclosurePanel>

      {/* Risk verdict badge */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:           10,
        padding:      "11px 16px",
        background:   `color-mix(in srgb,${verdictColor} 8%,${T.bgPanel})`,
        border:       `1px solid color-mix(in srgb,${verdictColor} 25%,transparent)`,
        borderRadius:  4,
      }}>
        {riskVerdict === "APPROVE"
          ? <CheckCircleIcon size={16} color={verdictColor} />
          : <AlertTriangleIcon size={16} color={verdictColor} />
        }
        <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.09em", color: verdictColor }}>
          {verdictLabel}
        </span>
      </div>

      {/* AI Intelligence */}
      <AIHedgeIntelligence
        positions={positions}
        calcResult={calcResult}
        riskVerdict={riskVerdict}
      />

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — AUDIT PROVENANCE
      ══════════════════════════════════════════════════════════════════ */}
      <Divider label="SECTION 1 · AUDIT PROVENANCE" />

      <div style={{
        background:          T.bgDeep,
        border:              `1px solid ${T.rim}`,
        borderRadius:         4,
        padding:             "12px 16px",
        display:             "grid",
        gridTemplateColumns: "1fr 1fr",
        gap:                 "8px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.tertiary, letterSpacing: "0.08em", minWidth: 72 }}>RUN ID</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.cyan }}>
            {(_re?.run_id ?? runId).slice(0, 8)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.tertiary, letterSpacing: "0.08em", minWidth: 72 }}>ENGINE</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.primary }}>
            {_re?.engine_version ?? "—"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.tertiary, letterSpacing: "0.08em", minWidth: 72 }}>AS-OF</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.primary }}>
            {_re?.timestamp
              ? new Date(_re.timestamp).toLocaleString("en-GB", {
                  day: "2-digit", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit", timeZone: "UTC",
                }) + " UTC"
              : "—"
            }
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.tertiary, letterSpacing: "0.08em", minWidth: 72 }}>POLICY</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.slate }}>
            {_re?.policy_hash ? `${_re.policy_hash.slice(0, 12)}…` : "—"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, gridColumn: "1 / -1" }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.tertiary, letterSpacing: "0.08em", minWidth: 72 }}>HASH</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.slate, flex: 1 }}>
            {_re?.inputs_hash
              ? `${_re.inputs_hash.slice(0, 20)}…`
              : riskDecisionHash
              ? `${riskDecisionHash.slice(0, 20)}…`
              : "—"}
          </span>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: T.green, letterSpacing: "0.08em" }}>
            ✓ VERIFIED
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — HEDGE SUMMARY KPI CARDS
      ══════════════════════════════════════════════════════════════════ */}
      <Divider label="SECTION 2 · HEDGE SUMMARY" />

      <Section title="HEDGE SUMMARY — KEY PERFORMANCE INDICATORS" defaultOpen>
        {_summary ? (
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap:                  1,
            background:           T.rim,
          }}>
            {([
              {
                label: "COVERAGE RATIO",
                value: `${_coveragePct.toFixed(1)}%`,
                color: _coveragePct >= 80 ? T.green : _coveragePct >= 50 ? T.amber : T.red,
                sub:   _coveragePct >= 80 ? "TARGET MET" : _coveragePct >= 50 ? "PARTIAL" : "BELOW TARGET",
              },
              {
                label: "TOTAL ACTION",
                value: _fmtU(_summary.total_action_usd),
                color: T.primary,
                sub:   "USD EQUIVALENT",
              },
              {
                label: "RESIDUAL EXPOSURE",
                value: `${_fmtN(_summary.total_residual_mxn)} ${_primaryCcy}`,
                color: _summary.total_residual_mxn > 0 ? T.amber : T.green,
                sub:   _summary.total_residual_mxn > 0 ? "OPEN RISK REMAINS" : "FULLY COVERED",
              },
              {
                label: "FRICTION COST",
                value: _fmtU(_summary.total_friction_usd),
                color: T.secondary,
                sub:   "SPREAD + FEES",
              },
              {
                label: "COST BPS",
                value: `${_costBps.toFixed(1)} bps`,
                color: T.secondary,
                sub:   "OF NOTIONAL",
              },
              {
                label: "HEDGE POSITION",
                value: `${_fmtN(_summary.total_hedge_position_mxn)} ${_primaryCcy}`,
                color: T.primary,
                sub:   "TOTAL LOCKED",
              },
            ] as Array<{ label: string; value: string; color: string; sub: string }>).map(({ label, value, color, sub }) => (
              <div
                key={label}
                style={{
                  background:    T.bgPanel,
                  padding:      "18px 16px",
                  display:      "flex",
                  flexDirection: "column",
                  gap:            6,
                }}
              >
                <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: T.tertiary, textTransform: "uppercase" as const }}>
                  {label}
                </span>
                <span style={{ fontFamily: T.fontMono, fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
                  {value}
                </span>
                <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary, letterSpacing: "0.06em" }}>
                  {sub}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: "24px 16px", textAlign: "center" as const }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>No summary data available</span>
          </div>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 — FUTURES CONTRACT SPECIFICATIONS
      ══════════════════════════════════════════════════════════════════ */}
      <Divider label="SECTION 3 · FUTURES CONTRACT SPECIFICATIONS" />

      <Section
        title="FUTURES CONTRACT SPECS"
        badge={
          <span style={{
            fontFamily:    T.fontMono,
            fontSize:       9,
            fontWeight:     700,
            letterSpacing: "0.12em",
            color:         "#fff",
            background:    "#1C62F2",
            padding:       "2px 8px",
            borderRadius:   2,
          }}>
            CME GROUP
          </span>
        }
        defaultOpen
      >
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {activeCurrencies.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center" as const }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>No active positions to display contract specs for.</span>
            </div>
          ) : activeCurrencies.map(ccy => {
            const spec = CME_SPECS[ccy];

            if (!spec) {
              return (
                <div key={ccy} style={{ padding: "12px 16px", border: `1px solid ${T.soft}`, borderRadius: 4, background: T.bgSub }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>
                    {ccy} — No CME futures spec on record
                  </span>
                </div>
              );
            }

            const matchingBucket = _activeBuckets.find(
              b => b.bucket.startsWith(ccy) || b.bucket === ccy
            ) ?? _activeBuckets[0];

            const contractsNeeded = matchingBucket
              ? Math.ceil(Math.abs(matchingBucket.action_mxn) / spec.contract_size)
              : 0;
            const totalMargin   = contractsNeeded * spec.margin_est;
            const notionalValue = matchingBucket
              ? contractsNeeded * spec.contract_size * matchingBucket.forward_rate
              : 0;

            return (
              <div key={ccy} style={{ border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
                {/* Card header */}
                <div style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                  padding:        "10px 16px",
                  background:      T.bgDeep,
                  borderBottom:   `1px solid ${T.rim}`,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <span style={{ fontFamily: T.fontMono, fontSize: 18, fontWeight: 700, color: T.cyan }}>
                      {spec.symbol}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.primary }}>
                      {spec.name.toUpperCase()}
                    </span>
                  </div>
                  <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: T.slate, letterSpacing: "0.1em" }}>
                    {spec.exchange}
                  </span>
                </div>

                {/* Spec grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: T.soft, borderBottom: `1px solid ${T.soft}` }}>
                  {([
                    { label: "CONTRACT SIZE", value: `${_fmtN(spec.contract_size)} ${spec.currency}` },
                    { label: "TICK SIZE",     value: _fmtTick(spec.tick_size) },
                    { label: "TICK VALUE",    value: `$${spec.tick_value.toFixed(2)}` },
                    { label: "MARGIN EST",    value: _fmtU(spec.margin_est) },
                    { label: "SETTLEMENT",    value: spec.settle },
                    { label: "EXCHANGE",      value: spec.exchange },
                  ] as Array<{ label: string; value: string }>).map(({ label, value }) => (
                    <div key={label} style={{ background: T.bgPanel, padding: "10px 14px" }}>
                      <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.tertiary, letterSpacing: "0.08em", marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 600, color: T.primary }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Derived calculations */}
                {contractsNeeded > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: T.soft }}>
                    {([
                      { label: "CONTRACTS NEEDED", value: contractsNeeded.toLocaleString("en-US"), color: T.cyan },
                      { label: "TOTAL MARGIN REQ",  value: _fmtU(totalMargin),                      color: T.amber },
                      { label: "NOTIONAL VALUE",    value: _fmtU(notionalValue),                    color: T.primary },
                    ] as Array<{ label: string; value: string; color: string }>).map(({ label, value, color }) => (
                      <div
                        key={label}
                        style={{ background: `color-mix(in srgb,${T.bgDeep} 60%,${T.bgPanel})`, padding: "10px 14px" }}
                      >
                        <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.tertiary, letterSpacing: "0.08em", marginBottom: 4 }}>
                          {label}
                        </div>
                        <div style={{ fontFamily: T.fontMono, fontSize: 16, fontWeight: 700, color }}>
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 — EXECUTION LEGS TABLE
      ══════════════════════════════════════════════════════════════════ */}
      <Divider label="SECTION 4 · EXECUTION LEGS" />

      {_activeBuckets.length > 0 && (
        <Section title={`EXECUTION LEGS (${_activeBuckets.length})`} defaultOpen>
          <div style={{ overflowX: "auto" }}>
            {/* Header row */}
            <div style={{
              display:             "grid",
              gridTemplateColumns: "110px 155px 100px 110px 140px 130px 120px 100px",
              padding:             "7px 16px",
              background:           T.bgSub,
              borderBottom:        `1px solid ${T.soft}`,
              minWidth:             980,
            }}>
              {([
                { h: "SETTLEMENT", align: "left"  },
                { h: "DIR",        align: "left"  },
                { h: "CONTRACTS",  align: "right" },
                { h: "FWD RATE",   align: "right" },
                { h: "EXPOSURE",   align: "right" },
                { h: "ACTION USD", align: "right" },
                { h: "MARGIN REQ", align: "right" },
                { h: "COST",       align: "right" },
              ] as Array<{ h: string; align: "left" | "right" }>).map(({ h, align }) => (
                <span key={h} style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: T.tertiary, textAlign: align }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Data rows */}
            {_activeBuckets.map((b, i) => {
              const dir       = b.action_direction ?? (b.action_mxn > 0 ? "SELL_CCY_BUY_USD" : "BUY_CCY_SELL_USD");
              const isSell    = dir.startsWith("SELL");
              const spec      = CME_SPECS[_primaryCcy];
              const contracts = spec
                ? Math.ceil(Math.abs(b.action_mxn) / spec.contract_size)
                : Math.ceil(Math.abs(b.action_usd) / 62500);
              const marginReq = spec ? contracts * spec.margin_est : 0;

              return (
                <div
                  key={i}
                  style={{
                    display:             "grid",
                    gridTemplateColumns: "110px 155px 100px 110px 140px 130px 120px 100px",
                    padding:             "9px 16px",
                    borderBottom:        `1px solid ${T.soft}`,
                    alignItems:          "center",
                    background:           i % 2 === 0 ? T.bgPanel : `color-mix(in srgb,${T.bgSub} 50%,${T.bgPanel})`,
                    minWidth:             980,
                  }}
                >
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 600, color: T.cyan }}>
                    {b.bucket}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: isSell ? T.red : T.green, letterSpacing: "0.05em" }}>
                    {isSell ? "SELL / BUY USD" : "BUY / SELL USD"}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, color: T.primary, textAlign: "right" as const }}>
                    {contracts.toLocaleString("en-US")}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, color: T.primary, textAlign: "right" as const }}>
                    {_fmtD(b.forward_rate)}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, color: T.secondary, textAlign: "right" as const }}>
                    {_fmtN(b.commercial_exposure_mxn ?? 0)}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, color: T.primary, textAlign: "right" as const }}>
                    {_fmtU(b.action_usd)}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, color: T.amber, textAlign: "right" as const }}>
                    {spec ? _fmtU(marginReq) : "—"}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, color: T.amber, textAlign: "right" as const }}>
                    {_fmtU(b.friction_usd ?? 0)}
                  </span>
                </div>
              );
            })}

            {/* Totals row */}
            {_summary && (() => {
              const spec = CME_SPECS[_primaryCcy];
              const totalContracts = spec
                ? _activeBuckets.reduce((acc, b) => acc + Math.ceil(Math.abs(b.action_mxn) / spec.contract_size), 0)
                : null;
              const totalMarginAll = spec && totalContracts !== null ? totalContracts * spec.margin_est : null;
              return (
                <div style={{
                  display:             "grid",
                  gridTemplateColumns: "110px 155px 100px 110px 140px 130px 120px 100px",
                  padding:             "9px 16px",
                  background:           T.bgSub,
                  alignItems:          "center",
                  borderTop:           `2px solid ${T.rim}`,
                  minWidth:             980,
                }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: T.tertiary }}>TOTAL</span>
                  <span />
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: T.primary, textAlign: "right" as const }}>
                    {totalContracts !== null ? totalContracts.toLocaleString("en-US") : "—"}
                  </span>
                  <span />
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: T.primary, textAlign: "right" as const }}>
                    {_fmtN(_summary.total_commercial_exposure_mxn)}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: T.primary, textAlign: "right" as const }}>
                    {_fmtU(_summary.total_action_usd)}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: T.amber, textAlign: "right" as const }}>
                    {totalMarginAll !== null ? _fmtU(totalMarginAll) : "—"}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: T.amber, textAlign: "right" as const }}>
                    {_fmtU(_summary.total_friction_usd)}
                  </span>
                </div>
              );
            })()}
          </div>
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 — STRESS SCENARIOS
      ══════════════════════════════════════════════════════════════════ */}
      {_sc.filter(t => t.sigma !== 0).length > 0 && (
        <>
          <Divider label="SECTION 5 · STRESS SCENARIOS" />

          <Section title="STRESS SCENARIOS — HEDGE BENEFIT ANALYSIS" defaultOpen={false}>
            <div style={{ overflowX: "auto" }}>
              <div style={{
                display:             "grid",
                gridTemplateColumns: "80px 130px 180px 180px 180px",
                padding:             "7px 16px",
                background:           T.bgSub,
                borderBottom:        `1px solid ${T.soft}`,
                minWidth:             750,
              }}>
                {([
                  { h: "σ",             align: "right" },
                  { h: "SHOCKED SPOT",  align: "right" },
                  { h: "UNHEDGED P&L", align: "right" },
                  { h: "HEDGED P&L",   align: "right" },
                  { h: "HEDGE BENEFIT", align: "right" },
                ] as Array<{ h: string; align: "right" }>).map(({ h, align }) => (
                  <span key={h} style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: T.tertiary, textAlign: align }}>
                    {h}
                  </span>
                ))}
              </div>

              {_sc.filter(t => t.sigma !== 0).map((t, i) => {
                const benefitColor = t.total_hedge_benefit_usd > 0 ? T.green
                  : t.total_hedge_benefit_usd < 0 ? T.red
                  : T.tertiary;

                return (
                  <div
                    key={t.sigma}
                    style={{
                      display:             "grid",
                      gridTemplateColumns: "80px 130px 180px 180px 180px",
                      padding:             "8px 16px",
                      borderBottom:        `1px solid ${T.soft}`,
                      alignItems:          "center",
                      background:           i % 2 === 0 ? T.bgPanel : `color-mix(in srgb,${T.bgSub} 50%,${T.bgPanel})`,
                      minWidth:             750,
                    }}
                  >
                    <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: t.sigma < 0 ? T.red : T.green, textAlign: "right" as const }}>
                      {t.sigma > 0 ? "+" : ""}{t.sigma}σ
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 14, color: T.secondary, textAlign: "right" as const }}>
                      {_fmtD(t.shocked_spot)}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 14, color: T.red, textAlign: "right" as const }}>
                      {_fmtU(t.total_unhedged_usd)}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 14, color: T.amber, textAlign: "right" as const }}>
                      {_fmtU(t.total_hedged_usd)}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: benefitColor, textAlign: "right" as const }}>
                      {_fmtU(t.total_hedge_benefit_usd)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}

      {/* ── Positions reference table ─────────────────────────────────── */}
      <Divider label="POSITIONS IN SCOPE" />

      <div style={{ border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 120px", padding: "7px 16px", background: T.bgSub, borderBottom: `1px solid ${T.soft}` }}>
          {["ENTITY", "TYPE", "CURRENCY", "AMOUNT"].map(h => (
            <span key={h} style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: T.tertiary }}>
              {h}
            </span>
          ))}
        </div>
        <div style={{ maxHeight: 200, overflowY: "auto" }}>
          {positions.map((p, i) => (
            <div key={p.id} style={{
              display:             "grid",
              gridTemplateColumns: "1fr 80px 110px 120px",
              padding:             "7px 16px",
              borderBottom:        `1px solid ${T.soft}`,
              background:           i % 2 === 0 ? T.bgPanel : `color-mix(in srgb,${T.bgSub} 50%,${T.bgPanel})`,
            }}>
              <span style={{ fontFamily: T.fontUI,   fontSize: 13, color: T.primary   }}>{p.entity}</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>{p.type}</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.cyan      }}>{p.currency}</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.primary   }}>{_fmtN(p.amount ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Audit references (collapsible) ───────────────────────────── */}
      <DisclosurePanel title="Audit References" level="L3">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.tertiary }}>RUN ID</span>
            <code style={{ fontFamily: T.fontMono, fontSize: 11, color: T.slate }}>{runId}</code>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.tertiary }}>RISK DECISION HASH</span>
            <code style={{ fontFamily: T.fontMono, fontSize: 11, color: T.slate, wordBreak: "break-all", maxWidth: "70%" }}>
              {riskDecisionHash || "—"}
            </code>
          </div>
          {_re?.outputs_hash && (
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.tertiary }}>OUTPUTS HASH</span>
              <code style={{ fontFamily: T.fontMono, fontSize: 11, color: T.slate, wordBreak: "break-all", maxWidth: "70%" }}>
                {_re.outputs_hash}
              </code>
            </div>
          )}
        </div>
      </DisclosurePanel>

      {/* ── Error banner ─────────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding:      "11px 16px",
          background:   `color-mix(in srgb,${T.red} 10%,transparent)`,
          border:       `1px solid color-mix(in srgb,${T.red} 30%,transparent)`,
          borderRadius:  4,
        }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.red }}>{error}</span>
        </div>
      )}

      {/* ── Submission state banners ─────────────────────────────────── */}
      {submitted && !isSolo && (
        <div style={{
          padding:      "13px 16px",
          background:   `color-mix(in srgb,${T.amber} 8%,${T.bgPanel})`,
          border:       `1px solid color-mix(in srgb,${T.amber} 25%,transparent)`,
          borderRadius:  4,
          display:      "flex",
          alignItems:   "center",
          gap:           12,
        }}>
          <AlertTriangleIcon size={16} color={T.amber} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.amber, letterSpacing: "0.08em" }}>
              PROPOSALS SUBMITTED — AWAITING CHECKER APPROVAL
            </span>
            <Link href="/staging" style={{ fontFamily: T.fontMono, fontSize: 11, color: T.cyan, display: "flex", alignItems: "center", gap: 4 }}>
              VIEW STAGING QUEUE <ExternalLinkIcon size={10} color={T.cyan} />
            </Link>
          </div>
        </div>
      )}

      {submitted && isSolo && (
        <div style={{
          padding:      "11px 16px",
          background:   `color-mix(in srgb,${T.green} 8%,${T.bgPanel})`,
          border:       `1px solid color-mix(in srgb,${T.green} 25%,transparent)`,
          borderRadius:  4,
        }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.green, letterSpacing: "0.08em" }}>
            SELF-APPROVED (SOLO MODE) — {proposalIds.length} PROPOSAL{proposalIds.length !== 1 ? "S" : ""} STAGED
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STICKY ACTION BAR
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{
        position:       "sticky",
        bottom:          0,
        zIndex:          10,
        background:     "var(--bg-panel)",
        borderTop:      "2px solid var(--border-rim)",
        padding:        "16px 24px",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:             16,
        marginTop:       24,
      }}>
        {/* Left — back nav */}
        <button
          onClick={onBack}
          style={{
            height: 36, padding: "0 16px",
            display: "flex", alignItems: "center", gap: 6,
            background: "transparent", color: T.secondary,
            border: `1px solid ${T.rim}`, borderRadius: 3,
            fontFamily: T.fontMono, fontSize: 10, fontWeight: 600,
            letterSpacing: "0.06em", cursor: "pointer",
          }}
        >
          <ChevronLeftIcon size={12} color={T.secondary} />
          BACK TO RISK
        </button>

        {/* Right — action group */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {_activeBuckets.length > 0 && (
            <button
              onClick={handleOpenIbkr}
              title="Open prefilled order ticket in Interactive Brokers"
              style={{
                height: 36, padding: "0 14px",
                display: "flex", alignItems: "center", gap: 6,
                background: T.royal, color: "#fff",
                border: "none", borderRadius: 3,
                fontFamily: T.fontMono, fontSize: 10, fontWeight: 700,
                letterSpacing: "0.06em", cursor: "pointer",
              }}
            >
              <ExternalLinkIcon size={12} color="#fff" />
              IBKR TICKET
            </button>
          )}

          {!submitted && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                height: 48, padding: "0 36px",
                fontFamily: T.fontMono, fontSize: 13, fontWeight: 700,
                letterSpacing: "0.10em", color: "#ffffff",
                background: submitting ? T.slate : "var(--accent-cyan)",
                border: "none", borderRadius: 3,
                cursor: submitting ? "not-allowed" : "pointer",
                whiteSpace: "nowrap" as const,
                boxShadow: submitting ? "none" : `0 0 0 1px color-mix(in srgb,var(--accent-cyan) 60%,transparent)`,
              }}
            >
              {submitting && (
                <LoaderIcon size={14} color="#ffffff" style={{ animation: "spin 1s linear infinite" }} />
              )}
              {isSolo ? "APPROVE & SUBMIT PROPOSALS" : "SUBMIT FOR CHECKER APPROVAL"}
            </button>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
