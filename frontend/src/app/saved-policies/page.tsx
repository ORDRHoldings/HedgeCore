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
 */

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import EmptyState from "../../components/ui/EmptyState";
import Link from "next/link";
import { listPolicyTemplates, getActivePolicy } from "../../api/policyClient";
import type { PolicyTemplate, PolicyInstance } from "../../api/policyClient";

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
  code: string;
  name: string;
  active: boolean;
  riskPosture: "LOW" | "MODERATE" | "HIGH";
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
  "#a78bfa",
  "#f472b6",
];

/**
 * Map a PolicyTemplate from the API onto the DemoPolicy display shape.
 * PolicyConfig hedging instruments live in config.instruments (array of
 * { name, allocation_pct }) when present; otherwise we fall back gracefully.
 */
function templateToDisplay(
  t: PolicyTemplate,
  activeInstanceId: string | null,
): DemoPolicy {
  const cfg = t.config as unknown as Record<string, unknown>;

  // Hedge ratio
  const hedgeRatio =
    typeof cfg.hedge_ratio === "number"
      ? Math.round(cfg.hedge_ratio * 100)
      : typeof cfg.hedgeRatio === "number"
      ? Math.round((cfg.hedgeRatio as number) * 100)
      : 0;

  // Instruments
  type RawInst = { name?: string; allocation_pct?: number; pct?: number };
  const rawInsts =
    Array.isArray(cfg.instruments)
      ? (cfg.instruments as RawInst[])
      : [];
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

  // Premium budget
  const premiumBudget =
    typeof cfg.premium_budget === "number"
      ? `${(cfg.premium_budget as number * 100).toFixed(2)}% of notional`
      : typeof cfg.premiumBudget === "string"
      ? (cfg.premiumBudget as string)
      : "—";

  // VaR coverage
  const varCoverage =
    typeof cfg.var_coverage === "string"
      ? (cfg.var_coverage as string)
      : typeof cfg.varCoverage === "string"
      ? (cfg.varCoverage as string)
      : "—";

  // Risk posture mapping: API uses CONSERVATIVE/MODERATE/AGGRESSIVE
  const riskMap: Record<string, "LOW" | "MODERATE" | "HIGH"> = {
    CONSERVATIVE: "LOW",
    MODERATE: "MODERATE",
    AGGRESSIVE: "HIGH",
  };
  const riskPosture: "LOW" | "MODERATE" | "HIGH" =
    riskMap[t.risk_posture] ?? "MODERATE";

  return {
    code: t.short_name,
    name: t.name,
    active: t.id === activeInstanceId,
    riskPosture,
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
  { key: "my",       label: "My Policies" },
  { key: "branch",   label: "Branch Policies" },
  { key: "company",  label: "Company-wide" },
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

// -- Stacked bar component --------------------------------------------------------
function InstrumentBar({ instruments }: { instruments: InstrumentAlloc[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", height: 6, borderRadius: 1, overflow: "hidden" }}>
        {instruments.map((inst) => (
          <div
            key={inst.name}
            title={`${inst.name}: ${inst.pct}%`}
            style={{
              width: `${inst.pct}%`,
              background: inst.color,
              transition: "width 0.2s",
            }}
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

// -- Policy card ------------------------------------------------------------------
function PolicyCard({ policy, showMeta }: { policy: DemoPolicy; showMeta?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const rc = riskColor(policy.riskPosture);

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
      }}
    >
      {/* Active glow strip */}
      {policy.active && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: S.cyan }} />
      )}

      {/* Header */}
      <div style={{
        padding: "10px 12px",
        borderBottom: `1px solid ${S.rim}`,
        background: S.bgDeep,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.08em", fontWeight: 700, color: S.cyan }}>
            {policy.code}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {policy.active && <Badge label="ACTIVE" color={S.cyan} />}
            {policy.mandatory && <Badge label="MANDATORY" color={S.fail} />}
            <Badge label={policy.riskPosture} color={rc} />
          </div>
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary, lineHeight: 1.3 }}>
          {policy.name}
        </div>
      </div>

      {/* Body: config summary */}
      <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Mini data grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            { label: "HEDGE RATIO",     value: `${policy.hedgeRatio}%` },
            { label: "PREMIUM BUDGET",   value: policy.premiumBudget },
            { label: "VaR COVERAGE",     value: policy.varCoverage },
            { label: "CREATED",          value: policy.created },
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

        {/* Last Modified */}
        {policy.lastModified && (
          <div>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.08em" }}>LAST MODIFIED </span>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary }}>{policy.lastModified}</span>
          </div>
        )}

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
        {showMeta && policy.setBy && (
          <div>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.08em" }}>SET BY </span>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary }}>{policy.setBy}</span>
          </div>
        )}

        {/* Instrument allocation bar */}
        <InstrumentBar instruments={policy.instruments} />
      </div>

      {/* Footer: action buttons */}
      <div style={{
        padding: "8px 12px",
        borderTop: `1px solid ${S.rim}`,
        background: S.bgSub,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}>
        {policy.active ? (
          <>
            <ActionBtn label="Edit" />
            <ActionBtn label="Deactivate" />
            <ActionBtn label="Duplicate" />
            <ActionBtn label="Delete" danger />
          </>
        ) : (
          <>
            <ActionBtn label="Activate" accent />
            <ActionBtn label="Edit" />
            <ActionBtn label="Duplicate" />
            <ActionBtn label="Delete" danger />
          </>
        )}
      </div>
    </div>
  );
}

// -- Small action button ----------------------------------------------------------
function ActionBtn({ label, accent, danger }: { label: string; accent?: boolean; danger?: boolean }) {
  const [hovered, setHovered] = useState(false);
  let color: string = S.tertiary;
  if (accent) color = S.cyan;
  if (danger) color = S.fail;
  if (hovered && !accent && !danger) color = S.secondary;

  return (
    <button
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: S.fontMono,
        fontSize: "0.625rem",
        letterSpacing: "0.06em",
        fontWeight: 600,
        padding: "2px 8px",
        border: `1px solid ${hovered ? color : S.rim}`,
        color,
        background: hovered ? `color-mix(in srgb, ${color} 6%, transparent)` : "transparent",
        cursor: "pointer",
        transition: "all 0.12s",
        borderRadius: 2,
      }}
    >
      {label.toUpperCase()}
    </button>
  );
}

// -- Main page component ----------------------------------------------------------
export default function SavedPoliciesPage() {
  const { isAuthenticated, token, user } = useAuth();
  const router = useRouter();
  const renderTs = useRenderTs();

  const [activeTab, setActiveTab] = useState<TabKey>("my");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");

  // API state
  const [policies, setPolicies] = useState<PolicyTemplate[]>([]);
  const [activeInstance, setActiveInstance] = useState<PolicyInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Auth guard
  if (!isAuthenticated) {
    router.push("/auth/login");
    return null;
  }

  // Fetch policy templates + active instance on mount
  useEffect(() => {
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
  }, [isAuthenticated, token]);

  const activeTemplateId = activeInstance?.template_id ?? null;

  // Map API templates to display shape, then filter by tab
  // The API returns a flat list; we distinguish tabs by is_system + company_id:
  //   "my"      → company-specific non-system templates (company_id set, is_system false)
  //   "branch"  → templates that have a matching branch scope (same heuristic; API may add branch_id later)
  //   "company" → system templates (is_system true) or company-wide (company_id set, is_system false)
  // For now: "my" = user/company templates, "company" = system templates, "branch" = empty until API supports it
  const tabPolicies = useMemo<DemoPolicy[]>(() => {
    let source: PolicyTemplate[];
    if (activeTab === "my") {
      source = policies.filter((t) => !t.is_system && t.company_id !== null);
    } else if (activeTab === "branch") {
      source = []; // branch-scoped templates require branch_id on PolicyTemplate — not yet in API
    } else {
      source = policies.filter((t) => t.is_system);
    }
    return source.map((t) => templateToDisplay(t, activeTemplateId));
  }, [policies, activeTab, activeTemplateId]);

  // Filter + sort
  const filteredPolicies = useMemo(() => {
    let source = tabPolicies;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      source = source.filter(
        (p) =>
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q)
      );
    }
    return sortPolicies(source, sortBy);
  }, [tabPolicies, searchQuery, sortBy]);

  const showMeta = activeTab === "branch" || activeTab === "company";

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: S.bgDeep,
      fontFamily: S.fontUI,
      color: S.primary,
    }}>
      {/* -- TopBar (44px) -------------------------------------------------------- */}
      <header style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 44,
        padding: "0 20px",
        background: S.bgPanel,
        borderBottom: `1px solid ${S.rim}`,
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
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
          letterSpacing: "0.04em",
        }}>
          AS OF {renderTs}
        </span>
      </header>

      {/* -- Tab bar (36px) ------------------------------------------------------- */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        background: S.bgPanel,
        borderBottom: `1px solid ${S.rim}`,
        padding: "0 20px",
        height: 36,
        flexShrink: 0,
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
                background: "transparent",
                cursor: "pointer",
                transition: "color 0.1s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />

        {/* Counts badge */}
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
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}>
          {/* Create New Policy */}
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

          {/* Import Policy (outlined) */}
          <button
            type="button"
            style={{
              fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em", fontWeight: 600,
              padding: "6px 16px", border: `1px solid ${S.rim}`,
              color: S.secondary, background: "transparent",
              cursor: "pointer", borderRadius: 2,
            }}
          >
            IMPORT POLICY
          </button>

          <div style={{ flex: 1 }} />

          {/* Search input */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            border: `1px solid ${S.rim}`, background: S.bgPanel, padding: "5px 10px",
            borderRadius: 2,
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
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: S.tertiary, padding: 0, display: "flex", alignItems: "center",
                  fontSize: "0.75rem", lineHeight: 1,
                }}
              >
                &times;
              </button>
            )}
          </div>

          {/* Sort dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary, letterSpacing: "0.06em" }}>
              SORT:
            </span>
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
            fontFamily: S.fontMono, fontSize: "0.75rem",
            color: S.tertiary, letterSpacing: "0.06em",
          }}>
            LOADING POLICIES…
          </div>
        ) : apiError ? (
          <div style={{ marginTop: 40 }}>
            <EmptyState
              type="error"
              title="Failed to Load Policies"
              message={apiError}
              action={{
                label: "Retry",
                onClick: () => {
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
                },
              }}
            />
          </div>
        ) : filteredPolicies.length > 0 ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 12,
          }}>
            {filteredPolicies.map((policy) => (
              <PolicyCard key={policy.code} policy={policy} showMeta={showMeta} />
            ))}
          </div>
        ) : tabPolicies.length === 0 ? (
          <div style={{ marginTop: 40 }}>
            <EmptyState
              type="empty"
              title="No Saved Policies"
              message="Create your first policy in the Policy Engine. Templates you create will appear here."
              action={{
                label: "Create Policy",
                onClick: () => router.push("/ai-policy-wizard"),
              }}
            />
          </div>
        ) : (
          <div style={{
            textAlign: "center", padding: "48px 0",
            fontFamily: S.fontMono, fontSize: "0.75rem",
            color: S.tertiary, letterSpacing: "0.06em",
          }}>
            NO POLICIES MATCH YOUR SEARCH
          </div>
        )}
      </div>

      {/* -- Footer (32px) -------------------------------------------------------- */}
      <footer style={{
        height: 32,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 20px",
        borderTop: `1px solid ${S.rim}`,
        background: S.bgPanel,
        fontFamily: S.fontMono,
        fontSize: "0.6875rem",
        color: S.tertiary,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}>
        <span>{renderTs}</span>
        <span style={{ color: S.rim }}>&mdash;</span>
        <span>ORDR &middot; My Saved Policies</span>
      </footer>
    </div>
  );
}
