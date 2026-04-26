"use client";

import { useState, useMemo, useEffect } from "react";
import { logger } from "@/lib/logger";
import type { CalculateResponse, PolicyConfig } from "../../api/types";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { T } from "@/lib/design/tokens";
import ExecutiveSummaryPanel from "./ExecutiveSummaryPanel";
import ExposureInsightsPanel from "./ExposureInsightsPanel";
import HedgeEfficiencyPanel from "./HedgeEfficiencyPanel";
import PolicyCompliancePanel from "./PolicyCompliancePanel";
import ScenarioSensitivityPanel from "./ScenarioSensitivityPanel";
import {
  HorizontalStackedBar, BucketBarChart, EChartsWaterfallChart,
  DonutChart, RadarChart,
} from "./EChartsWrapper";
import { fmtMXN, fmtUSD, fmtPct } from "../../utils/formatters";
import {
  scenarioKpis, concentrationAnalysis, policyComplianceChecks,
  generateExecutiveNarrative,
} from "../../utils/reportCalcs";
import {
  exportReportCsv, exportCommitteePackPdf, exportExecutiveBriefPdf, exportDataXlsx,
} from "../../utils/clientExport";

// Concentration-tier signal palette (HIGH / MODERATE / OK). Outside the T
// scale because chart-legend dots need slightly lighter, more saturated hues
// than `T.fail` / `T.warn` / `T.cyan` for at-a-glance distinction.
const C = {
  concHigh: "#F87171",
  concMid:  "#FBB347",
  concLow:  "#22D3EE",
} as const;

// ── Report versioning (L-14) ─────────────────────────────────────────────────
interface SavedReport {
  id: string;       // `${userId}_${runId}_v${n}`
  name: string;     // e.g. "Report v1 — 2026-02-28 14:32"
  runId: string;
  savedAt: number;  // epoch ms
  snapshot: Record<string, unknown>; // serialized state
}

const MAX_SAVED = 20;

function loadSavedReports(userId: string): SavedReport[] {
  try {
    return JSON.parse(localStorage.getItem(`savedReports_${userId}`) ?? "[]") as SavedReport[];
  } catch { return []; }
}

function saveSavedReports(userId: string, reports: SavedReport[]): void {
  localStorage.setItem(`savedReports_${userId}`, JSON.stringify(reports.slice(-MAX_SAVED)));
}

interface ReportsContainerProps {
  result:   CalculateResponse;
  baseCcy?: string;
  userId?:  string;
}

const FALLBACK_POLICY: PolicyConfig = {
  bucket_mode: "CALENDAR_MONTH",
  hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
  cost_assumptions: { spread_bps: 5 },
  execution_product: "NDF",
  min_trade_size_usd: 10000,
};

const REPORTS = [
  { key: "coverage",   label: "Coverage & Residual",         icon: "\u25A4" },
  { key: "cost",       label: "Cost & Slippage",             icon: "\u25C8" },
  { key: "scenario",   label: "Scenario & Stress",           icon: "\u25D0" },
  { key: "compliance", label: "Policy Compliance",           icon: "\u2696" },
  { key: "liquidity",  label: "Liquidity & Concentration",   icon: "\u25CE" },
  { key: "briefing",   label: "Executive Briefing",          icon: "\u25C7" },
];

function ReportSection({
  number, title, meaning, guidance, children, onExportPdf, onExportCsv, onExportXlsx,
}: {
  number: string; title: string; meaning: string; guidance: string[];
  children: React.ReactNode;
  onExportPdf?: () => Promise<void> | void;
  onExportCsv?: () => void;
  onExportXlsx?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfDone, setPdfDone] = useState(false);
  const [csvDone, setCsvDone] = useState(false);
  const [xlsxDone, setXlsxDone] = useState(false);

  const handlePdf = async () => {
    if (!onExportPdf || pdfBusy) return;
    setPdfBusy(true);
    try { await onExportPdf(); setPdfDone(true); setTimeout(() => setPdfDone(false), 2200); }
    catch (e) { logger.error(e); }
    finally { setPdfBusy(false); }
  };
  const handleCsv = () => {
    if (!onExportCsv) return;
    onExportCsv();
    setCsvDone(true);
    setTimeout(() => setCsvDone(false), 2200);
  };
  const handleXlsx = () => {
    if (!onExportXlsx) return;
    onExportXlsx();
    setXlsxDone(true);
    setTimeout(() => setXlsxDone(false), 2200);
  };

  return (
    <div style={{ background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", background: T.bgDeep, borderBottom: `1px solid ${T.soft}`,
          textAlign: "left", cursor: "pointer", border: "none", transition: "background 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, letterSpacing: "0.1em" }}>{number}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.primary, fontFamily: "var(--font-heading)" }}>{title}</span>
        </div>
        <span style={{ color: T.tertiary, fontSize: 14, transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "none" }}>{"\u25B6"}</span>
      </button>

      {expanded && (
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          {children}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, paddingTop: 16, borderTop: `1px solid ${T.soft}` }}>
            <div style={{ borderLeft: `2px solid ${T.accent}`, paddingLeft: 16 }}>
              <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>What This Means</div>
              <p style={{ fontSize: 14, color: T.secondary, lineHeight: 1.6 }}>{meaning}</p>
            </div>
            <div>
              <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Decision Guidance</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {guidance.map((g, i) => (
                  <li key={i} style={{ fontSize: 14, color: T.secondary, display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ color: T.accent, marginTop: 2, flexShrink: 0 }}>{"\u203A"}</span>{g}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            {onExportPdf && (
              <button
                onClick={handlePdf}
                disabled={pdfBusy}
                style={{
                  fontSize: 10, fontFamily: T.fontMono, padding: "6px 12px", background: "none", cursor: "pointer",
                  transition: "all 0.15s",
                  border: pdfDone ? `1px solid var(--status-pass)` : `1px solid ${T.rim}`,
                  color: pdfDone ? T.pass : T.tertiary,
                }}
              >
                {pdfBusy ? "Generating\u2026" : pdfDone ? "Saved \u2713" : "Export PDF \u2193"}
              </button>
            )}
            {onExportCsv && (
              <button
                onClick={handleCsv}
                style={{
                  fontSize: 10, fontFamily: T.fontMono, padding: "6px 12px", background: "none", cursor: "pointer",
                  transition: "all 0.15s",
                  border: csvDone ? `1px solid var(--status-pass)` : `1px solid ${T.rim}`,
                  color: csvDone ? T.pass : T.tertiary,
                }}
              >
                {csvDone ? "Saved \u2713" : "Export CSV \u2193"}
              </button>
            )}
            {onExportXlsx && (
              <button
                onClick={handleXlsx}
                style={{
                  fontSize: 10, fontFamily: T.fontMono, padding: "6px 12px", background: "none", cursor: "pointer",
                  transition: "all 0.15s",
                  border: xlsxDone ? `1px solid var(--status-pass)` : `1px solid ${T.rim}`,
                  color: xlsxDone ? T.pass : T.tertiary,
                }}
              >
                {xlsxDone ? "Saved \u2713" : "Export XLSX \u2193"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportsContainer({ result, baseCcy = "MXN", userId = "" }: ReportsContainerProps) {
  const [activeReport, setActiveReport] = useState("coverage");
  const { hedge_plan, scenario_results, validation_report } = result;
  const { summary, buckets } = hedge_plan;

  // ── L-14: Report versioning ───────────────────────────────────────────────
  const currentRunId = result.run_id ?? result.run_envelope?.run_id ?? "unknown";
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  useEffect(() => {
    if (userId) setSavedReports(loadSavedReports(userId));
  }, [userId]);

  // ── RPT-01: Active Policy Injection ──────────────────────────────────────
  const { token } = useAuth();
  const [activePolicy, setActivePolicy] = useState<PolicyConfig | null>(null);

  useEffect(() => {
    if (!token) return;
    dashboardFetch("/api/v1/policies/active", token)
      .then((data: unknown) => {
        if (data && typeof data === "object" && "hedge_ratios" in data)
          setActivePolicy(data as PolicyConfig);
      })
      .catch(() => {}); // silent fallback to FALLBACK_POLICY
  }, [token]);

  const policy = activePolicy ?? FALLBACK_POLICY;

  function handleSaveVersion() {
    if (!userId) return;
    const existing = loadSavedReports(userId);
    const vNum = existing.filter((r) => r.runId === currentRunId).length + 1;
    const now = new Date();
    const label = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
    const newReport: SavedReport = {
      id: `${userId}_${currentRunId}_v${vNum}`,
      name: `Report v${vNum} \u2014 ${label}`,
      runId: currentRunId,
      savedAt: Date.now(),
      snapshot: { activeReport, baseCcy, runId: currentRunId },
    };
    const updated = [...existing, newReport].slice(-MAX_SAVED);
    saveSavedReports(userId, updated);
    setSavedReports(updated);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2200);
  }

  function handleLoadVersion(report: SavedReport) {
    if (report.snapshot.activeReport && typeof report.snapshot.activeReport === "string") {
      setActiveReport(report.snapshot.activeReport);
    }
    setShowSaved(false);
  }

  function handleDeleteVersion(id: string) {
    if (!userId) return;
    const updated = loadSavedReports(userId).filter((r) => r.id !== id);
    saveSavedReports(userId, updated);
    setSavedReports(updated);
  }

  const kpis          = useMemo(() => scenarioKpis(scenario_results.totals, summary), [scenario_results, summary]);
  const concentration = useMemo(() => concentrationAnalysis(buckets), [buckets]);
  const compliance    = useMemo(() => policyComplianceChecks(buckets, summary, policy), [buckets, summary, policy]);

  const totalExposure = useMemo(
    () => buckets.reduce((s, b) => s + Math.abs(b.commercial_exposure_mxn), 0),
    [buckets],
  );

  const worst = scenario_results.totals.find(t => Math.abs(t.sigma + 0.10) < 0.001) ??
                scenario_results.totals[0];
  const waterfallSteps = worst ? [
    { label: "Exposure", value: Math.abs(worst.total_unhedged_usd),  color: "var(--accent-red)" },
    { label: "Hedged",   value: -Math.abs(worst.total_hedged_usd),   color: "var(--accent-green)" },
    { label: "Residual", value: Math.abs(worst.total_unhedged_usd) - Math.abs(worst.total_hedged_usd), color: "var(--accent-amber)" },
  ] : [];

  const hhi = concentration.herfindahlIndex;
  const hhiLabel = hhi > 0.25 ? "Concentrated" : hhi >= 0.15 ? "Moderate" : "Diversified";
  const hhiColor = hhi > 0.25 ? "var(--accent-red)" : hhi >= 0.15 ? "var(--accent-amber)" : "var(--accent-green)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Report navigation tabs + version toolbar */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {REPORTS.map(r => (
          <button
            key={r.key}
            onClick={() => setActiveReport(r.key)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
              fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
              background: activeReport === r.key ? `color-mix(in srgb, ${T.accent} 5%, transparent)` : "none",
              border: `1px solid ${activeReport === r.key ? T.accent : T.rim}`,
              color: activeReport === r.key ? T.accent : T.secondary,
            }}
          >
            <span style={{ fontSize: 10, opacity: 0.7 }}>{r.icon}</span>
            {r.label}
          </button>
        ))}
        {userId && (
          <>
            <div style={{ flex: 1 }} />
            <button
              onClick={handleSaveVersion}
              style={{
                fontSize: 10, fontFamily: T.fontMono, padding: "6px 12px", background: "none", cursor: "pointer",
                transition: "all 0.15s",
                border: saveFlash ? `1px solid var(--status-pass)` : `1px solid ${T.rim}`,
                color: saveFlash ? T.pass : T.tertiary,
              }}
              title="Save a versioned snapshot of the current report view"
            >
              {saveFlash ? "Saved \u2713" : "SAVE VERSION"}
            </button>
            <button
              onClick={() => setShowSaved(s => !s)}
              style={{
                fontSize: 10, fontFamily: T.fontMono, padding: "6px 12px", background: "none", cursor: "pointer",
                border: `1px solid ${T.rim}`, color: T.tertiary, transition: "all 0.15s",
              }}
            >
              {showSaved ? "\u25B4" : "\u25BE"} SAVED REPORTS ({savedReports.length})
            </button>
          </>
        )}
      </div>

      {/* ── L-14: Saved reports panel ── */}
      {userId && showSaved && (
        <div style={{ background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: T.bgDeep, borderBottom: `1px solid ${T.soft}`, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, letterSpacing: "0.1em" }}>SAVED REPORTS</span>
            <span style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary }}>{"\u2014"} {savedReports.length} version{savedReports.length !== 1 ? "s" : ""} stored</span>
          </div>
          {savedReports.length === 0 ? (
            <div style={{ padding: "24px 16px", fontSize: 14, color: T.tertiary, textAlign: "center" }}>
              No saved versions yet. Click SAVE VERSION to snapshot the current report view.
            </div>
          ) : (
            <div>
              {[...savedReports].reverse().map((rep, idx) => (
                <div
                  key={rep.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                    borderTop: idx > 0 ? `1px solid ${T.soft}` : undefined,
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: T.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rep.name}</div>
                    <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, marginTop: 2 }}>
                      Run: {rep.runId.slice(0, 8)}{"\u2026"} {"\u00B7"} {new Date(rep.savedAt).toLocaleString("en-GB")}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLoadVersion(rep)}
                    style={{
                      fontSize: 10, fontFamily: T.fontMono, padding: "4px 10px", background: "none", cursor: "pointer",
                      border: `1px solid ${T.accentDim}`, color: T.accent, transition: "all 0.15s", flexShrink: 0,
                    }}
                  >
                    LOAD
                  </button>
                  <button
                    onClick={() => handleDeleteVersion(rep.id)}
                    style={{
                      fontSize: 10, fontFamily: T.fontMono, padding: "4px 10px", background: "none", cursor: "pointer",
                      border: `1px solid ${T.rim}`, color: T.tertiary, transition: "all 0.15s", flexShrink: 0,
                    }}
                  >
                    DELETE
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── R1: Coverage & Residual ── */}
      {activeReport === "coverage" && (
        <ReportSection
          number="R-01"
          title="Coverage & Residual Report"
          meaning={`Portfolio coverage ratio is ${fmtPct(totalExposure > 0 ? Math.abs(summary.total_hedge_position_mxn) / totalExposure : 0)}. Residual exposure of ${fmtMXN(Math.abs(summary.total_residual_mxn))} remains after applying new hedge actions. ${summary.total_residual_mxn !== 0 ? "The residual reflects policy-permitted under-hedge or minimum trade size constraints." : "Full coverage achieved."}`}
          guidance={[
            "Verify residual is within policy-permitted tolerance (typically \u2264 5% of total exposure).",
            "Review suppressed buckets \u2014 they contribute to residual but receive no hedge action.",
            "If residual is unacceptably large, revise hedge ratios in policy settings and re-run.",
            "Present coverage decomposition to treasury committee prior to execution sign-off.",
          ]}
          onExportPdf={() => exportCommitteePackPdf(result, baseCcy)}
          onExportCsv={() => exportReportCsv("coverage", result, baseCcy)}
          onExportXlsx={() => {
            const rows = buckets.map(b => {
              const cov = Math.abs(b.commercial_exposure_mxn) > 0 ? Math.abs(b.hedge_position_mxn) / Math.abs(b.commercial_exposure_mxn) : 0;
              return [b.bucket, baseCcy, b.commercial_exposure_mxn, b.existing_hedges_mxn, b.action_mxn, b.hedge_position_mxn, b.residual_mxn, (cov * 100).toFixed(1) + "%", b.suppressed ? "YES" : "NO"];
            });
            exportDataXlsx(["Bucket", "Currency", "Commercial Exposure", "Existing Hedges", "New Action", "Hedge Position", "Residual", "Coverage %", "Suppressed"], rows, `R01_Coverage_${result.run_envelope.run_id.slice(0, 12)}.xlsx`);
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { label: "Total Exposure",     value: fmtMXN(Math.abs(summary.total_commercial_exposure_mxn)), color: T.primary },
              { label: "Net Hedge Position", value: fmtMXN(Math.abs(summary.total_hedge_position_mxn)),      color: T.accent },
              { label: "Residual Exposure",  value: fmtMXN(Math.abs(summary.total_residual_mxn)),            color: summary.total_residual_mxn !== 0 ? "var(--accent-amber)" : "var(--accent-green)" },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 12 }}>
                <div style={{ fontSize: 10, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</div>
                <div style={{ fontSize: 20, fontFamily: T.fontMono, fontWeight: 700, marginTop: 2, color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Coverage Decomposition</div>
            <HorizontalStackedBar
              existing={summary.total_existing_hedges_mxn}
              newAction={summary.total_action_mxn}
              residual={summary.total_residual_mxn}
              total={summary.total_commercial_exposure_mxn}
              height={120}
            />
          </div>

          <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Residual by Bucket</div>
            <BucketBarChart
              data={buckets.map(b => ({
                label: b.bucket,
                value: Math.abs(b.residual_mxn),
                color: Math.abs(b.residual_mxn) > 0 ? "#FBB347" : "#4ADE80",
              }))}
              yLabel="Residual"
              height={180}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="table-enterprise" style={{ width: "100%" }}>
              <thead><tr><th scope="col">Bucket</th><th scope="col" className="numeric">Exposure</th><th scope="col" className="numeric">Hedge Action</th><th scope="col" className="numeric">Residual</th><th scope="col" className="numeric">Coverage</th></tr></thead>
              <tbody>
                {buckets.map(b => {
                  const cov = Math.abs(b.commercial_exposure_mxn) > 0 ? Math.abs(b.hedge_position_mxn) / Math.abs(b.commercial_exposure_mxn) : 0;
                  return (
                    <tr key={b.bucket}>
                      <td style={{ fontFamily: T.fontMono, color: T.accent }}>{b.bucket}</td>
                      <td className="numeric">{fmtMXN(Math.abs(b.commercial_exposure_mxn))}</td>
                      <td className="numeric">{b.action_mxn !== 0 ? fmtMXN(Math.abs(b.action_mxn)) : "\u2014"}</td>
                      <td className="numeric" style={{ fontFamily: T.fontMono, color: Math.abs(b.residual_mxn) > 0 ? "var(--accent-amber)" : "var(--accent-green)" }}>{fmtMXN(Math.abs(b.residual_mxn))}</td>
                      <td className="numeric" style={{ fontFamily: T.fontMono }}>{fmtPct(cov)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td style={{ fontWeight: 600 }}>Total</td><td className="numeric" style={{ fontFamily: T.fontMono, fontWeight: 600 }}>{fmtMXN(Math.abs(summary.total_commercial_exposure_mxn))}</td><td className="numeric" style={{ fontFamily: T.fontMono, fontWeight: 600 }}>{fmtMXN(Math.abs(summary.total_action_mxn))}</td><td className="numeric" style={{ fontFamily: T.fontMono, fontWeight: 600 }}>{fmtMXN(Math.abs(summary.total_residual_mxn))}</td><td className="numeric" style={{ fontFamily: T.fontMono, fontWeight: 600 }}>{fmtPct(totalExposure > 0 ? Math.abs(summary.total_hedge_position_mxn) / totalExposure : 0)}</td></tr></tfoot>
            </table>
          </div>
        </ReportSection>
      )}

      {/* ── R2: Cost & Slippage ── */}
      {activeReport === "cost" && (
        <ReportSection
          number="R-02"
          title="Cost & Slippage Report"
          meaning={`Total estimated friction cost is ${fmtUSD(summary.total_friction_usd)}, derived from bid-ask spread assumptions across ${buckets.filter(b => !b.suppressed).length} active buckets at ${policy.cost_assumptions.spread_bps} bps. Cost is fully deterministic and recalculates on each run.`}
          guidance={[
            "Compare spread assumption (bps) against live broker quotes before finalizing execution.",
            "Friction cost does not include carry/funding \u2014 review carry_note on each bucket ticket.",
            "Negotiate tighter spreads on large notionals by batching same-tenor positions.",
            "Document the final agreed spread in the execution audit trail for post-trade reconciliation.",
          ]}
          onExportPdf={() => exportCommitteePackPdf(result, baseCcy)}
          onExportCsv={() => exportReportCsv("cost", result, baseCcy)}
          onExportXlsx={() => {
            const rows = buckets.filter(b => !b.suppressed).map(b => [b.bucket, b.action_mxn, b.action_usd, policy.cost_assumptions.spread_bps, b.friction_usd, b.carry_note ?? ""]);
            exportDataXlsx(["Bucket", "Notional", "Action USD", "Spread (bps)", "Friction USD", "Carry Note"], rows, `R02_CostSlippage_${result.run_envelope.run_id.slice(0, 12)}.xlsx`);
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { label: "Total Friction Cost",  value: fmtUSD(summary.total_friction_usd),               color: "var(--accent-amber)" },
              { label: "Spread Assumption",    value: `${policy.cost_assumptions.spread_bps} bps`, color: T.primary },
              { label: "Execution Product",    value: policy.execution_product,                 color: T.accent },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 12 }}>
                <div style={{ fontSize: 10, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</div>
                <div style={{ fontSize: 20, fontFamily: T.fontMono, fontWeight: 700, marginTop: 2, color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Friction Cost by Bucket (USD)</div>
            {buckets.filter(b => !b.suppressed).length > 0 && (
              <BucketBarChart
                data={buckets.filter(b => !b.suppressed).map(b => ({
                  label: b.bucket,
                  value: b.friction_usd,
                  color: C.concMid,
                }))}
                yLabel="USD"
                height={180}
              />
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="table-enterprise" style={{ width: "100%" }}>
              <thead><tr><th scope="col">Bucket</th><th scope="col" className="numeric">Notional</th><th scope="col" className="numeric">USD Equiv</th><th scope="col" className="numeric">Spread (bps)</th><th scope="col" className="numeric">Friction (USD)</th><th scope="col">Carry Note</th></tr></thead>
              <tbody>
                {buckets.filter(b => !b.suppressed).map(b => (
                  <tr key={b.bucket}>
                    <td style={{ fontFamily: T.fontMono, color: T.accent }}>{b.bucket}</td>
                    <td className="numeric" style={{ fontFamily: T.fontMono }}>{fmtMXN(Math.abs(b.action_mxn))}</td>
                    <td className="numeric" style={{ fontFamily: T.fontMono }}>{fmtUSD(Math.abs(b.action_usd))}</td>
                    <td className="numeric" style={{ fontFamily: T.fontMono }}>{policy.cost_assumptions.spread_bps}</td>
                    <td className="numeric" style={{ fontFamily: T.fontMono, color: "var(--accent-amber)" }}>{fmtUSD(b.friction_usd)}</td>
                    <td style={{ fontSize: 10, color: T.tertiary }}>{b.carry_note}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td style={{ fontWeight: 600 }} colSpan={4}>Total</td><td className="numeric" style={{ fontFamily: T.fontMono, fontWeight: 600, color: "var(--accent-amber)" }}>{fmtUSD(summary.total_friction_usd)}</td><td /></tr></tfoot>
            </table>
          </div>
        </ReportSection>
      )}

      {/* ── R3: Scenario & Stress ── */}
      {activeReport === "scenario" && (
        <ReportSection
          number="R-03"
          title="Scenario & Stress Report"
          meaning={`Worst-case net portfolio impact at \u00B110% FX shock is ${fmtUSD(kpis.worstCaseLoss)}. The hedge reduces tail risk by ${fmtPct(kpis.tailRiskReductionPct)}. Average benefit across all shock scenarios is ${fmtUSD(kpis.avgLossReduction)}. All scenarios are deterministic \u2014 they use MarketSnapshot spot rate with symmetrical sigma shocks.`}
          guidance={[
            `At \u221210% shock: net portfolio impact ${fmtUSD(kpis.worstCaseLoss)} \u2014 primary stress scenario for committee review.`,
            "Compare hedged vs unhedged outcomes across sigma bands to justify hedge cost.",
            "Tail risk reduction shows how much of the downside the hedge absorbs.",
            "For extreme stress testing, consider \u00B115\u201320% shock sensitivity in management overlays.",
          ]}
          onExportPdf={() => exportCommitteePackPdf(result, baseCcy)}
          onExportCsv={() => exportReportCsv("scenario", result, baseCcy)}
          onExportXlsx={() => {
            const rows = scenario_results.totals.map(t => [t.sigma, t.shocked_spot, t.total_unhedged_usd, t.total_hedged_usd, t.total_hedge_benefit_usd]);
            exportDataXlsx(["Shock (\u03C3)", "Shocked Spot", "Unhedged (USD)", "Hedged (USD)", "Hedge Benefit (USD)"], rows, `R03_Scenario_${result.run_envelope.run_id.slice(0, 12)}.xlsx`);
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "Worst-Case Impact",   value: fmtUSD(kpis.worstCaseLoss),               color: "var(--accent-red)" },
              { label: "Avg Benefit",          value: fmtUSD(kpis.avgLossReduction),            color: "var(--accent-green)" },
              { label: "Tail Risk Reduction", value: fmtPct(kpis.tailRiskReductionPct),         color: T.accent },
              { label: "Efficiency Ratio",    value: kpis.efficiencyPerDollar.toFixed(2) + "\u00D7", color: T.primary },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 12 }}>
                <div style={{ fontSize: 10, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</div>
                <div style={{ fontSize: 20, fontFamily: T.fontMono, fontWeight: 700, marginTop: 2, color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {waterfallSteps.length > 0 && (
            <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 16 }}>
              <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Worst-Case Waterfall ({"\u2212"}10% Shock, USD)</div>
              <EChartsWaterfallChart steps={waterfallSteps} height={220} />
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table className="table-enterprise" style={{ width: "100%" }}>
              <thead><tr><th scope="col">Shock ({"\u03C3"})</th><th scope="col" className="numeric">Shocked Spot</th><th scope="col" className="numeric">Unhedged (USD)</th><th scope="col" className="numeric">Hedged (USD)</th><th scope="col" className="numeric">Hedge Benefit</th></tr></thead>
              <tbody>
                {scenario_results.totals.map(t => {
                  const isWorst = Math.abs(t.sigma + 0.10) < 0.001;
                  return (
                    <tr key={t.sigma} style={isWorst ? { background: "color-mix(in srgb, var(--accent-red) 4%, transparent)" } : undefined}>
                      <td style={{ fontFamily: T.fontMono, fontWeight: isWorst ? 700 : undefined, color: isWorst ? "var(--accent-red)" : undefined }}>
                        {t.sigma > 0 ? "+" : ""}{(t.sigma * 100).toFixed(0)}%
                        {isWorst && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>{"\u2190"} stress</span>}
                      </td>
                      <td className="numeric" style={{ fontFamily: T.fontMono }}>{t.shocked_spot.toFixed(4)}</td>
                      <td className="numeric" style={{ fontFamily: T.fontMono, color: "var(--accent-red)" }}>{fmtUSD(t.total_unhedged_usd)}</td>
                      <td className="numeric" style={{ fontFamily: T.fontMono, color: "var(--accent-green)" }}>{fmtUSD(t.total_hedged_usd)}</td>
                      <td className="numeric" style={{ fontFamily: T.fontMono, color: t.total_hedge_benefit_usd >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{fmtUSD(t.total_hedge_benefit_usd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ReportSection>
      )}

      {/* ── R4: Policy Compliance ── */}
      {activeReport === "compliance" && (
        <ReportSection
          number="R-04"
          title="Policy Compliance Report"
          meaning={`Overall compliance score: ${compliance.score}%. Classification: ${compliance.classification}. ${compliance.checks.filter(c => !c.pass).length} check${compliance.checks.filter(c => !c.pass).length !== 1 ? "s" : ""} failed out of ${compliance.checks.length} total. Validation status: ${result.validation_report.status}. All checks are fully deterministic.`}
          guidance={[
            "Review all failed checks before submitting execution instructions for sign-off.",
            "Policy parameters (ratios, spread, min size) are set in the Policy step \u2014 revise there.",
            "Breach explanations cite computed values vs policy thresholds \u2014 escalate to Risk Manager if unresolved.",
            "A PASS classification is a pre-condition for the Staging (treasury approval) workflow.",
          ]}
          onExportPdf={() => exportCommitteePackPdf(result, baseCcy)}
          onExportCsv={() => exportReportCsv("compliance", result, baseCcy)}
          onExportXlsx={() => {
            const rows = compliance.checks.map(c => [c.label, c.pass ? "PASS" : "FAIL", c.detail]);
            rows.push(["SCORE", compliance.score >= 80 ? "PASS" : "FAIL", `${compliance.score}% \u2014 ${compliance.classification}`]);
            exportDataXlsx(["Rule", "Status", "Detail"], rows, `R04_Compliance_${result.run_envelope.run_id.slice(0, 12)}.xlsx`);
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <div style={{ width: 224, flexShrink: 0, background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 8 }}>
                <DonutChart
                  score={compliance.score}
                  classification={compliance.classification}
                  passed={compliance.checks.filter(c => c.pass).length}
                  total={compliance.checks.length}
                  height={200}
                />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Quick Summary</div>
                {[
                  { label: "Score",          value: `${compliance.score}%` },
                  { label: "Classification", value: compliance.classification },
                  { label: "Rules Passed",   value: `${compliance.checks.filter(c => c.pass).length} / ${compliance.checks.length}` },
                  { label: "Rules Failed",   value: `${compliance.checks.filter(c => !c.pass).length}` },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, borderBottom: `1px solid ${T.soft}`, paddingBottom: 4 }}>
                    <span style={{ color: T.tertiary }}>{item.label}</span>
                    <span style={{ fontFamily: T.fontMono, fontWeight: 600, color: T.primary }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Rule Checklist</div>
              {compliance.checks.map((check, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 12, padding: 12, borderRadius: 4, fontSize: 14,
                  border: `1px solid ${check.pass ? "var(--status-pass)" : "var(--status-fail)"}`,
                  background: check.pass ? "color-mix(in srgb, var(--status-pass) 3%, transparent)" : "color-mix(in srgb, var(--status-fail) 3%, transparent)",
                  borderColor: check.pass ? "color-mix(in srgb, var(--status-pass) 20%, transparent)" : "color-mix(in srgb, var(--status-fail) 20%, transparent)",
                }}>
                  <span style={{ flexShrink: 0, fontWeight: 700, fontSize: 16, marginTop: 2, color: check.pass ? T.pass : T.fail }}>{check.pass ? "\u2713" : "\u2717"}</span>
                  <div>
                    <div style={{ fontWeight: 600, color: T.primary, fontSize: 14 }}>{check.label}</div>
                    <div style={{ fontSize: 12, color: T.secondary, marginTop: 2 }}>{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(validation_report.errors.length > 0 || validation_report.warnings.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Breach Explanations</div>
              {validation_report.errors.map((err, i) => (
                <div key={`e-${i}`} style={{ padding: 12, border: "1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)", background: "color-mix(in srgb, var(--accent-red) 4%, transparent)", borderRadius: 4, fontSize: 14 }}>
                  <span style={{ fontFamily: T.fontMono, color: "var(--accent-red)", fontWeight: 700 }}>[{err.code}]</span>{" "}
                  <span style={{ color: T.primary }}>{err.field}:</span>{" "}
                  <span style={{ color: T.secondary }}>{err.message}</span>
                </div>
              ))}
              {validation_report.warnings.map((w, i) => (
                <div key={`w-${i}`} style={{ padding: 12, border: "1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)", background: "color-mix(in srgb, var(--accent-amber) 4%, transparent)", borderRadius: 4, fontSize: 14, color: T.secondary }}>{w}</div>
              ))}
            </div>
          )}

          <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Policy Parameters Reference</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: 14 }}>
              {[
                { label: "Bucket Mode",     value: policy.bucket_mode },
                { label: "Confirmed Ratio", value: fmtPct(policy.hedge_ratios.confirmed) },
                { label: "Forecast Ratio",  value: fmtPct(policy.hedge_ratios.forecast) },
                { label: "Spread (bps)",    value: `${policy.cost_assumptions.spread_bps} bps` },
                { label: "Product",         value: policy.execution_product },
                { label: "Min Trade",       value: `$${policy.min_trade_size_usd.toLocaleString()}` },
              ].map(p => (
                <div key={p.label}>
                  <div style={{ fontSize: 10, color: T.tertiary }}>{p.label}</div>
                  <div style={{ fontFamily: T.fontMono, fontWeight: 600, color: T.primary }}>{p.value}</div>
                </div>
              ))}
            </div>
          </div>
        </ReportSection>
      )}

      {/* ── R5: Liquidity & Concentration ── */}
      {activeReport === "liquidity" && (
        <ReportSection
          number="R-05"
          title="Liquidity & Concentration Report"
          meaning={`Portfolio HHI is ${hhi.toFixed(4)} \u2014 classified as "${hhiLabel}". Peak bucket: "${concentration.peakBucket}" at ${fmtMXN(concentration.peakAmount)} (${fmtPct(totalExposure > 0 ? concentration.peakAmount / totalExposure : 0)} of total). ${hhi > 0.25 ? "High concentration implies reduced negotiating leverage on bid-ask spreads." : "Portfolio is diversified \u2014 favourable execution conditions."}`}
          guidance={[
            "HHI > 0.25 indicates high concentration \u2014 consider spreading trades across adjacent tenors.",
            "Peak bucket represents highest liquidity demand \u2014 sequence this trade first in execution.",
            "For NDF markets, confirm with FX desk that peak notional is within single-trade liquidity limits.",
            "Consider laddering large positions (50% now / 50% in 30 days) to reduce market impact.",
          ]}
          onExportPdf={() => exportCommitteePackPdf(result, baseCcy)}
          onExportCsv={() => exportReportCsv("liquidity", result, baseCcy)}
          onExportXlsx={() => {
            const sorted = [...buckets].sort((a, b) => Math.abs(b.commercial_exposure_mxn) - Math.abs(a.commercial_exposure_mxn));
            const rows = sorted.map((b, rank) => {
              const pct = totalExposure > 0 ? Math.abs(b.commercial_exposure_mxn) / totalExposure : 0;
              const cov = Math.abs(b.commercial_exposure_mxn) > 0 ? Math.abs(b.hedge_position_mxn) / Math.abs(b.commercial_exposure_mxn) : 0;
              return [rank + 1, b.bucket, b.commercial_exposure_mxn, (pct * 100).toFixed(1) + "%", (cov * 100).toFixed(1) + "%", pct > 0.6 ? "HIGH CONC" : pct > 0.3 ? "MODERATE" : "OK"];
            });
            exportDataXlsx(["Rank", "Bucket", "Exposure", "% of Total", "Coverage %", "Risk Flag"], rows, `R05_Liquidity_${result.run_envelope.run_id.slice(0, 12)}.xlsx`);
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { label: "HHI Index",  value: hhi.toFixed(4), color: hhiColor, sub: hhiLabel },
              { label: "Peak Bucket",value: concentration.peakBucket, color: T.accent, sub: fmtMXN(concentration.peakAmount) },
              { label: "# Buckets", value: String(buckets.length), color: T.primary, sub: `${buckets.filter(b => b.suppressed).length} suppressed` },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 12 }}>
                <div style={{ fontSize: 10, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</div>
                <div style={{ fontSize: 20, fontFamily: T.fontMono, fontWeight: 700, marginTop: 2, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 10, color: T.tertiary, marginTop: 2 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Exposure by Bucket {"\u2014"} Concentration View</div>
            <BucketBarChart
              data={buckets.map(b => {
                const pct = totalExposure > 0 ? Math.abs(b.commercial_exposure_mxn) / totalExposure : 0;
                return {
                  label: b.bucket,
                  value: Math.abs(b.commercial_exposure_mxn),
                  color: pct > 0.6 ? "#F87171" : pct > 0.3 ? "#FBB347" : "#22D3EE",
                };
              })}
              yLabel="Exposure"
              height={200}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8, fontSize: 10, fontFamily: T.fontMono, color: T.tertiary }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, display: "inline-block", background: C.concHigh }} />{"> 60% \u2014 HIGH CONC"}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, display: "inline-block", background: C.concMid }} />30{"\u2013"}60% {"\u2014"} MODERATE</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, display: "inline-block", background: C.concLow }} />{"< 30% \u2014 OK"}</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="table-enterprise" style={{ width: "100%" }}>
              <thead><tr><th scope="col">Rank</th><th scope="col">Bucket</th><th scope="col" className="numeric">Exposure</th><th scope="col" className="numeric">% of Total</th><th scope="col" className="numeric">Coverage</th><th scope="col">Risk Flag</th></tr></thead>
              <tbody>
                {[...buckets]
                  .sort((a, b) => Math.abs(b.commercial_exposure_mxn) - Math.abs(a.commercial_exposure_mxn))
                  .map((b, rank) => {
                    const pct = totalExposure > 0 ? Math.abs(b.commercial_exposure_mxn) / totalExposure : 0;
                    const cov = Math.abs(b.commercial_exposure_mxn) > 0 ? Math.abs(b.hedge_position_mxn) / Math.abs(b.commercial_exposure_mxn) : 0;
                    const flag = pct > 0.6 ? "HIGH CONC" : pct > 0.3 ? "MODERATE" : "OK";
                    const flagColor = pct > 0.6 ? "var(--accent-red)" : pct > 0.3 ? "var(--accent-amber)" : "var(--accent-green)";
                    return (
                      <tr key={b.bucket}>
                        <td style={{ fontFamily: T.fontMono, color: T.tertiary }}>{rank + 1}</td>
                        <td style={{ fontFamily: T.fontMono, color: T.accent }}>{b.bucket}</td>
                        <td className="numeric" style={{ fontFamily: T.fontMono }}>{fmtMXN(Math.abs(b.commercial_exposure_mxn))}</td>
                        <td className="numeric" style={{ fontFamily: T.fontMono }}>{fmtPct(pct)}</td>
                        <td className="numeric" style={{ fontFamily: T.fontMono }}>{fmtPct(cov)}</td>
                        <td>
                          <span style={{ fontSize: 10, fontFamily: T.fontMono, fontWeight: 700, padding: "2px 6px", border: `1px solid ${flagColor}`, borderRadius: 4, color: flagColor, background: `color-mix(in srgb, ${flagColor} 8%, transparent)` }}>
                            {flag}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </ReportSection>
      )}

      {/* ── R6: Executive Briefing ── */}
      {activeReport === "briefing" && (() => {
        const totalExp = buckets.reduce((s, b) => s + Math.abs(b.commercial_exposure_mxn), 0);
        const covPct   = totalExp > 0 ? Math.abs(summary.total_hedge_position_mxn) / totalExp : 0;
        const narrative: string[] = (() => {
          try {
            return generateExecutiveNarrative(buckets, summary, scenario_results.totals, {
              bucket_mode: 'CALENDAR_MONTH', hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
              cost_assumptions: { spread_bps: 5 }, execution_product: 'NDF', min_trade_size_usd: 10000,
            });
          } catch { return []; }
        })();
        const radarDimensions = [
          { name: "Coverage",     value: Math.round(covPct * 100) },
          { name: "Compliance",   value: compliance.score },
          { name: "Cost Eff.",    value: Math.min(Math.round(kpis.efficiencyPerDollar * 25), 100) },
          { name: "Diversif.",    value: Math.round(Math.max(0, 1 - hhi) * 100) },
          { name: "Resilience",   value: Math.round(kpis.tailRiskReductionPct * 100) },
        ];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header */}
            <div style={{ background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>R-06 {"\u2014"} Executive Briefing</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: T.primary, fontFamily: "var(--font-heading)", margin: 0 }}>
                    Committee Governance Snapshot
                  </h3>
                  <p style={{ fontSize: 14, color: T.secondary, marginTop: 4, marginBottom: 0 }}>
                    Auto-generated briefing for board / treasury committee distribution. One-click PDF export below.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={async () => { try { await exportExecutiveBriefPdf(result, baseCcy); } catch (e) { logger.error(e); } }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", fontSize: 14,
                      fontFamily: T.fontMono, border: `1px solid ${T.rim}`, background: "none",
                      color: T.secondary, cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></svg>
                    Generate PDF Brief {"\u2193"}
                  </button>
                </div>
              </div>
            </div>

            {/* 5-metric KPI strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {[
                { label: "Total Exposure",  value: `${fmtMXN(Math.abs(summary.total_commercial_exposure_mxn))} ${baseCcy}`, color: T.primary },
                { label: "Coverage",        value: fmtPct(covPct),  color: covPct >= 0.95 ? "var(--accent-green)" : "var(--accent-amber)" },
                { label: "Residual",        value: `${fmtMXN(Math.abs(summary.total_residual_mxn))} ${baseCcy}`, color: summary.total_residual_mxn !== 0 ? "var(--accent-amber)" : "var(--accent-green)" },
                { label: "Friction Cost",   value: fmtUSD(summary.total_friction_usd), color: "var(--accent-amber)" },
                { label: "Worst-Case",      value: fmtUSD(kpis.worstCaseLoss), color: "var(--accent-red)" },
              ].map(kpi => (
                <div key={kpi.label} style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 12 }}>
                  <div style={{ fontSize: 10, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</div>
                  <div style={{ fontSize: 14, fontFamily: T.fontMono, fontWeight: 700, marginTop: 4, lineHeight: 1.2, color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Radar + Narrative */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 16 }}>
                <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Risk Posture Radar</div>
                <RadarChart dimensions={radarDimensions} label="Portfolio Risk Posture" height={260} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginTop: 4 }}>
                  {radarDimensions.map(d => (
                    <div key={d.name} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: T.tertiary, fontFamily: T.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                      <div style={{ fontSize: 10, fontFamily: T.fontMono, fontWeight: 700, color: T.accent }}>{d.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 16 }}>
                <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Assessment Narrative</div>
                {narrative.length > 0 ? (
                  <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                    {narrative.map((line: string, i: number) => (
                      <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 14 }}>
                        <span style={{ color: T.accent, fontFamily: T.fontMono, flexShrink: 0, marginTop: 2 }}>{i + 1}.</span>
                        <span style={{ color: T.secondary, lineHeight: 1.6 }}>{line}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p style={{ fontSize: 14, color: T.tertiary, margin: 0 }}>
                    Narrative generation requires additional reportCalcs inputs. Run a full calculation to enable.
                  </p>
                )}
              </div>
            </div>

            {/* Compliance + Approval */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 16 }}>
                <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Policy Compliance Summary</div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div
                    style={{
                      fontSize: 36, fontFamily: T.fontMono, fontWeight: 700,
                      color: compliance.classification === "ALIGNED" ? "var(--accent-green)" : compliance.classification === "MINOR DEVIATIONS" ? "var(--accent-amber)" : "var(--accent-red)",
                    }}
                  >
                    {compliance.score}%
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.primary }}>{compliance.classification}</div>
                    <div style={{ fontSize: 10, color: T.tertiary, marginTop: 2 }}>{compliance.checks.filter(c => c.pass).length}/{compliance.checks.length} rules passed</div>
                    <div style={{ fontSize: 10, color: T.tertiary }}>Validation: {result.validation_report.status}</div>
                  </div>
                </div>
              </div>

              <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 16 }}>
                <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Signature Block</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  {["Prepared By", "Reviewed By", "Approved By"].map(role => (
                    <div key={role} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{role}</div>
                      <div style={{ height: 32, borderBottom: `1px solid ${T.rim}` }} />
                      <div style={{ fontSize: 10, color: T.tertiary, marginTop: 4 }}>Signature / Date</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Run attestation footer */}
            <div style={{ background: T.bgDeep, border: `1px solid ${T.soft}`, borderRadius: 4, padding: 12, display: "flex", flexWrap: "wrap", gap: 16, fontSize: 10, fontFamily: T.fontMono, color: T.tertiary }}>
              <span>Run: <span style={{ color: T.secondary }}>{result.run_id}</span></span>
              <span>Engine: <span style={{ color: T.secondary }}>v{result.run_envelope.engine_version}</span></span>
              <span>Inputs SHA-256: <span style={{ color: T.secondary }}>{result.run_envelope.inputs_hash.slice(0, 16)}{"\u2026"}</span></span>
              <span>Outputs SHA-256: <span style={{ color: T.secondary }}>{result.run_envelope.outputs_hash.slice(0, 16)}{"\u2026"}</span></span>
            </div>
          </div>
        );
      })()}

      {/* Hidden print-only: full panel stack */}
      <div style={{ display: "none" }}>
        <ExecutiveSummaryPanel
          summary={summary} totals={scenario_results.totals} buckets={buckets}
          trades={[]} hedges={[]}
          market={{ as_of: result.run_envelope.timestamp, spot_rate: 0, forward_points_by_month: {}, provider_metadata: {} }}
          validationReport={validation_report} policy={policy}
        />
        <ExposureInsightsPanel buckets={buckets} />
        <HedgeEfficiencyPanel buckets={buckets} summary={summary} />
        <PolicyCompliancePanel buckets={buckets} summary={summary} policy={policy} validationReport={validation_report} />
        <ScenarioSensitivityPanel totals={scenario_results.totals} perBucket={scenario_results.per_bucket} summary={summary} />
      </div>
    </div>
  );
}
