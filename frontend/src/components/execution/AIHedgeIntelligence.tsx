"use client";

import { useState, useMemo } from "react";
import type { PositionRow } from "@/api/positionClient";
import type { SandboxCalculateResponse } from "@/api/pipelineTypes";
import { AICommentaryPanel } from "@/components/sandbox/AICommentaryPanel";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  rim:      "var(--border-rim)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
} as const;

interface AIHedgeIntelligenceProps {
  positions: PositionRow[];
  calcResult: Record<string, unknown>;
  riskVerdict: string;
}

export default function AIHedgeIntelligence({ positions, calcResult, riskVerdict }: AIHedgeIntelligenceProps) {
  const [expanded, setExpanded] = useState(true); // Default OPEN — the differentiator

  const totalNotional = positions.reduce((sum, p) => sum + Math.abs(p.amount ?? 0), 0);

  // Extract spot from calcResult
  const hedgePlan = calcResult?.hedge_plan as Record<string, unknown> | undefined;
  const buckets   = hedgePlan?.buckets as Array<Record<string, unknown>> | undefined;
  const summary   = hedgePlan?.summary  as Record<string, unknown> | undefined;
  const spot = (
    (buckets?.[0]?.spot_rate as number | undefined)
    ?? (summary?.spot_rate as number | undefined)
    ?? 19.0
  );

  // Adapt CalculateResponse → SandboxCalculateResponse for AICommentaryPanel
  const sandboxResult: SandboxCalculateResponse | null = useMemo(() => {
    if (!calcResult || Object.keys(calcResult).length === 0) return null;
    return {
      run_id: (calcResult.run_id as string) ?? "",
      calculate_response: calcResult as unknown as SandboxCalculateResponse["calculate_response"],
      waterfall_result: {
        rules: [],
        overall_status: riskVerdict === "APPROVE" ? "PASS" : riskVerdict === "REJECT" ? "FAIL" : "WARN",
        integrity_score: riskVerdict === "APPROVE" ? 1 : 0.5,
      },
      validation_report: (calcResult.validation_report as Record<string, unknown>) ?? {},
      hedge_plan:        hedgePlan ?? {},
      scenario_results:  (calcResult.scenario_results as Record<string, unknown>) ?? {},
      trace_events:      [],
      frozen_inputs:     {},
      run_envelope:      (calcResult.run_envelope as Record<string, unknown>) ?? {},
      v2_results:        {},
    } as SandboxCalculateResponse;
  }, [calcResult, hedgePlan, riskVerdict]);

  return (
    <div style={{ borderTop: `1px solid ${S.rim}`, marginTop: 16 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "12px 0", background: "transparent", border: "none", cursor: "pointer",
          fontFamily: S.fontMono, fontSize: 10, fontWeight: 600,
          letterSpacing: "0.10em", color: S.tertiary, textTransform: "uppercase",
        }}
      >
        <span style={{ transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
        AI HEDGE INTELLIGENCE
        <span style={{
          fontSize: 9, padding: "1px 5px",
          border: "1px solid rgba(245,158,11,0.3)",
          background: "rgba(245,158,11,0.06)",
          color: S.amber, letterSpacing: "0.06em",
        }}>
          AI
        </span>
      </button>

      {expanded && sandboxResult && (
        <div style={{ paddingBottom: 16 }}>
          <AICommentaryPanel
            sandboxResult={sandboxResult}
            spot={spot}
            notionalUSD={totalNotional}
          />
        </div>
      )}

      {expanded && !sandboxResult && (
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, padding: "12px 0" }}>
          AI commentary requires a completed engine calculation. Complete Phase 2 (Calculate) first.
        </div>
      )}
    </div>
  );
}
