"use client";

import StatusChip from "../ui/StatusChip";
import type { ApprovalRecord } from "../../api/pipelineTypes";

interface ApprovalRecordsListProps {
  approvals: ApprovalRecord[];
}

export default function ApprovalRecordsList({
  approvals,
}: ApprovalRecordsListProps) {
  if (approvals.length === 0) return null;

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-3">
      <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-2">
        Approval Records
      </h3>
      <div className="space-y-2">
        {approvals.map((a, i) => (
          <div
            key={i}
            className="flex items-center gap-3 text-xs border-b border-[var(--border-rim)]/50 pb-2"
          >
            <StatusChip
              status={
                a.action === "APPROVE"
                  ? "PASS"
                  : a.action === "REJECT"
                  ? "FAIL"
                  : "RETURNED"
              }
              size="sm"
            />
            <span className="font-mono text-[var(--text-secondary)]">
              {a.approver_id}
            </span>
            <span className="text-[var(--text-tertiary)]">
              {a.approver_role}
            </span>
            {a.comment && (
              <span className="text-[var(--text-secondary)] italic">
                &ldquo;{a.comment}&rdquo;
              </span>
            )}
            <span className="ml-auto text-[var(--text-tertiary)]">
              {new Date(a.timestamp).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
