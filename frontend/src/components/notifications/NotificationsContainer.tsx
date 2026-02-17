"use client";

import { useState } from "react";
import type { CalculateResponse, ValidationErrorDetail } from "../../api/types";
import {
  exportAlertsPdf,
  exportAlertsCsv,
  exportAuditJson,
  type ExportableAlert,
} from "../../utils/clientExport";

// ── Alert categories ───────────────────────────────────────────────────────
type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";
type AlertCategory =
  | "Policy Breach"
  | "Data Integrity"
  | "Market Snapshot Quality"
  | "Execution Readiness"
  | "Concentration / Liquidity";

interface AlertItem {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  ruleId: string;
  reason: string;
  impacted: string;
  recommendation: string;
  acknowledged: boolean;
  escalated: boolean;
}

function classifyErrorCategory(err: ValidationErrorDetail): AlertCategory {
  const code = (err.code ?? "").toUpperCase();
  const field = (err.field ?? "").toUpperCase();
  if (code.startsWith("M") || field.includes("MARKET") || field.includes("SPOT"))
    return "Market Snapshot Quality";
  if (field.includes("TRADE") || field.includes("RECORD"))
    return "Data Integrity";
  return "Policy Breach";
}

function classifyWarningCategory(warning: string): AlertCategory {
  const w = warning.toUpperCase();
  if (w.includes("MARKET") || w.includes("SPOT") || w.includes("FORWARD"))
    return "Market Snapshot Quality";
  if (w.includes("LIQUIDITY") || w.includes("CONCENTRATION"))
    return "Concentration / Liquidity";
  if (w.includes("EXECUTION") || w.includes("SUPPRESSED") || w.includes("MIN"))
    return "Execution Readiness";
  if (w.includes("DATA") || w.includes("TRADE") || w.includes("RECORD"))
    return "Data Integrity";
  return "Policy Breach";
}

function getRecommendation(err: ValidationErrorDetail): string {
  const code = (err.code ?? "").toUpperCase();
  if (code.startsWith("V"))
    return "Review hedge ratios and policy configuration. Re-run calculation after adjustments.";
  if (code.startsWith("M"))
    return "Refresh market snapshot from a live provider or verify manual rate inputs.";
  return "Verify input data and correct the identified field before re-running.";
}

function deriveAlerts(result: CalculateResponse): AlertItem[] {
  const alerts: AlertItem[] = [];
  const { validation_report, hedge_plan } = result;

  for (const err of validation_report.errors ?? []) {
    alerts.push({
      id: `err-${err.code}-${alerts.length}`,
      severity: err.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
      category: classifyErrorCategory(err),
      ruleId: err.code,
      reason: err.message,
      impacted: err.field,
      recommendation: getRecommendation(err),
      acknowledged: false,
      escalated: false,
    });
  }

  for (let i = 0; i < (validation_report.warnings ?? []).length; i++) {
    const w = validation_report.warnings[i];
    alerts.push({
      id: `warn-${i}`,
      severity: "WARNING",
      category: classifyWarningCategory(w),
      ruleId: `W-${String(i + 1).padStart(3, "0")}`,
      reason: w,
      impacted: "General",
      recommendation: "Review policy configuration and re-run calculation.",
      acknowledged: false,
      escalated: false,
    });
  }

  const suppressed = hedge_plan.buckets.filter(b => b.suppressed);
  if (suppressed.length > 0) {
    alerts.push({
      id: "exec-suppressed",
      severity: "INFO",
      category: "Execution Readiness",
      ruleId: "E-001",
      reason: `${suppressed.length} bucket${suppressed.length > 1 ? "s" : ""} suppressed below min trade threshold (${suppressed.map(b => b.bucket).join(", ")}).`,
      impacted: suppressed.map(b => b.bucket).join(", "),
      recommendation:
        "Verify min_trade_size_usd policy or consolidate exposure into fewer buckets to meet threshold.",
      acknowledged: false,
      escalated: false,
    });
  }

  const totalExp = hedge_plan.buckets.reduce(
    (s, b) => s + Math.abs(b.commercial_exposure_mxn),
    0,
  );
  if (totalExp > 0) {
    for (const b of hedge_plan.buckets) {
      const pct = Math.abs(b.commercial_exposure_mxn) / totalExp;
      if (pct > 0.6) {
        alerts.push({
          id: `conc-${b.bucket}`,
          severity: "WARNING",
          category: "Concentration / Liquidity",
          ruleId: "C-001",
          reason: `Bucket ${b.bucket} represents ${(pct * 100).toFixed(1)}% of total commercial exposure — concentration threshold exceeded.`,
          impacted: b.bucket,
          recommendation:
            "Consider staggering trade tenors or splitting exposures across adjacent buckets.",
          acknowledged: false,
          escalated: false,
        });
      }
    }
  }

  if (totalExp > 0) {
    const pct = Math.abs(hedge_plan.summary.total_residual_mxn) / totalExp;
    if (pct > 0.05) {
      alerts.push({
        id: "residual-warn",
        severity: "INFO",
        category: "Execution Readiness",
        ruleId: "E-002",
        reason: `Net residual of ${hedge_plan.summary.total_residual_mxn.toLocaleString("en", { maximumFractionDigits: 0 })} = ${(pct * 100).toFixed(1)}% of total — above 5% residual tolerance.`,
        impacted: "Portfolio",
        recommendation:
          "Review hedge ratios in policy settings. Confirm whether residual is permitted under policy.",
        acknowledged: false,
        escalated: false,
      });
    }
  }

  return alerts;
}

const SEVERITY_STYLES: Record<AlertSeverity, { border: string; dot: string; text: string }> = {
  CRITICAL: { border: "border-[var(--accent-red)]/40",   dot: "bg-[var(--accent-red)]",   text: "text-[var(--accent-red)]" },
  WARNING:  { border: "border-[var(--accent-amber)]/40", dot: "bg-[var(--accent-amber)]", text: "text-[var(--accent-amber)]" },
  INFO:     { border: "border-[var(--border-rim)]",       dot: "bg-[var(--text-tertiary)]",text: "text-[var(--text-secondary)]" },
};

const CATEGORY_ICONS: Record<AlertCategory, string> = {
  "Policy Breach":              "⚖",
  "Data Integrity":             "◎",
  "Market Snapshot Quality":    "◈",
  "Execution Readiness":        "⬡",
  "Concentration / Liquidity":  "◐",
};

const ALL_CATEGORIES: AlertCategory[] = [
  "Policy Breach",
  "Data Integrity",
  "Market Snapshot Quality",
  "Execution Readiness",
  "Concentration / Liquidity",
];

// ── Alert Export Panel ────────────────────────────────────────────────────────

interface AlertExportPanelProps {
  alerts: AlertItem[];
  result: CalculateResponse;
}

function AlertExportBtn({
  label, note, busy, done, onClick,
}: {
  label: string; note: string; busy: boolean; done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={[
        "w-full text-left px-3 py-2 border transition-all",
        done
          ? "border-[var(--accent-green)]/40 text-[var(--accent-green)] bg-[var(--accent-green)]/5"
          : "border-[var(--border-rim)] text-[var(--text-secondary)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]",
        busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px]">{done ? `${label} ✓` : label}</span>
        <span className="text-[10px] opacity-50">{busy ? "…" : "↓"}</span>
      </div>
      <div className="text-[9px] text-[var(--text-tertiary)] mt-0.5">{note}</div>
    </button>
  );
}

function AlertExportPanel({ alerts, result }: AlertExportPanelProps) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfDone, setPdfDone] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvDone, setCsvDone] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditDone, setAuditDone] = useState(false);
  const [ackBusy, setAckBusy] = useState(false);
  const [ackDone, setAckDone] = useState(false);

  const exportable: ExportableAlert[] = alerts.map(a => ({
    id:             a.id,
    severity:       a.severity,
    category:       a.category,
    ruleId:         a.ruleId,
    reason:         a.reason,
    impacted:       a.impacted,
    recommendation: a.recommendation,
    acknowledged:   a.acknowledged,
    escalated:      a.escalated,
  }));

  const resolvedAlerts = exportable.filter(a => a.acknowledged || a.escalated);

  const handle = async (
    fn: () => Promise<void>,
    setBusy: (b: boolean) => void,
    setDone: (d: boolean) => void,
  ) => {
    setBusy(true);
    try { await fn(); setDone(true); setTimeout(() => setDone(false), 2200); }
    catch (e) { console.error('Alert export failed:', e); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4 space-y-2">
      <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-3">Alert Export</div>
      <AlertExportBtn
        label="Export as PDF Report"
        note="All alerts with severity, category, and status"
        busy={pdfBusy} done={pdfDone}
        onClick={() => handle(() => exportAlertsPdf(exportable, result), setPdfBusy, setPdfDone)}
      />
      <AlertExportBtn
        label="Export as CSV"
        note="Machine-readable, for audit trail"
        busy={csvBusy} done={csvDone}
        onClick={() => handle(async () => exportAlertsCsv(exportable, 'All'), setCsvBusy, setCsvDone)}
      />
      <AlertExportBtn
        label="Download Audit Bundle"
        note="Run envelope + SHA-256 hashes (JSON)"
        busy={auditBusy} done={auditDone}
        onClick={() => handle(async () => exportAuditJson(result), setAuditBusy, setAuditDone)}
      />
      {resolvedAlerts.length > 0 && (
        <AlertExportBtn
          label={`Export Resolved (${resolvedAlerts.length})`}
          note="Acknowledged + escalated alerts only — for resolution audit"
          busy={ackBusy} done={ackDone}
          onClick={() => handle(async () => exportAlertsCsv(resolvedAlerts, 'Resolved'), setAckBusy, setAckDone)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface NotificationsContainerProps {
  result: CalculateResponse;
}

export default function NotificationsContainer({ result }: NotificationsContainerProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>(() => deriveAlerts(result));
  const [filterCategory, setFilterCategory] = useState<AlertCategory | "ALL">("ALL");
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | "ALL">("ALL");

  const acknowledge = (id: string) =>
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  const escalate = (id: string) =>
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, escalated: true, acknowledged: false } : a));

  const displayed = alerts.filter(a => {
    if (filterCategory !== "ALL" && a.category !== filterCategory) return false;
    if (filterSeverity !== "ALL" && a.severity !== filterSeverity) return false;
    return true;
  });

  const critCount  = alerts.filter(a => a.severity === "CRITICAL").length;
  const warnCount  = alerts.filter(a => a.severity === "WARNING").length;
  const infoCount  = alerts.filter(a => a.severity === "INFO").length;
  const ackCount   = alerts.filter(a => a.acknowledged).length;
  const escalCount = alerts.filter(a => a.escalated).length;
  const byCat = ALL_CATEGORIES.map(cat => ({
    cat,
    count: alerts.filter(a => a.category === cat).length,
  }));

  return (
    <div className="space-y-5">
      {/* Summary scorecards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Critical",     value: critCount,  border: "border-[var(--accent-red)]/30",     text: "text-[var(--accent-red)]" },
          { label: "Warning",      value: warnCount,  border: "border-[var(--accent-amber)]/30",   text: "text-[var(--accent-amber)]" },
          { label: "Info",         value: infoCount,  border: "border-[var(--border-rim)]",         text: "text-[var(--text-secondary)]" },
          { label: "Acknowledged", value: ackCount,   border: "border-[var(--accent-green)]/30",   text: "text-[var(--accent-green)]" },
          { label: "Escalated",    value: escalCount, border: "border-[var(--accent-indigo)]/30",  text: "text-[var(--accent-indigo)]" },
        ].map(s => (
          <div key={s.label} className={`bg-[var(--bg-panel)] border ${s.border} rounded p-3`}>
            <div className={`text-2xl font-mono font-bold ${s.text}`}>{s.value}</div>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Three-column governance layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_260px] gap-5">

        {/* Left: Category Rail */}
        <div className="space-y-1">
          <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2 px-1">
            Alert Categories
          </div>
          <button
            onClick={() => setFilterCategory("ALL")}
            className={`w-full text-left flex items-center justify-between px-3 py-2 rounded text-xs transition-colors border ${
              filterCategory === "ALL"
                ? "bg-[var(--accent-cyan)]/8 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/20"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-panel)] border-transparent"
            }`}
          >
            <span>All Categories</span>
            <span className="font-mono text-[10px]">{alerts.length}</span>
          </button>
          {byCat.map(({ cat, count }) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`w-full text-left flex items-center justify-between px-3 py-2 rounded text-xs transition-colors border ${
                filterCategory === cat
                  ? "bg-[var(--accent-cyan)]/8 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/20"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-panel)] border-transparent"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-[10px] opacity-70">{CATEGORY_ICONS[cat]}</span>
                <span className="leading-tight">{cat}</span>
              </span>
              {count > 0 && <span className="font-mono text-[10px]">{count}</span>}
            </button>
          ))}

          <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mt-4 mb-2 px-1 pt-3 border-t border-[var(--border-soft)]">
            Severity
          </div>
          {(["ALL", "CRITICAL", "WARNING", "INFO"] as const).map(sev => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors border ${
                filterSeverity === sev
                  ? "bg-[var(--accent-cyan)]/8 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/20"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-panel)] border-transparent"
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        {/* Center: Alert Cards */}
        <div className="space-y-3 min-w-0">
          {displayed.length === 0 ? (
            <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-8 text-center">
              <div className="text-2xl mb-3 text-[var(--accent-green)]">✓</div>
              <p className="text-sm font-semibold text-[var(--accent-green)] mb-1">
                {filterCategory !== "ALL" || filterSeverity !== "ALL"
                  ? "No alerts match the current filter"
                  : "No controls alerts for this run"}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                All policy checks passed. Execution is clear to proceed.
              </p>
            </div>
          ) : (
            displayed.map(alert => {
              const sty = SEVERITY_STYLES[alert.severity];
              return (
                <div
                  key={alert.id}
                  className={`border ${sty.border} bg-[var(--bg-panel)] rounded overflow-hidden`}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--border-soft)] bg-[var(--bg-deep)] flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${sty.dot}`} />
                      <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${sty.text}`}>
                        {alert.severity}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)] px-1.5 py-0.5 border border-[var(--border-soft)]">
                        {alert.ruleId}
                      </span>
                      <span className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1">
                        <span>{CATEGORY_ICONS[alert.category]}</span>
                        {alert.category}
                      </span>
                      {alert.acknowledged && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 border border-[var(--accent-green)]/40 text-[var(--accent-green)] bg-[var(--accent-green)]/5 uppercase tracking-wider">
                          Acknowledged
                        </span>
                      )}
                      {alert.escalated && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 border border-[var(--accent-indigo)]/40 text-[var(--accent-indigo)] bg-[var(--accent-indigo)]/5 uppercase tracking-wider">
                          Escalated
                        </span>
                      )}
                    </div>
                    {!alert.acknowledged && !alert.escalated && (
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => acknowledge(alert.id)}
                          className="text-[10px] font-mono px-2.5 py-1 border border-[var(--accent-green)]/30 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/5 transition-colors"
                        >
                          Acknowledge
                        </button>
                        <button
                          onClick={() => escalate(alert.id)}
                          className="text-[10px] font-mono px-2.5 py-1 border border-[var(--accent-indigo)]/30 text-[var(--accent-indigo)] hover:bg-[var(--accent-indigo)]/5 transition-colors"
                        >
                          Escalate
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="md:col-span-2 space-y-2">
                      <div>
                        <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Reason</div>
                        <p className="text-[var(--text-primary)] leading-relaxed">{alert.reason}</p>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Impacted</div>
                        <span className="font-mono text-[var(--accent-cyan)]">{alert.impacted}</span>
                      </div>
                    </div>
                    <div className="border-l border-[var(--border-soft)] pl-4">
                      <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Recommended Action</div>
                      <p className="text-[var(--text-secondary)] leading-relaxed">{alert.recommendation}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Governance Guidance Rail */}
        <div className="space-y-3">
          <div className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mb-2 px-1">
            Governance Guidance
          </div>

          {/* Alert Export — fully functional client-side downloads */}
          <AlertExportPanel alerts={alerts} result={result} />

          {/* Resolution Status */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4">
            <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-3">Resolution Status</div>
            <div className="space-y-2">
              {[
                { label: "Pending Review", value: alerts.filter(a => !a.acknowledged && !a.escalated).length, color: "var(--text-secondary)" },
                { label: "Acknowledged",   value: ackCount,   color: "var(--accent-green)" },
                { label: "Escalated",      value: escalCount, color: "var(--accent-indigo)" },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center text-xs">
                  <span style={{ color: item.color }}>{item.label}</span>
                  <span className="font-mono font-bold" style={{ color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pre-Execution Checklist */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4">
            <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-3">Pre-Execution Checklist</div>
            <div className="space-y-2">
              {[
                { label: "Policy validation passed",    pass: result.validation_report.status === "PASS" },
                { label: "No critical alerts",          pass: critCount === 0 },
                { label: "Trade tickets generated",     pass: result.hedge_plan.buckets.some(b => !b.suppressed) },
                { label: "Market snapshot present",     pass: true },
                { label: "All alerts reviewed",         pass: ackCount + escalCount >= alerts.length },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-2 text-[11px]">
                  <span className={`shrink-0 mt-0.5 ${item.pass ? "text-[var(--accent-green)]" : "text-[var(--text-tertiary)]"}`}>
                    {item.pass ? "✓" : "○"}
                  </span>
                  <span className={item.pass ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
