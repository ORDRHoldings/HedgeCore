"use client";
/**
 * QuickAssignModal
 * ────────────────
 * Fast-path modal that lets the user pick a policy from their favorites
 * (or any available template) and immediately assign it to one or many
 * positions in a single click.
 *
 * Used from two call-sites:
 *   1. Policy Library page — "QUICK ASSIGN" button in header when a policy
 *      is favorited (assigns active policy instance to selected positions)
 *   2. Position Desk — bulk action bar "ASSIGN POLICY" button
 *
 * Props
 * ─────
 *   positions        – list of PositionRow objects to assign to
 *   templates        – full list of PolicyTemplate objects (pre-loaded)
 *   favoriteIds      – Set of template IDs that the user has favorited
 *   activePolicyInstance – the currently active PolicyInstance (may be null)
 *   token            – JWT for API calls
 *   onClose          – dismiss the modal
 *   onAssigned       – called after successful assignment(s); receives
 *                      updated PositionRow array
 */

import { useState, useMemo } from "react";
import { Bookmark, Check, X, Zap, AlertTriangle, ChevronRight } from "lucide-react";
import { assignPolicy, type PositionRow } from "@/api/positionClient";
import type { PolicyTemplate, PolicyInstance } from "@/api/policyClient";

const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub,var(--bg-panel))",
  rim:      "var(--border-rim)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan,#22d3ee)",
  amber:    "var(--accent-amber,#fbbf24)",
  green:    "var(--status-pass,#34d399)",
  red:      "var(--accent-red,#f87171)",
} as const;

interface QuickAssignModalProps {
  positions:            PositionRow[];
  templates:            PolicyTemplate[];
  favoriteIds:          Set<string>;
  activePolicyInstance: PolicyInstance | null;
  token:                string;
  onClose:              () => void;
  onAssigned:           (updated: PositionRow[]) => void;
}

export default function QuickAssignModal({
  positions,
  templates,
  favoriteIds,
  activePolicyInstance,
  token,
  onClose,
  onAssigned,
}: QuickAssignModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    // Pre-select the active policy template if available
    activePolicyInstance?.template_id ?? null,
  );
  const [search, setSearch]         = useState('');
  const [assigning, setAssigning]   = useState(false);
  const [progress, setProgress]     = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors]         = useState<string[]>([]);
  const [done, setDone]             = useState(false);

  // Only NEW positions can be assigned
  const assignablePositions = useMemo(
    () => positions.filter(p => p.execution_status === 'NEW' || p.execution_status === 'POLICY_ASSIGNED'),
    [positions],
  );

  // Split templates: favorites first, then others
  const { favTemplates, otherTemplates } = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filter = (t: PolicyTemplate) =>
      !q || t.name.toLowerCase().includes(q) || t.short_name.toLowerCase().includes(q);
    return {
      favTemplates:   templates.filter(t => favoriteIds.has(t.id) && filter(t)),
      otherTemplates: templates.filter(t => !favoriteIds.has(t.id) && filter(t)),
    };
  }, [templates, favoriteIds, search]);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;

  // The policy instance ID to send to the API
  // We can only assign the ACTIVE instance (the backend PATCH /assign-policy takes an instance ID)
  const instanceId = useMemo(() => {
    if (!activePolicyInstance || !selectedTemplateId) return null;
    if (activePolicyInstance.template_id !== selectedTemplateId) return null;
    return activePolicyInstance.id;
  }, [activePolicyInstance, selectedTemplateId]);

  const canAssign = !!instanceId && assignablePositions.length > 0 && !assigning && !done;

  const handleAssign = async () => {
    if (!instanceId || !canAssign) return;
    setAssigning(true);
    setProgress({ done: 0, total: assignablePositions.length });
    setErrors([]);

    const updated: PositionRow[] = [];
    const errs: string[] = [];

    for (let i = 0; i < assignablePositions.length; i++) {
      const pos = assignablePositions[i];
      try {
        const result = await assignPolicy(pos.id, instanceId, token);
        updated.push(result);
      } catch (e: unknown) {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        errs.push(`${pos.record_id}: ${detail ?? String(e)}`);
      }
      setProgress({ done: i + 1, total: assignablePositions.length });
    }

    setErrors(errs);
    setAssigning(false);
    setDone(true);
    if (updated.length > 0) onAssigned(updated);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          width: 520, maxWidth: '95vw',
          maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '14px 18px 12px',
          borderBottom: `1px solid ${S.rim}`,
          background: S.bgDeep,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Zap size={15} color={S.amber} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.amber, letterSpacing: '0.12em', fontWeight: 700 }}>
              QUICK ASSIGN POLICY
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: '0.75rem', color: S.secondary, marginTop: 2 }}>
              {assignablePositions.length} position{assignablePositions.length !== 1 ? 's' : ''} selected
              {positions.length !== assignablePositions.length && (
                <span style={{ color: S.tertiary }}>
                  {' '}· {positions.length - assignablePositions.length} skipped (not NEW/POLICY_ASSIGNED)
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.tertiary, padding: 2, display: 'flex' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>

          {/* Active policy notice */}
          {activePolicyInstance?.template && (
            <div style={{
              padding: '7px 11px', marginBottom: 12,
              border: `1px solid color-mix(in srgb, ${S.cyan} 25%, ${S.rim})`,
              background: `color-mix(in srgb, ${S.cyan} 5%, ${S.bgPanel})`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Check size={11} color={S.cyan} />
              <div>
                <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.cyan, letterSpacing: '0.1em' }}>
                  ACTIVE POLICY
                </span>
                <span style={{ fontFamily: S.fontUI, fontSize: '0.75rem', color: S.primary, marginLeft: 8 }}>
                  [{activePolicyInstance.template.short_name}] {activePolicyInstance.template.name}
                </span>
              </div>
            </div>
          )}

          {/* Warning: no active policy */}
          {!activePolicyInstance && (
            <div style={{
              padding: '7px 11px', marginBottom: 12,
              border: `1px solid color-mix(in srgb, ${S.amber} 35%, ${S.rim})`,
              background: `color-mix(in srgb, ${S.amber} 5%, ${S.bgPanel})`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertTriangle size={11} color={S.amber} />
              <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.amber, letterSpacing: '0.06em' }}>
                NO ACTIVE POLICY — activate one on the Policy Library first
              </span>
            </div>
          )}

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search policies…"
            disabled={assigning || done}
            style={{
              width: '100%', boxSizing: 'border-box' as const,
              padding: '6px 10px', marginBottom: 10,
              border: `1px solid ${S.rim}`, background: S.bgSub,
              color: S.primary, fontFamily: S.fontUI, fontSize: '0.75rem',
              outline: 'none',
            }}
          />

          {/* Policy list */}
          <div style={{ border: `1px solid ${S.rim}`, maxHeight: 280, overflowY: 'auto' as const }}>

            {/* Favorites section */}
            {favTemplates.length > 0 && (
              <>
                <div style={{
                  padding: '4px 10px',
                  fontFamily: S.fontMono, fontSize: '0.75rem',
                  color: S.amber, letterSpacing: '0.1em',
                  borderBottom: `1px solid ${S.rim}`,
                  background: S.bgDeep,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <Bookmark size={9} fill={S.amber} />
                  FAVORITES
                </div>
                {favTemplates.map(t => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    isSelected={selectedTemplateId === t.id}
                    isActive={activePolicyInstance?.template_id === t.id}
                    isFavorite
                    disabled={assigning || done}
                    onSelect={() => setSelectedTemplateId(t.id)}
                  />
                ))}
              </>
            )}

            {/* All policies section */}
            {otherTemplates.length > 0 && (
              <>
                <div style={{
                  padding: '4px 10px',
                  fontFamily: S.fontMono, fontSize: '0.75rem',
                  color: S.tertiary, letterSpacing: '0.1em',
                  borderBottom: `1px solid ${S.rim}`,
                  background: S.bgDeep,
                }}>
                  ALL POLICIES
                </div>
                {otherTemplates.map(t => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    isSelected={selectedTemplateId === t.id}
                    isActive={activePolicyInstance?.template_id === t.id}
                    isFavorite={false}
                    disabled={assigning || done}
                    onSelect={() => setSelectedTemplateId(t.id)}
                  />
                ))}
              </>
            )}

            {favTemplates.length === 0 && otherTemplates.length === 0 && (
              <div style={{
                padding: '24px', textAlign: 'center',
                fontFamily: S.fontMono, fontSize: '0.75rem', color: S.tertiary,
              }}>
                {templates.length === 0 ? 'LOADING POLICIES…' : 'NO POLICIES MATCH'}
              </div>
            )}
          </div>

          {/* Non-active template warning */}
          {selectedTemplateId && !instanceId && selectedTemplate && (
            <div style={{
              marginTop: 8, padding: '6px 10px',
              border: `1px solid color-mix(in srgb, ${S.amber} 30%, ${S.rim})`,
              background: `color-mix(in srgb, ${S.amber} 5%, ${S.bgPanel})`,
              fontFamily: S.fontMono, fontSize: '0.75rem', color: S.amber,
              letterSpacing: '0.06em',
            }}>
              ⚠ [{selectedTemplate.short_name}] is not the active policy instance.
              Go to Policy Library and activate it first.
            </div>
          )}

          {/* Progress bar */}
          {progress && (
            <div style={{ marginTop: 12 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', marginBottom: 4,
                fontFamily: S.fontMono, fontSize: '0.75rem', color: S.secondary, letterSpacing: '0.06em',
              }}>
                <span>{assigning ? 'ASSIGNING…' : 'COMPLETE'}</span>
                <span>{progress.done}/{progress.total}</span>
              </div>
              <div style={{ height: 3, background: S.rim, borderRadius: 2 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${(progress.done / progress.total) * 100}%`,
                  background: done ? S.green : S.cyan,
                  transition: 'width 0.15s',
                }} />
              </div>
            </div>
          )}

          {/* Success summary */}
          {done && (
            <div style={{
              marginTop: 10, padding: '8px 12px',
              border: `1px solid color-mix(in srgb, ${S.green} 30%, ${S.rim})`,
              background: `color-mix(in srgb, ${S.green} 5%, ${S.bgPanel})`,
              fontFamily: S.fontMono, fontSize: '0.75rem', color: S.green, letterSpacing: '0.06em',
            }}>
              <Check size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} />
              {(progress?.done ?? 0) - errors.length} position{((progress?.done ?? 0) - errors.length) !== 1 ? 's' : ''} assigned
              {errors.length > 0 && (
                <span style={{ color: S.red, marginLeft: 8 }}>· {errors.length} failed</span>
              )}
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div style={{
              marginTop: 6, padding: '6px 10px',
              border: `1px solid color-mix(in srgb, ${S.red} 30%, ${S.rim})`,
              background: `color-mix(in srgb, ${S.red} 5%, ${S.bgPanel})`,
            }}>
              {errors.slice(0, 5).map((e, i) => (
                <div key={i} style={{
                  fontFamily: S.fontMono, fontSize: '0.75rem', color: S.red,
                  letterSpacing: '0.04em', marginBottom: 2,
                }}>
                  {e}
                </div>
              ))}
              {errors.length > 5 && (
                <div style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.tertiary }}>
                  +{errors.length - 5} more errors
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '10px 18px',
          borderTop: `1px solid ${S.rim}`,
          background: S.bgDeep,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          {done ? (
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '7px 16px',
                fontFamily: S.fontMono, fontSize: '0.75rem', letterSpacing: '0.08em', fontWeight: 700,
                border: `1px solid ${S.cyan}`, color: S.cyan, background: 'transparent',
                cursor: 'pointer',
              }}
            >
              CLOSE
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={assigning}
                style={{
                  padding: '7px 14px',
                  fontFamily: S.fontMono, fontSize: '0.75rem', letterSpacing: '0.06em',
                  border: `1px solid ${S.rim}`, color: S.tertiary, background: 'transparent',
                  cursor: assigning ? 'not-allowed' : 'pointer',
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handleAssign}
                disabled={!canAssign}
                title={
                  !instanceId
                    ? 'Select an active policy to assign'
                    : assignablePositions.length === 0
                    ? 'No assignable positions'
                    : `Assign [${selectedTemplate?.short_name}] to ${assignablePositions.length} positions`
                }
                style={{
                  flex: 1, padding: '7px 16px',
                  fontFamily: S.fontMono, fontSize: '0.75rem', letterSpacing: '0.08em', fontWeight: 700,
                  border: `1px solid ${canAssign ? S.amber : S.rim}`,
                  color: canAssign ? 'var(--bg-deep)' : S.tertiary,
                  background: canAssign ? S.amber : 'transparent',
                  cursor: canAssign ? 'pointer' : 'not-allowed',
                  transition: 'all 0.1s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <ChevronRight size={12} />
                {assigning
                  ? `ASSIGNING ${progress?.done ?? 0}/${progress?.total ?? 0}…`
                  : `ASSIGN TO ${assignablePositions.length} POSITION${assignablePositions.length !== 1 ? 'S' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Template row ──────────────────────────────────────────────────────────────
function TemplateRow({
  template, isSelected, isActive, isFavorite, disabled, onSelect,
}: {
  template:   PolicyTemplate;
  isSelected: boolean;
  isActive:   boolean;
  isFavorite: boolean;
  disabled:   boolean;
  onSelect:   () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const rc = template.risk_posture === 'CONSERVATIVE'
    ? 'var(--status-pass,#34d399)'
    : template.risk_posture === 'AGGRESSIVE'
    ? 'var(--accent-red,#f87171)'
    : 'var(--accent-amber,#fbbf24)';

  return (
    <div
      onClick={() => !disabled && onSelect()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '7px 12px',
        borderBottom: `1px solid ${S.rim}`,
        background: isSelected
          ? `color-mix(in srgb, var(--accent-amber,#fbbf24) 8%, ${S.bgPanel})`
          : hovered ? S.bgDeep : S.bgPanel,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        transition: 'background 0.1s',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {/* Selection indicator */}
      <div style={{
        width: 14, height: 14,
        border: `1px solid ${isSelected ? 'var(--accent-amber,#fbbf24)' : S.rim}`,
        background: isSelected ? 'var(--accent-amber,#fbbf24)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, borderRadius: 2,
      }}>
        {isSelected && <Check size={9} color="var(--bg-deep)" />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: '0.75rem', fontWeight: 700,
            color: isSelected ? 'var(--accent-amber,#fbbf24)' : S.secondary,
            letterSpacing: '0.06em',
          }}>
            [{template.short_name}]
          </span>
          <span style={{
            fontFamily: S.fontUI, fontSize: '0.75rem',
            color: S.primary,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {template.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: '0.75rem',
            color: rc, letterSpacing: '0.06em',
          }}>
            {template.risk_posture}
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.tertiary }}>
            CONF {Math.round(template.config.hedge_ratios.confirmed * 100)}%
            · FCST {Math.round(template.config.hedge_ratios.forecast * 100)}%
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {isFavorite && <Bookmark size={9} fill="var(--accent-amber,#fbbf24)" color="var(--accent-amber,#fbbf24)" />}
        {isActive && (
          <span style={{
            fontFamily: S.fontMono, fontSize: '0.75rem', padding: '1px 4px',
            border: '1px solid var(--accent-cyan,#22d3ee)',
            color: 'var(--accent-cyan,#22d3ee)', letterSpacing: '0.06em',
          }}>
            ACTIVE
          </span>
        )}
      </div>
    </div>
  );
}
