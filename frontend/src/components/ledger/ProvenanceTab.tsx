"use client";

import EmptyState from "../ui/EmptyState";
import type { LedgerEntry } from "../../api/pipelineTypes";

interface ProvenanceTabProps {
  ledger: LedgerEntry;
}

export default function ProvenanceTab({ ledger }: ProvenanceTabProps) {
  const l = ledger;

  return (
    <div className="space-y-2">
      <h3 className="text-[0.625rem] font-medium text-[var(--text-secondary)] uppercase">
        Hash Tree
      </h3>
      {l.provenance_chain ? (
        <div className="text-xs font-mono space-y-2">
          {Object.entries(l.provenance_chain).map(([k, v]) => (
            <div key={k}>
              <span className="text-[var(--text-secondary)]">{k}</span>
              <div className="text-[var(--text-tertiary)] break-all mt-0.5">
                {typeof v === "string" ? v : JSON.stringify(v)}
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-[var(--border-rim)]">
            <span className="text-[var(--accent-cyan)]">root_hash</span>
            <div className="text-[var(--text-primary)] break-all mt-0.5 font-semibold">
              {l.root_hash}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState type="empty" message="No provenance data" />
      )}
    </div>
  );
}
