"use client";

/**
 * PolicyCompareModal.tsx — Side-by-side policy comparison view.
 *
 * Shows 2–4 selected policies in columns with diff highlighting.
 * Cells where values differ across policies get amber tint background.
 * Uses only design tokens — no colored icons.
 */

import React, { useState } from "react";
import type { PolicyPreset } from "@/constants/policyPresets";
import { computeEffectivenessScore } from "@/utils/policyEffectivenessScore";

const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub,var(--bg-panel))",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan,#22d3ee)",
  amber:    "var(--accent-amber,#fbbf24)",
  pass:     "var(--status-pass,#4ade80)",
  fail:     "var(--accent-red,#f87171)",
} as const;

interface CompareRow {
  label: string;
  getValue: (p: PolicyPreset) => string;
  isNumeric?: boolean;
  section?: string;
}

const COMPARE_ROWS: CompareRow[] = [
  { label: "CATEGORY",        getValue: p => p.category, section: "IDENTITY" },
  { label: "RISK POSTURE",    getValue: p => p.riskPosture },
  { label: "CONFIRMED %",     getValue: p => `${Math.round(p.policy.hedge_ratios.confirmed * 100)}%`, isNumeric: true, section: "EFFECT SURFACE" },
  { label: "FORECAST %",      getValue: p => `${Math.round(p.policy.hedge_ratios.forecast  * 100)}%`, isNumeric: true },
  { label: "SPREAD (bps)",    getValue: p => `${p.policy.cost_assumptions.spread_bps} bps`, isNumeric: true },
  { label: "PRODUCT",         getValue: p => p.policy.execution_product },
  { label: "MIN TRADE (USD)", getValue: p => p.policy.min_trade_size_usd === 0 ? "None" : `$${p.policy.min_trade_size_usd.toLocaleString()}`, isNumeric: true },
  { label: "GOVERNANCE",      getValue: p => p.governance_tier ?? 'STANDARD', section: "GOVERNANCE" },
  { label: "MATURITY",        getValue: p => p.maturity_profile ?? 'MEDIUM' },
  { label: "ACCOUNTING",      getValue: p => p.accounting_mode ?? 'NONE' },
  { label: "EVIDENCE",        getValue: p => p.evidence_grade ?? 'BASIC' },
  { label: "BUCKET MODE",     getValue: p => p.policy.bucket_mode, section: "STRUCTURE" },
  { label: "FORMULA",         getValue: p => p.formula ?? '\u2014' },
  { label: "EFF. SCORE",      getValue: p => {
    const eff = computeEffectivenessScore(p.policy, p.riskPosture);
    return `${eff.score} / ${eff.badge}`;
  }, section: "ASSESSMENT" },
  { label: "TARGET",          getValue: p => p.targetAudience ?? '\u2014' },
];

interface PolicyCompareModalProps {
  presets:  PolicyPreset[];
  onClose:  () => void;
}

export default function PolicyCompareModal({ presets, onClose }: PolicyCompareModalProps) {
  const [exposureUsd, setExposureUsd] = useState<number>(0);
  const [exposureType, setExposureType] = useState<'confirmed' | 'forecast'>('confirmed');

  const IMPACT_ROWS: CompareRow[] = exposureUsd > 0 ? [
    {
      label: "HEDGE TARGET",
      section: "IMPACT ANALYSIS",
      getValue: (p) => {
        const ratio = exposureType === 'confirmed'
          ? p.policy.hedge_ratios.confirmed
          : p.policy.hedge_ratios.forecast;
        const target = exposureUsd * ratio;
        return `$${Math.round(target).toLocaleString()}`;
      },
      isNumeric: true,
    },
    {
      label: "SUPPRESSION",
      getValue: (p) => {
        const ratio = exposureType === 'confirmed'
          ? p.policy.hedge_ratios.confirmed
          : p.policy.hedge_ratios.forecast;
        const target = exposureUsd * ratio;
        return target > 0 && target < p.policy.min_trade_size_usd
          ? "SUPPRESSED"
          : target === 0 ? "NO HEDGE" : "ACTIVE";
      },
    },
    {
      label: "EST. FRICTION",
      getValue: (p) => {
        const ratio = exposureType === 'confirmed'
          ? p.policy.hedge_ratios.confirmed
          : p.policy.hedge_ratios.forecast;
        const target = exposureUsd * ratio;
        if (target > 0 && target < p.policy.min_trade_size_usd) return "N/A (suppressed)";
        const friction = target * p.policy.cost_assumptions.spread_bps / 10000;
        return friction > 0 ? `$${Math.round(friction).toLocaleString()}` : "$0";
      },
      isNumeric: true,
    },
    {
      label: "NET NOTIONAL",
      getValue: (p) => {
        const ratio = exposureType === 'confirmed'
          ? p.policy.hedge_ratios.confirmed
          : p.policy.hedge_ratios.forecast;
        const target = exposureUsd * ratio;
        if (target > 0 && target < p.policy.min_trade_size_usd) return "$0 (suppressed)";
        const friction = target * p.policy.cost_assumptions.spread_bps / 10000;
        const net = target - friction;
        return net > 0 ? `$${Math.round(net).toLocaleString()}` : "$0";
      },
      isNumeric: true,
    },
  ] : [];

  const allRows = [...COMPARE_ROWS, ...IMPACT_ROWS];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: S.bgPanel, border: `1px solid ${S.rim}`,
        width: '100%', maxWidth: 1100, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{
          padding: '12px 20px', borderBottom: `1px solid ${S.rim}`,
          background: S.bgDeep, display: 'flex', alignItems: 'center', gap: 12,
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.cyan, letterSpacing: '0.1em', marginBottom: 2 }}>
              POLICY ENGINE · COMPARE
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: '0.875rem', fontWeight: 600, color: S.primary }}>
              Policy Comparison — {presets.length} policies selected
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ fontFamily: S.fontMono, fontSize: '0.875rem', background: 'none', border: 'none', color: S.tertiary, cursor: 'pointer', padding: 4 }}
          >
            ×
          </button>
        </div>

        {/* Impact analysis input strip */}
        <div style={{
          padding: '8px 14px', background: S.bgSub,
          borderBottom: `1px solid ${S.rim}`,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: '0.75rem', color: S.tertiary,
            letterSpacing: '0.1em', userSelect: 'none',
          }}>
            IMPACT ANALYSIS — OPTIONAL
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.secondary }}>Exposure:</span>
            <input
              type="number"
              min={0}
              step={10000}
              value={exposureUsd || ''}
              placeholder="0"
              onChange={e => setExposureUsd(Math.max(0, Number(e.target.value) || 0))}
              style={{
                fontFamily: S.fontMono, fontSize: '0.75rem', color: S.primary,
                background: S.bgDeep, border: `1px solid ${S.rim}`,
                padding: '4px 8px', width: 130, outline: 'none',
              }}
            />
            <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.tertiary }}>USD</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.secondary }}>Type:</span>
            <select
              value={exposureType}
              onChange={e => setExposureType(e.target.value as 'confirmed' | 'forecast')}
              style={{
                fontFamily: S.fontMono, fontSize: '0.75rem', color: S.primary,
                background: S.bgDeep, border: `1px solid ${S.rim}`,
                padding: '4px 8px', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="confirmed">Confirmed</option>
              <option value="forecast">Forecast</option>
            </select>
          </label>
        </div>

        {/* Comparison table */}
        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            {/* Column headers */}
            <thead>
              <tr style={{ background: S.bgSub }}>
                <th scope="col" style={{
                  width: 140, padding: '10px 14px', textAlign: 'left',
                  fontFamily: S.fontMono, fontSize: '0.75rem', color: S.tertiary,
                  letterSpacing: '0.08em', borderBottom: `1px solid ${S.rim}`,
                  borderRight: `1px solid ${S.soft}`,
                }}>FIELD</th>
                {presets.map(p => (
                  <th scope="col" key={p.id} style={{
                    padding: '10px 14px', textAlign: 'left',
                    borderBottom: `1px solid ${S.rim}`,
                    borderRight: `1px solid ${S.soft}`,
                  }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.cyan, letterSpacing: '0.06em' }}>
                      {p.shortName}
                    </div>
                    <div style={{ fontFamily: S.fontUI, fontSize: '0.75rem', color: S.primary, fontWeight: 600, marginTop: 2 }}>
                      {p.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, ri) => {
                const values = presets.map(p => row.getValue(p));
                const allSame = values.every(v => v === values[0]);
                const isImpactSection = row.section === 'IMPACT ANALYSIS';
                const sectionColor = isImpactSection ? S.amber
                  : row.section === 'EFFECT SURFACE' ? S.cyan
                  : S.tertiary;
                const sectionBorderLeft = (isImpactSection || row.section === 'EFFECT SURFACE')
                  ? `3px solid ${sectionColor}` : undefined;
                return (
                  <React.Fragment key={row.label}>
                    {row.section && (
                      <tr>
                        <td colSpan={presets.length + 1} style={{
                          padding: '6px 14px 3px',
                          fontFamily: S.fontMono, fontSize: '0.75rem',
                          color: sectionColor,
                          letterSpacing: '0.1em', fontWeight: 700,
                          background: S.bgDeep,
                          borderBottom: `1px solid ${S.soft}`,
                          borderLeft: sectionBorderLeft,
                        }}>
                          {row.section}
                        </td>
                      </tr>
                    )}
                    <tr style={{ background: ri % 2 === 0 ? S.bgPanel : S.bgSub }}>
                      <td style={{
                        padding: '8px 14px',
                        fontFamily: S.fontMono, fontSize: '0.75rem', color: S.tertiary,
                        letterSpacing: '0.06em',
                        borderBottom: `1px solid ${S.soft}`,
                        borderRight: `1px solid ${S.soft}`,
                      }}>
                        {row.label}
                      </td>
                      {values.map((val, vi) => (
                        <td key={vi} style={{
                          padding: '8px 14px',
                          background: !allSame ? `color-mix(in srgb, ${S.amber} 8%, ${ri % 2 === 0 ? S.bgPanel : S.bgSub})` : undefined,
                          fontFamily: S.fontMono, fontSize: '0.75rem', color: S.primary,
                          borderBottom: `1px solid ${S.soft}`,
                          borderRight: `1px solid ${S.soft}`,
                          fontWeight: !allSame ? 700 : 400,
                        }}>
                          {val}
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })}
              {exposureUsd > 0 && (
                <tr>
                  <td colSpan={presets.length + 1} style={{
                    padding: '6px 14px',
                    fontFamily: S.fontMono, fontSize: '0.75rem', color: S.tertiary,
                    letterSpacing: '0.04em', fontStyle: 'italic',
                    background: S.bgDeep,
                    borderTop: `1px solid ${S.soft}`,
                  }}>
                    Impact computed using live kernel logic: ratio x exposure - min_trade_filter - spread_bps friction. No market data or scenario stress applied.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px', borderTop: `1px solid ${S.rim}`,
          background: S.bgSub, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.amber, letterSpacing: '0.06em' }}>
            &#x25CF; HIGHLIGHTED CELLS = VALUES DIFFER ACROSS SELECTED POLICIES
          </span>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', fontFamily: S.fontMono, fontSize: '0.75rem',
              letterSpacing: '0.08em', padding: '5px 16px',
              border: `1px solid ${S.rim}`, color: S.tertiary,
              background: 'transparent', cursor: 'pointer',
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
