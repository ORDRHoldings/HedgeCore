"use client";

import { useState, useRef, useEffect } from 'react';
import { POLICY_PRESETS, PRESET_CATEGORIES } from '../../constants/policyPresets';
import type { PolicyPreset } from '../../constants/policyPresets';

interface Props {
  activePresetId: string | null;
  onSelectPreset: (preset: PolicyPreset) => void;
  onCustom: () => void;
}

// ─── Design tokens (inline — matches app theme) ───────────────────────────────
const S = {
  bg:          'var(--bg-deep)',
  bgSub:       'var(--bg-sub)',
  bgPanel:     'var(--bg-panel)',
  border:      'var(--border-rim)',
  borderSoft:  'var(--border-soft)',
  text:        'var(--text-primary)',
  textSec:     'var(--text-secondary)',
  textTert:    'var(--text-tertiary)',
  cyan:        'var(--accent-cyan)',
  amber:       'var(--accent-amber)',
  green:       'var(--status-pass)',
  red:         'var(--accent-red)',
  mono:        "'IBM Plex Mono', monospace",
  ui:          "'IBM Plex Sans', sans-serif",
};

const RISK_CONFIG = {
  CONSERVATIVE: { label: 'CONSERVATIVE', color: 'var(--status-pass)',  dot: '●' },
  MODERATE:     { label: 'MODERATE',     color: 'var(--accent-cyan)',  dot: '◆' },
  AGGRESSIVE:   { label: 'AGGRESSIVE',   color: 'var(--accent-amber)', dot: '▲' },
};

// ─── Formula Tooltip ─────────────────────────────────────────────────────────
function FormulaTooltip({
  formula,
  explain,
  rationale,
  visible,
  anchorRef,
}: {
  formula: string;
  explain: string;
  rationale: string;
  visible: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!visible || !anchorRef.current || !tooltipRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const tip    = tooltipRef.current.getBoundingClientRect();
    const vw     = window.innerWidth;

    let left = anchor.left;
    if (left + tip.width > vw - 12) left = vw - tip.width - 12;
    if (left < 8) left = 8;

    setPos({ top: anchor.bottom + 6, left });
  }, [visible, anchorRef]);

  if (!visible) return null;

  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        top:  pos.top,
        left: pos.left,
        zIndex: 9999,
        width: 360,
        background: S.bgPanel,
        border: `1px solid ${S.cyan}`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px color-mix(in srgb, ${S.cyan} 20%, transparent)`,
        fontFamily: S.ui,
        pointerEvents: 'none',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '6px 10px',
        background: `color-mix(in srgb, ${S.cyan} 8%, ${S.bgSub})`,
        borderBottom: `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontFamily: S.mono, fontSize: '0.75rem', color: S.cyan, letterSpacing: '0.1em' }}>
          ƒ HEDGE FORMULA
        </span>
      </div>

      {/* Formula display */}
      <div style={{
        padding: '10px 12px 8px',
        background: `color-mix(in srgb, ${S.cyan} 4%, ${S.bg})`,
        borderBottom: `1px solid ${S.borderSoft}`,
      }}>
        <code style={{
          fontFamily: S.mono,
          fontSize: '0.75rem',
          color: S.cyan,
          letterSpacing: '0.03em',
          display: 'block',
          lineHeight: 1.5,
        }}>
          {formula}
        </code>
      </div>

      {/* Explanation */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${S.borderSoft}` }}>
        <p style={{
          fontFamily: S.mono, fontSize: '0.75rem', color: S.textTert,
          letterSpacing: '0.08em', marginBottom: 4,
        }}>FORMULA BREAKDOWN</p>
        <p style={{ fontSize: '0.75rem', color: S.textSec, lineHeight: 1.6, margin: 0 }}>
          {explain}
        </p>
      </div>

      {/* Rationale */}
      <div style={{ padding: '8px 12px' }}>
        <p style={{
          fontFamily: S.mono, fontSize: '0.75rem', color: S.textTert,
          letterSpacing: '0.08em', marginBottom: 4,
        }}>REAL-WORLD RATIONALE</p>
        <p style={{ fontSize: '0.75rem', color: S.textSec, lineHeight: 1.6, margin: 0 }}>
          {rationale}
        </p>
      </div>
    </div>
  );
}

// ─── Preset Card ─────────────────────────────────────────────────────────────
function PresetCard({
  preset,
  isActive,
  onSelect,
}: {
  preset: PolicyPreset;
  isActive: boolean;
  onSelect: () => void;
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const formulaBtnRef = useRef<HTMLButtonElement>(null);
  const risk = RISK_CONFIG[preset.riskPosture];

  return (
    <div
      style={{
        position: 'relative',
        border: `1px solid ${isActive ? S.cyan : S.border}`,
        background: isActive
          ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})`
          : S.bgPanel,
        cursor: 'pointer',
        transition: 'border-color 0.1s, background 0.1s',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={onSelect}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 2,
          background: S.cyan,
        }} />
      )}

      {/* Card header */}
      <div style={{
        padding: '8px 10px 6px',
        borderBottom: `1px solid ${S.borderSoft}`,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 6,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Short code chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{
              fontFamily: S.mono,
              fontSize: '0.75rem',
              letterSpacing: '0.1em',
              color: isActive ? S.cyan : S.textTert,
              background: isActive
                ? `color-mix(in srgb, ${S.cyan} 12%, transparent)`
                : `color-mix(in srgb, ${S.textTert} 8%, transparent)`,
              padding: '1px 5px',
            }}>
              {preset.shortName}
            </span>
            <span style={{
              fontFamily: S.mono, fontSize: '0.75rem',
              color: risk.color, letterSpacing: '0.06em',
            }}>
              {risk.dot} {risk.label}
            </span>
          </div>
          {/* Name */}
          <p style={{
            fontFamily: S.ui, fontSize: '0.75rem', fontWeight: 600,
            color: isActive ? S.cyan : S.text,
            margin: 0, lineHeight: 1.25,
          }}>
            {preset.name}
          </p>
        </div>

        {/* Formula tooltip trigger */}
        <button
          ref={formulaBtnRef}
          onClick={e => { e.stopPropagation(); setTooltipVisible(v => !v); }}
          onMouseEnter={() => setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
          style={{
            flexShrink: 0,
            width: 20, height: 20,
            border: `1px solid ${tooltipVisible ? S.cyan : S.borderSoft}`,
            background: tooltipVisible
              ? `color-mix(in srgb, ${S.cyan} 12%, transparent)`
              : 'transparent',
            color: tooltipVisible ? S.cyan : S.textTert,
            fontFamily: S.mono, fontSize: '0.75rem',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.1s',
          }}
          title="Show formula"
        >
          ƒ
        </button>

        <FormulaTooltip
          formula={preset.formula}
          explain={preset.formulaExplain}
          rationale={preset.rationale}
          visible={tooltipVisible}
          anchorRef={formulaBtnRef}
        />
      </div>

      {/* Metrics row */}
      <div style={{
        padding: '6px 10px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 0,
        borderBottom: `1px solid ${S.borderSoft}`,
      }}>
        {[
          { label: 'CONF', value: `${(preset.policy.hedge_ratios.confirmed * 100).toFixed(0)}%` },
          { label: 'FCST', value: `${(preset.policy.hedge_ratios.forecast * 100).toFixed(0)}%`  },
          { label: 'BPS',  value: `${preset.policy.cost_assumptions.spread_bps}`                },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: S.mono, fontSize: '0.75rem',
              color: S.textTert, letterSpacing: '0.08em', marginBottom: 1,
            }}>{label}</div>
            <div style={{
              fontFamily: S.mono, fontSize: '0.75rem', fontWeight: 600,
              color: isActive ? S.cyan : S.text,
            }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Product + min trade */}
      <div style={{
        padding: '4px 10px 6px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{
          fontFamily: S.mono, fontSize: '0.75rem',
          color: preset.policy.execution_product === 'NDF' ? S.amber : S.green,
          letterSpacing: '0.08em',
          background: preset.policy.execution_product === 'NDF'
            ? `color-mix(in srgb, ${S.amber} 8%, transparent)`
            : `color-mix(in srgb, ${S.green} 8%, transparent)`,
          padding: '1px 5px',
        }}>
          {preset.policy.execution_product}
        </span>
        <span style={{
          fontFamily: S.mono, fontSize: '0.75rem', color: S.textTert,
        }}>
          min ${(preset.policy.min_trade_size_usd / 1000).toFixed(0)}k
        </span>
      </div>

      {/* Description — clipped */}
      <div style={{
        padding: '0 10px 8px',
        flex: 1,
      }}>
        <p style={{
          fontFamily: S.ui, fontSize: '0.75rem',
          color: S.textTert, lineHeight: 1.55, margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {preset.description}
        </p>
      </div>
    </div>
  );
}

// ─── Custom Card ─────────────────────────────────────────────────────────────
function CustomCard({ isActive, onClick }: { isActive: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px dashed ${isActive ? S.cyan : S.borderSoft}`,
        background: isActive ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})` : S.bgPanel,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 10px',
        gap: 6,
        transition: 'border-color 0.1s, background 0.1s',
        minHeight: 140,
      }}
    >
      <span style={{
        fontFamily: S.mono, fontSize: '1.25rem',
        color: isActive ? S.cyan : S.textTert,
      }}>⊕</span>
      <p style={{
        fontFamily: S.ui, fontSize: '0.75rem', fontWeight: 600,
        color: isActive ? S.cyan : S.text,
        margin: 0,
      }}>Custom Policy</p>
      <p style={{
        fontFamily: S.ui, fontSize: '0.75rem',
        color: S.textTert, lineHeight: 1.55, margin: 0, textAlign: 'center',
      }}>
        Define your own ratios, spread, product, and minimum trade size.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PolicyPresetSelector({
  activePresetId,
  onSelectPreset,
  onCustom,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('CORPORATE');
  const isCustom = activePresetId === 'custom';

  const visiblePresets = POLICY_PRESETS.filter(p => p.category === activeCategory);
  const activePreset   = POLICY_PRESETS.find(p => p.id === activePresetId);

  // If active preset is in a different category, show that category's tab as highlighted
  const activeCategoryId = activePreset?.category ?? activeCategory;

  return (
    <div style={{ fontFamily: S.ui }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: S.mono, fontSize: '0.75rem',
            color: S.textTert, letterSpacing: '0.1em',
          }}>HEDGE POLICY</span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: S.text }}>
            Select Policy Preset
          </span>
          {activePreset && (
            <span style={{
              fontFamily: S.mono, fontSize: '0.75rem', letterSpacing: '0.08em',
              color: S.cyan, background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
              padding: '2px 7px',
            }}>
              ● {activePreset.shortName} ACTIVE
            </span>
          )}
          {isCustom && (
            <span style={{
              fontFamily: S.mono, fontSize: '0.75rem', letterSpacing: '0.08em',
              color: S.amber, background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
              padding: '2px 7px',
            }}>
              ◆ CUSTOM ACTIVE
            </span>
          )}
        </div>
        {activePresetId && !isCustom && (
          <button
            onClick={onCustom}
            style={{
              fontFamily: S.mono, fontSize: '0.75rem', letterSpacing: '0.06em',
              color: S.cyan, background: 'transparent',
              border: `1px solid ${S.borderSoft}`,
              padding: '3px 8px', cursor: 'pointer',
            }}
          >CUSTOMIZE</button>
        )}
      </div>

      {/* ── Category tabs ── */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${S.border}`,
        marginBottom: 0,
      }}>
        {PRESET_CATEGORIES.map(cat => {
          const isTab  = activeCategory === cat.id;
          const hasActive = activeCategoryId === cat.id && activePresetId && !isCustom;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                fontFamily: S.mono, fontSize: '0.75rem', letterSpacing: '0.06em',
                padding: '7px 14px',
                borderBottom: isTab ? `2px solid ${S.cyan}` : '2px solid transparent',
                color: isTab ? S.cyan : hasActive ? S.green : S.textTert,
                background: 'transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'color 0.1s',
              }}
            >
              {hasActive && <span style={{ color: S.green, fontSize: '0.75rem' }}>●</span>}
              {cat.label.toUpperCase()}
            </button>
          );
        })}
        {/* Count chip */}
        <div style={{
          marginLeft: 'auto',
          display: 'flex', alignItems: 'center',
          padding: '0 12px',
          fontFamily: S.mono, fontSize: '0.75rem',
          color: S.textTert,
        }}>
          {POLICY_PRESETS.length} PRESETS + CUSTOM
        </div>
      </div>

      {/* ── Category description ── */}
      <div style={{
        padding: '5px 10px',
        background: S.bgSub,
        borderBottom: `1px solid ${S.border}`,
      }}>
        <span style={{
          fontFamily: S.ui, fontSize: '0.75rem', color: S.textTert,
        }}>
          {PRESET_CATEGORIES.find(c => c.id === activeCategory)?.description}
        </span>
      </div>

      {/* ── Grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 0,
        border: `1px solid ${S.border}`,
        borderTop: 'none',
      }}>
        {visiblePresets.map((preset, idx) => {
          const isLast = idx === visiblePresets.length - 1;
          return (
            <div
              key={preset.id}
              style={{
                borderRight: !isLast ? `1px solid ${S.borderSoft}` : 'none',
              }}
            >
              <PresetCard
                preset={preset}
                isActive={activePresetId === preset.id}
                onSelect={() => onSelectPreset(preset)}
              />
            </div>
          );
        })}
        {/* Fill remaining cells + custom */}
        {activeCategory === 'CORPORATE' && (
          <div style={{ borderLeft: `1px solid ${S.borderSoft}` }}>
            <CustomCard isActive={isCustom} onClick={onCustom} />
          </div>
        )}
        {/* Pad to 5-column grid if needed */}
        {(() => {
          const total = visiblePresets.length + (activeCategory === 'CORPORATE' ? 1 : 0);
          const remainder = total % 5;
          if (remainder === 0) return null;
          const pads = 5 - remainder;
          return Array.from({ length: pads }).map((_, i) => (
            <div
              key={`pad-${i}`}
              style={{
                borderLeft: `1px solid ${S.borderSoft}`,
                background: `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
              }}
            />
          ));
        })()}
      </div>

      {/* ── Custom card for non-Corporate categories ── */}
      {activeCategory !== 'CORPORATE' && (
        <div style={{
          border: `1px solid ${S.border}`,
          borderTop: `1px solid ${S.borderSoft}`,
        }}>
          <div style={{ width: `${100/5}%` }}>
            <CustomCard isActive={isCustom} onClick={onCustom} />
          </div>
        </div>
      )}

      {/* ── Active preset summary bar ── */}
      {activePreset && !isCustom && (
        <div style={{
          marginTop: 0,
          padding: '6px 10px',
          background: `color-mix(in srgb, ${S.cyan} 4%, ${S.bgSub})`,
          border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
          borderTop: 'none',
          display: 'flex', alignItems: 'center', gap: 16,
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: S.mono, fontSize: '0.75rem', color: S.cyan,
            letterSpacing: '0.1em',
          }}>ACTIVE POLICY</span>
          <span style={{ fontFamily: S.ui, fontSize: '0.75rem', fontWeight: 600, color: S.text }}>
            {activePreset.name}
          </span>
          <span style={{
            fontFamily: S.mono, fontSize: '0.75rem', color: S.textSec,
          }}>
            {activePreset.targetAudience}
          </span>
          <span style={{
            fontFamily: S.mono, fontSize: '0.75rem',
            color: RISK_CONFIG[activePreset.riskPosture].color,
            marginLeft: 'auto',
          }}>
            {RISK_CONFIG[activePreset.riskPosture].dot} {activePreset.riskPosture}
          </span>
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{
        padding: '5px 10px',
        display: 'flex', alignItems: 'center', gap: 16,
        borderTop: `1px solid ${S.borderSoft}`,
      }}>
        <span style={{ fontFamily: S.mono, fontSize: '0.75rem', color: S.textTert, letterSpacing: '0.06em' }}>LEGEND</span>
        {Object.entries(RISK_CONFIG).map(([key, cfg]) => (
          <span key={key} style={{ fontFamily: S.mono, fontSize: '0.75rem', color: cfg.color }}>
            {cfg.dot} {cfg.label}
          </span>
        ))}
        <span style={{ fontFamily: S.mono, fontSize: '0.75rem', color: S.textTert, marginLeft: 'auto' }}>
          hover <span style={{ color: S.cyan }}>ƒ</span> on any card for formula breakdown
        </span>
      </div>
    </div>
  );
}
