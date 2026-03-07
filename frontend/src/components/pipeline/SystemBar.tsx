"use client";

/**
 * SystemBar.tsx — Pipeline context strip
 *
 * Renders ONLY on execution-pipeline routes (via ClientProviders).
 * Shows pipeline metadata: engine version, run ID, snapshot hash, committee toggle.
 * No brand, no navigation, no identity — those live in AppSidebar.
 */

import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import type { RootState, AppDispatch } from "../../lib/store";
import { setDecisionPacketMode } from "../../lib/store/slices/pipelineSlice";

export default function SystemBar() {
  const router = useRouter();
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
    <div className="h-8 bg-[var(--bg-sub)] border-b border-[var(--border-soft)] flex items-center px-4 gap-6 text-sm font-mono text-[var(--text-tertiary)] shrink-0">
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

      {/* Execution Desk navigation shortcut */}
      <button
        onClick={() => router.push("/hedge-desk")}
        className="px-2 py-0.5 rounded text-xs font-mono font-semibold transition-colors border"
        style={{
          letterSpacing: "0.08em",
          fontSize: "0.6875rem",
          color: "var(--accent-cyan)",
          borderColor: "rgba(0,255,255,0.3)",
          background: "rgba(0,255,255,0.08)",
        }}
      >
        EXECUTION DESK →
      </button>

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
