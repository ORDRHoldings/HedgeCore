"use client";

import EmptyState from "../ui/EmptyState";
import CapitalAdequacyPanel from "./CapitalAdequacyPanel";
import MarginBreakdownTable from "./MarginBreakdownTable";
import ConcentrationPanel from "./ConcentrationPanel";
import HedgeBandChart from "./HedgeBandChart";
import TransactionCostPanel from "./TransactionCostPanel";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {capitalAdequacy && (
        <div style={{ background: "var(--bg-sub)", border: "1px solid var(--border-rim)", borderRadius: 4, overflow: "hidden" }}>
          <CapitalAdequacyPanel capitalAdequacy={capitalAdequacy} />
        </div>
      )}
      {marginBreakdown && (
        <div style={{ background: "var(--bg-sub)", border: "1px solid var(--border-rim)", borderRadius: 4, overflow: "hidden" }}>
          <MarginBreakdownTable marginBreakdown={marginBreakdown} />
        </div>
      )}
      {concentration && (
        <div style={{ background: "var(--bg-sub)", border: "1px solid var(--border-rim)", borderRadius: 4, overflow: "hidden" }}>
          <ConcentrationPanel concentration={concentration} />
        </div>
      )}
      {hedgeBands && (
        <div style={{ background: "var(--bg-sub)", border: "1px solid var(--border-rim)", borderRadius: 4, overflow: "hidden" }}>
          <HedgeBandChart hedgeBands={hedgeBands} />
        </div>
      )}
      {transactionCosts && (
        <div style={{ background: "var(--bg-sub)", border: "1px solid var(--border-rim)", borderRadius: 4, overflow: "hidden" }}>
          <TransactionCostPanel transactionCosts={transactionCosts} />
        </div>
      )}
    </div>
  );
}
