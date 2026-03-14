"use client";

/**
 * DevOps Console — Claude Code Operating System State
 *
 * Superuser-only dashboard displaying sprint progress, risk heat map,
 * architecture freeze status, session rollups, decisions, validation
 * runs, and file activity from the memory database.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { Cpu, Shield, AlertTriangle, Clock, GitBranch, CheckCircle, FileText, Monitor } from "lucide-react"

import { PageShell } from "@/components/layout/PageShell";

// ── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  fontUI:   "'IBM Plex Sans', var(--font-terminal, sans-serif)",
  fontMono: "'IBM Plex Mono', var(--font-terminal-mono, monospace)",
  bgDeep:    "#0A0E1A",
  bgPanel:   "#111827",
  bgCard:    "#1A2236",
  bgCardAlt: "#151D2E",
  bgHover:   "#1E293B",
  border:    "#1E293B",
  text:      "#E2E8F0",
  textDim:   "#94A3B8",
  textFaint: "#475569",
  textWhite: "#F8FAFC",
  green:     "#10B981",
  greenDim:  "rgba(16,185,129,0.12)",
  amber:     "#F59E0B",
  amberDim:  "rgba(245,158,11,0.12)",
  red:       "#EF4444",
  redDim:    "rgba(239,68,68,0.12)",
  blue:      "#3B82F6",
  blueDim:   "rgba(59,130,246,0.12)",
  blueGlow:  "rgba(59,130,246,0.30)",
  cyan:      "#06B6D4",
  cyanDim:   "rgba(6,182,212,0.10)",
  yellow:    "#EAB308",
  yellowDim: "rgba(234,179,8,0.12)",
} as const;

// ── Types ────────────────────────────────────────────────────────────────────
interface SprintProgress {
  sprint_name: string;
  open: number;
  in_progress: number;
  done: number;
  blocked: number;
}

interface RiskItem {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  text: string;
  mitigation: string;
}

interface FrozenComponent {
  component: string;
  frozen_at: string;
  adr: string;
}

interface SessionRollup {
  date: string;
  summary: string;
}

interface Decision {
  date: string;
  title: string;
  status: string;
}

interface ValidationRun {
  run_type: string;
  result: "PASS" | "FAIL";
  date: string;
}

interface DevOpsStatus {
  memory_db_available: boolean;
  sprint?: SprintProgress;
  risks?: RiskItem[];
  architecture_freeze?: FrozenComponent[];
  session_rollups?: SessionRollup[];
  decisions?: Decision[];
  validation_runs?: ValidationRun[];
  file_facts_count?: number;
}

// ── Risk color helper ────────────────────────────────────────────────────────
function riskColor(severity: string): { fg: string; bg: string } {
  switch (severity) {
    case "CRITICAL": return { fg: T.red, bg: T.redDim };
    case "HIGH":     return { fg: T.amber, bg: T.amberDim };
    case "MEDIUM":   return { fg: T.yellow, bg: T.yellowDim };
    case "LOW":      return { fg: T.cyan, bg: T.cyanDim };
    default:         return { fg: T.textDim, bg: "transparent" };
  }
}

// ── Section Card ─────────────────────────────────────────────────────────────
function Section({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: T.bgPanel,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderBottom: `1px solid ${T.border}`,
        background: T.bgCardAlt,
      }}>
        {icon}
        <span style={{
          fontFamily: T.fontMono,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: T.textDim,
          textTransform: "uppercase",
        }}>
          {title}
        </span>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function DevOpsPage() {
  const { user, token, isAuthenticated } = useAuth();
  const [data, setData] = useState<DevOpsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    if (!user?.is_superuser) return;
    try {
      const res = await dashboardFetch("/v1/devops/status", token);
      if (!res.ok) {
        setError(`HTTP ${res.status}: ${res.statusText}`);
        setData(null);
      } else {
        setData(await res.json());
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setData(null);
    }
    setLoading(false);
    setLastRefresh(new Date());
  }, [token, user?.is_superuser]);

  useEffect(() => {
    fetchData();
    timer.current = setInterval(fetchData, 30_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [fetchData]);

  // ── Auth gates ──
  if (!isAuthenticated || !user) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bgDeep, color: T.textDim, fontFamily: T.fontMono }}>
        Not authenticated
      </div>
    );
  }

  if (!user.is_superuser) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bgDeep, color: T.red, fontFamily: T.fontMono, flexDirection: "column", gap: 12 }}>
        <Shield size={40} style={{ opacity: 0.3 }} />
        <span style={{ fontSize: 13, letterSpacing: "0.1em" }}>SUPERUSER ACCESS REQUIRED</span>
      </div>
    );
  }

  // ── Sprint helpers ──
  const sprint = data?.sprint;
  const sprintTotal = sprint ? sprint.open + sprint.in_progress + sprint.done + sprint.blocked : 0;
  const sprintPct = sprintTotal > 0 && sprint ? Math.round((sprint.done / sprintTotal) * 100) : 0;

  const iconStyle = { color: T.textDim, flexShrink: 0 } as const;
  const mono11: React.CSSProperties = { fontFamily: T.fontMono, fontSize: 12, color: T.text };
  const mono10dim: React.CSSProperties = { fontFamily: T.fontMono, fontSize: 12, color: T.textFaint };
  const thStyle: React.CSSProperties = {
    fontFamily: T.fontMono, fontSize: 12, fontWeight: 600,
    letterSpacing: "0.1em", color: T.textFaint, textTransform: "uppercase",
    textAlign: "left", padding: "6px 0", borderBottom: `1px solid ${T.border}`,
  };
  const tdStyle: React.CSSProperties = {
    fontFamily: T.fontMono, fontSize: 12, color: T.text,
    padding: "6px 0", borderBottom: `1px solid ${T.border}`,
  };

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .devops-row:hover { background: ${T.bgHover} !important; }
      `}</style>

      <PageShell icon={Monitor} title="DevOps Console" breadcrumb={["Dashboard","DevOps"]}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 32px", borderBottom: `1px solid ${T.border}`,
          background: "rgba(17,24,39,0.95)", backdropFilter: "blur(12px)",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: `linear-gradient(135deg, ${T.blue} 0%, #6366F1 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 2px 12px ${T.blueGlow}`,
            }}>
              <Cpu size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontFamily: T.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: "0.16em", color: T.textWhite }}>
                DEVOPS CONSOLE
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 500, letterSpacing: "0.2em", color: T.textFaint, marginTop: 1 }}>
                CLAUDE CODE OPERATING STATE
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={mono10dim}>{lastRefresh.toLocaleTimeString()}</span>
            <button onClick={() => { setLoading(true); fetchData(); }} style={{
              fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
              color: T.blue, background: T.blueDim, border: `1px solid rgba(59,130,246,0.2)`,
              borderRadius: 6, padding: "6px 14px", cursor: "pointer",
            }}>
              {loading ? "LOADING..." : "REFRESH"}
            </button>
          </div>
        </div>

        {/* Main content */}
        <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto", animation: "fadeIn 300ms ease-out" }}>

          {/* Memory DB banner */}
          {data && !data.memory_db_available && (
            <div style={{
              background: T.amberDim, border: `1px solid rgba(245,158,11,0.3)`,
              borderRadius: 8, padding: "12px 20px", marginBottom: 20,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <AlertTriangle size={16} color={T.amber} />
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.amber }}>
                Memory database not initialized. Run session_start hook first.
              </span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div style={{
              background: T.redDim, border: `1px solid rgba(239,68,68,0.3)`,
              borderRadius: 8, padding: "12px 20px", marginBottom: 20,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <AlertTriangle size={16} color={T.red} />
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.red }}>{error}</span>
            </div>
          )}

          {/* Loading state */}
          {loading && !data && (
            <div style={{ textAlign: "center", padding: 80, color: T.textFaint, fontFamily: T.fontMono, fontSize: 13 }}>
              Loading DevOps state...
            </div>
          )}

          {/* Grid layout */}
          {data && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Sprint Progress */}
              <Section title="Sprint Progress" icon={<GitBranch size={14} style={iconStyle} />}>
                {sprint ? (
                  <>
                    <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.textWhite, marginBottom: 12 }}>
                      {sprint.sprint_name}
                    </div>
                    <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
                      {([
                        ["OPEN", sprint.open, T.textDim],
                        ["IN PROGRESS", sprint.in_progress, T.blue],
                        ["DONE", sprint.done, T.green],
                        ["BLOCKED", sprint.blocked, T.red],
                      ] as const).map(([label, count, color]) => (
                        <div key={label} style={{ textAlign: "center" }}>
                          <div style={{ fontFamily: T.fontMono, fontSize: 20, fontWeight: 700, color }}>{count}</div>
                          <div style={{ fontFamily: T.fontMono, fontSize: 12, letterSpacing: "0.08em", color: T.textFaint }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: T.bgCard, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${sprintPct}%`, borderRadius: 4, background: `linear-gradient(90deg, ${T.blue}, ${T.green})`, transition: "width 500ms" }} />
                    </div>
                    <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint, marginTop: 6, textAlign: "right" }}>
                      {sprintPct}% complete
                    </div>
                  </>
                ) : (
                  <div style={mono10dim}>No sprint data</div>
                )}
              </Section>

              {/* Risk Heat Map */}
              <Section title="Risk Heat Map" icon={<AlertTriangle size={14} style={iconStyle} />}>
                {data.risks && data.risks.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.risks.map((r, i) => {
                      const c = riskColor(r.severity);
                      return (
                        <div key={i} style={{
                          background: c.bg, border: `1px solid ${c.fg}33`,
                          borderRadius: 6, padding: "10px 14px",
                          borderLeft: `3px solid ${c.fg}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{
                              fontFamily: T.fontMono, fontSize: 12, fontWeight: 700,
                              letterSpacing: "0.08em", color: c.fg,
                              background: `${c.fg}22`, padding: "1px 6px", borderRadius: 3,
                            }}>
                              {r.severity}
                            </span>
                          </div>
                          <div style={{ ...mono11, marginBottom: 4 }}>{r.text}</div>
                          <div style={{ fontFamily: T.fontUI, fontSize: 12, color: T.textDim }}>
                            Mitigation: {r.mitigation}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={mono10dim}>No active risks</div>
                )}
              </Section>

              {/* Architecture Freeze */}
              <Section title="Architecture Freeze" icon={<Shield size={14} style={iconStyle} />}>
                {data.architecture_freeze && data.architecture_freeze.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Component</th>
                        <th style={thStyle}>Frozen</th>
                        <th style={thStyle}>ADR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.architecture_freeze.map((f, i) => (
                        <tr key={i} className="devops-row">
                          <td style={tdStyle}>{f.component}</td>
                          <td style={{ ...tdStyle, color: T.textDim, fontSize: 12 }}>{f.frozen_at}</td>
                          <td style={{ ...tdStyle, color: T.cyan, fontSize: 12 }}>{f.adr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={mono10dim}>No frozen components</div>
                )}
              </Section>

              {/* Recent Sessions */}
              <Section title="Recent Sessions" icon={<Clock size={14} style={iconStyle} />}>
                {data.session_rollups && data.session_rollups.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${T.border} transparent` }}>
                    {[...data.session_rollups]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((s, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                          <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textDim, whiteSpace: "nowrap", flexShrink: 0, minWidth: 80 }}>
                            {s.date}
                          </span>
                          <span style={{ ...mono11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.summary.length > 100 ? s.summary.slice(0, 100) + "..." : s.summary}
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div style={mono10dim}>No session data</div>
                )}
              </Section>

              {/* Decisions Log */}
              <Section title="Decisions Log" icon={<CheckCircle size={14} style={iconStyle} />}>
                {data.decisions && data.decisions.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Title</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.decisions.map((d, i) => (
                        <tr key={i} className="devops-row">
                          <td style={{ ...tdStyle, color: T.textDim, fontSize: 12, whiteSpace: "nowrap" }}>{d.date}</td>
                          <td style={tdStyle}>{d.title}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <span style={{
                              fontFamily: T.fontMono, fontSize: 12, fontWeight: 600,
                              color: d.status === "accepted" ? T.green : d.status === "rejected" ? T.red : T.amber,
                              background: d.status === "accepted" ? T.greenDim : d.status === "rejected" ? T.redDim : T.amberDim,
                              padding: "2px 6px", borderRadius: 3, textTransform: "uppercase",
                            }}>
                              {d.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={mono10dim}>No decisions recorded</div>
                )}
              </Section>

              {/* Validation Runs */}
              <Section title="Validation Runs" icon={<CheckCircle size={14} style={iconStyle} />}>
                {data.validation_runs && data.validation_runs.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Run Type</th>
                        <th style={thStyle}>Result</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.validation_runs.map((v, i) => (
                        <tr key={i} className="devops-row">
                          <td style={tdStyle}>{v.run_type}</td>
                          <td style={tdStyle}>
                            <span style={{
                              fontFamily: T.fontMono, fontSize: 12, fontWeight: 700,
                              color: v.result === "PASS" ? T.green : T.red,
                              background: v.result === "PASS" ? T.greenDim : T.redDim,
                              padding: "2px 6px", borderRadius: 3,
                            }}>
                              {v.result}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", color: T.textDim, fontSize: 12 }}>{v.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={mono10dim}>No validation runs</div>
                )}
              </Section>

              {/* File Activity — full width */}
              <div style={{ gridColumn: "1 / -1" }}>
                <Section title="File Activity" icon={<FileText size={14} style={iconStyle} />}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ fontFamily: T.fontMono, fontSize: 32, fontWeight: 700, color: T.cyan }}>
                      {data.file_facts_count ?? 0}
                    </div>
                    <div>
                      <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.text }}>Tracked Files</div>
                      <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint }}>
                        Files with recorded facts in the memory database
                      </div>
                    </div>
                  </div>
                </Section>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 0", marginTop: 24,
          }}>
            <span style={mono10dim}>Auto-refresh every 30s</span>
            <span style={mono10dim}>Logged in as {user.email}</span>
          </div>
        </div>
      </PageShell>
    </>
  );
}
