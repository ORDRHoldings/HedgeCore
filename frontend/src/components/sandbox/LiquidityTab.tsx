"use client";

import EmptyState from "../ui/EmptyState";
import StatusChip from "../ui/StatusChip";
import type { ChipStatus } from "../ui/StatusChip";
import LiquidityDashboard from "./LiquidityDashboard";

interface LiquidityTabProps {
  liquidityResult: Record<string, unknown> | undefined;
  liquidityRegime: Record<string, unknown> | undefined;
}

export default function LiquidityTab({
  liquidityResult,
  liquidityRegime,
}: LiquidityTabProps) {
  if (!liquidityResult && !liquidityRegime) {
    return <EmptyState type="empty" message="No liquidity data" />;
  }

  const regime = liquidityRegime as Record<string, unknown> | undefined;
  const regimeLabel = regime?.regime as string | undefined;
  const regimeStatus: ChipStatus =
    regimeLabel === "CRISIS"
      ? "FAIL"
      : regimeLabel === "STRESSED"
      ? "WARN"
      : "PASS";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {regime && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          background: "var(--bg-sub)", border: "1px solid var(--border-rim)", borderRadius: 4,
        }}>
          <StatusChip status={regimeStatus} size="sm" />
          <span style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            {regimeLabel ?? "UNKNOWN"} REGIME
          </span>
          {regime.slippage_multiplier != null && (
            <span style={{ fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)", fontSize: 12, color: "var(--text-secondary)" }}>
              Slippage \xd7{String(regime.slippage_multiplier)}
            </span>
          )}
          {regime.margin_multiplier != null && (
            <span style={{ fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)", fontSize: 12, color: "var(--text-secondary)" }}>
              Margin \xd7{String(regime.margin_multiplier)}
            </span>
          )}
        </div>
      )}
      {liquidityResult && (
        <div style={{ background: "var(--bg-sub)", border: "1px solid var(--border-rim)", borderRadius: 4, overflow: "hidden" }}>
          <LiquidityDashboard liquidityResult={liquidityResult} />
        </div>
      )}
    </div>
  );
}
