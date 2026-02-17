"use client";

import { JsonViewer } from "../ui/XRayDrawer";
import EmptyState from "../ui/EmptyState";
import KpiTile from "../ui/KpiTile";

interface BeforeAfterTabProps {
  worstCase: Record<string, unknown> | undefined;
  marginSummary: Record<string, unknown> | undefined;
}

export default function BeforeAfterTab({
  worstCase,
  marginSummary,
}: BeforeAfterTabProps) {
  if (!worstCase && !marginSummary) {
    return <EmptyState type="empty" message="No impact data" />;
  }

  const wc = worstCase as Record<string, unknown> | undefined;
  const ms = marginSummary as Record<string, unknown> | undefined;

  return (
    <div className="space-y-3">
      {/* Worst-case KPI deltas */}
      {wc && (
        <div>
          <h3 className="text-[0.625rem] font-medium text-[var(--text-secondary)] uppercase mb-2">
            Worst-Case Impact
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <KpiTile
              label="Pre-Hedge Loss"
              value={
                wc.pre_hedge_worst_case != null
                  ? `$${Number(wc.pre_hedge_worst_case).toLocaleString()}`
                  : "—"
              }
            />
            <KpiTile
              label="Post-Hedge Loss"
              value={
                wc.post_hedge_worst_case != null
                  ? `$${Number(wc.post_hedge_worst_case).toLocaleString()}`
                  : "—"
              }
              deltaDirection={
                wc.delta_improvement != null &&
                Number(wc.delta_improvement) > 0
                  ? "positive"
                  : "neutral"
              }
            />
            {wc.worst_case_scenario_name ? (
              <KpiTile
                label="Worst Scenario"
                value={String(wc.worst_case_scenario_name)}
                className="col-span-2"
              />
            ) : null}
          </div>
          <div className="mt-2">
            <JsonViewer data={wc} />
          </div>
        </div>
      )}

      {/* Margin impact */}
      {ms && (
        <div>
          <h3 className="text-[0.625rem] font-medium text-[var(--text-secondary)] uppercase mb-2">
            Margin Summary
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <KpiTile
              label="Total Margin"
              value={
                ms.total_margin != null
                  ? `$${Number(ms.total_margin).toLocaleString()}`
                  : "—"
              }
            />
            <KpiTile
              label="Funding Cost"
              value={
                ms.total_funding_cost != null
                  ? `$${Number(ms.total_funding_cost).toLocaleString()}`
                  : "—"
              }
            />
          </div>
          <div className="mt-2">
            <JsonViewer data={ms} />
          </div>
        </div>
      )}
    </div>
  );
}
