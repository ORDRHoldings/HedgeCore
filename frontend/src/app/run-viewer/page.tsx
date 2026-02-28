"use client";

/**
 * /run-viewer — Sprint 1.3: Run Viewer + Explain Mode
 *
 * Institutional audit trail viewer for a single CalculationRun:
 *   - RunEnvelope: cryptographic hash chain (inputs, outputs, trades, policy, market)
 *   - TraceLite:  stage-by-stage narrative of what the engine did
 *   - Policy version pin: which PolicyRevision governed this run
 *
 * URL: /run-viewer?id={run_id}
 * Linked from: Position Desk RUN ID chips (click → links here instead of copy-only)
 * Used by: Risk committee audit packs, SoD review, IFRS 9 hedge documentation
 */

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../lib/authContext";
import { fetchRunDetail, listRuns } from "../../api/runsClient";
import type { RunDetailResponse, RunSummary } from "../../api/runsClient";
import type { TraceEvent } from "../../api/types";
import HelpPanel from "../../components/layout/HelpPanel";
import { RUN_VIEWER_HELP } from "../../lib/helpContent";

// ── Design tokens ──────────────────────────────────────────────────────────────
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
  pass:      "var(--status-pass,#22c55e)",
  fail:      "var(--accent-red,#ef4444)",
  purple:    "#a78bfa",
} as const;

// ── Trace step config ──────────────────────────────────────────────────────────
interface StepMeta {
  icon:    string;
  color:   string;
  phase:   string;
}

const STEP_META: Record<string, StepMeta> = {
  PARSE:    { icon: "P",  color: S.tertiary, phase: "Input Processing" },
  VALIDATE: { icon: "V",  color: S.cyan,     phase: "Risk Validation" },
  NORMALIZE:{ icon: "N",  color: S.secondary,phase: "Data Normalization" },
  KERNEL:   { icon: "K",  color: S.amber,    phase: "Hedge Computation" },
  SCENARIO: { icon: "S",  color: "#818cf8",  phase: "Scenario Analysis" },
  AUDIT:    { icon: "A",  color: S.pass,     phase: "Audit Sealing" },
};

function getStepMeta(step: string): StepMeta {
  return STEP_META[step.toUpperCase()] ?? { icon: step[0] ?? "?", color: S.secondary, phase: step };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function shortHash(h: string, n = 16): string {
  return h ? `${h.slice(0, n)}…` : "—";
}

function fmtTimestamp(ts: string): string {
  try {
    return ts.replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return ts;
  }
}

// ── Badge ──────────────────────────────────────────────────────────────────────
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontFamily:    S.fontMono,
      fontSize:      9,
      fontWeight:    700,
      letterSpacing: "0.08em",
      color,
      background:    `color-mix(in srgb, ${color} 12%, transparent)`,
      border:        `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding:       "1px 5px",
      borderRadius:  2,
    }}>
      {text}
    </span>
  );
}

// ── HashRow ────────────────────────────────────────────────────────────────────
function HashRow({ label, hash, color }: { label: string; hash: string | undefined | null; color: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!hash) return;
    navigator.clipboard?.writeText(hash).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: `1px solid ${S.soft}` }}>
      <div style={{ width: 130, flexShrink: 0 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.07em", color: S.tertiary, textTransform: "uppercase" as const }}>
          {label}
        </span>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{
          fontFamily:  S.fontMono,
          fontSize:    10,
          color,
          wordBreak:   "break-all" as const,
          letterSpacing: "0.03em",
          lineHeight:  1.5,
        }}>
          {hash ?? "—"}
        </span>
        {hash && (
          <button
            onClick={handleCopy}
            style={{
              fontFamily:   S.fontMono,
              fontSize:     8,
              fontWeight:   600,
              letterSpacing:"0.06em",
              color:        copied ? S.bgPanel : S.tertiary,
              background:   copied ? S.pass : "transparent",
              border:       `1px solid ${copied ? S.pass : S.rim}`,
              borderRadius: 2,
              padding:      "1px 5px",
              cursor:       "pointer",
              flexShrink:   0,
              transition:   "background 0.15s, color 0.15s",
            }}
          >
            {copied ? "✓" : "COPY"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── TraceStep card ─────────────────────────────────────────────────────────────
function TraceStepCard({ event, index, total }: { event: TraceEvent; index: number; total: number }) {
  const meta = getStepMeta(event.step);
  const isLast = index === total - 1;

  return (
    <div style={{ display: "flex", gap: 16, position: "relative" }}>
      {/* Connector line */}
      {!isLast && (
        <div style={{
          position:  "absolute",
          left:      15,
          top:       32,
          width:     2,
          height:    "calc(100% + 12px)",
          background: `color-mix(in srgb, ${S.rim} 60%, transparent)`,
        }} />
      )}

      {/* Icon bubble */}
      <div style={{
        width:           32,
        height:          32,
        borderRadius:    "50%",
        background:      `color-mix(in srgb, ${meta.color} 12%, transparent)`,
        border:          `1.5px solid color-mix(in srgb, ${meta.color} 35%, transparent)`,
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        fontFamily:      S.fontMono,
        fontSize:        11,
        fontWeight:      700,
        color:           meta.color,
        flexShrink:      0,
        zIndex:          1,
      }}>
        {meta.icon}
      </div>

      {/* Content */}
      <div style={{
        flex:          1,
        background:    S.bgPanel,
        border:        `1px solid ${S.rim}`,
        borderLeft:    `3px solid ${meta.color}`,
        borderRadius:  2,
        padding:       "10px 14px",
        marginBottom:  12,
      }}>
        {/* Step header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" as const }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: meta.color }}>
            {event.step}
          </span>
          <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary }}>
            {meta.phase}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
              {fmtTimestamp(event.timestamp)}
            </span>
            <span style={{
              fontFamily:   S.fontMono,
              fontSize:     9,
              color:        S.tertiary,
              border:       `1px solid ${S.soft}`,
              padding:      "0 4px",
              borderRadius: 2,
            }}>
              #{index + 1}/{total}
            </span>
          </div>
        </div>

        {/* Detail */}
        <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.primary, lineHeight: 1.5 }}>
          {event.detail}
        </div>

        {/* Additional data (if present) */}
        {event.data && Object.keys(event.data).length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{
              fontFamily:   S.fontMono,
              fontSize:     9,
              color:        S.tertiary,
              cursor:       "pointer",
              letterSpacing:"0.06em",
            }}>
              STEP DATA ({Object.keys(event.data).length} fields)
            </summary>
            <pre style={{
              fontFamily:  S.fontMono,
              fontSize:    10,
              color:       S.secondary,
              background:  S.bgDeep,
              border:      `1px solid ${S.soft}`,
              borderRadius: 2,
              padding:     "8px 12px",
              marginTop:   6,
              overflowX:   "auto",
              lineHeight:  1.6,
            }}>
              {JSON.stringify(event.data, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

// ── Main page content ──────────────────────────────────────────────────────────
function RunViewerContent() {
  const params     = useSearchParams();
  const router     = useRouter();
  const { isAuthenticated, token, isLoading: authLoading } = useAuth();

  const runId = params.get("id") ?? "";

  const [run,         setRun]         = useState<RunDetailResponse | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [renderTs,    setRenderTs]    = useState("");
  const [recentRuns,  setRecentRuns]  = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  // Hydration-safe timestamp
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch recent runs when no run ID is provided
  useEffect(() => {
    if (runId || authLoading || !isAuthenticated) return;
    setRunsLoading(true);
    listRuns(token ?? undefined, 10)
      .then(data => setRecentRuns(data.items))
      .catch(() => {/* ignore */})
      .finally(() => setRunsLoading(false));
  }, [runId, isAuthenticated, authLoading, token]);

  // Fetch run detail
  useEffect(() => {
    if (!runId || authLoading || !isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRunDetail(runId, token ?? undefined)
      .then(data => { if (!cancelled) setRun(data); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId, isAuthenticated, authLoading, token]);

  // Derived
  const events = useMemo(() => run?.trace_lite?.events ?? [], [run]);
  const envelope = run?.run_envelope ?? null;
  const runId8 = runId.slice(0, 8).toUpperCase();

  // Count stages with data
  const stagesWithData = events.filter(e => e.data && Object.keys(e.data).length > 0).length;

  if (authLoading) {
    return (
      <div style={{ background: S.bgDeep, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>AUTHENTICATING…</span>
      </div>
    );
  }

  return (
    <div style={{ background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI, color: S.primary }}>

      {/* ── Page header ── */}
      <div style={{
        height:        44,
        padding:       "0 24px",
        borderBottom:  `1px solid ${S.rim}`,
        background:    S.bgPanel,
        display:       "flex",
        alignItems:    "center",
        justifyContent:"space-between",
        flexShrink:    0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/position-desk"
            style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, textDecoration: "none", border: `1px solid ${S.rim}`, padding: "2px 8px", borderRadius: 2 }}
          >
            ← Position Desk
          </Link>
          <span style={{ color: S.soft }}>·</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
            RUN VIEWER
          </span>
          {runId && (
            <>
              <span style={{ color: S.soft }}>·</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.purple, letterSpacing: "0.06em" }}>
                {runId8}
              </span>
            </>
          )}
          {run && (
            <>
              <Badge text={`${run.trade_count} TRADES`} color={S.cyan} />
              <Badge text={`${run.hedge_count} BUCKETS`} color={S.amber} />
              <Badge text={`${events.length} STAGES`} color={S.secondary} />
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {renderTs}
          </span>
          <Link
            href="/execution-history"
            style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, textDecoration: "none", border: `1px solid ${S.rim}`, padding: "2px 8px", borderRadius: 2 }}
          >
            Data Pipeline Log →
          </Link>
        </div>
      </div>

      {/* ── No run ID: show recent runs ── */}
      {!runId && (
        <div style={{ maxWidth: 780, margin: "48px auto", padding: "0 24px" }}>
          {/* Instruction banner */}
          <div style={{
            background: S.bgPanel, border: `1px solid ${S.rim}`,
            borderLeft: `3px solid ${S.amber}`, borderRadius: 2, padding: "16px 20px",
            marginBottom: 24,
          }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.amber, marginBottom: 6 }}>
              SELECT A RUN TO INSPECT
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6 }}>
              Click a run below, or append{" "}
              <code style={{ fontFamily: S.fontMono, color: S.cyan, fontSize: 12 }}>?id=&lt;run_id&gt;</code>{" "}
              to the URL. Navigate here from the Position Desk by clicking any RUN ID chip.
            </div>
          </div>

          {/* Recent runs list */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", borderBottom: `1px solid ${S.rim}`,
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", color: S.tertiary, textTransform: "uppercase" as const,
            }}>
              Recent Runs
              <span style={{ color: S.soft }}>·</span>
              <span style={{ color: S.secondary }}>{runsLoading ? "LOADING…" : `${recentRuns.length} RUNS`}</span>
            </div>

            {runsLoading && (
              <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                Loading runs…
              </div>
            )}

            {!runsLoading && recentRuns.length === 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
                No calculation runs yet. Run the Execution Pipeline to generate your first run.
              </div>
            )}

            {!runsLoading && recentRuns.map((r, i) => (
              <Link
                key={r.run_id}
                href={`/run-viewer?id=${encodeURIComponent(r.run_id)}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 80px 180px",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderBottom: i < recentRuns.length - 1 ? `1px solid ${S.soft}` : "none",
                  textDecoration: "none",
                  background: "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = `color-mix(in srgb, ${S.cyan} 5%, transparent)`)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.purple, letterSpacing: "0.06em" }}>
                  {r.run_id.slice(0, 8).toUpperCase()}
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginLeft: 8 }}>
                    {r.run_id.slice(8, 16).toUpperCase()}…
                  </span>
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, textAlign: "right" as const }}>
                  {r.trade_count} TRADES
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.amber, textAlign: "right" as const }}>
                  {r.hedge_count} BUCKETS
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                  {r.created_at ? new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {runId && loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 24px" }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.1em" }}>
            LOADING RUN {runId8}…
          </span>
        </div>
      )}

      {/* ── Error ── */}
      {runId && !loading && error && (
        <div style={{ maxWidth: 700, margin: "40px auto", padding: "0 24px" }}>
          <div style={{
            background: S.bgPanel,
            border:     `1px solid ${S.rim}`,
            borderLeft: `3px solid ${S.fail}`,
            borderRadius: 2,
            padding:    "16px 20px",
          }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.fail, marginBottom: 6 }}>
              FAILED TO LOAD RUN
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{error}</div>
            <button
              onClick={() => { setError(null); setLoading(true); }}
              style={{
                marginTop:    12,
                fontFamily:   S.fontMono,
                fontSize:     10,
                fontWeight:   600,
                letterSpacing:"0.06em",
                color:        S.cyan,
                background:   "transparent",
                border:       `1px solid ${S.cyan}`,
                borderRadius: 2,
                padding:      "4px 12px",
                cursor:       "pointer",
              }}
            >
              RETRY
            </button>
          </div>
        </div>
      )}

      {/* ── Run data ── */}
      {runId && !loading && !error && run && (
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── Run metadata KPIs ── */}
          <div style={{
            display:    "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap:        12,
          }}>
            {[
              { label: "RUN ID",       value: runId8,                   color: S.purple,    full: runId },
              { label: "CREATED",      value: run.created_at ? fmtTimestamp(run.created_at) : "—", color: S.primary, full: null },
              { label: "TRADES",       value: String(run.trade_count),  color: S.cyan,      full: null },
              { label: "BUCKETS",      value: String(run.hedge_count),  color: S.amber,     full: null },
              { label: "TRACE STAGES", value: String(events.length),    color: S.secondary, full: null },
              { label: "EXPLAIN DATA", value: stagesWithData > 0 ? `${stagesWithData} stages` : "none", color: stagesWithData > 0 ? S.pass : S.tertiary, full: null },
            ].map(k => (
              <div key={k.label} style={{
                background: S.bgPanel,
                border:     `1px solid ${S.rim}`,
                padding:    "12px 16px",
                borderRadius: 2,
              }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 6 }}>
                  {k.label}
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: k.label === "CREATED" ? 11 : 18, fontWeight: 700, color: k.color, lineHeight: 1.2 }}>
                  {k.value}
                </div>
                {k.full && (
                  <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginTop: 3, wordBreak: "break-all" as const }}>
                    {k.full}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Two-column layout: TraceLite + Hash Chain ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>

            {/* ── LEFT: TraceLite narrative ── */}
            <div>
              <div style={{
                background:   S.bgPanel,
                border:       `1px solid ${S.rim}`,
                borderTop:    `2px solid ${S.cyan}`,
                borderRadius: 2,
                marginBottom: 0,
              }}>
                {/* Section header */}
                <div style={{
                  padding:        "10px 16px",
                  borderBottom:   `1px solid ${S.rim}`,
                  background:     S.bgSub,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
                      ED-01
                    </span>
                    <span style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.primary }}>
                      Execution Trace — Explain Mode
                    </span>
                  </div>
                  <Badge text={`${events.length} STAGES`} color={S.cyan} />
                </div>

                {/* Narrative description */}
                <div style={{
                  padding:      "10px 16px",
                  borderBottom: `1px solid ${S.soft}`,
                  background:   `color-mix(in srgb, ${S.cyan} 3%, transparent)`,
                  fontFamily:   S.fontUI,
                  fontSize:     12,
                  color:        S.secondary,
                  lineHeight:   1.6,
                }}>
                  <strong style={{ color: S.primary }}>Audit Narrative:</strong> Each stage below records what the ORDR engine performed in this run.
                  Together these stages constitute the complete deterministic audit trail for{" "}
                  <span style={{ fontFamily: S.fontMono, color: S.purple }}>{runId8}</span>.
                  {stagesWithData > 0 && (
                    <> Click{" "}
                      <span style={{ fontFamily: S.fontMono, color: S.amber, fontSize: 10 }}>STEP DATA</span>
                      {" "}on any stage to expand the raw engine payload.
                    </>
                  )}
                </div>

                {/* Trace steps */}
                <div style={{ padding: "20px 16px" }}>
                  {events.length === 0 ? (
                    <div style={{
                      textAlign:  "center",
                      padding:    "40px 0",
                      fontFamily: S.fontMono,
                      fontSize:   11,
                      color:      S.tertiary,
                      letterSpacing: "0.06em",
                    }}>
                      NO TRACE DATA FOR THIS RUN
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginTop: 6, letterSpacing: "normal" }}>
                        TraceLite data was not stored for this run (pre-Phase 0 run or storage error).
                      </div>
                    </div>
                  ) : (
                    events.map((event, i) => (
                      <TraceStepCard
                        key={`${event.step}-${i}`}
                        event={event}
                        index={i}
                        total={events.length}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ── RIGHT: Hash chain + Policy pin ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* RunEnvelope: cryptographic hash chain */}
              <div style={{
                background:   S.bgPanel,
                border:       `1px solid ${S.rim}`,
                borderTop:    `2px solid ${S.pass}`,
                borderRadius: 2,
              }}>
                <div style={{
                  padding:      "10px 16px",
                  borderBottom: `1px solid ${S.rim}`,
                  background:   S.bgSub,
                  display:      "flex",
                  alignItems:   "center",
                  gap:          8,
                }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
                    ED-02
                  </span>
                  <span style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.primary }}>
                    RunEnvelope — Hash Chain
                  </span>
                </div>

                <div style={{
                  padding:      "8px 12px",
                  borderBottom: `1px solid ${S.soft}`,
                  background:   `color-mix(in srgb, ${S.pass} 4%, transparent)`,
                  fontFamily:   S.fontUI,
                  fontSize:     11,
                  color:        S.secondary,
                  lineHeight:   1.5,
                }}>
                  SHA-256 fingerprints of each input and the output. If any input changes,
                  the run_hash changes — proving non-tampering for IFRS 9 hedge documentation.
                </div>

                <div style={{ padding: "8px 14px" }}>
                  {envelope ? (
                    <>
                      <HashRow label="run_id"       hash={envelope.run_id}       color={S.purple} />
                      <HashRow label="run_hash"      hash={run.run_hash}          color={S.pass} />
                      <HashRow label="inputs_hash"   hash={run.inputs_hash}       color={S.cyan} />
                      <HashRow label="outputs_hash"  hash={run.outputs_hash}      color={S.amber} />
                      <HashRow label="trades_hash"   hash={envelope.trades_hash}  color={S.secondary} />
                      <HashRow label="hedges_hash"   hash={envelope.hedges_hash}  color={S.secondary} />
                      <HashRow label="market_hash"   hash={envelope.market_hash}  color={S.secondary} />
                      <HashRow label="policy_hash"   hash={envelope.policy_hash}  color={S.cyan} />
                      {envelope.engine_version && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0" }}>
                          <div style={{ width: 130, flexShrink: 0 }}>
                            <span style={{ fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.07em", color: S.tertiary }}>
                              ENGINE_VER
                            </span>
                          </div>
                          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.primary }}>
                            {envelope.engine_version}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: "20px 0", textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                      No RunEnvelope stored for this run.
                    </div>
                  )}
                </div>
              </div>

              {/* Policy Version Pin */}
              <div style={{
                background:   S.bgPanel,
                border:       `1px solid ${S.rim}`,
                borderTop:    `2px solid ${S.cyan}`,
                borderRadius: 2,
              }}>
                <div style={{
                  padding:      "10px 16px",
                  borderBottom: `1px solid ${S.rim}`,
                  background:   S.bgSub,
                  display:      "flex",
                  alignItems:   "center",
                  gap:          8,
                }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
                    ED-03
                  </span>
                  <span style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.primary }}>
                    Policy Version Pin
                  </span>
                </div>

                <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {run.policy_revision_id ? (
                    <>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.5, marginBottom: 4 }}>
                        This run was computed under a pinned policy snapshot (WORM-sealed policy revision):
                      </div>
                      <HashRow label="policy_revision_id" hash={run.policy_revision_id} color={S.cyan} />
                      <HashRow label="policy_hash"        hash={run.policy_hash ?? undefined}      color={S.cyan} />
                      <div style={{
                        marginTop:    8,
                        padding:      "7px 10px",
                        background:   `color-mix(in srgb, ${S.pass} 5%, transparent)`,
                        border:       `1px solid color-mix(in srgb, ${S.pass} 20%, transparent)`,
                        borderRadius: 2,
                        fontFamily:   S.fontUI,
                        fontSize:     11,
                        color:        S.pass,
                      }}>
                        ✓ Policy config at this revision is immutable (WORM). The same policy_revision_id
                        will always produce the same canonical_policy — satisfying the audit replay requirement.
                      </div>
                    </>
                  ) : (
                    <div style={{
                      padding:    "12px 0",
                      fontFamily: S.fontUI,
                      fontSize:   12,
                      color:      S.secondary,
                      lineHeight: 1.6,
                    }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.amber, fontWeight: 700, letterSpacing: "0.06em" }}>
                        NOT PINNED
                      </span>
                      <br />
                      This run was executed before policy version pinning was activated.
                      Activate a policy and re-run to generate a pinned audit trail.
                      Future runs will reference a specific PolicyRevision WORM snapshot.
                    </div>
                  )}
                </div>
              </div>

              {/* Regulatory note */}
              <div style={{
                background:   `color-mix(in srgb, ${S.amber} 5%, transparent)`,
                border:       `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`,
                borderLeft:   `3px solid ${S.amber}`,
                borderRadius: 2,
                padding:      "12px 14px",
              }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.amber, marginBottom: 6 }}>
                  AUDIT NOTE — IFRS 9 / EMIR
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.6 }}>
                  This run record is append-only (WORM). The RunEnvelope hash chain constitutes
                  the prospective documentation trail required under IAS 39 / IFRS 9 §B6.4.
                  Retain this record per your hedge accounting policy.
                </div>
              </div>

              {/* Links */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Link
                  href="/execution"
                  style={{
                    display:       "block",
                    fontFamily:    S.fontMono,
                    fontSize:      10,
                    fontWeight:    700,
                    letterSpacing: "0.07em",
                    color:         S.bgPanel,
                    background:    S.cyan,
                    padding:       "7px 14px",
                    borderRadius:  2,
                    textDecoration:"none",
                    textAlign:     "center",
                  }}
                >
                  OPEN IN EXECUTION DESK →
                </Link>
                <Link
                  href="/audit-trail"
                  style={{
                    display:       "block",
                    fontFamily:    S.fontMono,
                    fontSize:      10,
                    fontWeight:    600,
                    letterSpacing: "0.07em",
                    color:         S.secondary,
                    background:    "transparent",
                    padding:       "6px 14px",
                    borderRadius:  2,
                    textDecoration:"none",
                    textAlign:     "center",
                    border:        `1px solid ${S.rim}`,
                  }}
                >
                  VIEW AUDIT LEDGER →
                </Link>
                <Link
                  href={`/committee-pack?id=${encodeURIComponent(runId ?? "")}`}
                  style={{
                    display:       "block",
                    fontFamily:    S.fontMono,
                    fontSize:      10,
                    fontWeight:    700,
                    letterSpacing: "0.07em",
                    color:         S.bgDeep,
                    background:    S.amber,
                    padding:       "6px 14px",
                    borderRadius:  2,
                    textDecoration:"none",
                    textAlign:     "center",
                    border:        "none",
                    marginTop:     4,
                  }}
                >
                  COMMITTEE PACK →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        height:         32,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        background:     S.bgPanel,
        borderTop:      `1px solid ${S.rim}`,
        flexShrink:     0,
      }}>
        <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.06em" }}>
          {renderTs} &middot; ORDR RUN VIEWER &middot; AUDIT TRAIL
        </span>
      </div>
    </div>
  );
}

export default function RunViewerPage() {
  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Suspense
          fallback={
            <div style={{
              padding:    "60px 24px",
              textAlign:  "center",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize:   "0.625rem",
              color:      "var(--text-tertiary)",
              letterSpacing: "0.08em",
            }}>
              LOADING RUN VIEWER…
            </div>
          }
        >
          <RunViewerContent />
        </Suspense>
      </div>
      <HelpPanel config={RUN_VIEWER_HELP} storageKey="run-viewer" />
    </div>
  );
}
