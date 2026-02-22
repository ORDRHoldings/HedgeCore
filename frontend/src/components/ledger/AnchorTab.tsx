"use client";

import type { LedgerEntry } from "../../api/pipelineTypes";

interface AnchorTabProps {
  ledger: LedgerEntry;
}

export default function AnchorTab({ ledger }: AnchorTabProps) {
  return (
    <div className="text-xs text-[var(--text-secondary)] space-y-2">
      <p>
        Daily Merkle root anchoring provides external verifiability. The
        root hash of this entry participates in the daily anchor
        computation.
      </p>
      <div className="p-2 bg-[var(--bg-sub)] rounded">
        <span className="text-[0.75rem] uppercase font-medium text-[var(--text-tertiary)]">
          Entry Root Hash
        </span>
        <p className="font-mono text-[var(--text-primary)] break-all mt-1">
          {ledger.root_hash}
        </p>
      </div>
      <div className="p-2 bg-[var(--bg-sub)] rounded">
        <span className="text-[0.75rem] uppercase font-medium text-[var(--text-tertiary)]">
          Replay Status
        </span>
        <p className="mt-1">
          {ledger.replay_verified ? (
            <span className="text-[var(--accent-green)] font-medium">
              ✓ Deterministically verified
            </span>
          ) : (
            <span className="text-[var(--accent-amber)] font-medium">
              ○ Not yet verified
            </span>
          )}
        </p>
      </div>
      <div className="p-2 bg-[var(--bg-sub)] rounded">
        <span className="text-[0.75rem] uppercase font-medium text-[var(--text-tertiary)]">
          Audit Readiness
        </span>
        <p className="mt-1 text-[var(--text-tertiary)]">
          External anchor publication requires production configuration.
          This entry is queued for the next daily Merkle root computation.
        </p>
      </div>
    </div>
  );
}
