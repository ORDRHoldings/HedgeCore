"use client";

/**
 * /policy-dashboard — Policy Decision Surface
 *
 * Unified institutional home for policy governance. Displays the active policy,
 * effectiveness scoring, position assignment overview, provenance, and quick
 * navigation to related operational surfaces.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import {
  getActivePolicy,
  listPolicyTemplates,
  type PolicyInstance,
  type PolicyTemplate,
} from "@/api/policyClient";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { POLICY_PRESETS, type PolicyPreset } from "@/constants/policyPresets";
import {
  computeEffectivenessScore,
  getEffectivenessColor,
} from "@/utils/policyEffectivenessScore";
import {
  Shield,
  Activity,
  Users,
  Clock,
  BarChart2,
  AlertTriangle,
  ChevronRight,
  Layers,
} from "lucide-react";

// ── Design tokens ────────────────────────────────────────────────────────────
const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub,var(--bg-panel))",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan,#22d3ee)",
  amber: "var(--accent-amber,#fbbf24)",
  pass: "var(--status-pass,#4ade80)",
  red: "var(--accent-red,#f87171)",
  green: "var(--status-pass,#4ade80)",
} as const;

// ── Position shape (minimal, only what we need for counts) ──────────────────
interface PositionSummary {
  id: string;
  execution_status: string;
}

// ── Lifecycle statuses ──────────────────────────────────────────────────────
const GOVERNED_STATUSES = new Set([
  "POLICY_ASSIGNED",
  "READY_TO_EXECUTE",
  "HEDGED",
]);
const ALL_STATUSES = [
  "NEW",
  "POLICY_ASSIGNED",
  "READY_TO_EXECUTE",
  "HEDGED",
  "REJECTED",
] as const;

const STATUS_COLORS: Record<string, string> = {
  NEW: S.amber,
  POLICY_ASSIGNED: S.cyan,
  READY_TO_EXECUTE: S.green,
  HEDGED: S.pass,
  REJECTED: S.red,
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "\u2014";
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })} ${d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return "\u2014";
  }
}

function matchPreset(
  shortName: string | undefined,
): PolicyPreset | undefined {
  if (!shortName) return undefined;
  const upper = shortName.toUpperCase();
  return POLICY_PRESETS.find(
    (p) => p.shortName.toUpperCase() === upper,
  );
}

function postureBadgeColor(posture: string | undefined): string {
  switch (posture?.toUpperCase()) {
    case "CONSERVATIVE":
      return S.cyan;
    case "MODERATE":
      return S.amber;
    case "AGGRESSIVE":
      return S.red;
    default:
      return S.tertiary;
  }
}

// ── Page component ──────────────────────────────────────────────────────────
export default function PolicyDashboardPage() {
  const { token, user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // ── Data state ──────────────────────────────────────────────────────────
  const [activeInstance, setActiveInstance] = useState<PolicyInstance | null>(
    null,
  );
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);
  const [positions, setPositions] = useState<PositionSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [positionsError, setPositionsError] = useState(false);

  // ── Fetch data on mount ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [instance, tpls] = await Promise.all([
        getActivePolicy(token).catch(() => null),
        listPolicyTemplates(token).catch(() => [] as PolicyTemplate[]),
      ]);
      setActiveInstance(instance);
      setTemplates(tpls);

      // Positions via dashboardFetch
      try {
        const res = await dashboardFetch("/v1/positions?limit=500", token);
        if (res.ok) {
          const body = await res.json();
          const items: PositionSummary[] = Array.isArray(body)
            ? body
            : Array.isArray(body?.items)
              ? body.items
              : [];
          setPositions(items);
          setPositionsError(false);
        } else {
          setPositionsError(true);
        }
      } catch {
        setPositionsError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadData();
  }, [token, loadData]);

  // ── Derived data ────────────────────────────────────────────────────────
  const activeTemplate = activeInstance?.template ?? null;
  const preset = matchPreset(activeTemplate?.short_name);
  const config = activeTemplate?.config ?? null;

  const effectiveness = useMemo(() => {
    if (!config || !activeTemplate) return null;
    return computeEffectivenessScore(config, activeTemplate.risk_posture);
  }, [config, activeTemplate]);

  const effectivenessColor = effectiveness
    ? getEffectivenessColor(effectiveness.score, S)
    : S.tertiary;

  const positionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ALL_STATUSES.forEach((s) => (counts[s] = 0));
    if (positions) {
      positions.forEach((p) => {
        const status = p.execution_status ?? "NEW";
        counts[status] = (counts[status] ?? 0) + 1;
      });
    }
    return counts;
  }, [positions]);

  const governedCount = useMemo(() => {
    if (!positions) return 0;
    return positions.filter((p) =>
      GOVERNED_STATUSES.has(p.execution_status),
    ).length;
  }, [positions]);

  const unassignedCount = positionCounts["NEW"] ?? 0;
  const totalPositions = positions?.length ?? 0;

  // ── Loading / auth guards ─────────────────────────────────────────────
  if (authLoading) return null;

  if (!isAuthenticated || !token || !user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: S.bgDeep,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: S.fontMono,
          color: S.secondary,
        }}
      >
        NOT AUTHENTICATED
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: S.bgDeep,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: S.fontMono,
          color: S.cyan,
          fontSize: 13,
          letterSpacing: "0.08em",
        }}
      >
        LOADING POLICY STATE...
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: S.bgDeep,
        color: S.primary,
        fontFamily: S.fontUI,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "32px 24px 48px",
        }}
      >
        {/* ── Page Header ────────────────────────────────────────────── */}
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <Shield size={20} style={{ color: S.cyan, flexShrink: 0 }} />
            <h1
              style={{
                fontFamily: S.fontMono,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.12em",
                margin: 0,
                color: S.primary,
                textTransform: "uppercase",
              }}
            >
              Policy Dashboard
            </h1>
          </div>
          <p
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.tertiary,
              margin: 0,
              letterSpacing: "0.04em",
            }}
          >
            Active policy governance &middot; Decision surface &middot;
            Audit-ready
          </p>
        </header>

        {/* ── Row 1: Active Policy Hero ──────────────────────────────── */}
        <section
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            padding: 24,
            marginBottom: 20,
          }}
        >
          {!activeInstance || !activeTemplate ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 16px",
              }}
            >
              <AlertTriangle
                size={28}
                style={{ color: S.amber, marginBottom: 12 }}
              />
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 14,
                  fontWeight: 600,
                  color: S.primary,
                  marginBottom: 6,
                  letterSpacing: "0.06em",
                }}
              >
                NO ACTIVE POLICY
              </div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  color: S.tertiary,
                  marginBottom: 16,
                }}
              >
                Activate a policy from the Policy Library to begin governing
                positions.
              </div>
              <button
                onClick={() => router.push("/policies")}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  padding: "8px 20px",
                  background: S.cyan,
                  color: "#000",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                ACTIVATE A POLICY
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr 1fr",
                gap: 24,
                alignItems: "start",
              }}
            >
              {/* Left — Identity */}
              <div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 15,
                    fontWeight: 700,
                    color: S.primary,
                    marginBottom: 8,
                  }}
                >
                  {activeTemplate.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      padding: "2px 8px",
                      borderRadius: 3,
                      background: "rgba(255,255,255,0.06)",
                      border: `1px solid ${S.soft}`,
                      color: S.secondary,
                    }}
                  >
                    {activeTemplate.short_name}
                  </span>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      padding: "2px 8px",
                      borderRadius: 3,
                      border: `1px solid ${postureBadgeColor(activeTemplate.risk_posture)}`,
                      color: postureBadgeColor(activeTemplate.risk_posture),
                    }}
                  >
                    {activeTemplate.risk_posture}
                  </span>
                  {(preset?.governance_tier ||
                    activeTemplate.config?.bucket_mode) && (
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        padding: "2px 8px",
                        borderRadius: 3,
                        background: "rgba(255,255,255,0.04)",
                        border: `1px solid ${S.soft}`,
                        color: S.tertiary,
                      }}
                    >
                      {preset?.governance_tier ?? "STANDARD"}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: S.fontUI,
                    fontSize: 12,
                    color: S.tertiary,
                    lineHeight: 1.5,
                  }}
                >
                  {activeTemplate.description ?? preset?.description ?? ""}
                </div>
              </div>

              {/* Center — Effect Surface */}
              <div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: S.tertiary,
                    marginBottom: 10,
                    textTransform: "uppercase",
                  }}
                >
                  Effect Surface
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  {[
                    {
                      label: "CONFIRMED",
                      value: config
                        ? `${Math.round((config.hedge_ratios?.confirmed ?? 0) * 100)}%`
                        : "\u2014",
                    },
                    {
                      label: "FORECAST",
                      value: config
                        ? `${Math.round((config.hedge_ratios?.forecast ?? 0) * 100)}%`
                        : "\u2014",
                    },
                    {
                      label: "SPREAD",
                      value: config
                        ? `${config.cost_assumptions?.spread_bps ?? 0} bps`
                        : "\u2014",
                    },
                    {
                      label: "PRODUCT",
                      value: config?.execution_product ?? "\u2014",
                    },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      style={{
                        background: S.bgSub,
                        border: `1px solid ${S.cyan}`,
                        borderRadius: 4,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: "0.08em",
                          color: S.tertiary,
                          marginBottom: 4,
                        }}
                      >
                        {kpi.label}
                      </div>
                      <div
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 18,
                          fontWeight: 700,
                          color: S.primary,
                        }}
                      >
                        {kpi.value}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    color: S.tertiary,
                    marginTop: 8,
                    letterSpacing: "0.02em",
                    opacity: 0.7,
                  }}
                >
                  Kernel-bound fields directly govern hedge calculation output
                </div>
              </div>

              {/* Right — Score & Meta */}
              <div style={{ textAlign: "right" }}>
                {effectiveness && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: "inline-block",
                        padding: "6px 14px",
                        borderRadius: 4,
                        border: `1px solid ${effectivenessColor}`,
                        fontFamily: S.fontMono,
                        fontSize: 20,
                        fontWeight: 700,
                        color: effectivenessColor,
                        marginBottom: 4,
                      }}
                    >
                      {effectiveness.score}
                    </div>
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        color: effectivenessColor,
                      }}
                    >
                      {effectiveness.badge}
                    </div>
                  </div>
                )}
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    color: S.tertiary,
                    marginBottom: 4,
                  }}
                >
                  v{activeTemplate.version}
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    color: S.tertiary,
                  }}
                >
                  Activated {fmtDate(activeInstance.activated_at)}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Row 2: KPI Strip ────────────────────────────────────────── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 20,
          }}
        >
          {[
            {
              icon: Users,
              label: "POSITIONS GOVERNED",
              value:
                positions !== null ? String(governedCount) : "\u2014",
            },
            {
              icon: AlertTriangle,
              label: "UNASSIGNED",
              value:
                positions !== null ? String(unassignedCount) : "\u2014",
            },
            {
              icon: Layers,
              label: "GOVERNANCE TIER",
              value: preset?.governance_tier ?? "STANDARD",
            },
            {
              icon: BarChart2,
              label: "EFFECTIVENESS",
              value: effectiveness
                ? `${effectiveness.score}/100`
                : "\u2014",
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                background: S.bgSub,
                border: `1px solid ${S.rim}`,
                borderRadius: 5,
                padding: "14px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <kpi.icon
                size={16}
                style={{
                  color: S.cyan,
                  marginTop: 2,
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: S.tertiary,
                    marginBottom: 4,
                    textTransform: "uppercase",
                  }}
                >
                  {kpi.label}
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 18,
                    fontWeight: 700,
                    color: S.primary,
                  }}
                >
                  {kpi.value}
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* ── Row 3: Two-column layout ────────────────────────────────── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "3fr 2fr",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {/* Left Column: Policy Scope & Configuration */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Active Policy Detail */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: S.tertiary,
                  marginBottom: 14,
                  textTransform: "uppercase",
                }}
              >
                Policy Detail
              </div>

              {activeTemplate && preset ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <DetailRow
                    label="Description"
                    value={
                      activeTemplate.description ??
                      preset.description
                    }
                  />
                  <DetailRow label="Rationale" value={preset.rationale} />
                  <DetailRow
                    label="Target Audience"
                    value={preset.targetAudience}
                  />
                  <DetailRow
                    label="Formula"
                    value={preset.formula}
                    mono
                  />
                  <DetailRow
                    label="Explanation"
                    value={preset.formulaExplain}
                  />
                </div>
              ) : activeTemplate ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <DetailRow
                    label="Description"
                    value={
                      activeTemplate.description ?? "No description"
                    }
                  />
                  <DetailRow
                    label="Category"
                    value={activeTemplate.category}
                  />
                  <DetailRow
                    label="Risk Posture"
                    value={activeTemplate.risk_posture}
                  />
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.tertiary,
                  }}
                >
                  No active policy selected
                </div>
              )}
            </div>

            {/* Effect Surface Classification */}
            {config && (
              <div
                style={{
                  background: S.bgPanel,
                  border: `1px solid ${S.rim}`,
                  borderRadius: 6,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: S.tertiary,
                    marginBottom: 14,
                    textTransform: "uppercase",
                  }}
                >
                  Effect Surface &mdash; Kernel-Bound
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {[
                    {
                      field: "hedge_ratios.confirmed",
                      value: `${Math.round((config.hedge_ratios?.confirmed ?? 0) * 100)}%`,
                    },
                    {
                      field: "hedge_ratios.forecast",
                      value: `${Math.round((config.hedge_ratios?.forecast ?? 0) * 100)}%`,
                    },
                    {
                      field: "cost_assumptions.spread_bps",
                      value: `${config.cost_assumptions?.spread_bps ?? 0} bps`,
                    },
                    {
                      field: "min_trade_size_usd",
                      value: `$${(config.min_trade_size_usd ?? 0).toLocaleString()}`,
                    },
                    {
                      field: "execution_product",
                      value: config.execution_product ?? "\u2014",
                    },
                  ].map((row) => (
                    <div
                      key={row.field}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: 3,
                        borderLeft: `3px solid ${S.cyan}`,
                        background: "rgba(34,211,238,0.04)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          color: S.secondary,
                        }}
                      >
                        {row.field}
                      </span>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 12,
                          fontWeight: 600,
                          color: S.primary,
                        }}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    color: S.tertiary,
                    marginTop: 10,
                    opacity: 0.7,
                  }}
                >
                  These fields directly govern hedge calculation output
                </div>
              </div>
            )}

            {/* Metadata */}
            {(preset || activeTemplate) && (
              <div
                style={{
                  background: S.bgPanel,
                  border: `1px solid ${S.rim}`,
                  borderRadius: 6,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: S.tertiary,
                    marginBottom: 14,
                    textTransform: "uppercase",
                  }}
                >
                  Metadata
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <MetaCell
                    label="Bucket Mode"
                    value={config?.bucket_mode ?? "\u2014"}
                  />
                  <MetaCell
                    label="Governance Tier"
                    value={preset?.governance_tier ?? "STANDARD"}
                  />
                  <MetaCell
                    label="Maturity Profile"
                    value={preset?.maturity_profile ?? "\u2014"}
                  />
                  <MetaCell
                    label="Accounting Mode"
                    value={preset?.accounting_mode ?? "NONE"}
                  />
                  <MetaCell
                    label="Evidence Grade"
                    value={preset?.evidence_grade ?? "BASIC"}
                  />
                  <MetaCell
                    label="Category"
                    value={activeTemplate?.category ?? "\u2014"}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Governance & Audit */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Provenance Card */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: S.tertiary,
                  marginBottom: 14,
                  textTransform: "uppercase",
                }}
              >
                Provenance
              </div>
              {activeTemplate ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <ProvenanceRow
                    label="Source"
                    value={
                      activeTemplate.is_system
                        ? "SYSTEM"
                        : "CUSTOM"
                    }
                  />
                  <ProvenanceRow
                    label="Template ID"
                    value={activeTemplate.id.slice(0, 8)}
                  />
                  <ProvenanceRow
                    label="Version"
                    value={`v${activeTemplate.version}`}
                  />
                  <ProvenanceRow
                    label="Created"
                    value={fmtDate(activeTemplate.created_at)}
                  />
                  <ProvenanceRow
                    label="Updated"
                    value={fmtDate(activeTemplate.updated_at)}
                  />
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.tertiary,
                  }}
                >
                  No active policy
                </div>
              )}
            </div>

            {/* Revision Summary */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: S.tertiary,
                  marginBottom: 14,
                  textTransform: "uppercase",
                }}
              >
                Revision Summary
              </div>
              {activeInstance ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <ProvenanceRow
                    label="Activated"
                    value={fmtDateTime(activeInstance.activated_at)}
                  />
                  <ProvenanceRow
                    label="Instance ID"
                    value={activeInstance.id.slice(0, 16)}
                  />
                  <button
                    onClick={() => router.push("/policies")}
                    style={{
                      marginTop: 8,
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      color: S.cyan,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    VIEW FULL AUDIT TRAIL
                    <ChevronRight size={13} />
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.tertiary,
                  }}
                >
                  No activation record
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: S.tertiary,
                  marginBottom: 14,
                  textTransform: "uppercase",
                }}
              >
                Quick Actions
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <ActionButton
                  label="CHANGE POLICY"
                  onClick={() => router.push("/policies")}
                />
                <ActionButton
                  label="ASSIGN POSITIONS"
                  onClick={() => router.push("/policy-desk")}
                />
                <ActionButton
                  label="BUILD NEW"
                  onClick={() => router.push("/ai-policy-wizard")}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Row 4: Position Assignment Overview ─────────────────────── */}
        <section
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: S.tertiary,
              marginBottom: 14,
              textTransform: "uppercase",
            }}
          >
            Position Assignment Overview
          </div>

          {positionsError || positions === null ? (
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.tertiary,
              }}
            >
              Position data unavailable
            </div>
          ) : totalPositions === 0 ? (
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.tertiary,
              }}
            >
              No positions found
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {ALL_STATUSES.map((status) => {
                const count = positionCounts[status] ?? 0;
                const pct =
                  totalPositions > 0
                    ? (count / totalPositions) * 100
                    : 0;
                const barColor = STATUS_COLORS[status] ?? S.tertiary;

                return (
                  <div
                    key={status}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px 48px 1fr",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        color: S.secondary,
                      }}
                    >
                      {status.replace(/_/g, " ")}
                    </span>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 700,
                        color: S.primary,
                        textAlign: "right",
                      }}
                    >
                      {count}
                    </span>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: "rgba(255,255,255,0.06)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                          borderRadius: 4,
                          background: barColor,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer
          style={{
            textAlign: "center",
            paddingTop: 12,
            borderTop: `1px solid ${S.soft}`,
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              letterSpacing: "0.1em",
              color: S.tertiary,
              marginBottom: 4,
              textTransform: "uppercase",
            }}
          >
            Policy Engine &middot; Decision Surface &middot; Institutional
            Grade
          </div>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.tertiary,
              opacity: 0.6,
            }}
          >
            {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC
          </div>
        </footer>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: S.tertiary,
          marginBottom: 3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: mono ? S.fontMono : S.fontUI,
          fontSize: 12,
          color: S.secondary,
          lineHeight: 1.55,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: S.bgSub,
        border: `1px solid ${S.soft}`,
        borderRadius: 4,
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: S.tertiary,
          marginBottom: 3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 600,
          color: S.primary,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          color: S.tertiary,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 600,
          color: S.secondary,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        fontFamily: S.fontMono,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        color: S.primary,
        background: S.bgSub,
        border: `1px solid ${S.rim}`,
        borderRadius: 4,
        padding: "10px 14px",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = S.cyan;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = S.rim;
      }}
    >
      {label}
      <ChevronRight size={14} style={{ color: S.cyan }} />
    </button>
  );
}
