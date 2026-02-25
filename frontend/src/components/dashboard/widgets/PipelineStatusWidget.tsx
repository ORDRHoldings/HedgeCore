"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitMerge, X, ChevronRight, TrendingUp } from "lucide-react";
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
} as const;

interface PipelineData {
  sandbox: { total: number; passed: number; rejected: number };
  staging: { total: number; approved: number; pending: number };
  ledger:  { total: number; committed: number };
}

interface Props {
  token:     string;
  user:      UserContext;
  onRemove?: () => void;
}

function passRate(num: number, den: number): string {
  if (!den) return "—";
  return `${Math.round((num / den) * 100)}%`;
}

export default function PipelineStatusWidget({ token, onRemove }: Props) {
  const router = useRouter();
  const [data,    setData]    = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await dashboardFetch("/v1/dashboard/pipeline-status", token);
        if (!res.ok) throw new Error();
        const json: PipelineData = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const stages = data
    ? [
        {
          label:  "SANDBOX",
          count:  data.sandbox.total,
          sub:    `${data.sandbox.passed} passed · ${data.sandbox.rejected} rejected`,
          rate:   passRate(data.sandbox.passed, data.sandbox.total),
          color:  S.cyan,
          path:   "/sandbox",
          barPct: 100,
        },
        {
          label:  "STAGING",
          count:  data.staging.total,
          sub:    `${data.staging.approved} approved · ${data.staging.pending} pending`,
          rate:   passRate(data.staging.total, data.sandbox.total),
          color:  S.amber,
          path:   "/staging",
          barPct: data.sandbox.total > 0
            ? Math.round((data.staging.total / data.sandbox.total) * 100)
            : 0,
        },
        {
          label:  "LEDGER",
          count:  data.ledger.total,
          sub:    `${data.ledger.committed} committed`,
          rate:   passRate(data.ledger.committed, data.sandbox.total),
          color:  S.pass,
          path:   "/ledger",
          barPct: data.sandbox.total > 0
            ? Math.round((data.ledger.total / data.sandbox.total) * 100)
            : 0,
        },
      ]
    : [];

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
        <GitMerge size={12} color={S.cyan} />
        <span style={{
          fontFamily:    S.fontMono,
          fontSize:      "0.625rem",
          letterSpacing: "0.1em",
          color:         S.cyan,
          fontWeight:    700,
        }}>
          PIPELINE STATUS
        </span>
        <span style={{ flex: 1 }} />
        {data && (
          <span style={{
            fontFamily:    S.fontMono,
            fontSize:      "0.55rem",
            color:         S.pass,
            letterSpacing: "0.06em",
            display:       "flex",
            alignItems:    "center",
            gap:           3,
          }}>
            <TrendingUp size={9} />
            {passRate(data.ledger.committed, data.sandbox.total)} COMMIT RATE
          </span>
        )}
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
      <div style={{ flex: 1, padding: "10px 12px", overflow: "auto" }}>
        {loading && <EmptyState type="loading" message="Loading pipeline…" />}

        {!loading && !data && (
          <EmptyState
            type="empty"
            title="No pipeline activity"
            message="Run a simulation to see pipeline counts."
            action={{ label: "Go to Sandbox", onClick: () => router.push("/sandbox") }}
          />
        )}

        {!loading && data && (
          <>
            {/* Funnel bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {stages.map((st) => (
                <div
                  key={st.label}
                  onClick={() => router.push(st.path)}
                  style={{ cursor: "pointer" }}
                >
                  <div style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    marginBottom:   4,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        width:        7,
                        height:       7,
                        borderRadius: "50%",
                        background:   st.color,
                        display:      "inline-block",
                        flexShrink:   0,
                      }} />
                      <span style={{
                        fontFamily:    S.fontMono,
                        fontSize:      "0.6rem",
                        color:         st.color,
                        letterSpacing: "0.1em",
                        fontWeight:    700,
                      }}>
                        {st.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontFamily: S.fontMono,
                        fontSize:   "0.75rem",
                        color:      S.primary,
                        fontWeight: 700,
                      }}>
                        {st.count}
                      </span>
                      <span style={{
                        fontFamily:    S.fontMono,
                        fontSize:      "0.55rem",
                        color:         S.tertiary,
                        letterSpacing: "0.05em",
                      }}>
                        {st.rate}
                      </span>
                      <ChevronRight size={9} style={{ color: S.tertiary }} />
                    </div>
                  </div>

                  <div style={{
                    height:   6,
                    background: S.bgDeep,
                    border:   `1px solid ${S.rim}`,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height:     "100%",
                      width:      `${st.barPct}%`,
                      background: st.color,
                      opacity:    0.75,
                      transition: "width 600ms ease",
                    }} />
                  </div>

                  <div style={{
                    fontFamily:    S.fontMono,
                    fontSize:      "0.55rem",
                    color:         S.tertiary,
                    marginTop:     3,
                    letterSpacing: "0.05em",
                  }}>
                    {st.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Flow summary */}
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              gap:            6,
              padding:        "8px 4px",
              background:     S.bgDeep,
              border:         `1px solid ${S.rim}`,
            }}>
              {[
                { label: `${data.sandbox.total}`, sub: "Sandbox", color: S.cyan  },
                { label: "→",                      sub: "",        color: S.tertiary },
                { label: `${data.staging.total}`, sub: "Staging", color: S.amber },
                { label: "→",                      sub: "",        color: S.tertiary },
                { label: `${data.ledger.total}`,  sub: "Ledger",  color: S.pass  },
              ].map((item, idx) => (
                <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{
                    fontFamily: S.fontMono,
                    fontSize:   item.label === "→" ? "1rem" : "1.125rem",
                    color:      item.color,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}>
                    {item.label}
                  </span>
                  {item.sub && (
                    <span style={{
                      fontFamily:    S.fontMono,
                      fontSize:      "0.5rem",
                      color:         S.tertiary,
                      letterSpacing: "0.08em",
                      marginTop:     2,
                    }}>
                      {item.sub}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
