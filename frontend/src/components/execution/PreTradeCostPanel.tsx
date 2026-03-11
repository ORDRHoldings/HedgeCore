"use client";

import { useState } from "react";
import type { PositionRow } from "@/api/positionClient";
import MarketMicrostructure from "@/components/sandbox/MarketMicrostructure";

interface PreTradeCostPanelProps {
  positions: PositionRow[];
  calcResult: Record<string, unknown>;
}

export default function PreTradeCostPanel({ positions, calcResult }: PreTradeCostPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const totalNotional = positions.reduce((sum, p) => sum + Math.abs(p.amount ?? 0), 0);
  const primaryCurrency = positions[0]?.currency ?? "MXN";

  // Safely extract spot rate from calcResult
  const hedgePlan = calcResult?.hedge_plan as Record<string, unknown> | undefined;
  const buckets   = hedgePlan?.buckets as Array<Record<string, unknown>> | undefined;
  const summary   = hedgePlan?.summary  as Record<string, unknown> | undefined;
  const spot = (
    (buckets?.[0]?.spot_rate as number | undefined)
    ?? (summary?.spot_rate as number | undefined)
    ?? 19.0
  );

  return (
    <div style={{ borderTop: "1px solid var(--border-rim)", marginTop: 12 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "10px 0", background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
          fontSize: 12, fontWeight: 600, letterSpacing: "0.10em",
          color: "var(--text-tertiary)", textTransform: "uppercase",
        }}
      >
        <span style={{ transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
        PRE-TRADE COST ANALYSIS
        <span style={{
          fontSize: 12, padding: "1px 5px",
          border: "1px solid rgba(245,158,11,0.3)",
          background: "rgba(245,158,11,0.06)",
          color: "var(--accent-amber)", letterSpacing: "0.06em",
        }}>
          TCA
        </span>
      </button>
      {expanded && (
        <div style={{ paddingBottom: 16 }}>
          <MarketMicrostructure
            notionalUSD={totalNotional}
            primaryCurrency={primaryCurrency}
            spot={spot}
          />
        </div>
      )}
    </div>
  );
}
