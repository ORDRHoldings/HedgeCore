"use client";

import { useSelector } from "react-redux";
import type { RootState } from "../../lib/store";
import { setDecisionPacketMode } from "../../lib/store/slices/pipelineSlice";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../lib/store";

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
    <div className="h-7 bg-[var(--bg-deep)] border-b border-[var(--border-rim)] flex items-center px-4 gap-6 text-[0.625rem] font-mono text-[var(--text-tertiary)] shrink-0 select-none">
      <span className="font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
        HedgeCalc
      </span>

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
          "px-2 py-0.5 rounded text-[0.625rem] font-medium transition-colors",
          decisionPacketMode
            ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
            : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
        ].join(" ")}
      >
        {decisionPacketMode ? "◆ Committee" : "◇ Committee"}
      </button>

      <span className="text-[var(--text-tertiary)]">
        Role: <span className="text-[var(--accent-cyan)]">risk_analyst</span>
      </span>
    </div>
  );
}
