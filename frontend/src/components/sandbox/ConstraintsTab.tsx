"use client";

import { JsonViewer } from "../ui/XRayDrawer";
import EmptyState from "../ui/EmptyState";

interface ConstraintsTabProps {
  capitalAdequacy: Record<string, unknown> | undefined;
  concentration: Record<string, unknown> | undefined;
  marginBreakdown: Record<string, unknown> | undefined;
  hedgeBands: Record<string, unknown> | undefined;
  transactionCosts: Record<string, unknown> | undefined;
}

export default function ConstraintsTab({
  capitalAdequacy,
  concentration,
  marginBreakdown,
  hedgeBands,
  transactionCosts,
}: ConstraintsTabProps) {
  const hasData =
    capitalAdequacy || concentration || marginBreakdown || hedgeBands || transactionCosts;

  if (!hasData) {
    return <EmptyState type="empty" message="No constraint data" />;
  }

  return (
    <div className="space-y-3">
      {capitalAdequacy && (
        <div>
          <h3 className="text-[0.75rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
            Capital Adequacy
          </h3>
          <JsonViewer data={capitalAdequacy} />
        </div>
      )}
      {marginBreakdown && (
        <div>
          <h3 className="text-[0.75rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
            Margin Breakdown
          </h3>
          <JsonViewer data={marginBreakdown} />
        </div>
      )}
      {concentration && (
        <div>
          <h3 className="text-[0.75rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
            Concentration
          </h3>
          <JsonViewer data={concentration} />
        </div>
      )}
      {hedgeBands && (
        <div>
          <h3 className="text-[0.75rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
            Hedge Bands
          </h3>
          <JsonViewer data={hedgeBands} />
        </div>
      )}
      {transactionCosts && (
        <div>
          <h3 className="text-[0.75rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
            Transaction Costs
          </h3>
          <JsonViewer data={transactionCosts} />
        </div>
      )}
    </div>
  );
}
