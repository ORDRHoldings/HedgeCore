"use client";

import { useState } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { PositionRow } from "@/api/positionClient";
import { translateError, translateCaughtError, type TranslatedError } from "@/lib/errors/hedgeErrors";
import HedgeErrorBanner from "./ErrorBanner";
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  LoaderIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
  CopyIcon,
} from "lucide-react";
import Link from "next/link";

// ─── Bloomberg / BlackRock Terminal Palette ──────────────────────────────────

const D = {
  bg:        "var(--bg-panel)",
  panel:     "#0D1017",
  panelAlt:  "#111520",
  panelMid:  "#141825",
  border:    "#1A1F30",
  borderMid: "#222A3F",
  borderHi:  "#2D3554",
  text:      "#C8D4EA",
  sub:       "#6A7A98",
  dim:       "#3A4460",
  blue:      "#3B8EEA",
  blueHi:    "#5BA3F5",
  green:     "#00C896",
  amber:     "#F0A830",
  red:       "#FF4B6A",
  slate:     "#7A8DAE",
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

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
      <div style={{ width: 3, height: 12, background: D.blue, borderRadius: 1, flexShrink: 0 }} />
      <span style={{
        fontFamily:    D.fontMono,
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: "0.20em",
        color:         D.sub,
        textTransform: "uppercase" as const,
        whiteSpace:    "nowrap" as const,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: D.border }} />
    </div>
  );
}

function MetaKV({ label, value, valueColor, mono = true }: {
  label: string; value: React.ReactNode; valueColor?: string; mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        fontFamily:    D.fontMono,
        fontSize:      10,
        color:         D.dim,
        letterSpacing: "0.10em",
        minWidth:      76,
        flexShrink:    0,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? D.fontMono : D.fontUI,
        fontSize:   12,
        color:      valueColor ?? D.text,
        letterSpacing: mono ? "0.02em" : undefined,
      }}>
        {value}
      </span>
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

  const verdictColor = riskVerdict === "REJECT"                     ? D.red
    : riskVerdict === "APPROVE_WITH_CONDITIONS"                     ? D.amber
    : riskVerdict === "UNAVAILABLE"                                 ? D.amber
    : D.green;

  const verdictLabel = riskVerdict === "APPROVE"                    ? "RISK GATE: PASS"
    : riskVerdict === "APPROVE_WITH_CONDITIONS"                     ? "RISK GATE: CONDITIONAL"
    : riskVerdict === "UNAVAILABLE"                                 ? "RISK GATE: UNAVAILABLE"
    : riskVerdict;

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
      const data  = await res.json() as Record<string, unknown>;
      const items = (data.approved ?? data.proposals ?? []) as Array<Record<string, unknown>>;
      const ids   = items.map(item => (item.id ?? item.proposal_id) as string).filter(Boolean);
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

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:            20,
      padding:       "0 0 20px",
      height:        "100%",
      overflowY:     "auto",
      background:    D.bg,
      fontFamily:    D.fontUI,
    }}>

      {/* ── TOP IDENTITY BAR ─────────────────────────────────────────────── */}
      <div style={{
        position:    "sticky",
        top:          0,
        zIndex:       20,
        background:   D.panel,
        borderBottom: `1px solid ${D.border}`,
        display:      "flex",
        alignItems:   "stretch",
        gap:           0,
        flexShrink:   0,
      }}>
        {/* Left — step label */}
        <div style={{
          borderRight: `1px solid ${D.border}`,
          padding:     "0 20px",
          display:     "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 3,
          minWidth: 220,
        }}>
          <span style={{ fontFamily: D.fontMono, fontSize: 9, color: D.dim, letterSpacing: "0.18em" }}>
            STEP 4 OF 5
          </span>
          <span style={{ fontFamily: D.fontMono, fontSize: 12, fontWeight: 700, color: D.text, letterSpacing: "0.06em" }}>
            REVIEW HEDGE PLAN
          </span>
        </div>

        {/* Center — run metadata */}
        <div style={{
          flex:       1,
          display:    "flex",
          alignItems: "center",
          gap:         0,
          overflowX:  "auto",
        }}>
          {[
            { label: "RUN",     value: (_re?.run_id ?? runId).slice(0, 8).toUpperCase() + "…", color: D.blueHi },
            { label: "AS-OF",   value: _re?.timestamp
                ? new Date(_re.timestamp).toLocaleString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
                  }) + " UTC"
                : "—",
              color: D.text },
            { label: "ENGINE",  value: _re?.engine_version ?? "—", color: D.text },
            { label: "POLICY",  value: _re?.policy_hash ? `${_re.policy_hash.slice(0, 10)}…` : "—", color: D.sub },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              borderRight: `1px solid ${D.border}`,
              padding:     "14px 20px",
              display:     "flex",
              flexDirection: "column",
              gap:           3,
              flexShrink:   0,
            }}>
              <span style={{ fontFamily: D.fontMono, fontSize: 9, color: D.dim, letterSpacing: "0.14em" }}>{label}</span>
              <span style={{ fontFamily: D.fontMono, fontSize: 12, color, letterSpacing: "0.03em" }}>{value}</span>
            </div>
          ))}

          {/* Hash + verified */}
          <div style={{
            borderRight: `1px solid ${D.border}`,
            padding:     "14px 20px",
            display:     "flex",
            flexDirection: "column",
            gap:           3,
            flexShrink:   0,
          }}>
            <span style={{ fontFamily: D.fontMono, fontSize: 9, color: D.dim, letterSpacing: "0.14em" }}>HASH</span>
            <span style={{ fontFamily: D.fontMono, fontSize: 12, color: D.sub }}>
              {_re?.inputs_hash
                ? `${_re.inputs_hash.slice(0, 16)}…`
                : riskDecisionHash
                ? `${riskDecisionHash.slice(0, 16)}…`
                : "—"}
            </span>
          </div>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 6 }}>
            <ShieldCheckIcon size={12} color={D.green} />
            <span style={{ fontFamily: D.fontMono, fontSize: 10, fontWeight: 700, color: D.green, letterSpacing: "0.10em" }}>
              VERIFIED
            </span>
          </div>
        </div>

        {/* Right — verdict + submit */}
        <div style={{
          borderLeft:  `1px solid ${D.border}`,
          padding:     "0 20px",
          display:     "flex",
          alignItems:  "center",
          gap:          16,
          flexShrink:   0,
        }}>
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:           8,
            padding:      "5px 12px",
            background:   `color-mix(in srgb, ${verdictColor} 12%, ${D.panel})`,
            border:       `1px solid color-mix(in srgb, ${verdictColor} 30%, transparent)`,
            borderRadius:  2,
          }}>
            {riskVerdict === "APPROVE"
              ? <CheckCircleIcon size={12} color={verdictColor} />
              : <AlertTriangleIcon size={12} color={verdictColor} />
            }
            <span style={{ fontFamily: D.fontMono, fontSize: 10, fontWeight: 700, color: verdictColor, letterSpacing: "0.10em" }}>
              {verdictLabel}
            </span>
          </div>

          {submitted && (
            <span style={{ fontFamily: D.fontMono, fontSize: 10, fontWeight: 700, color: D.green, letterSpacing: "0.10em" }}>
              ✓ SUBMITTED
            </span>
          )}
        </div>
      </div>

      {/* ── BODY CONTENT ─────────────────────────────────────────────────── */}
      <div style={{ padding: "0 28px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── KPI METRICS BAND ──────────────────────────────────────────── */}
        {_summary && (
          <>
            <SectionRule label="Performance Metrics" />
            <div style={{
              display:             "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap:                  1,
              background:           D.border,
              border:              `1px solid ${D.border}`,
              borderRadius:         2,
              overflow:            "hidden",
            }}>
              {([
                {
                  label: "COVERAGE RATIO",
                  value: `${_coveragePct.toFixed(1)}%`,
                  sub:   _coveragePct >= 80 ? "TARGET MET" : _coveragePct >= 50 ? "PARTIAL" : "BELOW TARGET",
                  color: _coveragePct >= 80 ? D.green : _coveragePct >= 50 ? D.amber : D.red,
                },
                {
                  label: "TOTAL ACTION",
                  value: _fmtU(_summary.total_action_usd),
                  sub:   "USD EQUIVALENT",
                  color: D.text,
                },
                {
                  label: "HEDGE POSITION",
                  value: `${_fmtN(_summary.total_hedge_position_mxn)}`,
                  sub:   `${_primaryCcy} LOCKED`,
                  color: D.text,
                },
                {
                  label: "RESIDUAL EXPOSURE",
                  value: `${_fmtN(_summary.total_residual_mxn)}`,
                  sub:   _summary.total_residual_mxn > 0 ? "OPEN RISK" : "FULLY COVERED",
                  color: _summary.total_residual_mxn > 0 ? D.amber : D.green,
                },
                {
                  label: "FRICTION COST",
                  value: `${_costBps.toFixed(1)} bps`,
                  sub:   _fmtU(_summary.total_friction_usd),
                  color: D.sub,
                },
              ] as Array<{ label: string; value: string; sub: string; color: string }>).map(({ label, value, sub, color }) => (
                <div key={label} style={{ background: D.panel, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontFamily: D.fontMono, fontSize: 9, color: D.dim, letterSpacing: "0.18em" }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: D.fontMono, fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>
                    {value}
                  </span>
                  <span style={{ fontFamily: D.fontMono, fontSize: 9, color: D.sub, letterSpacing: "0.10em" }}>
                    {sub}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── EXECUTION LEGS ────────────────────────────────────────────── */}
        {_activeBuckets.length > 0 && (
          <>
            <SectionRule label={`Execution Legs  ·  ${_activeBuckets.length} active`} />
            <div style={{ border: `1px solid ${D.border}`, borderRadius: 2, overflow: "hidden" }}>

              {/* Column headers */}
              <div style={{
                display:             "grid",
                gridTemplateColumns: "120px 160px 90px 120px 150px 130px 120px 110px",
                padding:             "8px 16px",
                background:          D.panelMid,
                borderBottom:        `1px solid ${D.border}`,
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
                    fontFamily:    D.fontMono,
                    fontSize:      9,
                    fontWeight:    700,
                    letterSpacing: "0.16em",
                    color:         D.dim,
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
                      borderBottom:        i < _activeBuckets.length - 1 ? `1px solid ${D.border}` : "none",
                      alignItems:          "center",
                      background:           i % 2 === 0 ? D.panel : D.panelAlt,
                      minWidth:             1020,
                    }}
                  >
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, fontWeight: 600, color: D.blueHi }}>
                      {b.bucket}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        display:      "inline-block",
                        padding:      "1px 6px",
                        background:   isSell
                          ? `color-mix(in srgb, ${D.red} 15%, transparent)`
                          : `color-mix(in srgb, ${D.green} 15%, transparent)`,
                        border:       `1px solid color-mix(in srgb, ${isSell ? D.red : D.green} 35%, transparent)`,
                        borderRadius:  1,
                        fontFamily:    D.fontMono,
                        fontSize:      10,
                        fontWeight:    700,
                        letterSpacing: "0.06em",
                        color:         isSell ? D.red : D.green,
                      }}>
                        {isSell ? "SELL" : "BUY"}
                      </span>
                      <span style={{ fontFamily: D.fontMono, fontSize: 10, color: D.sub }}>
                        {isSell ? "/ BUY USD" : "/ SELL USD"}
                      </span>
                    </div>
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, color: D.text, textAlign: "right" as const }}>
                      {contracts.toLocaleString("en-US")}
                    </span>
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, color: D.text, textAlign: "right" as const }}>
                      {_fmtD(b.forward_rate)}
                    </span>
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, color: D.sub, textAlign: "right" as const }}>
                      {_fmtN(b.commercial_exposure_mxn ?? 0)}
                    </span>
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, color: D.text, textAlign: "right" as const }}>
                      {_fmtU(b.action_usd)}
                    </span>
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, color: D.amber, textAlign: "right" as const }}>
                      {spec ? _fmtU(marginReq) : "—"}
                    </span>
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, color: D.sub, textAlign: "right" as const }}>
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
                  background:          D.panelMid,
                  alignItems:          "center",
                  borderTop:           `2px solid ${D.borderMid}`,
                  minWidth:             1020,
                }}>
                  <span style={{ fontFamily: D.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: D.dim }}>
                    TOTAL
                  </span>
                  <span />
                  <span style={{ fontFamily: D.fontMono, fontSize: 13, fontWeight: 700, color: D.text, textAlign: "right" as const }}>
                    {_totalContracts !== null ? _totalContracts.toLocaleString("en-US") : "—"}
                  </span>
                  <span />
                  <span style={{ fontFamily: D.fontMono, fontSize: 13, fontWeight: 700, color: D.text, textAlign: "right" as const }}>
                    {_fmtN(_summary.total_commercial_exposure_mxn)}
                  </span>
                  <span style={{ fontFamily: D.fontMono, fontSize: 13, fontWeight: 700, color: D.text, textAlign: "right" as const }}>
                    {_fmtU(_summary.total_action_usd)}
                  </span>
                  <span style={{ fontFamily: D.fontMono, fontSize: 13, fontWeight: 700, color: D.amber, textAlign: "right" as const }}>
                    {_totalMarginAll !== null ? _fmtU(_totalMarginAll) : "—"}
                  </span>
                  <span style={{ fontFamily: D.fontMono, fontSize: 13, fontWeight: 700, color: D.sub, textAlign: "right" as const }}>
                    {_fmtU(_summary.total_friction_usd)}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── FUTURES CONTRACT SPECIFICATIONS ───────────────────────────── */}
        {activeCurrencies.some(ccy => !!CME_SPECS[ccy]) && (
          <>
            <SectionRule label="Futures Contract Specifications  ·  CME Group" />
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: D.border, border: `1px solid ${D.border}`, borderRadius: 2, overflow: "hidden" }}>
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
                  <div key={ccy} style={{ background: D.panel }}>
                    {/* Instrument header */}
                    <div style={{
                      display:        "flex",
                      alignItems:     "center",
                      gap:             16,
                      padding:        "10px 18px",
                      borderBottom:   `1px solid ${D.border}`,
                      background:     D.panelMid,
                    }}>
                      <span style={{ fontFamily: D.fontMono, fontSize: 18, fontWeight: 700, color: D.blueHi }}>
                        {spec.symbol}
                      </span>
                      <span style={{ fontFamily: D.fontMono, fontSize: 11, fontWeight: 600, color: D.text, letterSpacing: "0.04em" }}>
                        {spec.name.toUpperCase()}
                      </span>
                      <div style={{ flex: 1 }} />
                      <span style={{
                        fontFamily:    D.fontMono,
                        fontSize:       9,
                        fontWeight:     700,
                        letterSpacing: "0.14em",
                        color:          D.blue,
                        padding:       "2px 8px",
                        border:        `1px solid ${D.borderMid}`,
                        borderRadius:   1,
                      }}>
                        {spec.exchange}
                      </span>
                    </div>

                    {/* Spec grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1, background: D.border }}>
                      {([
                        { label: "CONTRACT SIZE", value: `${_fmtN(spec.contract_size)} ${spec.currency}` },
                        { label: "TICK SIZE",     value: _fmtTick(spec.tick_size) },
                        { label: "TICK VALUE",    value: `$${spec.tick_value.toFixed(2)}` },
                        { label: "MARGIN EST",    value: _fmtU(spec.margin_est) },
                        { label: "SETTLEMENT",    value: spec.settle },
                        { label: "EXCHANGE",      value: spec.exchange },
                      ] as Array<{ label: string; value: string }>).map(({ label, value }) => (
                        <div key={label} style={{ background: D.panel, padding: "12px 14px" }}>
                          <div style={{ fontFamily: D.fontMono, fontSize: 9, color: D.dim, letterSpacing: "0.14em", marginBottom: 6 }}>
                            {label}
                          </div>
                          <div style={{ fontFamily: D.fontMono, fontSize: 13, fontWeight: 600, color: D.text }}>
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Derived row */}
                    {contractsNeeded > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: D.border, borderTop: `1px solid ${D.border}` }}>
                        {([
                          { label: "CONTRACTS NEEDED", value: contractsNeeded.toLocaleString("en-US"), color: D.blueHi },
                          { label: "TOTAL MARGIN REQ",  value: _fmtU(totalMargin),                      color: D.amber },
                          { label: "NOTIONAL VALUE",    value: _fmtU(notionalValue),                    color: D.text },
                        ] as Array<{ label: string; value: string; color: string }>).map(({ label, value, color }) => (
                          <div key={label} style={{ background: D.panelAlt, padding: "12px 14px" }}>
                            <div style={{ fontFamily: D.fontMono, fontSize: 9, color: D.dim, letterSpacing: "0.14em", marginBottom: 6 }}>
                              {label}
                            </div>
                            <div style={{ fontFamily: D.fontMono, fontSize: 16, fontWeight: 700, color }}>
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
          </>
        )}

        {/* ── STRESS SCENARIOS ──────────────────────────────────────────── */}
        {stressRows.length > 0 && (
          <>
            <SectionRule label="Stress Scenarios  ·  Hedge Benefit Analysis" />
            <div style={{ border: `1px solid ${D.border}`, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                display:             "grid",
                gridTemplateColumns: "80px 140px 180px 180px 180px",
                padding:             "8px 16px",
                background:          D.panelMid,
                borderBottom:        `1px solid ${D.border}`,
                minWidth:             780,
              }}>
                {([
                  { h: "σ",             align: "right" },
                  { h: "SHOCKED SPOT",  align: "right" },
                  { h: "UNHEDGED P&L",  align: "right" },
                  { h: "HEDGED P&L",    align: "right" },
                  { h: "HEDGE BENEFIT", align: "right" },
                ] as Array<{ h: string; align: "right" }>).map(({ h, align }) => (
                  <span key={h} style={{
                    fontFamily: D.fontMono, fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.16em", color: D.dim, textAlign: align,
                  }}>
                    {h}
                  </span>
                ))}
              </div>

              {stressRows.map((t, i) => {
                const bColor = t.total_hedge_benefit_usd > 0 ? D.green
                  : t.total_hedge_benefit_usd < 0 ? D.red
                  : D.sub;
                return (
                  <div
                    key={t.sigma}
                    style={{
                      display:             "grid",
                      gridTemplateColumns: "80px 140px 180px 180px 180px",
                      padding:             "9px 16px",
                      borderBottom:        i < stressRows.length - 1 ? `1px solid ${D.border}` : "none",
                      alignItems:          "center",
                      background:           i % 2 === 0 ? D.panel : D.panelAlt,
                      minWidth:             780,
                    }}
                  >
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, fontWeight: 700, color: t.sigma < 0 ? D.red : D.green, textAlign: "right" as const }}>
                      {t.sigma > 0 ? "+" : ""}{t.sigma}σ
                    </span>
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, color: D.sub, textAlign: "right" as const }}>
                      {_fmtD(t.shocked_spot)}
                    </span>
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, color: D.red, textAlign: "right" as const }}>
                      {_fmtU(t.total_unhedged_usd)}
                    </span>
                    <span style={{ fontFamily: D.fontMono, fontSize: 13, color: D.amber, textAlign: "right" as const }}>
                      {_fmtU(t.total_hedged_usd)}
                    </span>
                    <span style={{ fontFamily: D.fontMono, fontSize: 14, fontWeight: 700, color: bColor, textAlign: "right" as const }}>
                      {_fmtU(t.total_hedge_benefit_usd)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── POSITIONS IN SCOPE ────────────────────────────────────────── */}
        {positions.length > 0 && (
          <>
            <SectionRule label={`Positions in Scope  ·  ${positions.length} position${positions.length !== 1 ? "s" : ""}`} />
            <div style={{ border: `1px solid ${D.border}`, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                display:             "grid",
                gridTemplateColumns: "1fr 90px 110px 130px 160px",
                padding:             "8px 16px",
                background:          D.panelMid,
                borderBottom:        `1px solid ${D.border}`,
              }}>
                {(["ENTITY", "TYPE", "CURRENCY", "AMOUNT", "VALUE DATE"] as string[]).map(h => (
                  <span key={h} style={{ fontFamily: D.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", color: D.dim }}>
                    {h}
                  </span>
                ))}
              </div>
              {positions.map((p, i) => (
                <div key={p.id} style={{
                  display:             "grid",
                  gridTemplateColumns: "1fr 90px 110px 130px 160px",
                  padding:             "9px 16px",
                  borderBottom:        i < positions.length - 1 ? `1px solid ${D.border}` : "none",
                  background:           i % 2 === 0 ? D.panel : D.panelAlt,
                }}>
                  <span style={{ fontFamily: D.fontUI,   fontSize: 13, color: D.text   }}>{p.entity}</span>
                  <span style={{ fontFamily: D.fontMono, fontSize: 11, color: D.sub    }}>{p.type}</span>
                  <span style={{ fontFamily: D.fontMono, fontSize: 12, color: D.blueHi }}>{p.currency}</span>
                  <span style={{ fontFamily: D.fontMono, fontSize: 12, color: D.text   }}>{_fmtN(p.amount ?? 0)}</span>
                  <span style={{ fontFamily: D.fontMono, fontSize: 11, color: D.sub    }}>{p.value_date ?? "—"}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── AUDIT REFERENCE (collapsible detail) ──────────────────────── */}
        <SectionRule label="Audit Provenance" />
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap:                  1,
          background:           D.border,
          border:              `1px solid ${D.border}`,
          borderRadius:         2,
          overflow:            "hidden",
        }}>
          {([
            { label: "RUN ID",              value: _re?.run_id ?? runId,                    full: true },
            { label: "RISK DECISION HASH",  value: riskDecisionHash || "—",                 full: false },
            { label: "INPUTS HASH",         value: _re?.inputs_hash ?? "—",                 full: false },
            { label: "OUTPUTS HASH",        value: _re?.outputs_hash ?? "—",                full: false },
          ] as Array<{ label: string; value: string; full: boolean }>).map(({ label, value, full }) => (
            <div
              key={label}
              style={{
                background:  D.panel,
                padding:    "12px 16px",
                gridColumn:  full ? "1 / -1" : undefined,
              }}
            >
              <div style={{ fontFamily: D.fontMono, fontSize: 9, color: D.dim, letterSpacing: "0.14em", marginBottom: 6 }}>
                {label}
              </div>
              <code style={{ fontFamily: D.fontMono, fontSize: 11, color: D.sub, wordBreak: "break-all" as const }}>
                {value}
              </code>
            </div>
          ))}
        </div>

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
            background:  `color-mix(in srgb, ${D.amber} 8%, ${D.panel})`,
            border:      `1px solid color-mix(in srgb, ${D.amber} 25%, transparent)`,
            borderRadius: 2,
            display:     "flex",
            alignItems:  "center",
            gap:          14,
          }}>
            <AlertTriangleIcon size={14} color={D.amber} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: D.fontMono, fontSize: 11, fontWeight: 700, color: D.amber, letterSpacing: "0.08em" }}>
                PROPOSALS SUBMITTED — AWAITING CHECKER APPROVAL
              </span>
              <Link href="/staging" style={{ fontFamily: D.fontMono, fontSize: 10, color: D.blue, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                VIEW STAGING QUEUE <ExternalLinkIcon size={10} color={D.blue} />
              </Link>
            </div>
          </div>
        )}

        {submitted && isSolo && (
          <div style={{
            padding:     "12px 16px",
            background:  `color-mix(in srgb, ${D.green} 8%, ${D.panel})`,
            border:      `1px solid color-mix(in srgb, ${D.green} 25%, transparent)`,
            borderRadius: 2,
          }}>
            <span style={{ fontFamily: D.fontMono, fontSize: 12, fontWeight: 700, color: D.green, letterSpacing: "0.08em" }}>
              SELF-APPROVED (SOLO MODE) — {proposalIds.length} PROPOSAL{proposalIds.length !== 1 ? "S" : ""} STAGED
            </span>
          </div>
        )}

      </div>

      {/* ── ACTION BAR ──────────────────────────────────────────────────── */}
      <div style={{
        position:       "sticky",
        bottom:          0,
        zIndex:          20,
        background:      D.panel,
        borderTop:      `1px solid ${D.borderMid}`,
        padding:        "12px 28px",
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
            fontFamily:    D.fontMono,
            fontSize:      10,
            letterSpacing: "0.06em",
            color:         D.sub,
            background:   "transparent",
            border:       `1px solid ${D.border}`,
            padding:      "8px 14px",
            cursor:        "pointer",
            borderRadius:  3,
          }}
        >
          <ChevronLeftIcon size={12} />
          BACK
        </button>

        {/* Center — status + copy actions */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          {submitted && (
            <span style={{ fontFamily: D.fontMono, fontSize: 10, color: D.green, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircleIcon size={10} />
              {isSolo ? "APPROVED" : "SUBMITTED"}
            </span>
          )}
          {!submitted && !submitting && (
            <span style={{ fontFamily: D.fontMono, fontSize: 10, color: D.green, display: "flex", alignItems: "center", gap: 4 }}>
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
              fontFamily:    D.fontMono,
              fontSize:      10,
              letterSpacing: "0.06em",
              color:         copied === "text" ? D.green : D.sub,
              background:   "transparent",
              border:       `1px solid ${D.border}`,
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
              fontFamily:    D.fontMono,
              fontSize:      10,
              letterSpacing: "0.06em",
              color:         copied === "json" ? D.green : D.sub,
              background:   "transparent",
              border:       `1px solid ${D.border}`,
              padding:      "8px 12px",
              cursor:        "pointer",
              borderRadius:  3,
            }}
          >
            <CopyIcon size={10} />
            {copied === "json" ? "COPIED" : "JSON"}
          </button>
        </div>

        {/* Primary CTA */}
        {!submitted && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:           8,
              fontFamily:    D.fontMono,
              fontSize:      11,
              fontWeight:    700,
              letterSpacing: "0.10em",
              color:         "#fff",
              background:    submitting ? D.dim : D.blue,
              border:       "none",
              padding:      "10px 28px",
              cursor:        submitting ? "not-allowed" : "pointer",
              borderRadius:  3,
              whiteSpace:   "nowrap" as const,
              transition:   "background 0.15s",
            }}
          >
            {submitting && <LoaderIcon size={13} color="#fff" style={{ animation: "spin 1s linear infinite" }} />}
            {isSolo ? "APPROVE & SUBMIT →" : "SUBMIT FOR APPROVAL →"}
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
