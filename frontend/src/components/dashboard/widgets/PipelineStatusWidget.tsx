"use client";

import { useRouter } from "next/navigation";
import { GitMerge, X } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { UserContext } from "@/lib/authContext";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:  "var(--bg-panel)",
  bgDeep:   "var(--bg-deep)",
  rim:      "var(--border-rim)",
  primary:  "var(--text-primary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
} as const;

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function PipelineStatusWidget({ onRemove }: Props) {
  const router = useRouter();

  return (
    <div
      style={{
        background:    S.bgPanel,
        border:        `1px solid ${S.rim}`,
        borderRadius:  4,
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          6,
          padding:      "6px 10px",
          borderBottom: `1px solid ${S.rim}`,
          background:   S.bgDeep,
        }}
      >
        <GitMerge size={12} color={S.cyan} />
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      "0.625rem",
            letterSpacing: "0.1em",
            color:         S.cyan,
            fontWeight:    700,
          }}
        >
          PIPELINE STATUS
        </span>
        <span style={{ flex: 1 }} />
        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: "none",
              border:     "none",
              cursor:     "pointer",
              color:      S.tertiary,
              display:    "flex",
              alignItems: "center",
              padding:    2,
              lineHeight: 1,
            }}
            title="Remove widget"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body — EmptyState only until real pipeline data flows */}
      <div style={{ padding: 10 }}>
        <EmptyState
          type="empty"
          title="No pipeline activity"
          message="Run a simulation in the Execution section to see pipeline status."
          action={{
            label: "Go to Simulation Engine",
            onClick: () => router.push("/sandbox"),
          }}
        />
      </div>
    </div>
  );
}
