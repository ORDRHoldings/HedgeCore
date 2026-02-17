"use client";

import { JsonViewer } from "../ui/XRayDrawer";
import EmptyState from "../ui/EmptyState";
import KpiTile from "../ui/KpiTile";

interface AllocatorSummaryProps {
  allocatorResult: Record<string, unknown> | undefined;
  currencyNetting: Record<string, unknown> | undefined;
}

export default function AllocatorSummary({
  allocatorResult,
  currencyNetting,
}: AllocatorSummaryProps) {
  if (!allocatorResult && !currencyNetting) {
    return null;
  }

  const ar = allocatorResult as Record<string, unknown> | undefined;

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded">
      <div className="px-3 py-2 border-b border-[var(--border-rim)]">
        <h2 className="text-xs font-semibold text-[var(--text-primary)]">
          Capital Allocation
        </h2>
      </div>
      <div className="p-3 space-y-3">
        {ar && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <KpiTile
                label="Total Margin"
                value={
                  ar.total_margin_used != null
                    ? `$${Number(ar.total_margin_used).toLocaleString()}`
                    : "—"
                }
              />
              <KpiTile
                label="Total Cost"
                value={
                  ar.total_cost != null
                    ? `$${Number(ar.total_cost).toLocaleString()}`
                    : "—"
                }
              />
              <KpiTile
                label="Hedges Selected"
                value={
                  ar.selected_count != null
                    ? String(ar.selected_count)
                    : "—"
                }
              />
            </div>
            <JsonViewer data={ar} />
          </>
        )}
        {currencyNetting && (
          <div>
            <h3 className="text-[0.625rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
              Currency Netting
            </h3>
            <JsonViewer data={currencyNetting} />
          </div>
        )}
      </div>
    </div>
  );
}
