"use client";

import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { PositionRow } from "@/api/positionClient";
import { translateError, translateCaughtError, type TranslatedError } from "@/lib/errors/hedgeErrors";
import HedgeErrorBanner from "./ErrorBanner";
import PreTradeCostPanel from "@/components/execution/PreTradeCostPanel";
import CrisisImpactPanel from "@/components/execution/CrisisImpactPanel";
import React from "react";
import {
  LoaderIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon,
  ChevronLeftIcon, ShieldCheckIcon, RefreshCwIcon,
} from "lucide-react";

/* ── Design tokens ────────────────────────────────────────────────────────── */

const HD = {
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
  green:   "var(--status-pass,#22c55e)",
  red:     "var(--accent-red,#ef4444)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

/* ── Types ────────────────────────────────────────────────────────────────── */

interface PhaseRiskProps {
  positions: PositionRow[];
  calcResult: Record<string, unknown>;
  policyInstanceId?: string;
  token: string;
  planTier?: string;
  onComplete: (verdict: string, decisionHash: string) => void;
  onBack: () => void;
}

type RiskVerdict = "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT" | "UNAVAILABLE";

type RiskItem = string | { code?: string; message?: string; severity?: string; details?: unknown };

function riskItemText(r: RiskItem): string {
  if (typeof r === "string") return r;
  return r.message ?? r.code ?? JSON.stringify(r);
}

interface RiskResponse {
  verdict: RiskVerdict;
  reasons?: RiskItem[];
  conditions?: RiskItem[];
  residual_risks?: RiskItem[];
  decision_hash?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PhaseRisk — Step 3: Risk gate evaluation                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function PhaseRisk({
  positions,
  calcResult,
  policyInstanceId,
  token,
  planTier,
  onComplete,
  onBack,
}: PhaseRiskProps) {
  const [loading, setLoading]       = useState(true);
  const [riskData, setRiskData]     = useState<RiskResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError]           = useState<TranslatedError | null>(null);

  const isSmbTier = planTier === "smb";

  const runRiskCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const payload = {
        position_ids:       positions.map(p => p.id),
        market_snapshot:    (calcResult.marketSnapshot as Record<string, unknown>) ?? {},
        hedge_plan:         calcResult.calcResponse ?? calcResult,
        policy_instance_id: policyInstanceId ?? null,
      };

      const res = await dashboardFetch("/v1/risk-check", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.status === 404 || res.status === 405) {
        setUnavailable(true);
        setRiskData({ verdict: "UNAVAILABLE", reasons: [], conditions: [], decision_hash: "" });
        return;
      }

      if (!res.ok) {
        let detail: string | undefined;
        try { const errData = await res.json(); detail = (errData as { detail?: string }).detail; } catch { /* */ }
        setError(translateError(res.status, detail));
        setUnavailable(true);
        setRiskData({ verdict: "UNAVAILABLE", reasons: [], conditions: [], decision_hash: "" });
        setLoading(false);
        return;
      }

      const data = await res.json() as RiskResponse;
      setRiskData(data);
    } catch (e) {
      setUnavailable(true);
      setRiskData({ verdict: "UNAVAILABLE", reasons: [], conditions: [], decision_hash: "" });
      setError(translateCaughtError(e));
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { runRiskCheck(); }, [runRiskCheck]);

  // SMB tier auto-skip
  useEffect(() => {
    if (isSmbTier) {
      onComplete("APPROVE", "");
    }
  }, [isSmbTier]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isSmbTier) return null;

  const handleProceed = () => {
    if (!riskData) return;
    onComplete(riskData.verdict, riskData.decision_hash ?? "");
  };

  const isRejected   = riskData?.verdict === "REJECT";
  const isPassed     = riskData?.verdict === "APPROVE" || riskData?.verdict === "APPROVE_WITH_CONDITIONS";
  const isConditions = riskData?.verdict === "APPROVE_WITH_CONDITIONS";

  // Verdict visual config
  let verdictColor: string = HD.slate;
  let verdictLabel = "RUNNING RISK CHECK...";
  let VerdictIcon: React.ElementType = LoaderIcon;
  let verdictIconProps: Record<string, unknown> = { style: { animation: "spin 1s linear infinite" } };

  if (!loading) {
    verdictIconProps = {};
    if (unavailable) {
      verdictColor = HD.amber;
      verdictLabel = "RISK GATE UNAVAILABLE";
      VerdictIcon = AlertTriangleIcon;
    } else if (isPassed && !isConditions) {
      verdictColor = HD.emerald;
      verdictLabel = "RISK GATE PASSED";
      VerdictIcon = CheckCircleIcon;
    } else if (isConditions) {
      verdictColor = HD.amber;
      verdictLabel = "APPROVED WITH CONDITIONS";
      VerdictIcon = AlertTriangleIcon;
    } else if (isRejected) {
      verdictColor = HD.crimson;
      verdictLabel = "RISK GATE REJECTED";
      VerdictIcon = XCircleIcon;
    }
  }

  const canProceed = !loading && isPassed;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Scrollable content ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Step header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: HD.cyan }}>
            STEP 3 OF 5 — RISK
          </span>
          <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
            Evaluating hedge plan against policy constraints
          </span>
        </div>

        {/* ── Verdict card ─────────────────────────────────────────── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "20px 24px",
          background: HD.bgPanel,
          border: `1px solid ${verdictColor}`,
          borderLeft: `4px solid ${verdictColor}`,
          borderRadius: 4,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: `color-mix(in srgb, ${verdictColor} 12%, transparent)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <VerdictIcon size={22} color={verdictColor} {...verdictIconProps} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{
              fontFamily: HD.fontMono, fontSize: 13, fontWeight: 700,
              letterSpacing: "0.1em", color: verdictColor,
            }}>
              {verdictLabel}
            </span>
            {loading && (
              <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.tertiary }}>
                Checking exposure limits, policy thresholds, and governance rules...
              </span>
            )}
            {!loading && unavailable && (
              <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
                Risk gate endpoint is temporarily unavailable. You can retry the check.
              </span>
            )}
            {!loading && isPassed && !isConditions && (
              <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
                All risk checks passed. The hedge plan is within policy limits.
              </span>
            )}
            {!loading && isConditions && (
              <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
                The hedge plan was approved but has conditions that must be acknowledged.
              </span>
            )}
            {!loading && isRejected && (
              <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
                The hedge plan exceeds policy limits. Adjust the parameters and recalculate.
              </span>
            )}
          </div>
          {riskData?.decision_hash && (
            <span style={{
              fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary,
              background: HD.bgSub, padding: "2px 6px", borderRadius: 2,
              border: `1px solid ${HD.soft}`,
            }}
              title={riskData.decision_hash}
            >
              HASH {riskData.decision_hash.slice(0, 8)}…
            </span>
          )}
        </div>

        {/* ── Error banner ─────────────────────────────────────────── */}
        {error && (
          <HedgeErrorBanner
            error={error}
            onRetry={runRiskCheck}
            onReconnect={() => window.location.href = "/auth/login"}
            onGoBack={onBack}
            onDismiss={() => setError(null)}
          />
        )}

        {/* ── Reasons ──────────────────────────────────────────────── */}
        {!loading && riskData?.reasons && riskData.reasons.length > 0 && (
          <RiskItemList
            title="REASONS"
            items={riskData.reasons}
            color={isRejected ? HD.crimson : HD.secondary}
            icon={isRejected ? XCircleIcon : ShieldCheckIcon}
          />
        )}

        {/* ── Conditions ───────────────────────────────────────────── */}
        {!loading && isConditions && riskData?.conditions && riskData.conditions.length > 0 && (
          <RiskItemList
            title="CONDITIONS"
            items={riskData.conditions}
            color={HD.amber}
            icon={AlertTriangleIcon}
          />
        )}

        {/* ── Residual risks ───────────────────────────────────────── */}
        {!loading && riskData?.residual_risks && riskData.residual_risks.length > 0 && (
          <RiskItemList
            title="RESIDUAL RISKS"
            items={riskData.residual_risks}
            color={HD.tertiary}
            icon={AlertTriangleIcon}
          />
        )}

        {/* ── Quant panels (competitive differentiator) ────────────── */}
        {!loading && (
          <>
            <PreTradeCostPanel positions={positions} calcResult={calcResult} />
            <CrisisImpactPanel
              positions={positions}
              hedgeCoveragePercent={
                ((calcResult?.hedge_plan as Record<string, unknown>)?.summary as Record<string, number>)?.coverage_pct
                ?? 0.85
              }
            />
          </>
        )}
      </div>

      {/* ── Action bar ────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 24px",
        background: HD.bgSub,
        borderTop: `1px solid ${HD.soft}`,
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            fontFamily: HD.fontMono, fontSize: 10, letterSpacing: "0.06em",
            color: HD.slate, background: "none",
            border: `1px solid ${HD.rim}`, padding: "8px 14px",
            cursor: "pointer", borderRadius: 3,
          }}
        >
          <ChevronLeftIcon size={12} />
          BACK
        </button>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          {loading && (
            <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate, display: "flex", alignItems: "center", gap: 4 }}>
              <LoaderIcon size={10} style={{ animation: "spin 1s linear infinite" }} />
              EVALUATING
            </span>
          )}
          {!loading && isPassed && (
            <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.emerald, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircleIcon size={10} />
              {isConditions ? "CONDITIONAL PASS" : "PASSED"}
            </span>
          )}
          {!loading && isRejected && (
            <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.crimson, display: "flex", alignItems: "center", gap: 4 }}>
              <XCircleIcon size={10} />
              REJECTED
            </span>
          )}
        </div>

        {/* Retry — always available when not loading */}
        {!loading && (
          <button
            onClick={runRiskCheck}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: HD.fontMono, fontSize: 10, letterSpacing: "0.06em",
              color: HD.slate, background: "none",
              border: `1px solid ${HD.rim}`, padding: "8px 14px",
              cursor: "pointer", borderRadius: 3,
            }}
          >
            <RefreshCwIcon size={10} />
            RETRY
          </button>
        )}

        <button
          onClick={handleProceed}
          disabled={!canProceed}
          style={{
            fontFamily: HD.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: canProceed ? "#ffffff" : HD.slate,
            background: canProceed ? HD.royal : `color-mix(in srgb,${HD.slate} 20%,transparent)`,
            border: `1px solid ${canProceed ? HD.royal : HD.soft}`,
            padding: "10px 24px",
            cursor: canProceed ? "pointer" : "not-allowed",
            borderRadius: 3,
            transition: "all 0.15s",
          }}
        >
          {loading ? "EVALUATING..." : isRejected ? "BLOCKED" : unavailable ? "UNAVAILABLE" : "PROCEED TO REVIEW →"}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Subcomponents                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function RiskItemList({ title, items, color, icon: Icon }: {
  title: string;
  items: RiskItem[];
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div style={{
      background: `color-mix(in srgb, ${color} 4%, ${HD.bgPanel})`,
      border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
      borderRadius: 4,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 14px",
        background: `color-mix(in srgb, ${color} 8%, ${HD.bgSub})`,
        borderBottom: `1px solid color-mix(in srgb, ${color} 15%, transparent)`,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <Icon size={12} color={color} />
        <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color }}>
          {title}
        </span>
        <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary }}>({items.length})</span>
      </div>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, marginTop: 2, flexShrink: 0 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.5 }}>
              {riskItemText(item)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
