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
  Search, X, Bookmark, GitCompare, Star, Bolt, Eye,
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
import PolicyRevisionDrawer from "@/components/policy/PolicyRevisionDrawer";
import PolicyDetailDrawer from "@/components/policy/PolicyDetailDrawer";
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
  purple:   "#93C5FD",
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
  onInspect?:         () => void;
}

function PresetCard({
  preset, isActive, isActivating, onActivate, isFavorited, onToggleFavorite,
  effectivenessScore, effectivenessBadge, effectivenessColor,
  compareMode, isCompared, onCompareToggle, canActivate,
  dbVersion, dbUpdatedAt, onInspect,
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

        {/* Governance / maturity / accounting badges — always visible */}
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4,
        }}>
          {[
            { label: 'GOV', value: preset.governance_tier, color: preset.governance_tier === 'COMMITTEE' ? S.red : preset.governance_tier === 'ENHANCED' ? S.amber : S.green },
            { label: 'MAT', value: preset.maturity_profile },
            { label: 'ACCT', value: preset.accounting_mode },
          ].map(({ label, value, color }) => (
            <span key={label} style={{
              fontFamily: S.fontMono, fontSize: '0.4375rem', padding: '1px 4px',
              border: `1px solid ${color ?? S.soft}`,
              color: color ?? S.tertiary, letterSpacing: '0.04em',
            }}>
              {label}: {value}
            </span>
          ))}
        </div>
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

        {/* Inspect button */}
        {onInspect && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onInspect(); }}
            title="Inspect policy details"
            style={{
              background: 'none',
              border: `1px solid ${S.rim}`,
              cursor: 'pointer',
              padding: '3px 5px',
              color: S.tertiary,
              display: 'flex', alignItems: 'center',
              borderRadius: 2,
              transition: 'all 0.1s',
            }}
          >
            <Eye size={10} />
          </button>
        )}
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

  // LOG-POLICY-1: Policy audit history drawer
  const [historyDrawer, setHistoryDrawer] = useState<{ id: string; name: string; code: string } | null>(null);

  // Detail drawer state
  const [detailDrawer, setDetailDrawer] = useState<{ preset: PolicyPreset; dbTemplate: PolicyTemplate | null } | null>(null);

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

  // L-04: Activation confirmation modal state
  const [activationModal, setActivationModal] = useState<{
    template: { id: string; name: string; short_name?: string; config: unknown } | null;
    hash: string;
    preset?: PolicyPreset | null;
  }>({ template: null, hash: '', preset: null });
  const [modalHashCopied, setModalHashCopied] = useState(false);

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

  // L-04: Compute SHA-256 of policy config using Web Crypto API
  async function computePolicyHash(config: unknown): Promise<string> {
    const canonical = JSON.stringify(config, Object.keys(config as object).sort());
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // L-04: Execute the actual activation after modal confirmation
  const doActivateConfirmed = useCallback(async () => {
    const { template } = activationModal;
    if (!template || !token) return;
    setActivationModal({ template: null, hash: '', preset: null });
    setActivatingId(template.id);
    try {
      const inst = await activatePolicy(template.id, token);
      setActiveInstance(inst);
      showToast(`✓ Policy activated: [${template.short_name ?? template.id}] ${template.name}`);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast(`Activation failed: ${detail ?? String(e)}`);
    } finally {
      setActivatingId(null);
    }
  }, [activationModal, token, showToast]);

  // L-04: Open modal with computed hash instead of activating immediately
  const openActivationModal = useCallback(async (id: string, name: string, short_name: string | undefined, config: unknown, preset?: PolicyPreset | null) => {
    const hash = await computePolicyHash(config);
    setActivationModal({ template: { id, name, short_name, config }, hash, preset: preset ?? null });
  }, []);

  // Activate preset — looks up template, retries if not cached yet
  const handleActivate = useCallback(async (preset: PolicyPreset) => {
    if (!token) return;

    const doActivate = async (templates: PolicyTemplate[]) => {
      const dbTmpl = templates.find(t => t.short_name === preset.shortName);
      if (!dbTmpl) {
        showToast(`Template "${preset.shortName}" not found. Run policy seed or contact admin.`);
        return;
      }
      // L-04: Show confirmation modal with hash instead of activating immediately
      await openActivationModal(dbTmpl.id, preset.name, preset.shortName, dbTmpl.config, preset);
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
  }, [token, dbTemplates, showToast, openActivationModal]);

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

  // Build a PolicyPreset from a saved template (for detail drawer)
  const buildPresetFromTemplate = useCallback((tmpl: PolicyTemplate): PolicyPreset | null => {
    // Try to find matching system preset first
    const match = POLICY_PRESETS.find(p => p.shortName === tmpl.short_name);
    if (match) return match;
    // Build minimal preset from template data
    const config = tmpl.config as {
      hedge_ratios?: { confirmed?: number; forecast?: number };
      cost_assumptions?: { spread_bps?: number };
      execution_product?: string;
      min_trade_size_usd?: number;
      bucket_mode?: string;
    } | undefined;
    if (!config) return null;
    return {
      id: tmpl.id,
      name: tmpl.name,
      shortName: tmpl.short_name ?? '',
      description: tmpl.description ?? '',
      targetAudience: '',
      riskPosture: (tmpl.risk_posture === 'CONSERVATIVE' || tmpl.risk_posture === 'MODERATE' || tmpl.risk_posture === 'AGGRESSIVE') ? tmpl.risk_posture : 'MODERATE',
      category: (tmpl.category === 'CORPORATE' || tmpl.category === 'FINANCIAL' || tmpl.category === 'SOVEREIGN' || tmpl.category === 'SECTOR') ? tmpl.category : 'CORPORATE',
      formula: '',
      formulaExplain: '',
      rationale: '',
      policy: {
        bucket_mode: (config.bucket_mode as 'CALENDAR_MONTH') ?? 'CALENDAR_MONTH',
        hedge_ratios: { confirmed: config.hedge_ratios?.confirmed ?? 0.8, forecast: config.hedge_ratios?.forecast ?? 0.5 },
        cost_assumptions: { spread_bps: config.cost_assumptions?.spread_bps ?? 5 },
        execution_product: (config.execution_product as 'NDF' | 'FWD') ?? 'NDF',
        min_trade_size_usd: config.min_trade_size_usd ?? 0,
      },
      maturity_profile: 'MEDIUM',
      governance_tier: 'STANDARD',
      evidence_grade: 'BASIC',
      accounting_mode: 'NONE',
    };
  }, []);

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
            + NEW POLICY
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
                onInspect={() => setDetailDrawer({ preset, dbTemplate: dbTmpl ?? null })}
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
                CUSTOM POLICIES ({savedTemplates.length})
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
                  {/* Inspect button */}
                  <button
                    type="button"
                    onClick={() => {
                      const p = buildPresetFromTemplate(tmpl);
                      if (p) setDetailDrawer({ preset: p, dbTemplate: tmpl });
                    }}
                    title="Inspect"
                    style={{
                      fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em',
                      padding: '3px 8px',
                      border: `1px solid ${S.rim}`,
                      color: S.tertiary, background: 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <Eye size={10} />
                    INSPECT
                  </button>
                  {/* LOG-POLICY-1: History button */}
                  <button
                    type="button"
                    onClick={() => setHistoryDrawer({ id: tmpl.id, name: tmpl.name, code: tmpl.short_name })}
                    title="View audit history"
                    style={{
                      fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.06em',
                      padding: '3px 8px',
                      border: `1px solid ${S.rim}`,
                      color: S.tertiary, background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    HISTORY
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const matchedPreset = POLICY_PRESETS.find(p => p.shortName === tmpl.short_name) ?? null;
                      openActivationModal(tmpl.id, tmpl.name, tmpl.short_name, tmpl.config, matchedPreset);
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

      {/* ── LOG-POLICY-1: Audit history drawer ── */}
      {historyDrawer && (
        <PolicyRevisionDrawer
          templateId={historyDrawer.id}
          templateName={historyDrawer.name}
          templateCode={historyDrawer.code}
          token={token ?? undefined}
          onClose={() => setHistoryDrawer(null)}
        />
      )}

      {/* ── L-04: Policy Activation Confirmation Modal ── */}
      {activationModal.template && (
        <div
          onClick={() => setActivationModal({ template: null, hash: '', preset: null })}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderTop: `2px solid ${S.amber}`,
              padding: '24px 28px',
              minWidth: 460,
              maxWidth: 540,
              boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
            }}
          >
            {/* Modal title */}
            <div style={{
              fontFamily: S.fontMono, fontSize: '0.6875rem', fontWeight: 700,
              letterSpacing: '0.12em', color: S.amber, marginBottom: 18,
            }}>
              POLICY ACTIVATION CONFIRMATION
            </div>

            {/* Template identity */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: '0.5rem', letterSpacing: '0.08em',
                color: S.tertiary, marginBottom: 4,
              }}>
                TEMPLATE NAME
              </div>
              <div style={{
                fontFamily: S.fontUI, fontSize: '0.875rem', fontWeight: 600, color: S.primary,
              }}>
                {activationModal.template.name}
              </div>
              {activationModal.template.short_name && (
                <div style={{
                  fontFamily: S.fontMono, fontSize: '0.625rem', color: S.tertiary,
                  letterSpacing: '0.06em', marginTop: 2,
                }}>
                  {activationModal.template.short_name}
                </div>
              )}
            </div>

            {/* Hash display */}
            <div style={{
              background: S.bgDeep,
              border: `1px solid ${S.rim}`,
              borderLeft: `3px solid ${S.cyan}`,
              padding: '10px 12px',
              marginBottom: 14,
            }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: '0.5rem', letterSpacing: '0.08em',
                color: S.tertiary, marginBottom: 6,
              }}>
                CONFIG HASH
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.cyan,
                  letterSpacing: '0.04em', wordBreak: 'break-all' as const, flex: 1,
                }}>
                  {activationModal.hash.slice(0, 16)}…{activationModal.hash.slice(-8)}
                </span>
                <button
                  type="button"
                  aria-label="Copy config hash"
                  onClick={() => {
                    navigator.clipboard.writeText(activationModal.hash).catch(() => null);
                    setModalHashCopied(true);
                    setTimeout(() => setModalHashCopied(false), 1500);
                  }}
                  style={{
                    fontFamily: S.fontMono, fontSize: '0.5rem', letterSpacing: '0.06em',
                    padding: '2px 6px',
                    border: `1px solid ${S.rim}`,
                    color: modalHashCopied ? S.green : S.tertiary,
                    background: 'transparent',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'color 0.2s',
                  }}
                >
                  {modalHashCopied ? 'COPIED ✓' : 'COPY'}
                </button>
              </div>
            </div>

            {/* Governance tier badge */}
            {(() => {
              const govTier = activationModal.preset?.governance_tier ?? 'STANDARD';
              const govColor = govTier === 'COMMITTEE' ? S.red : govTier === 'ENHANCED' ? S.amber : S.green;
              const govLabel = govTier === 'COMMITTEE'
                ? 'Requires committee approval before activation'
                : govTier === 'ENHANCED'
                ? 'Requires documented review before activation'
                : 'Single operator can activate';
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                  padding: '6px 10px',
                  background: `color-mix(in srgb, ${govColor} 6%, ${S.bgSub})`,
                  border: `1px solid color-mix(in srgb, ${govColor} 25%, transparent)`,
                }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.08em',
                    padding: '1px 6px', fontWeight: 700,
                    border: `1px solid ${govColor}`, color: govColor,
                  }}>
                    {govTier}
                  </span>
                  <span style={{ fontFamily: S.fontUI, fontSize: '0.625rem', color: S.secondary }}>
                    {govLabel}
                  </span>
                </div>
              );
            })()}

            {/* Effect surface — fields consumed by hedge engine */}
            {(() => {
              const cfg = activationModal.template?.config as {
                hedge_ratios?: { confirmed?: number; forecast?: number };
                cost_assumptions?: { spread_bps?: number };
                execution_product?: string;
                bucket_mode?: string;
                min_trade_size_usd?: number;
              } | undefined;
              const govTier = activationModal.preset?.governance_tier ?? 'STANDARD';
              return (
                <>
                  <div style={{
                    background: S.bgDeep, border: `1px solid ${S.rim}`,
                    borderLeft: `3px solid ${S.cyan}`, padding: '8px 12px', marginBottom: 10,
                  }}>
                    <div style={{
                      fontFamily: S.fontMono, fontSize: '0.4375rem', letterSpacing: '0.1em',
                      color: S.cyan, marginBottom: 6, fontWeight: 700,
                    }}>
                      EFFECT SURFACE — FIELDS CONSUMED BY HEDGE ENGINE
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                      {[
                        { label: 'CONFIRMED RATIO', value: cfg?.hedge_ratios?.confirmed != null ? `${Math.round(cfg.hedge_ratios.confirmed * 100)}%` : '—' },
                        { label: 'FORECAST RATIO', value: cfg?.hedge_ratios?.forecast != null ? `${Math.round(cfg.hedge_ratios.forecast * 100)}%` : '—' },
                        { label: 'SPREAD', value: cfg?.cost_assumptions?.spread_bps != null ? `${cfg.cost_assumptions.spread_bps} bps` : '—' },
                        { label: 'EXECUTION PRODUCT', value: cfg?.execution_product ?? '—' },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', color: S.tertiary, letterSpacing: '0.06em' }}>{label}</span>
                          <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', fontWeight: 700, color: S.primary }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Metadata — does not affect hedge calculation */}
                  <div style={{
                    background: S.bgDeep, border: `1px solid ${S.rim}`,
                    borderLeft: `3px solid ${S.soft}`, padding: '8px 12px', marginBottom: 14,
                  }}>
                    <div style={{
                      fontFamily: S.fontMono, fontSize: '0.4375rem', letterSpacing: '0.1em',
                      color: S.tertiary, marginBottom: 6, fontWeight: 700,
                    }}>
                      METADATA — DOES NOT AFFECT HEDGE CALCULATION
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                      {[
                        { label: 'BUCKET MODE', value: cfg?.bucket_mode ?? '—' },
                        { label: 'MIN TRADE SIZE', value: cfg?.min_trade_size_usd != null ? (cfg.min_trade_size_usd === 0 ? 'None' : `$${cfg.min_trade_size_usd.toLocaleString()}`) : '—' },
                        { label: 'GOVERNANCE TIER', value: govTier },
                        { label: 'MATURITY PROFILE', value: activationModal.preset?.maturity_profile ?? '—' },
                        { label: 'ACCOUNTING MODE', value: activationModal.preset?.accounting_mode ?? '—' },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', color: S.tertiary, letterSpacing: '0.06em' }}>{label}</span>
                          <span style={{ fontFamily: S.fontMono, fontSize: '0.6875rem', color: S.secondary }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Warning text — governance-tier aware */}
            {(() => {
              const govTier = activationModal.preset?.governance_tier ?? 'STANDARD';
              if (govTier === 'COMMITTEE') {
                return (
                  <div style={{
                    fontFamily: S.fontUI, fontSize: '0.6875rem', color: S.secondary,
                    lineHeight: 1.55, marginBottom: 22, padding: '8px 10px',
                    background: `color-mix(in srgb, ${S.red} 5%, ${S.bgSub})`,
                    border: `1px solid color-mix(in srgb, ${S.red} 20%, transparent)`,
                  }}>
                    This policy template requires COMMITTEE-LEVEL governance. Do not activate without written committee approval on file.
                  </div>
                );
              }
              if (govTier === 'ENHANCED') {
                return (
                  <div style={{
                    fontFamily: S.fontUI, fontSize: '0.6875rem', color: S.secondary,
                    lineHeight: 1.55, marginBottom: 22, padding: '8px 10px',
                    background: `color-mix(in srgb, ${S.amber} 5%, ${S.bgSub})`,
                    border: `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`,
                  }}>
                    This policy template has ENHANCED governance. Verify that documented review has been completed before activation.
                  </div>
                );
              }
              return (
                <div style={{
                  fontFamily: S.fontUI, fontSize: '0.6875rem', color: S.secondary,
                  lineHeight: 1.55, marginBottom: 22, padding: '8px 10px',
                  background: `color-mix(in srgb, ${S.amber} 5%, ${S.bgSub})`,
                  border: `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`,
                }}>
                  Verify this hash matches your approved policy document before proceeding.
                </div>
              );
            })()}

            {/* Action buttons */}
            {(() => {
              const govTier = activationModal.preset?.governance_tier ?? 'STANDARD';
              const btnColor = govTier === 'COMMITTEE' ? S.amber : S.cyan;
              const btnLabel = govTier === 'COMMITTEE'
                ? 'CONFIRM — COMMITTEE APPROVED'
                : govTier === 'ENHANCED'
                ? 'CONFIRM — REVIEW VERIFIED'
                : 'CONFIRM ACTIVATION';
              return (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setActivationModal({ template: null, hash: '', preset: null })}
                    style={{
                      fontFamily: S.fontMono, fontSize: '0.625rem', letterSpacing: '0.06em',
                      padding: '6px 16px',
                      border: `1px solid ${S.rim}`,
                      color: S.tertiary, background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    onClick={doActivateConfirmed}
                    style={{
                      fontFamily: S.fontMono, fontSize: '0.625rem', letterSpacing: '0.08em',
                      fontWeight: 700,
                      padding: '6px 18px',
                      border: `1px solid ${btnColor}`,
                      color: S.bgDeep, background: btnColor,
                      cursor: 'pointer',
                    }}
                  >
                    {btnLabel}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
    <HelpPanelV2 module={POLICIES_HELP} storageKey="policy-library" />

    {/* ── Policy detail drawer ── */}
    {detailDrawer && (
      <PolicyDetailDrawer
        preset={detailDrawer.preset}
        dbTemplate={detailDrawer.dbTemplate}
        token={token ?? undefined}
        onClose={() => setDetailDrawer(null)}
        onOpenAudit={(id, name, code) => {
          setDetailDrawer(null);
          setHistoryDrawer({ id, name, code });
        }}
      />
    )}
    </div>
  );
}
