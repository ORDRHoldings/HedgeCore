"use client";

import { POLICY_PRESETS } from '../../constants/policyPresets';
import type { PolicyPreset } from '../../constants/policyPresets';

interface Props {
  activePresetId: string | null;
  onSelectPreset: (preset: PolicyPreset) => void;
  onCustom: () => void;
}

const riskPostureColors: Record<string, string> = {
  CONSERVATIVE: 'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20',
  MODERATE: 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/20',
  AGGRESSIVE: 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/20',
};

export default function PolicyPresetSelector({
  activePresetId,
  onSelectPreset,
  onCustom,
}: Props) {
  const isCustom = activePresetId === 'custom';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--text-secondary)]">Policy Preset</p>
        {activePresetId && activePresetId !== 'custom' && (
          <button
            onClick={onCustom}
            className="text-xs text-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]/80 font-medium"
          >
            Customize
          </button>
        )}
      </div>

      {/* Preset cards — horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {POLICY_PRESETS.map((preset) => {
          const isActive = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => onSelectPreset(preset)}
              className={`flex-shrink-0 w-44 text-left rounded-lg border p-3 transition-all ${
                isActive
                  ? 'ring-2 ring-[var(--accent-cyan)] border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/5'
                  : 'border-[var(--border-rim)] hover:border-[var(--border-rim)] bg-[var(--bg-deep)]'
              }`}
            >
              <div className="flex items-start justify-between gap-1 mb-1.5">
                <p className={`text-sm font-semibold leading-tight ${isActive ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-primary)]'}`}>
                  {preset.name}
                </p>
              </div>
              <span
                className={`inline-block border rounded-full px-2 py-0.5 text-[10px] font-medium mb-1.5 ${
                  riskPostureColors[preset.riskPosture] || ''
                }`}
              >
                {preset.riskPosture}
              </span>
              <p className="text-xs text-[var(--text-secondary)] leading-snug line-clamp-2">{preset.description}</p>
              <div className="mt-2 space-y-0.5 text-[11px] text-[var(--text-secondary)] font-mono">
                <div>Confirmed: {(preset.policy.hedge_ratios.confirmed * 100).toFixed(0)}%</div>
                <div>Forecast: {(preset.policy.hedge_ratios.forecast * 100).toFixed(0)}%</div>
                <div>Spread: {preset.policy.cost_assumptions.spread_bps} bps</div>
              </div>
            </button>
          );
        })}

        {/* Custom card */}
        <button
          onClick={onCustom}
          className={`flex-shrink-0 w-44 text-left rounded-lg border p-3 transition-all ${
            isCustom
              ? 'ring-2 ring-[var(--accent-cyan)] border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/5'
              : 'border-[var(--border-rim)] hover:border-[var(--border-rim)] bg-[var(--bg-deep)] border-dashed'
          }`}
        >
          <p className={`text-sm font-semibold mb-1.5 ${isCustom ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-primary)]'}`}>
            Custom Policy
          </p>
          <span className="inline-block border rounded-full px-2 py-0.5 text-[10px] font-medium mb-1.5 bg-[var(--bg-sub)] text-[var(--text-secondary)] border-[var(--border-rim)]">
            CUSTOM
          </span>
          <p className="text-xs text-[var(--text-secondary)] leading-snug">
            Define your own hedge ratios, spread, product, and minimum trade size.
          </p>
        </button>
      </div>
    </div>
  );
}
