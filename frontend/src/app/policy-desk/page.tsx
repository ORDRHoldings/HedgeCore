"use client";

/**
 * /policy-desk — Policy Assignment Control Center
 *
 * Central hub for assigning hedge policies to FX positions.
 * Multiple assignment modes:
 *   1. Active Policy (quick-assign using company's activated policy)
 *   2. Template Selection (choose from policy library)
 *   3. Favorites (frequently-used policies)
 *   4. AI Recommendation (intelligent policy suggestion based on position)
 *
 * Workflow: Ingestion → Policy Desk → Execution
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { useAuth } from "../../lib/authContext";
import type { AppDispatch, RootState } from "../../lib/store";
import {
  listPositionsThunk,
  assignPolicyThunk,
  clearLifecycleError,
} from "../../lib/store/slices/positionSlice";
import type { PositionRow, BulkAssignResult } from "../../api/positionClient";
import { bulkAssignPolicy } from "../../api/positionClient";
import {
  listPolicyTemplates,
  listFavorites,
  getActivePolicy,
  type PolicyTemplate,
  type PolicyInstance,
  type PolicyFavorite,
} from "../../api/policyClient";
import { recommendPolicyForPosition } from "@/utils/policyRecommender";
import HelpPanel from "@/components/layout/HelpPanel";
import { POLICY_DESK_HELP } from "@/lib/helpContent";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass,#22c55e)",
  fail:      "var(--accent-red,#ef4444)",
  neutral:   "#6b7280",
  darkBorder: "#374151",
} as const;

type ExecStatus = "NEW" | "POLICY_ASSIGNED" | "READY_TO_EXECUTE" | "HEDGED" | "REJECTED";
type FilterPreset = "ALL" | "NEW" | "POLICY_ASSIGNED" | "NEEDS_POLICY";

const STATUS_CONFIG: Record<ExecStatus, { label: string; color: string }> = {
  NEW:              { label: "NEW",          color: S.tertiary },
  POLICY_ASSIGNED:  { label: "POLICY ASGND", color: S.cyan },
  READY_TO_EXECUTE: { label: "READY",        color: S.amber },
  HEDGED:           { label: "HEDGED",       color: S.pass },
  REJECTED:         { label: "REJECTED",     color: S.fail },
};

const PRESET_LABELS: Record<FilterPreset, string> = {
  ALL: "ALL",
  NEW: "NEW",
  POLICY_ASSIGNED: "POLICY ASSIGNED",
  NEEDS_POLICY: "NEEDS POLICY",
};

type AssignMode = "active" | "template" | "favorite" | "ai";

interface AIRecommendation {
  positionId: string;
  templateId: string;
  templateName: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
}

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null | undefined): string { return s ? s.slice(0, 10) : "—"; }
function truncate(s: string | null | undefined, max = 20): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}
function shortId(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 8).toUpperCase();
}

function StatusBadge({ status }: { status: ExecStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      fontFamily: S.fontMono,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
      color: S.primary,
      background: S.bgSub,
      border: `1px solid ${S.darkBorder}`,
      padding: "2px 6px",
      borderRadius: 0,
      whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

function PolicyChip({ policyId, policyName }: { policyId: string | null; policyName?: string | null }) {
  if (!policyId) return <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.rim }}>—</span>;
  return (
    <span style={{
      fontFamily: S.fontMono,
      fontSize: 9,
      color: S.primary,
      background: S.bgSub,
      border: `1px solid ${S.darkBorder}`,
      padding: "2px 6px",
      borderRadius: 0,
      whiteSpace: "nowrap",
    }}
    title={policyName ?? policyId}>
      {policyName ? truncate(policyName, 16) : shortId(policyId)}
    </span>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          minWidth: 600,
          maxWidth: 900,
          maxHeight: "85vh",
          overflow: "auto",
          padding: "24px 28px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: S.fontUI, fontSize: 14, fontWeight: 700, color: S.primary, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, marginTop: 4 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, confirmColor, disabled }: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmColor: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
      <button
        onClick={onCancel}
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          color: S.secondary,
          background: "transparent",
          border: `1px solid ${S.rim}`,
          padding: "7px 16px",
          cursor: "pointer",
        }}>
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={disabled}
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: S.bgDeep,
          background: disabled ? S.tertiary : confirmColor,
          border: "none",
          padding: "7px 16px",
          cursor: disabled ? "not-allowed" : "pointer",
        }}>
        {confirmLabel}
      </button>
    </div>
  );
}

export default function PolicyDeskPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user, token } = useAuth();
  const searchRef = useRef<HTMLInputElement>(null);

  const { positions, loading, error, lifecycleLoading, lifecycleError } = useSelector(
    (s: RootState) => s.positions
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<FilterPreset>("NEEDS_POLICY");
  const [search, setSearch] = useState("");

  // Policy data
  const [activePolicy, setActivePolicy] = useState<PolicyInstance | null>(null);
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);
  const [favorites, setFavorites] = useState<PolicyFavorite[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);

  // Modal state
  const [assignMode, setAssignMode] = useState<AssignMode | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [aiRecommendations, setAiRecommendations] = useState<Map<string, AIRecommendation>>(new Map());
  const [generatingAI, setGeneratingAI] = useState(false);

  // Bulk operation state
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkAssignResult | null>(null);

  // Load positions on mount
  useEffect(() => {
    if (token) dispatch(listPositionsThunk({ token }));
  }, [token, dispatch]);

  // Load policy data
  useEffect(() => {
    if (!token) return;
    const loadPolicies = async () => {
      setLoadingPolicies(true);
      try {
        const [active, temps, favs] = await Promise.all([
          getActivePolicy(token),
          listPolicyTemplates(token),
          listFavorites(token),
        ]);
        setActivePolicy(active);
        setTemplates(temps);
        setFavorites(favs);
      } catch (err) {
        console.error("Failed to load policies:", err);
      } finally {
        setLoadingPolicies(false);
      }
    };
    loadPolicies();
  }, [token]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && e.target === document.body) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        setSearch("");
        searchRef.current?.blur();
      } else if (e.key === "r" && e.target === document.body) {
        if (token) dispatch(listPositionsThunk({ token }));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [token, dispatch]);

  // Filter positions
  const filteredPositions = useMemo(() => {
    let filtered = positions;

    // Preset filters
    if (preset === "NEEDS_POLICY") {
      filtered = filtered.filter((p) => p.execution_status === "NEW");
    } else if (preset !== "ALL") {
      filtered = filtered.filter((p) => p.execution_status === preset);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((p) =>
        p.record_id.toLowerCase().includes(q) ||
        p.entity.toLowerCase().includes(q) ||
        p.currency.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [positions, preset, search]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: positions.length,
      NEEDS_POLICY: positions.filter((p) => p.execution_status === "NEW").length,
    };
    ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"].forEach((status) => {
      counts[status] = positions.filter((p) => p.execution_status === status).length;
    });
    return counts;
  }, [positions]);

  const needsPolicyCount = statusCounts.NEEDS_POLICY ?? 0;

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const allVisibleSelected = filteredPositions.length > 0 && filteredPositions.every((p) => selected.has(p.id));

  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) setSelected(new Set());
    else setSelected(new Set(filteredPositions.map((p) => p.id)));
  }, [allVisibleSelected, filteredPositions]);

  // Assign active policy to selected positions
  const handleAssignActive = useCallback(async () => {
    if (!token || !activePolicy || selected.size === 0) return;
    setBulkRunning(true);
    try {
      const result = await bulkAssignPolicy(
        Array.from(selected),
        activePolicy.id,
        token
      );
      setBulkResult(result);
      if (result.assigned > 0) {
        dispatch(listPositionsThunk({ token }));
        setSelected(new Set());
      }
    } catch {
      setBulkResult({ assigned: 0, skipped: 0, failed: selected.size, errors: ["Request failed"] });
    } finally {
      setBulkRunning(false);
    }
  }, [token, activePolicy, selected, dispatch]);

  // Assign template to selected positions
  const handleAssignTemplate = useCallback(async () => {
    if (!token || !selectedTemplate || selected.size === 0) return;
    setBulkRunning(true);
    try {
      const result = await bulkAssignPolicy(
        Array.from(selected),
        selectedTemplate,
        token
      );
      setBulkResult(result);
      if (result.assigned > 0) {
        dispatch(listPositionsThunk({ token }));
        setSelected(new Set());
      }
    } catch {
      setBulkResult({ assigned: 0, skipped: 0, failed: selected.size, errors: ["Request failed"] });
    } finally {
      setBulkRunning(false);
      setAssignMode(null);
    }
  }, [token, selectedTemplate, selected, dispatch]);

  // Generate AI recommendations
  const handleGenerateAI = useCallback(async () => {
    if (selected.size === 0) return;
    setGeneratingAI(true);
    const recommendations = new Map<string, AIRecommendation>();

    try {
      const favoriteIds = new Set(favorites.map((f) => f.template_id));

      for (const posId of Array.from(selected)) {
        const pos = positions.find((p) => p.id === posId);
        if (!pos) continue;

        const recommendation = recommendPolicyForPosition(pos, templates, favoriteIds);
        if (recommendation) {
          recommendations.set(posId, {
            positionId: posId,
            templateId: recommendation.templateId,
            templateName: recommendation.name,
            confidence: recommendation.confidence,
            reasoning: recommendation.reason,
          });
        }
      }
      setAiRecommendations(recommendations);
      setAssignMode("ai");
    } catch (err) {
      console.error("AI recommendation failed:", err);
    } finally {
      setGeneratingAI(false);
    }
  }, [selected, positions, templates, favorites]);

  // Apply AI recommendations
  const handleApplyAI = useCallback(async () => {
    if (!token || aiRecommendations.size === 0) return;
    setBulkRunning(true);

    try {
      let assigned = 0;
      for (const [posId, rec] of aiRecommendations.entries()) {
        try {
          await dispatch(assignPolicyThunk({
            token,
            id: posId,
            policyInstanceId: rec.templateId,
          })).unwrap();
          assigned++;
        } catch {
          // Continue with others
        }
      }

      setBulkResult({
        assigned,
        skipped: 0,
        failed: aiRecommendations.size - assigned,
        errors: assigned < aiRecommendations.size ? ["Some assignments failed"] : [],
      });

      if (assigned > 0) {
        dispatch(listPositionsThunk({ token }));
        setSelected(new Set());
      }
    } finally {
      setBulkRunning(false);
      setAssignMode(null);
      setAiRecommendations(new Map());
    }
  }, [token, aiRecommendations, dispatch]);

  if (!user) {
    return (
      <div style={{ padding: 40, fontFamily: S.fontMono, color: S.secondary, fontSize: 12 }}>
        Authentication required.{" "}
        <button
          onClick={() => router.push("/auth/login")}
          style={{ color: S.primary, background: "none", border: "none", cursor: "pointer", fontFamily: S.fontMono }}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: S.bgDeep, overflow: "hidden", flex: 1 }}>
        {/* Header */}
        <header style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 44,
          flexShrink: 0,
          padding: "0 20px",
          background: S.bgPanel,
          borderBottom: `1px solid ${S.rim}`,
        }}>
          <button
            onClick={() => router.push("/input")}
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.tertiary,
              background: "transparent",
              border: `1px solid ${S.rim}`,
              padding: "2px 8px",
              cursor: "pointer",
            }}>
            ← Ingestion
          </button>
          <span style={{ color: S.rim }}>|</span>
          <span style={{
            fontFamily: S.fontUI,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: S.primary,
          }}>
            Policy Desk
          </span>
          <span style={{
            fontFamily: S.fontMono,
            fontSize: 9,
            color: S.secondary,
            border: `1px solid ${S.rim}`,
            padding: "1px 5px",
          }}>
            ASSIGNMENT CENTER
          </span>
          {needsPolicyCount > 0 && (
            <span
              onClick={() => setPreset("NEEDS_POLICY")}
              style={{
                fontFamily: S.fontMono,
                fontSize: 9,
                fontWeight: 700,
                color: S.primary,
                background: S.bgSub,
                border: `1px solid ${S.darkBorder}`,
                padding: "1px 7px",
                borderRadius: 0,
                cursor: "pointer",
                letterSpacing: "0.06em",
              }}>
              {needsPolicyCount} NEEDS POLICY
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {positions.length} positions
          </span>
          <button
            onClick={() => token && dispatch(listPositionsThunk({ token }))}
            title="Refresh (R)"
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.primary,
              background: "transparent",
              border: `1px solid ${S.darkBorder}`,
              padding: "2px 8px",
              cursor: "pointer",
            }}>
            ↻ Refresh
          </button>
          <button
            onClick={() => router.push("/position-desk")}
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.pass,
              background: `color-mix(in srgb, ${S.pass} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.pass} 25%, transparent)`,
              padding: "2px 8px",
              cursor: "pointer",
            }}>
            → Position Desk
          </button>
        </header>

        {/* Error banner */}
        {lifecycleError && (
          <div style={{
            background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.fail} 25%, transparent)`,
            borderLeft: `3px solid ${S.fail}`,
            padding: "7px 20px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.fail, letterSpacing: "0.06em" }}>
              ERROR
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>{lifecycleError}</span>
            <button
              onClick={() => dispatch(clearLifecycleError())}
              style={{
                marginLeft: "auto",
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.tertiary,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}>
              ✕
            </button>
          </div>
        )}

        {/* Filter bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "6px 20px",
          background: S.bgPanel,
          borderBottom: `1px solid ${S.soft}`,
          flexShrink: 0,
          flexWrap: "wrap",
        }}>
          {(["ALL", "NEEDS_POLICY", "NEW", "POLICY_ASSIGNED"] as FilterPreset[]).map((p) => {
            const isActive = preset === p;
            const color = p === "NEEDS_POLICY" ? S.amber : p === "ALL" ? S.secondary : STATUS_CONFIG[p as ExecStatus]?.color ?? S.secondary;
            const count = statusCounts[p] ?? 0;
            return (
              <button
                key={p}
                onClick={() => setPreset(p)}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: isActive ? S.primary : S.tertiary,
                  background: isActive ? S.bgSub : "transparent",
                  border: `1px solid ${isActive ? S.darkBorder : S.rim}`,
                  padding: "3px 9px",
                  cursor: "pointer",
                  borderRadius: 0,
                  transition: "all 0.1s",
                }}>
                {PRESET_LABELS[p]} ({count})
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search… (/ to focus · Esc to clear)"
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              padding: "3px 10px",
              background: S.bgSub,
              border: `1px solid ${S.rim}`,
              color: S.primary,
              outline: "none",
              width: 280,
            }}
          />
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 20px",
            background: S.bgSub,
            borderBottom: `1px solid ${S.darkBorder}`,
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.primary, fontWeight: 700, letterSpacing: "0.06em" }}>
              {selected.size} SELECTED
            </span>

            {activePolicy && (
              <button
                onClick={handleAssignActive}
                disabled={bulkRunning}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: bulkRunning ? S.tertiary : S.primary,
                  background: bulkRunning ? S.bgSub : S.bgPanel,
                  border: `1px solid ${bulkRunning ? S.soft : S.darkBorder}`,
                  padding: "4px 12px",
                  cursor: bulkRunning ? "not-allowed" : "pointer",
                  borderRadius: 0,
                }}>
                {bulkRunning ? "ASSIGNING..." : "ASSIGN ACTIVE POLICY"}
              </button>
            )}

            <button
              onClick={() => setAssignMode("template")}
              disabled={bulkRunning}
              style={{
                fontFamily: S.fontMono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: bulkRunning ? S.tertiary : S.primary,
                background: bulkRunning ? S.bgSub : S.bgPanel,
                border: `1px solid ${bulkRunning ? S.soft : S.darkBorder}`,
                padding: "4px 12px",
                cursor: bulkRunning ? "not-allowed" : "pointer",
                borderRadius: 0,
              }}>
              FROM TEMPLATE
            </button>

            {favorites.length > 0 && (
              <button
                onClick={() => setAssignMode("favorite")}
                disabled={bulkRunning}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: bulkRunning ? S.tertiary : S.primary,
                  background: bulkRunning ? S.bgSub : S.bgPanel,
                  border: `1px solid ${bulkRunning ? S.soft : S.darkBorder}`,
                  padding: "4px 12px",
                  cursor: bulkRunning ? "not-allowed" : "pointer",
                  borderRadius: 0,
                }}>
                FROM FAVORITES
              </button>
            )}

            <button
              onClick={handleGenerateAI}
              disabled={bulkRunning || generatingAI}
              style={{
                fontFamily: S.fontMono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: bulkRunning || generatingAI ? S.tertiary : S.primary,
                background: bulkRunning || generatingAI ? S.bgSub : S.bgPanel,
                border: `1px solid ${bulkRunning || generatingAI ? S.soft : S.darkBorder}`,
                padding: "4px 12px",
                cursor: bulkRunning || generatingAI ? "not-allowed" : "pointer",
                borderRadius: 0,
              }}>
              {generatingAI ? "ANALYZING..." : "AI RECOMMEND"}
            </button>

            <button
              onClick={() => setSelected(new Set())}
              style={{
                marginLeft: "auto",
                fontFamily: S.fontMono,
                fontSize: 9,
                color: S.tertiary,
                background: "transparent",
                border: `1px solid ${S.rim}`,
                padding: "3px 10px",
                cursor: "pointer",
              }}>
              Clear Selection
            </button>
          </div>
        )}

        {/* Bulk result banner */}
        {bulkResult && (
          <div style={{
            background: bulkResult.failed > 0 ? `color-mix(in srgb, ${S.amber} 8%, transparent)` : `color-mix(in srgb, ${S.pass} 8%, transparent)`,
            border: `1px solid ${bulkResult.failed > 0 ? S.amber : S.pass}`,
            padding: "8px 20px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: bulkResult.failed > 0 ? S.amber : S.pass }}>
              BULK RESULT
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
              {bulkResult.assigned} assigned · {bulkResult.skipped} skipped · {bulkResult.failed} failed
            </span>
            {bulkResult.errors.length > 0 && (
              <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail }}>
                {bulkResult.errors[0]}
              </span>
            )}
            <button
              onClick={() => setBulkResult(null)}
              style={{
                marginLeft: "auto",
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.tertiary,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}>
              ✕
            </button>
          </div>
        )}

        {/* Position table */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
              Loading positions...
            </div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.fail }}>
              Error: {error}
            </div>
          ) : filteredPositions.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
              No positions found. {search && "Try adjusting your search."}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ background: S.bgSub, borderBottom: `1px solid ${S.rim}` }}>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary }}>
                    RECORD ID
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary }}>
                    ENTITY
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary }}>
                    TYPE
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary }}>
                    CCY
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary }}>
                    AMOUNT
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary }}>
                    VALUE DATE
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary }}>
                    STATUS
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", color: S.tertiary }}>
                    POLICY
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((pos) => {
                  const isSelected = selected.has(pos.id);
                  return (
                    <tr
                      key={pos.id}
                      style={{
                        borderBottom: `1px solid ${S.soft}`,
                        background: isSelected ? S.bgSub : "transparent",
                        cursor: "pointer",
                      }}
                      onClick={() => toggleSelect(pos.id)}>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(pos.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px", color: S.primary, fontWeight: 600 }}>
                        {pos.record_id}
                      </td>
                      <td style={{ padding: "8px 10px", color: S.primary }}>
                        {truncate(pos.entity, 24)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <span style={{
                          padding: "2px 6px",
                          borderRadius: 0,
                          fontSize: 9,
                          fontWeight: 700,
                          background: pos.type === "AR" ? `color-mix(in srgb, ${S.pass} 12%, transparent)` : `color-mix(in srgb, ${S.fail} 12%, transparent)`,
                          color: pos.type === "AR" ? S.pass : S.fail,
                        }}>
                          {pos.type}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", color: S.secondary }}>
                        {pos.currency}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: S.primary, fontWeight: 600 }}>
                        {fmtAmt(pos.amount)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", color: S.secondary }}>
                        {fmtDate(pos.value_date)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <StatusBadge status={pos.execution_status as ExecStatus} />
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <PolicyChip policyId={pos.policy_id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Template selection modal */}
      {assignMode === "template" && (
        <ModalOverlay onClose={() => setAssignMode(null)}>
          <ModalHeader
            title="Assign from Template"
            subtitle={`Select a policy template to assign to ${selected.size} position(s)`}
          />
          <div style={{ maxHeight: 400, overflow: "auto", marginBottom: 20 }}>
            {templates.map((tmpl) => {
              const isSelected = selectedTemplate === tmpl.id;
              return (
                <div
                  key={tmpl.id}
                  onClick={() => setSelectedTemplate(tmpl.id)}
                  style={{
                    padding: "10px 12px",
                    border: `1px solid ${isSelected ? S.darkBorder : S.rim}`,
                    background: isSelected ? S.bgDeep : S.bgSub,
                    marginBottom: 8,
                    cursor: "pointer",
                    transition: "all 0.1s",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>
                      {tmpl.name}
                    </span>
                    <span style={{
                      fontFamily: S.fontMono,
                      fontSize: 9,
                      color: S.tertiary,
                      border: `1px solid ${S.rim}`,
                      padding: "1px 5px",
                    }}>
                      {tmpl.risk_posture}
                    </span>
                    {tmpl.is_system && (
                      <span style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        color: S.primary,
                        border: `1px solid ${S.darkBorder}`,
                        padding: "1px 5px",
                      }}>
                        SYSTEM
                      </span>
                    )}
                  </div>
                  {tmpl.description && (
                    <div style={{ fontFamily: S.fontUI, fontSize: 10, color: S.secondary }}>
                      {tmpl.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <ModalActions
            onCancel={() => setAssignMode(null)}
            onConfirm={handleAssignTemplate}
            confirmLabel="ASSIGN TO SELECTED"
            confirmColor={S.primary}
            disabled={!selectedTemplate || bulkRunning}
          />
        </ModalOverlay>
      )}

      {/* Favorites modal */}
      {assignMode === "favorite" && (
        <ModalOverlay onClose={() => setAssignMode(null)}>
          <ModalHeader
            title="Assign from Favorites"
            subtitle={`Select a favorite policy to assign to ${selected.size} position(s)`}
          />
          <div style={{ maxHeight: 400, overflow: "auto", marginBottom: 20 }}>
            {favorites.map((fav) => {
              const tmpl = fav.template;
              if (!tmpl) return null;
              const isSelected = selectedTemplate === tmpl.id;
              return (
                <div
                  key={fav.id}
                  onClick={() => setSelectedTemplate(tmpl.id)}
                  style={{
                    padding: "10px 12px",
                    border: `1px solid ${isSelected ? S.amber : S.rim}`,
                    background: isSelected ? `color-mix(in srgb, ${S.amber} 8%, transparent)` : S.bgSub,
                    marginBottom: 8,
                    cursor: "pointer",
                    transition: "all 0.1s",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, fontWeight: 700 }}>FAV</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>
                      {tmpl.name}
                    </span>
                    <span style={{
                      fontFamily: S.fontMono,
                      fontSize: 9,
                      color: S.tertiary,
                      border: `1px solid ${S.rim}`,
                      padding: "1px 5px",
                    }}>
                      {tmpl.risk_posture}
                    </span>
                  </div>
                  {fav.notes && (
                    <div style={{ fontFamily: S.fontUI, fontSize: 10, color: S.secondary, fontStyle: "italic" }}>
                      {fav.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <ModalActions
            onCancel={() => setAssignMode(null)}
            onConfirm={handleAssignTemplate}
            confirmLabel="ASSIGN TO SELECTED"
            confirmColor={S.amber}
            disabled={!selectedTemplate || bulkRunning}
          />
        </ModalOverlay>
      )}

      {/* AI recommendations modal */}
      {assignMode === "ai" && (
        <ModalOverlay onClose={() => { setAssignMode(null); setAiRecommendations(new Map()); }}>
          <ModalHeader
            title="AI Policy Recommendations"
            subtitle={`AI-suggested policies for ${aiRecommendations.size} position(s)`}
          />
          <div style={{ maxHeight: 400, overflow: "auto", marginBottom: 20 }}>
            {Array.from(aiRecommendations.entries()).map(([posId, rec]) => {
              const pos = positions.find((p) => p.id === posId);
              if (!pos) return null;
              return (
                <div
                  key={posId}
                  style={{
                    padding: "12px 14px",
                    border: `1px solid ${S.darkBorder}`,
                    background: `color-mix(in srgb, ${S.darkBorder} 6%, transparent)`,
                    marginBottom: 10,
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary }}>
                      {pos.record_id}
                    </span>
                    <span style={{
                      fontFamily: S.fontMono,
                      fontSize: 9,
                      color: S.darkBorder,
                      border: `1px solid ${S.darkBorder}`,
                      padding: "2px 6px",
                      borderRadius: 0,
                    }}>
                      {rec.confidence} CONFIDENCE
                    </span>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.primary }}>
                      → {rec.templateName}
                    </span>
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 10, color: S.secondary, lineHeight: 1.4 }}>
                    {rec.reasoning}
                  </div>
                </div>
              );
            })}
          </div>
          <ModalActions
            onCancel={() => { setAssignMode(null); setAiRecommendations(new Map()); }}
            onConfirm={handleApplyAI}
            confirmLabel="APPLY RECOMMENDATIONS"
            confirmColor={S.darkBorder}
            disabled={bulkRunning}
          />
        </ModalOverlay>
      )}

      <HelpPanel config={POLICY_DESK_HELP} storageKey="policy-desk" />
    </div>
  );
}
