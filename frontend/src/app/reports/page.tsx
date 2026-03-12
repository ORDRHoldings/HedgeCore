"use client";

/**
 * reports/page.tsx — ORDR Report Studio
 *
 * Enterprise-grade Report Studio. Bloomberg Terminal / BlackRock Aladdin benchmark.
 *
 * Features:
 * - Reports Home: recent, favorites, library, scheduled
 * - 30-preset template library with search, filter, tags
 * - AI Report Builder (goal → modules → AI plan → editable outline)
 * - Section outline tree (drag-reorder)
 * - Print-ready preview pane
 * - Export drawer (PDF, XLSX, PPT, ZIP)
 * - Validation & disclosures panels
 * - Data binding screen (run, policy, market snapshot)
 * - RBAC-aware (admin/editor/viewer)
 */

import { useState, useCallback, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import { REPORT_PRESETS, REPORT_CATEGORIES } from "../../constants/reportPresets";
import { useHedge } from "../../lib/hedgeContext";
import { listRuns, type RunSummary } from "../../api/runsClient";
import type {
  ReportTemplate, ReportDefinition, ReportSection, BuilderStep,
  AIReportGoal, ReportModule, ExportFormat, DataBindings,
  ReportValidationIssue, AIReportPlan,
} from "../../types/reportTypes";
import HelpPanelV2 from "@/components/help/HelpPanelV2";
import { REPORTS_HELP } from "@/lib/help";
import { PageShell } from "@/components/layout/PageShell";
import { FileText } from "lucide-react";

// Inline UUID v4 — no external dep
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Design tokens (white-background institutional) ────────────────────────────
const S = {
  // White-background institutional palette
  bgPage:    "#FAFAFA",
  bgPanel:   "#FFFFFF",
  bgSub:     "#F4F5F7",
  bgDeep:    "#ECEEF2",
  rimStrong: "#C8CDD8",
  rim:       "#DDE0E8",
  soft:      "#E8EAF0",
  primary:   "#0D1117",
  secondary: "#3D4451",
  tertiary:  "#6B7280",
  muted:     "#9CA3AF",
  cyan:      "#0284C7",
  cyanBg:    "#EFF6FF",
  amber:     "#B45309",
  amberBg:   "#FFFBEB",
  pass:      "#15803D",
  passBg:    "#F0FDF4",
  fail:      "#B91C1C",
  failBg:    "#FEF2F2",
  violet:    "#1D4ED8",
  violetBg:  "#EFF6FF",
  fontUI:    "'IBM Plex Sans', system-ui, sans-serif",
  fontMono:  "'IBM Plex Mono', 'Courier New', monospace",
} as const;

// ─── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ text, color, bg }: { text: string; color: string; bg?: string }) {
  return (
    <span style={{
      fontFamily:    S.fontMono,
      fontSize: 12,
      fontWeight:    700,
      letterSpacing: "0.07em",
      color,
      background:    bg ?? `color-mix(in srgb, ${color} 10%, transparent)`,
      border:        `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding:       "1px 6px",
      borderRadius:  2,
      whiteSpace:    "nowrap",
      textTransform: "uppercase",
    }}>
      {text}
    </span>
  );
}

// ─── Audience labels ───────────────────────────────────────────────────────────
const AUDIENCE_LABELS: Record<string, string> = {
  BOARD:"Board", CFO:"CFO", TREASURER:"Treasurer", RISK_COMMITTEE:"Risk Committee",
  AUDIT:"Audit", TRADER:"Trader", ANALYST:"Analyst", REGULATOR:"Regulator",
};
const MODULE_LABELS: Record<string, string> = {
  DASHBOARD:"Dashboard", POSITION_DESK:"Position Desk", POLICY_ENGINE:"Policy Engine",
  EXECUTION:"Execution", SCENARIO_STRESS:"Scenario / Stress", FX_RATES:"FX Rates",
  CONNECTOR_HEALTH:"Connectors", MACRO_OVERLAY:"Macro / Polisophic", AUDIT_COMPLIANCE:"Audit & Compliance",
};
const GOAL_LABELS: Record<AIReportGoal, string> = {
  BOARD_UPDATE:"Board Update", AUDIT_PACK:"Audit Pack", FX_HEDGE_RATIONALE:"FX Hedge Rationale",
  STRESS_SUMMARY:"Stress Summary", POLICY_REVIEW:"Policy Review", EXECUTION_SUMMARY:"Execution Summary",
  RISK_COMMITTEE_PACK:"Risk Committee Pack", QUARTERLY_TREASURY:"Quarterly Treasury", CUSTOM:"Custom",
};
const FORMAT_LABELS: Record<ExportFormat, string> = {
  PDF:"PDF", EXCEL:"Excel / XLSX", POWERPOINT:"PowerPoint", HTML:"HTML Portal",
  JSON:"JSON (Machine)", CSV:"CSV Bundle", ZIP_COMMITTEE:"Committee ZIP",
};
const SECTION_ICONS: Record<string, string> = {
  COVER_PAGE:"📋", TABLE_OF_CONTENTS:"📑", EXECUTIVE_SUMMARY:"📊", HEDGE_PLAN_TABLE:"📈",
  EXPOSURE_DECOMPOSITION:"🗂", SCENARIO_SENSITIVITY:"⚡", POLICY_COMPLIANCE:"✅",
  HEDGE_EFFICIENCY:"💹", FORWARD_CURVE:"📉", CONNECTOR_HEALTH:"🔌", DATA_QUALITY:"🔍",
  POSITION_REGISTER:"📂", EXECUTION_LOG:"⚙", APPROVAL_CHAIN:"🔐", POLICY_RATIONALE:"📜",
  STRESS_TEST_RESULTS:"🧪", MACRO_OVERLAY:"🌐", AUDIT_EVENTS:"📝", DISCLOSURES:"⚖",
  ASSUMPTIONS_REGISTRY:"🗝", CUSTOM_NARRATIVE:"✏",
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT UTILITIES — pure client-side, zero external dependencies
// ═══════════════════════════════════════════════════════════════════════════════

/** Trigger a browser download of a Blob. */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Sanitise a name into a safe filename stem. */
function safeStem(name: string): string {
  return (name || "report")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40);
}

/** Build a fully self-contained HTML report document. */
async function computeReportHash(
  bindings: DataBindings,
  sections: ReportSection[],
  presetId?: string | null,
  version: number = 1,
): Promise<string> {
  // Deterministic fingerprint: SHA-256 of sorted binding keys + section identifiers + preset + schema version
  const canonical = JSON.stringify({
    version,
    run_envelope_id: bindings.run_envelope_id ?? null,
    policy_id: bindings.policy_id ?? null,
    market_snapshot_id: bindings.market_snapshot_id ?? null,
    as_of_date: bindings.as_of_date ?? null,
    reporting_currency: bindings.reporting_currency ?? "USD",
    preset_id: presetId ?? null,
    sections: sections
      .filter(s => s.status === "INCLUDED")
      .sort((a, b) => a.order - b.order)
      .map(s => ({ type: s.type, title: s.title, order: s.order })),
  });
  try {
    const enc = new TextEncoder().encode(canonical);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Fallback if SubtleCrypto unavailable (SSR context)
    let h = 0;
    for (let i = 0; i < canonical.length; i++) {
      h = (Math.imul(31, h) + canonical.charCodeAt(i)) | 0;
    }
    return "fallback-" + Math.abs(h).toString(16).padStart(8, "0");
  }
}

function buildReportHTML(
  name: string,
  desc: string,
  bindings: DataBindings,
  sections: ReportSection[],
  reportHash?: string,
): string {
  const included = sections.filter(s => s.status === "INCLUDED");
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const tocRows = included
    .map(
      (s, i) =>
        `<tr><td style="width:28px;color:#9CA3AF;font-family:monospace;font-size: 12px">${i + 1}</td>` +
        `<td style="font-size:12px;padding:3px 0">${esc(s.title)}</td>` +
        `<td style="text-align:right;color:#9CA3AF;font-family:monospace;font-size: 12px">p.${i + 2}</td></tr>`,
    )
    .join("\n");

  const sectionBlocks = included
    .filter(s => !["COVER_PAGE", "TABLE_OF_CONTENTS"].includes(s.type))
    .map((s, i) => {
      const narrative = s.ai_assisted && s.narrative
        ? `<div style="background:#EFF6FF;border-left:3px solid #1D4ED8;padding:10px 12px;margin-top:8px;font-size:12px;line-height:1.6;color:#3D4451">
             <span style="font-family:monospace;font-size: 12px;font-weight:700;color:#1D4ED8;display:block;margin-bottom:4px">AI-ASSISTED NARRATIVE</span>
             ${esc(s.narrative)}
           </div>`
        : `<div style="background:#F4F5F7;padding:16px;text-align:center;font-family:monospace;font-size: 12px;color:#9CA3AF;border-radius:2px">[${esc(s.type)}] — data injected at generation time</div>`;
      return `<div style="margin-bottom:32px;padding-top:${i > 0 ? "28px" : "0"};border-top:${i > 0 ? "1px solid #E8EAF0" : "none"}">
        <h2 style="font-size:15px;font-weight:700;color:#0D1117;margin:0 0 10px">${esc(s.title)}</h2>
        ${narrative}
      </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name || "ORDR Report")}</title>
<style>
  body{margin:0;padding:0;background:#FAFAFA;font-family:'IBM Plex Sans',system-ui,sans-serif;color:#0D1117}
  .page{max-width:800px;margin:40px auto;background:#fff;border:1px solid #DDE0E8;padding:56px 64px;box-shadow:0 2px 12px rgba(0,0,0,.07)}
  @media print{body{background:#fff}.page{border:none;box-shadow:none;margin:0;padding:40px 48px}}
  h1,h2,h3{margin:0 0 8px}
  table{border-collapse:collapse;width:100%}
  td,th{padding:4px 8px 4px 0;vertical-align:top}
</style>
</head>
<body>
<div class="page">
  <!-- COVER -->
  <div style="border-bottom:3px solid #0284C7;padding-bottom:24px;margin-bottom:32px">
    <div style="font-family:monospace;font-size: 12px;font-weight:700;letter-spacing:.1em;color:#9CA3AF;margin-bottom:8px">ORDR TERMINAL — INSTITUTIONAL REPORT</div>
    <h1 style="font-size:24px;font-weight:700;color:#0D1117;margin-bottom:6px">${esc(name || "Untitled Report")}</h1>
    <p style="font-size:13px;color:#3D4451;margin:0 0 16px">${esc(desc || "")}</p>
    <table style="font-family:monospace;font-size: 12px">
      <tr>
        <td style="color:#9CA3AF;padding-right:24px">As of Date</td><td><strong>${esc(bindings.as_of_date ?? "—")}</strong></td>
        <td style="color:#9CA3AF;padding-right:24px;padding-left:32px">Currency</td><td><strong>${esc(bindings.reporting_currency ?? "USD")}</strong></td>
      </tr>
      <tr>
        <td style="color:#9CA3AF;padding-right:24px">Run ID</td><td><strong>${esc(bindings.run_envelope_id?.slice(0, 8) ?? "UNBOUND")}</strong></td>
        <td style="color:#9CA3AF;padding-right:24px;padding-left:32px">Policy ID</td><td><strong>${esc(bindings.policy_id?.slice(0, 8) ?? "UNBOUND")}</strong></td>
      </tr>
      <tr>
        <td style="color:#9CA3AF">Generated</td><td><strong>${esc(ts)}</strong></td>
        <td style="color:#9CA3AF;padding-left:32px">Sections</td><td><strong>${included.length}</strong></td>
      </tr>
    </table>
  </div>
  <!-- TOC -->
  <div style="margin-bottom:32px">
    <div style="font-family:monospace;font-size: 12px;font-weight:700;letter-spacing:.08em;color:#6B7280;margin-bottom:10px">TABLE OF CONTENTS</div>
    <table>${tocRows}</table>
  </div>
  <!-- SECTIONS -->
  ${sectionBlocks}
  <!-- DISCLOSURES FOOTER -->
  <div style="border-top:2px solid #DDE0E8;padding-top:16px;margin-top:32px">
    <div style="font-family:monospace;font-size: 12px;font-weight:700;letter-spacing:.08em;color:#9CA3AF;margin-bottom:6px">DISCLOSURES &amp; LIMITATIONS</div>
    <p style="font-family:'IBM Plex Sans',sans-serif;font-size: 12px;color:#6B7280;line-height:1.5;margin:0">
      This report is generated by ORDR and is intended for internal use only. It does not constitute financial, legal, or regulatory advice.
      All calculations reference Run ID [${esc(bindings.run_envelope_id?.slice(0, 8) ?? "UNBOUND")}] and are reproducible from the same inputs snapshot.
      FX rates are indicative unless marked LIVE. Stress scenarios are illustrative; past events do not guarantee future outcomes.
    </p>
    <p style="font-family:monospace;font-size: 12px;color:#6B7280;margin-top:8px;">
      REPORT HASH: ${esc(reportHash ?? "UNCOMPUTED")} &amp;nbsp;|&amp;nbsp;
      RUN ID: ${esc(bindings.run_envelope_id?.slice(0,8) ?? "UNBOUND")} &amp;nbsp;|&amp;nbsp;
      POLICY: ${esc(bindings.policy_id?.slice(0,8) ?? "UNBOUND")}
    </p>
  </div>
</div>
</body>
</html>`;
}

/** Build a CSV workbook from report metadata + section list. */
function buildReportCSV(
  name: string,
  bindings: DataBindings,
  sections: ReportSection[],
): string {
  const included = sections.filter(s => s.status === "INCLUDED");
  const esc = (v: string | number | undefined) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines: string[] = [];
  // Sheet 1: Report Metadata
  lines.push("ORDR REPORT STUDIO — EXPORT");
  lines.push(`Report Name,${esc(name)}`);
  lines.push(`As-of Date,${esc(bindings.as_of_date)}`);
  lines.push(`Reporting Currency,${esc(bindings.reporting_currency ?? "USD")}`);
  lines.push(`Run Envelope ID,${esc(bindings.run_envelope_id)}`);
  lines.push(`Policy ID,${esc(bindings.policy_id)}`);
  lines.push(`Generated,${esc(new Date().toISOString())}`);
  lines.push("");
  // Sheet 2: Section Register
  lines.push("SECTION REGISTER");
  lines.push("Order,Section ID,Title,Type,Status,AI Assisted,Citations");
  included.forEach((s, i) =>
    lines.push(
      [
        i + 1,
        esc(s.id),
        esc(s.title),
        esc(s.type),
        esc(s.status),
        s.ai_assisted ? "YES" : "NO",
        esc(s.citations.join("; ")),
      ].join(","),
    ),
  );
  lines.push("");
  // Sheet 3: AI Narratives
  const aiSections = included.filter(s => s.ai_assisted && s.narrative);
  if (aiSections.length > 0) {
    lines.push("AI NARRATIVE SCAFFOLDS");
    lines.push("Section Title,Narrative");
    aiSections.forEach(s => lines.push(`${esc(s.title)},${esc(s.narrative ?? "")}`));
  }
  return lines.join("\r\n");
}

// ─── Navigation tabs ───────────────────────────────────────────────────────────
type MainView = "HOME" | "LIBRARY" | "BUILDER" | "SAVED" | "SETTINGS";

// ══════════════════════════════════════════════════════════════════════════════
// HOME PANEL
// ══════════════════════════════════════════════════════════════════════════════
function HomePanel({
  onNewReport, onOpenLibrary, onSelectPreset, savedReports,
  availableRuns, runsLoading, onBindRun,
}: {
  onNewReport: () => void;
  onOpenLibrary: () => void;
  onSelectPreset: (t: ReportTemplate) => void;
  savedReports: ReportDefinition[];
  availableRuns: RunSummary[];
  runsLoading: boolean;
  onBindRun: (runId: string) => void;
}) {
  const { result } = useHedge();

  const quickActions = [
    { label: "Board FX Risk Pack",         id: "RPT-001", icon: "📊", tag: "PDF · 12 pages" },
    { label: "CFO Monthly Dashboard",       id: "RPT-002", icon: "📉", tag: "PDF · 4 pages" },
    { label: "Risk Committee Pack",         id: "RPT-008", icon: "⚡", tag: "ZIP · 14 pages" },
    { label: "Full Audit Pack",             id: "RPT-023", icon: "📝", tag: "ZIP · 18 pages" },
    { label: "FX Hedge Plan Report",        id: "RPT-004", icon: "📈", tag: "PDF · 8 pages" },
    { label: "Stress Test Deep-Dive",       id: "RPT-009", icon: "🧪", tag: "PDF · 10 pages" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Engine run status + run history panel */}
      <div style={{ border: `1px solid ${S.rim}`, borderRadius: 3, overflow: "hidden" }}>
        {/* Status bar */}
        <div style={{
          background: result ? S.passBg : availableRuns.length > 0 ? "#FFFBEB" : S.amberBg,
          padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 10,
          borderBottom: (!result && availableRuns.length > 0) ? `1px solid #FDE68A` : "none",
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
            color: result ? S.pass : availableRuns.length > 0 ? "#B45309" : S.amber }}>
            {result ? "● ENGINE RUN ACTIVE" : runsLoading ? "⟳ LOADING RUNS…"
              : availableRuns.length > 0 ? `⚡ ${availableRuns.length} RUN${availableRuns.length !== 1 ? "S" : ""} AVAILABLE — select one to bind`
              : "⚠ NO ENGINE RUN"}
          </span>
          <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, flex: 1 }}>
            {result
              ? `Run ${result.run_id.slice(0, 8).toUpperCase()}… · ${new Date(result.run_envelope.timestamp).toLocaleString()} · Active binding — all report sections will reference this run.`
              : availableRuns.length > 0
              ? "Click BIND + BUILD on a run below to open the Report Builder with live data attached."
              : "Complete a hedge calculation on the Execution Desk, then return here to generate reports."}
          </span>
          {!result && !runsLoading && availableRuns.length === 0 && (
            <a href="/hedge-desk" style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
              color: S.cyan, textDecoration: "none", border: `1px solid ${S.cyan}`,
              padding: "3px 10px", borderRadius: 2, whiteSpace: "nowrap" }}>
              → Execution Desk
            </a>
          )}
        </div>
        {/* Run history table */}
        {!result && availableRuns.length > 0 && (
          <div style={{ background: S.bgPanel }}>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 70px 70px 110px",
              padding: "5px 14px", background: S.bgSub, borderBottom: `1px solid ${S.rim}` }}>
              {["RUN ID", "CREATED", "TRADES", "HEDGES", ""].map(h => (
                <span key={h} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.08em", color: S.muted }}>{h}</span>
              ))}
            </div>
            {availableRuns.slice(0, 6).map((run, i) => (
              <div key={run.run_id} style={{ display: "grid", gridTemplateColumns: "150px 1fr 70px 70px 110px",
                padding: "8px 14px",
                borderBottom: i < Math.min(availableRuns.length, 6) - 1 ? `1px solid ${S.soft}` : "none",
                alignItems: "center" }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: "#7C3AED", fontWeight: 700,
                  letterSpacing: "0.04em" }}>{run.run_id.slice(0, 8).toUpperCase()}</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>
                  {new Date(run.created_at).toLocaleString()}</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{run.trade_count}</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{run.hedge_count}</span>
                <button onClick={() => onBindRun(run.run_id)} style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
                  color: "#FFFFFF", background: S.cyan, border: "none",
                  padding: "4px 10px", borderRadius: 2, cursor: "pointer",
                }}>BIND + BUILD →</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick-start grid */}
      <div>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 12 }}>
          QUICK START — MOST USED PRESETS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {quickActions.map(qa => {
            const preset = REPORT_PRESETS.find(p => p.template_id === qa.id);
            return (
            <button
              key={qa.id}
              onClick={() => preset ? onSelectPreset(preset) : onNewReport()}
              style={{
                background:    S.bgPanel,
                border:        `1px solid ${S.rim}`,
                borderRadius:  3,
                padding:       "12px 14px",
                textAlign:     "left",
                cursor:        "pointer",
                display:       "flex",
                flexDirection: "column",
                gap:           4,
                transition:    "border-color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = S.cyan)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = S.rim)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16 }}>{qa.icon}</span>
                <span style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: S.primary }}>{qa.label}</span>
              </div>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>{qa.tag}</span>
            </button>
          );
          })}
        </div>
      </div>

      {/* Two columns: Recent + Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        {/* Recent reports */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3 }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${S.rim}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
              RECENT REPORTS
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>{savedReports.length} SAVED</span>
          </div>
          {savedReports.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, marginBottom: 8 }}>
                No saved reports yet.
              </div>
              <button
                onClick={onNewReport}
                style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
                  color: S.bgPanel, background: S.cyan, border: "none", padding: "6px 14px",
                  borderRadius: 2, cursor: "pointer",
                }}
              >
                BUILD FIRST REPORT →
              </button>
            </div>
          ) : (
            savedReports.slice(0, 6).map(r => (
              <div key={r.report_id} style={{
                padding: "10px 14px", borderBottom: `1px solid ${S.soft}`,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: S.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>{new Date(r.updated_at).toLocaleDateString()}</div>
                </div>
                <Badge text={r.status} color={r.status === "FINAL" ? S.pass : r.status === "DRAFT" ? S.amber : S.cyan} />
              </div>
            ))
          )}
        </div>

        {/* Stats panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "PRESET TEMPLATES", value: `${REPORT_PRESETS.length}`, color: S.cyan },
            { label: "CATEGORIES",       value: `${REPORT_CATEGORIES.length}`, color: S.violet },
            { label: "SAVED REPORTS",    value: `${savedReports.length}`, color: S.pass },
            { label: "ENGINE RUNS",      value: runsLoading ? "…" : result ? `${availableRuns.length || 1} available` : availableRuns.length > 0 ? `${availableRuns.length} available` : "None", color: result || availableRuns.length > 0 ? S.pass : S.amber },
          ].map(s => (
            <div key={s.label} style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3,
              padding: "12px 14px", borderLeft: `3px solid ${s.color}`,
            }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.muted, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary }}>{s.value}</div>
            </div>
          ))}
          <button
            onClick={onOpenLibrary}
            style={{
              fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: S.cyan,
              background: S.cyanBg, border: `1px solid ${S.cyan}`, borderRadius: 2,
              padding: "8px 14px", cursor: "pointer", letterSpacing: "0.02em",
            }}
          >
            Browse Full Library →
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PRESET LIBRARY PANEL
// ══════════════════════════════════════════════════════════════════════════════
function LibraryPanel({ onSelect }: { onSelect: (t: ReportTemplate) => void }) {
  const [search, setSearch]   = useState("");
  const [catFilter, setCat]   = useState<string>("ALL");
  const [audFilter, setAud]   = useState<string>("ALL");

  const filtered = useMemo(() => {
    return REPORT_PRESETS.filter(t => {
      if (catFilter !== "ALL" && t.category !== catFilter) return false;
      if (audFilter !== "ALL" && !t.audience.includes(audFilter as never)) return false;
      if (search) {
        const q = search.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q));
      }
      return true;
    });
  }, [search, catFilter, audFilter]);

  const catColors: Record<string, string> = {
    EXECUTIVE_BOARD:"#0284C7", TREASURY_FX:"#15803D", RISK_COMMITTEE:"#B45309",
    POLICY_PACK:"#1D4ED8", EXECUTION_PACK:"#0E7490", SCENARIO_STRESS:"#B91C1C",
    EXPOSURE_DECOMP:"#047857", DATA_QUALITY:"#7C3AED", CONNECTOR_HEALTH:"#C2410C",
    COMPLIANCE_AUDIT:"#1D4ED8", MULTI_CURRENCY:"#0891B2",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filter bar */}
      <div style={{
        background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3,
        padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <input
          type="text" placeholder="Search reports, tags, keywords…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, fontFamily: S.fontUI, fontSize: 12, color: S.primary,
            background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
            padding: "5px 10px", outline: "none",
          }}
        />
        <select
          value={catFilter} onChange={e => setCat(e.target.value)}
          style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, padding: "5px 8px" }}
        >
          <option value="ALL">All Categories</option>
          {REPORT_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label} ({c.count})</option>)}
        </select>
        <select
          value={audFilter} onChange={e => setAud(e.target.value)}
          style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, padding: "5px 8px" }}
        >
          <option value="ALL">All Audiences</option>
          {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>{filtered.length} reports</span>
      </div>

      {/* Results grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {filtered.map(t => {
          const catColor = catColors[t.category] ?? S.cyan;
          return (
            <div
              key={t.template_id}
              style={{
                background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3,
                padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8,
                transition: "border-color 0.12s, box-shadow 0.12s",
                cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = catColor; e.currentTarget.style.boxShadow = `0 0 0 1px ${catColor}22`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = S.rim; e.currentTarget.style.boxShadow = "none"; }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: catColor, fontWeight: 700, letterSpacing: "0.06em" }}>
                      {t.template_id}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>v{t.version}</span>
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.primary, lineHeight: 1.2 }}>{t.name}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
                  <Badge text={FORMAT_LABELS[t.default_export_format]} color={catColor} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted, textAlign: "right" }}>~{t.estimated_pages}p</span>
                </div>
              </div>

              {/* Description */}
              <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, margin: 0, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {t.description}
              </p>

              {/* Audience + modules */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {t.audience.slice(0, 3).map(a => (
                  <span key={a} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, background: S.bgSub, border: `1px solid ${S.rim}`, padding: "1px 5px", borderRadius: 2 }}>
                    {AUDIENCE_LABELS[a] ?? a}
                  </span>
                ))}
                {t.audience.length > 3 && (
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>+{t.audience.length - 3}</span>
                )}
              </div>

              {/* Sections count + action */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4, borderTop: `1px solid ${S.soft}` }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>
                  {t.default_sections.length} sections
                </span>
                <button
                  onClick={() => onSelect(t)}
                  style={{
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                    color: catColor, background: "transparent", border: `1px solid ${catColor}`,
                    borderRadius: 2, padding: "3px 10px", cursor: "pointer",
                  }}
                >
                  USE PRESET →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BUILDER SHELL
// ══════════════════════════════════════════════════════════════════════════════
function BuilderShell({
  template,
  savedReport,
  onSave,
  runEnvelopeId,
  ownerEmail,
  token,
}: {
  template: ReportTemplate | null;
  savedReport?: ReportDefinition | null;
  onSave: (def: ReportDefinition) => void;
  runEnvelopeId?: string;
  ownerEmail?: string;
  token?: string | null;
}) {
  // If restoring a saved report, use its data; otherwise use template defaults
  const initSections = savedReport
    ? savedReport.sections
    : template?.default_sections.map((s, i) => ({ ...s, id: `sec-${i}-${uuidv4().slice(0,4)}` })) ?? [];

  const [step, setStep]               = useState<BuilderStep>(template || savedReport ? "CONFIGURE" : "PRESET");
  const [name, setName]               = useState(savedReport?.name ?? template?.name ?? "");
  const [desc, setDesc]               = useState(savedReport?.description ?? template?.description ?? "");
  const [sections, setSections]       = useState<ReportSection[]>(initSections);
  const [bindings, setBindings]       = useState<DataBindings>(savedReport?.bindings ?? {
    run_envelope_id:      runEnvelopeId,
    reporting_currency:   "USD",
    as_of_date:           new Date().toISOString().slice(0, 10),
  });
  const [selectedGoal, setGoal]       = useState<AIReportGoal>("BOARD_UPDATE");
  const [goalDesc, setGoalDesc]       = useState("");
  const [selModules, setModules]      = useState<ReportModule[]>(template?.modules ?? []);
  const [aiPlan, setAiPlan]           = useState<AIReportPlan | null>(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiError, setAiError]         = useState<string | null>(null);
  const [validationIssues, setIssues] = useState<ReportValidationIssue[]>([]);
  const [exportFormats, setFormats]   = useState<ExportFormat[]>([template?.default_export_format ?? "PDF"]);
  const [exportStatus, setExportStatus] = useState<Record<string, "idle"|"running"|"done"|"error">>({});

  // Sync runEnvelopeId prop into bindings when it changes (e.g. user binds a run from HomePanel)
  useEffect(() => {
    if (runEnvelopeId && !savedReport) {
      setBindings(prev => ({ ...prev, run_envelope_id: runEnvelopeId }));
    }
  }, [runEnvelopeId, savedReport]);

  // Validate
  const validate = useCallback((): ReportValidationIssue[] => {
    const issues: ReportValidationIssue[] = [];
    if (!name.trim()) issues.push({ code: "MISSING_NAME", severity: "ERROR", message: "Report name is required." });
    if (sections.length === 0) issues.push({ code: "NO_SECTIONS", severity: "ERROR", message: "At least one section is required." });
    const hasDisc = sections.some(s => s.type === "DISCLOSURES");
    if (!hasDisc) issues.push({ code: "NO_DISCLOSURES", severity: "WARNING", message: "Disclosures section is recommended for institutional reports." });
    if (!bindings.run_envelope_id) {
      issues.push({ code: "NO_BINDING", severity: "ERROR", message: "A run envelope (Engine Run ID) must be bound before exporting. Select an engine run in the Data Bindings panel." });
    }
    return issues;
  }, [name, sections, bindings]);

  useEffect(() => { setIssues(validate()); }, [validate]);

  // Toggle section
  const toggleSection = (id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, status: s.status === "INCLUDED" ? "EXCLUDED" : "INCLUDED" } : s));
  };

  // Move section
  const moveSection = (id: string, dir: -1 | 1) => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  };

  // AI assist
  const runAI = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/report-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal:             selectedGoal,
          goal_description: goalDesc,
          selected_modules: selModules,
          bindings,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { plan } = await res.json();
      setAiPlan(plan);
      // Apply AI proposed sections
      if (plan?.proposed_sections) {
        setSections(plan.proposed_sections.map((s: Omit<ReportSection,"id">, i: number) => ({
          ...s,
          id: `ai-sec-${i}-${uuidv4().slice(0,4)}`,
        })));
      }
      setStep("CONFIGURE");
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiLoading(false);
    }
  };

  // Handle export
  const handleExport = useCallback(async (fmt: ExportFormat) => {
    const stem = safeStem(name || "ORDR_Report");
    setExportStatus(prev => ({ ...prev, [fmt]: "running" }));
    try {
      if (fmt === "HTML") {
        const reportHash = await computeReportHash(bindings, sections, template?.template_id ?? null);
        const html = buildReportHTML(name, desc, bindings, sections, reportHash);
        triggerDownload(new Blob([html], { type: "text/html;charset=utf-8" }), `${stem}.html`);
      } else if (fmt === "PDF") {
        // Build HTML → inject into hidden iframe → print dialog
        const reportHash = await computeReportHash(bindings, sections, template?.template_id ?? null);
        const html = buildReportHTML(name, desc, bindings, sections, reportHash);
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:800px;height:1100px;border:none";
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
        if (!doc) throw new Error("iframe unavailable");
        doc.open(); doc.write(html); doc.close();
        // Small delay to let the iframe render before print dialog
        await new Promise<void>(res => setTimeout(res, 300));
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        // Cleanup after print dialog closes
        setTimeout(() => document.body.removeChild(iframe), 5_000);
      } else if (fmt === "EXCEL" || fmt === "CSV") {
        const csv = buildReportCSV(name, bindings, sections);
        triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${stem}.csv`);
      } else if (fmt === "JSON") {
        const def: ReportDefinition = {
          report_id:        `ORDR-RPT-${Date.now()}`,
          template_id:      template?.template_id ?? "CUSTOM",
          template_version: template?.version ?? 1,
          name,
          description:      desc,
          owner:            ownerEmail ?? "unknown",
          tenant_id:        "default",
          status:           "DRAFT",
          sections,
          bindings,
          export_formats:   exportFormats,
          tags:             template?.tags ?? [],
          version:          1,
          ai_plan:          aiPlan ?? undefined,
          created_at:       new Date().toISOString(),
          updated_at:       new Date().toISOString(),
        };
        const json = JSON.stringify(def, null, 2);
        triggerDownload(new Blob([json], { type: "application/json;charset=utf-8" }), `${stem}.json`);
      } else if (fmt === "POWERPOINT") {
        // No headless renderer — export a CSV-based slide outline + instructions
        const lines: string[] = [
          "ORDR REPORT STUDIO — POWERPOINT SLIDE OUTLINE",
          `Report: ${name}`,
          `As-of: ${bindings.as_of_date ?? "—"} | Currency: ${bindings.reporting_currency ?? "USD"}`,
          "",
          "SLIDE,TITLE,NOTES",
          "1,Cover: " + (name || "ORDR Report") + ",Insert company logo and date",
        ];
        sections
          .filter(s => s.status === "INCLUDED")
          .forEach((s, i) => {
            lines.push(`${i + 2},${s.title},${s.ai_assisted && s.narrative ? s.narrative.slice(0, 80) + "…" : "[Add content]"}`);
          });
        lines.push("", "NOTE: Import this CSV into PowerPoint via Insert → Object → From File, or use as a slide outline script.");
        const csv = lines.join("\r\n");
        triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${stem}_PPT_Outline.csv`);
      } else if (fmt === "ZIP_COMMITTEE") {
        // Sequential download of HTML + CSV + JSON
        const reportHash = await computeReportHash(bindings, sections, template?.template_id ?? null);
        const html = buildReportHTML(name, desc, bindings, sections, reportHash);
        triggerDownload(new Blob([html], { type: "text/html;charset=utf-8" }), `${stem}.html`);
        await new Promise<void>(res => setTimeout(res, 200));
        const csv = buildReportCSV(name, bindings, sections);
        triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${stem}.csv`);
        await new Promise<void>(res => setTimeout(res, 200));
        const def: ReportDefinition = {
          report_id: `ORDR-RPT-${Date.now()}`, template_id: template?.template_id ?? "CUSTOM",
          template_version: template?.version ?? 1, name, description: desc,
          owner: ownerEmail ?? "unknown", tenant_id: "default", status: "DRAFT",
          sections, bindings, export_formats: exportFormats, tags: template?.tags ?? [],
          version: 1, ai_plan: aiPlan ?? undefined,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        triggerDownload(new Blob([JSON.stringify(def, null, 2)], { type: "application/json;charset=utf-8" }), `${stem}.json`);
      }
      setExportStatus(prev => ({ ...prev, [fmt]: "done" }));
      setTimeout(() => setExportStatus(prev => ({ ...prev, [fmt]: "idle" })), 3_000);
      // X-18: Audit event on export
      if (token) {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
        fetch(`${API_BASE}/v1/audit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            event_type: "REPORT_EXPORTED",
            description: `Report exported: "${name}" as ${fmt}`,
            entity_type: "report",
            payload: { format: fmt, template_id: template?.template_id ?? "CUSTOM", sections: sections.filter(s => s.status === "INCLUDED").length },
          }),
        }).catch(() => {/* non-fatal */});
      }
    } catch (e) {
      console.error("Export failed:", e);
      setExportStatus(prev => ({ ...prev, [fmt]: "error" }));
      setTimeout(() => setExportStatus(prev => ({ ...prev, [fmt]: "idle" })), 5_000);
    }
  }, [name, desc, bindings, sections, exportFormats, template, ownerEmail, aiPlan, token]);

  // Handle save
  const handleSave = () => {
    const issues = validate();
    setIssues(issues);
    if (issues.some(i => i.severity === "ERROR")) return;

    const def: ReportDefinition = {
      report_id:        uuidv4(),
      template_id:      template?.template_id ?? "CUSTOM",
      template_version: template?.version ?? 1,
      name:             name.trim(),
      description:      desc.trim(),
      owner:            ownerEmail ?? "unknown",
      tenant_id:        "default",
      status:           "DRAFT",
      sections,
      bindings,
      export_formats:   exportFormats,
      tags:             template?.tags ?? [],
      version:          1,
      ai_plan:          aiPlan ?? undefined,
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    };
    onSave(def);
  };

  const STEPS: { key: BuilderStep; label: string }[] = [
    { key: "CONFIGURE", label: "1. Configure" },
    { key: "BIND",      label: "2. Data Bindings" },
    { key: "AI_ASSIST", label: "3. AI Assist" },
    { key: "PREVIEW",   label: "4. Preview" },
    { key: "EXPORT",    label: "5. Export" },
  ];

  const errCount  = validationIssues.filter(i => i.severity === "ERROR").length;
  const warnCount = validationIssues.filter(i => i.severity === "WARNING").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 160px)", minHeight: 500 }}>
      {/* Step tabs */}
      <div style={{
        display: "flex", alignItems: "stretch", gap: 0,
        borderBottom: `1px solid ${S.rim}`, background: S.bgPanel,
        borderRadius: "3px 3px 0 0", flexShrink: 0,
      }}>
        {STEPS.map(s => {
          const active = step === s.key;
          return (
            <button key={s.key} onClick={() => setStep(s.key)} style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: active ? 700 : 400,
              color: active ? S.cyan : S.tertiary, background: "transparent", border: "none",
              borderBottom: active ? `2px solid ${S.cyan}` : "2px solid transparent",
              padding: "10px 16px", cursor: "pointer", letterSpacing: "0.04em",
            }}>
              {s.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {/* Validation summary */}
        {errCount > 0 && <div style={{ display:"flex", alignItems:"center", padding:"0 12px", fontFamily: S.fontMono, fontSize: 12, color: S.fail }}>{errCount} error{errCount>1?"s":""}</div>}
        {warnCount > 0 && <div style={{ display:"flex", alignItems:"center", padding:"0 12px", fontFamily: S.fontMono, fontSize: 12, color: S.amber }}>{warnCount} warning{warnCount>1?"s":""}</div>}
        <button onClick={handleSave} style={{
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
          color: S.bgPanel, background: errCount > 0 ? S.muted : S.pass,
          border: "none", padding: "0 20px", cursor: errCount > 0 ? "not-allowed" : "pointer",
          flexShrink: 0,
        }}>
          SAVE DRAFT
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", background: S.bgSub, padding: 16 }}>

        {/* ── STEP: PRESET (no template selected) ── */}
        {step === "PRESET" && (
          <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, padding: "20px 0" }}>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", color: S.primary, marginBottom: 6 }}>SELECT A REPORT TEMPLATE</div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>Choose a preset to pre-populate sections, or start from scratch.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {REPORT_PRESETS.slice(0, 12).map(t => (
                <button key={t.template_id} onClick={() => {
                  setName(t.name);
                  setDesc(t.description);
                  setSections(t.default_sections.map((s, i) => ({ ...s, id: `sec-${i}-${uuidv4().slice(0,4)}` })));
                  setModules(t.modules);
                  setFormats([t.default_export_format]);
                  setStep("CONFIGURE");
                }} style={{
                  background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3,
                  padding: "12px 14px", textAlign: "left", cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 4,
                  transition: "border-color 0.12s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = S.cyan)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = S.rim)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan, letterSpacing: "0.05em" }}>{t.template_id}</span>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: S.primary }}>{t.short_name}</span>
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {t.description}
                  </div>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>{t.default_sections.length} sections · {t.estimated_pages}p</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setName("Custom Report"); setStep("CONFIGURE"); }} style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
              color: S.secondary, background: "transparent", border: `1px dashed ${S.rim}`,
              borderRadius: 3, padding: "12px 14px", cursor: "pointer", textAlign: "center",
            }}>
              START BLANK REPORT (no template)
            </button>
          </div>
        )}

        {/* ── STEP: CONFIGURE ── */}
        {step === "CONFIGURE" && (
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 280px", gap: 12, height: "100%" }}>

            {/* Left: Outline tree */}
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, overflow: "auto" }}>
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${S.rim}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary }}>SECTIONS</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>{sections.filter(s=>s.status==="INCLUDED").length}/{sections.length}</span>
              </div>
              {sections.length === 0 ? (
                <div style={{ padding: "20px 12px", fontFamily: S.fontUI, fontSize: 12, color: S.muted, textAlign: "center" }}>
                  No sections. Use AI Assist or add from presets.
                </div>
              ) : sections.map((s, idx) => (
                <div key={s.id} style={{
                  padding: "8px 10px", borderBottom: `1px solid ${S.soft}`,
                  opacity: s.status === "EXCLUDED" ? 0.4 : 1,
                  display: "flex", alignItems: "center", gap: 6,
                  background: s.status === "INCLUDED" ? "transparent" : S.bgSub,
                }}>
                  <button onClick={() => toggleSection(s.id)} style={{
                    width: 14, height: 14, borderRadius: 2, flexShrink: 0, cursor: "pointer",
                    background: s.status === "INCLUDED" ? S.cyan : "transparent",
                    border: `1.5px solid ${s.status === "INCLUDED" ? S.cyan : S.muted}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {s.status === "INCLUDED" && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}
                  </button>
                  <span style={{ fontSize: 12, flexShrink: 0 }}>{SECTION_ICONS[s.type] ?? "📄"}</span>
                  <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.title}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <button onClick={() => moveSection(s.id, -1)} disabled={idx===0} style={{ fontFamily: S.fontMono, fontSize: 12, color: idx===0?S.muted:S.tertiary, background:"transparent", border:"none", cursor:idx===0?"default":"pointer", padding: "1px 2px", lineHeight:1 }}>▲</button>
                    <button onClick={() => moveSection(s.id, 1)} disabled={idx===sections.length-1} style={{ fontFamily: S.fontMono, fontSize: 12, color: idx===sections.length-1?S.muted:S.tertiary, background:"transparent", border:"none", cursor:idx===sections.length-1?"default":"pointer", padding: "1px 2px", lineHeight:1 }}>▼</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Center: Report metadata + section list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Metadata form */}
              <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, display: "block", marginBottom: 4 }}>REPORT NAME *</label>
                  <input
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="e.g. Q1 2026 Board FX Risk Pack"
                    style={{
                      width: "100%", fontFamily: S.fontUI, fontSize: 13, color: S.primary,
                      background: S.bgSub, border: `1px solid ${errCount > 0 && !name ? S.fail : S.rim}`,
                      borderRadius: 2, padding: "6px 10px", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, display: "block", marginBottom: 4 }}>DESCRIPTION</label>
                  <textarea
                    value={desc} onChange={e => setDesc(e.target.value)}
                    rows={2} placeholder="Optional description for this report…"
                    style={{
                      width: "100%", fontFamily: S.fontUI, fontSize: 12, color: S.primary,
                      background: S.bgSub, border: `1px solid ${S.rim}`,
                      borderRadius: 2, padding: "6px 10px", outline: "none", resize: "vertical", boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Sections preview */}
              <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, flex: 1, overflow: "auto" }}>
                <div style={{ padding: "8px 12px", borderBottom: `1px solid ${S.rim}` }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary }}>SECTION DETAIL</span>
                  {aiPlan && <span style={{ marginLeft: 8 }}><Badge text="AI-ASSISTED" color={S.violet} /></span>}
                </div>
                {sections.filter(s => s.status === "INCLUDED").map((s, i) => (
                  <div key={s.id} style={{
                    padding: "10px 12px", borderBottom: `1px solid ${S.soft}`,
                    display: "flex", alignItems: "flex-start", gap: 10,
                  }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted, width: 20, flexShrink: 0, paddingTop: 2 }}>{String(i+1).padStart(2,"0")}</span>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{SECTION_ICONS[s.type] ?? "📄"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: S.primary }}>{s.title}</div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted, marginTop: 2 }}>{s.type}</div>
                      {s.ai_assisted && s.narrative && (
                        <div style={{
                          marginTop: 6, fontFamily: S.fontUI, fontSize: 12, color: S.secondary,
                          background: S.violetBg, border: `1px solid #BFDBFE`, borderRadius: 2,
                          padding: "6px 8px", lineHeight: 1.5,
                        }}>
                          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.violet, display: "block", marginBottom: 3 }}>AI-ASSISTED NARRATIVE SCAFFOLD</span>
                          {s.narrative}
                        </div>
                      )}
                    </div>
                    {s.page_break_before && <Badge text="PAGE BREAK" color={S.muted} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Properties + Validation */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Export formats */}
              <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "12px 14px" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 8 }}>EXPORT FORMATS</div>
                {(["PDF","EXCEL","POWERPOINT","ZIP_COMMITTEE"] as ExportFormat[]).map(f => (
                  <label key={f} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer", fontFamily: S.fontUI, fontSize: 12, color: exportFormats.includes(f) ? S.primary : S.secondary }}>
                    <input type="checkbox" checked={exportFormats.includes(f)} onChange={() => setFormats(prev => prev.includes(f) ? prev.filter(x=>x!==f) : [...prev, f])} style={{ accentColor: S.cyan }} />
                    {FORMAT_LABELS[f]}
                  </label>
                ))}
              </div>

              {/* Validation panel */}
              <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "12px 14px" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 8 }}>
                  VALIDATION {errCount > 0 && <span style={{ color: S.fail }}>— {errCount} error{errCount>1?"s":""}</span>}
                </div>
                {validationIssues.length === 0 ? (
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.pass }}>✓ All checks passed</div>
                ) : validationIssues.map((iss, i) => (
                  <div key={i} style={{
                    padding: "5px 8px", borderRadius: 2, marginBottom: 4,
                    background: iss.severity === "ERROR" ? S.failBg : S.amberBg,
                    borderLeft: `3px solid ${iss.severity === "ERROR" ? S.fail : S.amber}`,
                  }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: iss.severity === "ERROR" ? S.fail : S.amber }}>{iss.severity}</div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary }}>{iss.message}</div>
                  </div>
                ))}
              </div>

              {/* Disclosures auto-panel */}
              <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "12px 14px" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 6 }}>AUTO-DISCLOSURES</div>
                {(aiPlan?.disclosures_generated ?? [
                  "This report is for internal use only and does not constitute financial or regulatory advice.",
                  "FX rates sourced from market snapshot. Live rates marked LIVE; fallback rates marked INDICATIVE.",
                  "Stress scenarios are illustrative. Past events do not guarantee future outcomes.",
                ]).slice(0, 3).map((d, i) => (
                  <div key={i} style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginBottom: 4, lineHeight: 1.4, borderLeft: `2px solid ${S.muted}`, paddingLeft: 6 }}>
                    {d}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: DATA BINDINGS ── */}
        {step === "BIND" && (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 4 }}>DATA BINDING</div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
                  Bind this report to specific data artifacts. All bindings are frozen at generation time for reproducibility.
                </div>
              </div>
              {[
                { label: "RUN ENVELOPE ID",       key: "run_envelope_id",      placeholder: "e.g. run_xxxx — from engine output" },
                { label: "MARKET SNAPSHOT ID",    key: "market_snapshot_id",   placeholder: "e.g. mkt_xxxx" },
                { label: "PORTFOLIO SNAPSHOT ID", key: "portfolio_snapshot_id",placeholder: "e.g. port_xxxx" },
                { label: "POLICY ID",             key: "policy_id",            placeholder: "e.g. pol_xxxx" },
                { label: "AS-OF DATE",            key: "as_of_date",           placeholder: "YYYY-MM-DD" },
                { label: "REPORTING CURRENCY",    key: "reporting_currency",   placeholder: "USD" },
                { label: "PERIOD START",          key: "period_start",         placeholder: "YYYY-MM-DD" },
                { label: "PERIOD END",            key: "period_end",           placeholder: "YYYY-MM-DD" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: S.tertiary, display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input
                    value={(bindings as Record<string,string>)[f.key] ?? ""}
                    onChange={e => setBindings(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{
                      width: "100%", fontFamily: S.fontMono, fontSize: 12, color: S.primary,
                      background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
                      padding: "6px 10px", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: AI ASSIST ── */}
        {step === "AI_ASSIST" && (
          <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{
              background: S.violetBg, border: `1px solid #BFDBFE`, borderRadius: 3,
              padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>🤖</span>
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.violet, marginBottom: 3 }}>AI REPORT BUILDER — GOVERNANCE RULES</div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.5 }}>
                  AI will propose a section outline and narrative scaffolds. It <strong>never invents numbers</strong>. All AI output is labeled and editable. Citations reference your bound artifacts only.
                </div>
              </div>
            </div>

            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, display: "block", marginBottom: 6 }}>REPORT GOAL</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(Object.keys(GOAL_LABELS) as AIReportGoal[]).map(g => (
                    <button key={g} onClick={() => setGoal(g)} style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.05em",
                      color: selectedGoal === g ? S.bgPanel : S.tertiary,
                      background: selectedGoal === g ? S.violet : "transparent",
                      border: `1px solid ${selectedGoal === g ? S.violet : S.rim}`,
                      borderRadius: 2, padding: "4px 10px", cursor: "pointer",
                    }}>
                      {GOAL_LABELS[g]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, display: "block", marginBottom: 4 }}>INTENT (optional)</label>
                <textarea
                  value={goalDesc} onChange={e => setGoalDesc(e.target.value)}
                  rows={2} placeholder="Describe your intent, e.g. 'Quarterly pack for board with focus on stress scenarios and IFRS 9 hedge accounting'"
                  style={{ width: "100%", fontFamily: S.fontUI, fontSize: 12, color: S.primary, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, padding: "6px 10px", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, display: "block", marginBottom: 6 }}>MODULES TO INCLUDE</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(Object.keys(MODULE_LABELS) as ReportModule[]).map(m => {
                    const checked = selModules.includes(m);
                    return (
                      <button key={m} onClick={() => setModules(prev => prev.includes(m) ? prev.filter(x=>x!==m) : [...prev, m])} style={{
                        fontFamily: S.fontUI, fontSize: 12, fontWeight: checked ? 600 : 400,
                        color: checked ? S.bgPanel : S.secondary,
                        background: checked ? S.cyan : "transparent",
                        border: `1px solid ${checked ? S.cyan : S.rim}`,
                        borderRadius: 2, padding: "4px 10px", cursor: "pointer",
                      }}>
                        {MODULE_LABELS[m]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {aiError && (
                <div style={{ background: S.failBg, borderLeft: `3px solid ${S.fail}`, padding: "8px 12px", borderRadius: 2 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.fail }}>{aiError}</span>
                </div>
              )}

              {aiPlan && (
                <div style={{ background: S.passBg, borderLeft: `3px solid ${S.pass}`, padding: "10px 12px", borderRadius: 2 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.pass, marginBottom: 4 }}>✓ AI PLAN GENERATED — {aiPlan.proposed_sections.length} sections proposed</div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>Plan applied to Configure tab. Review and edit before saving.</div>
                </div>
              )}

              <button
                onClick={runAI}
                disabled={aiLoading || selModules.length === 0}
                style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
                  color: S.bgPanel,
                  background: aiLoading || selModules.length === 0 ? S.muted : S.violet,
                  border: "none", borderRadius: 2, padding: "8px 20px", cursor: aiLoading || selModules.length===0 ? "wait" : "pointer",
                  alignSelf: "flex-start",
                }}
              >
                {aiLoading ? "GENERATING PLAN…" : aiPlan ? "REGENERATE PLAN" : "GENERATE REPORT PLAN →"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: PREVIEW ── */}
        {step === "PREVIEW" && (
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            {/* Print-safe preview pane */}
            <div style={{
              background: "#FFFFFF",
              border: `1px solid ${S.rimStrong}`,
              borderRadius: 2,
              boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
              padding: "48px 56px",
              fontFamily: S.fontUI,
            }}>
              {/* Cover page simulation */}
              <div style={{ borderBottom: `3px solid ${S.cyan}`, paddingBottom: 24, marginBottom: 32 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.muted, marginBottom: 8 }}>
                  ORDR TERMINAL — INSTITUTIONAL REPORT
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: S.primary, marginBottom: 6 }}>{name || "Untitled Report"}</div>
                <div style={{ fontSize: 13, color: S.secondary, marginBottom: 12 }}>{desc || "No description."}</div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {[
                    { label: "As of Date",  value: bindings.as_of_date ?? "—" },
                    { label: "Currency",    value: bindings.reporting_currency ?? "USD" },
                    { label: "Run ID",      value: bindings.run_envelope_id?.slice(0,8) ?? "UNBOUND" },
                    { label: "Policy ID",   value: bindings.policy_id?.slice(0,8) ?? "UNBOUND" },
                    { label: "Sections",    value: String(sections.filter(s=>s.status==="INCLUDED").length) },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: S.muted }}>{f.label.toUpperCase()}</div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, fontWeight: 600 }}>{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* TOC simulation */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 12 }}>TABLE OF CONTENTS</div>
                {sections.filter(s => s.status === "INCLUDED").map((s, i) => (
                  <div key={s.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "4px 0", borderBottom: i < sections.filter(x=>x.status==="INCLUDED").length-1 ? `1px dotted ${S.soft}` : "none",
                  }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted, width: 24, flexShrink: 0 }}>{i+1}</span>
                    <span style={{ fontSize: 12 }}>{SECTION_ICONS[s.type] ?? "📄"}</span>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary, flex: 1 }}>{s.title}</span>
                    {s.ai_assisted && <Badge text="AI" color={S.violet} />}
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>p.{i + 2}</span>
                  </div>
                ))}
              </div>

              {/* Section placeholders */}
              {sections.filter(s => s.status === "INCLUDED" && !["COVER_PAGE","TABLE_OF_CONTENTS"].includes(s.type)).slice(0, 4).map((s, i) => (
                <div key={s.id} style={{ marginBottom: 28, paddingTop: i > 0 ? 24 : 0, borderTop: i > 0 ? `1px solid ${S.soft}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>{SECTION_ICONS[s.type] ?? "📄"}</span>
                    <span style={{ fontFamily: S.fontUI, fontSize: 15, fontWeight: 700, color: S.primary }}>{s.title}</span>
                    {s.ai_assisted && <Badge text="AI-ASSISTED" color={S.violet} />}
                  </div>
                  {s.ai_assisted && s.narrative ? (
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.7, background: S.violetBg, padding: "10px 12px", borderRadius: 2, borderLeft: `2px solid ${S.violet}` }}>
                      {s.narrative}
                    </div>
                  ) : (
                    <div style={{ background: S.bgSub, borderRadius: 2, padding: "16px", textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>
                      [{s.type}] — data will be injected at report generation time
                    </div>
                  )}
                </div>
              ))}

              {sections.filter(s=>s.status==="INCLUDED").length > 6 && (
                <div style={{ textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.muted, padding: "12px 0" }}>
                  …and {sections.filter(s=>s.status==="INCLUDED").length - 6} more sections
                </div>
              )}

              {/* Disclosures footer */}
              <div style={{ borderTop: `2px solid ${S.rim}`, paddingTop: 16, marginTop: 32 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.muted, marginBottom: 6 }}>DISCLOSURES & LIMITATIONS</div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.5 }}>
                  This report is generated by ORDR and is intended for internal use only. It does not constitute financial, legal, or regulatory advice. All calculations reference Run ID [{bindings.run_envelope_id?.slice(0,8) ?? "UNBOUND"}] and are reproducible from the same inputs snapshot.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: EXPORT ── */}
        {step === "EXPORT" && (
          <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Validation gate */}
            {errCount > 0 && (
              <div style={{ background: S.failBg, border: `1px solid #FECACA`, borderLeft: `3px solid ${S.fail}`, padding: "10px 14px", borderRadius: 2 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.fail, marginBottom: 3 }}>EXPORT BLOCKED — {errCount} ERROR{errCount > 1 ? "S" : ""}</div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>Fix validation errors on the Configure tab before exporting.</div>
              </div>
            )}

            {/* Export format rows */}
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "16px 18px" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 12 }}>
                EXPORT &amp; PACKAGING
              </div>

              {(
                [
                  {
                    fmt: "PDF" as ExportFormat,
                    badge: "LIVE",
                    badgeColor: S.pass,
                    desc: "Print-ready institutional PDF. Opens browser print dialog with styled layout, TOC and disclosures footer.",
                  },
                  {
                    fmt: "HTML" as ExportFormat,
                    badge: "LIVE",
                    badgeColor: S.pass,
                    desc: "Standalone HTML portal file. Self-contained, no server required. Ideal for email distribution.",
                  },
                  {
                    fmt: "EXCEL" as ExportFormat,
                    badge: "CSV",
                    badgeColor: S.cyan,
                    desc: "Downloads a .csv file compatible with Excel and Google Sheets. Contains metadata, section register and AI narratives.",
                  },
                  {
                    fmt: "JSON" as ExportFormat,
                    badge: "LIVE",
                    badgeColor: S.pass,
                    desc: "Machine-readable JSON. Full report definition model for downstream systems, version control or audit logs.",
                  },
                  {
                    fmt: "POWERPOINT" as ExportFormat,
                    badge: "OUTLINE",
                    badgeColor: S.amber,
                    desc: "Downloads a CSV slide outline (import via Insert → Object → From File in PowerPoint). Full PPTX requires PowerPoint import.",
                  },
                  {
                    fmt: "ZIP_COMMITTEE" as ExportFormat,
                    badge: "BUNDLE",
                    badgeColor: S.violet,
                    desc: "Committee bundle — triggers sequential download of HTML + CSV + JSON files. Browser ZIP requires server-side generation.",
                  },
                ] as { fmt: ExportFormat; badge: string; badgeColor: string; desc: string }[]
              ).map(({ fmt, badge, badgeColor, desc }) => {
                const checked = exportFormats.includes(fmt);
                const status = exportStatus[fmt] ?? "idle";
                const isRunning = status === "running";
                const isDone = status === "done";
                const isError = status === "error";
                const canExport = errCount === 0 && checked;

                const btnLabel = isRunning ? "EXPORTING…"
                  : isDone ? "✓ DOWNLOADED"
                  : isError ? "✗ FAILED — RETRY"
                  : "EXPORT ↓";
                const btnBg = isRunning ? S.muted
                  : isDone ? S.pass
                  : isError ? S.fail
                  : canExport ? S.cyan
                  : S.muted;

                return (
                  <div
                    key={fmt}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 0", borderBottom: `1px solid ${S.soft}`,
                      opacity: canExport || !checked ? 1 : 0.6,
                    }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setFormats(prev => prev.includes(fmt) ? prev.filter(x => x !== fmt) : [...prev, fmt])}
                      style={{ accentColor: S.cyan, marginTop: 0, flexShrink: 0 }}
                    />
                    {/* Label + description */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: S.primary }}>
                          {FORMAT_LABELS[fmt]}
                        </span>
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                          color: badgeColor,
                          background: `color-mix(in srgb, ${badgeColor} 10%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${badgeColor} 25%, transparent)`,
                          padding: "1px 5px", borderRadius: 2,
                        }}>
                          {badge}
                        </span>
                      </div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.4 }}>{desc}</div>
                    </div>
                    {/* Export button */}
                    <button
                      disabled={!canExport || isRunning}
                      onClick={() => handleExport(fmt)}
                      style={{
                        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                        color: "#FFFFFF",
                        background: btnBg,
                        border: "none", borderRadius: 2,
                        padding: "5px 12px", cursor: canExport && !isRunning ? "pointer" : "not-allowed",
                        whiteSpace: "nowrap", flexShrink: 0, transition: "background 0.2s",
                        minWidth: 100,
                      }}
                    >
                      {btnLabel}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Info panel */}
            <div style={{ background: S.passBg, border: `1px solid #BBF7D0`, borderLeft: `3px solid ${S.pass}`, padding: "10px 14px", borderRadius: 2 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.pass, marginBottom: 3 }}>CLIENT-SIDE EXPORT — NO SERVER REQUIRED</div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.5 }}>
                HTML, PDF and JSON exports run entirely in the browser.
                CSV is Excel-compatible. PDF uses the browser print dialog — select &ldquo;Save as PDF&rdquo; as the destination.
                Check all formats you want, then click each export button individually.
              </div>
            </div>

            {/* Save definition CTA */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={handleSave}
                disabled={errCount > 0}
                style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
                  color: S.bgPanel, background: errCount > 0 ? S.muted : S.pass,
                  border: "none", borderRadius: 2, padding: "10px 20px",
                  cursor: errCount > 0 ? "not-allowed" : "pointer",
                }}
              >
                SAVE REPORT DEFINITION →
              </button>
              <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.muted }}>
                Saved reports appear in the Saved Reports tab for re-export.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SAVED REPORTS PANEL
// ══════════════════════════════════════════════════════════════════════════════
function SavedPanel({ reports, onOpen }: { reports: ReportDefinition[]; onOpen: (r: ReportDefinition) => void }) {
  if (reports.length === 0) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: S.fontUI, fontSize: 14, color: S.tertiary, marginBottom: 8 }}>No saved reports yet.</div>
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.muted }}>Build a report from the Library or AI Builder to save it here.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {reports.map(r => (
        <div key={r.report_id} style={{
          background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3,
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.primary }}>{r.name}</div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted, marginTop: 2 }}>
              {r.template_id} · {r.sections.filter(s=>s.status==="INCLUDED").length} sections · {new Date(r.updated_at).toLocaleDateString()}
            </div>
          </div>
          <Badge text={r.status} color={r.status === "FINAL" ? S.pass : r.status === "DRAFT" ? S.amber : S.cyan} />
          <div style={{ display: "flex", gap: 6 }}>
            {r.export_formats.map(f => <Badge key={f} text={f} color={S.muted} />)}
          </div>
          <button onClick={() => onOpen(r)} style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
            color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}`,
            borderRadius: 2, padding: "4px 10px", cursor: "pointer",
          }}>
            OPEN →
          </button>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS PANEL
// ══════════════════════════════════════════════════════════════════════════════
function SettingsPanel() {
  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary }}>REPORT SETTINGS</div>
        {[
          { label: "ORGANISATION NAME",    placeholder: "e.g. ORDR Capital" },
          { label: "REPORT FOOTER TEXT",   placeholder: "e.g. CONFIDENTIAL — For internal use only" },
          { label: "DEFAULT DISCLAIMER",   placeholder: "Enter default disclaimer text…" },
          { label: "REPORT NUMBER PREFIX", placeholder: "e.g. RPT-2026-" },
        ].map(f => (
          <div key={f.label}>
            <label style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: S.tertiary, display: "block", marginBottom: 4 }}>{f.label}</label>
            <input placeholder={f.placeholder} style={{
              width: "100%", fontFamily: S.fontUI, fontSize: 12, color: S.primary,
              background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
              padding: "6px 10px", outline: "none", boxSizing: "border-box",
            }} />
          </div>
        ))}
        <div>
          <label style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: S.tertiary, display: "block", marginBottom: 4 }}>LOGO PLACEHOLDER</label>
          <div style={{
            background: S.bgSub, border: `2px dashed ${S.rim}`, borderRadius: 2,
            padding: "20px", textAlign: "center",
          }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>Upload logo (PNG/SVG, 2× for HiDPI)</div>
          </div>
        </div>
        <button style={{
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
          color: S.bgPanel, background: S.cyan, border: "none", borderRadius: 2,
          padding: "8px 20px", cursor: "pointer", alignSelf: "flex-start",
        }}>
          SAVE SETTINGS
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT PAGE
// ══════════════════════════════════════════════════════════════════════════════
// Map URL ?view= param to MainView enum
const VIEW_PARAM_MAP: Record<string, MainView> = {
  home:     "HOME",
  library:  "LIBRARY",
  builder:  "BUILDER",
  saved:    "SAVED",
  settings: "SETTINGS",
};
const VIEW_TO_PARAM: Record<MainView, string> = {
  HOME:     "home",
  LIBRARY:  "library",
  BUILDER:  "builder",
  SAVED:    "saved",
  SETTINGS: "settings",
};

function ReportStudioInner() {
  const { isAuthenticated, isLoading: authLoading, user, token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { result } = useHedge();

  // Initialise view from ?view= URL param (default HOME)
  const initialView: MainView = VIEW_PARAM_MAP[searchParams.get("view") ?? ""] ?? "HOME";
  const [view, setViewState]                  = useState<MainView>(initialView);
  const [selectedTemplate, setTemplate]       = useState<ReportTemplate | null>(null);
  const [savedReportToOpen, setSavedReportToOpen] = useState<ReportDefinition | null>(null);
  const [savedReports, setSaved]              = useState<ReportDefinition[]>([]);
  const [renderTs, setRenderTs]               = useState("");

  // Run binding state
  const [availableRuns, setAvailableRuns]     = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading]         = useState(false);
  const [selectedRunId, setSelectedRunId]     = useState<string | null>(null);

  // Sync view → URL param (shallow replace so back-button works naturally)
  const setView = useCallback((v: MainView) => {
    setViewState(v);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", VIEW_TO_PARAM[v]);
    router.replace(`/reports?${params.toString()}`);
  }, [router, searchParams]);

  // Sync inbound URL changes → view state (e.g. browser back/forward)
  useEffect(() => {
    const paramView = VIEW_PARAM_MAP[searchParams.get("view") ?? ""] ?? "HOME";
    setViewState(paramView);
  }, [searchParams]);

  useEffect(() => { setRenderTs(new Date().toISOString().replace("T"," ").slice(0,19) + " UTC"); }, []);
  useEffect(() => { if (!authLoading && !isAuthenticated) router.replace("/auth/login"); }, [authLoading, isAuthenticated, router]);

  // Load saved reports from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ordr_saved_reports');
      if (saved) setSaved(JSON.parse(saved) as ReportDefinition[]);
    } catch { /* ignore */ }
  }, []);

  // Fetch available runs from backend
  useEffect(() => {
    if (!token) return;
    setRunsLoading(true);
    listRuns(token, 20)
      .then(({ items }) => {
        setAvailableRuns(items);
        // Auto-select latest run if nothing is already bound
        if (!result && !selectedRunId && items.length > 0) {
          setSelectedRunId(items[0].run_id);
        }
      })
      .catch(() => { /* graceful degradation — still works without run binding */ })
      .finally(() => setRunsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSelectPreset = (t: ReportTemplate) => {
    setTemplate(t);
    setSavedReportToOpen(null);
    setView("BUILDER");
  };

  const handleBindRun = useCallback((runId: string) => {
    setSelectedRunId(runId);
    setView("BUILDER");
  }, [setView]);

  const handleSaveReport = (def: ReportDefinition) => {
    setSaved(prev => {
      const exists = prev.findIndex(r => r.report_id === def.report_id);
      let next: ReportDefinition[];
      if (exists >= 0) { next = [...prev]; next[exists] = def; }
      else { next = [def, ...prev]; }
      // Persist to localStorage
      try { localStorage.setItem('ordr_saved_reports', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setView("SAVED");
  };

  if (authLoading) {
    return (
      <div style={{ background: S.bgPage, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted, letterSpacing: "0.1em" }}>AUTHENTICATING…</span>
      </div>
    );
  }

  const NAV_ITEMS: { key: MainView; label: string; badge?: string }[] = [
    { key: "HOME",     label: "Studio Home" },
    { key: "LIBRARY",  label: "Preset Library", badge: `${REPORT_PRESETS.length}` },
    { key: "BUILDER",  label: "Report Builder" },
    { key: "SAVED",    label: "Saved Reports",  badge: savedReports.length > 0 ? String(savedReports.length) : undefined },
    { key: "SETTINGS", label: "Settings" },
  ];

  return (
    <div style={{ background: S.bgPage, minHeight: "100vh", fontFamily: S.fontUI }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 44, padding: "0 24px", background: "#FFFFFF",
        borderBottom: `1px solid ${S.rim}`, display: "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.primary }}>
            REPORT STUDIO
          </span>
          <span style={{ color: S.rim }}>|</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.06em", color: S.muted }}>
            ORDR TERMINAL · INSTITUTIONAL REPORTING
          </span>
          <Badge text="BETA" color={S.amber} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => { setTemplate(null); setSavedReportToOpen(null); setView("BUILDER"); }}
            style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
              color: "#FFFFFF", background: S.cyan, border: "none",
              borderRadius: 2, padding: "5px 14px", cursor: "pointer",
            }}
          >
            + NEW REPORT
          </button>
          <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted }}>{renderTs}</span>
        </div>
      </div>

      {/* ── Nav tabs ── */}
      <div style={{
        height: 36, display: "flex", alignItems: "stretch", background: "#FFFFFF",
        borderBottom: `1px solid ${S.rim}`, padding: "0 24px", gap: 0,
      }}>
        {NAV_ITEMS.map(n => {
          const active = view === n.key;
          return (
            <button key={n.key} onClick={() => setView(n.key)} style={{
              fontFamily: S.fontUI, fontSize: 12, fontWeight: active ? 700 : 400,
              color: active ? S.cyan : S.tertiary,
              background: "transparent", border: "none",
              borderBottom: active ? `2px solid ${S.cyan}` : "2px solid transparent",
              padding: "0 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              letterSpacing: "0.02em",
            }}>
              {n.label}
              {n.badge && (
                <span style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: active ? S.cyan : S.muted,
                  background: active ? `color-mix(in srgb, ${S.cyan} 10%, transparent)` : S.bgSub,
                  border: `1px solid ${active ? S.cyan : S.rim}`, borderRadius: 10,
                  padding: "0 5px", lineHeight: "14px",
                }}>
                  {n.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 24px 40px" }}>
        {view === "HOME" && (
          <HomePanel
            onNewReport={() => setView("BUILDER")}
            onOpenLibrary={() => setView("LIBRARY")}
            onSelectPreset={handleSelectPreset}
            savedReports={savedReports}
            availableRuns={availableRuns}
            runsLoading={runsLoading}
            onBindRun={handleBindRun}
          />
        )}
        {view === "LIBRARY" && (
          <LibraryPanel onSelect={handleSelectPreset} />
        )}
        {view === "BUILDER" && (
          <BuilderShell
            key={selectedTemplate?.template_id ?? savedReportToOpen?.report_id ?? "blank"}
            template={selectedTemplate}
            savedReport={savedReportToOpen}
            onSave={handleSaveReport}
            runEnvelopeId={result?.run_id ?? selectedRunId ?? undefined}
            ownerEmail={user?.email}
            token={token}
          />
        )}
        {view === "SAVED" && (
          <SavedPanel reports={savedReports} onOpen={r => {
            // Find the original template for this saved report
            const tmpl = REPORT_PRESETS.find(p => p.template_id === r.template_id) ?? null;
            setTemplate(tmpl);
            setSavedReportToOpen(r);
            setView("BUILDER");
          }} />
        )}
        {view === "SETTINGS" && (
          <SettingsPanel />
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        borderTop: `1px solid ${S.rim}`, background: "#FFFFFF",
      }}>
        <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 12, color: S.muted, letterSpacing: "0.05em" }}>
          {renderTs} · ORDR Report Studio · {REPORT_PRESETS.length} presets · Institutional Reporting
        </span>
      </div>
    </div>
  );
}

// Suspense boundary required by Next.js App Router for useSearchParams()
export default function ReportStudioPage() {
  // Reports available to all tiers including SMB
  return (

    <PageShell icon={FileText} title="Report Studio" breadcrumb={["Dashboard", "Reports"]} noPadding>
    <Suspense fallback={
      <div style={{ background: "#FAFAFA", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color: "#9CA3AF", letterSpacing: "0.1em" }}>LOADING…</span>
      
    <HelpPanelV2 module={REPORTS_HELP} storageKey="reports" />
    </div>
    }>
      <ReportStudioInner />
    </Suspense>
  
    </PageShell>
    );
}
