"use client";

import EmptyState from "../ui/EmptyState";
import AttributionWaterfall from "./AttributionWaterfall";
import CorrelationHeatmap from "./CorrelationHeatmap";

interface AttributionTabProps {
  navAttribution: Record<string, unknown> | undefined;
  factorCovariance: Record<string, unknown> | undefined;
}

export default function AttributionTab({
  navAttribution,
  factorCovariance,
}: AttributionTabProps) {
  if (!navAttribution && !factorCovariance) {
    return <EmptyState type="empty" message="No attribution data" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {navAttribution && (
        <div style={{ background: "var(--bg-sub)", border: "1px solid var(--border-rim)", borderRadius: 4, overflow: "hidden" }}>
          <AttributionWaterfall navAttribution={navAttribution} />
        </div>
      )}
      {factorCovariance && (
        <div style={{ background: "var(--bg-sub)", border: "1px solid var(--border-rim)", borderRadius: 4, overflow: "hidden" }}>
          <CorrelationHeatmap factorCovariance={factorCovariance} />
        </div>
      )}
    </div>
  );
}
