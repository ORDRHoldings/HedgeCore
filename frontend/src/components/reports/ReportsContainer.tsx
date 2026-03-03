"use client";

import { useState, useMemo, useEffect } from "react";
import type { CalculateResponse, BucketResult, PolicyConfig } from "../../api/types";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
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
  scenarioKpis, concentrationAnalysis, bucketCoverageRatios, policyComplianceChecks,
  generateExecutiveNarrative,
} from "../../utils/reportCalcs";
import {
  exportReportCsv, exportCommitteePackPdf, exportExecutiveBriefPdf, exportDataXlsx,
  exportReportXlsx,
} from "../../utils/clientExport";

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
  { key: "coverage",   label: "Coverage & Residual",         icon: "▤" },
  { key: "cost",       label: "Cost & Slippage",             icon: "◈" },
  { key: "scenario",   label: "Scenario & Stress",           icon: "◐" },
  { key: "compliance", label: "Policy Compliance",           icon: "⚖" },
  { key: "liquidity",  label: "Liquidity & Concentration",   icon: "◎" },
  { key: "briefing",   label: "Executive Briefing",          icon: "◇" },
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
    catch (e) { console.error(e); }
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
    <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-[var(--bg-deep)] border-b border-[var(--border-soft)] text-left hover:bg-[var(--bg-sub)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] tracking-widest">{number}</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>{title}</span>
        </div>
        <span className={`text-[var(--text-tertiary)] text-sm transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}>▶</span>
      </button>

      {expanded && (
        <div className="p-5 space-y-5">
          {children}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[var(--border-soft)]">
            <div className="border-l-2 border-[var(--accent-cyan)] pl-4">
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">What This Means</div>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{meaning}</p>
            </div>
            <div>
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">Decision Guidance</div>
              <ul className="space-y-1.5">
                {guidance.map((g, i) => (
                  <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                    <span className="text-[var(--accent-cyan)] mt-0.5 shrink-0">›</span>{g}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            {onExportPdf && (
              <button
                onClick={handlePdf}
                disabled={pdfBusy}
                className={`text-[10px] font-mono px-3 py-1.5 border transition-colors ${pdfDone ? "border-[var(--accent-green)]/40 text-[var(--accent-green)]" : "border-[var(--border-rim)] text-[var(--text-tertiary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]"}`}
              >
                {pdfBusy ? "Generating…" : pdfDone ? "Saved ✓" : "Export PDF ↓"}
              </button>
            )}
            {onExportCsv && (
              <button
                onClick={handleCsv}
                className={`text-[10px] font-mono px-3 py-1.5 border transition-colors ${csvDone ? "border-[var(--accent-green)]/40 text-[var(--accent-green)]" : "border-[var(--border-rim)] text-[var(--text-tertiary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]"}`}
              >
                {csvDone ? "Saved ✓" : "Export CSV ↓"}
              </button>
            )}
            {onExportXlsx && (
              <button
                onClick={handleXlsx}
                className={`text-[10px] font-mono px-3 py-1.5 border transition-colors ${xlsxDone ? "border-[var(--accent-green)]/40 text-[var(--accent-green)]" : "border-[var(--border-rim)] text-[var(--text-tertiary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]"}`}
              >
                {xlsxDone ? "Saved ✓" : "Export XLSX ↓"}
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
      name: `Report v${vNum} — ${label}`,
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
    <div className="space-y-5">
      {/* Report navigation tabs + version toolbar */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {REPORTS.map(r => (
          <button
            key={r.key}
            onClick={() => setActiveReport(r.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border transition-colors ${
              activeReport === r.key
                ? "border-[var(--accent-cyan)] text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/5"
                : "border-[var(--border-rim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)]"
            }`}
          >
            <span className="text-[10px] opacity-70">{r.icon}</span>
            {r.label}
          </button>
        ))}
        {userId && (
          <>
            <div className="flex-1" />
            <button
              onClick={handleSaveVersion}
              className={`text-[10px] font-mono px-3 py-1.5 border transition-colors ${saveFlash ? "border-[var(--accent-green)]/40 text-[var(--accent-green)]" : "border-[var(--border-rim)] text-[var(--text-tertiary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]"}`}
              title="Save a versioned snapshot of the current report view"
            >
              {saveFlash ? "Saved ✓" : "SAVE VERSION"}
            </button>
            <button
              onClick={() => setShowSaved(s => !s)}
              className="text-[10px] font-mono px-3 py-1.5 border border-[var(--border-rim)] text-[var(--text-tertiary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] transition-colors"
            >
              {showSaved ? "▴" : "▾"} SAVED REPORTS ({savedReports.length})
            </button>
          </>
        )}
      </div>

      {/* ── L-14: Saved reports panel ── */}
      {userId && showSaved && (
        <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded overflow-hidden">
          <div className="px-4 py-2.5 bg-[var(--bg-deep)] border-b border-[var(--border-soft)] flex items-center gap-3">
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] tracking-widest">SAVED REPORTS</span>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)]">— {savedReports.length} version{savedReports.length !== 1 ? "s" : ""} stored</span>
          </div>
          {savedReports.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[var(--text-tertiary)] text-center">
              No saved versions yet. Click SAVE VERSION to snapshot the current report view.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-soft)]">
              {[...savedReports].reverse().map((rep) => (
                <div key={rep.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-sub)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">{rep.name}</div>
                    <div className="text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5">
                      Run: {rep.runId.slice(0, 8)}… · {new Date(rep.savedAt).toLocaleString("en-GB")}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLoadVersion(rep)}
                    className="text-[10px] font-mono px-2.5 py-1 border border-[var(--accent-cyan)]/40 text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)] transition-colors shrink-0"
                  >
                    LOAD
                  </button>
                  <button
                    onClick={() => handleDeleteVersion(rep.id)}
                    className="text-[10px] font-mono px-2.5 py-1 border border-[var(--border-rim)] text-[var(--text-tertiary)] hover:border-[var(--accent-red)] hover:text-[var(--accent-red)] transition-colors shrink-0"
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
            "Verify residual is within policy-permitted tolerance (typically ≤ 5% of total exposure).",
            "Review suppressed buckets — they contribute to residual but receive no hedge action.",
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Total Exposure",     value: fmtMXN(Math.abs(summary.total_commercial_exposure_mxn)), color: "var(--text-primary)" },
              { label: "Net Hedge Position", value: fmtMXN(Math.abs(summary.total_hedge_position_mxn)),      color: "var(--accent-cyan)" },
              { label: "Residual Exposure",  value: fmtMXN(Math.abs(summary.total_residual_mxn)),            color: summary.total_residual_mxn !== 0 ? "var(--accent-amber)" : "var(--accent-green)" },
            ].map(kpi => (
              <div key={kpi.label} className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-3">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{kpi.label}</div>
                <div className="text-xl font-mono font-bold mt-0.5" style={{ color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Coverage Decomposition</div>
            <HorizontalStackedBar
              existing={summary.total_existing_hedges_mxn}
              newAction={summary.total_action_mxn}
              residual={summary.total_residual_mxn}
              total={summary.total_commercial_exposure_mxn}
              height={120}
            />
          </div>

          <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Residual by Bucket</div>
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

          <div className="overflow-x-auto">
            <table className="table-enterprise w-full">
              <thead><tr><th>Bucket</th><th className="numeric">Exposure</th><th className="numeric">Hedge Action</th><th className="numeric">Residual</th><th className="numeric">Coverage</th></tr></thead>
              <tbody>
                {buckets.map(b => {
                  const cov = Math.abs(b.commercial_exposure_mxn) > 0 ? Math.abs(b.hedge_position_mxn) / Math.abs(b.commercial_exposure_mxn) : 0;
                  return (
                    <tr key={b.bucket}>
                      <td className="font-mono text-[var(--accent-cyan)]">{b.bucket}</td>
                      <td className="numeric">{fmtMXN(Math.abs(b.commercial_exposure_mxn))}</td>
                      <td className="numeric">{b.action_mxn !== 0 ? fmtMXN(Math.abs(b.action_mxn)) : "—"}</td>
                      <td className={`numeric font-mono ${Math.abs(b.residual_mxn) > 0 ? "text-[var(--accent-amber)]" : "text-[var(--accent-green)]"}`}>{fmtMXN(Math.abs(b.residual_mxn))}</td>
                      <td className="numeric font-mono">{fmtPct(cov)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td className="font-semibold">Total</td><td className="numeric font-mono font-semibold">{fmtMXN(Math.abs(summary.total_commercial_exposure_mxn))}</td><td className="numeric font-mono font-semibold">{fmtMXN(Math.abs(summary.total_action_mxn))}</td><td className="numeric font-mono font-semibold">{fmtMXN(Math.abs(summary.total_residual_mxn))}</td><td className="numeric font-mono font-semibold">{fmtPct(totalExposure > 0 ? Math.abs(summary.total_hedge_position_mxn) / totalExposure : 0)}</td></tr></tfoot>
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
            "Friction cost does not include carry/funding — review carry_note on each bucket ticket.",
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Total Friction Cost",  value: fmtUSD(summary.total_friction_usd),               color: "var(--accent-amber)" },
              { label: "Spread Assumption",    value: `${policy.cost_assumptions.spread_bps} bps`, color: "var(--text-primary)" },
              { label: "Execution Product",    value: policy.execution_product,                 color: "var(--accent-cyan)" },
            ].map(kpi => (
              <div key={kpi.label} className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-3">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{kpi.label}</div>
                <div className="text-xl font-mono font-bold mt-0.5" style={{ color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Friction Cost by Bucket (USD)</div>
            {buckets.filter(b => !b.suppressed).length > 0 && (
              <BucketBarChart
                data={buckets.filter(b => !b.suppressed).map(b => ({
                  label: b.bucket,
                  value: b.friction_usd,
                  color: "#FBB347",
                }))}
                yLabel="USD"
                height={180}
              />
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="table-enterprise w-full">
              <thead><tr><th>Bucket</th><th className="numeric">Notional</th><th className="numeric">USD Equiv</th><th className="numeric">Spread (bps)</th><th className="numeric">Friction (USD)</th><th>Carry Note</th></tr></thead>
              <tbody>
                {buckets.filter(b => !b.suppressed).map(b => (
                  <tr key={b.bucket}>
                    <td className="font-mono text-[var(--accent-cyan)]">{b.bucket}</td>
                    <td className="numeric font-mono">{fmtMXN(Math.abs(b.action_mxn))}</td>
                    <td className="numeric font-mono">{fmtUSD(Math.abs(b.action_usd))}</td>
                    <td className="numeric font-mono">{policy.cost_assumptions.spread_bps}</td>
                    <td className="numeric font-mono text-[var(--accent-amber)]">{fmtUSD(b.friction_usd)}</td>
                    <td className="text-[10px] text-[var(--text-tertiary)]">{b.carry_note}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td className="font-semibold" colSpan={4}>Total</td><td className="numeric font-mono font-semibold text-[var(--accent-amber)]">{fmtUSD(summary.total_friction_usd)}</td><td /></tr></tfoot>
            </table>
          </div>
        </ReportSection>
      )}

      {/* ── R3: Scenario & Stress ── */}
      {activeReport === "scenario" && (
        <ReportSection
          number="R-03"
          title="Scenario & Stress Report"
          meaning={`Worst-case net portfolio impact at ±10% FX shock is ${fmtUSD(kpis.worstCaseLoss)}. The hedge reduces tail risk by ${fmtPct(kpis.tailRiskReductionPct)}. Average benefit across all shock scenarios is ${fmtUSD(kpis.avgLossReduction)}. All scenarios are deterministic — they use MarketSnapshot spot rate with symmetrical sigma shocks.`}
          guidance={[
            `At −10% shock: net portfolio impact ${fmtUSD(kpis.worstCaseLoss)} — primary stress scenario for committee review.`,
            "Compare hedged vs unhedged outcomes across sigma bands to justify hedge cost.",
            "Tail risk reduction shows how much of the downside the hedge absorbs.",
            "For extreme stress testing, consider ±15–20% shock sensitivity in management overlays.",
          ]}
          onExportPdf={() => exportCommitteePackPdf(result, baseCcy)}
          onExportCsv={() => exportReportCsv("scenario", result, baseCcy)}
          onExportXlsx={() => {
            const rows = scenario_results.totals.map(t => [t.sigma, t.shocked_spot, t.total_unhedged_usd, t.total_hedged_usd, t.total_hedge_benefit_usd]);
            exportDataXlsx(["Shock (σ)", "Shocked Spot", "Unhedged (USD)", "Hedged (USD)", "Hedge Benefit (USD)"], rows, `R03_Scenario_${result.run_envelope.run_id.slice(0, 12)}.xlsx`);
          }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Worst-Case Impact",   value: fmtUSD(kpis.worstCaseLoss),               color: "var(--accent-red)" },
              { label: "Avg Benefit",          value: fmtUSD(kpis.avgLossReduction),            color: "var(--accent-green)" },
              { label: "Tail Risk Reduction", value: fmtPct(kpis.tailRiskReductionPct),         color: "var(--accent-cyan)" },
              { label: "Efficiency Ratio",    value: kpis.efficiencyPerDollar.toFixed(2) + "×", color: "var(--text-primary)" },
            ].map(kpi => (
              <div key={kpi.label} className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-3">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{kpi.label}</div>
                <div className="text-xl font-mono font-bold mt-0.5" style={{ color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {waterfallSteps.length > 0 && (
            <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Worst-Case Waterfall (−10% Shock, USD)</div>
              <EChartsWaterfallChart steps={waterfallSteps} height={220} />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="table-enterprise w-full">
              <thead><tr><th>Shock (σ)</th><th className="numeric">Shocked Spot</th><th className="numeric">Unhedged (USD)</th><th className="numeric">Hedged (USD)</th><th className="numeric">Hedge Benefit</th></tr></thead>
              <tbody>
                {scenario_results.totals.map(t => {
                  const isWorst = Math.abs(t.sigma + 0.10) < 0.001;
                  return (
                    <tr key={t.sigma} style={isWorst ? { background: "color-mix(in srgb, var(--accent-red) 4%, transparent)" } : undefined}>
                      <td className={`font-mono ${isWorst ? "font-bold text-[var(--accent-red)]" : ""}`}>
                        {t.sigma > 0 ? "+" : ""}{(t.sigma * 100).toFixed(0)}%
                        {isWorst && <span className="ml-1 text-[9px] opacity-70">← stress</span>}
                      </td>
                      <td className="numeric font-mono">{t.shocked_spot.toFixed(4)}</td>
                      <td className="numeric font-mono text-[var(--accent-red)]">{fmtUSD(t.total_unhedged_usd)}</td>
                      <td className="numeric font-mono text-[var(--accent-green)]">{fmtUSD(t.total_hedged_usd)}</td>
                      <td className={`numeric font-mono ${t.total_hedge_benefit_usd >= 0 ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>{fmtUSD(t.total_hedge_benefit_usd)}</td>
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
            "Policy parameters (ratios, spread, min size) are set in the Policy step — revise there.",
            "Breach explanations cite computed values vs policy thresholds — escalate to Risk Manager if unresolved.",
            "A PASS classification is a pre-condition for the Staging (treasury approval) workflow.",
          ]}
          onExportPdf={() => exportCommitteePackPdf(result, baseCcy)}
          onExportCsv={() => exportReportCsv("compliance", result, baseCcy)}
          onExportXlsx={() => {
            const rows = compliance.checks.map(c => [c.label, c.pass ? "PASS" : "FAIL", c.detail]);
            rows.push(["SCORE", compliance.score >= 80 ? "PASS" : "FAIL", `${compliance.score}% — ${compliance.classification}`]);
            exportDataXlsx(["Rule", "Status", "Detail"], rows, `R04_Compliance_${result.run_envelope.run_id.slice(0, 12)}.xlsx`);
          }}
        >
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-full md:w-56 shrink-0 bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-2">
              <DonutChart
                score={compliance.score}
                classification={compliance.classification}
                passed={compliance.checks.filter(c => c.pass).length}
                total={compliance.checks.length}
                height={200}
              />
            </div>
            <div className="flex-1 space-y-2">
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">Quick Summary</div>
              {[
                { label: "Score",          value: `${compliance.score}%` },
                { label: "Classification", value: compliance.classification },
                { label: "Rules Passed",   value: `${compliance.checks.filter(c => c.pass).length} / ${compliance.checks.length}` },
                { label: "Rules Failed",   value: `${compliance.checks.filter(c => !c.pass).length}` },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-sm border-b border-[var(--border-soft)] pb-1">
                  <span className="text-[var(--text-tertiary)]">{item.label}</span>
                  <span className="font-mono font-semibold text-[var(--text-primary)]">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">Rule Checklist</div>
            {compliance.checks.map((check, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded border text-sm ${check.pass ? "border-[var(--accent-green)]/20 bg-[var(--accent-green)]/3" : "border-[var(--accent-red)]/20 bg-[var(--accent-red)]/3"}`}>
                <span className={`shrink-0 font-bold text-base mt-0.5 ${check.pass ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>{check.pass ? "✓" : "✗"}</span>
                <div>
                  <div className="font-semibold text-[var(--text-primary)] text-sm">{check.label}</div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">{check.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {(validation_report.errors.length > 0 || validation_report.warnings.length > 0) && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">Breach Explanations</div>
              {validation_report.errors.map((err, i) => (
                <div key={`e-${i}`} className="p-3 border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/4 rounded text-sm">
                  <span className="font-mono text-[var(--accent-red)] font-bold">[{err.code}]</span>{" "}
                  <span className="text-[var(--text-primary)]">{err.field}:</span>{" "}
                  <span className="text-[var(--text-secondary)]">{err.message}</span>
                </div>
              ))}
              {validation_report.warnings.map((w, i) => (
                <div key={`w-${i}`} className="p-3 border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/4 rounded text-sm text-[var(--text-secondary)]">{w}</div>
              ))}
            </div>
          )}

          <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Policy Parameters Reference</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {[
                { label: "Bucket Mode",     value: policy.bucket_mode },
                { label: "Confirmed Ratio", value: fmtPct(policy.hedge_ratios.confirmed) },
                { label: "Forecast Ratio",  value: fmtPct(policy.hedge_ratios.forecast) },
                { label: "Spread (bps)",    value: `${policy.cost_assumptions.spread_bps} bps` },
                { label: "Product",         value: policy.execution_product },
                { label: "Min Trade",       value: `$${policy.min_trade_size_usd.toLocaleString()}` },
              ].map(p => (
                <div key={p.label}>
                  <div className="text-[10px] text-[var(--text-tertiary)]">{p.label}</div>
                  <div className="font-mono font-semibold text-[var(--text-primary)]">{p.value}</div>
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
          meaning={`Portfolio HHI is ${hhi.toFixed(4)} — classified as "${hhiLabel}". Peak bucket: "${concentration.peakBucket}" at ${fmtMXN(concentration.peakAmount)} (${fmtPct(totalExposure > 0 ? concentration.peakAmount / totalExposure : 0)} of total). ${hhi > 0.25 ? "High concentration implies reduced negotiating leverage on bid-ask spreads." : "Portfolio is diversified — favourable execution conditions."}`}
          guidance={[
            "HHI > 0.25 indicates high concentration — consider spreading trades across adjacent tenors.",
            "Peak bucket represents highest liquidity demand — sequence this trade first in execution.",
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "HHI Index",  value: hhi.toFixed(4), color: hhiColor, sub: hhiLabel },
              { label: "Peak Bucket",value: concentration.peakBucket, color: "var(--accent-cyan)", sub: fmtMXN(concentration.peakAmount) },
              { label: "# Buckets", value: String(buckets.length), color: "var(--text-primary)", sub: `${buckets.filter(b => b.suppressed).length} suppressed` },
            ].map(kpi => (
              <div key={kpi.label} className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-3">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{kpi.label}</div>
                <div className="text-xl font-mono font-bold mt-0.5" style={{ color: kpi.color }}>{kpi.value}</div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{kpi.sub}</div>
              </div>
            ))}
          </div>

          <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
            <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Exposure by Bucket — Concentration View</div>
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
            <div className="flex flex-wrap gap-4 mt-2 text-[10px] font-mono text-[var(--text-tertiary)]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: "#F87171" }} />{"> 60% — HIGH CONC"}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: "#FBB347" }} />30–60% — MODERATE</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: "#22D3EE" }} />{"< 30% — OK"}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table-enterprise w-full">
              <thead><tr><th>Rank</th><th>Bucket</th><th className="numeric">Exposure</th><th className="numeric">% of Total</th><th className="numeric">Coverage</th><th>Risk Flag</th></tr></thead>
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
                        <td className="font-mono text-[var(--text-tertiary)]">{rank + 1}</td>
                        <td className="font-mono text-[var(--accent-cyan)]">{b.bucket}</td>
                        <td className="numeric font-mono">{fmtMXN(Math.abs(b.commercial_exposure_mxn))}</td>
                        <td className="numeric font-mono">{fmtPct(pct)}</td>
                        <td className="numeric font-mono">{fmtPct(cov)}</td>
                        <td>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 border rounded" style={{ color: flagColor, borderColor: flagColor, background: `color-mix(in srgb, ${flagColor} 8%, transparent)` }}>
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
          <div className="space-y-5">
            {/* Header */}
            <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest mb-1">R-06 — Executive Briefing</div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                    Committee Governance Snapshot
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Auto-generated briefing for board / treasury committee distribution. One-click PDF export below.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={async () => { try { await exportExecutiveBriefPdf(result, baseCcy); } catch (e) { console.error(e); } }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-mono border border-[var(--border-rim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></svg>
                    Generate PDF Brief ↓
                  </button>
                </div>
              </div>
            </div>

            {/* 5-metric KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "Total Exposure",  value: `${fmtMXN(Math.abs(summary.total_commercial_exposure_mxn))} ${baseCcy}`, color: "var(--text-primary)" },
                { label: "Coverage",        value: fmtPct(covPct),  color: covPct >= 0.95 ? "var(--accent-green)" : "var(--accent-amber)" },
                { label: "Residual",        value: `${fmtMXN(Math.abs(summary.total_residual_mxn))} ${baseCcy}`, color: summary.total_residual_mxn !== 0 ? "var(--accent-amber)" : "var(--accent-green)" },
                { label: "Friction Cost",   value: fmtUSD(summary.total_friction_usd), color: "var(--accent-amber)" },
                { label: "Worst-Case",      value: fmtUSD(kpis.worstCaseLoss), color: "var(--accent-red)" },
              ].map(kpi => (
                <div key={kpi.label} className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-3">
                  <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">{kpi.label}</div>
                  <div className="text-sm font-mono font-bold mt-1 leading-tight" style={{ color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Radar + Narrative */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
                <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Risk Posture Radar</div>
                <RadarChart dimensions={radarDimensions} label="Portfolio Risk Posture" height={260} />
                <div className="grid grid-cols-5 gap-1 mt-1">
                  {radarDimensions.map(d => (
                    <div key={d.name} className="text-center">
                      <div className="text-[9px] text-[var(--text-tertiary)] font-mono truncate">{d.name}</div>
                      <div className="text-[10px] font-mono font-bold text-[var(--accent-cyan)]">{d.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
                <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Assessment Narrative</div>
                {narrative.length > 0 ? (
                  <ol className="space-y-3">
                    {narrative.map((line: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <span className="text-[var(--accent-cyan)] font-mono shrink-0 mt-0.5">{i + 1}.</span>
                        <span className="text-[var(--text-secondary)] leading-relaxed">{line}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-[var(--text-tertiary)]">
                    Narrative generation requires additional reportCalcs inputs. Run a full calculation to enable.
                  </p>
                )}
              </div>
            </div>

            {/* Compliance + Approval */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
                <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Policy Compliance Summary</div>
                <div className="flex items-center gap-4">
                  <div
                    className="text-4xl font-mono font-bold"
                    style={{ color: compliance.classification === "ALIGNED" ? "var(--accent-green)" : compliance.classification === "MINOR DEVIATIONS" ? "var(--accent-amber)" : "var(--accent-red)" }}
                  >
                    {compliance.score}%
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{compliance.classification}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{compliance.checks.filter(c => c.pass).length}/{compliance.checks.length} rules passed</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">Validation: {result.validation_report.status}</div>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-4">
                <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Signature Block</div>
                <div className="grid grid-cols-3 gap-3">
                  {["Prepared By", "Reviewed By", "Approved By"].map(role => (
                    <div key={role} className="text-center">
                      <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2">{role}</div>
                      <div className="h-8 border-b border-[var(--border-rim)]" />
                      <div className="text-[9px] text-[var(--text-tertiary)] mt-1">Signature / Date</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Run attestation footer */}
            <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded p-3 flex flex-wrap gap-4 text-[10px] font-mono text-[var(--text-tertiary)]">
              <span>Run: <span className="text-[var(--text-secondary)]">{result.run_id}</span></span>
              <span>Engine: <span className="text-[var(--text-secondary)]">v{result.run_envelope.engine_version}</span></span>
              <span>Inputs SHA-256: <span className="text-[var(--text-secondary)]">{result.run_envelope.inputs_hash.slice(0, 16)}…</span></span>
              <span>Outputs SHA-256: <span className="text-[var(--text-secondary)]">{result.run_envelope.outputs_hash.slice(0, 16)}…</span></span>
            </div>
          </div>
        );
      })()}

      {/* Hidden print-only: full panel stack */}
      <div className="hidden print:block space-y-8">
        <ExecutiveSummaryPanel
          summary={summary} totals={scenario_results.totals} buckets={buckets}
          trades={[]} hedges={[]}
          market={{ as_of: result.run_envelope.timestamp, spot_usdmxn: 0, forward_points_by_month: {}, provider_metadata: {} }}
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
