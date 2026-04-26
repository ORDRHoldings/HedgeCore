"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { PositionRow } from "@/api/positionClient";
import { bulkAssignPolicy } from "@/api/positionClient";
import {
  listPolicyTemplates,
  getActivePolicy,
  activatePolicy,
  listFavorites,
  type PolicyTemplate,
  type PolicyInstance,
  type PolicyFavorite,
} from "@/api/policyClient";
import { recommendPolicyForPosition, type PolicyRecommendation } from "@/utils/policyRecommender";
import { computeEffectivenessScore, type PolicyEffectivenessResult } from "@/utils/policyEffectivenessScore";
import {
  ChevronLeftIcon, CheckSquareIcon, SquareIcon, LoaderIcon,
  StarIcon, SearchIcon, ShieldIcon, ZapIcon, CheckCircleIcon,
  ArrowRightIcon, RefreshCwIcon, AlertCircleIcon, XIcon,
  AlertTriangleIcon, InfoIcon,
} from "lucide-react";
import { T } from "./tokens";

const HD = T;

/* ─────────────────────────────────────────────────────────────────────────────
 * DESIGN DECISIONS (grounded in backend contracts):
 *
 * 1. MIXED-POLICY BASKETS: The hedge engine's /v1/calculate takes a single
 *    policy config object. PhaseCalculate always fetches the company's active
 *    policy for the config. Mixed-policy baskets are allowed — the user sees
 *    a warning and can normalize or proceed. The policyInstanceId passed
 *    downstream is for audit linkage, not calculation config selection.
 *
 * 2. ACTIVE POLICY SIDE EFFECT: activatePolicy() changes the global
 *    company+branch active policy (deactivates previous). bulkAssignPolicy()
 *    accepts ANY policy_instance_id regardless of active state. Therefore:
 *    - If the active policy already matches the selected template, reuse it.
 *    - If different template, we MUST call activatePolicy to obtain an
 *      instance ID (no other API creates one). The UI warns the user.
 *    - This is the intended contract: choosing a policy in Hedge Desk IS
 *      a company policy decision.
 *
 * 3. ALREADY-ASSIGNED BASKETS: If all positions arrive with policies,
 *    proceed is immediate. No forced reassignment. Policy context is derived
 *    from positions' existing policy_id values + the active policy.
 * ───────────────────────────────────────────────────────────────────────────── */

interface PhaseAssignPolicyProps {
  positions: PositionRow[];
  token: string;
  onComplete: (updatedPositions: PositionRow[], policyInstanceId: string | undefined) => void;
  onBack: () => void;
}

type CategoryTab = "ALL" | "CORPORATE" | "FINANCIAL" | "SOVEREIGN" | "SECTOR" | "FAVORITES";

const CATEGORY_TABS: CategoryTab[] = ["ALL", "CORPORATE", "FINANCIAL", "SOVEREIGN", "SECTOR", "FAVORITES"];

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function badgeColor(badge: PolicyEffectivenessResult["badge"]): string {
  if (badge === "INSTITUTIONAL") return HD.cyan;
  if (badge === "STRONG") return HD.emerald;
  if (badge === "MODERATE") return HD.amber;
  return HD.slate;
}

function confidenceColor(conf: "HIGH" | "MEDIUM" | "LOW"): string {
  if (conf === "HIGH") return HD.emerald;
  if (conf === "MEDIUM") return HD.amber;
  return HD.slate;
}

/** Parse bulk-assign error strings to extract failed position IDs.
 *  Backend format: "{uuid}: {error message}" */
function extractFailedIds(errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const e of errors) {
    const colonIdx = e.indexOf(":");
    if (colonIdx > 0) {
      ids.add(e.slice(0, colonIdx).trim());
    }
  }
  return ids;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PhaseAssignPolicy — Step 2: Inline policy assignment                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function PhaseAssignPolicy({ positions, token, onComplete, onBack }: PhaseAssignPolicyProps) {
  // Data loading states
  const [templates, setTemplates]       = useState<PolicyTemplate[]>([]);
  const [activePolicy, setActivePolicy] = useState<PolicyInstance | null>(null);
  const [favoriteIds, setFavoriteIds]   = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState<string | null>(null);

  // Local position state (tracks assignment changes)
  const [localPositions, setLocalPositions] = useState<PositionRow[]>(positions);

  // Selection state
  const [checked, setChecked]                       = useState<Set<string>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Template browser state
  const [categoryTab, setCategoryTab] = useState<CategoryTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Assignment state
  const [assigning, setAssigning]     = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Tracks instance ID from assignments made THIS session (null if user made no changes)
  const [sessionInstanceId, setSessionInstanceId] = useState<string | null>(null);

  // ── Derived data ──────────────────────────────────────────────────────
  const unassigned = localPositions.filter(p => p.execution_status === "NEW");
  const assigned   = localPositions.filter(p => p.execution_status !== "NEW");
  const allAssigned = unassigned.length === 0;

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;

  // Analyze existing policy assignments in the basket
  const policyAnalysis = useMemo(() => {
    const ids = new Set(
      localPositions
        .map(p => p.policy_id)
        .filter((id): id is string => id != null)
    );
    const isMixed = ids.size > 1;
    const singleId = ids.size === 1 ? Array.from(ids)[0] : null;
    return { uniquePolicyIds: ids, isMixed, singleId, count: ids.size };
  }, [localPositions]);

  // Determine the effective policy instance ID for downstream:
  // 1. If user assigned this session, use that
  // 2. If all positions share one policy, use that
  // 3. Fall back to active policy ID
  // 4. undefined if nothing available (PhaseCalculate will derive from /v1/policies/active)
  const effectiveInstanceId: string | undefined = useMemo(() => {
    if (sessionInstanceId) return sessionInstanceId;
    if (policyAnalysis.singleId) return policyAnalysis.singleId;
    if (activePolicy?.id) return activePolicy.id;
    return undefined;
  }, [sessionInstanceId, policyAnalysis.singleId, activePolicy]);

  // Recommendation
  const recommendation: PolicyRecommendation | null = useMemo(() => {
    const firstUnassigned = unassigned[0] ?? localPositions[0];
    if (!firstUnassigned || templates.length === 0) return null;
    return recommendPolicyForPosition(firstUnassigned, templates, favoriteIds);
  }, [unassigned, localPositions, templates, favoriteIds]);

  // Effectiveness for selected template
  const selectedEffectiveness: PolicyEffectivenessResult | null = useMemo(() => {
    if (!selectedTemplate) return null;
    return computeEffectivenessScore(selectedTemplate.config, selectedTemplate.risk_posture);
  }, [selectedTemplate]);

  // Effectiveness for recommended
  const recommendedEffectiveness: PolicyEffectivenessResult | null = useMemo(() => {
    if (!recommendation) return null;
    const tmpl = templates.find(t => t.id === recommendation.templateId);
    if (!tmpl) return null;
    return computeEffectivenessScore(tmpl.config, tmpl.risk_posture);
  }, [recommendation, templates]);

  // Filter templates for browser
  const filteredTemplates = useMemo(() => {
    let list = templates;
    if (categoryTab === "FAVORITES") {
      list = list.filter(t => favoriteIds.has(t.id));
    } else if (categoryTab !== "ALL") {
      list = list.filter(t => t.category === categoryTab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.short_name.toLowerCase().includes(q)
      );
    }
    // Favorites sorted to top within non-FAVORITES tabs
    if (categoryTab !== "FAVORITES") {
      list = [...list].sort((a, b) => {
        const aFav = favoriteIds.has(a.id) ? 0 : 1;
        const bFav = favoriteIds.has(b.id) ? 0 : 1;
        return aFav - bFav;
      });
    }
    return list;
  }, [templates, categoryTab, searchQuery, favoriteIds]);

  // ── Load data ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [templatesRes, activePol, favs] = await Promise.all([
        listPolicyTemplates(token),
        getActivePolicy(token).catch(() => null),
        listFavorites(token).catch(() => [] as PolicyFavorite[]),
      ]);
      setTemplates(templatesRes);
      setActivePolicy(activePol);
      setFavoriteIds(new Set(favs.map(f => f.template_id)));
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  // Default-check all unassigned positions on mount
  useEffect(() => {
    const newIds = positions.filter(p => p.execution_status === "NEW").map(p => p.id);
    if (newIds.length > 0) {
      setChecked(new Set(newIds));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle helpers ────────────────────────────────────────────────────
  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllUnassigned = () => {
    setChecked(new Set(unassigned.map(p => p.id)));
  };

  const selectAll = () => {
    setChecked(new Set(localPositions.map(p => p.id)));
  };

  // ── Assignment flow ───────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!selectedTemplateId || checked.size === 0) return;
    setAssigning(true);
    setAssignError(null);

    try {
      // Determine PolicyInstance ID.
      // bulkAssignPolicy accepts ANY valid instance ID — it does NOT need to be active.
      // We only call activatePolicy if we need a NEW instance for the selected template.
      let instanceId: string;
      if (activePolicy && activePolicy.template_id === selectedTemplateId) {
        // Reuse existing active instance — no global state change
        instanceId = activePolicy.id;
      } else {
        // Must activate to get an instance ID for this template.
        // This WILL change the company's active policy — intended behavior
        // since the user is explicitly choosing this template.
        const newInstance = await activatePolicy(selectedTemplateId, token);
        instanceId = newInstance.id;
        setActivePolicy(newInstance);
      }

      const posIds = Array.from(checked);
      const result = await bulkAssignPolicy(posIds, instanceId, token);

      if (result.failed > 0 && result.errors.length > 0) {
        setAssignError(`${result.failed} position(s) failed: ${result.errors.slice(0, 3).join("; ")}`);
      }

      // Deterministic success/failure detection.
      // Backend error format: "{position_id}: {error_message}"
      const failedIds = extractFailedIds(result.errors);

      // Update local positions to reflect assignment
      setLocalPositions(prev =>
        prev.map(p => {
          if (posIds.includes(p.id) && !failedIds.has(p.id)) {
            return {
              ...p,
              execution_status: "POLICY_ASSIGNED" as const,
              policy_id: instanceId,
            };
          }
          return p;
        })
      );

      setSessionInstanceId(instanceId);
      setChecked(new Set());
    } catch (e) {
      setAssignError(String(e));
    } finally {
      setAssigning(false);
    }
  };

  // ── Proceed ───────────────────────────────────────────────────────────
  const canProceed = allAssigned;
  const handleProceed = () => {
    if (!canProceed) return;
    onComplete(localPositions, effectiveInstanceId);
  };

  const checkedCount = checked.size;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Step header ────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 24px",
        background: HD.bgSub,
        borderBottom: `1px solid ${HD.rim}`,
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: HD.tertiary }}>STEP 2 OF 7</span>
        <span style={{ width: 1, height: 14, background: HD.soft, display: "inline-block" }} />
        <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: HD.primary }}>ASSIGN POLICY</span>
      </div>

      {/* ── Status strip ───────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "10px 24px",
        background: allAssigned
          ? `color-mix(in srgb, ${HD.emerald} 5%, transparent)`
          : `color-mix(in srgb, ${HD.amber} 5%, transparent)`,
        borderBottom: `1px solid ${HD.soft}`,
        flexShrink: 0,
      }}>
        {allAssigned ? (
          <>
            <CheckCircleIcon size={14} color={HD.emerald} />
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: HD.emerald }}>
              ALL {localPositions.length} POSITIONS HAVE POLICIES ASSIGNED
            </span>
          </>
        ) : (
          <>
            <AlertCircleIcon size={14} color={HD.amber} />
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: HD.amber }}>
              {unassigned.length} OF {localPositions.length} POSITIONS NEED A POLICY
            </span>
          </>
        )}
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40 }}>
            <LoaderIcon size={16} color={HD.slate} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary }}>LOADING POLICIES...</span>
          </div>
        )}

        {/* Load error */}
        {!loading && loadError && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
            border: `1px solid ${HD.red}`, background: `color-mix(in srgb, ${HD.red} 5%, ${HD.bgPanel})`, borderRadius: 4,
          }}>
            <XIcon size={14} color={HD.red} />
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.red, flex: 1 }}>Failed to load policies</span>
            <button onClick={loadData} style={{
              fontFamily: HD.fontMono, fontSize: 12, color: HD.cyan, background: "none",
              border: `1px solid ${HD.soft}`, padding: "4px 10px", cursor: "pointer", borderRadius: 3,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <RefreshCwIcon size={10} /> RETRY
            </button>
          </div>
        )}

        {!loading && !loadError && (
          <>
            {/* ── Mixed-policy warning ───────────────────────────────────── */}
            {policyAnalysis.isMixed && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "12px 16px",
                border: `1px solid color-mix(in srgb, ${HD.amber} 30%, transparent)`,
                borderLeft: `3px solid ${HD.amber}`,
                background: `color-mix(in srgb, ${HD.amber} 4%, ${HD.bgPanel})`,
                borderRadius: 6,
              }}>
                <AlertTriangleIcon size={14} color={HD.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: HD.amber }}>
                    MIXED-POLICY BASKET ({policyAnalysis.count} POLICIES)
                  </span>
                  <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.5 }}>
                    This basket contains positions assigned to {policyAnalysis.count} different policies.
                    The hedge calculation will use the <strong style={{ color: HD.primary }}>active company policy</strong> config.
                    You can reassign all positions to one policy for consistency, or proceed as-is.
                  </span>
                </div>
              </div>
            )}

            {/* ── Section A: Position Grid ─────────────────────────────── */}
            <div style={{ border: `1px solid ${HD.rim}`, borderRadius: 6 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 14px", background: HD.bgSub,
                borderBottom: `1px solid ${HD.soft}`, borderRadius: "6px 6px 0 0",
              }}>
                <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
                  POSITIONS
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {unassigned.length > 0 && (
                    <button onClick={selectAllUnassigned} style={{
                      fontFamily: HD.fontMono, fontSize: 12, color: HD.cyan, background: "none",
                      border: `1px solid ${HD.soft}`, padding: "3px 8px", cursor: "pointer", borderRadius: 2,
                    }}>
                      SELECT ALL UNASSIGNED
                    </button>
                  )}
                  <button onClick={selectAll} style={{
                    fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, background: "none",
                    border: `1px solid ${HD.soft}`, padding: "3px 8px", cursor: "pointer", borderRadius: 2,
                  }}>
                    SELECT ALL
                  </button>
                </div>
              </div>

              {/* Header row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr 80px 90px 110px",
                padding: "6px 14px",
                background: HD.bgDeep,
                borderBottom: `1px solid ${HD.soft}`,
              }}>
                {["", "ENTITY", "CCY", "AMOUNT", "STATUS"].map(h => (
                  <span key={h} style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: HD.tertiary }}>{h}</span>
                ))}
              </div>

              {/* Position rows */}
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {localPositions.map((p, i) => {
                  const isChecked = checked.has(p.id);
                  const isNew = p.execution_status === "NEW";
                  const statusColor = isNew ? HD.amber : p.execution_status === "POLICY_ASSIGNED" ? HD.cyan : HD.emerald;
                  const statusLabel = isNew ? "NEEDS POLICY" : p.execution_status === "POLICY_ASSIGNED" ? "ASSIGNED" : "READY";
                  return (
                    <div
                      key={p.id}
                      onClick={() => toggleCheck(p.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "32px 1fr 80px 90px 110px",
                        padding: "6px 14px",
                        borderBottom: `1px solid ${HD.soft}`,
                        background: isChecked ? `color-mix(in srgb, ${HD.royal} 6%, ${HD.bgPanel})` : i % 2 === 0 ? HD.bgPanel : HD.bgSub,
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center" }}>
                        {isChecked
                          ? <CheckSquareIcon size={14} color={HD.royal} />
                          : <SquareIcon size={14} color={HD.slate} />
                        }
                      </div>
                      <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.primary, display: "flex", alignItems: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.entity}
                      </span>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.primary, display: "flex", alignItems: "center" }}>{p.currency}</span>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.primary, display: "flex", alignItems: "center" }}>{fmt(p.amount ?? 0)}</span>
                      <span style={{
                        fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                        color: statusColor, display: "flex", alignItems: "center",
                      }}>
                        {statusLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Section B: Policy Selection ──────────────────────────── */}
            {/* Only show assignment UI if there are unassigned positions OR user wants to reassign */}

            {/* B1: Recommended card */}
            {recommendation && (
              <div style={{
                border: `1px solid color-mix(in srgb, ${HD.emerald} 25%, transparent)`,
                borderLeft: `3px solid ${HD.emerald}`,
                borderRadius: 6,
                background: `color-mix(in srgb, ${HD.emerald} 3%, ${HD.bgPanel})`,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 14px",
                  background: `color-mix(in srgb, ${HD.emerald} 6%, ${HD.bgSub})`,
                  borderBottom: `1px solid color-mix(in srgb, ${HD.emerald} 15%, transparent)`,
                  borderRadius: "6px 6px 0 0",
                }}>
                  <ZapIcon size={13} color={HD.emerald} />
                  <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: HD.emerald }}>
                    RECOMMENDED
                  </span>
                  <span style={{
                    fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700,
                    color: confidenceColor(recommendation.confidence),
                    background: `color-mix(in srgb, ${confidenceColor(recommendation.confidence)} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${confidenceColor(recommendation.confidence)} 30%, transparent)`,
                    padding: "1px 6px", borderRadius: 3,
                  }}>
                    {recommendation.confidence}
                  </span>
                  {recommendedEffectiveness && (
                    <span style={{
                      fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700,
                      color: badgeColor(recommendedEffectiveness.badge),
                      marginLeft: "auto",
                    }}>
                      {recommendedEffectiveness.score}/100 {recommendedEffectiveness.badge}
                    </span>
                  )}
                </div>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, color: HD.primary }}>
                        [{recommendation.shortName}]
                      </span>
                      <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary }}>{recommendation.name}</span>
                    </div>
                    <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.tertiary }}>{recommendation.reason}</span>
                  </div>
                  <button
                    onClick={() => setSelectedTemplateId(recommendation.templateId)}
                    style={{
                      fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                      color: selectedTemplateId === recommendation.templateId ? "#fff" : HD.emerald,
                      background: selectedTemplateId === recommendation.templateId ? HD.emerald : "transparent",
                      border: `1px solid ${HD.emerald}`,
                      padding: "6px 14px", cursor: "pointer", borderRadius: 3,
                      whiteSpace: "nowrap", transition: "all 0.12s",
                    }}
                  >
                    {selectedTemplateId === recommendation.templateId ? "SELECTED" : "USE RECOMMENDED"}
                  </button>
                </div>
              </div>
            )}

            {/* B2: Active policy card */}
            {activePolicy && activePolicy.template && (
              <div style={{
                border: `1px solid color-mix(in srgb, ${HD.cyan} 25%, transparent)`,
                borderLeft: `3px solid ${HD.cyan}`,
                borderRadius: 6,
                background: `color-mix(in srgb, ${HD.cyan} 3%, ${HD.bgPanel})`,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 14px",
                  background: `color-mix(in srgb, ${HD.cyan} 6%, ${HD.bgSub})`,
                  borderBottom: `1px solid color-mix(in srgb, ${HD.cyan} 15%, transparent)`,
                  borderRadius: "6px 6px 0 0",
                }}>
                  <ShieldIcon size={13} color={HD.cyan} />
                  <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: HD.cyan }}>
                    ACTIVE POLICY
                  </span>
                </div>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <PolicyField label="NAME" value={activePolicy.template.name} />
                    <PolicyField label="POSTURE" value={activePolicy.template.risk_posture} />
                    <PolicyField label="CONFIRMED" value={`${Math.round((activePolicy.template.config?.hedge_ratios?.confirmed ?? 0) * 100)}%`} />
                    <PolicyField label="FORECAST" value={`${Math.round((activePolicy.template.config?.hedge_ratios?.forecast ?? 0) * 100)}%`} />
                    <PolicyField label="PRODUCT" value={activePolicy.template.config?.execution_product ?? "NDF"} />
                    <PolicyField label="SPREAD" value={`${activePolicy.template.config?.cost_assumptions?.spread_bps ?? 0} bps`} />
                  </div>
                  <button
                    onClick={() => setSelectedTemplateId(activePolicy.template_id)}
                    style={{
                      fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                      color: selectedTemplateId === activePolicy.template_id ? "#fff" : HD.cyan,
                      background: selectedTemplateId === activePolicy.template_id ? HD.cyan : "transparent",
                      border: `1px solid ${HD.cyan}`,
                      padding: "6px 14px", cursor: "pointer", borderRadius: 3,
                      whiteSpace: "nowrap", transition: "all 0.12s",
                    }}
                  >
                    {selectedTemplateId === activePolicy.template_id ? "SELECTED" : "USE ACTIVE POLICY"}
                  </button>
                </div>
              </div>
            )}

            {!activePolicy && (
              <div style={{
                padding: "12px 16px",
                border: `1px solid ${HD.soft}`,
                borderLeft: `3px solid ${HD.slate}`,
                borderRadius: 6,
                background: HD.bgSub,
              }}>
                <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.tertiary }}>
                  No active policy — select a template below.
                </span>
              </div>
            )}

            {/* Activation side-effect warning */}
            {selectedTemplateId && activePolicy && activePolicy.template_id !== selectedTemplateId && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "10px 14px",
                border: `1px solid color-mix(in srgb, ${HD.amber} 25%, transparent)`,
                background: `color-mix(in srgb, ${HD.amber} 4%, transparent)`,
                borderRadius: 4,
              }}>
                <InfoIcon size={12} color={HD.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontFamily: HD.fontUI, fontSize: 12, color: HD.secondary, lineHeight: 1.5 }}>
                  Assigning this template will <strong style={{ color: HD.amber }}>change your company{"'"}s active policy</strong>.
                  The current active policy will be deactivated.
                </span>
              </div>
            )}

            {/* B3: All Templates browser */}
            <div style={{ border: `1px solid ${HD.rim}`, borderRadius: 6 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px",
                background: HD.bgSub,
                borderBottom: `1px solid ${HD.soft}`,
                borderRadius: "6px 6px 0 0",
              }}>
                <ShieldIcon size={13} color={HD.tertiary} />
                <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
                  ALL TEMPLATES
                </span>
                <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.slate }}>({templates.length})</span>
              </div>

              {/* Category tabs */}
              <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${HD.soft}`, overflowX: "auto" }}>
                {CATEGORY_TABS.map(tab => {
                  const active = categoryTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setCategoryTab(tab)}
                      style={{
                        fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                        color: active ? HD.cyan : HD.tertiary,
                        background: active ? `color-mix(in srgb, ${HD.cyan} 6%, ${HD.bgPanel})` : "transparent",
                        border: "none",
                        borderBottom: active ? `2px solid ${HD.cyan}` : "2px solid transparent",
                        padding: "8px 12px 6px", cursor: "pointer",
                      }}
                    >
                      {tab === "FAVORITES" && <StarIcon size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />}
                      {tab}
                    </button>
                  );
                })}
              </div>

              {/* Search */}
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${HD.soft}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: HD.bgDeep, border: `1px solid ${HD.rim}`, borderRadius: 3, padding: "0 8px" }}>
                  <SearchIcon size={12} color={HD.slate} />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search templates..."
                    style={{
                      fontFamily: HD.fontMono, fontSize: 12, color: HD.primary,
                      background: "transparent", border: "none", outline: "none",
                      padding: "6px 0", width: "100%",
                    }}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: HD.tertiary }}>
                      <XIcon size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Template list */}
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {filteredTemplates.length === 0 && (
                  <div style={{ padding: "20px 14px", textAlign: "center" }}>
                    <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary }}>No templates match</span>
                  </div>
                )}
                {filteredTemplates.map((t, i) => {
                  const isSelected = selectedTemplateId === t.id;
                  const isFav = favoriteIds.has(t.id);
                  const conf = Math.round((t.config?.hedge_ratios?.confirmed ?? 0) * 100);
                  const fcst = Math.round((t.config?.hedge_ratios?.forecast ?? 0) * 100);
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "20px 120px 1fr 90px 70px 60px 60px",
                        padding: "7px 14px",
                        borderBottom: `1px solid ${HD.soft}`,
                        background: isSelected ? `color-mix(in srgb, ${HD.royal} 8%, ${HD.bgPanel})` : i % 2 === 0 ? HD.bgPanel : HD.bgSub,
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center" }}>
                        {isFav && <StarIcon size={10} color={HD.amber} fill={HD.amber} />}
                      </span>
                      <span style={{
                        fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
                        color: isSelected ? HD.royal : HD.cyan,
                        display: "flex", alignItems: "center",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        [{t.short_name}]
                      </span>
                      <span style={{
                        fontFamily: HD.fontUI, fontSize: 12, color: HD.primary,
                        display: "flex", alignItems: "center",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {t.name}
                      </span>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.secondary, display: "flex", alignItems: "center" }}>
                        {t.risk_posture}
                      </span>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.primary, display: "flex", alignItems: "center" }}>
                        {conf}/{fcst}%
                      </span>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.secondary, display: "flex", alignItems: "center" }}>
                        {t.config?.execution_product ?? "NDF"}
                      </span>
                      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, display: "flex", alignItems: "center" }}>
                        {t.config?.cost_assumptions?.spread_bps ?? 0}bp
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Selected template detail ──────────────────────────────── */}
            {selectedTemplate && selectedEffectiveness && (
              <div style={{
                border: `1px solid color-mix(in srgb, ${HD.royal} 30%, transparent)`,
                borderLeft: `3px solid ${HD.royal}`,
                borderRadius: 6,
                background: `color-mix(in srgb, ${HD.royal} 3%, ${HD.bgPanel})`,
                padding: "14px 18px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, color: HD.primary }}>
                    [{selectedTemplate.short_name}] {selectedTemplate.name}
                  </span>
                  <span style={{
                    fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700,
                    color: badgeColor(selectedEffectiveness.badge),
                    background: `color-mix(in srgb, ${badgeColor(selectedEffectiveness.badge)} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${badgeColor(selectedEffectiveness.badge)} 30%, transparent)`,
                    padding: "2px 8px", borderRadius: 3,
                  }}>
                    {selectedEffectiveness.score}/100 {selectedEffectiveness.badge}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <PolicyField label="BUCKET MODE" value={selectedTemplate.config?.bucket_mode ?? "CALENDAR_MONTH"} />
                  <PolicyField label="CONFIRMED" value={`${Math.round((selectedTemplate.config?.hedge_ratios?.confirmed ?? 0) * 100)}%`} />
                  <PolicyField label="FORECAST" value={`${Math.round((selectedTemplate.config?.hedge_ratios?.forecast ?? 0) * 100)}%`} />
                  <PolicyField label="PRODUCT" value={selectedTemplate.config?.execution_product ?? "NDF"} />
                  <PolicyField label="SPREAD" value={`${selectedTemplate.config?.cost_assumptions?.spread_bps ?? 0} bps`} />
                  <PolicyField label="POSTURE" value={selectedTemplate.risk_posture} />
                  <PolicyField label="CATEGORY" value={selectedTemplate.category} />
                  {selectedTemplate.config?.min_trade_size_usd != null && selectedTemplate.config.min_trade_size_usd > 0 && (
                    <PolicyField label="MIN TRADE" value={`$${fmt(selectedTemplate.config.min_trade_size_usd)}`} />
                  )}
                </div>
              </div>
            )}

            {/* Assignment error */}
            {assignError && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                border: `1px solid ${HD.red}`, background: `color-mix(in srgb, ${HD.red} 5%, ${HD.bgPanel})`, borderRadius: 4,
              }}>
                <AlertCircleIcon size={14} color={HD.red} />
                <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.red, flex: 1 }}>{assignError}</span>
                <button onClick={() => setAssignError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: HD.tertiary }}>
                  <XIcon size={12} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Action bar ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 24px",
        background: HD.bgSub,
        borderTop: `1px solid ${HD.soft}`,
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            fontFamily: HD.fontMono, fontSize: 12, letterSpacing: "0.06em",
            color: HD.slate, background: "none",
            border: `1px solid ${HD.rim}`, padding: "8px 14px",
            cursor: "pointer", borderRadius: 3,
          }}
        >
          <ChevronLeftIcon size={12} />
          BACK TO SELECT
        </button>

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.secondary }}>
            {assigned.length} / {localPositions.length} ASSIGNED
          </span>
        </div>

        {/* Show ASSIGN button when there are checked positions and a template selected */}
        {checkedCount > 0 && selectedTemplateId && (
          <button
            onClick={handleAssign}
            disabled={assigning}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              color: HD.white,
              background: !assigning ? HD.royal : HD.slate,
              border: "none", padding: "10px 24px",
              cursor: !assigning ? "pointer" : "not-allowed",
              borderRadius: 3, transition: "background 0.15s",
            }}
          >
            {assigning && <LoaderIcon size={14} color="#ffffff" style={{ animation: "spin 1s linear infinite" }} />}
            {assigning ? "ASSIGNING..." : (
              <>
                ASSIGN {selectedTemplate ? `[${selectedTemplate.short_name}]` : "POLICY"} TO {checkedCount} POSITION{checkedCount !== 1 ? "S" : ""}
              </>
            )}
          </button>
        )}

        {/* Show PROCEED button when all assigned (regardless of whether user made changes) */}
        {canProceed && (
          <button
            onClick={handleProceed}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              color: HD.white,
              background: HD.royal,
              border: "none", padding: "10px 24px",
              cursor: "pointer",
              borderRadius: 3, transition: "background 0.15s",
            }}
          >
            PROCEED TO CALCULATE
            <ArrowRightIcon size={14} />
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Subcomponents                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function PolicyField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary, letterSpacing: "0.1em" }}>{label}</span>
      <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 600, color: HD.primary }}>{value}</span>
    </div>
  );
}
