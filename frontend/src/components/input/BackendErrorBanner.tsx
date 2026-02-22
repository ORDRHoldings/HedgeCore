"use client";

import { useState, useMemo } from 'react';
import type { ValidationErrorDetail } from '../../api/types';
import { V_CODE_CATEGORIES, CATEGORY_ORDER, CATEGORY_COLORS } from '../../constants/validationCategories';
import { ERROR_KNOWLEDGE_BASE } from '../../constants/errorKnowledgeBase';
import type { ResolveActionType } from '../../constants/errorKnowledgeBase';

const mono = "'IBM Plex Mono', monospace";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getActionColor(actionType: ResolveActionType): string {
  switch (actionType) {
    case 'remove_duplicate': return 'var(--accent-amber)';
    default:                 return 'var(--accent-cyan)';
  }
}

function getExpandedDescription(actionType: ResolveActionType): string {
  switch (actionType) {
    case 'auto_resolve':     return 'Auto-resolved \u2014 the engine fetches live market data and re-runs the calculation.';
    case 'edit_trade':       return 'Click to open the trade editor and fix the flagged field.';
    case 'edit_hedge':       return 'Click to open the hedge editor and fix the flagged field.';
    case 'remove_duplicate': return 'Remove the duplicate entry, or edit to assign a unique ID.';
    case 'navigate_policy':  return 'Click to navigate to the Hedge Policy step and adjust the parameter.';
    case 'navigate_market':  return 'Click to re-fetch market data with correct values.';
    case 'add_trades':       return 'Click to navigate to the exposure form and add trade positions.';
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-component: single error row with expandable detail             */
/* ------------------------------------------------------------------ */

function ErrorRow({
  error,
  onResolve,
}: {
  error: ValidationErrorDetail;
  onResolve?: (error: ValidationErrorDetail, actionOverride?: ResolveActionType) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const knowledge = ERROR_KNOWLEDGE_BASE[error.code];
  const severityColor = error.severity === 'CRITICAL' ? 'var(--accent-red)' : 'var(--accent-amber)';
  const actionColor = knowledge?.resolveAction ? getActionColor(knowledge.resolveAction.type) : 'var(--accent-cyan)';

  return (
    <div style={{ borderBottom: '1px solid color-mix(in srgb, var(--border-rim) 40%, transparent)' }}>
      {/* Clickable summary row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: '8px 0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: mono,
        }}
      >
        {/* Code badge */}
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          padding: '1px 5px',
          borderRadius: 2,
          color: severityColor,
          background: `color-mix(in srgb, ${severityColor} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${severityColor} 20%, transparent)`,
          flexShrink: 0,
          marginTop: 1,
          letterSpacing: '0.04em',
        }}>
          {error.code}
        </span>

        {/* Severity label */}
        <span style={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          color: severityColor,
          opacity: 0.8,
          letterSpacing: '0.08em',
          flexShrink: 0,
          marginTop: 3,
        }}>
          {error.severity}
        </span>

        {/* Message column */}
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Error title from knowledge base */}
          {knowledge && (
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontFamily: mono,
            }}>
              {knowledge.title}
            </span>
          )}
          {/* Field + original message */}
          <span style={{
            fontSize: '0.625rem',
            color: 'var(--text-secondary)',
            fontFamily: mono,
          }}>
            <span style={{ color: 'var(--accent-cyan)', opacity: 0.7 }}>{error.field}</span>
            {' \u2014 '}
            {error.message}
          </span>
        </span>

        {/* Action button — shown for ALL errors with a resolveAction */}
        {knowledge?.resolveAction && onResolve && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onResolve(error); }}
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 2,
              color: actionColor,
              background: `color-mix(in srgb, ${actionColor} 6%, transparent)`,
              border: `1px solid color-mix(in srgb, ${actionColor} 20%, transparent)`,
              flexShrink: 0,
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap',
              marginTop: 1,
              cursor: 'pointer',
              fontFamily: mono,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `color-mix(in srgb, ${actionColor} 15%, transparent)`;
              e.currentTarget.style.borderColor = actionColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `color-mix(in srgb, ${actionColor} 6%, transparent)`;
              e.currentTarget.style.borderColor = `color-mix(in srgb, ${actionColor} 20%, transparent)`;
            }}
          >
            {knowledge.resolveAction.buttonIcon ?? ''} {knowledge.resolveAction.buttonLabel}
          </button>
        )}

        {/* Expand chevron */}
        <span style={{
          fontSize: '0.6875rem',
          color: 'var(--text-secondary)',
          opacity: 0.5,
          flexShrink: 0,
          marginTop: 3,
          transition: 'transform 0.15s',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>
          {'\u25B6'}
     </span>
      </button>

      {/* Expandable detail panel */}
      {expanded && knowledge && (
        <div style={{
          padding: '0 0 12px 46px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {/* WHY section */}
          <div>
            <div style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              fontFamily: mono,
              color: 'var(--text-secondary)',
              opacity: 0.5,
              letterSpacing: '0.12em',
              marginBottom: 4,
            }}>
              WHY THIS MATTERS
            </div>
            <p style={{
              fontSize: '0.6875rem',
              fontFamily: mono,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              margin: 0,
            }}>
              {knowledge.explanation}
            </p>
          </div>

          {/* HOW TO FIX section */}
          <div>
            <div style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              fontFamily: mono,
              color: 'var(--text-secondary)',
              opacity: 0.5,
              letterSpacing: '0.12em',
              marginBottom: 4,
            }}>
              HOW TO FIX
            </div>
            <p style={{
              fontSize: '0.6875rem',
              fontFamily: mono,
              color: 'var(--text-primary)',
              lineHeight: 1.7,
              margin: 0,
            }}>
              {knowledge.resolution}
            </p>
          </div>

          {/* Resolution action panel — shown for ALL errors */}
          {knowledge.resolveAction && onResolve && (
            <div style={{
              fontSize: '0.625rem',
              fontFamily: mono,
              color: actionColor,
              padding: '6px 10px',
              border: `1px solid color-mix(in srgb, ${actionColor} 20%, transparent)`,
              background: `color-mix(in srgb, ${actionColor} 4%, transparent)`,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.75rem' }}>
                  {knowledge.resolveAction.type === 'auto_resolve' ? '\u27F3' : '\u2192'}
                </span>
                {getExpandedDescription(knowledge.resolveAction.type)}
              </span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {/* Secondary action (e.g., "EDIT TRADE" for duplicate errors) */}
                {knowledge.resolveAction.secondaryLabel && knowledge.resolveAction.secondaryType && (
                  <button
                    type="button"
                    onClick={() => onResolve(error, knowledge.resolveAction.secondaryType)}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      fontFamily: mono,
                      padding: '3px 10px',
                      borderRadius: 2,
                      color: actionColor,
                      background: 'transparent',
                      border: `1px solid ${actionColor}`,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      letterSpacing: '0.06em',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    {knowledge.resolveAction.secondaryLabel}
                  </button>
                )}
                {/* Primary action */}
                <button
                  type="button"
                  onClick={() => onResolve(error)}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    fontFamily: mono,
                    padding: '3px 10px',
                    borderRadius: 2,
                    color: 'var(--bg-deep)',
                    background: actionColor,
                    border: `1px solid ${actionColor}`,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.06em',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                  {knowledge.resolveAction.buttonLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component: category-grouped error banner                      */
/* ------------------------------------------------------------------ */

interface Props {
  headerMessage: string;
  errors: ValidationErrorDetail[];
  onDismiss?: () => void;
  /** Generic resolve callback — parent handles dispatching to correct action */
  onResolve?: (error: ValidationErrorDetail, actionOverride?: ResolveActionType) => void;
  /** Codes that are auto-resolved (excluded from EXCEPTION count in header) */
  autoResolvedCodes?: Set<string>;
}

export default function BackendErrorBanner({ headerMessage, errors, onDismiss, onResolve, autoResolvedCodes }: Props) {
  /* Group errors by validation category */
  const grouped = useMemo(() => {
    const map: Record<string, ValidationErrorDetail[]> = {};
    for (const cat of CATEGORY_ORDER) map[cat] = [];

    for (const e of errors) {
      const category = V_CODE_CATEGORIES[e.code] || 'Data Completeness';
      if (!map[category]) map[category] = [];
      map[category].push(e);
    }

    return CATEGORY_ORDER
      .filter(cat => map[cat] && map[cat].length > 0)
      .map(cat => ({ category: cat, items: map[cat] }));
  }, [errors]);

  /* Only count non-auto-resolved errors in the header badge */
  const actionableErrors = autoResolvedCodes
    ? errors.filter(e => !autoResolvedCodes.has(e.code))
    : errors;
  const totalCritical = actionableErrors.filter(e => e.severity === 'CRITICAL').length;
  const totalWarning = actionableErrors.filter(e => e.severity === 'WARNING').length;

  return (
    <div style={{
      marginTop: 12,
      background: 'color-mix(in srgb, var(--accent-red) 3%, transparent)',
      border: '1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)',
      fontFamily: mono,
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid color-mix(in srgb, var(--accent-red) 15%, transparent)',
        background: 'color-mix(in srgb, var(--accent-red) 5%, transparent)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--accent-red)',
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: 'var(--accent-red)',
          }}>
            {headerMessage}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {totalCritical > 0 && (
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              padding: '2px 6px',
              color: 'var(--accent-red)',
              background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)',
              borderRadius: 2,
              letterSpacing: '0.06em',
            }}>
              {totalCritical} EXCEPTION{totalCritical !== 1 ? 'S' : ''}
            </span>
          )}
          {totalWarning > 0 && (
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              padding: '2px 6px',
              color: 'var(--accent-amber)',
              background: 'color-mix(in srgb, var(--accent-amber) 10%, transparent)',
              borderRadius: 2,
              letterSpacing: '0.06em',
            }}>
              {totalWarning} ADVISORY
            </span>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                padding: '0 4px',
                opacity: 0.5,
              }}
              aria-label="Dismiss"
            >
              {'\u2715'}
            </button>
          )}
        </div>
      </div>

      {/* Category groups */}
      <div style={{ padding: '0 14px 8px' }}>
        {grouped.map(({ category, items }) => {
          const catColor = CATEGORY_COLORS[category] || 'var(--text-secondary)';
          const catCritical = items.filter(i => i.severity === 'CRITICAL').length;
          const catWarning = items.filter(i => i.severity === 'WARNING').length;

          return (
            <div key={category} style={{
              display: 'flex',
              gap: 0,
              marginTop: 10,
            }}>
              {/* Left accent bar */}
              <div style={{
                width: 3,
                borderRadius: 1,
                flexShrink: 0,
                marginRight: 12,
                background: catColor,
              }} />

              {/* Category content */}
              <div style={{ flex: 1 }}>
                {/* Category heading */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                }}>
                  <span style={{
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    letterSpacing: '0.02em',
                  }}>
                    {category}
                  </span>
                  {catCritical > 0 && (
                    <span style={{
                      fontSize: '0.6875rem',
                      padding: '1px 5px',
                      borderRadius: 2,
                      color: 'var(--accent-red)',
                      background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)',
                      letterSpacing: '0.04em',
                    }}>
                      {catCritical} exception{catCritical !== 1 ? 's' : ''}
                    </span>
                  )}
                  {catWarning > 0 && (
                    <span style={{
                      fontSize: '0.6875rem',
                      padding: '1px 5px',
                      borderRadius: 2,
                      color: 'var(--accent-amber)',
                      background: 'color-mix(in srgb, var(--accent-amber) 10%, transparent)',
                      letterSpacing: '0.04em',
                    }}>
                      {catWarning} advisory
                    </span>
                  )}
                </div>

                {/* Error rows */}
                {items.map((item, i) => (
                  <ErrorRow key={`${item.code}-${i}`} error={item} onResolve={onResolve} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid color-mix(in srgb, var(--border-rim) 30%, transparent)',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
        opacity: 0.5,
        letterSpacing: '0.04em',
      }}>
        Click any error row for diagnosis details. Use action buttons to resolve.
      </div>
    </div>
  );
}
