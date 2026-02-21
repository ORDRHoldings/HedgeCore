"use client";

import React from "react";
import EmptyState from "@/components/ui/EmptyState";
import { useRouter } from "next/navigation";
import {
  Zap,
  FileText,
  CheckSquare,
  BarChart2,
  RefreshCw,
  PlusCircle,
  Search,
  X,
} from "lucide-react";
import { useAuth, UserContext } from "@/lib/authContext";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass)",
  fail:      "var(--accent-red,#B91C1C)",
} as const;

interface Action {
  label: string;
  permission: string;
  route: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
}

const ACTIONS: Action[] = [
  { label: "New Trade Entry",    permission: "trades.create",                Icon: FileText,     route: "/input"       },
  { label: "Run Sandbox",        permission: "calculate.run_sandbox",         Icon: Zap,          route: "/sandbox"     },
  { label: "Create Proposal",    permission: "pipeline.create_proposal",      Icon: PlusCircle,   route: "/sandbox"     },
  { label: "Review Approvals",   permission: "pipeline.approve",              Icon: CheckSquare,  route: "/staging"     },
  { label: "Refresh Market Data",permission: "market.autofill",               Icon: RefreshCw,    route: "/input"       },
  { label: "View Reports",       permission: "reports.view_own_branch",       Icon: BarChart2,    route: "/reports"     },
  { label: "Audit Log",          permission: "audit.view_own",                Icon: Search,       route: "/ledger"      },
];

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function QuickActionsWidget({ token, user, onRemove }: Props) {
  const { hasPermission } = useAuth();
  const router = useRouter();

  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  const visibleActions = ACTIONS.filter((a) => hasPermission(a.permission));

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: S.fontUI,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderBottom: `1px solid ${S.rim}`,
          background: S.bgDeep,
        }}
      >
        <Zap size={12} color={S.cyan} />
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: "0.625rem",
            letterSpacing: "0.1em",
            color: S.cyan,
            fontWeight: 700,
            flex: 1,
          }}
        >
          QUICK ACTIONS
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: S.tertiary,
              display: "flex",
              alignItems: "center",
              padding: 2,
              lineHeight: 1,
            }}
            title="Remove widget"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: 10 }}>
        {visibleActions.length === 0 ? (
          <EmptyState
            type="empty"
            title="No actions available"
            message="Quick actions will appear here based on your role permissions."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}
          >
            {visibleActions.map((action, idx) => {
              const isHovered = hoveredIdx === idx;
              return (
                <div
                  key={action.permission}
                  onClick={() => router.push(action.route)}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{
                    border: `1px solid ${isHovered ? S.cyan : S.rim}`,
                    background: S.bgSub,
                    padding: 10,
                    cursor: "pointer",
                    borderRadius: 3,
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    transition: "border-color 0.15s ease",
                  }}
                >
                  <action.Icon
                    size={14}
                    color={isHovered ? S.cyan : S.secondary}
                  />
                  <span
                    style={{
                      fontFamily: S.fontUI,
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      color: S.primary,
                      lineHeight: 1.2,
                    }}
                  >
                    {action.label}
                  </span>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: "0.5625rem",
                      color: S.tertiary,
                    }}
                  >
                    {action.route}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
