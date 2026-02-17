"use client";

import { useMemo } from 'react';
import { V_CODE_CATEGORIES, CATEGORY_ORDER, TOTAL_VALIDATION_CHECKS, CATEGORY_COLORS } from '../../constants/validationCategories';

interface ValidationItem {
  code: string;
  field: string;
  message: string;
  severity: 'CRITICAL' | 'WARNING';
}

interface Props {
  errors: ValidationItem[];
  warnings: ValidationItem[];
  tradeCount: number;
  hedgeCount: number;
  fixtureId?: string | null;
}

function classifyScore(score: number): { label: string; color: string } {
  if (score === 100) return { label: 'AUTHORIZED', color: 'var(--accent-green)' };
  if (score >= 80) return { label: 'MINOR DEVIATIONS', color: 'var(--accent-amber)' };
  return { label: 'BREACH', color: 'var(--accent-red)' };
}

export default function ValidationSummary({ errors, warnings, tradeCount, hedgeCount, fixtureId }: Props) {
  const allItems = useMemo(() => [...errors, ...warnings], [errors, warnings]);

  const grouped = useMemo(() => {
    const map: Record<string, ValidationItem[]> = {};
    for (const cat of CATEGORY_ORDER) map[cat] = [];

    for (const item of allItems) {
      const category = V_CODE_CATEGORIES[item.code] || 'Data Completeness';
      if (!map[category]) map[category] = [];
      map[category].push(item);
    }

    return CATEGORY_ORDER
      .filter(cat => map[cat] && map[cat].length > 0)
      .map(cat => ({ category: cat, items: map[cat] }));
  }, [allItems]);

  const errorCount = errors.length;
  const score = Math.round(100 * (1 - errorCount / TOTAL_VALIDATION_CHECKS));
  const clampedScore = Math.max(0, Math.min(100, score));
  const { label: classification, color: classColor } = classifyScore(clampedScore);
  const passed = TOTAL_VALIDATION_CHECKS - errorCount;

  return (
    <div className="bg-white border border-[var(--border-rim)] rounded-sm p-6 space-y-4">
      {/* Integrity Score Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-[var(--text-secondary)] tracking-wider uppercase">
            Data Integrity Score
          </span>
          <span className="text-2xl font-mono font-bold" style={{ color: classColor }}>
            {clampedScore}/100
          </span>
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded border"
            style={{
              color: classColor,
              borderColor: classColor,
              backgroundColor: `color-mix(in srgb, ${classColor} 10%, transparent)`,
            }}
          >
            {classification}
          </span>
        </div>
        <span className="text-[11px] font-mono text-[var(--text-secondary)]">
          {passed}/{TOTAL_VALIDATION_CHECKS} checks passed
        </span>
      </div>

      {/* Compliant State */}
      {errors.length === 0 && warnings.length === 0 && (
        <div className="flex items-center gap-3 py-2 border border-[var(--accent-green)]/20 rounded-sm bg-[var(--accent-green)]/5 px-3">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-green)]" />
          <span className="text-xs font-mono text-[var(--accent-green)]">
            ALL {TOTAL_VALIDATION_CHECKS} CHECKS PASSED — AUTHORIZED
          </span>
          {fixtureId && (
            <span className="text-[10px] font-mono text-[var(--accent-amber)] ml-auto">
              FIXTURE: {fixtureId}
            </span>
          )}
        </div>
      )}

      {/* Category-Grouped Items */}
      {grouped.map(({ category, items }) => {
        const catColor = CATEGORY_COLORS[category] || 'var(--text-secondary)';
        const criticalCount = items.filter(i => i.severity === 'CRITICAL').length;
        const warningCount = items.filter(i => i.severity === 'WARNING').length;

        return (
          <div key={category} className="flex gap-0">
            {/* Left accent bar */}
            <div
              className="w-1 rounded-sm flex-shrink-0 mr-3"
              style={{ backgroundColor: catColor }}
            />

            <div className="flex-1 space-y-1.5">
              {/* Category heading */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--text-primary)]">{category}</span>
                {criticalCount > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-red)]/10 text-[var(--accent-red)]">
                    {criticalCount} exception{criticalCount !== 1 ? 's' : ''}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]">
                    {warningCount} advisory
                  </span>
                )}
              </div>

              {/* Items */}
              {items.map((item, i) => (
                <div key={`${item.code}-${i}`} className="flex items-start gap-2 text-sm">
                  <span
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0"
                    style={{
                      color: item.severity === 'CRITICAL' ? 'var(--accent-red)' : 'var(--accent-amber)',
                      backgroundColor: item.severity === 'CRITICAL'
                        ? 'rgba(239,68,68,0.1)'
                        : 'rgba(245,158,11,0.1)',
                    }}
                  >
                    {item.code}
                  </span>
                  <span
                    className="text-[12px]"
                    style={{
                      color: item.severity === 'CRITICAL'
                        ? 'rgba(239,68,68,0.8)'
                        : 'rgba(245,158,11,0.8)',
                    }}
                  >
                    {item.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Readiness Footer */}
      <div className="text-[10px] font-mono text-[var(--text-secondary)] flex items-center gap-4 pt-1 border-t border-[var(--border-soft)]">
        <span>TRADES: {tradeCount > 0 ? '\u2713' : '\u2717'} {tradeCount}</span>
        <span>HEDGES: {hedgeCount}</span>
      </div>
    </div>
  );
}
