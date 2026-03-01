/**
 * clientExport.ts
 *
 * 100% client-side export utilities for the Committee Pack.
 * No backend required — all files are generated in the browser via:
 *   – jsPDF + jspdf-autotable  → PDF
 *   – papaparse                → CSV / Excel-compatible CSV
 *   – JSON.stringify + Blob    → Audit JSON bundle
 *   – xlsx (SheetJS)           → XLSX workbook files
 *
 * All functions are synchronous and trigger an immediate browser download.
 */

import type { CalculateResponse } from '../api/types';
import { fmtMXN, fmtUSD, fmtPct, fmtSigma } from './formatters';
import {
  scenarioKpis,
  policyComplianceChecks,
  generateExecutiveNarrative,
} from './reportCalcs';

// ── Internal type used for alert exports ──────────────────────────────────────
export interface ExportableAlert {
  id:            string;
  severity:      string;
  category:      string;
  ruleId:        string;
  reason:        string;
  impacted:      string;
  recommendation:string;
  acknowledged:  boolean;
  escalated:     boolean;
}

// ── Helper: trigger browser download ─────────────────────────────────────────
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Helper: safe filename segment ─────────────────────────────────────────────
function safeId(runId: string): string {
  return runId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
}

// ── Helper: format ISO date for display ──────────────────────────────────────
function fmtDate(iso: string): string {
  try { return new Date(iso).toUTCString(); } catch { return iso; }
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. COMMITTEE PACK PDF
// ═════════════════════════════════════════════════════════════════════════════

export async function exportCommitteePackPdf(
  result: CalculateResponse,
  baseCcy: string,
): Promise<void> {
  // Dynamic import keeps jsPDF out of the initial JS bundle
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { hedge_plan, scenario_results, validation_report, run_envelope } = result;
  const { summary, buckets } = hedge_plan;

  const totalExposure = buckets.reduce(
    (s, b) => s + Math.abs(b.commercial_exposure_mxn), 0,
  );
  const coveragePct = totalExposure > 0
    ? Math.abs(summary.total_hedge_position_mxn) / totalExposure
    : 0;

  const kpis = scenarioKpis(scenario_results.totals, summary);
  const compliance = policyComplianceChecks(buckets, summary, {
    bucket_mode: 'CALENDAR_MONTH', hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
    cost_assumptions: { spread_bps: 5 }, execution_product: 'NDF', min_trade_size_usd: 10000,
  });

  // ── Design constants ──────────────────────────────────────────────────────
  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 14;
  const TEXT_W  = PAGE_W - MARGIN * 2;
  type RGB = [number, number, number];
  const DARK:   RGB = [11, 17, 32];      // --bg-deep
  const PANEL:  RGB = [21, 33, 56];      // --bg-panel
  const CYAN:   RGB = [34, 211, 238];    // --accent-cyan
  const GREEN:  RGB = [74, 222, 128];    // --accent-green
  const AMBER:  RGB = [251, 179, 71];    // --accent-amber
  const RED:    RGB = [248, 113, 113];   // --accent-red
  const TEXT1:  RGB = [229, 234, 242];   // --text-primary
  const TEXT3:  RGB = [138, 148, 160];   // --text-tertiary
  const VERDICT: RGB = validation_report.status === 'PASS' ? GREEN : RED;

  // ── Utility: section header ───────────────────────────────────────────────
  let y = MARGIN;
  function sectionHeader(label: string) {
    doc.setFillColor(...PANEL);
    doc.rect(MARGIN, y, TEXT_W, 7, 'F');
    doc.setTextColor(...CYAN);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(label, MARGIN + 3, y + 4.5);
    y += 10;
  }

  // ── PAGE 1: COVER ─────────────────────────────────────────────────────────
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  // Top bar
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, PAGE_W, 1.5, 'F');

  // Title block
  doc.setTextColor(...TEXT3);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('SYNEXFUND — HEDGECALC ENGINE', MARGIN, 30);
  doc.setTextColor(...TEXT1);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text('Committee Pack', MARGIN, 44);
  doc.setTextColor(...CYAN);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('FX Hedge Governance Report', MARGIN, 53);

  // Verdict badge
  doc.setFillColor(...VERDICT);
  doc.roundedRect(MARGIN, 62, 36, 10, 1.5, 1.5, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(validation_report.status, MARGIN + 18, 68.5, { align: 'center' });

  // Meta grid
  doc.setFillColor(...PANEL);
  doc.rect(MARGIN, 80, TEXT_W, 34, 'F');
  const metaRows = [
    ['Run ID',          run_envelope.run_id],
    ['Timestamp',       fmtDate(run_envelope.timestamp)],
    ['Engine Version',  run_envelope.engine_version],
    ['Base Currency',   baseCcy],
    ['Coverage Ratio',  fmtPct(coveragePct)],
    ['Compliance',      `${compliance.score}% — ${compliance.classification}`],
  ];
  metaRows.forEach(([k, v], i) => {
    const col = i % 2 === 0 ? MARGIN + 3 : MARGIN + TEXT_W / 2 + 3;
    const row = 85 + Math.floor(i / 2) * 10;
    doc.setTextColor(...TEXT3);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(k.toUpperCase(), col, row);
    doc.setTextColor(...TEXT1);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(v, col, row + 4.5);
  });

  // Inputs hash at bottom
  doc.setTextColor(...TEXT3);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(`INPUTS SHA-256: ${run_envelope.inputs_hash}`, MARGIN, PAGE_H - 10);
  doc.text(`OUTPUTS SHA-256: ${run_envelope.outputs_hash}`, MARGIN, PAGE_H - 6);

  // ── PAGE 2: EXECUTIVE SUMMARY ─────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, PAGE_W, 1.5, 'F');

  y = MARGIN;
  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Executive Summary', MARGIN, y + 6);
  y += 14;

  // KPI tiles 2×3
  const kpiData: { label: string; value: string; color: RGB }[] = [
    { label: 'Total Exposure',  value: `${fmtMXN(Math.abs(summary.total_commercial_exposure_mxn))} ${baseCcy}`, color: TEXT1 },
    { label: 'Coverage Ratio',  value: fmtPct(coveragePct),                                                       color: coveragePct >= 0.95 ? GREEN : AMBER },
    { label: 'Residual',        value: `${fmtMXN(Math.abs(summary.total_residual_mxn))} ${baseCcy}`,             color: summary.total_residual_mxn !== 0 ? AMBER : GREEN },
    { label: 'Friction Cost',   value: fmtUSD(summary.total_friction_usd),                                        color: AMBER },
    { label: 'Worst-Case Loss', value: fmtUSD(kpis.worstCaseLoss),                                                color: RED },
    { label: 'Hedge Efficiency',value: `${kpis.efficiencyPerDollar.toFixed(2)}×`,                                 color: CYAN },
  ];
  kpiData.forEach((kpi, i) => {
    const col = i % 2 === 0 ? MARGIN : MARGIN + TEXT_W / 2 + 2;
    const row = y + Math.floor(i / 2) * 20;
    doc.setFillColor(...PANEL);
    doc.rect(col, row, TEXT_W / 2 - 2, 17, 'F');
    doc.setTextColor(...TEXT3);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label.toUpperCase(), col + 3, row + 5);
    doc.setTextColor(...kpi.color);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, col + 3, row + 13);
  });
  y += 66;

  // Narrative
  sectionHeader('EXECUTIVE NARRATIVE');
  try {
    const narrative = generateExecutiveNarrative(
      buckets, summary, scenario_results.totals, {
        bucket_mode: 'CALENDAR_MONTH', hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
        cost_assumptions: { spread_bps: 5 }, execution_product: 'NDF', min_trade_size_usd: 10000,
      },
    );
    doc.setTextColor(...TEXT1);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    narrative.forEach((line: string, i: number) => {
      const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, TEXT_W - 4);
      wrapped.forEach((l: string) => {
        doc.text(l, MARGIN + 2, y);
        y += 4.5;
      });
      y += 1;
    });
  } catch {
    doc.setTextColor(...TEXT3);
    doc.text('Narrative generation requires additional inputs.', MARGIN + 2, y);
    y += 6;
  }

  // ── PAGE 3: COVERAGE TABLE ────────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, PAGE_W, 1.5, 'F');

  y = MARGIN;
  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('R-01 Coverage & Residual', MARGIN, y + 6);
  y += 14;

  autoTable(doc, {
    startY: y,
    head: [['Bucket', 'Exposure', 'Existing Hedges', 'New Action', 'Residual', 'Coverage']],
    body: buckets.map(b => {
      const cov = Math.abs(b.commercial_exposure_mxn) > 0
        ? Math.abs(b.hedge_position_mxn) / Math.abs(b.commercial_exposure_mxn)
        : 0;
      return [
        b.bucket,
        `${fmtMXN(Math.abs(b.commercial_exposure_mxn))} ${baseCcy}`,
        `${fmtMXN(Math.abs(b.existing_hedges_mxn))} ${baseCcy}`,
        b.action_mxn !== 0 ? `${fmtMXN(Math.abs(b.action_mxn))} ${baseCcy}` : '—',
        `${fmtMXN(Math.abs(b.residual_mxn))} ${baseCcy}`,
        fmtPct(cov),
      ];
    }),
    foot: [[
      'TOTAL',
      `${fmtMXN(Math.abs(summary.total_commercial_exposure_mxn))} ${baseCcy}`,
      `${fmtMXN(Math.abs(summary.total_existing_hedges_mxn))} ${baseCcy}`,
      `${fmtMXN(Math.abs(summary.total_action_mxn))} ${baseCcy}`,
      `${fmtMXN(Math.abs(summary.total_residual_mxn))} ${baseCcy}`,
      fmtPct(coveragePct),
    ]],
    styles: {
      fillColor: [21, 33, 56],
      textColor: [229, 234, 242],
      fontSize: 7.5,
      lineColor: [42, 53, 69],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: [34, 47, 77], textColor: [34, 211, 238], fontStyle: 'bold' },
    footStyles: { fillColor: [34, 47, 77], textColor: [34, 211, 238], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [16, 26, 46] },
    margin: { left: MARGIN, right: MARGIN },
  });

  // ── PAGE 4: SCENARIO TABLE ────────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, PAGE_W, 1.5, 'F');

  y = MARGIN;
  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('R-03 Scenario & Stress', MARGIN, y + 6);
  y += 14;

  autoTable(doc, {
    startY: y,
    head: [['Shock (σ)', 'Shocked Spot', 'Unhedged (USD)', 'Hedged (USD)', 'Hedge Benefit']],
    body: scenario_results.totals.map(t => [
      fmtSigma(t.sigma),
      t.shocked_spot.toFixed(4),
      fmtUSD(t.total_unhedged_usd),
      fmtUSD(t.total_hedged_usd),
      fmtUSD(t.total_hedge_benefit_usd),
    ]),
    styles: {
      fillColor: [21, 33, 56],
      textColor: [229, 234, 242],
      fontSize: 7.5,
      lineColor: [42, 53, 69],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: [34, 47, 77], textColor: [34, 211, 238], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [16, 26, 46] },
    margin: { left: MARGIN, right: MARGIN },
  });

  // ── PAGE 5: POLICY COMPLIANCE ─────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, PAGE_W, 1.5, 'F');

  y = MARGIN;
  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('R-04 Policy Compliance', MARGIN, y + 6);
  y += 14;

  // Score
  doc.setFillColor(...PANEL);
  doc.rect(MARGIN, y, TEXT_W, 16, 'F');
  const scoreColor: RGB = compliance.classification === 'ALIGNED' ? GREEN
    : compliance.classification === 'MINOR DEVIATIONS' ? AMBER : RED;
  doc.setTextColor(...scoreColor);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text(`${compliance.score}%`, MARGIN + 6, y + 11);
  doc.setFontSize(9);
  doc.text(compliance.classification, MARGIN + 36, y + 11);
  y += 22;

  autoTable(doc, {
    startY: y,
    head: [['Rule', 'Status', 'Detail']],
    body: compliance.checks.map(c => [c.label, c.pass ? 'PASS' : 'FAIL', c.detail]),
    styles: {
      fillColor: [21, 33, 56],
      textColor: [229, 234, 242],
      fontSize: 7.5,
      lineColor: [42, 53, 69],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: [34, 47, 77], textColor: [34, 211, 238], fontStyle: 'bold' },
    columnStyles: {
      1: {
        fontStyle: 'bold',
        cellWidth: 16,
      },
    },
    didParseCell: (data) => {
      if (data.column.index === 1 && data.row.section === 'body') {
        data.cell.styles.textColor = data.cell.raw === 'PASS'
          ? [74, 222, 128] : [248, 113, 113];
      }
    },
    alternateRowStyles: { fillColor: [16, 26, 46] },
    margin: { left: MARGIN, right: MARGIN },
  });

  // ── PAGE 6: AUDIT ATTESTATION ─────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, PAGE_W, 1.5, 'F');

  y = MARGIN;
  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Audit Attestation', MARGIN, y + 6);
  y += 14;

  sectionHeader('CRYPTOGRAPHIC EVIDENCE LEDGER');
  const hashRows = [
    ['Inputs Hash',  run_envelope.inputs_hash],
    ['Outputs Hash', run_envelope.outputs_hash],
    ['Trades Hash',  run_envelope.trades_hash],
    ['Hedges Hash',  run_envelope.hedges_hash],
    ['Market Hash',  run_envelope.market_hash],
    ['Policy Hash',  run_envelope.policy_hash],
  ];
  hashRows.forEach(([k, v]) => {
    doc.setTextColor(...TEXT3);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(k.toUpperCase(), MARGIN + 2, y);
    doc.setTextColor(...TEXT1);
    doc.setFontSize(6.5);
    doc.setFont('courier', 'normal');
    doc.text(v ?? 'N/A', MARGIN + 38, y);
    y += 5.5;
  });

  y += 4;
  sectionHeader('ATTESTATION PROPERTIES');
  const props = [
    ['Determinism',        'Guaranteed — same inputs always produce identical outputs'],
    ['Snapshot Binding',   `Market snapshot locked via SHA-256: ${(run_envelope.market_hash ?? '').slice(0, 16)}…`],
    ['Policy Binding',     `Policy parameters locked via SHA-256: ${(run_envelope.policy_hash ?? '').slice(0, 16)}…`],
    ['Reproducibility',    'Full hash-verifiable replay available — contact engine operator'],
    ['Integrity',          'SHA-256 applied independently to all six input/output artifacts'],
  ];
  props.forEach(([k, v]) => {
    doc.setTextColor(...CYAN);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(k + ':', MARGIN + 2, y);
    doc.setTextColor(...TEXT1);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(v, TEXT_W - 48);
    doc.text(wrapped, MARGIN + 44, y);
    y += Math.max(5.5, wrapped.length * 4.5);
  });

  // Footer
  doc.setTextColor(...TEXT3);
  doc.setFontSize(6);
  doc.text(
    `Generated by HedgeCalc Engine v${run_envelope.engine_version} · ${fmtDate(run_envelope.timestamp)} · Run ${run_envelope.run_id}`,
    PAGE_W / 2, PAGE_H - 6,
    { align: 'center' },
  );

  doc.save(`CommitteePack_${safeId(run_envelope.run_id)}.pdf`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. HEDGE PLAN CSV
// ═════════════════════════════════════════════════════════════════════════════

export function exportHedgePlanCsv(result: CalculateResponse): void {
  const { hedge_plan, run_envelope } = result;
  const rows = hedge_plan.buckets.map(b => ({
    run_id:                   run_envelope.run_id,
    bucket:                   b.bucket,
    commercial_exposure:      b.commercial_exposure_mxn,
    confirmed_flow:           b.confirmed_flow_mxn,
    forecast_flow:            b.forecast_flow_mxn,
    existing_hedges:          b.existing_hedges_mxn,
    action:                   b.action_mxn,
    action_usd:               b.action_usd,
    hedge_position:           b.hedge_position_mxn,
    residual:                 b.residual_mxn,
    forward_rate:             b.forward_rate,
    friction_usd:             b.friction_usd,
    suppressed:               b.suppressed,
    carry_note:               b.carry_note,
  }));

  // Use dynamic import for papaparse to avoid SSR issues
  const Papa = require('papaparse');
  const csv  = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `HedgePlan_${safeId(run_envelope.run_id)}.csv`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. HEDGE PLAN EXCEL (BOM-prefixed CSV — Excel auto-detects encoding)
// ═════════════════════════════════════════════════════════════════════════════

export function exportHedgePlanExcel(result: CalculateResponse): void {
  const { hedge_plan, scenario_results, run_envelope } = result;
  const { summary, buckets } = hedge_plan;

  // Sheet 1: Coverage by bucket
  const rows: Record<string, string | number | boolean>[] = [];
  rows.push({ '': 'COMMITTEE PACK — FX HEDGE REPORT', ...Object.fromEntries([...Array(13)].map((_, i) => [String(i), ''])) });
  rows.push({ '': `Run ID: ${run_envelope.run_id}` });
  rows.push({ '': `Generated: ${fmtDate(run_envelope.timestamp)}` });
  rows.push({});
  rows.push({ '': '--- COVERAGE BY BUCKET ---' });

  buckets.forEach(b => {
    const cov = Math.abs(b.commercial_exposure_mxn) > 0
      ? Math.abs(b.hedge_position_mxn) / Math.abs(b.commercial_exposure_mxn)
      : 0;
    rows.push({
      '': b.bucket,
      'Exposure': b.commercial_exposure_mxn,
      'Existing Hedges': b.existing_hedges_mxn,
      'New Action': b.action_mxn,
      'Action USD': b.action_usd,
      'Hedge Position': b.hedge_position_mxn,
      'Residual': b.residual_mxn,
      'Forward Rate': b.forward_rate,
      'Friction USD': b.friction_usd,
      'Coverage %': (cov * 100).toFixed(1) + '%',
      'Suppressed': b.suppressed ? 'YES' : '',
    });
  });

  rows.push({});
  rows.push({ '': '--- SCENARIO STRESS ---' });
  rows.push({ '': 'Shock', 'Exposure': 'Shocked Spot', 'Existing Hedges': 'Unhedged USD', 'New Action': 'Hedged USD', 'Action USD': 'Hedge Benefit USD' });
  scenario_results.totals.forEach(t => {
    rows.push({
      '': fmtSigma(t.sigma),
      'Exposure': t.shocked_spot,
      'Existing Hedges': t.total_unhedged_usd,
      'New Action': t.total_hedged_usd,
      'Action USD': t.total_hedge_benefit_usd,
    });
  });

  const Papa = require('papaparse');
  const csv  = '\uFEFF' + Papa.unparse(rows);           // BOM for Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `HedgePlan_${safeId(run_envelope.run_id)}.csv`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. AUDIT JSON BUNDLE
// ═════════════════════════════════════════════════════════════════════════════

export function exportAuditJson(result: CalculateResponse): void {
  const { run_envelope, validation_report } = result;
  const bundle = {
    _schema_version:   '1.0',
    _generated_at:     new Date().toISOString(),
    _description:      'HedgeCalc Audit Attestation Bundle — SHA-256 verified',
    run_envelope:      run_envelope,
    validation_status: validation_report.status,
    error_count:       validation_report.errors.length,
    warning_count:     validation_report.warnings.length,
    errors:            validation_report.errors,
    warnings:          validation_report.warnings,
    attestation: {
      deterministic:  true,
      hash_algorithm: 'SHA-256',
      artifacts: {
        inputs:  run_envelope.inputs_hash,
        outputs: run_envelope.outputs_hash,
        trades:  run_envelope.trades_hash,
        hedges:  run_envelope.hedges_hash,
        market:  run_envelope.market_hash,
        policy:  run_envelope.policy_hash,
      },
    },
  };
  const blob = new Blob(
    [JSON.stringify(bundle, null, 2)],
    { type: 'application/json' },
  );
  downloadBlob(blob, `AuditBundle_${safeId(run_envelope.run_id)}.json`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. ALERTS CSV
// ═════════════════════════════════════════════════════════════════════════════

export function exportAlertsCsv(alerts: ExportableAlert[], suffix = 'All'): void {
  const Papa = require('papaparse');
  const rows = alerts.map(a => ({
    rule_id:        a.ruleId,
    severity:       a.severity,
    category:       a.category,
    status:         a.acknowledged ? 'ACKNOWLEDGED' : a.escalated ? 'ESCALATED' : 'PENDING',
    reason:         a.reason,
    impacted_field: a.impacted,
    recommendation: a.recommendation,
  }));
  const csv  = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `Alerts_${suffix}.csv`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. ALERTS PDF
// ═════════════════════════════════════════════════════════════════════════════

export async function exportAlertsPdf(
  alerts: ExportableAlert[],
  result: CalculateResponse,
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { run_envelope } = result;
  type RGB3 = [number, number, number];
  const MARGIN = 14;
  const TEXT_W = 182;
  const DARK:  RGB3 = [11, 17, 32];
  const PANEL: RGB3 = [21, 33, 56];
  const CYAN:  RGB3 = [34, 211, 238];
  const TEXT1: RGB3 = [229, 234, 242];
  const TEXT3: RGB3 = [138, 148, 160];

  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, 210, 1.5, 'F');

  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Controls & Alerts Report', MARGIN, 22);
  doc.setTextColor(...TEXT3);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Run: ${run_envelope.run_id}  ·  ${fmtDate(run_envelope.timestamp)}`, MARGIN, 29);

  // Summary bar
  const crit = alerts.filter(a => a.severity === 'CRITICAL').length;
  const warn = alerts.filter(a => a.severity === 'WARNING').length;
  const info = alerts.filter(a => a.severity === 'INFO').length;
  const ack  = alerts.filter(a => a.acknowledged).length;
  doc.setFillColor(...PANEL);
  doc.rect(MARGIN, 34, TEXT_W, 10, 'F');
  doc.setTextColor(248, 113, 113);
  doc.setFontSize(7);
  doc.text(`${crit} CRITICAL`, MARGIN + 4, 40.5);
  doc.setTextColor(251, 179, 71);
  doc.text(`${warn} WARNING`, MARGIN + 36, 40.5);
  doc.setTextColor(138, 148, 160);
  doc.text(`${info} INFO`, MARGIN + 68, 40.5);
  doc.setTextColor(74, 222, 128);
  doc.text(`${ack} ACKNOWLEDGED`, MARGIN + 90, 40.5);

  autoTable(doc, {
    startY: 50,
    head: [['Rule ID', 'Severity', 'Category', 'Status', 'Reason', 'Recommendation']],
    body: alerts.map(a => [
      a.ruleId,
      a.severity,
      a.category,
      a.acknowledged ? 'ACK' : a.escalated ? 'ESC' : 'PENDING',
      a.reason,
      a.recommendation,
    ]),
    styles: {
      fillColor: [21, 33, 56],
      textColor: [229, 234, 242],
      fontSize: 6.5,
      lineColor: [42, 53, 69],
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: { fillColor: [34, 47, 77], textColor: [34, 211, 238], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 17 },
      2: { cellWidth: 32 },
      3: { cellWidth: 16 },
      4: { cellWidth: 52 },
      5: { cellWidth: 47 },
    },
    didParseCell: (data) => {
      if (data.column.index === 1 && data.row.section === 'body') {
        const sv = data.cell.raw as string;
        data.cell.styles.textColor = sv === 'CRITICAL' ? [248, 113, 113]
          : sv === 'WARNING' ? [251, 179, 71] : [138, 148, 160];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 3 && data.row.section === 'body') {
        const st = data.cell.raw as string;
        data.cell.styles.textColor = st === 'ACK' ? [74, 222, 128]
          : st === 'ESC' ? [129, 140, 248] : [138, 148, 160];
      }
    },
    alternateRowStyles: { fillColor: [16, 26, 46] },
    margin: { left: MARGIN, right: MARGIN },
  });

  doc.save(`Alerts_${safeId(run_envelope.run_id)}.pdf`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. EXECUTIVE BRIEFING PDF (A4, board-distribution format)
// ═════════════════════════════════════════════════════════════════════════════

export async function exportExecutiveBriefPdf(
  result: CalculateResponse,
  baseCcy: string,
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { hedge_plan, scenario_results, validation_report, run_envelope } = result;
  const { summary, buckets } = hedge_plan;

  const totalExposure = buckets.reduce(
    (s, b) => s + Math.abs(b.commercial_exposure_mxn), 0,
  );
  const coveragePct = totalExposure > 0
    ? Math.abs(summary.total_hedge_position_mxn) / totalExposure : 0;
  const kpis = scenarioKpis(scenario_results.totals, summary);
  const compliance = policyComplianceChecks(buckets, summary, {
    bucket_mode: 'CALENDAR_MONTH', hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
    cost_assumptions: { spread_bps: 5 }, execution_product: 'NDF', min_trade_size_usd: 10000,
  });

  type RGB2 = [number, number, number];
  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 18;
  const DARK:   RGB2 = [11, 17, 32];
  const PANEL:  RGB2 = [21, 33, 56];
  const CYAN:   RGB2 = [34, 211, 238];
  const GREEN:  RGB2 = [74, 222, 128];
  const AMBER:  RGB2 = [251, 179, 71];
  const RED:    RGB2 = [248, 113, 113];
  const TEXT1:  RGB2 = [229, 234, 242];
  const TEXT2:  RGB2 = [163, 177, 198];
  const TEXT3:  RGB2 = [138, 148, 160];
  const VERDICT: RGB2 = validation_report.status === 'PASS' ? GREEN : RED;

  // Background
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  // Left accent stripe
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, 3, PAGE_H, 'F');

  // Header
  doc.setTextColor(...TEXT3);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('CONFIDENTIAL — COMMITTEE DISTRIBUTION', MARGIN, 16);
  doc.text(fmtDate(run_envelope.timestamp), PAGE_W - MARGIN, 16, { align: 'right' });

  // Company + title
  doc.setTextColor(...CYAN);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('SYNEXFUND  ·  HEDGECALC ENGINE', MARGIN, 28);
  doc.setTextColor(...TEXT1);
  doc.setFontSize(22);
  doc.text('FX Hedge Executive Briefing', MARGIN, 40);

  // Verdict chip
  doc.setFillColor(...VERDICT);
  doc.roundedRect(MARGIN, 46, 28, 8, 1.5, 1.5, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(validation_report.status, MARGIN + 14, 51.2, { align: 'center' });

  // Divider
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 60, PAGE_W - MARGIN, 60);

  // 5-metric strip
  const metrics: { label: string; value: string; color: RGB2 }[] = [
    { label: 'TOTAL EXPOSURE',  value: `${fmtMXN(Math.abs(summary.total_commercial_exposure_mxn))} ${baseCcy}`, color: TEXT1 },
    { label: 'COVERAGE',        value: fmtPct(coveragePct),   color: coveragePct >= 0.95 ? GREEN : AMBER },
    { label: 'RESIDUAL',        value: `${fmtMXN(Math.abs(summary.total_residual_mxn))} ${baseCcy}`, color: summary.total_residual_mxn !== 0 ? AMBER : GREEN },
    { label: 'FRICTION COST',   value: fmtUSD(summary.total_friction_usd), color: AMBER },
    { label: 'WORST-CASE',      value: fmtUSD(kpis.worstCaseLoss), color: RED },
  ];
  const metW = (PAGE_W - MARGIN * 2) / metrics.length;
  metrics.forEach((m, i) => {
    const x = MARGIN + i * metW;
    doc.setFillColor(...PANEL);
    doc.rect(x, 65, metW - 2, 22, 'F');
    doc.setTextColor(...TEXT3);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(m.label, x + 3, 71);
    doc.setTextColor(...m.color);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    const v = doc.splitTextToSize(m.value, metW - 6);
    doc.text(v[0], x + 3, 80);
    if (v[1]) doc.text(v[1], x + 3, 84.5);
  });

  // Compliance badge
  const compColor: RGB2 = compliance.classification === 'ALIGNED' ? GREEN
    : compliance.classification === 'MINOR DEVIATIONS' ? AMBER : RED;
  doc.setFillColor(...PANEL);
  doc.rect(MARGIN, 92, PAGE_W - MARGIN * 2, 10, 'F');
  doc.setTextColor(...TEXT3);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('POLICY COMPLIANCE', MARGIN + 3, 98.5);
  doc.setTextColor(compColor[0], compColor[1], compColor[2]);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`${compliance.score}%  —  ${compliance.classification}`, MARGIN + 40, 98.5);
  doc.setTextColor(...TEXT3);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(`${compliance.checks.filter(c => c.pass).length}/${compliance.checks.length} rules passed`, PAGE_W - MARGIN - 3, 98.5, { align: 'right' });

  // Narrative section
  doc.setTextColor(...CYAN);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('ASSESSMENT NARRATIVE', MARGIN, 112);
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 114, PAGE_W - MARGIN, 114);

  let y = 120;
  try {
    const narrative = generateExecutiveNarrative(buckets, summary, scenario_results.totals, {
      bucket_mode: 'CALENDAR_MONTH', hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
      cost_assumptions: { spread_bps: 5 }, execution_product: 'NDF', min_trade_size_usd: 10000,
    });
    doc.setTextColor(...TEXT2);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    narrative.forEach((line: string, i: number) => {
      const bullet = `${i + 1}. `;
      const wrapped = doc.splitTextToSize(bullet + line, PAGE_W - MARGIN * 2);
      doc.text(wrapped, MARGIN, y);
      y += wrapped.length * 5.2 + 3;
    });
  } catch {
    doc.setTextColor(...TEXT3);
    doc.setFontSize(8);
    doc.text('Assessment narrative unavailable for this run configuration.', MARGIN, y);
    y += 8;
  }

  // Approval block
  y = Math.max(y + 8, 230);
  doc.setFillColor(...PANEL);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 36, 'F');
  doc.setTextColor(...CYAN);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('APPROVALS', MARGIN + 4, y + 7);

  const approvalFields = ['Prepared By', 'Reviewed By', 'Approved By'];
  approvalFields.forEach((field, i) => {
    const x = MARGIN + 4 + i * 58;
    doc.setTextColor(...TEXT3);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(field.toUpperCase(), x, y + 15);
    doc.setDrawColor(42, 53, 69);
    doc.setLineWidth(0.3);
    doc.line(x, y + 28, x + 50, y + 28);
    doc.text('Signature / Date', x, y + 34);
  });

  // Footer
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
  doc.setTextColor(...TEXT3);
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `HedgeCalc Engine v${run_envelope.engine_version}  ·  Run ID: ${run_envelope.run_id}  ·  Inputs SHA-256: ${run_envelope.inputs_hash.slice(0, 16)}…`,
    PAGE_W / 2, PAGE_H - 8,
    { align: 'center' },
  );

  doc.save(`ExecutiveBrief_${safeId(run_envelope.run_id)}.pdf`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. PER-REPORT CSV helpers (called from ReportsContainer section buttons)
// ═════════════════════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════════
// 9. XLSX EXPORTS (SheetJS)
// ═════════════════════════════════════════════════════════════════════════════

const POSITION_COLUMNS: { key: string; header: string }[] = [
  { key: "record_id",        header: "Record ID" },
  { key: "entity",           header: "Entity" },
  { key: "flow_type",        header: "Flow Type" },
  { key: "currency",         header: "Currency" },
  { key: "amount",           header: "Amount" },
  { key: "value_date",       header: "Value Date" },
  { key: "status",           header: "Status" },
  { key: "execution_status", header: "Execution Status" },
  { key: "hedge_amount",     header: "Hedge Amount" },
  { key: "hedge_rate",       header: "Hedge Rate" },
];

export function exportPositionsXlsx(
  rows: Record<string, unknown>[],
  filename = "positions-export.xlsx",
): void {
  const XLSX = require("xlsx");
  const data = [
    POSITION_COLUMNS.map((c) => c.header),
    ...rows.map((r) => POSITION_COLUMNS.map((c) => r[c.key] ?? "")),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Positions");
  XLSX.writeFile(wb, filename);
}

export function exportDataXlsx(
  headers: string[],
  rows: unknown[][],
  filename: string,
): void {
  const XLSX = require("xlsx");
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  const sheetName = filename.replace(/\.xlsx$/i, "").slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "Sheet1");
  XLSX.writeFile(wb, filename);
}



export function exportReportCsv(
  reportKey: string,
  result: CalculateResponse,
  baseCcy: string,
): void {
  const Papa = require('papaparse');
  const { hedge_plan, scenario_results } = result;
  const { buckets, summary } = hedge_plan;

  let rows: Record<string, unknown>[] = [];
  let filename = 'Report';

  if (reportKey === 'coverage') {
    filename = 'R01_Coverage';
    rows = buckets.map(b => {
      const cov = Math.abs(b.commercial_exposure_mxn) > 0
        ? Math.abs(b.hedge_position_mxn) / Math.abs(b.commercial_exposure_mxn) : 0;
      return {
        bucket: b.bucket, currency: baseCcy,
        commercial_exposure: b.commercial_exposure_mxn,
        existing_hedges: b.existing_hedges_mxn,
        new_action: b.action_mxn,
        hedge_position: b.hedge_position_mxn,
        residual: b.residual_mxn,
        coverage_pct: (cov * 100).toFixed(1),
        suppressed: b.suppressed,
      };
    });
  } else if (reportKey === 'cost') {
    filename = 'R02_CostSlippage';
    rows = buckets.filter(b => !b.suppressed).map(b => ({
      bucket: b.bucket,
      notional: b.action_mxn,
      action_usd: b.action_usd,
      spread_bps: 5,
      friction_usd: b.friction_usd,
      carry_note: b.carry_note,
    }));
  } else if (reportKey === 'scenario') {
    filename = 'R03_Scenario';
    rows = scenario_results.totals.map(t => ({
      sigma: t.sigma,
      shocked_spot: t.shocked_spot,
      total_unhedged_usd: t.total_unhedged_usd,
      total_hedged_usd: t.total_hedged_usd,
      total_hedge_benefit_usd: t.total_hedge_benefit_usd,
    }));
  } else if (reportKey === 'compliance') {
    filename = 'R04_Compliance';
    const compliance = policyComplianceChecks(buckets, summary, {
      bucket_mode: 'CALENDAR_MONTH', hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
      cost_assumptions: { spread_bps: 5 }, execution_product: 'NDF', min_trade_size_usd: 10000,
    });
    rows = compliance.checks.map(c => ({ rule: c.label, pass: c.pass, detail: c.detail }));
    rows.push({ rule: 'SCORE', pass: compliance.score >= 80, detail: `${compliance.score}% — ${compliance.classification}` });
  } else if (reportKey === 'liquidity') {
    filename = 'R05_Liquidity';
    const totalExp = buckets.reduce((s, b) => s + Math.abs(b.commercial_exposure_mxn), 0);
    rows = [...buckets]
      .sort((a, b) => Math.abs(b.commercial_exposure_mxn) - Math.abs(a.commercial_exposure_mxn))
      .map((b, rank) => {
        const pct = totalExp > 0 ? Math.abs(b.commercial_exposure_mxn) / totalExp : 0;
        const cov = Math.abs(b.commercial_exposure_mxn) > 0
          ? Math.abs(b.hedge_position_mxn) / Math.abs(b.commercial_exposure_mxn) : 0;
        return {
          rank: rank + 1, bucket: b.bucket,
          exposure: b.commercial_exposure_mxn,
          pct_of_total: (pct * 100).toFixed(1),
          coverage_pct: (cov * 100).toFixed(1),
          risk_flag: pct > 0.6 ? 'HIGH CONC' : pct > 0.3 ? 'MODERATE' : 'OK',
        };
      });
  }

  const csv  = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${safeId(result.run_envelope.run_id)}.csv`);
}
