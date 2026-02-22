"use client";

import { JsonViewer } from "../ui/XRayDrawer";
import EmptyState from "../ui/EmptyState";
import StatusChip from "../ui/StatusChip";
import type { ChipStatus } from "../ui/StatusChip";

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
    <div className="space-y-3">
      {liquidityResult && (
        <div>
          <h3 className="text-[0.75rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
            Liquidity Estimates
          </h3>
          <JsonViewer data={liquidityResult} />
        </div>
      )}
      {regime && (
        <div>
          <h3 className="text-[0.75rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
            Regime Classification
          </h3>
          <div className="flex items-center gap-2 mb-2">
            <StatusChip status={regimeStatus} size="sm" />
            <span className="text-xs font-mono text-[var(--text-primary)]">
              {regimeLabel ?? "UNKNOWN"}
            </span>
          </div>
          <div className="text-xs text-[var(--text-tertiary)] space-y-1">
            {regime.slippage_multiplier != null && (
              <div>
                Slippage multiplier:{" "}
                <span className="font-mono text-[var(--text-secondary)]">
                  {String(regime.slippage_multiplier)}×
                </span>
              </div>
            )}
            {regime.margin_multiplier != null && (
              <div>
                Margin multiplier:{" "}
                <span className="font-mono text-[var(--text-secondary)]">
                  {String(regime.margin_multiplier)}×
                </span>
              </div>
            )}
          </div>
          <div className="mt-2">
            <JsonViewer data={regime} />
          </div>
        </div>
      )}
    </div>
  );
}
