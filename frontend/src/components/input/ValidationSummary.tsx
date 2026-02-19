"use client";

import { useMemo, useState } from 'react';
import { V_CODE_CATEGORIES, CATEGORY_ORDER, TOTAL_VALIDATION_CHECKS, CATEGORY_COLORS } from '../../constants/validationCategories';
import { ERROR_KNOWLEDGE_BASE } from '../../constants/errorKnowledgeBase';

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

/* ------------------------------------------------------------------ */
/*  Expandable error item with WHY + HOW TO FIX                        */
/* ------------------------------------------------------------------ */

function ValidationItemRow({ item, uniqueKey }: { item: ValidationItem; uniqueKey: string }) {
  const [expanded, setExpanded] = useState(false);
  const knowledge = ERROR_KNOWLEDGE_BASE[item.code];

  return (
    <div key={uniqueKey}>
      {/* Clickable summary row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 text-sm w-full text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0' }}
      >
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

        <span className="flex-1 flex flex-col gap-0.5">
          {/* Error title from knowledge base */}
          {knowledge && (
            <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
              {knowledge.title}
            </span>
          )}
          <span
            className="text-[11px] font-mono"
            style={{
              color: item.severity === 'CRITICAL'
                ? 'rgba(239,68,68,0.8)'
                : 'rgba(245,158,11,0.8)',
            }}
          >
            {item.message}
          </span>
        </span>

        {/* Auto-resolved badge */}
        {knowledge?.autoResolved && (
          <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
            style={{
              color: 'var(--accent-cyan)',
              backgroundColor: 'color-mix(in srgb, var(--accent-cyan) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-cyan) 20%, transparent)',
            }}
          >
            AUTO
          </span>
        )}

        {/* Expand chevron */}
        <span
          className="text-[9px] flex-shrink-0 mt-1"
          style={{
            color: 'var(--text-secondary)',
            opacity: 0.4,
            transition: 'transform 0.15s',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            display: 'inline-block',
          }}
        >
          ▶
        </span>
      </button>

      {/* Expandable detail panel */}
      {expanded && knowledge && (
        <div className="font-mono ml-8 mb-3 mt-1 space-y-2"
          style={{
            padding: '8px 10px',
            background: 'color-mix(in srgb, var(--bg-sub) 50%, transparent)',
            border: '1px solid var(--border-soft)',
            borderRadius: 3,
          }}
        >
          {/* WHY section */}
          <div>
            <div className="text-[9px] font-bold tracking-widest mb-1"
              style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
            >
              WHY THIS MATTERS
            </div>
            <p className="text-[11px] leading-relaxed m-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              {knowledge.explanation}
            </p>
          </div>

          {/* HOW TO FIX section */}
          <div>
            <div className="text-[9px] font-bold tracking-widest mb-1"
              style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
            >
              HOW TO FIX
            </div>
            <p className="text-[11px] leading-relaxed m-0"
              style={{ color: 'var(--text-primary)' }}
            >
              {knowledge.resolution}
            </p>
          </div>

          {/* Auto-resolved note */}
          {knowledge.autoResolved && (
            <div className="text-[10px] font-mono flex items-center gap-1.5"
              style={{
                color: 'var(--accent-cyan)',
                padding: '4px 8px',
                border: '1px solid color-mix(in srgb, var(--accent-cyan) 20%, transparent)',
                background: 'color-mix(in srgb, var(--accent-cyan) 4%, transparent)',
                borderRadius: 2,
              }}
            >
              <span style={{ fontSize: '0.75rem' }}>⟳</span>
              Auto-resolved — engine fetches market data on Generate.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

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

              {/* Items — now expandable with knowledge base */}
              {items.map((item, i) => (
                <ValidationItemRow
                  key={`${item.code}-${i}`}
                  item={item}
                  uniqueKey={`${item.code}-${i}`}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Footer hint */}
      {allItems.length > 0 && (
        <div className="text-[10px] font-mono text-[var(--text-secondary)] opacity-40 tracking-wider">
          Click any error to see diagnosis and resolution steps.
        </div>
      )}

      {/* Readiness Footer */}
      <div className="text-[10px] font-mono text-[var(--text-secondary)] flex items-center gap-4 pt-1 border-t border-[var(--border-soft)]">
        <span>TRADES: {tradeCount > 0 ? '\u2713' : '\u2717'} {tradeCount}</span>
        <span>HEDGES: {hedgeCount}</span>
      </div>
    </div>
  );
}
