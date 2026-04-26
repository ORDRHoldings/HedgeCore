"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, X, ArrowRight } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import type { UserContext } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:  "var(--bg-panel)",
  bgDeep:   "var(--bg-deep)",
  rim:      "var(--border-rim)",
  primary:  "var(--text-primary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan,#22d3ee)",
  amber:    "var(--accent-amber,#f59e0b)",
  pass:     "var(--status-pass,#34d399)",
  fail:     "var(--accent-red,#f87171)",
} as const;

interface BranchRow {
  branch_id:          string;
  branch_name:        string;
  currency:           string;
  total_exposure_usd: number;
  hedge_coverage_pct: number;
  active_proposals:   number;
  pending_approvals:  number;
}

interface Props {
  token:     string;
  user:      UserContext;
  onRemove?: () => void;
}

function fmtM(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function coverageColor(pct: number): string {
  if (pct >= 70) return S.pass;
  if (pct >= 50) return S.amber;
  return S.fail;
}

export default function BranchComparisonWidget({ token, onRemove }: Props) {
  const router  = useRouter();
  const [data,    setData]    = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState<"exposure" | "coverage">("exposure");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await dashboardFetch("/v1/dashboard/branch-comparison", token);
        if (!res.ok) throw new Error();
        const json = await res.json() as { branches?: BranchRow[] };
        if (!cancelled) setData(json.branches ?? []);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const maxExposure = data.length > 0
    ? Math.max(...data.map((b) => b.total_exposure_usd))
    : 1;

  const sorted = view === "exposure"
    ? [...data].sort((a, b) => b.total_exposure_usd - a.total_exposure_usd)
    : [...data].sort((a, b) => b.hedge_coverage_pct - a.hedge_coverage_pct);

  return (
    <div style={{
      background:    S.bgPanel,
      border:        `1px solid ${S.rim}`,
      borderRadius:  4,
      display:       "flex",
      flexDirection: "column",
      overflow:      "hidden",
      height:        "100%",
    }}>
      {/* Header / drag handle */}
      <div
        className="widget-drag-handle"
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          6,
          padding:      "6px 10px",
          borderBottom: `1px solid ${S.rim}`,
          background:   S.bgDeep,
          flexShrink:   0,
          cursor:       "grab",
        }}
      >
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }}>⠿</span>
        <GitBranch size={12} color={S.cyan} />
        <span style={{
          fontFamily:    S.fontMono,
          fontSize:      "0.75rem",
          letterSpacing: "0.1em",
          color:         S.cyan,
          fontWeight:    700,
        }}>
          BRANCH COMPARISON
        </span>
        <span style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 2 }}>
          {(["exposure", "coverage"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                fontFamily:    S.fontMono,
                fontSize:      "0.75rem",
                letterSpacing: "0.08em",
                color:         view === v ? S.bgDeep : S.tertiary,
                background:    view === v ? S.cyan : "transparent",
                border:        `1px solid ${view === v ? S.cyan : S.rim}`,
                padding:       "2px 6px",
                cursor:        "pointer",
                textTransform: "uppercase",
              }}
            >
              {v === "exposure" ? "Exposure" : "Coverage"}
            </button>
          ))}
        </div>

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
              marginLeft: 4,
            }}
            title="Remove widget"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "10px 12px" }}>
        {loading && <EmptyState type="loading" message="Loading branch data…" />}

        {!loading && data.length === 0 && (
          <EmptyState
            type="empty"
            title="No branch data"
            message="Branch comparison requires multi-branch setup. Available to admin and supervisor roles."
            action={{ label: "Go to Settings", onClick: () => router.push("/settings") }}
          />
        )}

        {!loading && sorted.length > 0 && (
          <>
            <div style={{
              display:             "grid",
              gridTemplateColumns: "1fr 80px 40px",
              gap:                 6,
              marginBottom:        8,
              paddingBottom:       5,
              borderBottom:        `1px solid ${S.rim}`,
            }}>
              {["Branch", view === "exposure" ? "Exposure" : "Coverage", ""].map((h) => (
                <span key={h} style={{
                  fontFamily:    S.fontMono,
                  fontSize:      "0.75rem",
                  color:         S.tertiary,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}>
                  {h}
                </span>
              ))}
            </div>

            {sorted.map((branch) => {
              const barW     = view === "exposure"
                ? (branch.total_exposure_usd / maxExposure) * 100
                : branch.hedge_coverage_pct;
              const barColor = view === "exposure" ? S.cyan : coverageColor(branch.hedge_coverage_pct);
              const valueStr = view === "exposure"
                ? fmtM(branch.total_exposure_usd)
                : `${branch.hedge_coverage_pct}%`;

              return (
                <div key={branch.branch_id} style={{ marginBottom: 10 }}>
                  <div style={{
                    display:             "grid",
                    gridTemplateColumns: "1fr 80px 40px",
                    gap:                 6,
                    alignItems:          "center",
                    marginBottom:        3,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: barColor, display: "inline-block", flexShrink: 0,
                      }} />
                      <span style={{
                        fontFamily: S.fontMono, fontSize: "0.75rem", color: S.primary,
                        fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {branch.branch_name}
                      </span>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: "0.75rem",
                        color: S.tertiary, letterSpacing: "0.06em", flexShrink: 0,
                      }}>
                        {branch.currency}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: "0.75rem",
                      color: barColor, fontWeight: 700, textAlign: "right",
                    }}>
                      {valueStr}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, textAlign: "right" }}>
                      {branch.pending_approvals > 0 && (
                        <span style={{ color: S.amber }}>{branch.pending_approvals}⚑</span>
                      )}
                    </span>
                  </div>

                  <div style={{ height: 5, background: S.bgDeep, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${barW}%`,
                      background: barColor, opacity: 0.75, transition: "width 500ms ease",
                    }} />
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => router.push("/portfolio-risk")}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: S.fontMono, fontSize: "0.75rem", color: S.cyan, padding: 0,
                }}
              >
                Full Portfolio Risk <ArrowRight size={9} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
