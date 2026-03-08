"use client";

import { useState } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { PositionRow } from "@/api/positionClient";
import { translateError, translateCaughtError, type TranslatedError } from "@/lib/errors/hedgeErrors";
import HedgeErrorBanner from "./ErrorBanner";
import { T } from "./tokens";
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  LoaderIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
  CopyIcon,
} from "lucide-react";
import Link from "next/link";

// ─── CME Contract Specifications ─────────────────────────────────────────────

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
  MXN: { symbol: "M6M", name: "Mexican Peso Futures",        contract_size: 500000,   currency: "MXN", margin_est: 1800, tick_size: 0.000025,  tick_value: 12.50, exchange: "CME", settle: "3rd Wednesday" },
  EUR: { symbol: "6E",  name: "Euro FX Futures",             contract_size: 125000,   currency: "EUR", margin_est: 2200, tick_size: 0.00005,   tick_value: 6.25,  exchange: "CME", settle: "3rd Wednesday" },
  GBP: { symbol: "6B",  name: "British Pound Futures",       contract_size: 62500,    currency: "GBP", margin_est: 1900, tick_size: 0.0001,    tick_value: 6.25,  exchange: "CME", settle: "3rd Wednesday" },
  JPY: { symbol: "6J",  name: "Japanese Yen Futures",        contract_size: 12500000, currency: "JPY", margin_est: 2000, tick_size: 0.0000005, tick_value: 6.25,  exchange: "CME", settle: "3rd Wednesday" },
  CAD: { symbol: "6C",  name: "Canadian Dollar Futures",     contract_size: 100000,   currency: "CAD", margin_est: 1500, tick_size: 0.00005,   tick_value: 5.00,  exchange: "CME", settle: "3rd Wednesday" },
  CHF: { symbol: "6S",  name: "Swiss Franc Futures",         contract_size: 125000,   currency: "CHF", margin_est: 2100, tick_size: 0.0001,    tick_value: 12.50, exchange: "CME", settle: "3rd Wednesday" },
  AUD: { symbol: "6A",  name: "Australian Dollar Futures",   contract_size: 100000,   currency: "AUD", margin_est: 1400, tick_size: 0.0001,    tick_value: 10.00, exchange: "CME", settle: "3rd Wednesday" },
  NZD: { symbol: "6N",  name: "New Zealand Dollar Futures",  contract_size: 100000,   currency: "NZD", margin_est: 1300, tick_size: 0.0001,    tick_value: 10.00, exchange: "CME", settle: "3rd Wednesday" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionRule({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div style={{ width: 3, height: 12, background: T.cyan, borderRadius: 1, flexShrink: 0 }} />
      <span style={{
        fontFamily:    T.fontMono,
        fontSize:      12,
        fontWeight:    700,
        letterSpacing: "0.14em",
        color:         T.tertiary,
        textTransform: "uppercase" as const,
        whiteSpace:    "nowrap" as const,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: T.rim }} />
    </div>
  );
}

function MetaKV({ label, value, valueColor, mono = true }: {
  label: string; value: React.ReactNode; valueColor?: string; mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        fontFamily:    T.fontMono,
        fontSize:      12,
        color:         T.tertiary,
        letterSpacing: "0.10em",
        minWidth:      76,
        flexShrink:    0,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? T.fontMono : T.fontUI,
        fontSize:   13,
        color:      valueColor ?? T.primary,
        letterSpacing: mono ? "0.02em" : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}

function CollapsibleSection({
  label,
  defaultOpen = false,
  badge,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          margin: "4px 0",
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left" as const,
        }}
      >
        <div style={{ width: 3, height: 12, background: T.slate, borderRadius: 1, flexShrink: 0 }} />
        <span style={{
          fontFamily:    T.fontMono,
          fontSize:      12,
          fontWeight:    700,
          letterSpacing: "0.14em",
          color:         T.tertiary,
          textTransform: "uppercase" as const,
          whiteSpace:    "nowrap" as const,
        }}>
          {label}
        </span>
        {badge}
        <div style={{ flex: 1, height: 1, background: T.rim }} />
        {open
          ? <ChevronDownIcon size={14} color={T.slate} />
          : <ChevronRightIcon size={14} color={T.slate} />
        }
      </button>
      {open && children}
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

// ─── Component ────────────────────────────────────────────────────────────────

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
  const [error, setError]             = useState<TranslatedError | null>(null);
  const [submitted, setSubmitted]     = useState(false);
  const [proposalIds, setProposalIds] = useState<string[]>([]);
  const [copied, setCopied]           = useState<"text" | "json" | null>(null);

  const isSolo = governanceMode === "solo";

  // ── Engine output extraction ──────────────────────────────────────────────

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
  const stressRows       = _sc.filter(t => t.sigma !== 0);

  // ── Verdict ───────────────────────────────────────────────────────────────

  const verdictColor = riskVerdict === "REJECT"                     ? T.red
    : riskVerdict === "APPROVE_WITH_CONDITIONS"                     ? T.amber
    : riskVerdict === "UNAVAILABLE"                                 ? T.amber
    : T.green;

  const verdictLabel = riskVerdict === "APPROVE"                    ? "RISK GATE: PASS"
    : riskVerdict === "APPROVE_WITH_CONDITIONS"                     ? "RISK GATE: CONDITIONAL"
    : riskVerdict === "UNAVAILABLE"                                 ? "RISK GATE: UNAVAILABLE"
    : riskVerdict;

  // ── Decision Thesis derivation ────────────────────────────────────────────

  const _isApprove = riskVerdict === "APPROVE";
  const _isConditional = riskVerdict === "APPROVE_WITH_CONDITIONS";
  const _thesisBorder = _isApprove ? T.green : T.amber;

  // Find worst-case stress benefit (most negative sigma)
  const _worstStress = stressRows.length > 0
    ? stressRows.reduce((worst, s) => s.sigma < worst.sigma ? s : worst, stressRows[0])
    : null;

  const _ccyList = activeCurrencies.join("/");
  const _policyStatus = _isApprove
    ? "No policy violations detected."
    : _isConditional
    ? "Conditions require acknowledgement before execution."
    : riskVerdict === "UNAVAILABLE"
    ? "Risk gate unavailable -- proceed with caution."
    : "Risk gate has rejected this plan.";

  // ── Submit ────────────────────────────────────────────────────────────────

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
        let detail: string | undefined;
        try {
          const errData = await res.json() as Record<string, unknown>;
          const d = errData.detail;
          detail = typeof d === "string" ? d
            : Array.isArray(d) ? d.map((x: Record<string, unknown>) => x.msg ?? JSON.stringify(x)).join("; ")
            : d ? JSON.stringify(d) : undefined;
        } catch { /* body not JSON */ }
        setError(translateError(res.status, detail));
        setSubmitting(false);
        return;
      }
      const data     = await res.json() as Record<string, unknown>;
      const items    = (data.approved ?? data.proposals ?? []) as Array<Record<string, unknown>>;
      const failures = (data.failed ?? []) as Array<Record<string, unknown>>;
      const ids      = items.map(item => (item.id ?? item.proposal_id) as string).filter(Boolean);

      // Defense: if all proposals failed, block advancement
      if (ids.length === 0 && failures.length > 0) {
        const reason = (failures[0]?.error as string) ?? "Proposal creation failed for all positions";
        setError(translateError(400, reason));
        setSubmitting(false);
        return;
      }

      setProposalIds(ids);
      setSubmitted(true);
      onComplete(ids);
    } catch (e) {
      setError(translateCaughtError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyText = () => {
    const lines = [
      "ORDR TERMINAL — HEDGE EXECUTION PLAN",
      `Run: ${(_re?.run_id ?? runId).slice(0, 12)}  Engine: ${_re?.engine_version ?? "—"}  ${new Date().toISOString().slice(0, 16)} UTC`,
      `Risk: ${riskVerdict}  Hash: ${riskDecisionHash.slice(0, 16) || "—"}`,
      "",
      `POSITIONS (${positions.length})`,
      ...positions.map(p => `  ${p.type} ${_fmtN(p.amount ?? 0)} ${p.currency}  ${p.entity}  ${p.value_date}`),
      "",
      "EXECUTION LEGS",
      ..._activeBuckets.map(b => {
        const dir  = (b.action_direction ?? "").startsWith("SELL") ? "SELL" : "BUY";
        const spec = CME_SPECS[_primaryCcy];
        const cts  = spec ? Math.ceil(Math.abs(b.action_mxn) / spec.contract_size) : "—";
        return `  ${b.bucket}  ${dir}  rate: ${_fmtD(b.forward_rate)}  ${_fmtN(b.action_mxn)} ${_primaryCcy}  ${_fmtU(b.action_usd)}  contracts: ${cts}`;
      }),
      "",
      "SUMMARY",
      `  Coverage:  ${_coveragePct.toFixed(1)}%`,
      `  Total USD: ${_fmtU(_summary?.total_action_usd ?? 0)}`,
      `  Cost:      ${_fmtU(_summary?.total_friction_usd ?? 0)} (${_costBps.toFixed(1)} bps)`,
      `  Residual:  ${_fmtN(_summary?.total_residual_mxn ?? 0)} ${_primaryCcy}`,
    ].join("\n");
    navigator.clipboard.writeText(lines).catch(() => {});
    setCopied("text");
    setTimeout(() => setCopied(null), 2000);
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
          settlement:   b.bucket,
          direction:    b.action_direction ?? "SELL",
          forward_rate: b.forward_rate,
          action_mxn:   b.action_mxn,
          action_usd:   b.action_usd,
          friction_usd: b.friction_usd ?? 0,
          contracts,
        };
      }),
      summary:      _summary,
      coverage_pct: _coveragePct,
      cost_bps:     _costBps,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(() => {});
    setCopied("json");
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Derived totals for execution legs ────────────────────────────────────

  const _spec = CME_SPECS[_primaryCcy];
  const _totalContracts = _spec
    ? _activeBuckets.reduce((acc, b) => acc + Math.ceil(Math.abs(b.action_mxn) / _spec.contract_size), 0)
    : null;
  const _totalMarginAll = _spec && _totalContracts !== null ? _totalContracts * _spec.margin_est : null;

  // CTA label derivation
  const _ctaLabel = isSolo
    ? `APPROVE & SUBMIT — ${_activeBuckets.length} leg${_activeBuckets.length !== 1 ? "s" : ""}, ${_coveragePct.toFixed(0)}% coverage`
    : `SUBMIT FOR APPROVAL — ${_activeBuckets.length} leg${_activeBuckets.length !== 1 ? "s" : ""}`;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:            0,
      height:        "100%",
      overflowY:     "auto",
      background:    T.bgPanel,
      fontFamily:    T.fontUI,
    }}>

      {/* ── 1. STEP HEADER (compact, ~50px) ───────────────────────────────── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "14px 24px",
        background:     T.bgSub,
        borderBottom:   `1px solid ${T.rim}`,
        flexShrink:     0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: T.tertiary }}>
            STEP 4 OF 5
          </span>
          <span style={{ width: 1, height: 14, background: T.soft, display: "inline-block" }} />
          <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: T.primary }}>
            REVIEW HEDGE PLAN
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Run ID badge */}
          <span style={{
            fontFamily:    T.fontMono,
            fontSize:      10,
            letterSpacing: "0.06em",
            color:         T.cyan,
            padding:       "3px 10px",
            background:    `color-mix(in srgb, ${T.cyan} 10%, transparent)`,
            border:        `1px solid color-mix(in srgb, ${T.cyan} 25%, transparent)`,
            borderRadius:  2,
          }}>
            RUN {(_re?.run_id ?? runId).slice(0, 8).toUpperCase()}
          </span>
          {/* Verdict badge */}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:           6,
            padding:      "3px 10px",
            background:   `color-mix(in srgb, ${verdictColor} 10%, transparent)`,
            border:       `1px solid color-mix(in srgb, ${verdictColor} 25%, transparent)`,
            borderRadius:  2,
          }}>
            {riskVerdict === "APPROVE"
              ? <CheckCircleIcon size={12} color={verdictColor} />
              : <AlertTriangleIcon size={12} color={verdictColor} />
            }
            <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, color: verdictColor, letterSpacing: "0.10em" }}>
              {verdictLabel}
            </span>
          </div>
          {submitted && (
            <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, color: T.green, letterSpacing: "0.10em" }}>
              SUBMITTED
            </span>
          )}
        </div>
      </div>

      {/* ── BODY CONTENT ─────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>

        {/* ── 2. DECISION THESIS ─────────────────────────────────────────── */}
        <div style={{
          border:       `1px solid ${T.rim}`,
          borderLeft:   `4px solid ${_thesisBorder}`,
          borderRadius: 3,
          background:   T.bgPanel,
          padding:      "20px 24px",
        }}>
          <div style={{
            fontFamily:    T.fontMono,
            fontSize:      12,
            fontWeight:    700,
            letterSpacing: "0.14em",
            color:         T.primary,
            marginBottom:  14,
          }}>
            HEDGE RECOMMENDATION
          </div>
          <div style={{
            fontFamily: T.fontUI,
            fontSize:   14,
            lineHeight: 1.7,
            color:      T.secondary,
          }}>
            <p style={{ margin: "0 0 8px" }}>
              Approve {_activeBuckets.length}-leg {_ccyList} hedge covering{" "}
              <span style={{ fontFamily: T.fontMono, fontWeight: 700, color: T.primary }}>
                {_coveragePct.toFixed(1)}%
              </span>{" "}
              of confirmed exposure at{" "}
              <span style={{ fontFamily: T.fontMono, fontWeight: 700, color: T.primary }}>
                {_costBps.toFixed(1)} bps
              </span>{" "}
              estimated cost
              {_summary ? ` (${_fmtU(_summary.total_friction_usd)}).` : "."}
            </p>
            {_worstStress && (
              <p style={{ margin: "0 0 8px" }}>
                Stress analysis shows{" "}
                <span style={{ fontFamily: T.fontMono, fontWeight: 700, color: _worstStress.total_hedge_benefit_usd > 0 ? T.green : T.red }}>
                  {_fmtU(_worstStress.total_hedge_benefit_usd)}
                </span>{" "}
                hedge benefit at {_worstStress.sigma > 0 ? "+" : ""}{_worstStress.sigma}{"\u03C3"} shock.
              </p>
            )}
            <p style={{ margin: 0 }}>
              {_policyStatus}
            </p>
          </div>
          {/* Footer bar: verdict + governance */}
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:         16,
            marginTop:   14,
            paddingTop:  12,
            borderTop:  `1px solid ${T.rim}`,
            flexWrap:   "wrap" as const,
          }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>Risk verdict:</span>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: verdictColor }}>
              {riskVerdict === "APPROVE" ? "PASS" : riskVerdict === "APPROVE_WITH_CONDITIONS" ? "CONDITIONAL" : riskVerdict}
            </span>
            <span style={{ width: 1, height: 12, background: T.rim, display: "inline-block" }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>Governance:</span>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.primary }}>
              {isSolo ? "SOLO" : "4-EYES"}
            </span>
            {_summary && (
              <>
                <span style={{ width: 1, height: 12, background: T.rim, display: "inline-block" }} />
                <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>Total action:</span>
                <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.primary }}>
                  {_fmtU(_summary.total_action_usd)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── 3. KPI METRICS BAND ────────────────────────────────────────── */}
        {_summary && (
          <>
            <SectionRule label="Performance Metrics" />
            <div style={{
              display:             "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap:                  1,
              background:           T.rim,
              border:              `1px solid ${T.rim}`,
              borderRadius:         3,
              overflow:            "hidden",
            }}>
              {([
                {
                  label: "COVERAGE RATIO",
                  value: `${_coveragePct.toFixed(1)}%`,
                  sub:   _coveragePct >= 80 ? "TARGET MET" : _coveragePct >= 50 ? "PARTIAL" : "BELOW TARGET",
                  color: _coveragePct >= 80 ? T.green : _coveragePct >= 50 ? T.amber : T.red,
                },
                {
                  label: "TOTAL ACTION",
                  value: _fmtU(_summary.total_action_usd),
                  sub:   "USD EQUIVALENT",
                  color: T.primary,
                },
                {
                  label: "HEDGE POSITION",
                  value: `${_fmtN(_summary.total_hedge_position_mxn)}`,
                  sub:   `${_primaryCcy} LOCKED`,
                  color: T.primary,
                },
                {
                  label: "RESIDUAL EXPOSURE",
                  value: `${_fmtN(_summary.total_residual_mxn)}`,
                  sub:   _summary.total_residual_mxn > 0 ? "OPEN RISK" : "FULLY COVERED",
                  color: _summary.total_residual_mxn > 0 ? T.amber : T.green,
                },
                {
                  label: "FRICTION COST",
                  value: `${_costBps.toFixed(1)} bps`,
                  sub:   _fmtU(_summary.total_friction_usd),
                  color: T.secondary,
                },
              ] as Array<{ label: string; value: string; sub: string; color: string }>).map(({ label, value, sub, color }) => (
                <div key={label} style={{ background: T.bgPanel, padding: "14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, letterSpacing: "0.14em" }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
                    {value}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary, letterSpacing: "0.08em" }}>
                    {sub}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── 4. EXECUTION PLAN ──────────────────────────────────────────── */}
        {_activeBuckets.length > 0 && (
          <>
            <SectionRule label={`Execution Legs  ·  ${_activeBuckets.length} active`} />
            <div style={{ border: `1px solid ${T.rim}`, borderRadius: 3, overflow: "hidden" }}>

              {/* Column headers */}
              <div style={{
                display:             "grid",
                gridTemplateColumns: "120px 160px 90px 120px 150px 130px 120px 110px",
                padding:             "8px 16px",
                background:          T.bgSub,
                borderBottom:        `1px solid ${T.rim}`,
                minWidth:             1020,
              }}>
                {([
                  { h: "SETTLEMENT", align: "left"  },
                  { h: "DIRECTION",  align: "left"  },
                  { h: "CONTRACTS",  align: "right" },
                  { h: "FWD RATE",   align: "right" },
                  { h: "EXPOSURE",   align: "right" },
                  { h: "ACTION USD", align: "right" },
                  { h: "MARGIN REQ", align: "right" },
                  { h: "COST",       align: "right" },
                ] as Array<{ h: string; align: "left" | "right" }>).map(({ h, align }) => (
                  <span key={h} style={{
                    fontFamily:    T.fontMono,
                    fontSize:      12,
                    fontWeight:    700,
                    letterSpacing: "0.12em",
                    color:         T.tertiary,
                    textAlign:     align,
                  }}>
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
                      gridTemplateColumns: "120px 160px 90px 120px 150px 130px 120px 110px",
                      padding:             "10px 16px",
                      borderBottom:        i < _activeBuckets.length - 1 ? `1px solid ${T.rim}` : "none",
                      alignItems:          "center",
                      background:           i % 2 === 0 ? T.bgPanel : T.bgSub,
                      minWidth:             1020,
                    }}
                  >
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.cyan }}>
                      {b.bucket}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        display:      "inline-block",
                        padding:      "1px 6px",
                        background:   isSell
                          ? `color-mix(in srgb, ${T.red} 12%, transparent)`
                          : `color-mix(in srgb, ${T.green} 12%, transparent)`,
                        border:       `1px solid color-mix(in srgb, ${isSell ? T.red : T.green} 30%, transparent)`,
                        borderRadius:  2,
                        fontFamily:    T.fontMono,
                        fontSize:      10,
                        fontWeight:    700,
                        letterSpacing: "0.06em",
                        color:         isSell ? T.red : T.green,
                      }}>
                        {isSell ? "SELL" : "BUY"}
                      </span>
                      <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary }}>
                        {isSell ? "/ BUY USD" : "/ SELL USD"}
                      </span>
                    </div>
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.primary, textAlign: "right" as const }}>
                      {contracts.toLocaleString("en-US")}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.primary, textAlign: "right" as const }}>
                      {_fmtD(b.forward_rate)}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.tertiary, textAlign: "right" as const }}>
                      {_fmtN(b.commercial_exposure_mxn ?? 0)}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.primary, textAlign: "right" as const }}>
                      {_fmtU(b.action_usd)}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.amber, textAlign: "right" as const }}>
                      {spec ? _fmtU(marginReq) : "—"}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.tertiary, textAlign: "right" as const }}>
                      {_fmtU(b.friction_usd ?? 0)}
                    </span>
                  </div>
                );
              })}

              {/* Totals row */}
              {_summary && (
                <div style={{
                  display:             "grid",
                  gridTemplateColumns: "120px 160px 90px 120px 150px 130px 120px 110px",
                  padding:             "9px 16px",
                  background:          T.bgSub,
                  alignItems:          "center",
                  borderTop:           `2px solid ${T.soft}`,
                  minWidth:             1020,
                }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: T.tertiary }}>
                    TOTAL
                  </span>
                  <span />
                  <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.primary, textAlign: "right" as const }}>
                    {_totalContracts !== null ? _totalContracts.toLocaleString("en-US") : "—"}
                  </span>
                  <span />
                  <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.primary, textAlign: "right" as const }}>
                    {_fmtN(_summary.total_commercial_exposure_mxn)}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.primary, textAlign: "right" as const }}>
                    {_fmtU(_summary.total_action_usd)}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.amber, textAlign: "right" as const }}>
                    {_totalMarginAll !== null ? _fmtU(_totalMarginAll) : "—"}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.secondary, textAlign: "right" as const }}>
                    {_fmtU(_summary.total_friction_usd)}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── 5. STRESS SCENARIOS ────────────────────────────────────────── */}
        {stressRows.length > 0 && (
          <>
            <SectionRule label="Stress Scenarios  ·  Hedge Benefit Analysis" />
            <div style={{ border: `1px solid ${T.rim}`, borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                display:             "grid",
                gridTemplateColumns: "80px 140px 180px 180px 180px",
                padding:             "8px 16px",
                background:          T.bgSub,
                borderBottom:        `1px solid ${T.rim}`,
                minWidth:             780,
              }}>
                {([
                  { h: "\u03C3",       align: "right" },
                  { h: "SHOCKED SPOT",  align: "right" },
                  { h: "UNHEDGED P&L",  align: "right" },
                  { h: "HEDGED P&L",    align: "right" },
                  { h: "HEDGE BENEFIT", align: "right" },
                ] as Array<{ h: string; align: "right" }>).map(({ h, align }) => (
                  <span key={h} style={{
                    fontFamily: T.fontMono, fontSize: 12, fontWeight: 700,
                    letterSpacing: "0.12em", color: T.tertiary, textAlign: align,
                  }}>
                    {h}
                  </span>
                ))}
              </div>

              {stressRows.map((t, i) => {
                const bColor = t.total_hedge_benefit_usd > 0 ? T.green
                  : t.total_hedge_benefit_usd < 0 ? T.red
                  : T.secondary;
                return (
                  <div
                    key={t.sigma}
                    style={{
                      display:             "grid",
                      gridTemplateColumns: "80px 140px 180px 180px 180px",
                      padding:             "9px 16px",
                      borderBottom:        i < stressRows.length - 1 ? `1px solid ${T.rim}` : "none",
                      alignItems:          "center",
                      background:           i % 2 === 0 ? T.bgPanel : T.bgSub,
                      minWidth:             780,
                    }}
                  >
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: t.sigma < 0 ? T.red : T.green, textAlign: "right" as const }}>
                      {t.sigma > 0 ? "+" : ""}{t.sigma}{"\u03C3"}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.secondary, textAlign: "right" as const }}>
                      {_fmtD(t.shocked_spot)}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.red, textAlign: "right" as const }}>
                      {_fmtU(t.total_unhedged_usd)}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 13, color: T.amber, textAlign: "right" as const }}>
                      {_fmtU(t.total_hedged_usd)}
                    </span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: bColor, textAlign: "right" as const }}>
                      {_fmtU(t.total_hedge_benefit_usd)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── 6. RUN METADATA & AUDIT (collapsible, default closed) ──────── */}
        <CollapsibleSection
          label="Run Metadata & Audit"
          badge={
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <ShieldCheckIcon size={12} color={T.green} />
              <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.green, letterSpacing: "0.08em" }}>
                VERIFIED
              </span>
            </span>
          }
        >
          {/* Run metadata grid */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap:                  1,
            background:           T.rim,
            border:              `1px solid ${T.rim}`,
            borderRadius:         3,
            overflow:            "hidden",
            marginTop:            8,
          }}>
            {([
              { label: "RUN ID",       value: _re?.run_id ?? runId },
              { label: "AS-OF",        value: _re?.timestamp
                  ? new Date(_re.timestamp).toLocaleString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit", timeZone: "UTC",
                    }) + " UTC"
                  : "—" },
              { label: "ENGINE",       value: _re?.engine_version ?? "—" },
              { label: "POLICY HASH",  value: _re?.policy_hash ?? "—" },
              { label: "INPUTS HASH",  value: _re?.inputs_hash ?? "—" },
              { label: "OUTPUTS HASH", value: _re?.outputs_hash ?? "—" },
            ] as Array<{ label: string; value: string }>).map(({ label, value }) => (
              <div key={label} style={{ background: T.bgPanel, padding: "12px 14px" }}>
                <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, letterSpacing: "0.12em", marginBottom: 4 }}>
                  {label}
                </div>
                <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary, wordBreak: "break-all" as const }}>
                  {value}
                </code>
              </div>
            ))}
          </div>

          {/* Risk decision hash */}
          {riskDecisionHash && (
            <div style={{
              marginTop:    8,
              border:      `1px solid ${T.rim}`,
              borderRadius: 3,
              background:   T.bgPanel,
              padding:     "12px 14px",
            }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, letterSpacing: "0.12em", marginBottom: 4 }}>
                RISK DECISION HASH
              </div>
              <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary, wordBreak: "break-all" as const }}>
                {riskDecisionHash}
              </code>
            </div>
          )}

          {/* CME Contract Specifications (reference data, inside collapsible) */}
          {activeCurrencies.some(ccy => !!CME_SPECS[ccy]) && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                fontFamily:    T.fontMono,
                fontSize:      12,
                fontWeight:    700,
                letterSpacing: "0.12em",
                color:         T.tertiary,
                marginBottom:  8,
              }}>
                CME CONTRACT SPECIFICATIONS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, background: T.rim, border: `1px solid ${T.rim}`, borderRadius: 3, overflow: "hidden" }}>
                {activeCurrencies.filter(ccy => !!CME_SPECS[ccy]).map(ccy => {
                  const spec = CME_SPECS[ccy]!;
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
                    <div key={ccy} style={{ background: T.bgPanel }}>
                      {/* Instrument header */}
                      <div style={{
                        display:        "flex",
                        alignItems:     "center",
                        gap:             16,
                        padding:        "10px 18px",
                        borderBottom:   `1px solid ${T.rim}`,
                        background:     T.bgSub,
                      }}>
                        <span style={{ fontFamily: T.fontMono, fontSize: 18, fontWeight: 700, color: T.cyan }}>
                          {spec.symbol}
                        </span>
                        <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, color: T.primary, letterSpacing: "0.04em" }}>
                          {spec.name.toUpperCase()}
                        </span>
                        <div style={{ flex: 1 }} />
                        <span style={{
                          fontFamily:    T.fontMono,
                          fontSize:       12,
                          fontWeight:     700,
                          letterSpacing: "0.12em",
                          color:          T.cyan,
                          padding:       "2px 8px",
                          border:        `1px solid ${T.soft}`,
                          borderRadius:   2,
                        }}>
                          {spec.exchange}
                        </span>
                      </div>

                      {/* Spec grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1, background: T.rim }}>
                        {([
                          { label: "CONTRACT SIZE", value: `${_fmtN(spec.contract_size)} ${spec.currency}` },
                          { label: "TICK SIZE",     value: _fmtTick(spec.tick_size) },
                          { label: "TICK VALUE",    value: `$${spec.tick_value.toFixed(2)}` },
                          { label: "MARGIN EST",    value: _fmtU(spec.margin_est) },
                          { label: "SETTLEMENT",    value: spec.settle },
                          { label: "EXCHANGE",      value: spec.exchange },
                        ] as Array<{ label: string; value: string }>).map(({ label, value }) => (
                          <div key={label} style={{ background: T.bgPanel, padding: "10px 12px" }}>
                            <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, letterSpacing: "0.12em", marginBottom: 4 }}>
                              {label}
                            </div>
                            <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.primary }}>
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Derived row */}
                      {contractsNeeded > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: T.rim, borderTop: `1px solid ${T.rim}` }}>
                          {([
                            { label: "CONTRACTS NEEDED", value: contractsNeeded.toLocaleString("en-US"), color: T.cyan },
                            { label: "TOTAL MARGIN REQ",  value: _fmtU(totalMargin),                      color: T.amber },
                            { label: "NOTIONAL VALUE",    value: _fmtU(notionalValue),                    color: T.primary },
                          ] as Array<{ label: string; value: string; color: string }>).map(({ label, value, color }) => (
                            <div key={label} style={{ background: T.bgSub, padding: "10px 12px" }}>
                              <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, letterSpacing: "0.12em", marginBottom: 4 }}>
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
            </div>
          )}
        </CollapsibleSection>

        {/* ── 7. POSITIONS IN SCOPE (collapsible, default collapsed if >5) ── */}
        {positions.length > 0 && (
          <CollapsibleSection
            label={`Positions in Scope  ·  ${positions.length} position${positions.length !== 1 ? "s" : ""}`}
            defaultOpen={positions.length <= 5}
          >
            <div style={{ border: `1px solid ${T.rim}`, borderRadius: 3, overflow: "hidden", marginTop: 8 }}>
              <div style={{
                display:             "grid",
                gridTemplateColumns: "1fr 90px 110px 130px 160px",
                padding:             "8px 16px",
                background:          T.bgSub,
                borderBottom:        `1px solid ${T.rim}`,
              }}>
                {(["ENTITY", "TYPE", "CURRENCY", "AMOUNT", "VALUE DATE"] as string[]).map(h => (
                  <span key={h} style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: T.tertiary }}>
                    {h}
                  </span>
                ))}
              </div>
              {positions.map((p, i) => (
                <div key={p.id} style={{
                  display:             "grid",
                  gridTemplateColumns: "1fr 90px 110px 130px 160px",
                  padding:             "9px 16px",
                  borderBottom:        i < positions.length - 1 ? `1px solid ${T.rim}` : "none",
                  background:           i % 2 === 0 ? T.bgPanel : T.bgSub,
                }}>
                  <span style={{ fontFamily: T.fontUI,   fontSize: 13, color: T.primary   }}>{p.entity}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary  }}>{p.type}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.cyan      }}>{p.currency}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.primary   }}>{_fmtN(p.amount ?? 0)}</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary  }}>{p.value_date ?? "—"}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* ── ERROR BANNER ──────────────────────────────────────────────── */}
        {error && (
          <HedgeErrorBanner
            error={error}
            onRetry={() => { setError(null); handleSubmit(); }}
            onReconnect={() => window.location.href = "/auth/login"}
            onGoBack={onBack}
            onDismiss={() => setError(null)}
          />
        )}

        {/* ── POST-SUBMIT STATE ─────────────────────────────────────────── */}
        {submitted && !isSolo && (
          <div style={{
            padding:     "14px 18px",
            background:  `color-mix(in srgb, ${T.amber} 8%, ${T.bgPanel})`,
            border:      `1px solid color-mix(in srgb, ${T.amber} 25%, transparent)`,
            borderRadius: 3,
            display:     "flex",
            alignItems:  "center",
            gap:          14,
          }}>
            <AlertTriangleIcon size={14} color={T.amber} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.amber, letterSpacing: "0.08em" }}>
                PROPOSALS SUBMITTED — AWAITING CHECKER APPROVAL
              </span>
              <Link href="/staging" style={{ fontFamily: T.fontMono, fontSize: 12, color: T.cyan, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                VIEW STAGING QUEUE <ExternalLinkIcon size={10} color={T.cyan} />
              </Link>
            </div>
          </div>
        )}

        {submitted && isSolo && (
          <div style={{
            padding:     "12px 16px",
            background:  `color-mix(in srgb, ${T.green} 8%, ${T.bgPanel})`,
            border:      `1px solid color-mix(in srgb, ${T.green} 25%, transparent)`,
            borderRadius: 3,
          }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.green, letterSpacing: "0.08em" }}>
              SELF-APPROVED (SOLO MODE) — {proposalIds.length} PROPOSAL{proposalIds.length !== 1 ? "S" : ""} STAGED
            </span>
          </div>
        )}

      </div>

      {/* ── 9. ACTION BAR (sticky bottom) ────────────────────────────────── */}
      <div style={{
        position:       "sticky",
        bottom:          0,
        zIndex:          20,
        background:      T.bgSub,
        borderTop:      `1px solid ${T.soft}`,
        padding:        "12px 24px",
        display:        "flex",
        alignItems:     "center",
        gap:             12,
        flexShrink:      0,
      }}>
        {/* Back */}
        <button
          onClick={onBack}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:           4,
            fontFamily:    T.fontMono,
            fontSize:      12,
            letterSpacing: "0.06em",
            color:         T.secondary,
            background:   "transparent",
            border:       `1px solid ${T.rim}`,
            padding:      "8px 14px",
            cursor:        "pointer",
            borderRadius:  3,
          }}
        >
          <ChevronLeftIcon size={12} />
          BACK
        </button>

        {/* Center -- status + copy actions */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          {submitted && (
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.green, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircleIcon size={10} />
              {isSolo ? "APPROVED" : "SUBMITTED"}
            </span>
          )}
          {!submitted && !submitting && (
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.green, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircleIcon size={10} />
              READY TO SUBMIT
            </span>
          )}

          <div style={{ flex: 1 }} />

          <button
            onClick={handleCopyText}
            title="Copy execution plan as text"
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:           4,
              fontFamily:    T.fontMono,
              fontSize:      12,
              letterSpacing: "0.06em",
              color:         copied === "text" ? T.green : T.secondary,
              background:   "transparent",
              border:       `1px solid ${T.rim}`,
              padding:      "8px 12px",
              cursor:        "pointer",
              borderRadius:  3,
            }}
          >
            <CopyIcon size={10} />
            {copied === "text" ? "COPIED" : "TEXT"}
          </button>

          <button
            onClick={handleCopyJson}
            title="Copy execution payload as JSON"
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:           4,
              fontFamily:    T.fontMono,
              fontSize:      12,
              letterSpacing: "0.06em",
              color:         copied === "json" ? T.green : T.secondary,
              background:   "transparent",
              border:       `1px solid ${T.rim}`,
              padding:      "8px 12px",
              cursor:        "pointer",
              borderRadius:  3,
            }}
          >
            <CopyIcon size={10} />
            {copied === "json" ? "COPIED" : "JSON"}
          </button>
        </div>

        {/* Primary CTA -- enhanced label */}
        {!submitted && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:           8,
              fontFamily:    T.fontMono,
              fontSize:      12,
              fontWeight:    700,
              letterSpacing: "0.08em",
              color:         "#fff",
              background:    submitting ? T.tertiary : T.royal,
              border:       "none",
              padding:      "10px 24px",
              cursor:        submitting ? "not-allowed" : "pointer",
              borderRadius:  3,
              whiteSpace:   "nowrap" as const,
              transition:   "background 0.15s",
            }}
          >
            {submitting && <LoaderIcon size={13} color="#fff" style={{ animation: "spin 1s linear infinite" }} />}
            {_ctaLabel} {"\u2192"}
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
