"use client";

/**
 * saved-policies/page.tsx
 * ORDR Terminal -- My Saved Policies
 *
 * Route: /saved-policies
 * Module: Policy Engine > My Saved Policies
 *
 * Card-grid view of user-created, branch, and company-wide policy templates.
 * Tabs: My Policies | Branch Policies | Company-wide
 *
 * All action buttons (Activate, Edit, Duplicate, Delete, Deactivate) are fully
 * wired to the policyClient API with optimistic UI and inline feedback.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import EmptyState from "../../components/ui/EmptyState";
import Link from "next/link";
import { Bookmark, Download, Upload } from "lucide-react";
import {
  listPolicyTemplates,
  getActivePolicy,
  activatePolicy,
  deactivatePolicy,
  updatePolicyTemplate,
  deletePolicyTemplate,
  duplicatePolicyTemplate,
  listFavorites,
  addFavorite,
  removeFavorite,
  exportPolicyTemplate,
  importPolicyTemplate,
} from "../../api/policyClient";
import type { PolicyTemplate, PolicyInstance, UpdateTemplatePayload, PolicyFavorite } from "../../api/policyClient";
import HelpPanel from "@/components/layout/HelpPanel";
import { SAVED_POLICIES_HELP } from "@/lib/helpContent";
import { POLICY_PRESETS } from "@/constants/policyPresets";
import PolicyRevisionDrawer from "@/components/policy/PolicyRevisionDrawer";
import PolicyDetailDrawer from "@/components/policy/PolicyDetailDrawer";
import type { PolicyPreset } from "@/constants/policyPresets";

// -- Hydration-safe timestamp hook ------------------------------------------------
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

// -- Design tokens ----------------------------------------------------------------
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  pass:     "var(--status-pass)",
  fail:     "var(--accent-red,#B91C1C)",
} as const;

// -- Toast notification types -----------------------------------------------------
interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

// -- Badge helper -----------------------------------------------------------------
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
      color, background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding: "1px 5px", borderRadius: 2, textTransform: "uppercase" as const,
    }}>
      {label}
    </span>
  );
}

// -- Types ------------------------------------------------------------------------
interface InstrumentAlloc {
  name: string;
  pct: number;
  color: string;
}

// Display-layer policy shape — mapped from PolicyTemplate API responses
interface DemoPolicy {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  isSystem: boolean;
  riskPosture: "LOW" | "MODERATE" | "HIGH";
  riskPostureRaw: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  category: "CORPORATE" | "FINANCIAL" | "SOVEREIGN" | "SECTOR";
  hedgeRatio: number;
  instruments: InstrumentAlloc[];
  premiumBudget: string;
  varCoverage: string;
  created: string;
  lastModified?: string;
  publishedBy?: string;
  branch?: string;
  setBy?: string;
  mandatory?: boolean;
}

// Instrument colour palette for API-sourced templates (cycled by index)
const INST_COLORS = [
  "var(--accent-cyan)",
  "var(--accent-amber)",
  "var(--status-pass)",
  "var(--accent-red,#B91C1C)",
  "#93C5FD",
  "#f472b6",
];

/**
 * Map a PolicyTemplate from the API onto the DemoPolicy display shape.
 */
function templateToDisplay(
  t: PolicyTemplate,
  activeInstanceId: string | null,
): DemoPolicy {
  const cfg = t.config as unknown as Record<string, unknown>;

  const hedgeRatio =
    typeof cfg.hedge_ratio === "number"
      ? Math.round(cfg.hedge_ratio * 100)
      : typeof cfg.hedgeRatio === "number"
      ? Math.round((cfg.hedgeRatio as number) * 100)
      : 0;

  type RawInst = { name?: string; allocation_pct?: number; pct?: number };
  const rawInsts = Array.isArray(cfg.instruments) ? (cfg.instruments as RawInst[]) : [];
  const instruments: InstrumentAlloc[] = rawInsts.map((inst, i) => ({
    name: inst.name ?? `Instrument ${i + 1}`,
    pct: Math.round(
      typeof inst.allocation_pct === "number"
        ? inst.allocation_pct * 100
        : typeof inst.pct === "number"
        ? inst.pct
        : 0
    ),
    color: INST_COLORS[i % INST_COLORS.length],
  }));

  const premiumBudget =
    typeof cfg.premium_budget === "number"
      ? `${((cfg.premium_budget as number) * 100).toFixed(2)}% of notional`
      : typeof cfg.premiumBudget === "string"
      ? (cfg.premiumBudget as string)
      : "—";

  const varCoverage =
    typeof cfg.var_coverage === "string"
      ? (cfg.var_coverage as string)
      : typeof cfg.varCoverage === "string"
      ? (cfg.varCoverage as string)
      : "—";

  const riskMap: Record<string, "LOW" | "MODERATE" | "HIGH"> = {
    CONSERVATIVE: "LOW",
    MODERATE: "MODERATE",
    AGGRESSIVE: "HIGH",
  };
  const riskPosture: "LOW" | "MODERATE" | "HIGH" = riskMap[t.risk_posture] ?? "MODERATE";

  return {
    id: t.id,
    code: t.short_name,
    name: t.name,
    description: t.description,
    active: t.id === activeInstanceId,
    isSystem: t.is_system,
    riskPosture,
    riskPostureRaw: t.risk_posture,
    category: t.category,
    hedgeRatio,
    instruments,
    premiumBudget,
    varCoverage,
    created: t.created_at.slice(0, 10),
  };
}

// -- Risk posture colors ----------------------------------------------------------
function riskColor(posture: DemoPolicy["riskPosture"]): string {
  if (posture === "LOW") return S.pass;
  if (posture === "HIGH") return S.fail;
  return S.amber;
}

// -- Tabs -------------------------------------------------------------------------
const TABS = [
  { key: "my",        label: "My Policies" },
  { key: "branch",    label: "Branch Policies" },
  { key: "company",   label: "Company-wide" },
  { key: "favorites", label: "Favorites" },
] as const;

type TabKey = typeof TABS[number]["key"];

// -- Sort options -----------------------------------------------------------------
const SORT_OPTIONS = [
  { key: "name",    label: "Name" },
  { key: "created", label: "Date Created" },
  { key: "risk",    label: "Risk Level" },
] as const;

type SortKey = typeof SORT_OPTIONS[number]["key"];

const RISK_ORDER: Record<string, number> = { LOW: 0, MODERATE: 1, HIGH: 2 };

function sortPolicies(list: DemoPolicy[], sortKey: SortKey): DemoPolicy[] {
  const sorted = [...list];
  if (sortKey === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortKey === "created") sorted.sort((a, b) => b.created.localeCompare(a.created));
  else if (sortKey === "risk") sorted.sort((a, b) => (RISK_ORDER[a.riskPosture] ?? 1) - (RISK_ORDER[b.riskPosture] ?? 1));
  return sorted;
}

// -- Build a PolicyPreset from template data for the detail drawer ----------------
function buildPresetFromTemplate(tmpl: PolicyTemplate | DemoPolicy): PolicyPreset {
  const shortName = typeof tmpl === 'object' && 'short_name' in tmpl
    ? (tmpl as PolicyTemplate).short_name
    : ('code' in tmpl ? (tmpl as DemoPolicy).code : '');
  const match = POLICY_PRESETS.find(p => p.shortName === shortName);
  if (match) return match;

  const config = ('config' in tmpl ? tmpl.config : null) as Record<string, unknown> | null;
  const hr = (config?.hedge_ratios ?? {}) as Record<string, number>;
  const ca = (config?.cost_assumptions ?? {}) as Record<string, number>;
  return {
    id: ('id' in tmpl ? String(tmpl.id) : ''),
    name: ('name' in tmpl ? String(tmpl.name) : ''),
    shortName: shortName ?? '',
    description: ('description' in tmpl ? String(tmpl.description ?? '') : ''),
    targetAudience: '',
    riskPosture: 'MODERATE' as const,
    category: 'CORPORATE' as const,
    formula: '', formulaExplain: '', rationale: '',
    policy: {
      bucket_mode: 'CALENDAR_MONTH' as const,
      hedge_ratios: { confirmed: hr.confirmed ?? 0.8, forecast: hr.forecast ?? 0.5 },
      cost_assumptions: { spread_bps: ca.spread_bps ?? 5 },
      execution_product: (String(config?.execution_product ?? 'NDF')) as 'NDF' | 'FWD',
      min_trade_size_usd: Number(config?.min_trade_size_usd ?? 0),
    },
    maturity_profile: 'MEDIUM', governance_tier: 'STANDARD',
    evidence_grade: 'BASIC', accounting_mode: 'NONE',
  };
}

// -- Stacked bar component --------------------------------------------------------
function InstrumentBar({ instruments }: { instruments: InstrumentAlloc[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", height: 6, borderRadius: 1, overflow: "hidden" }}>
        {instruments.map((inst) => (
          <div
            key={inst.name}
            title={`${inst.name}: ${inst.pct}%`}
            style={{ width: `${inst.pct}%`, background: inst.color, transition: "width 0.2s" }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {instruments.map((inst) => (
          <div key={inst.name} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 6, height: 6, borderRadius: 1, background: inst.color, flexShrink: 0 }} />
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, letterSpacing: "0.03em" }}>
              {inst.name} {inst.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Toast renderer ---------------------------------------------------------------
function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 200,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
    }}>
      {toasts.map((t) => {
        const color = t.type === "success" ? S.pass : t.type === "error" ? S.fail : S.cyan;
        return (
          <div key={t.id} style={{
            pointerEvents: "auto",
            background: S.bgPanel,
            border: `1px solid ${color}`,
            borderLeft: `3px solid ${color}`,
            padding: "8px 14px",
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 260,
            maxWidth: 400,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            animation: "slideIn 0.15s ease-out",
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color }}>{
              t.type === "success" ? "✓" : t.type === "error" ? "✗" : "i"
            }</span>
            <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", color: S.primary, flex: 1 }}>{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: S.tertiary, padding: "0 2px", fontSize: 12 }}
            >✕</button>
          </div>
        );
      })}
      <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}

// -- Confirm Modal ----------------------------------------------------------------
interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ title, message, confirmLabel, danger, loading, onConfirm, onCancel }: ConfirmModalProps) {
  const confirmColor = danger ? S.fail : S.cyan;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.65)",
    }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{
        background: S.bgPanel, border: `1px solid ${confirmColor}`,
        borderRadius: 4, width: "min(440px, 94vw)", padding: "20px 24px",
      }}>
        <div style={{ fontFamily: S.fontUI, fontSize: "0.9375rem", fontWeight: 700, color: S.primary, marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, lineHeight: 1.6, marginBottom: 20 }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 600,
              padding: "6px 16px", border: `1px solid ${S.rim}`,
              color: S.secondary, background: "transparent", cursor: "pointer", borderRadius: 2,
            }}
          >CANCEL</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
              padding: "6px 16px", border: `1px solid ${confirmColor}`,
              color: danger ? "#fff" : S.bgDeep,
              background: confirmColor,
              cursor: loading ? "wait" : "pointer", borderRadius: 2, opacity: loading ? 0.7 : 1,
            }}
          >{loading ? "WORKING…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// -- Edit Policy Modal ------------------------------------------------------------
interface EditModalProps {
  policy: DemoPolicy;
  loading: boolean;
  onSave: (payload: UpdateTemplatePayload) => void;
  onCancel: () => void;
}

function EditPolicyModal({ policy, loading, onSave, onCancel }: EditModalProps) {
  const [name, setName] = useState(policy.name);
  const [shortName, setShortName] = useState(policy.code);
  const [description, setDescription] = useState(policy.description ?? "");
  const [riskPosture, setRiskPosture] = useState<"CONSERVATIVE" | "MODERATE" | "AGGRESSIVE">(policy.riskPostureRaw);
  const [hedgeRatioPct, setHedgeRatioPct] = useState(String(policy.hedgeRatio));

  const fieldStyle: React.CSSProperties = {
    width: "100%", fontFamily: S.fontUI, fontSize: "0.8125rem",
    color: S.primary, background: S.bgSub,
    border: `1px solid ${S.rim}`, padding: "6px 10px", borderRadius: 2,
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.08em",
    color: S.tertiary, textTransform: "uppercase", display: "block", marginBottom: 4,
  };

  function handleSave() {
    const hrNum = parseFloat(hedgeRatioPct);
    const payload: UpdateTemplatePayload = {
      name: name.trim() || undefined,
      short_name: shortName.trim() || undefined,
      description: description.trim() || undefined,
      risk_posture: riskPosture,
    };
    // Merge hedge_ratio into config if changed
    if (!isNaN(hrNum) && hrNum !== policy.hedgeRatio) {
      payload.config = {
        ...(policy as unknown as Record<string, unknown>),
        hedge_ratios: { confirmed: hrNum / 100, forecast: hrNum / 100 * 0.7 },
      } as unknown as typeof payload.config;
    }
    onSave(payload);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.65)",
    }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{
        background: S.bgPanel, border: `1px solid ${S.rim}`,
        borderRadius: 4, width: "min(520px, 96vw)",
        display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 20px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: S.fontUI, fontSize: "0.9375rem", fontWeight: 700, color: S.primary }}>
                Edit Policy
              </span>
              {/* UX-POLICY-1: explicit scope label so analysts know config changes require re-activation */}
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.4375rem", letterSpacing: "0.08em",
                padding: "2px 6px",
                border: `1px solid color-mix(in srgb, var(--accent-amber,#fbbf24) 35%, var(--border-rim))`,
                color: "var(--accent-amber,#fbbf24)", background: "transparent",
              }}>
                METADATA ONLY
              </span>
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary, letterSpacing: "0.06em", marginTop: 2 }}>
              {policy.code} · {policy.id.slice(0, 8).toUpperCase()} · Config changes require creating a new version
            </div>
          </div>
          <button onClick={onCancel} style={{
            background: "transparent", border: `1px solid ${S.rim}`,
            color: S.tertiary, padding: "3px 10px", cursor: "pointer",
            fontFamily: S.fontMono, fontSize: "0.75rem", borderRadius: 2,
          }}>✕</button>
        </div>

        {/* Form body */}
        <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Policy Name</label>
              <input value={name} onChange={e => setName(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Short Code</label>
              <input
                value={shortName}
                onChange={e => setShortName(e.target.value.toUpperCase().slice(0, 20))}
                style={{ ...fieldStyle, fontFamily: S.fontMono, letterSpacing: "0.04em" }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              style={{ ...fieldStyle, resize: "vertical" as const, lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Risk Posture</label>
              <select
                value={riskPosture}
                onChange={e => setRiskPosture(e.target.value as typeof riskPosture)}
                style={{ ...fieldStyle, cursor: "pointer" }}
              >
                <option value="CONSERVATIVE">Conservative (Low)</option>
                <option value="MODERATE">Moderate</option>
                <option value="AGGRESSIVE">Aggressive (High)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Hedge Ratio (%)</label>
              <input
                type="number" min={0} max={100}
                value={hedgeRatioPct}
                onChange={e => setHedgeRatioPct(e.target.value)}
                style={{ ...fieldStyle, fontFamily: S.fontMono }}
              />
            </div>
          </div>

          {/* Regulatory note */}
          <div style={{
            padding: "8px 12px", background: `color-mix(in srgb, ${S.amber} 6%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`, borderRadius: 2,
            fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.secondary, lineHeight: 1.5,
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.amber, fontWeight: 700, letterSpacing: "0.07em", marginRight: 6 }}>NOTE</span>
            Editing a policy template creates a new version. Active instances referencing this template will not be retroactively changed.
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: `1px solid ${S.rim}`, background: S.bgSub,
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          <button onClick={onCancel} disabled={loading} style={{
            fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 600,
            padding: "6px 16px", border: `1px solid ${S.rim}`,
            color: S.secondary, background: "transparent", cursor: "pointer", borderRadius: 2,
          }}>CANCEL</button>
          <button
            onClick={handleSave}
            disabled={loading || !name.trim()}
            style={{
              fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
              padding: "6px 20px", border: `1px solid ${S.cyan}`,
              color: S.bgDeep, background: S.cyan,
              cursor: loading ? "wait" : "pointer", borderRadius: 2,
              opacity: loading || !name.trim() ? 0.6 : 1,
            }}
          >{loading ? "SAVING…" : "SAVE CHANGES"}</button>
        </div>
      </div>
    </div>
  );
}

// -- Policy card ------------------------------------------------------------------
interface PolicyCardProps {
  policy: DemoPolicy;
  showMeta?: boolean;
  actionLoading: string | null; // policy id currently being acted on
  onActivate: (p: DemoPolicy) => void;
  onDeactivate: (p: DemoPolicy) => void;
  onEdit: (p: DemoPolicy) => void;
  onDuplicate: (p: DemoPolicy) => void;
  onDelete: (p: DemoPolicy) => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  onExport?: () => void;
  onHistory?: () => void;  // LOG-POLICY-1
  onInspect?: () => void;
}

function PolicyCard({
  policy, showMeta, actionLoading,
  onActivate, onDeactivate, onEdit, onDuplicate, onDelete,
  isFavorited, onToggleFavorite, onExport, onHistory, onInspect,
}: PolicyCardProps) {
  const [hovered, setHovered] = useState(false);
  const rc = riskColor(policy.riskPosture);
  const isLoading = actionLoading === policy.id;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: policy.active
          ? `1.5px solid ${S.cyan}`
          : `1.5px solid ${hovered ? S.soft : S.rim}`,
        background: policy.active
          ? `color-mix(in srgb, ${S.cyan} 4%, ${S.bgPanel})`
          : S.bgPanel,
        borderRadius: 3,
        display: "flex",
        flexDirection: "column",
        transition: "border-color 0.15s",
        overflow: "hidden",
        position: "relative",
        boxShadow: policy.active ? `0 0 12px color-mix(in srgb, ${S.cyan} 15%, transparent)` : "none",
        opacity: isLoading ? 0.7 : 1,
      }}
    >
      {/* Active glow strip */}
      {policy.active && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: S.cyan }} />
      )}

      {/* Loading overlay shimmer */}
      {isLoading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 5,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.15)",
          pointerEvents: "none",
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.cyan, letterSpacing: "0.1em" }}>
            WORKING…
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.08em", fontWeight: 700, color: S.cyan }}>
            {policy.code}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {policy.active && <Badge label="ACTIVE" color={S.cyan} />}
            {policy.mandatory && <Badge label="MANDATORY" color={S.fail} />}
            {policy.isSystem && <Badge label="SYSTEM" color={S.tertiary} />}
            <Badge label={policy.riskPosture} color={rc} />
            {onToggleFavorite && (
              <button
                type="button"
                onClick={onToggleFavorite}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                  color: isFavorited ? S.amber : S.tertiary,
                  display: 'flex', alignItems: 'center',
                }}
                title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Bookmark size={11} fill={isFavorited ? S.amber : 'none'} />
              </button>
            )}
          </div>
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary, lineHeight: 1.3 }}>
          {policy.name}
        </div>
        {policy.description && (
          <div style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", color: S.tertiary, marginTop: 3, lineHeight: 1.4 }}>
            {policy.description.slice(0, 80)}{policy.description.length > 80 ? "…" : ""}
          </div>
        )}
      </div>

      {/* Body: config summary */}
      <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Mini data grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            { label: "HEDGE RATIO",   value: `${policy.hedgeRatio}%` },
            { label: "PREMIUM BUDGET", value: policy.premiumBudget },
            { label: "VaR COVERAGE",   value: policy.varCoverage },
            { label: "CREATED",        value: policy.created },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.08em", marginBottom: 1, textTransform: "uppercase" as const }}>
                {label}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary, fontWeight: 500 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Published by / Branch / Set by metadata */}
        {showMeta && policy.publishedBy && (
          <div style={{ display: "flex", gap: 12 }}>
            <div>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.08em" }}>PUBLISHED BY </span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary }}>{policy.publishedBy}</span>
            </div>
            {policy.branch && (
              <div>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.08em" }}>BRANCH </span>
                <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary }}>{policy.branch}</span>
              </div>
            )}
          </div>
        )}

        {/* Instrument allocation bar */}
        <InstrumentBar instruments={policy.instruments} />
      </div>

      {/* Footer: action buttons */}
      <div style={{
        padding: "8px 12px", borderTop: `1px solid ${S.rim}`, background: S.bgSub,
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      }}>
        {policy.active ? (
          <>
            <ActionBtn label="Edit" onClick={() => onEdit(policy)} disabled={isLoading || policy.isSystem} />
            <ActionBtn label="Deactivate" onClick={() => onDeactivate(policy)} disabled={isLoading} />
            <ActionBtn label="Duplicate" onClick={() => onDuplicate(policy)} disabled={isLoading} />
          </>
        ) : (
          <>
            <ActionBtn label="Activate" accent onClick={() => onActivate(policy)} disabled={isLoading} />
            <ActionBtn label="Edit" onClick={() => onEdit(policy)} disabled={isLoading || policy.isSystem} />
            <ActionBtn label="Duplicate" onClick={() => onDuplicate(policy)} disabled={isLoading} />
            <ActionBtn label="Delete" danger onClick={() => onDelete(policy)} disabled={isLoading || policy.isSystem} />
          </>
        )}
        {policy.isSystem && (
          <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, letterSpacing: "0.06em", marginLeft: 4 }}>
            READ-ONLY
          </span>
        )}
        {!policy.isSystem && onExport && (
          <button
            type="button"
            onClick={onExport}
            style={{
              fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.06em",
              padding: "3px 8px", border: `1px solid ${S.rim}`,
              color: S.tertiary, background: "transparent", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <Download size={9} /> EXPORT
          </button>
        )}
        {/* LOG-POLICY-1: Audit history */}
        {onHistory && (
          <button
            type="button"
            onClick={onHistory}
            title="View audit history"
            style={{
              fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.06em",
              padding: "3px 8px", border: `1px solid ${S.rim}`,
              color: S.tertiary, background: "transparent", cursor: "pointer",
            }}
          >
            HISTORY
          </button>
        )}
        {onInspect && (
          <button
            type="button"
            onClick={onInspect}
            title="Inspect policy detail"
            style={{
              fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.06em",
              padding: "3px 8px", border: `1px solid ${S.cyan}`,
              color: S.cyan, background: "transparent", cursor: "pointer",
            }}
          >
            INSPECT
          </button>
        )}
      </div>
    </div>
  );
}

// -- Small action button ----------------------------------------------------------
function ActionBtn({ label, accent, danger, onClick, disabled }: {
  label: string;
  accent?: boolean;
  danger?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  let color: string = S.tertiary;
  if (accent) color = S.cyan;
  if (danger) color = S.fail;
  if (hovered && !accent && !danger) color = S.secondary;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: S.fontMono,
        fontSize: "0.625rem",
        letterSpacing: "0.06em",
        fontWeight: 600,
        padding: "2px 8px",
        border: `1px solid ${disabled ? S.soft : hovered ? color : S.rim}`,
        color: disabled ? S.tertiary : color,
        background: hovered && !disabled ? `color-mix(in srgb, ${color} 6%, transparent)` : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.12s",
        borderRadius: 2,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label.toUpperCase()}
    </button>
  );
}

// -- Main page component ----------------------------------------------------------
export default function SavedPoliciesPage() {
  const _planAllowed = usePlanRedirect("professional");
  const { isAuthenticated, token, user } = useAuth();
  const router = useRouter();
  const renderTs = useRenderTs();
  const toastSeqRef = useRef(0);

  const [activeTab, setActiveTab] = useState<TabKey>("my");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");

  // API state
  const [policies, setPolicies] = useState<PolicyTemplate[]>([]);
  const [activeInstance, setActiveInstance] = useState<PolicyInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null); // policy id
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Favorites state
  const [favorites, setFavorites] = useState<PolicyFavorite[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // Import state
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    title: string; message: string; confirmLabel: string; danger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [editModal, setEditModal] = useState<DemoPolicy | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  // LOG-POLICY-1: Revision history drawer
  const [historyDrawer, setHistoryDrawer] = useState<{ id: string; name: string; code: string } | null>(null);
  // Policy detail drawer
  const [detailDrawer, setDetailDrawer] = useState<{ preset: PolicyPreset; dbTemplate: PolicyTemplate | null } | null>(null);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  // -- Toast helpers --------------------------------------------------------------
  const addToast = useCallback((type: Toast["type"], message: string) => {
    const id = ++toastSeqRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // -- Fetch policy templates + active instance on mount -------------------------
  const fetchPolicies = useCallback(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    setApiError(null);
    Promise.all([
      listPolicyTemplates(token ?? undefined).catch(() => [] as PolicyTemplate[]),
      getActivePolicy(token ?? undefined).catch(() => null),
    ]).then(([templates, active]) => {
      setPolicies(templates);
      setActiveInstance(active);
      setLoading(false);
    }).catch(() => {
      setApiError("Failed to load policies");
      setLoading(false);
    });
    // Load favorites in parallel (non-blocking)
    listFavorites(token ?? undefined).then(favs => {
      setFavorites(favs);
      setFavoriteIds(new Set(favs.map(f => f.template_id)));
    }).catch(() => {});
  }, [isAuthenticated, token]);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const activeTemplateId = activeInstance?.template_id ?? null;

  // -- Tab filtering + display mapping ------------------------------------------
  const tabPolicies = useMemo<DemoPolicy[]>(() => {
    let source: PolicyTemplate[];
    if (activeTab === "my") {
      source = policies.filter((t) => !t.is_system && t.company_id !== null);
    } else if (activeTab === "branch") {
      source = [];
    } else if (activeTab === "favorites") {
      // Build from favorites list which include full template data
      source = favorites
        .filter(f => f.template !== null)
        .map(f => f.template as PolicyTemplate);
    } else {
      source = policies.filter((t) => t.is_system);
    }
    return source.map((t) => templateToDisplay(t, activeTemplateId));
  }, [policies, activeTab, activeTemplateId, favorites]);

  const filteredPolicies = useMemo(() => {
    let source = tabPolicies;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      source = source.filter(p =>
        p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      );
    }
    return sortPolicies(source, sortBy);
  }, [tabPolicies, searchQuery, sortBy]);

  const showMeta = activeTab === "branch" || activeTab === "company";

  // -- Action handlers -----------------------------------------------------------

  /** Activate a policy template */
  const handleActivate = useCallback((policy: DemoPolicy) => {
    setConfirmModal({
      title: `Activate "${policy.name}"?`,
      message: `This will set "${policy.code}" as the active policy for your company. Any previously active policy will be deactivated.`,
      confirmLabel: "ACTIVATE POLICY",
      onConfirm: async () => {
        setConfirmLoading(true);
        setActionLoading(policy.id);
        try {
          const newInstance = await activatePolicy(policy.id, token ?? undefined);
          setActiveInstance(newInstance);
          addToast("success", `Policy "${policy.name}" activated successfully.`);
          setConfirmModal(null);
        } catch {
          addToast("error", `Failed to activate "${policy.name}". Please try again.`);
        } finally {
          setConfirmLoading(false);
          setActionLoading(null);
        }
      },
    });
  }, [token, addToast]);

  /** Deactivate the current active policy */
  const handleDeactivate = useCallback((policy: DemoPolicy) => {
    setConfirmModal({
      title: `Deactivate "${policy.name}"?`,
      message: `This will deactivate the currently active policy. Hedges will no longer reference a policy until a new one is activated.`,
      confirmLabel: "DEACTIVATE",
      danger: true,
      onConfirm: async () => {
        setConfirmLoading(true);
        setActionLoading(policy.id);
        try {
          await deactivatePolicy(token ?? undefined);
          setActiveInstance(null);
          addToast("success", `Policy "${policy.name}" deactivated.`);
          setConfirmModal(null);
        } catch {
          addToast("error", `Failed to deactivate. Please try again.`);
        } finally {
          setConfirmLoading(false);
          setActionLoading(null);
        }
      },
    });
  }, [token, addToast]);

  /** Open Edit modal */
  const handleEdit = useCallback((policy: DemoPolicy) => {
    setEditModal(policy);
  }, []);

  /** Save edited policy */
  const handleEditSave = useCallback(async (payload: UpdateTemplatePayload) => {
    if (!editModal) return;
    setEditLoading(true);
    setActionLoading(editModal.id);
    try {
      const updated = await updatePolicyTemplate(editModal.id, payload, token ?? undefined);
      setPolicies(prev => prev.map(p => p.id === updated.id ? updated : p));
      addToast("success", `Policy "${updated.name}" updated.`);
      setEditModal(null);
    } catch {
      addToast("error", "Failed to save changes. Please try again.");
    } finally {
      setEditLoading(false);
      setActionLoading(null);
    }
  }, [editModal, token, addToast]);

  /** Duplicate a policy */
  const handleDuplicate = useCallback(async (policy: DemoPolicy) => {
    // Find the original PolicyTemplate for the duplicate call
    const original = policies.find(p => p.id === policy.id);
    if (!original) return;
    setActionLoading(policy.id);
    try {
      const copy = await duplicatePolicyTemplate(original, token ?? undefined);
      setPolicies(prev => [copy, ...prev]);
      addToast("success", `Created "${copy.name}" as a copy of "${policy.name}".`);
      setActiveTab("my"); // Switch to My Policies to see the copy
    } catch {
      addToast("error", `Failed to duplicate "${policy.name}".`);
    } finally {
      setActionLoading(null);
    }
  }, [policies, token, addToast]);

  /** Show delete confirmation */
  const handleDelete = useCallback((policy: DemoPolicy) => {
    setConfirmModal({
      title: `Delete "${policy.name}"?`,
      message: `This action is irreversible. The policy template "${policy.code}" will be permanently removed. You cannot delete system templates or an active policy.`,
      confirmLabel: "DELETE PERMANENTLY",
      danger: true,
      onConfirm: async () => {
        setConfirmLoading(true);
        setActionLoading(policy.id);
        try {
          await deletePolicyTemplate(policy.id, token ?? undefined);
          setPolicies(prev => prev.filter(p => p.id !== policy.id));
          addToast("success", `Policy "${policy.name}" deleted.`);
          setConfirmModal(null);
        } catch {
          addToast("error", `Failed to delete "${policy.name}". Please try again.`);
        } finally {
          setConfirmLoading(false);
          setActionLoading(null);
        }
      },
    });
  }, [token, addToast]);

  if (!_planAllowed || !isAuthenticated) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: S.bgDeep }}>
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", overflowY: 'auto', minWidth: 0,
      fontFamily: S.fontUI, color: S.primary,
    }}>
      {/* -- TopBar (44px) -------------------------------------------------------- */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => router.push("/")}
          style={{
            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
            background: "transparent", border: `1px solid ${S.rim}`,
            padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
          }}
        >
          &larr; Home
        </button>
        <span style={{ color: S.rim, userSelect: "none" }}>|</span>
        <span style={{
          fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700,
          letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary,
        }}>
          My Saved Policies
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em",
          color: S.secondary, padding: "1px 5px", border: `1px solid ${S.rim}`,
        }}>
          POLICY ENGINE
        </span>
        {activeInstance && (
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.6875rem", padding: "1px 6px",
            border: `1px solid ${S.cyan}`, color: S.cyan,
            background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
          }}>
            ● ACTIVE: {policies.find(p => p.id === activeInstance.template_id)?.short_name ?? "—"}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.04em" }}>
          AS OF {renderTs}
        </span>
      </header>

      {/* -- Tab bar (36px) ------------------------------------------------------- */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        padding: "0 20px", height: 36, flexShrink: 0,
      }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.04em",
                padding: "0 14px", height: "100%", display: "flex", alignItems: "center",
                color: isActive ? S.cyan : S.tertiary,
                borderBottom: isActive ? `2px solid ${S.cyan}` : "2px solid transparent",
                borderTop: "none", borderLeft: "none", borderRight: "none",
                background: "transparent", cursor: "pointer", transition: "color 0.1s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {!loading && (
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.06em",
            color: S.tertiary, padding: "1px 6px", border: `1px solid ${S.rim}`,
          }}>
            {filteredPolicies.length} {filteredPolicies.length === 1 ? "policy" : "policies"}
          </span>
        )}
      </div>

      {/* -- Content area --------------------------------------------------------- */}
      <div style={{ flex: 1, maxWidth: 1440, width: "100%", margin: "0 auto", padding: "16px 24px" }}>

        {/* Top action bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <Link
            href="/ai-policy-wizard"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 700,
              padding: "6px 16px", border: `1px solid ${S.cyan}`,
              color: S.bgDeep, background: S.cyan,
              cursor: "pointer", textDecoration: "none", borderRadius: 2,
            }}
          >
            + CREATE NEW POLICY
          </Link>
          <>
            <input
              ref={importFileRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !token) return;
                setImporting(true);
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text) as Record<string, unknown>;
                  await importPolicyTemplate(parsed, undefined, undefined, token);
                  addToast("success", 'Policy imported successfully');
                  // Refresh templates
                  listPolicyTemplates(token).then(setPolicies).catch(() => {});
                } catch (err: unknown) {
                  addToast("error", `Import failed: ${(err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Invalid file'}`);
                } finally {
                  setImporting(false);
                  if (importFileRef.current) importFileRef.current.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => importFileRef.current?.click()}
              disabled={importing}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 600,
                padding: "6px 16px", border: `1px solid ${S.rim}`,
                color: S.secondary, background: "transparent",
                cursor: importing ? "not-allowed" : "pointer",
                borderRadius: 2, opacity: importing ? 0.7 : 1,
              }}
            >
              <Upload size={12} /> {importing ? 'IMPORTING…' : 'IMPORT POLICY'}
            </button>
          </>
          <div style={{ flex: 1 }} />
          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            border: `1px solid ${S.rim}`, background: S.bgPanel, padding: "5px 10px", borderRadius: 2,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={S.tertiary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search policies..."
              style={{
                border: "none", background: "transparent", color: S.primary,
                fontFamily: S.fontUI, fontSize: "0.75rem", outline: "none", width: 160,
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: S.tertiary, padding: 0, fontSize: "0.75rem", lineHeight: 1 }}
              >
                &times;
              </button>
            )}
          </div>
          {/* Sort */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary, letterSpacing: "0.06em" }}>SORT:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.04em",
                color: S.secondary, background: S.bgPanel,
                border: `1px solid ${S.rim}`, padding: "3px 8px",
                cursor: "pointer", outline: "none", borderRadius: 2,
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Card grid or empty state */}
        {loading ? (
          <div style={{
            textAlign: "center", padding: "48px 0",
            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.06em",
          }}>
            LOADING POLICIES…
          </div>
        ) : apiError ? (
          <div style={{ marginTop: 40 }}>
            <EmptyState
              type="error"
              title="Failed to Load Policies"
              message={apiError}
              action={{ label: "Retry", onClick: fetchPolicies }}
            />
          </div>
        ) : filteredPolicies.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
            {filteredPolicies.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                showMeta={showMeta}
                actionLoading={actionLoading}
                onActivate={handleActivate}
                onDeactivate={handleDeactivate}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                isFavorited={favoriteIds.has(policy.id)}
                onToggleFavorite={async () => {
                  if (!token) return;
                  if (favoriteIds.has(policy.id)) {
                    await removeFavorite(policy.id, token).catch(() => {});
                    setFavoriteIds(prev => { const next = new Set(prev); next.delete(policy.id); return next; });
                    setFavorites(prev => prev.filter(f => f.template_id !== policy.id));
                  } else {
                    await addFavorite(policy.id, undefined, token).catch(() => {});
                    setFavoriteIds(prev => new Set(prev).add(policy.id));
                  }
                }}
                onExport={!policy.isSystem ? async () => {
                  if (!token) return;
                  try {
                    const blob = await exportPolicyTemplate(policy.id, token);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `policy-${policy.code}-v1.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch { addToast("error", 'Export failed'); }
                } : undefined}
                onHistory={() => setHistoryDrawer({ id: policy.id, name: policy.name, code: policy.code })}
                onInspect={() => {
                  const raw = policies.find(p => p.id === policy.id) ?? null;
                  setDetailDrawer({
                    preset: buildPresetFromTemplate(raw ?? policy),
                    dbTemplate: raw,
                  });
                }}
              />
            ))}
          </div>
        ) : tabPolicies.length === 0 ? (
          <div style={{ marginTop: 40 }}>
            <EmptyState
              type="empty"
              title={activeTab === "branch" ? "No Branch Policies" : activeTab === "favorites" ? "No Favorites Yet" : "No Saved Policies"}
              message={
                activeTab === "branch"
                  ? "Branch-scoped policy templates will appear here once the API returns branch_id on templates."
                  : activeTab === "favorites"
                  ? "Bookmark policy templates from My Policies or Company-wide to add them to your favorites list."
                  : "Create your first policy in the Policy Engine. Templates you create will appear here."
              }
              action={activeTab !== "branch" && activeTab !== "favorites" ? {
                label: "Create Policy",
                onClick: () => router.push("/ai-policy-wizard"),
              } : undefined}
            />
          </div>
        ) : (
          <div style={{
            textAlign: "center", padding: "48px 0",
            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.06em",
          }}>
            NO POLICIES MATCH YOUR SEARCH
          </div>
        )}
      </div>

      {/* -- Footer (32px) -------------------------------------------------------- */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 20px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>{renderTs}</span>
        <span style={{ color: S.rim }}>&mdash;</span>
        <span>ORDR &middot; My Saved Policies</span>
        {policies.length > 0 && (
          <>
            <span style={{ color: S.rim }}>&mdash;</span>
            <span>{policies.length} templates loaded</span>
          </>
        )}
      </footer>

      {/* -- Modals --------------------------------------------------------------- */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          loading={confirmLoading}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => { setConfirmModal(null); setConfirmLoading(false); }}
        />
      )}
      {editModal && (
        <EditPolicyModal
          policy={editModal}
          loading={editLoading}
          onSave={handleEditSave}
          onCancel={() => { setEditModal(null); setEditLoading(false); }}
        />
      )}

      {/* LOG-POLICY-1: Revision history drawer */}
      {historyDrawer && (
        <PolicyRevisionDrawer
          templateId={historyDrawer.id}
          templateName={historyDrawer.name}
          templateCode={historyDrawer.code}
          token={token ?? undefined}
          onClose={() => setHistoryDrawer(null)}
        />
      )}

      {/* Policy detail drawer */}
      {detailDrawer && (
        <PolicyDetailDrawer
          preset={detailDrawer.preset}
          dbTemplate={detailDrawer.dbTemplate}
          token={token ?? undefined}
          onClose={() => setDetailDrawer(null)}
        />
      )}

      {/* -- Toast notifications -------------------------------------------------- */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
    <HelpPanel config={SAVED_POLICIES_HELP} storageKey="saved-policies" />
    </div>
  );
}
