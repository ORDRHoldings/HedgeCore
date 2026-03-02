"use client";

/**
 * SmbRecentActivity — compact audit/activity feed for SMB dashboard.
 */
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel: "var(--bg-panel)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
} as const;

interface Props {
  token: string;
}

interface ActivityItem {
  id: string;
  time: string;
  actor: string;
  action: string;
  detail: string;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function SmbRecentActivity({ token }: Props) {
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    Promise.all([
      dashboardFetch("/v1/dashboard/recent-runs", token).then((r) => (r.ok ? r.json() : [])),
      dashboardFetch("/v1/dashboard/team-activity", token).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([runs, activity]) => {
        const runItems: ActivityItem[] = (Array.isArray(runs) ? runs : runs?.items ?? [])
          .slice(0, 3)
          .map((r: Record<string, string>, i: number) => ({
            id: `run-${i}`,
            time: r.created_at ?? r.timestamp ?? new Date().toISOString(),
            actor: r.submitted_by ?? r.actor ?? "System",
            action: "calculation",
            detail: r.status ? `Calc → ${r.status}` : "Calculation completed",
          }));

        const actItems: ActivityItem[] = (Array.isArray(activity) ? activity : activity?.items ?? [])
          .slice(0, 3)
          .map((a: Record<string, string>, i: number) => ({
            id: `act-${i}`,
            time: a.created_at ?? a.timestamp ?? new Date().toISOString(),
            actor: a.actor_email ?? a.user ?? "System",
            action: a.event_type ?? a.action ?? "event",
            detail: a.description ?? a.message ?? "",
          }));

        const merged = [...runItems, ...actItems]
          .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
          .slice(0, 5);

        setItems(merged);
      })
      .catch(() => {});
  }, [token]);

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 2,
        padding: "20px 24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Clock size={14} color={S.cyan} />
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: S.tertiary,
            textTransform: "uppercase",
          }}
        >
          Recent Activity
        </span>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            fontFamily: S.fontUI,
            fontSize: 13,
            color: S.tertiary,
            padding: "24px 0",
            textAlign: "center",
          }}
        >
          No recent activity yet. Add positions and run calculations to see activity here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                padding: "8px 0",
                borderBottom: `1px solid ${S.soft}`,
              }}
            >
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  color: S.tertiary,
                  minWidth: 60,
                  flexShrink: 0,
                }}
              >
                {timeAgo(item.time)}
              </span>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 600,
                  color: S.secondary,
                  minWidth: 70,
                  flexShrink: 0,
                }}
              >
                {item.actor.split("@")[0]}
              </span>
              <span
                style={{
                  fontFamily: S.fontUI,
                  fontSize: 12,
                  color: S.primary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
