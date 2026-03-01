"use client";

import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { PositionRow } from "@/api/positionClient";
import DisclosurePanel from "./DisclosurePanel";
import React from "react";
import {
  LoaderIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ChevronLeftIcon
} from "lucide-react";

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

interface PhaseRiskProps {
  positions: PositionRow[];
  calcResult: Record<string, unknown>;
  policyInstanceId?: string;
  token: string;
  onComplete: (verdict: string, decisionHash: string) => void;
  onBack: () => void;
}

type RiskVerdict = "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT" | "UNAVAILABLE";

interface RiskResponse {
  verdict: RiskVerdict;
  reasons?: string[];
  conditions?: string[];
  decision_hash?: string;
}

export default function PhaseRisk({
  positions,
  calcResult,
  policyInstanceId,
  token,
  onComplete,
  onBack,
}: PhaseRiskProps) {
  const [loading, setLoading]       = useState(true);
  const [riskData, setRiskData]     = useState<RiskResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError]           = useState<string | null>(null);

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
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as RiskResponse;
      setRiskData(data);
    } catch (e) {
      // Network error or unrecognised status — treat as unavailable
      setUnavailable(true);
      setRiskData({ verdict: "UNAVAILABLE", reasons: [], conditions: [], decision_hash: "" });
      setError(e instanceof Error ? e.message : "Risk check error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { runRiskCheck(); }, [runRiskCheck]);

  const handleProceed = () => {
    if (!riskData) return;
    const verdict      = unavailable ? "UNAVAILABLE" : riskData.verdict;
    const decisionHash = riskData.decision_hash ?? "";
    onComplete(verdict, decisionHash);
  };

  const isRejected = riskData?.verdict === "REJECT";
  const isPassed   = riskData?.verdict === "APPROVE" || riskData?.verdict === "APPROVE_WITH_CONDITIONS";
  const isConditions = riskData?.verdict === "APPROVE_WITH_CONDITIONS";

  // Badge config
  let badgeColor: string = HD.slate;
  let badgeLabel: string = "RUNNING...";
  let BadgeIcon: React.ElementType = LoaderIcon;
  if (!loading && unavailable) {
    badgeColor = HD.amber; badgeLabel = "RISK GATE UNAVAILABLE"; BadgeIcon = AlertTriangleIcon;
  } else if (!loading && isPassed && !isConditions) {
    badgeColor = HD.emerald; badgeLabel = "RISK GATE PASSED"; BadgeIcon = CheckCircleIcon;
  } else if (!loading && isConditions) {
    badgeColor = HD.amber; badgeLabel = "APPROVED WITH CONDITIONS"; BadgeIcon = AlertTriangleIcon;
  } else if (!loading && isRejected) {
    badgeColor = HD.crimson; badgeLabel = "RISK GATE REJECTED"; BadgeIcon = XCircleIcon;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px", height: "100%", overflowY: "auto" }}>

      {/* Back */}
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", alignSelf: "flex-start", padding: 0 }}>
        <ChevronLeftIcon size={14} color={HD.slate} />
        <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate, letterSpacing: "0.06em" }}>BACK TO CALCULATE</span>
      </button>

      {/* L1 hint */}
      <DisclosurePanel title="The risk engine checks your hedge plan against policy constraints." level="L1" defaultOpen>
        <p style={{ fontFamily: HD.fontUI, fontSize: 13, color: HD.secondary, margin: 0, lineHeight: 1.6 }}>
          The risk gate evaluates exposure limits, policy thresholds, and governance rules.
          A PASS allows the hedge to proceed to review. A REJECT requires policy adjustment.
        </p>
      </DisclosurePanel>

      {/* Status card */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "32px 24px",
        background: HD.bgPanel,
        border: `1px solid ${HD.rim}`,
        borderRadius: 4,
      }}>
        {loading ? (
          <>
            <LoaderIcon size={32} color={HD.slate} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, letterSpacing: "0.12em", color: HD.tertiary }}>
              RUNNING RISK CHECK...
            </span>
          </>
        ) : (
          <>
            <BadgeIcon size={36} color={badgeColor} />
            <span style={{
              fontFamily: HD.fontMono,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: badgeColor,
              textAlign: "center",
            }}>
              {badgeLabel}
            </span>
            {unavailable && (
              <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, textAlign: "center", maxWidth: 360 }}>
                Risk gate endpoint is unavailable. You may proceed with caution — ensure manual policy review is completed.
              </span>
            )}
            {error && !unavailable && (
              <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.amber }}>{error}</span>
            )}
          </>
        )}
      </div>

      {/* Reasons */}
      {!loading && riskData?.reasons && riskData.reasons.length > 0 && (
        <div style={{ background: HD.bgPanel, border: `1px solid ${HD.soft}`, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", background: HD.bgSub, borderBottom: `1px solid ${HD.soft}` }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
              REASONS
            </span>
          </div>
          <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {riskData.reasons.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, marginTop: 2 }}>▸</span>
                <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.5 }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conditions */}
      {!loading && isConditions && riskData?.conditions && riskData.conditions.length > 0 && (
        <div style={{ background: `color-mix(in srgb,${HD.amber} 5%,${HD.bgPanel})`, border: `1px solid color-mix(in srgb,${HD.amber} 25%,transparent)`, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", background: `color-mix(in srgb,${HD.amber} 10%,${HD.bgSub})`, borderBottom: `1px solid color-mix(in srgb,${HD.amber} 20%,transparent)` }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.amber }}>
              CONDITIONS
            </span>
          </div>
          <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {riskData.conditions.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertTriangleIcon size={12} color={HD.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.5 }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* L3 audit hash */}
      {!loading && riskData?.decision_hash && (
        <DisclosurePanel title="Risk Decision Hash" level="L3">
          <code style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.slate, wordBreak: "break-all", lineHeight: 1.6 }}>
            {riskData.decision_hash}
          </code>
        </DisclosurePanel>
      )}

      {/* Proceed / retry */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: "auto" }}>
        {!loading && (
          <button
            onClick={runRiskCheck}
            style={{
              fontFamily: HD.fontMono, fontSize: 10, letterSpacing: "0.08em",
              color: HD.slate, background: "none",
              border: `1px solid ${HD.soft}`, padding: "8px 16px", cursor: "pointer", borderRadius: 3,
            }}
          >
            RETRY CHECK
          </button>
        )}
        <button
          onClick={handleProceed}
          disabled={loading || isRejected}
          style={{
            fontFamily: HD.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: loading || isRejected ? HD.slate : "#ffffff",
            background: loading || isRejected ? `color-mix(in srgb,${HD.slate} 20%,transparent)` : HD.royal,
            border: `1px solid ${loading || isRejected ? HD.soft : HD.royal}`,
            padding: "10px 24px",
            cursor: loading || isRejected ? "not-allowed" : "pointer",
            borderRadius: 3,
          }}
        >
          {isRejected ? "BLOCKED BY RISK GATE" : "PROCEED TO REVIEW →"}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
