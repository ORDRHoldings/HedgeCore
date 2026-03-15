"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Shield, AlertTriangle } from "lucide-react";
import { dashboardFetch } from "@/lib/api/dashboardClient";

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
  red:       "var(--accent-red)",
  pass:      "var(--status-pass)",
  fail:      "var(--status-fail)",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkItem {
  id?: number;
  title: string;
  status: string;
  priority?: string;
  owner?: string;
}

interface Risk {
  id?: number;
  title: string;
  severity: string;
  status: string;
  description?: string;
}

interface FreezeEntry {
  id?: number;
  component: string;
  reason?: string;
  adr?: string;
}

interface Session {
  id?: number;
  date?: string;
  summary?: string;
  agent?: string;
}

interface Validation {
  id?: number;
  label?: string;
  result: string;
  run_at?: string;
  notes?: string;
}

interface Decision {
  id?: number;
  title: string;
  status: string;
  context?: string;
}

interface DevOpsData {
  memory_db_available: boolean;
  sprint: string | null;
  risks: Risk[];
  sessions: Session[];
  freeze: FreezeEntry[];
  decisions: Decision[];
  validations: Validation[];
  file_facts_count: number;
  work_items: WorkItem[];
}

// ---------------------------------------------------------------------------
// SectionCard helper
// ---------------------------------------------------------------------------

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
      marginBottom: 16, overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 14px", borderBottom: `1px solid ${S.rim}`,
        background: S.bgSub,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.cyan, letterSpacing: "0.08em" }}>
          {title}
        </span>
      </div>
      <div style={{ padding: "12px 14px" }}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: string }) {
  const upper = severity.toUpperCase();
  let color: string = S.tertiary;
  if (upper === "CRITICAL") color = S.fail;
  else if (upper === "HIGH") color = S.amber;
  else if (upper === "MEDIUM") color = S.amber;
  else if (upper === "LOW") color = S.cyan;

  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 9, padding: "2px 6px",
      borderRadius: 3, border: `1px solid ${color}`, color,
      letterSpacing: "0.08em", flexShrink: 0,
    }}>
      {upper}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase();
  let color: string = S.tertiary;
  if (upper === "DONE" || upper === "PASS" || upper === "PASSED") color = S.pass;
  else if (upper === "BLOCKED" || upper === "FAIL" || upper === "FAILED") color = S.fail;
  else if (upper === "IN_PROGRESS" || upper === "PARTIAL") color = S.amber;
  else if (upper === "OPEN") color = S.cyan;

  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 9, padding: "2px 6px",
      borderRadius: 3, border: `1px solid ${color}`, color,
      letterSpacing: "0.08em", flexShrink: 0,
    }}>
      {upper.replace(/_/g, " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sprint section helpers
// ---------------------------------------------------------------------------

function parseSprint(raw: string | null): {
  name: string;
  open: number; in_progress: number; done: number; blocked: number;
} {
  const defaults = { name: "CURRENT SPRINT", open: 0, in_progress: 0, done: 0, blocked: 0 };
  if (!raw) return defaults;
  // Try to extract sprint name from first heading line
  const lines = raw.split("\n");
  const heading = lines.find(l => l.startsWith("#"));
  const name = heading ? heading.replace(/^#+\s*/, "").trim() : "CURRENT SPRINT";
  return { ...defaults, name };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DevOpsTab({ token }: { token: string }) {
  const [data, setData] = useState<DevOpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await dashboardFetch("/v1/devops/status", token);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const json: DevOpsData = await res.json();
      setData(json);
      setLastRefresh(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading) {
    return (
      <div style={{ padding: 24, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
        LOADING DEVOPS STATE...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: S.fontMono, fontSize: 12, color: S.fail, display: "flex", alignItems: "center", gap: 8 }}>
        <AlertTriangle size={14} />
        DEVOPS UNAVAILABLE: {error}
      </div>
    );
  }

  if (!data) return null;

  const sprint = parseSprint(data.sprint);

  // Work item counters
  const allWorkItems = data.work_items ?? [];
  const openCount = allWorkItems.filter(w => w.status === "open").length;
  const inProgressCount = allWorkItems.filter(w => w.status === "in_progress").length;
  const blockedCount = allWorkItems.filter(w => w.status === "blocked").length;
  // done items are filtered out by backend (status != 'done'), so we read from sprint text or show 0
  const doneCount = 0;
  const total = openCount + inProgressCount + blockedCount + doneCount;
  const donePercent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.primary }}>
      {/* Header bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${S.rim}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={14} color={S.cyan} />
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, letterSpacing: "0.08em" }}>
            DEVOPS / CLAUDE OS STATE
          </span>
          {!data.memory_db_available && (
            <span style={{
              fontFamily: S.fontMono, fontSize: 9, padding: "2px 8px",
              background: S.bgSub, border: `1px solid ${S.amber}`, borderRadius: 3,
              color: S.amber,
            }}>
              MEMORY DB UNAVAILABLE
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastRefresh && (
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
              refreshed {lastRefresh}
            </span>
          )}
          <button
            onClick={fetchData}
            style={{
              background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 4,
              color: S.secondary, cursor: "pointer", padding: "4px 8px",
              display: "flex", alignItems: "center", gap: 4, fontSize: 11,
              fontFamily: S.fontMono,
            }}
          >
            <RefreshCw size={11} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Sprint section */}
      <SectionCard title="SPRINT">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 13, color: S.primary, fontWeight: 600, marginBottom: 8 }}>
            {sprint.name}
          </div>
          {/* Counters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            {[
              { label: "OPEN", value: openCount, color: S.cyan },
              { label: "IN PROGRESS", value: inProgressCount, color: S.amber },
              { label: "DONE", value: doneCount, color: S.pass },
              { label: "BLOCKED", value: blockedCount, color: S.fail },
            ].map(c => (
              <div key={c.label} style={{
                background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 4,
                padding: "6px 12px", textAlign: "center",
              }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>
                  {c.label}
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 18, color: c.color, fontWeight: 700 }}>
                  {c.value}
                </div>
              </div>
            ))}
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: S.bgSub, borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${donePercent}%`,
              background: S.pass, borderRadius: 2, transition: "width 0.4s",
            }} />
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4 }}>
            {donePercent}% complete ({doneCount}/{total > 0 ? total : "?"})
          </div>
        </div>

        {/* Work items list */}
        {allWorkItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
            {allWorkItems.map((item, i) => (
              <div key={item.id ?? i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "4px 8px", background: S.bgSub, borderRadius: 3,
                borderLeft: `3px solid ${
                  item.status === "blocked" ? S.fail
                  : item.status === "in_progress" ? S.amber
                  : S.rim
                }`,
              }}>
                <StatusBadge status={item.status} />
                <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, flex: 1 }}>
                  {item.title}
                </span>
                {item.priority && (
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                    {item.priority.toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Risk Heat Map */}
      {data.risks.length > 0 && (
        <SectionCard title="RISK HEAT MAP">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.risks.map((risk, i) => (
              <div key={risk.id ?? i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "8px 10px", background: S.bgSub, borderRadius: 4,
                borderLeft: `3px solid ${
                  risk.severity?.toUpperCase() === "CRITICAL" ? S.fail
                  : risk.severity?.toUpperCase() === "HIGH" ? S.amber
                  : risk.severity?.toUpperCase() === "MEDIUM" ? S.amber
                  : S.cyan
                }`,
              }}>
                <SeverityBadge severity={risk.severity ?? "LOW"} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, fontWeight: 600 }}>
                    {risk.title}
                  </div>
                  {risk.description && (
                    <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 2 }}>
                      {risk.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Architecture Freeze */}
      {data.freeze.length > 0 && (
        <SectionCard title="ARCHITECTURE FREEZE">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.freeze.map((entry, i) => (
              <span key={entry.id ?? i} style={{
                fontFamily: S.fontMono, fontSize: 10, padding: "3px 10px",
                borderRadius: 3, border: `1px solid ${S.amber}`, color: S.amber,
                background: S.bgSub,
              }} title={entry.reason ?? undefined}>
                {entry.component}
                {entry.adr && (
                  <span style={{ color: S.tertiary, marginLeft: 6 }}>#{entry.adr}</span>
                )}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 2-column grid: Sessions + Validations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Recent Sessions */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.cyan, letterSpacing: "0.08em" }}>
              RECENT SESSIONS
            </span>
          </div>
          <div style={{ padding: "12px 14px" }}>
            {data.sessions.length === 0 ? (
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>No sessions</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.sessions.map((s, i) => (
                  <div key={s.id ?? i} style={{
                    borderBottom: `1px solid ${S.soft}`, paddingBottom: 8,
                  }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, marginBottom: 2 }}>
                      {s.date ?? `Session ${i + 1}`}
                      {s.agent && <span style={{ color: S.tertiary, marginLeft: 6 }}>{s.agent}</span>}
                    </div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>
                      {s.summary ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Validation Runs */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.cyan, letterSpacing: "0.08em" }}>
              VALIDATION RUNS
            </span>
          </div>
          <div style={{ padding: "12px 14px" }}>
            {data.validations.length === 0 ? (
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>No validation runs</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.validations.map((v, i) => (
                  <div key={v.id ?? i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "4px 8px", background: S.bgSub, borderRadius: 3,
                  }}>
                    <StatusBadge status={v.result} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                        {v.label ?? `Run ${i + 1}`}
                      </div>
                      {v.run_at && (
                        <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                          {v.run_at}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Decisions Log */}
      {data.decisions.length > 0 && (
        <SectionCard title="DECISIONS LOG">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.decisions.map((d, i) => (
              <div key={d.id ?? i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "6px 10px", background: S.bgSub, borderRadius: 4,
              }}>
                <StatusBadge status={d.status} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary }}>
                    {d.title}
                  </div>
                  {d.context && (
                    <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 2 }}>
                      {d.context}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* File Facts footer */}
      <div style={{
        fontFamily: S.fontMono, fontSize: 10, color: S.tertiary,
        padding: "8px 0", borderTop: `1px solid ${S.rim}`,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>FILE FACTS INDEXED:</span>
        <span style={{ color: S.cyan }}>{data.file_facts_count}</span>
        <span style={{ marginLeft: 8 }}>
          MEMORY DB: {data.memory_db_available ? (
            <span style={{ color: S.pass }}>ONLINE</span>
          ) : (
            <span style={{ color: S.fail }}>OFFLINE</span>
          )}
        </span>
      </div>
    </div>
  );
}
