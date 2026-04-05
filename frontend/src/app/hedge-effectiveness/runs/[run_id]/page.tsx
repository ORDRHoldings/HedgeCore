"use client";

/**
 * /hedge-effectiveness/runs/[run_id] — Assessment Detail Page
 *
 * Bloomberg-grade IFRS 9 / ASC 815 effectiveness test results:
 *   - Executive verdict banner with animated KPI tiles
 *   - Interactive ECharts cumulative ratio line with effective band
 *   - Period-by-period grouped bar chart (hedged vs instrument)
 *   - Gauge arc for dollar-offset ratio
 *   - Regression scatter plot with fitted line
 *   - Compliance evidence panel with hash chain
 *   - Full trace timeline
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import dynamic from "next/dynamic";

import { Download, FileCode2 } from "lucide-react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ── Design Tokens ─────────────────────────────────────────────────────────
const S = {
  mono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  deep: "var(--bg-deep)",
  panel: "var(--bg-panel)",
  sub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  text1: "var(--text-primary)",
  text2: "var(--text-secondary)",
  text3: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  green: "var(--status-pass,#059669)",
  red: "var(--accent-red,#DC2626)",
  amber: "var(--accent-amber,#D97706)",
} as const;

// ECharts needs hex values, not CSS vars
const HEX = {
  cyan: "#1C62F2",
  cyanLight: "#3B82F6",
  cyanDim: "#1E40AF",
  green: "#059669",
  greenLight: "#10B981",
  greenBg: "#ECFDF5",
  greenBorder: "#A7F3D0",
  red: "#DC2626",
  redLight: "#F87171",
  redBg: "#FEF2F2",
  redBorder: "#FECACA",
  amber: "#D97706",
  amberLight: "#F59E0B",
  text1: "#0F172A",
  text2: "#334155",
  text3: "#94A3B8",
  border: "#E2E8F0",
  bgDeep: "#F8FAFC",
  bgPanel: "#FFFFFF",
  bgSub: "#F1F5F9",
  bandGreen: "rgba(5,150,105,0.08)",
  bandGreenStroke: "rgba(5,150,105,0.25)",
} as const;

// ── Interfaces ────────────────────────────────────────────────────────────

interface PeriodData {
  period_index: number;
  period_date: string | null;
  hedged_item_fv_change: number;
  instrument_fv_change: number;
  cumulative_hedged: number;
  cumulative_instrument: number;
  period_ratio: number | null;
  cumulative_ratio: number | null;
}

interface RunDetail {
  run_id: string;
  dataset_id: string;
  dataset_name: string;
  currency_pair: string | null;
  hedge_type: string;
  designation_date: string | null;
  period_count: number;
  methodology_version: string;
  standard: string;
  method_requested: string;
  dollar_offset_ratio: number | null;
  dollar_offset_effective: boolean | null;
  regression_r_squared: number | null;
  regression_slope: number | null;
  regression_effective: boolean | null;
  regression_method: string | null;
  overall_effective: boolean;
  run_hash: string;
  inputs_hash: string;
  outputs_hash: string;
  status: string;
  created_at: string | null;
  report: {
    determination_narrative?: string;
    compliance_notes?: string[];
    period_analysis?: PeriodData[];
    dollar_offset?: {
      dollar_offset_ratio: number;
      is_effective: boolean;
      method: string;
    };
    regression?: {
      dollar_offset_ratio: number;
      is_effective: boolean;
      regression_r_squared: number | null;
      regression_slope: number | null;
      method: string;
    };
  };
  trace_bundle: { events?: Array<{ step: string; description: string; data: Record<string, unknown> }> } | null;
}

// ── Animated Counter ──────────────────────────────────────────────────────
function AnimatedNumber({ value, decimals = 4, prefix = "" }: { value: number | null; decimals?: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    if (value == null) return;
    const start = ref.current;
    const end = value;
    const duration = 800;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(current);
      ref.current = current;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value]);

  if (value == null) return <span>\u2014</span>;
  return <span>{prefix}{display.toFixed(decimals)}</span>;
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function HedgeEffectivenessRunPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const runId = params.run_id as string;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"results" | "periods" | "trace" | "compliance">("results");
  const [downloading, setDownloading] = useState<"ifrs9" | "asc815" | null>(null);
  const [allRunIds, setAllRunIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const handleXmlDownload = async (fmt: "ifrs9" | "asc815") => {
    if (!token || !runId) return;
    setDownloading(fmt);
    try {
      const endpoint = fmt === "ifrs9"
        ? `/v1/hedge-effectiveness/runs/${runId}/ifrs9-xml`
        : `/v1/hedge-effectiveness/runs/${runId}/asc815-xml`;
      const filename = fmt === "ifrs9"
        ? `ifrs9-evidence-${runId.slice(0, 8)}.xml`
        : `asc815-evidence-${runId.slice(0, 8)}.xml`;
      const res = await dashboardFetch(endpoint, token);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      // silent
    } finally {
      setDownloading(null);
    }
  };

  const load = useCallback(async () => {
    if (!token || !runId) return;
    setLoading(true);
    try {
      const [res, listRes] = await Promise.all([
        dashboardFetch(`/v1/hedge-effectiveness/runs/${runId}`, token),
        dashboardFetch("/v1/hedge-effectiveness/runs", token),
      ]);
      if (res.ok) setRun(await res.json());
      if (listRes.ok) {
        const list = await listRes.json();
        const sorted: Array<{ run_id: string; created_at: string | null }> = Array.isArray(list) ? list : [];
        sorted.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
        setAllRunIds(sorted.map((r) => r.run_id));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token, runId]);

  useEffect(() => { load(); }, [load]);

  // Keyboard navigation
  useEffect(() => {
    const currentIdx = allRunIds.indexOf(runId);
    const prevId = currentIdx > 0 ? allRunIds[currentIdx - 1] : null;
    const nextId = currentIdx !== -1 && currentIdx < allRunIds.length - 1 ? allRunIds[currentIdx + 1] : null;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && prevId) router.push(`/hedge-effectiveness/runs/${prevId}`);
      if (e.key === "ArrowRight" && nextId) router.push(`/hedge-effectiveness/runs/${nextId}`);
      if (e.key === "Escape") router.push("/hedge-effectiveness?tab=runs");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [allRunIds, runId, router]);

  if (loading) {
    return (

    
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: S.deep }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, border: `2px solid ${S.rim}`, borderTopColor: S.cyan,
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.1em" }}>
            LOADING ASSESSMENT
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    
    
    );
  }

  if (!run) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: S.deep }}>
        <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>Assessment not found.</span>
      </div>
    );
  }

  const periods = run.report?.period_analysis || [];
  const compliance = run.report?.compliance_notes || [];
  const narrative = run.report?.determination_narrative || "";
  const traces = run.trace_bundle?.events || [];

  const currentIdx = allRunIds.indexOf(runId);
  const prevRunId = currentIdx > 0 ? allRunIds[currentIdx - 1] : null;
  const nextRunId = currentIdx !== -1 && currentIdx < allRunIds.length - 1 ? allRunIds[currentIdx + 1] : null;

  const handleCopySummary = () => {
    const lines = [
      `ASSESSMENT SUMMARY`,
      `Dataset:  ${run.dataset_name}${run.currency_pair ? ` (${run.currency_pair})` : ""}`,
      `Standard: ${run.standard}`,
      `Verdict:  ${run.overall_effective ? "EFFECTIVE ✓" : "INEFFECTIVE ✗"}`,
      `D.O. Ratio: ${run.dollar_offset_ratio?.toFixed(4) ?? "N/A"}`,
      `R²:         ${run.regression_r_squared?.toFixed(4) ?? "N/A"}`,
      `Hash:       ${run.run_hash}`,
      `Date:       ${run.created_at ? new Date(run.created_at).toLocaleString() : ""}`,
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: S.deep }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, background: S.panel,
        borderBottom: `1px solid ${S.rim}`,
      }}>
        {/* Top row: back + verdict + metadata */}
        <div style={{ padding: "16px 28px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <button
              onClick={() => router.push("/hedge-effectiveness?tab=runs")}
              style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.text3,
                background: S.sub, border: `1px solid ${S.rim}`,
                padding: "4px 12px", borderRadius: 3, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = HEX.cyan; e.currentTarget.style.color = HEX.cyan; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = HEX.border; e.currentTarget.style.color = HEX.text3; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              BACK
            </button>
            {allRunIds.length > 1 && (
              <>
                <div style={{ width: 1, height: 16, background: S.soft }} />
                <button
                  onClick={() => prevRunId && router.push(`/hedge-effectiveness/runs/${prevRunId}`)}
                  disabled={!prevRunId}
                  title="Previous run"
                  style={{
                    fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: prevRunId ? S.text2 : S.text3,
                    background: S.sub, border: `1px solid ${S.rim}`,
                    padding: "4px 8px", borderRadius: 3, cursor: prevRunId ? "pointer" : "default",
                    display: "flex", alignItems: "center", gap: 3,
                    opacity: prevRunId ? 1 : 0.4, transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { if (prevRunId) { e.currentTarget.style.borderColor = HEX.cyan; e.currentTarget.style.color = HEX.cyan; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = HEX.border; e.currentTarget.style.color = prevRunId ? HEX.text2 : HEX.text3; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                  PREV
                </button>
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
                  {currentIdx !== -1 ? `${currentIdx + 1} / ${allRunIds.length}` : ""}
                </span>
                <button
                  onClick={() => nextRunId && router.push(`/hedge-effectiveness/runs/${nextRunId}`)}
                  disabled={!nextRunId}
                  title="Next run"
                  style={{
                    fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: nextRunId ? S.text2 : S.text3,
                    background: S.sub, border: `1px solid ${S.rim}`,
                    padding: "4px 8px", borderRadius: 3, cursor: nextRunId ? "pointer" : "default",
                    display: "flex", alignItems: "center", gap: 3,
                    opacity: nextRunId ? 1 : 0.4, transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { if (nextRunId) { e.currentTarget.style.borderColor = HEX.cyan; e.currentTarget.style.color = HEX.cyan; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = HEX.border; e.currentTarget.style.color = nextRunId ? HEX.text2 : HEX.text3; }}
                >
                  NEXT
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </>
            )}
            <div style={{ width: 1, height: 16, background: S.soft }} />
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.text3, letterSpacing: "0.12em" }}>
              EFFECTIVENESS ASSESSMENT
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>
              {run.created_at ? new Date(run.created_at).toLocaleString() : ""}
            </span>
            <button
              onClick={handleCopySummary}
              title="Copy summary to clipboard"
              style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 600,
                color: copied ? HEX.green : S.text3,
                background: copied ? HEX.greenBg : S.sub,
                border: `1px solid ${copied ? HEX.greenBorder : S.rim}`,
                padding: "4px 10px", borderRadius: 3, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
                transition: "all 0.2s",
              }}
            >
              {copied ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
                  COPIED
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  COPY
                </>
              )}
            </button>
          </div>

          {/* Title row with verdict */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
            {/* Verdict badge */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 20px", borderRadius: 4,
              background: run.overall_effective ? HEX.greenBg : HEX.redBg,
              border: `1px solid ${run.overall_effective ? HEX.greenBorder : HEX.redBorder}`,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={run.overall_effective ? HEX.green : HEX.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {run.overall_effective
                  ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></>
                  : <><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></>
                }
              </svg>
              <span style={{
                fontFamily: S.mono, fontSize: 14, fontWeight: 800, letterSpacing: "0.08em",
                color: run.overall_effective ? HEX.green : HEX.red,
              }}>
                {run.overall_effective ? "EFFECTIVE" : "INEFFECTIVE"}
              </span>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: S.ui, fontSize: 16, fontWeight: 700, color: S.text1 }}>
                {run.dataset_name}
                {run.currency_pair && (
                  <span style={{
                    fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.cyan,
                    marginLeft: 10, padding: "2px 8px", borderRadius: 3,
                    background: "rgba(28,98,242,0.06)", border: "1px solid rgba(28,98,242,0.15)",
                  }}>
                    {run.currency_pair}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, marginTop: 3, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span>{run.standard}</span>
                <span style={{ color: S.rim }}>\u2502</span>
                <span>{run.hedge_type.replace(/_/g, " ").toUpperCase()}</span>
                <span style={{ color: S.rim }}>\u2502</span>
                <span>{run.period_count} periods</span>
                <span style={{ color: S.rim }}>\u2502</span>
                <span>v{run.methodology_version}</span>
                {run.designation_date && (
                  <>
                    <span style={{ color: S.rim }}>\u2502</span>
                    <span>Designated: {run.designation_date}</span>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {(["ifrs9", "asc815"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => handleXmlDownload(fmt)}
                    disabled={downloading === fmt}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      fontFamily: S.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                      color: downloading === fmt ? S.text3 : HEX.cyan,
                      background: "rgba(28,98,242,0.06)", border: "1px solid rgba(28,98,242,0.2)",
                      borderRadius: 4, padding: "5px 12px", cursor: downloading === fmt ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={(e) => { if (!downloading) e.currentTarget.style.background = "rgba(28,98,242,0.12)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(28,98,242,0.06)"; }}
                  >
                    <FileCode2 size={12} />
                    {downloading === fmt ? "..." : fmt === "ifrs9" ? "IFRS 9 XML" : "ASC 815 XML"}
                  </button>
                ))}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.08em" }}>RUN HASH</div>
                <div style={{
                  fontFamily: S.mono, fontSize: 12, color: S.text2, marginTop: 2,
                  padding: "2px 8px", background: S.sub, borderRadius: 2,
                }}>
                  {run.run_hash?.slice(0, 20)}...
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          borderTop: `1px solid ${S.rim}`, borderBottom: `1px solid ${S.rim}`,
        }}>
          {[
            {
              label: "DOLLAR-OFFSET",
              value: run.dollar_offset_ratio,
              pass: run.dollar_offset_effective,
              fmt: (v: number) => v.toFixed(4),
              sub: "Ratio (0.80 - 1.25)",
            },
            {
              label: "R-SQUARED",
              value: run.regression_r_squared,
              pass: run.regression_r_squared != null ? run.regression_r_squared >= 0.80 : null,
              fmt: (v: number) => v.toFixed(4),
              sub: "Threshold \u2265 0.80",
            },
            {
              label: "SLOPE (\u03B2)",
              value: run.regression_slope,
              pass: run.regression_slope != null ? (run.regression_slope >= -1.25 && run.regression_slope <= -0.80) : null,
              fmt: (v: number) => v.toFixed(4),
              sub: "Band [-1.25, -0.80]",
            },
            {
              label: "PERIODS ANALYZED",
              value: run.period_count,
              pass: null,
              fmt: (v: number) => v.toString(),
              sub: run.regression_method === "regression_insufficient_data" ? "< 30 (regression N/A)" : "Data points",
            },
          ].map((kpi, i) => (
            <div key={kpi.label} style={{
              padding: "14px 20px",
              borderRight: i < 3 ? `1px solid ${S.rim}` : "none",
              position: "relative",
            }}>
              {kpi.pass != null && (
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 2,
                  background: kpi.pass ? HEX.green : HEX.red,
                }} />
              )}
              <div style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
                letterSpacing: "0.14em", marginBottom: 4,
              }}>
                {kpi.label}
              </div>
              <div style={{
                fontFamily: S.mono, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em",
                color: kpi.pass === true ? HEX.green : kpi.pass === false ? HEX.red : S.text1,
              }}>
                {kpi.value != null ? kpi.fmt(kpi.value) : "\u2014"}
              </div>
              <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, marginTop: 2 }}>
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Section tabs */}
        <div style={{ display: "flex", gap: 0, padding: "0 28px" }}>
          {([
            { key: "results" as const, label: "ANALYSIS", icon: "M3 3v18h18" },
            { key: "periods" as const, label: `PERIODS (${periods.length})`, icon: "M3 12h18M3 6h18M3 18h18" },
            { key: "compliance" as const, label: "EVIDENCE", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
            { key: "trace" as const, label: `TRACE (${traces.length})`, icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveSection(t.key)}
              style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: activeSection === t.key ? 700 : 500,
                letterSpacing: "0.1em", color: activeSection === t.key ? HEX.cyan : S.text3,
                padding: "10px 18px", background: "transparent", border: "none",
                borderBottom: activeSection === t.key ? `2px solid ${HEX.cyan}` : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {activeSection === "results" && <ResultsSection run={run} narrative={narrative} periods={periods} />}
        {activeSection === "periods" && <PeriodsSection periods={periods} />}
        {activeSection === "compliance" && <ComplianceSection compliance={compliance} run={run} />}
        {activeSection === "trace" && <TraceSection traces={traces} run={run} />}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RESULTS SECTION — Charts + Analysis
// ═════════════════════════════════════════════════════════════════════════════

function ResultsSection({ run, narrative, periods }: { run: RunDetail; narrative: string; periods: PeriodData[] }) {
  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Narrative */}
      {narrative && (
        <div style={{
          padding: "16px 20px", marginBottom: 20, borderRadius: 6,
          background: run.overall_effective ? "rgba(5,150,105,0.04)" : "rgba(220,38,38,0.04)",
          border: `1px solid ${run.overall_effective ? "rgba(5,150,105,0.12)" : "rgba(220,38,38,0.12)"}`,
          borderLeft: `3px solid ${run.overall_effective ? HEX.green : HEX.red}`,
        }}>
          <div style={{
            fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
            letterSpacing: "0.14em", marginBottom: 6,
          }}>
            DETERMINATION NARRATIVE
          </div>
          <p style={{ fontFamily: S.ui, fontSize: 13, color: S.text1, lineHeight: 1.7, margin: 0 }}>
            {narrative}
          </p>
        </div>
      )}

      {/* Main charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Cumulative Ratio Timeline */}
        <div style={{
          gridColumn: "1 / -1", padding: "20px 24px", borderRadius: 6,
          background: S.panel, border: `1px solid ${S.rim}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
              CUMULATIVE EFFECTIVENESS RATIO OVER TIME
            </span>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 2, background: HEX.cyan, borderRadius: 1 }} />
                <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>Cumulative Ratio</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 8, background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.25)", borderRadius: 1 }} />
                <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>Effective Band (0.80 - 1.25)</span>
              </div>
            </div>
          </div>
          <CumulativeRatioChart periods={periods} />
        </div>

        {/* Dollar-Offset Gauge */}
        <div style={{
          padding: "20px 24px", borderRadius: 6,
          background: S.panel, border: `1px solid ${S.rim}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
              DOLLAR-OFFSET METHOD
            </span>
            {run.dollar_offset_effective != null && (
              <PassFailBadge pass={run.dollar_offset_effective} />
            )}
          </div>
          <DollarOffsetGauge ratio={run.dollar_offset_ratio} effective={run.dollar_offset_effective} />
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, lineHeight: 1.6 }}>
              Ratio = -\u03A3(Instrument \u0394FV) / \u03A3(Hedged Item \u0394FV)
            </div>
            <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>
              Effective band: <strong style={{ color: S.text2 }}>0.80 \u2014 1.25</strong>
            </div>
          </div>
        </div>

        {/* Regression Panel */}
        <div style={{
          padding: "20px 24px", borderRadius: 6,
          background: S.panel, border: `1px solid ${S.rim}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
              REGRESSION METHOD
            </span>
            {run.regression_method === "regression_insufficient_data" ? (
              <span style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                padding: "2px 8px", borderRadius: 2, background: S.sub, color: S.text3,
              }}>
                INSUFFICIENT DATA
              </span>
            ) : run.regression_effective != null ? (
              <PassFailBadge pass={run.regression_effective} />
            ) : null}
          </div>

          {run.regression_method === "regression_insufficient_data" ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              height: 220, gap: 12,
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="1.5" opacity="0.4">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, textAlign: "center" }}>
                Requires <strong style={{ color: S.text2 }}>30+ data points</strong> for regression analysis
                <br />
                <span style={{ fontSize: 12 }}>Current dataset: {run.period_count} periods</span>
              </div>
            </div>
          ) : (
            <RegressionPanel run={run} periods={periods} />
          )}
        </div>
      </div>

      {/* Period-by-period bar chart */}
      {periods.length > 0 && (
        <div style={{
          padding: "20px 24px", borderRadius: 6,
          background: S.panel, border: `1px solid ${S.rim}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
              PERIOD-BY-PERIOD FAIR VALUE CHANGES
            </span>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 10, height: 10, background: HEX.cyan, borderRadius: 2 }} />
                <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>Hedged Item</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 10, height: 10, background: HEX.amberLight, borderRadius: 2 }} />
                <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>Instrument</span>
              </div>
            </div>
          </div>
          <PeriodBarChart periods={periods} />
        </div>
      )}
    </div>
  );
}

// ── Pass/Fail Badge ───────────────────────────────────────────────────────
function PassFailBadge({ pass }: { pass: boolean }) {
  return (
    <span style={{
      fontFamily: S.mono, fontSize: 12, fontWeight: 800, letterSpacing: "0.12em",
      padding: "2px 8px", borderRadius: 2,
      background: pass ? HEX.greenBg : HEX.redBg,
      color: pass ? HEX.green : HEX.red,
      border: `1px solid ${pass ? HEX.greenBorder : HEX.redBorder}`,
    }}>
      {pass ? "\u2713 PASS" : "\u2717 FAIL"}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHART: Cumulative Ratio Timeline
// ═════════════════════════════════════════════════════════════════════════════

function CumulativeRatioChart({ periods }: { periods: PeriodData[] }) {
  if (periods.length === 0) return null;

  const labels = periods.map((p, i) => p.period_date || `P${i + 1}`);
  const ratios = periods.map((p) => p.cumulative_ratio);

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: HEX.border,
      borderWidth: 1,
      textStyle: { color: HEX.text1, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
      extraCssText: "box-shadow: 0 4px 20px rgba(0,0,0,0.08);",
      formatter: (params: Array<{ name: string; value: number | null; color: string }>) => {
        const p = params[0];
        if (p.value == null) return `<b>${p.name}</b><br/>Ratio: N/A`;
        const inBand = p.value >= 0.80 && p.value <= 1.25;
        const color = inBand ? HEX.green : HEX.red;
        return `<b style="color:${HEX.text2}">${p.name}</b><br/>` +
          `<span style="color:${color};font-weight:700">Ratio: ${p.value.toFixed(4)}</span><br/>` +
          `<span style="color:${HEX.text3}">${inBand ? "Within" : "Outside"} effective band</span>`;
      },
    },
    grid: { left: 54, right: 20, top: 24, bottom: 32, containLabel: false },
    xAxis: {
      type: "category" as const,
      data: labels,
      axisLabel: { color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", rotate: labels.length > 10 ? 30 : 0 },
      axisLine: { lineStyle: { color: HEX.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      min: (v: { min: number }) => Math.max(0, Math.floor((v.min - 0.1) * 10) / 10),
      max: (v: { max: number }) => Math.min(3, Math.ceil((v.max + 0.1) * 10) / 10),
      axisLabel: { color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", formatter: (v: number) => v.toFixed(2) },
      splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const, opacity: 0.5 } },
    },
    series: [
      // Effective band (shaded area between 0.80 and 1.25)
      {
        type: "line" as const,
        data: periods.map(() => 1.25),
        symbol: "none",
        lineStyle: { width: 0 },
        areaStyle: { color: "transparent" },
        silent: true,
        z: 0,
      },
      {
        type: "line" as const,
        data: periods.map(() => 0.80),
        symbol: "none",
        lineStyle: { width: 0 },
        silent: true,
        z: 0,
      },
      // Cumulative ratio line
      {
        type: "line" as const,
        data: ratios,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { color: HEX.cyan, width: 2.5, shadowBlur: 6, shadowColor: "rgba(28,98,242,0.2)" },
        itemStyle: {
          color: HEX.cyan,
          borderWidth: 2,
          borderColor: "#fff",
          shadowBlur: 4,
          shadowColor: "rgba(28,98,242,0.3)",
        },
        emphasis: {
          itemStyle: { shadowBlur: 12, shadowColor: "rgba(28,98,242,0.4)", borderWidth: 3 },
        },
        z: 2,
        connectNulls: true,
      },
    ],
    visualMap: [
      // Band shading
      {
        show: false,
        type: "piecewise" as const,
        dimension: 1,
        seriesIndex: 0,
        pieces: [{ min: 0.80, max: 1.25, color: HEX.bandGreen }],
        outOfRange: { color: "transparent" },
      },
    ],
    // Mark lines for band boundaries
    graphic: [
      // Upper band line (1.25)
      {
        type: "group" as const,
        children: [] as unknown[],
      },
    ],
  };

  // Use markLine on the ratio series for band boundaries
  const ratioSeries = option.series[2] as Record<string, unknown>;
  ratioSeries.markLine = {
    silent: true,
    symbol: "none",
    lineStyle: { type: "dashed", width: 1 },
    label: {
      position: "insideEndTop",
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 12,
    },
    data: [
      {
        yAxis: 0.80,
        lineStyle: { color: HEX.green, opacity: 0.5 },
        label: { formatter: "0.80", color: HEX.green },
      },
      {
        yAxis: 1.25,
        lineStyle: { color: HEX.green, opacity: 0.5 },
        label: { formatter: "1.25", color: HEX.green },
      },
      {
        yAxis: 1.00,
        lineStyle: { color: HEX.text3, opacity: 0.3, type: "dotted" },
        label: { formatter: "1.00 (perfect)", color: HEX.text3 },
      },
    ],
  };

  // Add markArea for the effective band shading
  ratioSeries.markArea = {
    silent: true,
    data: [
      [
        { yAxis: 0.80, itemStyle: { color: "rgba(5,150,105,0.06)" } },
        { yAxis: 1.25 },
      ],
    ],
  };

  // Remove the dummy band series since we use markArea
  option.series = [option.series[2]];
  option.visualMap = [];

  return (
    <ReactECharts
      option={option}
      style={{ height: 280, width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHART: Dollar-Offset Gauge
// ═════════════════════════════════════════════════════════════════════════════

function DollarOffsetGauge({ ratio, effective }: { ratio: number | null; effective: boolean | null }) {
  if (ratio == null) {
    return (
      <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>No data</span>
      </div>
    );
  }

  const clampedRatio = Math.max(0, Math.min(2, ratio));
  const isEffective = effective === true;

  const option = {
    backgroundColor: "transparent",
    series: [
      {
        type: "gauge" as const,
        center: ["50%", "65%"],
        radius: "90%",
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 2,
        splitNumber: 10,
        axisLine: {
          lineStyle: {
            width: 18,
            color: [
              [0.40, HEX.redBg],      // 0 - 0.80
              [0.625, HEX.greenBg],    // 0.80 - 1.25
              [1, HEX.redBg],          // 1.25 - 2.00
            ],
          },
        },
        pointer: {
          icon: "path://M12.8,0.7l12,40.1H0.7L12.8,0.7z",
          length: "58%",
          width: 8,
          offsetCenter: [0, "-10%"],
          itemStyle: {
            color: isEffective ? HEX.green : HEX.red,
            shadowBlur: 8,
            shadowColor: isEffective ? "rgba(5,150,105,0.3)" : "rgba(220,38,38,0.3)",
          },
        },
        axisTick: {
          length: 6,
          lineStyle: { color: HEX.border, width: 1 },
        },
        splitLine: {
          length: 12,
          lineStyle: { color: HEX.border, width: 1 },
        },
        axisLabel: {
          color: HEX.text3,
          fontSize: 12,
          fontFamily: "'IBM Plex Mono', monospace",
          distance: 22,
          formatter: (v: number) => {
            if (v === 0.8 || v === 1.25) return `{band|${v.toFixed(2)}}`;
            if (v === 0 || v === 1 || v === 2) return v.toFixed(1);
            return "";
          },
          rich: {
            band: { color: HEX.green, fontWeight: "bold" as const, fontSize: 12 },
          },
        },
        title: { show: false },
        detail: {
          valueAnimation: true,
          fontSize: 28,
          fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 700 as const,
          color: isEffective ? HEX.green : HEX.red,
          offsetCenter: [0, "25%"],
          formatter: (v: number) => v.toFixed(4),
        },
        data: [{ value: clampedRatio }],
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: 240, width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHART: Regression Panel (R² + Slope metrics + scatter if data)
// ═════════════════════════════════════════════════════════════════════════════

function RegressionPanel({ run, periods }: { run: RunDetail; periods: PeriodData[] }) {
  return (
    <div>
      {/* R² and Slope KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, marginTop: 8 }}>
        <div style={{
          textAlign: "center", padding: "16px 12px", borderRadius: 6,
          background: S.sub,
        }}>
          <div style={{
            fontFamily: S.mono, fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em",
            color: run.regression_r_squared != null && run.regression_r_squared >= 0.80 ? HEX.green : HEX.red,
          }}>
            <AnimatedNumber value={run.regression_r_squared} />
          </div>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.12em", marginTop: 4 }}>
            R-SQUARED (R\u00B2)
          </div>
          {run.regression_r_squared != null && (
            <div style={{
              fontFamily: S.mono, fontSize: 12, marginTop: 6,
              color: run.regression_r_squared >= 0.80 ? HEX.green : HEX.red,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              {run.regression_r_squared >= 0.80 ? "\u2713" : "\u2717"} {run.regression_r_squared >= 0.80 ? "\u2265" : "<"} 0.80
            </div>
          )}
        </div>
        <div style={{
          textAlign: "center", padding: "16px 12px", borderRadius: 6,
          background: S.sub,
        }}>
          <div style={{
            fontFamily: S.mono, fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em",
            color: run.regression_slope != null && run.regression_slope >= -1.25 && run.regression_slope <= -0.80 ? HEX.green : HEX.red,
          }}>
            <AnimatedNumber value={run.regression_slope} />
          </div>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.12em", marginTop: 4 }}>
            SLOPE (\u03B2)
          </div>
          {run.regression_slope != null && (
            <div style={{
              fontFamily: S.mono, fontSize: 12, marginTop: 6,
              color: (run.regression_slope >= -1.25 && run.regression_slope <= -0.80) ? HEX.green : HEX.red,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              {(run.regression_slope >= -1.25 && run.regression_slope <= -0.80) ? "\u2713" : "\u2717"}{" "}
              {(run.regression_slope >= -1.25 && run.regression_slope <= -0.80) ? "in" : "outside"} [-1.25, -0.80]
            </div>
          )}
        </div>
      </div>

      {/* Scatter plot */}
      {periods.length >= 3 && (
        <RegressionScatter periods={periods} slope={run.regression_slope} />
      )}

      {/* Regression narrative */}
      {(run.regression_r_squared != null || run.regression_slope != null) && (() => {
        const r2 = run.regression_r_squared;
        const slope = run.regression_slope;

        const r2Text = r2 == null ? null
          : r2 >= 0.95 ? { level: "Very strong", detail: `R² of ${r2.toFixed(4)} indicates a near-perfect linear relationship. The instrument closely mirrors fair value changes in the hedged item.` }
          : r2 >= 0.80 ? { level: "Strong", detail: `R² of ${r2.toFixed(4)} meets the IFRS 9 regression threshold (≥ 0.80). The hedge demonstrates reliable co-movement with the hedged item.` }
          : r2 >= 0.65 ? { level: "Moderate", detail: `R² of ${r2.toFixed(4)} falls below the 0.80 IFRS 9 threshold. The instrument does not consistently offset fair value changes in the hedged item.` }
          : { level: "Weak", detail: `R² of ${r2.toFixed(4)} indicates a poor linear fit. The hedge relationship is unlikely to qualify under regression analysis under IFRS 9 or ASC 815.` };

        const slopeText = slope == null ? null
          : (slope >= -1.25 && slope <= -0.80) ? { pass: true, detail: `Slope β = ${slope.toFixed(4)} is within the required band [−1.25, −0.80], confirming the instrument offsets the hedged item with the expected inverse proportionality.` }
          : slope > -0.80 ? { pass: false, detail: `Slope β = ${slope.toFixed(4)} is above −0.80, indicating the instrument does not sufficiently offset the hedged item (under-hedging).` }
          : { pass: false, detail: `Slope β = ${slope.toFixed(4)} is below −1.25, indicating the instrument over-compensates relative to the hedged item (over-hedging).` };

        return (
          <div style={{
            marginTop: 16, padding: "14px 16px", borderRadius: 4,
            background: S.sub, border: `1px solid ${S.rim}`,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
              REGRESSION INTERPRETATION
            </div>
            {r2Text && (
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{
                  fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                  padding: "2px 6px", borderRadius: 2, flexShrink: 0, height: "fit-content",
                  background: r2 != null && r2 >= 0.80 ? HEX.greenBg : HEX.redBg,
                  color: r2 != null && r2 >= 0.80 ? HEX.green : HEX.red,
                  border: `1px solid ${r2 != null && r2 >= 0.80 ? HEX.greenBorder : HEX.redBorder}`,
                }}>
                  R² — {r2Text.level.toUpperCase()}
                </span>
                <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text2, lineHeight: 1.6 }}>
                  {r2Text.detail}
                </span>
              </div>
            )}
            {slopeText && (
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{
                  fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                  padding: "2px 6px", borderRadius: 2, flexShrink: 0, height: "fit-content",
                  background: slopeText.pass ? HEX.greenBg : HEX.redBg,
                  color: slopeText.pass ? HEX.green : HEX.red,
                  border: `1px solid ${slopeText.pass ? HEX.greenBorder : HEX.redBorder}`,
                }}>
                  β — {slopeText.pass ? "IN BAND" : "OUT OF BAND"}
                </span>
                <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text2, lineHeight: 1.6 }}>
                  {slopeText.detail}
                </span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHART: Regression Scatter Plot
// ═════════════════════════════════════════════════════════════════════════════

function RegressionScatter({ periods, slope }: { periods: PeriodData[]; slope: number | null }) {
  const data = periods.map((p) => [p.hedged_item_fv_change, p.instrument_fv_change]);
  const xValues = data.map((d) => d[0]);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);

  // Regression line points (if slope available)
  const meanX = xValues.reduce((a, b) => a + b, 0) / xValues.length;
  const meanY = periods.map((p) => p.instrument_fv_change).reduce((a, b) => a + b, 0) / periods.length;

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: HEX.border,
      borderWidth: 1,
      textStyle: { color: HEX.text1, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
      formatter: (params: { value: number[] }) => {
        return `Hedged: ${params.value[0]?.toLocaleString()}<br/>Instrument: ${params.value[1]?.toLocaleString()}`;
      },
    },
    grid: { left: 56, right: 20, top: 12, bottom: 36, containLabel: false },
    xAxis: {
      type: "value" as const,
      name: "Hedged Item \u0394FV",
      nameLocation: "center" as const,
      nameGap: 24,
      nameTextStyle: { color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
      axisLabel: { color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", formatter: (v: number) => v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0) },
      axisLine: { lineStyle: { color: HEX.border } },
      splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const, opacity: 0.4 } },
    },
    yAxis: {
      type: "value" as const,
      name: "Instrument \u0394FV",
      nameLocation: "center" as const,
      nameGap: 42,
      nameTextStyle: { color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
      axisLabel: { color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", formatter: (v: number) => v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0) },
      splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const, opacity: 0.4 } },
    },
    series: [
      {
        type: "scatter" as const,
        data: data,
        symbolSize: 10,
        itemStyle: {
          color: HEX.cyan,
          shadowBlur: 6,
          shadowColor: "rgba(28,98,242,0.2)",
          borderWidth: 1.5,
          borderColor: "#fff",
        },
        emphasis: {
          itemStyle: { shadowBlur: 14, shadowColor: "rgba(28,98,242,0.4)", borderWidth: 2 },
        },
      },
      // Regression line
      ...(slope != null ? [{
        type: "line" as const,
        data: [
          [xMin, meanY + slope * (xMin - meanX)],
          [xMax, meanY + slope * (xMax - meanX)],
        ],
        symbol: "none",
        lineStyle: {
          color: HEX.red,
          width: 1.5,
          type: "dashed" as const,
          opacity: 0.7,
        },
        silent: true,
        z: 1,
      }] : []),
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: 180, width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHART: Period Bar Chart (Grouped)
// ═════════════════════════════════════════════════════════════════════════════

function PeriodBarChart({ periods }: { periods: PeriodData[] }) {
  const labels = periods.map((p, i) => p.period_date || `P${i + 1}`);

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: HEX.border,
      borderWidth: 1,
      textStyle: { color: HEX.text1, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
      extraCssText: "box-shadow: 0 4px 20px rgba(0,0,0,0.08);",
    },
    grid: { left: 56, right: 20, top: 20, bottom: 32, containLabel: false },
    xAxis: {
      type: "category" as const,
      data: labels,
      axisLabel: { color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", rotate: labels.length > 8 ? 30 : 0 },
      axisLine: { lineStyle: { color: HEX.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
        formatter: (v: number) => Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v.toFixed(0),
      },
      splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const, opacity: 0.5 } },
    },
    series: [
      {
        name: "Hedged Item \u0394FV",
        type: "bar" as const,
        data: periods.map((p) => p.hedged_item_fv_change),
        barMaxWidth: 28,
        itemStyle: {
          color: {
            type: "linear" as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: HEX.cyan },
              { offset: 1, color: HEX.cyanDim + "88" },
            ],
          },
          borderRadius: [3, 3, 0, 0],
          shadowBlur: 4,
          shadowColor: "rgba(28,98,242,0.15)",
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(28,98,242,0.3)" } },
      },
      {
        name: "Instrument \u0394FV",
        type: "bar" as const,
        data: periods.map((p) => p.instrument_fv_change),
        barMaxWidth: 28,
        itemStyle: {
          color: {
            type: "linear" as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: HEX.amberLight },
              { offset: 1, color: HEX.amber + "88" },
            ],
          },
          borderRadius: [3, 3, 0, 0],
          shadowBlur: 4,
          shadowColor: "rgba(217,119,6,0.15)",
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(217,119,6,0.3)" } },
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: 240, width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PERIODS SECTION — Data Table
// ═════════════════════════════════════════════════════════════════════════════

function PeriodsSection({ periods }: { periods: PeriodData[] }) {
  if (periods.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: S.mono, fontSize: 12, color: S.text3 }}>
        No period data available.
      </div>
    );
  }

  const colStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: 12, color: S.text2, padding: "8px 0",
  };
  const headStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
    letterSpacing: "0.14em", padding: "8px 0",
  };

  return (
    <div style={{
      maxWidth: 1100, background: S.panel, borderRadius: 6,
      border: `1px solid ${S.rim}`, overflow: "hidden",
    }}>
      {/* Table header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "48px 100px 1fr 1fr 1fr 1fr 1fr 1fr",
        gap: 8, padding: "10px 20px", background: S.sub,
        borderBottom: `1px solid ${S.rim}`,
      }}>
        {["#", "DATE", "HEDGED \u0394FV", "INSTR \u0394FV", "CUM HEDGED", "CUM INSTR", "PERIOD RATIO", "CUM RATIO"].map(
          (h) => <span key={h} style={headStyle}>{h}</span>
        )}
      </div>

      {/* Table rows */}
      {periods.map((p, i) => {
        const inBand = p.cumulative_ratio != null && p.cumulative_ratio >= 0.80 && p.cumulative_ratio <= 1.25;
        const outOfBand = p.cumulative_ratio != null && !inBand;
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "48px 100px 1fr 1fr 1fr 1fr 1fr 1fr",
              gap: 8, padding: "0 20px",
              borderBottom: i < periods.length - 1 ? `1px solid ${S.soft}` : "none",
              background: outOfBand ? `${HEX.red}08` : i % 2 === 0 ? "transparent" : S.sub + "60",
              borderLeft: outOfBand ? `3px solid ${HEX.red}40` : "3px solid transparent",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = outOfBand ? `${HEX.red}12` : "rgba(28,98,242,0.03)"}
            onMouseLeave={(e) => e.currentTarget.style.background = outOfBand ? `${HEX.red}08` : i % 2 === 0 ? "transparent" : S.sub + "60"}
          >
            <span style={{ ...colStyle, color: S.text3, fontWeight: 600 }}>{p.period_index + 1}</span>
            <span style={colStyle}>{p.period_date || "\u2014"}</span>
            <span style={{ ...colStyle, color: p.hedged_item_fv_change < 0 ? HEX.red : HEX.text2 }}>
              {p.hedged_item_fv_change.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span style={{ ...colStyle, color: p.instrument_fv_change < 0 ? HEX.red : HEX.text2 }}>
              {p.instrument_fv_change.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span style={colStyle}>
              {p.cumulative_hedged.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span style={colStyle}>
              {p.cumulative_instrument.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span style={colStyle}>
              {p.period_ratio != null ? p.period_ratio.toFixed(4) : "\u2014"}
            </span>
            <span style={{
              ...colStyle,
              fontWeight: 700,
              color: p.cumulative_ratio == null ? S.text3 : inBand ? HEX.green : HEX.red,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {p.cumulative_ratio != null ? p.cumulative_ratio.toFixed(4) : "\u2014"}
              {p.cumulative_ratio != null && (
                <span style={{
                  fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                  padding: "1px 4px", borderRadius: 2, flexShrink: 0,
                  background: inBand ? HEX.greenBg : HEX.redBg,
                  color: inBand ? HEX.green : HEX.red,
                  border: `1px solid ${inBand ? HEX.greenBorder : HEX.redBorder}`,
                }}>
                  {inBand ? "IN" : "OUT"}
                </span>
              )}
            </span>
          </div>
        );
      })}

      {/* Footer summary */}
      {(() => {
        const withRatio = periods.filter((p) => p.cumulative_ratio != null);
        const inBandCount = withRatio.filter((p) => p.cumulative_ratio! >= 0.80 && p.cumulative_ratio! <= 1.25).length;
        const outCount = withRatio.length - inBandCount;
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 16, padding: "10px 20px",
            borderTop: `1px solid ${S.rim}`, background: S.sub,
            fontFamily: S.mono, fontSize: 11,
          }}>
            <span style={{ color: S.text3, letterSpacing: "0.08em" }}>
              {periods.length} PERIODS
            </span>
            <span style={{ color: HEX.green }}>
              ✓ {inBandCount} IN BAND (0.80–1.25)
            </span>
            {outCount > 0 && (
              <span style={{ color: HEX.red }}>
                ✗ {outCount} OUT OF BAND
              </span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPLIANCE / EVIDENCE SECTION
// ═════════════════════════════════════════════════════════════════════════════

function ComplianceSection({ compliance, run }: { compliance: string[]; run: RunDetail }) {
  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Compliance notes */}
      <div style={{
        padding: 24, borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`,
      }}>
        <div style={{
          fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
          letterSpacing: "0.14em", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
          </svg>
          COMPLIANCE NOTES
        </div>
        {compliance.length === 0 ? (
          <p style={{ fontFamily: S.ui, fontSize: 12, color: S.text3, margin: 0 }}>No compliance notes generated.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {compliance.map((note, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, padding: "10px 14px",
                background: S.sub, borderRadius: 4,
                borderLeft: `2px solid ${HEX.cyan}`,
              }}>
                <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: HEX.cyan, flexShrink: 0 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p style={{ fontFamily: S.ui, fontSize: 12, color: S.text1, lineHeight: 1.6, margin: 0 }}>
                  {note}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Methodology disclosure */}
      <div style={{
        padding: 24, borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`,
      }}>
        <div style={{
          fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
          letterSpacing: "0.14em", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="2" strokeLinecap="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
          METHODOLOGY &amp; STANDARDS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            {
              label: "ACCOUNTING STANDARD",
              value: run.standard === "ASC_815" ? "ASC 815 (US GAAP)" : run.standard === "IFRS_9" ? "IFRS 9 (IASB)" : run.standard === "IAS_39" ? "IAS 39 (Legacy IASB)" : run.standard,
              note: run.standard === "ASC_815" ? "ASC 815-20-35-1" : run.standard === "IFRS_9" ? "IFRS 9.B6.4.1–B6.4.6" : "IAS 39.AG105–AG113",
            },
            {
              label: "METHODOLOGY VERSION",
              value: `v${run.methodology_version}`,
              note: "Deterministic retrospective quantitative test",
            },
            {
              label: "DOLLAR-OFFSET TEST",
              value: run.dollar_offset_effective == null ? "Not run" : run.dollar_offset_effective ? "PASS" : "FAIL",
              note: "Effective band: 0.80 ≤ ratio ≤ 1.25",
              color: run.dollar_offset_effective == null ? undefined : run.dollar_offset_effective ? HEX.green : HEX.red,
            },
            {
              label: "REGRESSION TEST",
              value: run.regression_method === "regression_insufficient_data" ? "Insufficient data (< 30 pts)" : run.regression_effective == null ? "Not run" : run.regression_effective ? "PASS" : "FAIL",
              note: "R² ≥ 0.80, slope β ∈ [−1.25, −0.80]",
              color: run.regression_effective == null ? undefined : run.regression_effective ? HEX.green : HEX.red,
            },
            {
              label: "HEDGE TYPE",
              value: (run.hedge_type || "cash_flow").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              note: "Classification per IAS 39.71 / ASC 815-20-25",
            },
            {
              label: "DESIGNATION DATE",
              value: run.designation_date || "Not recorded",
              note: "Date hedge relationship was formally designated",
            },
          ].map((item) => (
            <div key={item.label} style={{
              padding: "10px 14px", background: S.sub, borderRadius: 4,
            }}>
              <div style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
                letterSpacing: "0.12em", marginBottom: 3,
              }}>
                {item.label}
              </div>
              <div style={{
                fontFamily: S.mono, fontSize: 13, fontWeight: 700,
                color: (item as { color?: string }).color || S.text1, marginBottom: 2,
              }}>
                {item.value}
              </div>
              <div style={{ fontFamily: S.ui, fontSize: 11, color: S.text3 }}>
                {item.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cryptographic evidence */}
      <div style={{
        padding: 24, borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`,
      }}>
        <div style={{
          fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
          letterSpacing: "0.14em", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="2" strokeLinecap="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          CRYPTOGRAPHIC EVIDENCE
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
        }}>
          {[
            { label: "RUN HASH (SHA-256)", value: run.run_hash, highlight: true },
            { label: "INPUTS HASH", value: run.inputs_hash },
            { label: "OUTPUTS HASH", value: run.outputs_hash },
            { label: "METHODOLOGY VERSION", value: `v${run.methodology_version}` },
            { label: "ACCOUNTING STANDARD", value: run.standard },
            { label: "ASSESSMENT STATUS", value: run.status },
          ].map((item) => (
            <div key={item.label} style={{
              padding: "10px 14px", background: S.sub, borderRadius: 4,
              border: item.highlight ? `1px solid ${HEX.cyan}20` : "none",
            }}>
              <div style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
                letterSpacing: "0.12em", marginBottom: 4,
              }}>
                {item.label}
              </div>
              <div style={{
                fontFamily: S.mono, fontSize: 12, color: item.highlight ? HEX.cyan : S.text2,
                wordBreak: "break-all", lineHeight: 1.4,
              }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 16, padding: "10px 14px", borderRadius: 4,
          background: "rgba(5,150,105,0.04)", border: "1px solid rgba(5,150,105,0.12)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={HEX.green} strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>
          </svg>
          <span style={{ fontFamily: S.mono, fontSize: 12, color: HEX.green }}>
            WORM-sealed record \u2014 immutable, append-only, tamper-evident
          </span>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TRACE SECTION — Step-by-step audit trail
// ═════════════════════════════════════════════════════════════════════════════

function TraceSection({
  traces,
  run,
}: {
  traces: Array<{ step: string; description: string; data: Record<string, unknown> }>;
  run: RunDetail;
}) {
  const stepColor = (step: string): string => {
    if (step === "DETERMINATION") return run.overall_effective ? HEX.green : HEX.red;
    if (step.includes("HASH")) return HEX.cyan;
    if (step === "VALIDATE_INPUTS") return HEX.amber;
    return HEX.border;
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{
        fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
        letterSpacing: "0.14em", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="2" strokeLinecap="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        EXECUTION TRACE ({traces.length} steps)
      </div>

      <div style={{ position: "relative" }}>
        {/* Vertical timeline line */}
        <div style={{
          position: "absolute", left: 15, top: 0, bottom: 0,
          width: 1, background: S.rim,
        }} />

        {traces.map((t, i) => {
          const color = stepColor(t.step);
          return (
            <div key={i} style={{
              display: "flex", gap: 16, marginBottom: 12, position: "relative",
            }}>
              {/* Timeline dot */}
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: color, border: "2px solid #fff",
                flexShrink: 0, marginTop: 6, zIndex: 1,
                boxShadow: `0 0 0 2px ${color}30`,
              }} />

              {/* Card */}
              <div style={{
                flex: 1, padding: "12px 16px", borderRadius: 4,
                background: S.panel, border: `1px solid ${S.rim}`,
                borderLeft: `3px solid ${color}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontFamily: S.mono, fontSize: 12, fontWeight: 800, letterSpacing: "0.12em",
                    padding: "1px 8px", borderRadius: 2, background: S.sub, color: S.text3,
                  }}>
                    STEP {i + 1}
                  </span>
                  <span style={{
                    fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: color,
                  }}>
                    {t.step}
                  </span>
                </div>
                <div style={{ fontFamily: S.ui, fontSize: 12, color: S.text1, lineHeight: 1.5, marginBottom: t.data && Object.keys(t.data).length > 0 ? 8 : 0 }}>
                  {t.description}
                </div>
                {Object.keys(t.data).length > 0 && (
                  <details>
                    <summary style={{
                      fontFamily: S.mono, fontSize: 12, color: S.text3, cursor: "pointer",
                      padding: "4px 0", userSelect: "none",
                    }}>
                      DATA PAYLOAD
                    </summary>
                    <pre style={{
                      fontFamily: S.mono, fontSize: 12, color: S.text3, margin: "4px 0 0",
                      whiteSpace: "pre-wrap", wordBreak: "break-all",
                      background: S.sub, padding: 10, borderRadius: 3,
                      maxHeight: 200, overflow: "auto",
                    }}>
                      {JSON.stringify(t.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
