"use client";

import { JsonViewer } from "../ui/XRayDrawer";
import EmptyState from "../ui/EmptyState";

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
    <div className="space-y-3">
      {navAttribution && (
        <div>
          <h3 className="text-[0.75rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
            NAV Attribution
          </h3>
          <JsonViewer data={navAttribution} />
        </div>
      )}
      {factorCovariance && (
        <div>
          <h3 className="text-[0.75rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
            Factor Covariance
          </h3>
          <JsonViewer data={factorCovariance} />
        </div>
      )}
    </div>
  );
}
