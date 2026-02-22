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
  onGenerate?: () => void;
  canGenerate?: boolean;
  generateLoading?: boolean;
}

/** Visible step numbers — the wizard is a 2-step flow (exposure + policy) + Generate action. */
const STEP_NUMBERS: Record<StepKey, string> = {
  exposure:      '01',
  hedges:        '01',   // hidden step – alias to 01
  market:        '01',   // hidden step – alias to 01
  policy:        '02',   // displayed as 02 (before the Generate action at 03)
  authorization: '02',   // hidden step – alias to 02
};

const statusColor: Record<string, string> = {
  complete: 'var(--status-pass)',
  partial:  'var(--accent-amber)',
  error:    'var(--accent-red)',
  pending:  'var(--text-secondary)',
};

const mono = "'IBM Plex Mono', monospace";

export default function StepProgress({
  steps,
  activeStep,
  onActivate,
  lockedSteps,
  onGenerate,
  canGenerate = false,
  generateLoading = false,
}: Props) {
  return (
    <div
      style={{
        background: 'var(--bg-sub)',
        borderBottom: '1px solid var(--border-rim)',
        padding: '0 16px',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          height: 38,
        }}
      >
        {steps.map((step, i) => {
          const isActive  = step.key === activeStep;
          const isLocked  = lockedSteps.has(step.key);
          const color     = statusColor[step.status];
          const opacity   = step.status === 'pending' ? 0.4 : 1;
          const num       = STEP_NUMBERS[step.key];

          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>

              {/* Separator before this step */}
              {i > 0 && (
                <span style={{
                  padding: '0 8px',
                  color: 'var(--text-secondary)',
                  opacity: 0.2,
                  fontFamily: mono,
                  fontSize: '0.625rem',
                  userSelect: 'none',
                }}>—</span>
              )}

              {/* Regular step button */}
              <button
                type="button"
                onClick={() => !isLocked && onActivate(step.key)}
                disabled={isLocked}
                style={{
                  fontFamily: mono,
                  fontSize: '0.75rem',
                  letterSpacing: '0.04em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 6px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--text-primary)' : '2px solid transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  opacity: isLocked ? 0.35 : 1,
                  whiteSpace: 'nowrap',
                  height: 38,
                  transition: 'color 0.1s',
                }}
              >
                {step.status === 'complete' ? (
                  <span style={{ color: statusColor.complete, fontSize: '0.625rem' }}>✓</span>
                ) : (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: color, opacity, flexShrink: 0,
                    display: 'inline-block',
                  }} />
                )}
                {num} {step.label}
              </button>

              {/* Inject Generate node AFTER the policy step (last item in rail) */}
              {step.key === 'policy' && onGenerate !== undefined && (
                <>
                  <span style={{
                    padding: '0 8px',
                    color: 'var(--text-secondary)',
                    opacity: 0.2,
                    fontFamily: mono,
                    fontSize: '0.625rem',
                    userSelect: 'none',
                  }}>—</span>

                  <button
                    type="button"
                    onClick={canGenerate && !generateLoading ? onGenerate : undefined}
                    disabled={!canGenerate || generateLoading}
                    style={{
                      fontFamily: mono,
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      padding: '4px 14px',
                      height: 26,
                      background: canGenerate
                        ? 'var(--accent-cyan)'
                        : 'color-mix(in srgb, var(--accent-cyan) 6%, transparent)',
                      border: `1px solid ${canGenerate ? 'var(--accent-cyan)' : 'var(--accent-cyan)'}`,
                      color: canGenerate ? 'var(--bg-deep)' : 'var(--accent-cyan)',
                      cursor: canGenerate && !generateLoading ? 'pointer' : 'default',
                      opacity: canGenerate ? 1 : 0.45,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      whiteSpace: 'nowrap',
                      transition: 'background 0.1s, opacity 0.1s',
                    }}
                  >
                    {generateLoading ? (
                      <>
                        <svg
                          style={{ width: 10, height: 10, animation: 'spin 1s linear infinite', flexShrink: 0 }}
                          viewBox="0 0 24 24" fill="none"
                        >
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="15 45" />
                        </svg>
                        COMPUTING…
                      </>
                    ) : (
                      '03 ▶ GENERATE HEDGE PLAN'
                    )}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
