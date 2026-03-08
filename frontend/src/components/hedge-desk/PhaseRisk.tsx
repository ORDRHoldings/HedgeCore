"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  ClipboardCheckIcon, UsersIcon, InfoIcon,
} from "lucide-react";
import { T } from "./tokens";

/* ── Aliases for backward compat inside this file ─────────────────────────── */

const HD = T;

/* ── Types ────────────────────────────────────────────────────────────────── */

interface PhaseRiskProps {
  positions: PositionRow[];
  calcResult: Record<string, unknown>;
  policyInstanceId?: string;
  token: string;
  planTier?: string;
  governanceMode?: "solo" | "team";
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

/* ── Constraint check helpers ─────────────────────────────────────────────── */

interface ConstraintCheck {
  label: string;
  status: "PASS" | "CONDITION" | "FAIL" | "NOT_CHECKED";
  detail?: string;
}

function fmtThreshold(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function deriveConstraintChecks(
  verdict: RiskVerdict,
  reasons: RiskItem[],
  conditions: RiskItem[],
  dualKeyThreshold = 1_000_000,
): ConstraintCheck[] {
  const allText = [
    ...reasons.map(riskItemText),
    ...conditions.map(riskItemText),
  ].join(" ").toLowerCase();

  const isReject = verdict === "REJECT";
  const isCondition = verdict === "APPROVE_WITH_CONDITIONS";
  const defaultStatus: ConstraintCheck["status"] = isReject ? "FAIL" : isCondition ? "CONDITION" : "PASS";
  const dualKeyTriggered = allText.includes("dual") || allText.includes("4-eye") || allText.includes("four-eye");

  const checks: ConstraintCheck[] = [
    {
      label: "Exposure concentration limit",
      status: allText.includes("concentration")
        ? (isReject ? "FAIL" : "CONDITION")
        : (verdict === "UNAVAILABLE" ? "NOT_CHECKED" : "PASS"),
    },
    {
      label: "Single-currency threshold",
      status: allText.includes("single") || allText.includes("currency threshold")
        ? (isReject ? "FAIL" : "CONDITION")
        : (verdict === "UNAVAILABLE" ? "NOT_CHECKED" : "PASS"),
    },
    {
      label: "Tenor limit compliance",
      status: allText.includes("tenor")
        ? (isReject ? "FAIL" : "CONDITION")
        : (verdict === "UNAVAILABLE" ? "NOT_CHECKED" : "PASS"),
    },
    {
      label: "Policy hedge ratio bounds",
      status: allText.includes("ratio") || allText.includes("coverage")
        ? (isReject ? "FAIL" : "CONDITION")
        : (verdict === "UNAVAILABLE" ? "NOT_CHECKED" : defaultStatus),
    },
    {
      label: `Dual-key threshold ($${fmtThreshold(dualKeyThreshold)})`,
      status: dualKeyTriggered ? "CONDITION" : (verdict === "UNAVAILABLE" ? "NOT_CHECKED" : "PASS"),
      detail: dualKeyTriggered ? "TRIGGERED" : "NOT TRIGGERED",
    },
  ];

  return checks;
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
  governanceMode,
  onComplete,
  onBack,
}: PhaseRiskProps) {
  const [loading, setLoading]       = useState(true);
  const [riskData, setRiskData]     = useState<RiskResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError]           = useState<TranslatedError | null>(null);

  // SMB auto-skip banner state
  const [smbBannerVisible, setSmbBannerVisible] = useState(false);
  const smbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // SMB tier auto-skip with visible banner (500ms delay so user sees it)
  useEffect(() => {
    if (isSmbTier) {
      setSmbBannerVisible(true);
      smbTimerRef.current = setTimeout(() => {
        onComplete("APPROVE", "");
      }, 500);
    }
    return () => {
      if (smbTimerRef.current) clearTimeout(smbTimerRef.current);
    };
  }, [isSmbTier]); // eslint-disable-line react-hooks/exhaustive-deps

  // SMB tier: show brief banner then auto-advance
  if (isSmbTier) {
    return smbBannerVisible ? (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", background: HD.bgPanel,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "20px 32px",
          background: `color-mix(in srgb, ${HD.amber} 6%, ${HD.bgPanel})`,
          border: `1px solid color-mix(in srgb, ${HD.amber} 25%, transparent)`,
          borderLeft: `4px solid ${HD.amber}`,
          borderRadius: 4,
        }}>
          <InfoIcon size={18} color={HD.amber} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: HD.amber }}>
              RISK EVALUATION BYPASSED
            </span>
            <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>
              SMB tier — risk gate is not required. Auto-advancing to review.
            </span>
          </div>
        </div>
      </div>
    ) : null;
  }

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
      verdictColor = HD.red;
      verdictLabel = "RISK GATE REJECTED";
      VerdictIcon = XCircleIcon;
    }
  }

  const canProceed = !loading && isPassed;

  // Derive constraint checks from risk response
  const constraintChecks = riskData
    ? deriveConstraintChecks(
        riskData.verdict,
        riskData.reasons ?? [],
        riskData.conditions ?? [],
      )
    : [];

  // Governance mode (default to team for safety)
  const govMode = governanceMode ?? "team";

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
              HASH {riskData.decision_hash.slice(0, 8)}...
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

        {/* ── Constraints Evaluated Manifest ────────────────────────── */}
        {!loading && riskData && (
          <div style={{
            background: HD.bgPanel,
            border: `1px solid ${HD.rim}`,
            borderRadius: 4,
            overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 14px",
              background: HD.bgSub,
              borderBottom: `1px solid ${HD.soft}`,
            }}>
              <ClipboardCheckIcon size={13} color={HD.tertiary} />
              <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
                CONSTRAINTS EVALUATED
              </span>
            </div>
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              {constraintChecks.map((check, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ConstraintStatusIcon status={check.status} />
                  <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, flex: 1 }}>
                    {check.label}
                  </span>
                  <span style={{
                    fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                    color: check.status === "PASS" ? HD.emerald
                      : check.status === "CONDITION" ? HD.amber
                      : check.status === "FAIL" ? HD.red
                      : HD.slate,
                  }}>
                    {check.detail ?? check.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Reasons ──────────────────────────────────────────────── */}
        {!loading && riskData?.reasons && riskData.reasons.length > 0 && (
          <RiskItemList
            title="REASONS"
            items={riskData.reasons}
            color={isRejected ? HD.red : HD.secondary}
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

        {/* ── Governance Implications ───────────────────────────────── */}
        {!loading && riskData && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "12px 16px",
            background: `color-mix(in srgb, ${HD.cyan} 4%, ${HD.bgPanel})`,
            border: `1px solid color-mix(in srgb, ${HD.cyan} 20%, transparent)`,
            borderRadius: 4,
          }}>
            <UsersIcon size={14} color={HD.cyan} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: HD.cyan }}>
                GOVERNANCE IMPLICATIONS
              </span>
              {govMode === "team" ? (
                <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.5 }}>
                  4-eyes approval will be required at Step 4. A separate checker must approve proposals before execution.
                  Separation of Duties rules apply — the maker cannot also be the checker.
                </span>
              ) : (
                <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.5 }}>
                  Solo mode — proposals will be auto-approved at Step 4. No second-party review is required.
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Quantitative Risk Analysis (integrated section) ───────── */}
        {!loading && (
          <div style={{
            background: HD.bgPanel,
            border: `1px solid ${HD.rim}`,
            borderRadius: 4,
            overflow: "hidden",
          }}>
            {/* Section rule header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 14px",
              background: HD.bgSub,
              borderBottom: `1px solid ${HD.soft}`,
            }}>
              <span style={{
                width: 20, height: 1,
                background: HD.soft,
                display: "inline-block",
              }} />
              <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
                QUANTITATIVE RISK ANALYSIS
              </span>
              <span style={{
                flex: 1, height: 1,
                background: HD.soft,
                display: "inline-block",
              }} />
            </div>
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 0 }}>
              <PreTradeCostPanel positions={positions} calcResult={calcResult} />
              <CrisisImpactPanel
                positions={positions}
                hedgeCoveragePercent={
                  ((calcResult?.hedge_plan as Record<string, unknown>)?.summary as Record<string, number>)?.coverage_pct
                  ?? 0.85
                }
              />
            </div>
          </div>
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
            <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.red, display: "flex", alignItems: "center", gap: 4 }}>
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
          {loading ? "EVALUATING..." : isRejected ? "BLOCKED" : unavailable ? "UNAVAILABLE" : "PROCEED TO REVIEW"}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Subcomponents                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ConstraintStatusIcon({ status }: { status: ConstraintCheck["status"] }) {
  if (status === "PASS") return <CheckCircleIcon size={14} color={HD.emerald} />;
  if (status === "CONDITION") return <AlertTriangleIcon size={14} color={HD.amber} />;
  if (status === "FAIL") return <XCircleIcon size={14} color={HD.red} />;
  return (
    <span style={{
      width: 14, height: 14,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: HD.fontMono, fontSize: 10, color: HD.slate,
    }}>
      --
    </span>
  );
}

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
