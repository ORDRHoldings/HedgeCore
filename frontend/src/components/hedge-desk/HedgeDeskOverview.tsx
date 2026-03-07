"use client";

/**
 * HedgeDeskOverview — Hedge Desk landing page
 *
 * Shows:
 * - Start New Run CTA (primary action)
 * - Resume Draft banner (if saved draft exists)
 * - Recent Runs list (last 5 completed/in-progress runs)
 * - Quick status badges (positions ready, pending approvals)
 */

import { useEffect, useState, useCallback } from "react";
import { PlayIcon, ClockIcon, FileTextIcon, AlertTriangleIcon, ArrowRightIcon } from "lucide-react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { loadDraft, clearDraft, draftAge, type HedgeDraft } from "@/lib/draftPersistence";
import type { UserContext } from "@/lib/authContext";

const S = {
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub)",
  bgDeep: "var(--bg-deep)",
  rim: "var(--border-rim)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  green: "var(--status-pass,#22c55e)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

interface Props {
  token: string;
  user: UserContext;
  onStartRun: () => void;
}

interface RecentRun {
  id: string;
  run_id?: string;
  status?: string;
  created_at?: string;
  position_count?: number;
}

interface QuickStats {
  positionsReady: number;
  pendingApprovals: number;
  activeHedges: number;
}

export default function HedgeDeskOverview({ token, user, onStartRun }: Props) {
  const [draft, setDraft] = useState<HedgeDraft | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [stats, setStats] = useState<QuickStats>({ positionsReady: 0, pendingApprovals: 0, activeHedges: 0 });
  const [loaded, setLoaded] = useState(false);

  const userId = user.id ?? user.email ?? "anonymous";

  // Check for saved draft
  useEffect(() => {
    const saved = loadDraft(userId);
    if (saved && saved.phase > 0) {
      setDraft(saved);
    }
  }, [userId]);

  // Fetch recent runs + quick stats
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const results = await Promise.allSettled([
        dashboardFetch("/v1/dashboard/recent-runs?limit=5", token),
        dashboardFetch("/v1/positions?status=POLICY_ASSIGNED&limit=1", token),
      ]);

      if (cancelled) return;

      // Recent runs
      if (results[0].status === "fulfilled" && results[0].value.ok) {
        try {
          const data = await results[0].value.json();
          const runs = Array.isArray(data) ? data : (data?.runs ?? data?.items ?? []);
          setRecentRuns(runs.slice(0, 5));
        } catch { /* ignore */ }
      }

      // Quick stats from positions
      if (results[1].status === "fulfilled" && results[1].value.ok) {
        try {
          const data = await results[1].value.json();
          const items = Array.isArray(data) ? data : (data?.items ?? []);
          setStats(prev => ({ ...prev, positionsReady: data?.total ?? items.length }));
        } catch { /* ignore */ }
      }

      setLoaded(true);
    }

    load();
    return () => { cancelled = true; };
  }, [token]);

  const dismissDraft = useCallback(() => {
    clearDraft(userId);
    setDraft(null);
  }, [userId]);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "32px 28px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
          HEDGE DESK
        </span>
        <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
          Start a new hedge run or resume an existing one
        </span>
      </div>

      {/* Draft Resume Banner */}
      {draft && (
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "14px 20px",
          border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`,
          background: `color-mix(in srgb, ${S.amber} 4%, ${S.bgPanel})`,
          borderRadius: 4,
        }}>
          <AlertTriangleIcon size={16} color={S.amber} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.amber }}>
              DRAFT IN PROGRESS
            </span>
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
              {draft.positionCount} position{draft.positionCount !== 1 ? "s" : ""} selected, saved {draftAge(draft)}.
              {draft.runId && (
                <> Run <span style={{ fontFamily: S.fontMono, color: S.primary }}>{draft.runId.slice(0, 8)}</span></>
              )}
            </span>
          </div>
          <button
            onClick={dismissDraft}
            style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
              color: S.tertiary, background: "transparent",
              border: `1px solid ${S.rim}`, padding: "6px 12px",
              cursor: "pointer", borderRadius: 2,
            }}
          >
            DISCARD
          </button>
          <button
            onClick={onStartRun}
            style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              color: "#fff", background: S.cyan,
              border: `1px solid ${S.cyan}`, padding: "6px 14px",
              cursor: "pointer", borderRadius: 2,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            RESUME
            <ArrowRightIcon size={12} />
          </button>
        </div>
      )}

      {/* Primary CTA — Start New Run */}
      <button
        onClick={() => {
          if (draft) {
            dismissDraft();
          }
          onStartRun();
        }}
        style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "20px 24px",
          background: `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})`,
          border: `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`,
          borderRadius: 4,
          cursor: "pointer",
          transition: "border-color 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = S.cyan)}
        onMouseLeave={e => (e.currentTarget.style.borderColor = `color-mix(in srgb, ${S.cyan} 25%, transparent)`)}
      >
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: `color-mix(in srgb, ${S.cyan} 15%, transparent)`,
          border: `1.5px solid ${S.cyan}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <PlayIcon size={16} color={S.cyan} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "left" }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.cyan }}>
            START NEW HEDGE RUN
          </span>
          <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
            Select positions, generate hedge plan, review and execute
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <ArrowRightIcon size={18} color={S.cyan} style={{ flexShrink: 0 }} />
      </button>

      {/* Quick Stats */}
      <div style={{ display: "flex", gap: 12 }}>
        <StatCard label="POSITIONS READY" value={stats.positionsReady} color={S.cyan} loaded={loaded} />
        <StatCard label="RECENT RUNS" value={recentRuns.length} color={S.green} loaded={loaded} />
      </div>

      {/* Recent Runs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
          RECENT RUNS
        </span>

        {!loaded && (
          <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>Loading...</span>
        )}

        {loaded && recentRuns.length === 0 && (
          <div style={{
            padding: "24px 20px",
            border: `1px solid ${S.rim}`,
            borderRadius: 4,
            textAlign: "center",
          }}>
            <FileTextIcon size={20} color={S.tertiary} style={{ marginBottom: 8 }} />
            <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
              No hedge runs yet. Start your first run above.
            </div>
          </div>
        )}

        {recentRuns.map((run) => {
          const runId = run.run_id ?? run.id;
          const status = run.status ?? "unknown";
          return (
            <div
              key={runId}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 16px",
                border: `1px solid ${S.rim}`,
                borderRadius: 3,
                background: S.bgPanel,
              }}
            >
              <ClockIcon size={14} color={S.tertiary} style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, flexShrink: 0 }}>
                {runId.slice(0, 8)}
              </span>
              <RunStatusBadge status={status} />
              <div style={{ flex: 1 }} />
              {run.created_at && (
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                  {formatRunDate(run.created_at)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Subcomponents ─────────────────────────────── */

function StatCard({ label, value, color, loaded }: { label: string; value: number; color: string; loaded: boolean }) {
  return (
    <div style={{
      flex: 1, padding: "14px 16px",
      border: `1px solid ${S.rim}`, borderRadius: 4,
      background: S.bgPanel,
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", color: S.tertiary }}>
        {label}
      </span>
      <span style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: loaded ? color : S.tertiary }}>
        {loaded ? value : "--"}
      </span>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase();
  let color: string = S.tertiary;
  if (upper === "COMPLETE" || upper === "HEDGED") color = S.green;
  else if (upper === "PENDING" || upper === "PROPOSED" || upper === "NEEDS_REVIEW") color = S.amber;
  else if (upper === "REJECTED" || upper === "EXCEPTION") color = "var(--status-fail,#ef4444)";
  else if (upper === "DRAFT" || upper === "IN_PROGRESS") color = S.cyan;

  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
      color, textTransform: "uppercase",
      background: `color-mix(in srgb, ${color} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding: "1px 6px", borderRadius: 2,
    }}>
      {upper}
    </span>
  );
}

function formatRunDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
