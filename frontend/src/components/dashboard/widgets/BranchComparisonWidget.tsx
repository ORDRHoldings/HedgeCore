"use client";

import { GitBranch, X } from "lucide-react";
import { useRouter } from "next/navigation";
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
  token:    string;
  user:     UserContext;
  onRemove?: () => void;
}

export default function BranchComparisonWidget({ onRemove }: Props) {
  const router = useRouter();
  return (
    <div
      style={{
        background:    S.bgPanel,
        border:        `1px solid ${S.rim}`,
        borderRadius:  6,
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
          gap:          8,
          padding:      "8px 12px",
          borderBottom: `1px solid ${S.rim}`,
          background:   S.bgDeep,
        }}
      >
        <GitBranch size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      10,
            color:         S.primary,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            flex:          1,
          }}
        >
          Branch Comparison
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label="Remove widget"
            style={{
              background: "none",
              border:     "none",
              cursor:     "pointer",
              color:      S.tertiary,
              padding:    "0 0 0 4px",
              lineHeight: 1,
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body — EmptyState only until Phase 2 (positions) provides branch data */}
      <div style={{ padding: "12px 12px 8px" }}>
        <EmptyState
          type="empty"
          title="No branch data"
          message="Branch comparison requires position data across multiple branches."
          action={{ label: "Go to Ingestion Desk", onClick: () => router.push("/input") }}
        />
      </div>
    </div>
  );
}
