"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Activity } from "lucide-react";
import { UserContext } from "@/lib/authContext";
import EmptyState from "@/components/ui/EmptyState";

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

import { dashboardFetch } from "@/lib/api/dashboardClient";

interface ActivityItem {
  ts: string;
  user_name: string;
  action: string;
  module: string;
  status: string;
  branch: string;
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

const MODULE_TABS = ["ALL", "Pipeline", "Trades", "Reports"];

function moduleChipStyle(mod: string): React.CSSProperties {
  const MAP: Record<string, string> = {
    Pipeline:   "var(--accent-cyan)",
    CurrencyFX: "var(--accent-amber)",
    Trades:     "#3B82F6",
    Reports:    "#22C55E",
    Auth:       S.tertiary,
    Audit:      "#EAB308",
  };
  const color = MAP[mod] ?? S.tertiary;
  return {
    fontFamily: S.fontMono,
    fontSize: 9,
    fontWeight: 600,
    color,
    border: "1px solid "+color,
    borderRadius: 3,
    padding: "1px 5px",
    letterSpacing: "0.05em",
    whiteSpace: "nowrap" as const,
    background: color+"1a",
  };
}

function relativeTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const ini = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "");
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        color: S.cyan,
        background: "rgba(6,182,212,0.1)",
        border: "1px solid "+S.cyan,
        borderRadius: 3,
        width: 24,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {ini}
    </span>
  );
}

export default function TeamActivityWidget({ token, user, onRemove }: Props) {
  const [items, setItems]         = useState<ActivityItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL");

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const res = await dashboardFetch("/v1/dashboard/team-activity", token);
      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) { setError("fetch error"); return; }
      const data: ActivityItem[] = await res.json();
      setItems(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  const filtered = useMemo(
    () => activeTab === "ALL" ? items : items.filter((x) => x.module === activeTab),
    [items, activeTab]
  );

  const scopeLabel = user.branch?.code ?? "BRANCH";

  const monoNote = (color: string): React.CSSProperties => ({
    padding: "18px 14px",
    fontFamily: S.fontMono,
    fontSize: 11,
    color,
  });

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: S.fontMono,
    fontSize: 9,
    fontWeight: active ? 700 : 400,
    color: active ? S.cyan : S.tertiary,
    background: active ? "rgba(6,182,212,0.1)" : "transparent",
    border: active ? "1px solid "+S.cyan : "1px solid transparent",
    borderRadius: 3,
    padding: "2px 7px",
    cursor: "pointer",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  });

  return (
    <div
      style={{
        fontFamily: S.fontUI,
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px",
          borderBottom: `1px solid ${S.soft}`,
          background: S.bgSub,
          flexShrink: 0,
        }}
      >
        <Activity size={13} style={{ color: S.cyan, flexShrink: 0 }} />
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 600,
            color: S.primary,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            flex: 1,
          }}
        >
          TEAM ACTIVITY
        </span>
        {/* Scope label */}
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 9,
            color: S.tertiary,
            background: S.bgDeep,
            border: `1px solid ${S.soft}`,
            borderRadius: 3,
            padding: "1px 6px",
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {scopeLabel}
        </span>
        {/* Close */}
        {onRemove && (
          <button
            onClick={onRemove}
            title="Remove widget"
            style={{
              background: "none",
              border: "none",
              color: S.tertiary,
              cursor: "pointer",
              fontSize: 15,
              lineHeight: 1,
              padding: "0 2px",
              flexShrink: 0,
              fontFamily: S.fontMono,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "6px 10px",
          borderBottom: `1px solid ${S.soft}`,
          background: S.bgDeep,
          flexShrink: 0,
        }}
      >
        {MODULE_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={tabStyle(activeTab === tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Body - activity feed */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div style={{ padding: "8px 12px" }}>
            <EmptyState type="loading" message="Loading activity..." />
          </div>
        )}

        {!loading && forbidden && (
          <div style={{ padding: "8px 12px" }}>
            <EmptyState type="error" title="Insufficient permissions" message="Requires audit.view_branch permission." />
          </div>
        )}

        {!loading && !forbidden && error && (
          <div style={{ padding: "8px 12px" }}>
            <EmptyState type="error" title="Error loading activity" message="Unable to load team activity." />
          </div>
        )}

        {!loading && !forbidden && !error && filtered.length === 0 && (
          <div style={{ padding: "8px 12px" }}>
            <EmptyState
              type="empty"
              title="No recent activity"
              message="Team actions will be logged here as users interact with the platform."
            />
          </div>
        )}

        {!loading && !forbidden && !error && filtered.length > 0 && (
          <div>
            {filtered.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderBottom: `1px solid ${S.soft}`,
                  minWidth: 0,
                }}
              >
                {/* Avatar initials */}
                <Initials name={item.user_name} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, color: S.primary, fontSize: 12 }}>
                      {item.user_name}
                    </span>
                    <span style={{ color: S.tertiary, fontSize: 11 }}>&#183;</span>
                    <span style={{ color: S.secondary, fontSize: 11 }}>
                      {item.action}
                    </span>
                  </div>
                </div>

                {/* Module chip */}
                <span style={moduleChipStyle(item.module)}>
                  {item.module}
                </span>

                {/* Relative time */}
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 9,
                    color: S.tertiary,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {relativeTime(item.ts)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}