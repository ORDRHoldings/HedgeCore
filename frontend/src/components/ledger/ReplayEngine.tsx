"use client";

import StatusChip from "../ui/StatusChip";
import EmptyState from "../ui/EmptyState";
import { JsonViewer } from "../ui/XRayDrawer";
import type { ReplayResult } from "../../api/pipelineTypes";

interface ReplayEngineProps {
  replayResult: ReplayResult | null;
  replayLoading: boolean;
  onRunReplay: () => void;
}

export default function ReplayEngine({
  replayResult,
  replayLoading,
  onRunReplay,
}: ReplayEngineProps) {
  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-rim)]">
        <h2 className="text-xs font-semibold text-[var(--text-primary)]">
          Replay Engine — 14-Field Determinism Check
        </h2>
        <button
          onClick={onRunReplay}
          disabled={replayLoading}
          className="px-3 py-1 text-[0.6875rem] font-medium bg-[var(--accent-cyan)] text-[var(--bg-deep)] rounded hover:bg-[var(--accent-cyan)]/80 disabled:opacity-50 transition-colors"
        >
          {replayLoading ? "Replaying…" : "Run Replay"}
        </button>
      </div>

      {replayLoading && (
        <div className="p-4">
          <EmptyState
            type="loading"
            message="Running deterministic replay…"
          />
        </div>
      )}

      {replayResult && (
        <div className="p-3 space-y-3">
          {/* Match status */}
          <div className="flex items-center gap-3">
            <StatusChip
              status={replayResult.match ? "PASS" : "FAIL"}
            />
            <span className="text-xs text-[var(--text-secondary)]">
              {replayResult.match
                ? "All 14 fields match — deterministic replay verified"
                : `${replayResult.divergences.length} divergence(s) detected`}
            </span>
          </div>

          {/* Fields compared */}
          <div className="grid grid-cols-2 gap-1 text-xs">
            {replayResult.fields_compared.map((f) => (
              <div key={f} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />
                <span className="font-mono text-[var(--text-secondary)]">
                  {f}
                </span>
              </div>
            ))}
          </div>

          {/* Hashes */}
          <div className="text-xs space-y-1 font-mono">
            <div className="flex gap-2">
              <span className="text-[var(--text-secondary)]">
                Original:
              </span>
              <span className="text-[var(--text-tertiary)]">
                {replayResult.original_hash}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-[var(--text-secondary)]">
                Replay:
              </span>
              <span className="text-[var(--text-tertiary)]">
                {replayResult.replay_hash}
              </span>
            </div>
          </div>

          {/* Divergences */}
          {replayResult.divergences.length > 0 && (
            <DivergenceReport divergences={replayResult.divergences} />
          )}
        </div>
      )}

      {!replayResult && !replayLoading && (
        <div className="p-4">
          <EmptyState
            type="empty"
            title="No replay run"
            message="Click 'Run Replay' to verify deterministic reproducibility."
          />
        </div>
      )}
    </div>
  );
}

// ── Divergence sub-component ──
function DivergenceReport({
  divergences,
}: {
  divergences: Record<string, unknown>[];
}) {
  return (
    <div className="mt-2">
      <h3 className="text-[0.625rem] font-medium text-[var(--accent-red)] uppercase mb-1">
        Divergences
      </h3>
      <JsonViewer data={divergences} initialExpanded />
    </div>
  );
}
