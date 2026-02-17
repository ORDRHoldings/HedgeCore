"use client";

import { useState } from "react";
import type { ApprovalAction } from "../../api/pipelineTypes";

interface AuthorizationTabProps {
  onAuthorize: (action: ApprovalAction, comment: string) => void;
  loading: boolean;
  requiredApprovals: number;
  currentApprovals: number;
}

export default function AuthorizationTab({
  onAuthorize,
  loading,
  requiredApprovals,
  currentApprovals,
}: AuthorizationTabProps) {
  const [comment, setComment] = useState("");

  const handleAction = (action: ApprovalAction) => {
    onAuthorize(action, comment);
    setComment("");
  };

  return (
    <div className="space-y-3">
      {/* Threshold indicator */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text-secondary)]">Approval Progress</span>
        <span className="font-mono text-[var(--text-primary)]">
          {currentApprovals}/{requiredApprovals}
        </span>
      </div>
      <div className="h-1.5 bg-[var(--bg-sub)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--accent-cyan)] rounded-full transition-all"
          style={{
            width: `${Math.min(
              100,
              (currentApprovals / Math.max(1, requiredApprovals)) * 100
            )}%`,
          }}
        />
      </div>

      {/* Comment */}
      <div>
        <label className="block text-[0.625rem] font-medium text-[var(--text-secondary)] uppercase mb-1">
          Comment
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment…"
          className="w-full h-20 px-2 py-1.5 text-xs bg-[var(--bg-sub)] border border-[var(--border-rim)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => handleAction("APPROVE")}
          disabled={loading}
          className="flex-1 px-3 py-1.5 text-xs font-medium bg-[var(--accent-green)]/20 text-[var(--accent-green)] border border-[var(--accent-green)]/30 rounded hover:bg-[var(--accent-green)]/30 disabled:opacity-50 transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => handleAction("RETURN")}
          disabled={loading}
          className="flex-1 px-3 py-1.5 text-xs font-medium bg-[var(--bg-sub)] text-[var(--text-secondary)] border border-[var(--border-rim)] rounded hover:bg-[var(--bg-sub)]/80 disabled:opacity-50 transition-colors"
        >
          Return
        </button>
        <button
          onClick={() => handleAction("REJECT")}
          disabled={loading}
          className="flex-1 px-3 py-1.5 text-xs font-medium bg-[var(--accent-red)]/20 text-[var(--accent-red)] border border-[var(--accent-red)]/30 rounded hover:bg-[var(--accent-red)]/30 disabled:opacity-50 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
