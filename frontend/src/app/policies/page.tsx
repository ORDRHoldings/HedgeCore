"use client";

/**
 * Policy Engine Page — /policies
 *
 * v2 — redesigned cards, always-visible action buttons, compact layout,
 *       fixed activate flow, QuickAssign entry point.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Check, Zap, Shield, BarChart2, Globe,
  Search, X, Bookmark, GitCompare, Star, Bolt,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { POLICY_PRESETS } from "@/constants/policyPresets";
import type { PolicyPreset } from "@/constants/policyPresets";
import {
  listPolicyTemplates,
  getActivePolicy,
  activatePolicy,
  listFavorites,
  addFavorite,
  removeFavorite,
  type PolicyTemplate,
  type PolicyInstance,
} from "@/api/policyClient";
import Toast from "@/components/shared/Toast";
import HelpPanelV2 from "@/components/help/HelpPanelV2";
import { POLICIES_HELP } from "@/lib/help";
import PolicyCompareModal from "@/components/policy/PolicyCompareModal";
import { computeEffectivenessScore, getEffectivenessColor } from "@/utils/policyEffectivenessScore";

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub,var(--bg-panel))",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan,#22d3ee)",
  amber:    "var(--accent-amber,#fbbf24)",
  green:    "var(--status-pass,#34d399)",
  red:      "var(--accent-red,#f87171)",
  purple:   "#a78bfa",
} as const;

const CATEGORIES = [
  { key: 'ALL',       label: 'All Policies', icon: Shield },
  { key: 'CORPORATE', label: 'Corporate',    icon: BarChart2 },
  { key: 'FINANCIAL', label: 'Financial',    icon: Zap },
  { key: 'SOVEREIGN', label: 'Sovereign',    icon: Globe },
  { key: 'SECTOR',    label: 'Sector',       icon: Search },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

function riskColor(posture: PolicyPreset['riskPosture']): string {
  if (posture === 'CONSERVATIVE') return S.green;
  if (posture === 'AGGRESSIVE')   return S.red;
  return S.amber;
}

// ── Preset Card v2 ────────────────────────────────────────────────────────────
interface PresetCardProps {
  preset:             PolicyPreset;
  isActive:           boolean;
  isActivating:       boolean;
  onActivate:         (preset: PolicyPreset) => void;
  isFavorited:        boolean;
  onToggleFavorite:   () => void;
  effectivenessScore?: number;
  effectivenessBadge?: string;
  effectivenessColor?: string;
  compareMode?:       boolean;
  isCompared?:        boolean;
  onCompareToggle?:   () => void;
  canActivate:        boolean;   // true = dbTmpl found
  dbVersion?:         number;    // UX-POLICY-4: version from DB template
  dbUpdatedAt?:       string | null; // UX-POLICY-4: last updated timestamp
}

function PresetCard({
  preset, isActive, isActivating, onActivate, isFavorited, onToggleFavorite,
  effectivenessScore, effectivenessBadge, effectivenessColor,
  compareMode, isCompared, onCompareToggle, canActivate,
  dbVersion, dbUpdatedAt,
}: PresetCardProps) {
  const [hovered, setHovered] = useState(false);
  const rc = riskColor(preset.riskPosture);

  const borderColor = isCompared ? S.amber : isActive ? S.cyan : hovered ? S.soft : S.rim;
  const bgColor     = isCompared
    ? `color-mix(in srgb, ${S.amber} 5%, ${S.bgPanel})`
    : isActive
    ? `color-mix(in srgb, ${S.cyan} 4%, ${S.bgPanel})`
    : S.bgPanel;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1.5px solid ${borderColor}`,
        background: bgColor,
        borderRadius: 3,
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.12s',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Active / compare indicator strip */}
      {(isActive || isCompared) && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: isCompared ? S.amber : S.cyan,
        }} />
      )}

      {/* ── Header ── */}
      <div style={{
        padding: '8px 10px 6px',
        borderBottom: `1px solid ${S.rim}`,
        background: S.bgDeep,
      }}>
        {/* Row 1: category + badges + action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span style={{
            fontFamily: S.fontMono, fontSize: '0.5625rem',
            letterSpacing: '0.08em', color: S.tertiary, flex: 1,
          }}>
            {preset.category}
          </span>

          {/* Effectiveness score */}
          {effectivenessScore !== undefined && effectivenessBadge && effectivenessColor && (
            <span style={{
              fontFamily: S.fontMono, fontSize: '0.5rem', padding: '1px 4px',
              borderRadius: 2, letterSpacing: '0.05em',
              background: `color-mix(in srgb, ${effectivenessColor} 14%, transparent)`,
              color: effectivenessColor,
            }}>
              {effectivenessScore} {effectivenessBadge}
            </span>
          )}

          {/* Risk posture */}
          <span style={{
            fontFamily: S.fontMono, fontSize: '0.5625rem', padding: '1px 5px',
            borderRadius: 2, letterSpacing: '0.06em',
            background: `color-mix(in srgb, ${rc} 14%, transparent)`,
            color: rc,
          }}>
            {preset.riskPosture}
          </span>
        </div>

        {/* Row 2: name + shortName */}
        <div style={{
          fontFamily: S.fontUI, fontSize: '0.8rem', fontWeight: 700,
          color: S.primary, lineHeight: 1.2, marginBottom: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {preset.name}
        </div>
        <div style={{
          fontFamily: S.fontMono, fontSize: '0.625rem', color: S.tertiary,
          letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {preset.shortName}
          {/* UX-POLICY-4: version + last-updated chip from DB */}
          {dbVersion !== undefined && (
            <span style={{
              fontFamily: S.fontMono, fontSize: '0.4375rem', padding: '1px 4px',
              border: `1px solid color-mix(in srgb, ${S.cyan} 22%, ${S.rim})`,
              color: S.cyan, letterSpacing: '0.04em',
            }}>
              v{dbVersion}
            </span>
          )}
          {dbUpdatedAt && (
            <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', color: S.tertiary, letterSpacing: '0.03em' }}>
              {new Date(dbUpdatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* ── Body: params grid (no description text) ── */}
      <div style={{ padding: '8px 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 0' }}>
          {[
            { label: 'CONF', value: `${Math.round(preset.policy.hedge_ratios.confirmed * 100)}%` },
            { label: 'FCST', value: `${Math.round(preset.policy.hedge_ratios.forecast  * 100)}%` },
            { label: 'SPRD', value: `${preset.policy.cost_assumptions.spread_bps} bps` },
            { label: 'PROD', value: preset.policy.execution_product },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{
                fontFamily: S.fontMono, fontSize: '0.4375rem',
                color: S.tertiary, letterSpacing: '0.06em',
              }}>
                {label}
              </span>
              <span style={{
                fontFamily: S.fontMono, fontSize: '0.75rem',
                fontWeight: 700, color: S.primary,
              }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* One-line description shown on hover */}
        {hovered && (
          <div style={{
            fontFamily: S.fontUI, fontSize: '0.5625rem', color: S.secondary,
            lineHeight: 1.4, marginTop: 5, borderTop: `1px solid ${S.rim}`, paddingTop: 5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {preset.description}
          </div>
        )}
      </div>

      {/* ── Footer: action buttons ── */}
      <div style={{
        padding: '6px 10px',
        borderTop: `1px solid ${S.rim}`,
        background: S.bgSub,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        {/* Activate / Active indicator */}
        {isActive ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
            <Check size={10} color={S.cyan} />
            <span style={{
              fontFamily: S.fontMono, fontSize: '0.5625rem',
              color: S.cyan, letterSpacing: '0.06em',
            }}>
              ACTIVE
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onActivate(preset)}
            disabled={isActivating || !canActivate}
            title={!canActivate ? 'Template not available — try refreshing' : 'Activate this policy'}
            style={{
              flex: 1,
              fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em',
              padding: '3px 8px',
              border: `1px solid ${!canActivate ? S.rim : hovered ? S.cyan : `color-mix(in srgb, ${S.cyan} 35%, ${S.rim})`}`,
              color: !canActivate ? S.tertiary : hovered ? S.cyan : S.secondary,
              background: hovered && canActivate ? `color-mix(in srgb, ${S.cyan} 8%, transparent)` : 'transparent',
              cursor: !canActivate ? 'not-allowed' : isActivating ? 'wait' : 'pointer',
              transition: 'all 0.12s',
              opacity: !canActivate ? 0.5 : 1,
            }}
          >
            {isActivating ? 'ACTIVATING…' : 'ACTIVATE'}
          </button>
        )}

        {/* Favorite button — always visible */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          style={{
            background: isFavorited ? `color-mix(in srgb, ${S.amber} 12%, transparent)` : 'none',
            border: `1px solid ${isFavorited ? S.amber : S.rim}`,
            cursor: 'pointer',
            padding: '3px 5px',
            color: isFavorited ? S.amber : S.tertiary,
            display: 'flex', alignItems: 'center',
            borderRadius: 2,
            transition: 'all 0.1s',
          }}
        >
          <Bookmark size={10} fill={isFavorited ? S.amber : 'none'} />
        </button>

        {/* Compare button — always visible, highlights when in compare mode */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCompareToggle?.(); }}
          title={isCompared ? 'Remove from compare' : 'Add to compare'}
          style={{
            background: isCompared ? `color-mix(in srgb, ${S.amber} 12%, transparent)` : 'none',
            border: `1px solid ${isCompared ? S.amber : compareMode ? `color-mix(in srgb, ${S.amber} 40%, ${S.rim})` : S.rim}`,
            cursor: 'pointer',
            padding: '3px 5px',
            color: isCompared ? S.amber : compareMode ? `color-mix(in srgb, ${S.amber} 60%, ${S.tertiary})` : S.tertiary,
            display: 'flex', alignItems: 'center',
            borderRadius: 2,
            transition: 'all 0.1s',
          }}
        >
          <GitCompare size={10} />
        </button>
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────
export default function PoliciesPage() {
  const { token } = useAuth();
  const router    = useRouter();

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('ALL');
  const [searchQuery, setSearchQuery]         = useState('');
  // PERF-POLICY-2: debounced version of searchQuery (300ms)
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active policy state
  const [activeInstance, setActiveInstance]   = useState<PolicyInstance | null>(null);
  const [activatingId, setActivatingId]       = useState<string | null>(null);
  const [dbTemplates, setDbTemplates]         = useState<PolicyTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  // RES-1: surface template load failures
  const [templatesError, setTemplatesError]   = useState<string | null>(null);

  // Favorites state
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Compare mode state
  const [compareMode, setCompareMode]           = useState(false);
  const [compareIds, setCompareIds]             = useState<Set<string>>(new Set());
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Toast
  const [toastMsg, setToastMsg]         = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg); setToastVisible(true);
  }, []);

  // Load active policy + templates on mount
  useEffect(() => {
    if (!token) return;
    getActivePolicy(token).then(inst => setActiveInstance(inst)).catch(() => {});
    setTemplatesLoading(true);
    setTemplatesError(null);
    listPolicyTemplates(token)
      .then(t => { setDbTemplates(t); setTemplatesLoading(false); })
      .catch((e: unknown) => {
        setTemplatesLoading(false);
        // RES-1: surface the error so operators know activation is unavailable
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setTemplatesError(detail ?? (e instanceof Error ? e.message : 'Failed to load policy templates from server'));
      });
    listFavorites(token)
      .then(favs => setFavoriteIds(new Set(favs.map(f => f.template_id))))
      .catch(() => {});
  }, [token]);

  // Active preset ID (matched by short_name)
  const activePresetId = useMemo(() => {
    if (!activeInstance?.template) return null;
    const tmpl = activeInstance.template;
    return POLICY_PRESETS.find(p => p.shortName === tmpl.short_name)?.id ?? null;
  }, [activeInstance]);

  // Toggle favorite — RES-2: optimistic update with rollback on error
  const handleToggleFavorite = useCallback(async (templateId: string) => {
    if (!token) return;
    const wasInSet = favoriteIds.has(templateId);
    // Optimistic update
    setFavoriteIds(prev => {
      const n = new Set(prev);
      if (wasInSet) n.delete(templateId); else n.add(templateId);
      return n;
    });
    try {
      if (wasInSet) {
        await removeFavorite(templateId, token);
        showToast('Removed from favorites');
      } else {
        await addFavorite(templateId, undefined, token);
        showToast('Added to favorites');
      }
    } catch (e: unknown) {
      // Rollback optimistic update
      setFavoriteIds(prev => {
        const n = new Set(prev);
        if (wasInSet) n.add(templateId); else n.delete(templateId);
        return n;
      });
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast(`Favorites update failed: ${detail ?? 'please try again'}`);
    }
  }, [token, favoriteIds, showToast]);

  // Activate preset — looks up template, retries if not cached yet
  const handleActivate = useCallback(async (preset: PolicyPreset) => {
    if (!token) return;

    const doActivate = async (templates: PolicyTemplate[]) => {
      const dbTmpl = templates.find(t => t.short_name === preset.shortName);
      if (!dbTmpl) {
        showToast(`Template "${preset.shortName}" not found. Run policy seed or contact admin.`);
        return;
      }
      setActivatingId(preset.id);
      try {
        const inst = await activatePolicy(dbTmpl.id, token);
        setActiveInstance(inst);
        showToast(`✓ Policy activated: [${preset.shortName}] ${preset.name}`);
      } catch (e: unknown) {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        showToast(`Activation failed: ${detail ?? String(e)}`);
      } finally {
        setActivatingId(null);
      }
    };

    // Try cached templates first, refresh if missing
    const cached = dbTemplates.find(t => t.short_name === preset.shortName);
    if (!cached) {
      try {
        const refreshed = await listPolicyTemplates(token);
        setDbTemplates(refreshed);
        await doActivate(refreshed);
      } catch {
        showToast(`Failed to load templates. Please refresh.`);
      }
    } else {
      await doActivate(dbTemplates);
    }
  }, [token, dbTemplates, showToast]);

  // PERF-POLICY-2: drive filter from debounced value, not raw keystroke state
  const filteredPresets = useMemo(() => {
    let list = POLICY_PRESETS;
    if (activeCategory !== 'ALL') list = list.filter(p => p.category === activeCategory);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.targetAudience.toLowerCase().includes(q),
      );
    }
    if (showFavoritesOnly) {
      list = list.filter(p => {
        const dbTmpl = dbTemplates.find(t => t.short_name === p.shortName);
        return dbTmpl ? favoriteIds.has(dbTmpl.id) : false;
      });
    }
    return list;
  }, [activeCategory, debouncedSearch, showFavoritesOnly, favoriteIds, dbTemplates]);

  // Saved (non-system) templates
  const savedTemplates = useMemo(() => dbTemplates.filter(t => !t.is_system), [dbTemplates]);

  // Favorite count for header badge
  const favCount = favoriteIds.size;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: S.bgDeep }}>
    <div style={{ flex: 1, overflowY: 'auto', minWidth: 0, fontFamily: S.fontUI }}>

      {/* ── Page header ── */}
      <div style={{
        borderBottom: `1px solid ${S.rim}`,
        background: S.bgPanel,
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={16} color={S.cyan} />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.cyan, letterSpacing: '0.1em', fontWeight: 700 }}>
              POLICY ENGINE
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: '0.6875rem', color: S.secondary, marginTop: 1 }}>
              Manage and activate FX hedge policies · {POLICY_PRESETS.length} system presets
            </div>
          </div>
        </div>

        {/* Active policy banner */}
        {activePresetId && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px',
            border: `1px solid color-mix(in srgb, ${S.cyan} 28%, transparent)`,
            background: `color-mix(in srgb, ${S.cyan} 6%, transparent)`,
          }}>
            <Check size={11} color={S.cyan} />
            <span style={{ fontFamily: S.fontMono, fontSize: '0.625rem', color: S.cyan, letterSpacing: '0.06em' }}>
              ACTIVE: {POLICY_PRESETS.find(p => p.id === activePresetId)?.shortName ?? 'POLICY'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Favorites indicator */}
          {favCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px',
              border: `1px solid color-mix(in srgb, ${S.amber} 30%, ${S.rim})`,
              color: S.amber,
            }}>
              <Star size={11} fill={S.amber} />
              <span style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em' }}>
                {favCount} FAVORITE{favCount !== 1 ? 'S' : ''}
              </span>
            </div>
          )}

          {/* Compare toggle */}
          <button
            type="button"
            onClick={() => {
              setCompareMode(prev => {
                if (prev) { setCompareIds(new Set()); setShowCompareModal(false); }
                return !prev;
              });
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', fontWeight: 700,
              padding: '6px 14px',
              border: `1px solid ${compareMode ? S.amber : S.rim}`,
              color: compareMode ? 'var(--bg-deep)' : S.tertiary,
              background: compareMode ? S.amber : 'transparent',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <GitCompare size={12} />
            {compareMode ? `COMPARE (${compareIds.size})` : 'COMPARE'}
          </button>

          {/* AI Policy */}
          <button
            type="button"
            onClick={() => router.push('/ai-policy-wizard')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: S.fontMono, fontSize: '0.6875rem', letterSpacing: '0.08em', fontWeight: 700,
              padding: '6px 14px',
              border: `1px solid ${S.amber}`,
              color: 'var(--bg-deep)', background: S.amber,
              cursor: 'pointer',
            }}
          >
            <Sparkles size={12} />
            + NEW AI POLICY
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '14px 24px' }}>

        {/* ── Filter bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {CATEGORIES.map(({ key, label, icon: Icon }) => {
            const isActive = activeCategory === key;
            const count    = key === 'ALL' ? POLICY_PRESETS.length : POLICY_PRESETS.filter(p => p.category === key).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCategory(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: S.fontMono, fontSize: '0.625rem', letterSpacing: '0.06em',
                  padding: '4px 10px',
                  border: `1px solid ${isActive ? S.cyan : S.rim}`,
                  color: isActive ? S.cyan : S.tertiary,
                  background: isActive ? `color-mix(in srgb, ${S.cyan} 8%, ${S.bgPanel})` : 'transparent',
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                <Icon size={10} />
                {label}
                <span style={{ opacity: 0.6, fontSize: '0.4rem' }}>({count})</span>
              </button>
            );
          })}

          {/* Favorites quick-filter */}
          {favCount > 0 && (
            <button
              type="button"
              onClick={() => setShowFavoritesOnly(prev => !prev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: S.fontMono, fontSize: '0.625rem', letterSpacing: '0.06em',
                padding: '4px 10px',
                border: `1px solid ${showFavoritesOnly ? S.amber : `color-mix(in srgb, ${S.amber} 40%, ${S.rim})`}`,
                color: showFavoritesOnly ? 'var(--bg-deep)' : S.amber,
                background: showFavoritesOnly ? S.amber : 'transparent',
                cursor: 'pointer', transition: 'all 0.1s',
              }}
            >
              <Bookmark size={10} fill={showFavoritesOnly ? 'var(--bg-deep)' : S.amber} />
              FAVORITES ({favCount})
            </button>
          )}

          {/* Compare mode hint */}
          {compareMode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px',
              border: `1px solid color-mix(in srgb, ${S.amber} 30%, ${S.rim})`,
              color: S.amber,
              fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em',
              animation: compareIds.size === 0 ? 'none' : undefined,
            }}>
              <Bolt size={10} />
              COMPARE MODE — click <GitCompare size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> on any card to select
            </div>
          )}

          {/* Search */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${S.rim}`, background: S.bgPanel, padding: '4px 10px' }}>
            <Search size={10} color={S.tertiary} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                const val = e.target.value;
                setSearchQuery(val);
                // PERF-POLICY-2: 300ms debounce — only update filter state after user stops typing
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                searchDebounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
              }}
              placeholder="Search policies…"
              style={{ border: 'none', background: 'transparent', color: S.primary, fontFamily: S.fontUI, fontSize: '0.6875rem', outline: 'none', width: 150 }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setDebouncedSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.tertiary, padding: 0, display: 'flex', alignItems: 'center' }}>
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* ── Templates loading notice ── */}
        {templatesLoading && dbTemplates.length === 0 && (
          <div style={{
            padding: '6px 12px', marginBottom: 12,
            border: `1px solid color-mix(in srgb, ${S.cyan} 20%, ${S.rim})`,
            background: `color-mix(in srgb, ${S.cyan} 4%, ${S.bgPanel})`,
            fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.cyan, letterSpacing: '0.08em',
          }}>
            LOADING TEMPLATES FROM SERVER…
          </div>
        )}

        {/* ── RES-1: Template load error banner ── */}
        {templatesError && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              padding: '8px 14px', marginBottom: 12,
              border: `1px solid color-mix(in srgb, ${S.amber} 40%, ${S.rim})`,
              background: `color-mix(in srgb, ${S.amber} 6%, ${S.bgPanel})`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.amber, letterSpacing: '0.08em', flex: 1 }}>
              ⚠ POLICY TEMPLATE LOAD FAILED — activation is unavailable until resolved.{' '}
              <span style={{ opacity: 0.8 }}>{templatesError}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                if (!token) return;
                setTemplatesError(null);
                setTemplatesLoading(true);
                listPolicyTemplates(token)
                  .then(t => { setDbTemplates(t); setTemplatesLoading(false); })
                  .catch((e: unknown) => {
                    setTemplatesLoading(false);
                    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                    setTemplatesError(detail ?? (e instanceof Error ? e.message : 'Failed to load policy templates from server'));
                  });
              }}
              style={{
                fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em',
                padding: '3px 10px',
                border: `1px solid ${S.amber}`,
                color: S.amber, background: 'transparent',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              RETRY
            </button>
            <button
              type="button"
              onClick={() => setTemplatesError(null)}
              aria-label="Dismiss"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: S.amber, padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0,
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* ── No templates warning (only show when no error and not loading) ── */}
        {!templatesLoading && !templatesError && dbTemplates.length === 0 && (
          <div style={{
            padding: '8px 14px', marginBottom: 12,
            border: `1px solid color-mix(in srgb, ${S.amber} 30%, ${S.rim})`,
            background: `color-mix(in srgb, ${S.amber} 5%, ${S.bgPanel})`,
            fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.amber, letterSpacing: '0.08em',
          }}>
            ⚠ No policy templates found in DB. Activate button will be disabled. Run POST /api/v1/policies/templates/seed to populate.
          </div>
        )}

        {/* ── Preset grid ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: 8,
          marginBottom: 24,
        }}>
          {filteredPresets.map(preset => {
            const dbTmpl   = dbTemplates.find(t => t.short_name === preset.shortName);
            const eff      = computeEffectivenessScore(preset.policy, preset.riskPosture);
            const effColor = getEffectivenessColor(eff.score, S as unknown as Record<string, string>);
            return (
              <PresetCard
                key={preset.id}
                preset={preset}
                isActive={preset.id === activePresetId}
                isActivating={activatingId === preset.id}
                onActivate={handleActivate}
                isFavorited={dbTmpl ? favoriteIds.has(dbTmpl.id) : false}
                onToggleFavorite={() => dbTmpl && handleToggleFavorite(dbTmpl.id)}
                effectivenessScore={eff.score}
                effectivenessBadge={eff.badge}
                effectivenessColor={effColor}
                compareMode={compareMode}
                isCompared={compareIds.has(preset.id)}
                onCompareToggle={() => {
                  setCompareIds(prev => {
                    const next = new Set(prev);
                    if (next.has(preset.id))   { next.delete(preset.id); }
                    else if (next.size < 4)    { next.add(preset.id); }
                    else { showToast('Maximum 4 policies for comparison.'); }
                    return next;
                  });
                }}
                canActivate={!!dbTmpl}
                dbVersion={dbTmpl?.version}
                dbUpdatedAt={dbTmpl?.updated_at ?? null}
              />
            );
          })}
          {filteredPresets.length === 0 && !templatesLoading && (
            <div style={{
              gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0',
              fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.tertiary, letterSpacing: '0.06em',
            }}>
              NO POLICIES MATCH YOUR SEARCH
            </div>
          )}
        </div>

        {/* ── Saved / Custom policies ── */}
        {savedTemplates.length > 0 && (
          <div style={{ borderTop: `1px solid ${S.rim}`, paddingTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Sparkles size={13} color={S.amber} />
              <span style={{ fontFamily: S.fontMono, fontSize: '0.625rem', letterSpacing: '0.1em', color: S.amber, fontWeight: 700 }}>
                CUSTOM AI POLICIES ({savedTemplates.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {savedTemplates.map(tmpl => (
                <div key={tmpl.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 12px',
                  border: `1px solid ${S.rim}`,
                  background: S.bgPanel,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: S.fontUI, fontSize: '0.8125rem', fontWeight: 600,
                      color: S.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {tmpl.name}
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.tertiary, letterSpacing: '0.05em', marginTop: 2 }}>
                      {tmpl.short_name} · {tmpl.category} · {tmpl.risk_posture}
                    </div>
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.secondary }}>
                    Conf: {Math.round(tmpl.config.hedge_ratios.confirmed * 100)}% · Fcst: {Math.round(tmpl.config.hedge_ratios.forecast * 100)}%
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActivatingId(tmpl.id);
                      activatePolicy(tmpl.id, token!).then(inst => {
                        setActiveInstance(inst);
                        showToast(`✓ Custom policy activated: ${tmpl.short_name}`);
                      }).catch(e => {
                        showToast(`Error: ${(e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(e)}`);
                      }).finally(() => setActivatingId(null));
                    }}
                    disabled={activatingId === tmpl.id}
                    style={{
                      fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em',
                      padding: '3px 10px',
                      border: `1px solid ${S.cyan}`,
                      color: S.cyan, background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {activatingId === tmpl.id ? 'ACTIVATING…' : 'ACTIVATE'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Toast message={toastMsg} visible={toastVisible} onClose={() => setToastVisible(false)} />

      {/* ── Floating compare bar ── */}
      {compareMode && compareIds.size >= 2 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 18px',
          background: S.bgPanel, border: `1px solid ${S.amber}`,
          boxShadow: `0 0 24px color-mix(in srgb, ${S.amber} 18%, transparent)`,
        }}>
          <GitCompare size={13} color={S.amber} />
          <span style={{ fontFamily: S.fontMono, fontSize: '0.625rem', color: S.amber, letterSpacing: '0.06em' }}>
            {compareIds.size} POLICIES SELECTED
          </span>
          <button
            type="button"
            onClick={() => setShowCompareModal(true)}
            style={{
              fontFamily: S.fontMono, fontSize: '0.625rem', letterSpacing: '0.08em',
              padding: '4px 14px', border: `1px solid ${S.amber}`,
              color: 'var(--bg-deep)', background: S.amber,
              cursor: 'pointer', fontWeight: 700,
            }}
          >
            VIEW COMPARISON
          </button>
          <button
            type="button"
            onClick={() => setCompareIds(new Set())}
            style={{
              fontFamily: S.fontMono, fontSize: '0.625rem', letterSpacing: '0.06em',
              padding: '4px 10px', border: `1px solid ${S.rim}`,
              color: S.tertiary, background: 'transparent', cursor: 'pointer',
            }}
          >
            CLEAR
          </button>
        </div>
      )}

      {/* ── Compare modal ── */}
      {showCompareModal && compareIds.size >= 2 && (
        <PolicyCompareModal
          presets={POLICY_PRESETS.filter(p => compareIds.has(p.id))}
          onClose={() => setShowCompareModal(false)}
        />
      )}
    </div>
    <HelpPanelV2 module={POLICIES_HELP} storageKey="policy-library" />
    </div>
  );
}
