"use client";

import type { StagedArtifact } from "../../api/pipelineTypes";

interface FrozenArtifactTabProps {
  staging: StagedArtifact;
}

export default function FrozenArtifactTab({
  staging,
}: FrozenArtifactTabProps) {
  const s = staging;

  return (
    <div className="space-y-2 text-xs">
      <div className="space-y-1">
        {[
          { label: "Staging ID", value: s.staging_id.slice(0, 12), mono: true },
          { label: "Proposal", value: s.proposal_id.slice(0, 12), mono: true },
          { label: "Submitter", value: s.submitted_by },
          {
            label: "Submitted",
            value: new Date(s.submitted_at).toLocaleString(),
          },
          {
            label: "Integrity",
            value: `${s.integrity_score}/100`,
          },
          {
            label: "Required Approvals",
            value: `${s.required_approvals}`,
          },
        ].map(({ label, value, mono }) => (
          <div key={label} className="flex justify-between">
            <span className="text-[var(--text-secondary)]">{label}</span>
            <span className={mono ? "font-mono" : ""}>{value}</span>
          </div>
        ))}
      </div>
      {s.justification && (
        <div className="mt-2 p-2 bg-[var(--bg-sub)] rounded text-[var(--text-secondary)]">
          <span className="text-[0.625rem] uppercase font-medium">
            Justification
          </span>
          <p className="mt-1">{s.justification}</p>
        </div>
      )}
    </div>
  );
}
