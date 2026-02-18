"use client";

/**
 * ExportBar.tsx
 *
 * Enterprise-grade export toolbar for the Committee Pack.
 * All exports are 100% client-side (no backend required).
 *
 * Design: monochrome, SVG icons, enterprise-restrained palette.
 * No accent colours — consistent with dark-panel theme.
 */

import { useState } from 'react';
import type { CalculateResponse } from '../../api/types';
import {
  exportCommitteePackPdf,
  exportHedgePlanExcel,
  exportAuditJson,
  exportExecutiveBriefPdf,
} from '../../utils/clientExport';

interface Props {
  result: CalculateResponse;
  baseCcy: string;
}

// ── Monochrome SVG icons ──────────────────────────────────────────────────────

function IconPdf() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  );
}

function IconXls() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="M8 13l2 3 2-3M8 17h4"/>
    </svg>
  );
}

function IconAudit() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  );
}

function IconBrief() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="7" y1="8" x2="17" y2="8"/>
      <line x1="7" y1="12" x2="17" y2="12"/>
      <line x1="7" y1="16" x2="13" y2="16"/>
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25"/>
      <path d="M21 12a9 9 0 00-9-9"/>
    </svg>
  );
}

// ── Individual export button ──────────────────────────────────────────────────

interface ExportBtnProps {
  icon:    React.ReactNode;
  label:   string;
  title:   string;
  onClick: () => Promise<void> | void;
}

function ExportBtn({ icon, label, title, onClick }: ExportBtnProps) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await onClick();
      setDone(true);
      setTimeout(() => setDone(false), 2200);
    } catch (e) {
      console.error('Export failed:', e);
      setError(true);
      setTimeout(() => setError(false), 3000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      title={title}
      disabled={busy}
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono',
        'border transition-all duration-150 select-none',
        error
          ? 'border-[var(--accent-red)]/40 text-[var(--accent-red)] bg-[var(--accent-red)]/5'
          : done
          ? 'border-[var(--accent-green)]/40 text-[var(--accent-green)] bg-[var(--accent-green)]/5'
          : 'border-[var(--border-rim)] text-[var(--text-secondary)] bg-transparent hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)]',
        busy ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span className="shrink-0">
        {busy ? <IconSpinner /> : icon}
      </span>
      <span>{error ? 'Failed' : done ? 'Saved' : label}</span>
    </button>
  );
}

// ── ExportBar ─────────────────────────────────────────────────────────────────

export default function ExportBar({ result, baseCcy }: Props) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest mr-0.5 hidden sm:inline">
        Export
      </span>

      <ExportBtn
        icon={<IconPdf />}
        label="PDF"
        title="Download full Committee Pack PDF (Cover · Summary · Coverage · Scenario · Compliance · Audit)"
        onClick={() => exportCommitteePackPdf(result, baseCcy)}
      />

      <ExportBtn
        icon={<IconXls />}
        label="Excel"
        title="Download hedge plan as Excel-compatible CSV (BOM-prefixed, auto-detected by Excel)"
        onClick={() => exportHedgePlanExcel(result)}
      />

      <ExportBtn
        icon={<IconAudit />}
        label="Audit"
        title="Download audit attestation bundle (JSON: run envelope + all SHA-256 hashes)"
        onClick={() => exportAuditJson(result)}
      />

      <ExportBtn
        icon={<IconBrief />}
        label="Brief"
        title="Download executive briefing PDF — board-distribution format with narrative + approval signature block"
        onClick={() => exportExecutiveBriefPdf(result, baseCcy)}
      />
    </div>
  );
}
