"use client";

import type { ReactNode } from 'react';

export type StepKey = 'exposure' | 'hedges' | 'market' | 'policy' | 'authorization';

interface Badge {
  label: string;
  variant: string;
}

interface Props {
  stepNumber: string;
  title: string;
  stepKey: StepKey;
  activeStep: StepKey;
  onActivate: (s: StepKey) => void;
  locked: boolean;
  summary?: ReactNode;
  actions?: ReactNode;
  badge?: Badge;
  children: ReactNode;
}

const badgeStyles: Record<string, string> = {
  info: 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/20',
  warning: 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/20',
  success: 'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20',
  neutral: 'bg-[var(--bg-sub)] text-[var(--text-secondary)] border-[var(--border-rim)]',
};

export default function StepSection({
  stepNumber,
  title,
  stepKey,
  activeStep,
  onActivate,
  locked,
  summary,
  actions,
  badge,
  children,
}: Props) {
  const isActive = stepKey === activeStep;
  const isAuthorization = stepKey === 'authorization';
  const effectiveLocked = locked && !isAuthorization;
  const canClick = !effectiveLocked;

  return (
    <div className={effectiveLocked ? 'step-locked' : ''}>
      {/* Header */}
      <button
        type="button"
        onClick={canClick ? () => onActivate(stepKey) : undefined}
        className={`no-scale w-full text-left px-6 py-4 flex items-center gap-3 step-header ${
          isActive ? 'bg-[var(--bg-panel)]' : 'bg-[var(--bg-sub)]'
        } ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className="section-number">{stepNumber}</span>
        <span className="section-title">{title}</span>
        {badge && (
          <span
            className={`inline-block border rounded-sm px-2 py-0.5 text-[10px] font-mono font-medium ${
              badgeStyles[badge.variant] ?? badgeStyles.neutral
            }`}
          >
            {badge.label}
          </span>
        )}
        <span className="ml-auto flex-shrink-0">
          <svg
            className={`step-chevron w-3 h-3 text-[var(--text-secondary)] ${isActive ? 'rotate-90' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 2l4 4-4 4" />
          </svg>
        </span>
      </button>

      {/* Summary — shown when collapsed and not locked */}
      {!isActive && !effectiveLocked && summary && (
        <div className="px-6 pb-3 bg-[var(--bg-sub)]">{summary}</div>
      )}

      {/* Body — shown when active */}
      {isActive && (
        <div className="px-6 py-4 border-t border-[var(--border-soft)] bg-[var(--bg-panel)]">
          {actions && <div className="flex items-center gap-2 mb-2">{actions}</div>}
          {children}
        </div>
      )}
    </div>
  );
}
