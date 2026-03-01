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

  const buildProposals = () =>
    positions.map(p => ({
      position_id:       p.id,
      execution_ref:     `HD-${runId.slice(0, 8)}-${p.id.slice(0, 4)}`,
      hedge_amount:      (calcResult.hedge_amount as number) ?? p.amount ?? 0,
      hedge_rate:        (calcResult.hedge_rate as number) ?? 0,
      run_id:            runId,
      risk_decision_hash: riskDecisionHash,
      risk_verdict:      riskVerdict,
    }));

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
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { detail?: string }).detail ?? `HTTP ${res.status}`);
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

      {/* Hedge plan summary */}
      <div style={{ background: HD.bgPanel, border: `1px solid ${HD.soft}`, borderRadius: 4, padding: "12px 14px" }}>
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
            HEDGE PLAN SUMMARY
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          {[
            ["INSTRUMENT",   (calcResult.instrument as string) ?? "FORWARD"],
            ["HEDGE AMOUNT", calcResult.hedge_amount != null ? fmt(calcResult.hedge_amount as number) : "—"],
            ["HEDGE RATE",   calcResult.hedge_rate   != null ? (calcResult.hedge_rate as number).toFixed(6) : "—"],
            ["RUN ID",       runId.slice(0, 12) + "..."],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 9, color: HD.tertiary, letterSpacing: "0.1em" }}>{k}</span>
              <span style={{ fontFamily: HD.fontMono, fontSize: 13, fontWeight: 600, color: HD.primary }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

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
