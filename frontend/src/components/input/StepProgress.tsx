"use client";

import type { StepKey } from './StepSection';

interface StepDef {
  key: StepKey;
  label: string;
  status: 'complete' | 'partial' | 'error' | 'pending';
}

interface Props {
  steps: StepDef[];
  activeStep: StepKey;
  onActivate: (s: StepKey) => void;
  lockedSteps: Set<StepKey>;
}

const STEP_NUMBERS: Record<StepKey, string> = {
  exposure: '01',
  hedges: '02',
  market: '03',
  policy: '04',
  authorization: '05',
};

const statusColor: Record<string, string> = {
  complete: 'var(--accent-green)',
  partial: 'var(--accent-amber)',
  error: 'var(--accent-red)',
  pending: 'var(--text-secondary)',
};

export default function StepProgress({ steps, activeStep, onActivate, lockedSteps }: Props) {
  return (
    <div className="bg-[var(--bg-sub)] border-b border-[var(--border-rim)] px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center gap-0 text-[10px] font-mono tracking-wide">
        {steps.map((step, i) => {
          const isActive = step.key === activeStep;
          const isLocked = lockedSteps.has(step.key);
          const color = statusColor[step.status];
          const opacity = step.status === 'pending' ? 0.4 : 1;

          return (
            <div key={step.key} className="flex items-center gap-0">
              {i > 0 && (
                <span className="px-2 text-[var(--text-secondary)] opacity-20 select-none">&mdash;</span>
              )}
              <button
                type="button"
                onClick={() => !isLocked && onActivate(step.key)}
                disabled={isLocked}
                className={`no-scale flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm transition-colors ${
                  isLocked ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  isActive
                    ? 'text-[var(--text-primary)] border-b border-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {step.status === 'complete' ? (
                  <span className="text-xs" style={{ color: statusColor.complete }}>&#10003;</span>
                ) : (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color, opacity }}
                  />
                )}
                <span>{STEP_NUMBERS[step.key]} {step.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
