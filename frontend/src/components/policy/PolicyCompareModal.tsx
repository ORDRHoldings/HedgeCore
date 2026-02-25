"use client";

/**
 * PolicyCompareModal.tsx — Side-by-side policy comparison view.
 *
 * Shows 2–4 selected policies in columns with diff highlighting.
 * Cells where values differ across policies get amber tint background.
 * Uses only design tokens — no colored icons.
 */

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
}

const COMPARE_ROWS: CompareRow[] = [
  { label: "CATEGORY",        getValue: p => p.category },
  { label: "RISK POSTURE",    getValue: p => p.riskPosture },
  { label: "CONFIRMED %",     getValue: p => `${Math.round(p.policy.hedge_ratios.confirmed * 100)}%`, isNumeric: true },
  { label: "FORECAST %",      getValue: p => `${Math.round(p.policy.hedge_ratios.forecast  * 100)}%`, isNumeric: true },
  { label: "SPREAD (bps)",    getValue: p => `${p.policy.cost_assumptions.spread_bps} bps`, isNumeric: true },
  { label: "PRODUCT",         getValue: p => p.policy.execution_product },
  { label: "MIN TRADE (USD)", getValue: p => p.policy.min_trade_size_usd === 0 ? "None" : `$${p.policy.min_trade_size_usd.toLocaleString()}`, isNumeric: true },
  { label: "SCORE",           getValue: p => {
    const eff = computeEffectivenessScore(p.policy, p.riskPosture);
    return `${eff.score} / ${eff.badge}`;
  }},
];

interface PolicyCompareModalProps {
  presets:  PolicyPreset[];
  onClose:  () => void;
}

export default function PolicyCompareModal({ presets, onClose }: PolicyCompareModalProps) {
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
            <div style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.cyan, letterSpacing: '0.1em', marginBottom: 2 }}>
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

        {/* Comparison table */}
        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            {/* Column headers */}
            <thead>
              <tr style={{ background: S.bgSub }}>
                <th style={{
                  width: 140, padding: '10px 14px', textAlign: 'left',
                  fontFamily: S.fontMono, fontSize: '0.5rem', color: S.tertiary,
                  letterSpacing: '0.08em', borderBottom: `1px solid ${S.rim}`,
                  borderRight: `1px solid ${S.soft}`,
                }}>FIELD</th>
                {presets.map(p => (
                  <th key={p.id} style={{
                    padding: '10px 14px', textAlign: 'left',
                    borderBottom: `1px solid ${S.rim}`,
                    borderRight: `1px solid ${S.soft}`,
                  }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.cyan, letterSpacing: '0.06em' }}>
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
              {COMPARE_ROWS.map((row, ri) => {
                const values = presets.map(p => row.getValue(p));
                const allSame = values.every(v => v === values[0]);
                return (
                  <tr key={row.label} style={{ background: ri % 2 === 0 ? S.bgPanel : S.bgSub }}>
                    <td style={{
                      padding: '8px 14px',
                      fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.tertiary,
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
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px', borderTop: `1px solid ${S.rim}`,
          background: S.bgSub, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.amber, letterSpacing: '0.06em' }}>
            &#x25CF; HIGHLIGHTED CELLS = VALUES DIFFER ACROSS SELECTED POLICIES
          </span>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', fontFamily: S.fontMono, fontSize: '0.6875rem',
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
