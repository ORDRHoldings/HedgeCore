"use client";

interface ProposalControlsProps {
  onCreateProposal: () => void;
  proposalsLoading: boolean;
  canPropose: boolean;
  currentProposalId?: string | null;
}

export default function ProposalControls({
  onCreateProposal,
  proposalsLoading,
  canPropose,
  currentProposalId,
}: ProposalControlsProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onCreateProposal}
        disabled={proposalsLoading || !canPropose}
        className="px-4 py-2 text-xs font-medium bg-[var(--accent-cyan)] text-[var(--bg-deep)] rounded hover:bg-[var(--accent-cyan)]/80 disabled:opacity-50 transition-colors"
      >
        {proposalsLoading ? "Freezing…" : "Generate Proposal"}
      </button>
      {currentProposalId && (
        <span className="text-xs text-[var(--accent-green)] font-mono">
          ✓ {currentProposalId}
        </span>
      )}
    </div>
  );
}
