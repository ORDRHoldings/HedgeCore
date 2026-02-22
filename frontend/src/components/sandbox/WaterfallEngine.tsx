"use client";

import { useMemo } from "react";
import DenseTable from "../ui/DenseTable";
import type { Column } from "../ui/DenseTable";
import StatusChip from "../ui/StatusChip";
import type { ChipStatus } from "../ui/StatusChip";
import KpiTile from "../ui/KpiTile";
import type { WaterfallResult } from "../../api/pipelineTypes";

interface WaterfallEngineProps {
  waterfall: WaterfallResult;
  runId: string;
  v2ModuleCount: number;
  onRuleClick?: (rule: Record<string, unknown>) => void;
  onXRay?: () => void;
  readOnly?: boolean;
}

type WaterfallRow = {
  rule_id: string;
  name: string;
  status: string;
  v_codes: string[];
  result_summary: string;
};

export default function WaterfallEngine({
  waterfall,
  runId,
  v2ModuleCount,
  onRuleClick,
  onXRay,
  readOnly = false,
}: WaterfallEngineProps) {
  const columns: Column<WaterfallRow>[] = useMemo(
    () => [
      {
        key: "rule_id",
        header: "Rule",
        width: "60px",
        render: (r) => (
          <span className="font-mono font-semibold">{r.rule_id}</span>
        ),
      },
      {
        key: "name",
        header: "Name",
        render: (r) => r.name,
      },
      {
        key: "status",
        header: "Status",
        width: "80px",
        align: "center" as const,
        render: (r) => (
          <StatusChip status={r.status as ChipStatus} size="sm" />
        ),
      },
      {
        key: "v_codes",
        header: "V-Codes",
        render: (r) => (
          <span className="text-[var(--text-tertiary)]">
            {r.v_codes.length > 0 ? r.v_codes.join(", ") : "—"}
          </span>
        ),
      },
      {
        key: "summary",
        header: "Summary",
        render: (r) => (
          <span className="text-[var(--text-secondary)]">
            {r.result_summary}
          </span>
        ),
      },
    ],
    []
  );

  const passCount = waterfall.rules.filter(
    (r: { status: string }) => r.status === "PASS"
  ).length;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3">
        <KpiTile
          label="Integrity"
          value={`${waterfall.integrity_score}/100`}
          deltaDirection={
            waterfall.integrity_score >= 80 ? "positive" : "negative"
          }
        />
        <KpiTile label="Status" value={waterfall.overall_status} />
        <KpiTile
          label="Rules Passed"
          value={`${passCount}/${waterfall.rules.length}`}
        />
        <KpiTile label="Run ID" value={runId.slice(0, 8)} />
        <KpiTile label="V2 Modules" value={v2ModuleCount.toString()} />
      </div>

      {/* R1-R8 waterfall table */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-rim)]">
          <h2 className="text-xs font-semibold text-[var(--text-primary)]">
            {readOnly ? "R1–R8 Waterfall (Read-only)" : "R1–R8 Waterfall"}
          </h2>
          {onXRay && (
            <button
              onClick={onXRay}
              className="text-[0.75rem] text-[var(--accent-cyan)] hover:underline"
            >
              X-Ray →
            </button>
          )}
        </div>
        <DenseTable
          columns={columns}
          data={waterfall.rules as WaterfallRow[]}
          keyFn={(r: WaterfallRow) => r.rule_id}
          onRowClick={
            onRuleClick
              ? (r) =>
                  onRuleClick(r as unknown as Record<string, unknown>)
              : undefined
          }
          compact
        />
      </div>
    </div>
  );
}
