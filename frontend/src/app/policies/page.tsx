"use client";

/**
 * Policy Engine Page — /policies
 *
 * Shows all 33 system policy presets in a card grid organized by category.
 * Allows users to activate a preset as the company-wide hedge policy.
 * Provides a "+ New Policy" wizard powered by Claude AI (3 recommendations).
 * Admin users can publish custom policies company-wide.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Sparkles, Plus, Check, Zap, Shield, BarChart2, Globe, Search, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { POLICY_PRESETS } from "@/constants/policyPresets";
import type { PolicyPreset } from "@/constants/policyPresets";
import {
  listPolicyTemplates,
  getActivePolicy,
  activatePolicy,
  type PolicyTemplate,
  type PolicyInstance,
} from "@/api/policyClient";
import PolicyWizardModal from "@/components/policies/PolicyWizardModal";
import type { PolicyConfig } from "@/api/types";
import Toast from "@/components/shared/Toast";

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

// ── Category config ───────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'ALL',       label: 'All Policies', icon: Shield },
  { key: 'CORPORATE', label: 'Corporate',    icon: BarChart2 },
  { key: 'FINANCIAL', label: 'Financial',    icon: Zap },
  { key: 'SOVEREIGN', label: 'Sovereign',    icon: Globe },
  { key: 'SECTOR',    label: 'Sector',       icon: Search },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

// ── Risk posture styling ──────────────────────────────────────────────────────
function riskColor(posture: PolicyPreset['riskPosture']): string {
  if (posture === 'CONSERVATIVE') return S.green;
  if (posture === 'AGGRESSIVE')   return S.red;
  return S.amber;
}

// ── Preset Card ───────────────────────────────────────────────────────────────
interface PresetCardProps {
  preset: PolicyPreset;
  isActive: boolean;
  isActivating: boolean;
  onActivate: (preset: PolicyPreset) => void;
}

function PresetCard({ preset, isActive, isActivating, onActivate }: PresetCardProps) {
  const [hovered, setHovered] = useState(false);
  const risk = preset.riskPosture;
  const rc   = riskColor(risk);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1.5px solid ${isActive ? S.cyan : hovered ? S.soft : S.rim}`,
        background: isActive ? `color-mix(in srgb, ${S.cyan} 5%, ${S.bgPanel})` : S.bgPanel,
        borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 0,
        transition: 'border-color 0.15s', overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Active indicator strip */}
      {isActive && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: S.cyan }} />
      )}

      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.rim}`, background: S.bgDeep }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', letterSpacing: '0.08em', color: S.tertiary }}>{preset.category}</span>
          <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', padding: '1px 5px', borderRadius: 2, background: `color-mix(in srgb, ${rc} 12%, transparent)`, color: rc, letterSpacing: '0.06em' }}>
            {risk}
          </span>
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: '0.8125rem', fontWeight: 600, color: S.primary, lineHeight: 1.3 }}>{preset.name}</div>
        <div style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', color: S.tertiary, letterSpacing: '0.05em', marginTop: 2 }}>{preset.shortName}</div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontFamily: S.fontUI, fontSize: '0.625rem', color: S.secondary, lineHeight: 1.5, margin: 0, flex: 1 }}>
          {preset.description.slice(0, 100)}{preset.description.length > 100 ? '…' : ''}
        </p>

        {/* Parameters grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
          {[
            { label: 'CONF', value: `${Math.round(preset.policy.hedge_ratios.confirmed * 100)}%` },
            { label: 'FCST', value: `${Math.round(preset.policy.hedge_ratios.forecast  * 100)}%` },
            { label: 'SPRD', value: `${preset.policy.cost_assumptions.spread_bps} bps` },
            { label: 'PROD', value: preset.policy.execution_product },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: '0.4rem', color: S.tertiary, letterSpacing: '0.06em' }}>{label}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', fontWeight: 700, color: S.primary }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer action */}
      <div style={{ padding: '8px 12px', borderTop: `1px solid ${S.rim}`, background: S.bgSub }}>
        {isActive ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Check size={11} color={S.cyan} />
            <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', color: S.cyan, letterSpacing: '0.06em' }}>ACTIVE POLICY</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onActivate(preset)}
            disabled={isActivating}
            style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', letterSpacing: '0.06em', padding: '3px 10px', border: `1px solid ${hovered ? S.cyan : S.rim}`, color: hovered ? S.cyan : S.tertiary, background: 'transparent', cursor: isActivating ? 'not-allowed' : 'pointer', transition: 'all 0.12s' }}
          >
            {isActivating ? 'ACTIVATING…' : 'ACTIVATE POLICY'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────
export default function PoliciesPage() {
  const { token, user } = useAuth();
  const isAdmin = user?.roles?.some(r => ['admin', 'cfo', 'ceo'].includes(r)) ?? false;

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('ALL');
  const [searchQuery, setSearchQuery]         = useState('');
  const [wizardOpen, setWizardOpen]           = useState(false);

  // Active policy state
  const [activeInstance, setActiveInstance]       = useState<PolicyInstance | null>(null);
  const [activatingId, setActivatingId]           = useState<string | null>(null);
  const [activateMsg, setActivateMsg]             = useState('');
  const [dbTemplates, setDbTemplates]             = useState<PolicyTemplate[]>([]);

  // Toast
  const [toastMsg, setToastMsg]         = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const showToast = (msg: string) => { setToastMsg(msg); setToastVisible(true); };

  // Load active policy + templates on mount
  useEffect(() => {
    if (!token || token.startsWith('demo_token_')) return;
    getActivePolicy(token).then(inst => setActiveInstance(inst)).catch(() => {});
    listPolicyTemplates(token).then(setDbTemplates).catch(() => {});
  }, [token]);

  // Determine which preset ID is currently active
  const activePresetId = useMemo(() => {
    if (!activeInstance?.template) return null;
    const tmpl = activeInstance.template;
    return POLICY_PRESETS.find(p => p.shortName === tmpl.short_name)?.id ?? null;
  }, [activeInstance]);

  // Handle activate preset
  const handleActivate = useCallback(async (preset: PolicyPreset) => {
    if (!token) return;
    const dbTmpl = dbTemplates.find(t => t.short_name === preset.shortName);
    if (!dbTmpl) { showToast('Template not found in database'); return; }
    setActivatingId(preset.id);
    setActivateMsg('');
    try {
      const inst = await activatePolicy(dbTmpl.id, token);
      setActiveInstance(inst);
      showToast(`Policy activated: ${preset.shortName}`);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      showToast(`Error: ${(e as any)?.response?.data?.detail ?? String(e)}`);
    } finally {
      setActivatingId(null);
    }
  }, [token, dbTemplates]);

  // Filter presets
  const filteredPresets = useMemo(() => {
    let list = POLICY_PRESETS;
    if (activeCategory !== 'ALL') {
      list = list.filter(p => p.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.targetAudience.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeCategory, searchQuery]);

  // User-saved templates (non-system)
  const savedTemplates = useMemo(() =>
    dbTemplates.filter(t => !t.is_system),
  [dbTemplates]);

  // Handler when wizard saves a new policy
  const handleWizardSaved = useCallback((tmpl: PolicyTemplate) => {
    setDbTemplates(prev => [tmpl, ...prev]);
    showToast(`Policy saved: ${tmpl.name}`);
  }, []);

  // Handler when wizard applies to session
  const handleWizardApply = useCallback((_config: PolicyConfig) => {
    showToast('Policy applied to session — navigate to Position Desk to run simulation.');
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: S.bgDeep, fontFamily: S.fontUI }}>

      {/* ── Page header ── */}
      <div style={{
        borderBottom: `1px solid ${S.rim}`,
        background: S.bgPanel,
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={18} color={S.cyan} />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: '0.625rem', color: S.cyan, letterSpacing: '0.1em', fontWeight: 700 }}>
              POLICY ENGINE
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: '0.75rem', color: S.secondary, marginTop: 1 }}>
              Manage and activate FX hedge policies · {POLICY_PRESETS.length} system presets
            </div>
          </div>
        </div>

        {activePresetId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`, background: `color-mix(in srgb, ${S.cyan} 6%, transparent)` }}>
            <Check size={12} color={S.cyan} />
            <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', color: S.cyan, letterSpacing: '0.06em' }}>
              ACTIVE: {POLICY_PRESETS.find(p => p.id === activePresetId)?.shortName ?? 'POLICY'}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.08em', fontWeight: 700,
            padding: '7px 18px', border: `1px solid ${S.amber}`,
            color: 'var(--bg-deep)', background: S.amber,
            cursor: 'pointer',
          }}
        >
          <Sparkles size={13} />
          + NEW AI POLICY
        </button>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px' }}>

        {/* ── Filter bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Category tabs */}
          {CATEGORIES.map(({ key, label, icon: Icon }) => {
            const active = activeCategory === key;
            const count = key === 'ALL' ? POLICY_PRESETS.length : POLICY_PRESETS.filter(p => p.category === key).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCategory(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: S.fontMono, fontSize: '0.5rem', letterSpacing: '0.06em',
                  padding: '5px 12px', border: `1px solid ${active ? S.cyan : S.rim}`,
                  color: active ? S.cyan : S.tertiary,
                  background: active ? `color-mix(in srgb, ${S.cyan} 8%, ${S.bgPanel})` : 'transparent',
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                <Icon size={11} />
                {label}
                <span style={{ opacity: 0.6, fontSize: '0.4rem' }}>({count})</span>
              </button>
            );
          })}

          {/* Search */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${S.rim}`, background: S.bgPanel, padding: '5px 10px' }}>
            <Search size={11} color={S.tertiary} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search policies…"
              style={{ border: 'none', background: 'transparent', color: S.primary, fontFamily: S.fontUI, fontSize: '0.75rem', outline: 'none', width: 160 }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.tertiary, padding: 0, display: 'flex', alignItems: 'center' }}>
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* ── Preset grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginBottom: 24 }}>
          {filteredPresets.map(preset => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isActive={preset.id === activePresetId}
              isActivating={activatingId === preset.id}
              onActivate={handleActivate}
            />
          ))}
          {filteredPresets.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 0', fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.tertiary, letterSpacing: '0.06em' }}>
              NO POLICIES MATCH YOUR SEARCH
            </div>
          )}
        </div>

        {/* ── Saved / Custom policies ── */}
        {savedTemplates.length > 0 && (
          <div style={{ borderTop: `1px solid ${S.rim}`, paddingTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Sparkles size={14} color={S.amber} />
              <span style={{ fontFamily: S.fontMono, fontSize: '0.5rem', letterSpacing: '0.1em', color: S.amber, fontWeight: 700 }}>
                CUSTOM POLICIES ({savedTemplates.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {savedTemplates.map(tmpl => (
                <div key={tmpl.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: `1px solid ${S.rim}`, background: S.bgPanel }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: S.fontUI, fontSize: '0.8125rem', fontWeight: 600, color: S.primary }}>{tmpl.name}</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', color: S.tertiary, letterSpacing: '0.05em', marginTop: 2 }}>
                      {tmpl.short_name} · {tmpl.category} · {tmpl.risk_posture}
                    </div>
                  </div>
                  {isAdmin && (
                    <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem', padding: '1px 5px', border: `1px solid ${S.amber}`, color: S.amber, letterSpacing: '0.06em' }}>
                      ADMIN
                    </span>
                  )}
                  <div style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.tertiary }}>
                    Conf: {Math.round(tmpl.config.hedge_ratios.confirmed * 100)}% · Fcst: {Math.round(tmpl.config.hedge_ratios.forecast * 100)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activate message */}
        {activateMsg && (
          <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: '0.5rem', color: activateMsg.startsWith('✓') ? S.green : S.red, letterSpacing: '0.04em' }}>
            {activateMsg}
          </div>
        )}
      </div>

      {/* ── Policy Wizard Modal ── */}
      <PolicyWizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        token={token ?? undefined}
        onApply={handleWizardApply}
        onSaved={handleWizardSaved}
      />

      <Toast message={toastMsg} visible={toastVisible} onClose={() => setToastVisible(false)} />
    </div>
  );
}
