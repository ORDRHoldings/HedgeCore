"use client";

/**
 * SystemBar.tsx — Pipeline context strip
 *
 * Renders ONLY on execution-pipeline routes (via ClientProviders).
 * Shows pipeline metadata: engine version, run ID, snapshot hash, committee toggle.
 * No brand, no navigation, no identity — those live in AppTopBar.
 */

import { useSelector, useDispatch } from "react-redux";
import type { RootState, AppDispatch } from "../../lib/store";
import { setDecisionPacketMode } from "../../lib/store/slices/pipelineSlice";

export default function SystemBar() {
  const dispatch = useDispatch<AppDispatch>();
  const { decisionPacketMode, sandboxResult } = useSelector(
    (s: RootState) => s.pipeline
  );

  const runId = sandboxResult?.run_id ?? "—";
  const engineVersion = "1.0.0";
  const snapshotHash = sandboxResult?.frozen_inputs?.market_hash
    ? String(sandboxResult.frozen_inputs.market_hash).slice(0, 8)
    : "—";

  return (
    <div className="h-8 bg-[var(--bg-sub)] border-b border-[var(--border-soft)] flex items-center px-4 gap-6 text-sm font-mono text-[var(--text-tertiary)] shrink-0 select-none">
      <span>
        Engine <span className="text-[var(--text-secondary)]">{engineVersion}</span>
      </span>

      <span>
        Run <span className="text-[var(--text-secondary)]">{runId.slice(0, 8)}</span>
      </span>

      <span>
        Snap <span className="text-[var(--text-secondary)]">{snapshotHash}</span>
      </span>

      <div className="flex-1" />

      {/* Decision Packet Mode toggle */}
      <button
        onClick={() => dispatch(setDecisionPacketMode(!decisionPacketMode))}
        className={[
          "px-2 py-0.5 rounded text-sm font-medium transition-colors",
          decisionPacketMode
            ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
            : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
        ].join(" ")}
      >
        {decisionPacketMode ? "◆ Committee" : "◇ Committee"}
      </button>
    </div>
  );
}
