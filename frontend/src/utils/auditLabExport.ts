/**
 * auditLabExport.ts
 *
 * 100% client-side export utilities for the Audit Lab.
 * No backend required — all files are generated in the browser via:
 *   - jsPDF + jspdf-autotable  -> PDF
 *   - xlsx (SheetJS)           -> XLSX workbook files
 *   - papaparse                -> CSV
 *
 * All async functions trigger an immediate browser download.
 * Patterns and design tokens match clientExport.ts (Committee Pack style).
 */

import { fmtUSD, fmtPct, fmtCompact } from './formatters';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RunData {
  run_id: string;
  run_hash: string;
  methodology_version: string;
  created_at?: string;
  // TODO: define a typed Finding interface; the callers access markup_amount,
  // severity, etc. as numbers/strings — narrowing them properly is a refactor.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findings: Array<Record<string, any>>;
  markup_by_pair: Record<string, number>;
  markup_by_counterparty: Record<string, number>;
  markup_by_month: Record<string, number>;
}

export interface Transaction {
  id: string;
  row_index: number;
  trade_date?: string;
  currency_sold?: string;
  currency_bought?: string;
  amount_sold?: number;
  amount_bought?: number;
  effective_rate?: number;
  counterparty?: string;
  fee_amount?: number;
  benchmark_rate?: number;
  markup_per_unit?: number;
  markup_cost_usd?: number;
  markup_direction?: string;
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

// ── Helper: safe filename segment ────────────────────────────────────────────

function safeId(runId: string): string {
  return runId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
}

// ── Helper: format ISO date for display ──────────────────────────────────────

function fmtDate(iso?: string): string {
  if (!iso) return new Date().toUTCString();
  try { return new Date(iso).toUTCString(); } catch { return iso; }
}

// ── Helper: severity color mapping ───────────────────────────────────────────

type RGB = [number, number, number];

function severityColor(severity: string): RGB {
  switch ((severity ?? '').toUpperCase()) {
    case 'CRITICAL': return [248, 113, 113];
    case 'HIGH':     return [248, 113, 113];
    case 'WARNING':  return [251, 179, 71];
    case 'MEDIUM':   return [251, 179, 71];
    case 'LOW':      return [138, 148, 160];
    case 'INFO':     return [138, 148, 160];
    default:         return [229, 234, 242];
  }
}

// ── Design constants (match Committee Pack dark theme) ───────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN  = 14;
const TEXT_W  = PAGE_W - MARGIN * 2;

const DARK:   RGB = [11, 17, 32];
const PANEL:  RGB = [21, 33, 56];
const CYAN:   RGB = [34, 211, 238];
const GREEN:  RGB = [74, 222, 128];
const AMBER:  RGB = [251, 179, 71];
const RED:    RGB = [248, 113, 113];
const TEXT1:  RGB = [229, 234, 242];
const TEXT3:  RGB = [138, 148, 160];

// ═════════════════════════════════════════════════════════════════════════════
// 1. AUDIT LAB PDF (Item 17)
// ═════════════════════════════════════════════════════════════════════════════

export async function exportAuditLabPdf(runData: RunData): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { summary, findings, markup_by_pair, markup_by_counterparty } = runData;
  const generatedAt = new Date().toISOString();

  // ── Helpers ─────────────────────────────────────────────────────────────
  let y = MARGIN;

  function darkPage() {
    doc.setFillColor(...DARK);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
    doc.setFillColor(...CYAN);
    doc.rect(0, 0, PAGE_W, 1.5, 'F');
    y = MARGIN;
  }

  function sectionHeader(label: string) {
    doc.setFillColor(...PANEL);
    doc.rect(MARGIN, y, TEXT_W, 7, 'F');
    doc.setTextColor(...CYAN);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(label, MARGIN + 3, y + 4.5);
    y += 10;
  }

  function pageFooter() {
    doc.setTextColor(...TEXT3);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Audit Lab Report  ·  Run ${runData.run_id}  ·  Hash ${runData.run_hash.slice(0, 16)}...  ·  ${fmtDate(generatedAt)}`,
      PAGE_W / 2, PAGE_H - 6,
      { align: 'center' },
    );
  }

  // ── PAGE 1: COVER ───────────────────────────────────────────────────────
  darkPage();

  // Title block
  doc.setTextColor(...TEXT3);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('SYNEXFUND — AUDIT LAB', MARGIN, 30);
  doc.setTextColor(...TEXT1);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text('FX Markup Audit Report', MARGIN, 44);
  doc.setTextColor(...CYAN);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Transaction Cost Analysis & Evidence Pack', MARGIN, 53);

  // Finding severity badge
  const critCount = findings.filter(f => (f.severity ?? '').toUpperCase() === 'CRITICAL' || (f.severity ?? '').toUpperCase() === 'HIGH').length;
  const badgeColor: RGB = critCount > 0 ? RED : GREEN;
  const badgeText = critCount > 0 ? `${critCount} HIGH/CRITICAL` : 'NO CRITICAL FINDINGS';
  doc.setFillColor(...badgeColor);
  doc.roundedRect(MARGIN, 62, 50, 10, 1.5, 1.5, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(badgeText, MARGIN + 25, 68.5, { align: 'center' });

  // Meta grid
  doc.setFillColor(...PANEL);
  doc.rect(MARGIN, 80, TEXT_W, 34, 'F');
  const metaRows: [string, string][] = [
    ['Run ID',              runData.run_id],
    ['Run Hash',            runData.run_hash.slice(0, 32) + '...'],
    ['Methodology',         runData.methodology_version],
    ['Generated',           fmtDate(generatedAt)],
    ['Total Findings',      String(findings.length)],
    ['Pairs Analyzed',      String(Object.keys(markup_by_pair).length)],
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

  // Hashes at bottom
  doc.setTextColor(...TEXT3);
  doc.setFontSize(6);
  doc.setFont('courier', 'normal');
  doc.text(`RUN HASH: ${runData.run_hash}`, MARGIN, PAGE_H - 10);
  pageFooter();

  // ── PAGE 2: KPI SUMMARY ─────────────────────────────────────────────────
  doc.addPage();
  darkPage();

  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('KPI Summary', MARGIN, y + 6);
  y += 14;

  const totalMarkup = summary.total_markup_cost_usd ?? 0;
  const avgMarkup = summary.avg_markup_bps ?? 0;
  const txCount = summary.transaction_count ?? 0;
  const totalFees = summary.total_fees_usd ?? 0;
  const maxMarkup = summary.max_markup_bps ?? 0;
  const outlierPct = summary.outlier_pct ?? 0;

  const kpiData: { label: string; value: string; color: RGB }[] = [
    { label: 'Total Markup Cost',     value: fmtUSD(totalMarkup),                   color: totalMarkup > 0 ? AMBER : GREEN },
    { label: 'Avg Markup (bps)',      value: `${avgMarkup.toFixed(1)} bps`,         color: avgMarkup > 20 ? RED : avgMarkup > 10 ? AMBER : GREEN },
    { label: 'Transactions',          value: fmtCompact(txCount),                    color: TEXT1 },
    { label: 'Total Fees',            value: fmtUSD(totalFees),                      color: AMBER },
    { label: 'Max Markup (bps)',      value: `${maxMarkup.toFixed(1)} bps`,         color: maxMarkup > 50 ? RED : AMBER },
    { label: 'Outlier Rate',          value: fmtPct(outlierPct / 100),               color: outlierPct > 5 ? RED : outlierPct > 2 ? AMBER : GREEN },
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

  // Summary narrative
  sectionHeader('ANALYSIS OVERVIEW');
  const narrativeLines = [
    `Analyzed ${txCount} transactions across ${Object.keys(markup_by_pair).length} currency pairs.`,
    `Total markup cost: ${fmtUSD(totalMarkup)} with average spread of ${avgMarkup.toFixed(1)} bps.`,
    `${findings.length} findings identified, ${critCount} classified as high/critical severity.`,
    `${Object.keys(markup_by_counterparty).length} counterparties evaluated for cost competitiveness.`,
  ];
  doc.setTextColor(...TEXT1);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  narrativeLines.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, TEXT_W - 4);
    wrapped.forEach((l: string) => {
      doc.text(l, MARGIN + 2, y);
      y += 4.5;
    });
    y += 1;
  });

  pageFooter();

  // ── PAGE 3: FINDINGS TABLE ──────────────────────────────────────────────
  doc.addPage();
  darkPage();

  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Findings', MARGIN, y + 6);
  y += 14;

  if (findings.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['#', 'Severity', 'Category', 'Description', 'Impact (USD)', 'Recommendation']],
      body: findings.map((f, i) => [
        String(i + 1),
        (f.severity ?? 'INFO').toUpperCase(),
        f.category ?? '-',
        f.description ?? f.message ?? '-',
        f.impact_usd != null ? fmtUSD(f.impact_usd) : '-',
        f.recommendation ?? '-',
      ]),
      styles: {
        fillColor: [21, 33, 56],
        textColor: [229, 234, 242],
        fontSize: 10.5,
        lineColor: [42, 53, 69],
        lineWidth: 0.1,
        overflow: 'linebreak',
      },
      headStyles: { fillColor: [34, 47, 77], textColor: [34, 211, 238], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 17 },
        2: { cellWidth: 24 },
        3: { cellWidth: 52 },
        4: { cellWidth: 22 },
        5: { cellWidth: 52 },
      },
      didParseCell: (data) => {
        if (data.column.index === 1 && data.row.section === 'body') {
          data.cell.styles.textColor = severityColor(data.cell.raw as string);
          data.cell.styles.fontStyle = 'bold';
        }
      },
      alternateRowStyles: { fillColor: [16, 26, 46] },
      margin: { left: MARGIN, right: MARGIN },
    });
  } else {
    doc.setTextColor(...GREEN);
    doc.setFontSize(10);
    doc.text('No findings to report.', MARGIN + 2, y + 4);
  }

  pageFooter();

  // ── PAGE 4: MARKUP BY PAIR ──────────────────────────────────────────────
  doc.addPage();
  darkPage();

  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Markup by Currency Pair', MARGIN, y + 6);
  y += 14;

  const pairEntries = Object.entries(markup_by_pair).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  if (pairEntries.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Currency Pair', 'Avg Markup (bps)', 'Assessment']],
      body: pairEntries.map(([pair, bps]) => {
        const assessment = Math.abs(bps) > 50 ? 'EXCESSIVE'
          : Math.abs(bps) > 20 ? 'ELEVATED'
          : Math.abs(bps) > 10 ? 'MODERATE'
          : 'ACCEPTABLE';
        return [pair, bps.toFixed(2), assessment];
      }),
      styles: {
        fillColor: [21, 33, 56],
        textColor: [229, 234, 242],
        fontSize: 10.5,
        lineColor: [42, 53, 69],
        lineWidth: 0.1,
      },
      headStyles: { fillColor: [34, 47, 77], textColor: [34, 211, 238], fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.column.index === 2 && data.row.section === 'body') {
          const val = data.cell.raw as string;
          data.cell.styles.textColor = val === 'EXCESSIVE' ? [248, 113, 113]
            : val === 'ELEVATED' ? [251, 179, 71]
            : val === 'MODERATE' ? [138, 148, 160]
            : [74, 222, 128];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      alternateRowStyles: { fillColor: [16, 26, 46] },
      margin: { left: MARGIN, right: MARGIN },
    });
  } else {
    doc.setTextColor(...TEXT3);
    doc.setFontSize(8);
    doc.text('No pair-level markup data available.', MARGIN + 2, y + 4);
  }

  pageFooter();

  // ── PAGE 5: COUNTERPARTY BREAKDOWN ──────────────────────────────────────
  doc.addPage();
  darkPage();

  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Counterparty Breakdown', MARGIN, y + 6);
  y += 14;

  const cpEntries = Object.entries(markup_by_counterparty).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  if (cpEntries.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Counterparty', 'Avg Markup (bps)', 'Rank', 'Assessment']],
      body: cpEntries.map(([cp, bps], i) => {
        const assessment = Math.abs(bps) > 40 ? 'REVIEW REQUIRED'
          : Math.abs(bps) > 20 ? 'MONITOR'
          : 'COMPETITIVE';
        return [cp, bps.toFixed(2), String(i + 1), assessment];
      }),
      styles: {
        fillColor: [21, 33, 56],
        textColor: [229, 234, 242],
        fontSize: 10.5,
        lineColor: [42, 53, 69],
        lineWidth: 0.1,
      },
      headStyles: { fillColor: [34, 47, 77], textColor: [34, 211, 238], fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'center', cellWidth: 14 },
      },
      didParseCell: (data) => {
        if (data.column.index === 3 && data.row.section === 'body') {
          const val = data.cell.raw as string;
          data.cell.styles.textColor = val === 'REVIEW REQUIRED' ? [248, 113, 113]
            : val === 'MONITOR' ? [251, 179, 71]
            : [74, 222, 128];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      alternateRowStyles: { fillColor: [16, 26, 46] },
      margin: { left: MARGIN, right: MARGIN },
    });
  } else {
    doc.setTextColor(...TEXT3);
    doc.setFontSize(8);
    doc.text('No counterparty markup data available.', MARGIN + 2, y + 4);
  }

  pageFooter();

  // ── PAGE 6: EVIDENCE & ATTESTATION ──────────────────────────────────────
  doc.addPage();
  darkPage();

  doc.setTextColor(...TEXT1);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Evidence & Attestation', MARGIN, y + 6);
  y += 14;

  sectionHeader('CRYPTOGRAPHIC EVIDENCE');
  const hashRows: [string, string][] = [
    ['Run Hash',             runData.run_hash],
    ['Methodology Version',  runData.methodology_version],
    ['Generated At',         fmtDate(generatedAt)],
    ['Run ID',               runData.run_id],
  ];
  hashRows.forEach(([k, v]) => {
    doc.setTextColor(...TEXT3);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(k.toUpperCase(), MARGIN + 2, y);
    doc.setTextColor(...TEXT1);
    doc.setFontSize(6.5);
    doc.setFont('courier', 'normal');
    doc.text(v, MARGIN + 42, y);
    y += 5.5;
  });

  y += 6;
  sectionHeader('ATTESTATION PROPERTIES');
  const attestProps: [string, string][] = [
    ['Determinism',       'Analysis is fully reproducible given identical transaction inputs'],
    ['Hash Binding',      `Run locked via SHA-256: ${runData.run_hash.slice(0, 16)}...`],
    ['Methodology',       `Version ${runData.methodology_version} — benchmark-based markup detection`],
    ['Scope',             `${summary.transaction_count ?? 0} transactions, ${Object.keys(markup_by_pair).length} pairs, ${Object.keys(markup_by_counterparty).length} counterparties`],
    ['Integrity',         'All findings derived from benchmark comparison; no external models applied'],
  ];
  attestProps.forEach(([k, v]) => {
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

  y += 10;
  sectionHeader('DISCLAIMER');
  doc.setTextColor(...TEXT3);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  const disclaimer = 'This report is generated by automated transaction cost analysis. Markup calculations are based on comparison to benchmark rates available at the time of analysis. Actual costs may vary depending on execution conditions, market liquidity, and counterparty agreements. This report does not constitute financial advice.';
  const wrappedDisclaimer = doc.splitTextToSize(disclaimer, TEXT_W - 4);
  doc.text(wrappedDisclaimer, MARGIN + 2, y);

  pageFooter();

  doc.save(`AuditLab_${safeId(runData.run_id)}.pdf`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. AUDIT LAB XLSX (Item 18)
// ═════════════════════════════════════════════════════════════════════════════

export function exportAuditLabXlsx(runData: RunData, transactions: Transaction[]): void {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ────────────────────────────────────────────────────
  const summaryRows = [
    ['AUDIT LAB REPORT'],
    ['Run ID', runData.run_id],
    ['Run Hash', runData.run_hash],
    ['Methodology', runData.methodology_version],
    ['Generated', fmtDate(runData.created_at)],
    [],
    ['KPI', 'Value'],
    ['Total Markup Cost (USD)', runData.summary.total_markup_cost_usd ?? 0],
    ['Avg Markup (bps)', runData.summary.avg_markup_bps ?? 0],
    ['Max Markup (bps)', runData.summary.max_markup_bps ?? 0],
    ['Transaction Count', runData.summary.transaction_count ?? 0],
    ['Total Fees (USD)', runData.summary.total_fees_usd ?? 0],
    ['Outlier Rate (%)', runData.summary.outlier_pct ?? 0],
    ['Pairs Analyzed', Object.keys(runData.markup_by_pair).length],
    ['Counterparties', Object.keys(runData.markup_by_counterparty).length],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: Markup Findings ────────────────────────────────────────────
  const findingsHeaders = ['#', 'Severity', 'Category', 'Description', 'Impact (USD)', 'Recommendation'];
  const findingsData = [
    findingsHeaders,
    ...runData.findings.map((f, i) => [
      i + 1,
      (f.severity ?? 'INFO').toUpperCase(),
      f.category ?? '',
      f.description ?? f.message ?? '',
      f.impact_usd ?? '',
      f.recommendation ?? '',
    ]),
  ];
  const wsFindings = XLSX.utils.aoa_to_sheet(findingsData);
  XLSX.utils.book_append_sheet(wb, wsFindings, 'Markup Findings');

  // ── Sheet 3: Transactions ───────────────────────────────────────────────
  const txHeaders = [
    'Row', 'ID', 'Trade Date', 'Currency Sold', 'Currency Bought',
    'Amount Sold', 'Amount Bought', 'Effective Rate', 'Counterparty',
    'Benchmark Rate', 'Markup Per Unit', 'Markup Cost (USD)', 'Markup Direction',
  ];
  const txData = [
    txHeaders,
    ...transactions.map(t => [
      t.row_index,
      t.id,
      t.trade_date ?? '',
      t.currency_sold ?? '',
      t.currency_bought ?? '',
      t.amount_sold ?? '',
      t.amount_bought ?? '',
      t.effective_rate ?? '',
      t.counterparty ?? '',
      t.benchmark_rate ?? '',
      t.markup_per_unit ?? '',
      t.markup_cost_usd ?? '',
      t.markup_direction ?? '',
    ]),
  ];
  const wsTx = XLSX.utils.aoa_to_sheet(txData);
  XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions');

  // ── Sheet 4: Fees ───────────────────────────────────────────────────────
  const feesHeaders = ['Row', 'ID', 'Counterparty', 'Currency Pair', 'Fee Amount (USD)'];
  const feesData = [
    feesHeaders,
    ...transactions
      .filter(t => t.fee_amount != null && t.fee_amount !== 0)
      .map(t => [
        t.row_index,
        t.id,
        t.counterparty ?? '',
        `${t.currency_sold ?? ''}/${t.currency_bought ?? ''}`,
        t.fee_amount ?? 0,
      ]),
  ];
  const wsFees = XLSX.utils.aoa_to_sheet(feesData);
  XLSX.utils.book_append_sheet(wb, wsFees, 'Fees');

  // ── Sheet 5: Evidence ───────────────────────────────────────────────────
  const evidenceRows = [
    ['AUDIT EVIDENCE'],
    [],
    ['Property', 'Value'],
    ['Run ID', runData.run_id],
    ['Run Hash (SHA-256)', runData.run_hash],
    ['Methodology Version', runData.methodology_version],
    ['Generated At', fmtDate(runData.created_at)],
    ['Export Generated At', new Date().toISOString()],
    [],
    ['MARKUP BY PAIR'],
    ['Pair', 'Avg Markup (bps)'],
    ...Object.entries(runData.markup_by_pair)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([pair, bps]) => [pair, bps]),
    [],
    ['MARKUP BY COUNTERPARTY'],
    ['Counterparty', 'Avg Markup (bps)'],
    ...Object.entries(runData.markup_by_counterparty)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([cp, bps]) => [cp, bps]),
    [],
    ['MARKUP BY MONTH'],
    ['Month', 'Avg Markup (bps)'],
    ...Object.entries(runData.markup_by_month)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bps]) => [month, bps]),
  ];
  const wsEvidence = XLSX.utils.aoa_to_sheet(evidenceRows);
  XLSX.utils.book_append_sheet(wb, wsEvidence, 'Evidence');

  XLSX.writeFile(wb, `AuditLab_${safeId(runData.run_id)}.xlsx`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. BOARD SUMMARY PDF (Item 36)
// ═════════════════════════════════════════════════════════════════════════════

export async function exportBoardSummaryPdf(runData: RunData): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { summary, findings, markup_by_counterparty } = runData;
  const generatedAt = new Date().toISOString();

  let y = MARGIN;

  function darkPage() {
    doc.setFillColor(...DARK);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
    y = MARGIN;
  }

  function sectionHeader(label: string) {
    doc.setFillColor(...PANEL);
    doc.rect(MARGIN, y, TEXT_W, 7, 'F');
    doc.setTextColor(...CYAN);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(label, MARGIN + 3, y + 4.5);
    y += 10;
  }

  function boardFooter(pageNum: number, totalPages: number) {
    doc.setDrawColor(...CYAN);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
    doc.setTextColor(...TEXT3);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `CONFIDENTIAL  ·  Board Summary  ·  Page ${pageNum} of ${totalPages}  ·  ${fmtDate(generatedAt)}`,
      PAGE_W / 2, PAGE_H - 8,
      { align: 'center' },
    );
  }

  // ── PAGE 1: COVER ───────────────────────────────────────────────────────
  darkPage();

  // Left accent stripe
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, 3, PAGE_H, 'F');

  // CONFIDENTIAL watermark (diagonal)
  // jsPDF GState is exposed on the instance but not in the public typings.
  const docWithGState = doc as unknown as { GState: new (opts: { opacity: number }) => unknown };
  doc.setTextColor(34, 211, 238);
  doc.setGState(new docWithGState.GState({ opacity: 0.06 }));
  doc.setFontSize(72);
  doc.setFont('helvetica', 'bold');
  doc.text('CONFIDENTIAL', PAGE_W / 2, PAGE_H / 2, {
    align: 'center',
    angle: 45,
  });
  doc.setGState(new docWithGState.GState({ opacity: 1 }));

  // Header
  doc.setTextColor(...TEXT3);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('CONFIDENTIAL — BOARD DISTRIBUTION ONLY', MARGIN + 6, 16);
  doc.text(fmtDate(generatedAt), PAGE_W - MARGIN, 16, { align: 'right' });

  // Title
  doc.setTextColor(...CYAN);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('SYNEXFUND  ·  AUDIT LAB', MARGIN + 6, 32);
  doc.setTextColor(...TEXT1);
  doc.setFontSize(24);
  doc.text('Board Summary', MARGIN + 6, 46);
  doc.setTextColor(...TEXT3);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('FX Transaction Cost Audit — Executive Review', MARGIN + 6, 56);

  // Severity badge
  const critCount = findings.filter(f => ['CRITICAL', 'HIGH'].includes((f.severity ?? '').toUpperCase())).length;
  const badgeColor: RGB = critCount > 0 ? RED : GREEN;
  const badgeLabel = critCount > 0 ? `${critCount} HIGH/CRITICAL FINDING${critCount > 1 ? 'S' : ''}` : 'CLEAN AUDIT';
  doc.setFillColor(...badgeColor);
  doc.roundedRect(MARGIN + 6, 64, 54, 10, 1.5, 1.5, 'F');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(badgeLabel, MARGIN + 33, 70.5, { align: 'center' });

  // Meta panel
  doc.setFillColor(...PANEL);
  doc.rect(MARGIN + 6, 82, TEXT_W - 6, 28, 'F');
  const coverMeta: [string, string][] = [
    ['Run ID',         runData.run_id],
    ['Run Hash',       runData.run_hash.slice(0, 32) + '...'],
    ['Methodology',    runData.methodology_version],
    ['Report Date',    fmtDate(generatedAt)],
  ];
  coverMeta.forEach(([k, v], i) => {
    const col = i % 2 === 0 ? MARGIN + 10 : MARGIN + TEXT_W / 2 + 3;
    const row = 87 + Math.floor(i / 2) * 12;
    doc.setTextColor(...TEXT3);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(k.toUpperCase(), col, row);
    doc.setTextColor(...TEXT1);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(v, col, row + 4.5);
  });

  boardFooter(1, 6);

  // ── PAGE 2: EXECUTIVE SUMMARY ───────────────────────────────────────────
  doc.addPage();
  darkPage();
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, 3, PAGE_H, 'F');

  doc.setTextColor(...TEXT3);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('CONFIDENTIAL — BOARD DISTRIBUTION ONLY', MARGIN + 6, 16);

  doc.setTextColor(...TEXT1);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Executive Summary', MARGIN + 6, 30);
  y = 38;

  // KPI strip (3x2)
  const totalMarkup = summary.total_markup_cost_usd ?? 0;
  const avgMarkup = summary.avg_markup_bps ?? 0;
  const txCount = summary.transaction_count ?? 0;
  const totalFees = summary.total_fees_usd ?? 0;
  const maxMarkup = summary.max_markup_bps ?? 0;
  const pairCount = Object.keys(runData.markup_by_pair).length;

  const boardKpis: { label: string; value: string; color: RGB }[] = [
    { label: 'Total Markup Cost',  value: fmtUSD(totalMarkup),            color: totalMarkup > 0 ? AMBER : GREEN },
    { label: 'Avg Markup',         value: `${avgMarkup.toFixed(1)} bps`,  color: avgMarkup > 20 ? RED : AMBER },
    { label: 'Transactions',       value: String(txCount),                 color: TEXT1 },
    { label: 'Total Fees',         value: fmtUSD(totalFees),              color: AMBER },
    { label: 'Max Markup',         value: `${maxMarkup.toFixed(1)} bps`,  color: maxMarkup > 50 ? RED : AMBER },
    { label: 'Pairs Analyzed',     value: String(pairCount),               color: TEXT1 },
  ];

  const kpiW = (TEXT_W - 6) / 3;
  boardKpis.forEach((kpi, i) => {
    const col = MARGIN + 6 + (i % 3) * kpiW;
    const row = y + Math.floor(i / 3) * 22;
    doc.setFillColor(...PANEL);
    doc.rect(col, row, kpiW - 2, 18, 'F');
    doc.setTextColor(...TEXT3);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label.toUpperCase(), col + 3, row + 5);
    doc.setTextColor(...kpi.color);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, col + 3, row + 14);
  });
  y += 50;

  // Executive narrative
  doc.setTextColor(...CYAN);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('KEY OBSERVATIONS', MARGIN + 6, y);
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(0.2);
  doc.line(MARGIN + 6, y + 2, PAGE_W - MARGIN, y + 2);
  y += 8;

  const observations = [
    `The audit analyzed ${txCount} FX transactions across ${pairCount} currency pairs, covering ${Object.keys(markup_by_counterparty).length} counterparties.`,
    `Total identified markup cost of ${fmtUSD(totalMarkup)}, representing an average of ${avgMarkup.toFixed(1)} basis points above benchmark rates.`,
    findings.length > 0
      ? `${findings.length} findings were identified, with ${critCount} classified as high or critical severity requiring management attention.`
      : 'No material findings were identified. Execution costs are within acceptable benchmarks.',
    `Maximum observed markup was ${maxMarkup.toFixed(1)} bps. ${maxMarkup > 50 ? 'This exceeds the recommended threshold of 50 bps and warrants investigation.' : 'All markups are within acceptable thresholds.'}`,
  ];

  doc.setTextColor(...TEXT1);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  observations.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, TEXT_W - 10);
    doc.text(wrapped, MARGIN + 6, y);
    y += wrapped.length * 5 + 3;
  });

  boardFooter(2, 6);

  // ── PAGE 3: FINDINGS BY SEVERITY ────────────────────────────────────────
  doc.addPage();
  darkPage();
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, 3, PAGE_H, 'F');

  doc.setTextColor(...TEXT3);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('CONFIDENTIAL — BOARD DISTRIBUTION ONLY', MARGIN + 6, 16);

  doc.setTextColor(...TEXT1);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Findings by Severity', MARGIN + 6, 30);
  y = 38;

  // Severity distribution bar
  const severityCounts: Record<string, number> = {};
  findings.forEach(f => {
    const sev = (f.severity ?? 'INFO').toUpperCase();
    severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;
  });

  const sevOrder = ['CRITICAL', 'HIGH', 'WARNING', 'MEDIUM', 'LOW', 'INFO'];
  const sevColors: Record<string, RGB> = {
    CRITICAL: RED, HIGH: RED, WARNING: AMBER, MEDIUM: AMBER, LOW: TEXT3, INFO: TEXT3,
  };

  sevOrder.forEach(sev => {
    const count = severityCounts[sev] ?? 0;
    if (count === 0) return;
    doc.setFillColor(...PANEL);
    doc.rect(MARGIN + 6, y, TEXT_W - 6, 8, 'F');
    doc.setTextColor(...(sevColors[sev] ?? TEXT1));
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(sev, MARGIN + 10, y + 5.5);
    doc.setTextColor(...TEXT1);
    doc.setFontSize(9);
    doc.text(String(count), MARGIN + TEXT_W - 10, y + 5.5, { align: 'right' });
    y += 10;
  });

  if (findings.length === 0) {
    doc.setFillColor(...PANEL);
    doc.rect(MARGIN + 6, y, TEXT_W - 6, 10, 'F');
    doc.setTextColor(...GREEN);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('NO FINDINGS — CLEAN AUDIT', MARGIN + 10, y + 6.5);
    y += 14;
  }

  y += 6;

  // Findings table (top 10 for board)
  if (findings.length > 0) {
    const topFindings = findings
      .sort((a, b) => {
        const sevRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, WARNING: 2, MEDIUM: 3, LOW: 4, INFO: 5 };
        return (sevRank[(a.severity ?? 'INFO').toUpperCase()] ?? 5) - (sevRank[(b.severity ?? 'INFO').toUpperCase()] ?? 5);
      })
      .slice(0, 10);

    autoTable(doc, {
      startY: y,
      head: [['Severity', 'Category', 'Description', 'Impact (USD)']],
      body: topFindings.map(f => [
        (f.severity ?? 'INFO').toUpperCase(),
        f.category ?? '-',
        f.description ?? f.message ?? '-',
        f.impact_usd != null ? fmtUSD(f.impact_usd) : '-',
      ]),
      styles: {
        fillColor: [21, 33, 56],
        textColor: [229, 234, 242],
        fontSize: 10,
        lineColor: [42, 53, 69],
        lineWidth: 0.1,
        overflow: 'linebreak',
      },
      headStyles: { fillColor: [34, 47, 77], textColor: [34, 211, 238], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 28 },
        3: { cellWidth: 24, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.column.index === 0 && data.row.section === 'body') {
          data.cell.styles.textColor = severityColor(data.cell.raw as string);
          data.cell.styles.fontStyle = 'bold';
        }
      },
      alternateRowStyles: { fillColor: [16, 26, 46] },
      margin: { left: MARGIN + 6, right: MARGIN },
    });

    if (findings.length > 10) {
      // jspdf-autotable attaches lastAutoTable to the doc instance.
      const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 60;
      doc.setTextColor(...TEXT3);
      doc.setFontSize(6.5);
      doc.text(`Showing top 10 of ${findings.length} findings. See full Audit Lab report for complete details.`, MARGIN + 6, lastY + 6);
    }
  }

  boardFooter(3, 6);

  // ── PAGE 4: COUNTERPARTY TOP-3 ─────────────────────────────────────────
  doc.addPage();
  darkPage();
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, 3, PAGE_H, 'F');

  doc.setTextColor(...TEXT3);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('CONFIDENTIAL — BOARD DISTRIBUTION ONLY', MARGIN + 6, 16);

  doc.setTextColor(...TEXT1);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Counterparty Analysis — Top 3', MARGIN + 6, 30);
  y = 40;

  const cpSorted = Object.entries(markup_by_counterparty)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top3 = cpSorted.slice(0, 3);

  if (top3.length > 0) {
    top3.forEach(([cp, bps], i) => {
      const assessment = Math.abs(bps) > 40 ? 'REVIEW REQUIRED'
        : Math.abs(bps) > 20 ? 'MONITOR'
        : 'COMPETITIVE';
      const assessColor: RGB = assessment === 'REVIEW REQUIRED' ? RED
        : assessment === 'MONITOR' ? AMBER : GREEN;

      doc.setFillColor(...PANEL);
      doc.rect(MARGIN + 6, y, TEXT_W - 6, 24, 'F');

      // Rank badge
      doc.setFillColor(...CYAN);
      doc.roundedRect(MARGIN + 10, y + 3, 10, 8, 1, 1, 'F');
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(`#${i + 1}`, MARGIN + 15, y + 8.5, { align: 'center' });

      // Name
      doc.setTextColor(...TEXT1);
      doc.setFontSize(10);
      doc.text(cp, MARGIN + 24, y + 9);

      // Markup value
      doc.setTextColor(...AMBER);
      doc.setFontSize(9);
      doc.text(`${bps.toFixed(1)} bps avg`, MARGIN + TEXT_W - 60, y + 9, { align: 'right' });

      // Assessment badge
      doc.setFillColor(...assessColor);
      doc.roundedRect(MARGIN + TEXT_W - 52, y + 3, 42, 8, 1, 1, 'F');
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(6.5);
      doc.text(assessment, MARGIN + TEXT_W - 31, y + 8.5, { align: 'center' });

      // Bottom detail line
      doc.setTextColor(...TEXT3);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Ranked by absolute average markup. ${Math.abs(bps) > 40 ? 'Exceeds 40 bps threshold — management review recommended.' : 'Within acceptable range.'}`, MARGIN + 10, y + 19);

      y += 28;
    });
  } else {
    doc.setTextColor(...TEXT3);
    doc.setFontSize(9);
    doc.text('No counterparty data available.', MARGIN + 6, y + 6);
    y += 14;
  }

  // Full counterparty table (if more than 3)
  if (cpSorted.length > 3) {
    y += 6;
    doc.setTextColor(...CYAN);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('ALL COUNTERPARTIES', MARGIN + 6, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Rank', 'Counterparty', 'Avg Markup (bps)', 'Assessment']],
      body: cpSorted.map(([cp, bps], i) => {
        const assessment = Math.abs(bps) > 40 ? 'REVIEW REQUIRED'
          : Math.abs(bps) > 20 ? 'MONITOR' : 'COMPETITIVE';
        return [String(i + 1), cp, bps.toFixed(2), assessment];
      }),
      styles: {
        fillColor: [21, 33, 56],
        textColor: [229, 234, 242],
        fontSize: 10,
        lineColor: [42, 53, 69],
        lineWidth: 0.1,
      },
      headStyles: { fillColor: [34, 47, 77], textColor: [34, 211, 238], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        2: { halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.column.index === 3 && data.row.section === 'body') {
          const val = data.cell.raw as string;
          data.cell.styles.textColor = val === 'REVIEW REQUIRED' ? [248, 113, 113]
            : val === 'MONITOR' ? [251, 179, 71] : [74, 222, 128];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      alternateRowStyles: { fillColor: [16, 26, 46] },
      margin: { left: MARGIN + 6, right: MARGIN },
    });
  }

  boardFooter(4, 6);

  // ── PAGE 5: RECOMMENDATIONS ─────────────────────────────────────────────
  doc.addPage();
  darkPage();
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, 3, PAGE_H, 'F');

  doc.setTextColor(...TEXT3);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('CONFIDENTIAL — BOARD DISTRIBUTION ONLY', MARGIN + 6, 16);

  doc.setTextColor(...TEXT1);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Recommendations', MARGIN + 6, 30);
  y = 40;

  // Build recommendations from findings
  const uniqueRecs: string[] = [];
  const seenRecs = new Set<string>();
  findings.forEach(f => {
    if (f.recommendation && !seenRecs.has(f.recommendation)) {
      seenRecs.add(f.recommendation);
      uniqueRecs.push(f.recommendation);
    }
  });

  // Default recommendations if none from findings
  if (uniqueRecs.length === 0) {
    uniqueRecs.push(
      'Continue current counterparty relationships. Execution costs are within acceptable benchmarks.',
      'Maintain regular audit cadence to ensure ongoing cost competitiveness.',
      'Consider expanding benchmark data sources for enhanced markup detection accuracy.',
    );
  }

  // Priority-based recommendation cards
  const priorities = ['IMMEDIATE', 'SHORT-TERM', 'ONGOING'];
  const priorityColors: RGB[] = [RED, AMBER, GREEN];

  uniqueRecs.forEach((rec, i) => {
    const priority = i < critCount ? priorities[0] : i < findings.length ? priorities[1] : priorities[2];
    const pColor = i < critCount ? priorityColors[0] : i < findings.length ? priorityColors[1] : priorityColors[2];

    doc.setFillColor(...PANEL);
    doc.rect(MARGIN + 6, y, TEXT_W - 6, 18, 'F');

    // Priority badge
    doc.setFillColor(...pColor);
    doc.roundedRect(MARGIN + 10, y + 2, 22, 6, 1, 1, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(priority, MARGIN + 21, y + 6, { align: 'center' });

    // Recommendation text
    doc.setTextColor(...TEXT1);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(rec, TEXT_W - 16);
    doc.text(wrapped, MARGIN + 10, y + 12);

    y += Math.max(18, 12 + wrapped.length * 4.5) + 2;

    // Prevent overflow
    if (y > PAGE_H - 40) return;
  });

  boardFooter(5, 6);

  // ── PAGE 6: APPROVAL & ATTESTATION ──────────────────────────────────────
  doc.addPage();
  darkPage();
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, 3, PAGE_H, 'F');

  doc.setTextColor(...TEXT3);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('CONFIDENTIAL — BOARD DISTRIBUTION ONLY', MARGIN + 6, 16);

  doc.setTextColor(...TEXT1);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Approval & Attestation', MARGIN + 6, 30);
  y = 40;

  // Attestation section
  sectionHeader('AUDIT ATTESTATION');
  const attestItems: [string, string][] = [
    ['Methodology',     `Version ${runData.methodology_version} — benchmark-based transaction cost analysis`],
    ['Scope',           `${summary.transaction_count ?? 0} transactions across ${Object.keys(runData.markup_by_pair).length} pairs`],
    ['Run Hash',        runData.run_hash],
    ['Determinism',     'Analysis is fully reproducible given identical inputs'],
    ['Data Integrity',  'SHA-256 hash binding ensures tamper evidence'],
  ];
  attestItems.forEach(([k, v]) => {
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

  // Approval blocks
  y += 10;
  sectionHeader('APPROVAL SIGNATURES');

  doc.setFillColor(...PANEL);
  doc.rect(MARGIN, y, TEXT_W, 50, 'F');

  const approvalRoles = [
    { role: 'Prepared By', title: 'Audit Analyst' },
    { role: 'Reviewed By', title: 'Head of Treasury' },
    { role: 'Approved By', title: 'CFO / Board Representative' },
  ];

  approvalRoles.forEach((field, i) => {
    const xOff = MARGIN + 4 + i * 60;
    doc.setTextColor(...TEXT3);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(field.role.toUpperCase(), xOff, y + 7);
    doc.setTextColor(...CYAN);
    doc.setFontSize(5);
    doc.text(field.title, xOff, y + 12);

    // Name line
    doc.setDrawColor(42, 53, 69);
    doc.setLineWidth(0.3);
    doc.line(xOff, y + 26, xOff + 52, y + 26);
    doc.setTextColor(...TEXT3);
    doc.setFontSize(5);
    doc.text('Name', xOff, y + 30);

    // Signature line
    doc.line(xOff, y + 40, xOff + 52, y + 40);
    doc.text('Signature / Date', xOff, y + 44);
  });

  y += 58;

  // Disclaimer
  doc.setTextColor(...TEXT3);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  const boardDisclaimer = 'This document is prepared for board-level review only. Distribution beyond the intended recipients is prohibited. The analysis herein is based on automated benchmark comparison and does not constitute financial, legal, or regulatory advice. Management should exercise professional judgment when acting on these findings.';
  const wrappedBoardDisclaimer = doc.splitTextToSize(boardDisclaimer, TEXT_W - 4);
  doc.text(wrappedBoardDisclaimer, MARGIN + 2, y);

  boardFooter(6, 6);

  doc.save(`BoardSummary_${safeId(runData.run_id)}.pdf`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. AUDIT LAB CSV (Item 38 support)
// ═════════════════════════════════════════════════════════════════════════════

export function exportAuditLabCsv(transactions: Transaction[]): void {
  const Papa = require('papaparse');

  const rows = transactions.map(t => ({
    row_index:        t.row_index,
    id:               t.id,
    trade_date:       t.trade_date ?? '',
    currency_sold:    t.currency_sold ?? '',
    currency_bought:  t.currency_bought ?? '',
    amount_sold:      t.amount_sold ?? '',
    amount_bought:    t.amount_bought ?? '',
    effective_rate:   t.effective_rate ?? '',
    counterparty:     t.counterparty ?? '',
    fee_amount:       t.fee_amount ?? '',
    benchmark_rate:   t.benchmark_rate ?? '',
    markup_per_unit:  t.markup_per_unit ?? '',
    markup_cost_usd:  t.markup_cost_usd ?? '',
    markup_direction: t.markup_direction ?? '',
  }));

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `AuditLab_Transactions_${new Date().toISOString().slice(0, 10)}.csv`);
}
