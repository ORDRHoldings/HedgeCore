"use client";

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { PolicyConfig } from '../../api/types';
import type { PolicyPreset } from '../../constants/policyPresets';
import PolicyPresetSelector from './PolicyPresetSelector';
import PolicyAIBuilder from './PolicyAIBuilder';

interface Props {
  policy: PolicyConfig;
  onChange: (p: PolicyConfig) => void;
  activePresetId: string | null;
  onSelectPreset: (preset: PolicyPreset) => void;
  onCustom: () => void;
  token?: string;  // optional — needed for "Save as My Policy" in AI builder
}

export default function PolicyForm({
  policy,
  onChange,
  activePresetId,
  onSelectPreset,
  onCustom,
  token,
}: Props) {
  const isReadOnly = activePresetId !== null && activePresetId !== 'custom';
  const [showAIBuilder, setShowAIBuilder] = useState(false);

  const inputCls = `px-3 py-2 border rounded-sm text-sm w-full bg-white text-[var(--text-primary)] border-[var(--border-rim)] focus:ring-2 focus:ring-[var(--accent-cyan)]/40 focus:border-[var(--accent-cyan)]/60 ${
    isReadOnly ? 'bg-[var(--bg-sub)] text-[var(--text-secondary)] cursor-not-allowed' : ''
  }`;

  function handleAIApply(config: PolicyConfig) {
    // Set to custom mode so fields become editable, then apply config
    onCustom();
    onChange(config);
    setShowAIBuilder(false);
  }

  return (
    <div className="space-y-5">
      {/* Preset Selector header with AI Builder toggle */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <PolicyPresetSelector
              activePresetId={activePresetId}
              onSelectPreset={onSelectPreset}
              onCustom={onCustom}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowAIBuilder((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'var(--font-terminal-mono, monospace)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: showAIBuilder ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              background: showAIBuilder ? 'color-mix(in srgb, var(--accent-cyan) 12%, transparent)' : 'transparent',
              border: showAIBuilder
                ? '1px solid var(--accent-cyan)'
                : '1px solid var(--border-soft)',
              borderRadius: 3,
              padding: '5px 10px',
              cursor: 'pointer',
              marginLeft: 10,
              flexShrink: 0,
              transition: 'all 120ms',
            }}
            title="Use AI to build a custom policy for your company"
          >
            <Sparkles size={11} />
            Build with AI
          </button>
        </div>

        {/* AI Builder panel — collapsible */}
        {showAIBuilder && (
          <div style={{ marginTop: 8 }}>
            <PolicyAIBuilder
              onApply={handleAIApply}
              onClose={() => setShowAIBuilder(false)}
              token={token}
            />
          </div>
        )}
      </div>

      {/* Policy Fields */}
      <div className="space-y-4">
        {isReadOnly && (
          <p className="text-xs text-[var(--text-secondary)] italic opacity-60">
            Fields are read-only while a preset is active. Click &quot;Customize&quot; to edit.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)]">Confirmed Hedge Ratio</label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              className={inputCls}
              value={policy.hedge_ratios.confirmed}
              onChange={(e) =>
                onChange({
                  ...policy,
                  hedge_ratios: { ...policy.hedge_ratios, confirmed: +e.target.value },
                })
              }
              readOnly={isReadOnly}
              tabIndex={isReadOnly ? -1 : undefined}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)]">Forecast Hedge Ratio</label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              className={inputCls}
              value={policy.hedge_ratios.forecast}
              onChange={(e) =>
                onChange({
                  ...policy,
                  hedge_ratios: { ...policy.hedge_ratios, forecast: +e.target.value },
                })
              }
              readOnly={isReadOnly}
              tabIndex={isReadOnly ? -1 : undefined}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)]">Spread (bps)</label>
            <input
              type="number"
              step="0.5"
              className={inputCls}
              value={policy.cost_assumptions.spread_bps}
              onChange={(e) =>
                onChange({ ...policy, cost_assumptions: { spread_bps: +e.target.value } })
              }
              readOnly={isReadOnly}
              tabIndex={isReadOnly ? -1 : undefined}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                Min Trade Size (USD)
              </label>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => onChange({ ...policy, min_trade_size_usd: 0 })}
                  className="text-xs px-2 py-0.5 border rounded-sm text-[var(--accent-cyan)] border-[var(--accent-cyan)] opacity-70 hover:opacity-100 transition-opacity"
                  style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.5625rem', letterSpacing: '0.04em' }}
                  title="Set to 0 — all buckets will execute regardless of notional size"
                >
                  NO MIN
                </button>
              )}
            </div>
            <input
              type="number"
              min={0}
              step={1000}
              className={inputCls}
              value={policy.min_trade_size_usd}
              onChange={(e) => onChange({ ...policy, min_trade_size_usd: Math.max(0, +e.target.value || 0) })}
              readOnly={isReadOnly}
              tabIndex={isReadOnly ? -1 : undefined}
            />
            <p className="mt-1 text-xs text-[var(--text-tertiary)]" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.5rem' }}>
              {policy.min_trade_size_usd === 0
                ? '✓ No minimum — all buckets execute'
                : `Buckets < $${policy.min_trade_size_usd.toLocaleString()} USD will be suppressed`}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)]">Product</label>
            <select
              className={inputCls}
              value={policy.execution_product}
              onChange={(e) =>
                onChange({ ...policy, execution_product: e.target.value as 'NDF' | 'FWD' })
              }
              disabled={isReadOnly}
              tabIndex={isReadOnly ? -1 : undefined}
            >
              <option>NDF</option>
              <option>FWD</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
