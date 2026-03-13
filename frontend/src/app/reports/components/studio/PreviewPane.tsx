"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { T } from "@/lib/design/tokens";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { DataBindingState } from "./DataBinding";
import type { StudioSection } from "./SectionList";
import type { CommitteePackResponse } from "@/api/runsClient";
import type {
  BucketResult,
  HedgePlanSummary,
  ScenarioTotalResult,
} from "@/api/types";
import { Eye, AlertCircle } from "lucide-react";

// Lazy-loaded panel components
import ExecutiveSummaryPanel from "@/components/reports/ExecutiveSummaryPanel";
import ExposureInsightsPanel from "@/components/reports/ExposureInsightsPanel";
import HedgeEfficiencyPanel from "@/components/reports/HedgeEfficiencyPanel";
import ScenarioSensitivityPanel from "@/components/reports/ScenarioSensitivityPanel";
import PolicyCompliancePanel from "@/components/reports/PolicyCompliancePanel";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  binding: DataBindingState;
  sections: StudioSection[];
  selectedSectionIndex: number | null;
}

type ViewMode = "FULL" | "SECTION";

// ── Component ─────────────────────────────────────────────────────────────────

export default function PreviewPane({
  token,
  binding,
  sections,
  selectedSectionIndex,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("FULL");
  const [packData, setPackData] = useState<CommitteePackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Fetch committee pack data when run is bound
  useEffect(() => {
    if (!binding.runId || !token) {
      setPackData(null);
      return;
    }

    let cancelled = false;
    async function fetchPack() {
      setLoading(true);
      setError(null);
      try {
        const res = await dashboardFetch(
          `/v1/export/committee-pack/${encodeURIComponent(binding.runId!)}`,
          token,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CommitteePackResponse;
        if (!cancelled) setPackData(data);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load pack data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPack();
    return () => {
      cancelled = true;
    };
  }, [binding.runId, token]);

  // Scroll to selected section
  useEffect(() => {
    if (selectedSectionIndex === null) return;
    const el = sectionRefs.current.get(selectedSectionIndex);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedSectionIndex]);

  // Register section ref
  const setSectionRef = useCallback(
    (idx: number, el: HTMLDivElement | null) => {
      if (el) sectionRefs.current.set(idx, el);
      else sectionRefs.current.delete(idx);
    },
    [],
  );

  // Derive what sections to render based on view mode
  const visibleSections = useMemo(() => {
    if (viewMode === "SECTION" && selectedSectionIndex !== null) {
      const sec = sections[selectedSectionIndex];
      return sec ? [{ sec, idx: selectedSectionIndex }] : [];
    }
    return sections.map((sec, idx) => ({ sec, idx }));
  }, [sections, viewMode, selectedSectionIndex]);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: T.bgDeep,
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 20px",
          borderBottom: `1px solid ${T.rim}`,
          background: T.bgPanel,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Eye size={14} style={{ color: T.tertiary }} />
          <span
            style={{
              fontFamily: T.fontMono,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: T.tertiary,
              textTransform: "uppercase",
            }}
          >
            LIVE PREVIEW
          </span>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <ToggleBtn
            label="FULL"
            active={viewMode === "FULL"}
            onClick={() => setViewMode("FULL")}
          />
          <ToggleBtn
            label="SECTION"
            active={viewMode === "SECTION"}
            onClick={() => setViewMode("SECTION")}
          />
        </div>
      </div>

      {/* Content area */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: 20,
        }}
      >
        {/* Empty state: no run */}
        {!binding.runId && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
            }}
          >
            <AlertCircle size={32} style={{ color: T.tertiary }} />
            <span
              style={{
                fontFamily: T.fontUI,
                fontSize: 14,
                color: T.tertiary,
              }}
            >
              Select a run to preview
            </span>
            <span
              style={{
                fontFamily: T.fontUI,
                fontSize: 12,
                color: T.disabled,
              }}
            >
              Bind a calculation run in the config panel to see live report sections.
            </span>
          </div>
        )}

        {/* Loading */}
        {binding.runId && loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <span
              style={{
                fontFamily: T.fontMono,
                fontSize: 12,
                color: T.tertiary,
                letterSpacing: "0.1em",
              }}
            >
              LOADING PACK DATA...
            </span>
          </div>
        )}

        {/* Error */}
        {binding.runId && error && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 8,
            }}
          >
            <AlertCircle size={24} style={{ color: T.fail }} />
            <span
              style={{
                fontFamily: T.fontUI,
                fontSize: 13,
                color: T.fail,
              }}
            >
              {error}
            </span>
          </div>
        )}

        {/* Sections */}
        {binding.runId && !loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {visibleSections.map(({ sec, idx }) => (
              <div
                key={sec.id}
                ref={(el) => setSectionRef(idx, el)}
                style={{
                  background: T.bgPanel,
                  border: `1px solid ${T.rim}`,
                  borderRadius: 6,
                  padding: 20,
                  borderLeft:
                    selectedSectionIndex === idx
                      ? `3px solid ${T.accent}`
                      : `1px solid ${T.rim}`,
                }}
              >
                {/* Section header */}
                <div
                  style={{
                    fontFamily: T.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    color: T.tertiary,
                    textTransform: "uppercase",
                    marginBottom: 12,
                    paddingBottom: 8,
                    borderBottom: `1px solid ${T.soft}`,
                  }}
                >
                  {idx + 1}. {sec.title}
                </div>

                {/* Render section content */}
                <SectionRenderer
                  section={sec}
                  packData={packData}
                />
              </div>
            ))}

            {visibleSections.length === 0 && sections.length > 0 && (
              <div
                style={{
                  textAlign: "center",
                  fontFamily: T.fontUI,
                  fontSize: 13,
                  color: T.tertiary,
                  padding: 40,
                }}
              >
                Select a section in the config panel to preview it.
              </div>
            )}

            {sections.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  fontFamily: T.fontUI,
                  fontSize: 13,
                  color: T.tertiary,
                  padding: 40,
                }}
              >
                Add sections to preview them here.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section Renderer ──────────────────────────────────────────────────────────

function SectionRenderer({
  section,
  packData,
}: {
  section: StudioSection;
  packData: CommitteePackResponse | null;
}) {
  if (!packData) {
    return (
      <Placeholder title={section.title} message="Waiting for pack data..." />
    );
  }

  const { hedge_plan, scenarios } = packData;
  // Cast from CommitteePack loose types to the typed panel interfaces.
  // The server sends the same shape — the CommitteePack response just uses
  // generic Record<string,unknown> for summary/buckets.
  const buckets = (hedge_plan?.buckets ?? []) as unknown as BucketResult[];
  const summary = (hedge_plan?.summary ?? null) as unknown as HedgePlanSummary | null;

  // Build scenario totals from pack data
  const scenarioTotals: ScenarioTotalResult[] = (scenarios ?? []).map((s) => ({
    sigma: s.sigma ?? 0,
    shocked_spot: 0,
    total_unhedged_usd: 0,
    total_hedged_usd: 0,
    total_hedge_benefit_usd: s.hedge_benefit_usd ?? 0,
  }));

  switch (section.type) {
    case "EXECUTIVE_SUMMARY": {
      if (!summary || buckets.length === 0) {
        return <Placeholder title={section.title} message="Insufficient data for executive summary" />;
      }
      return (
        <ExecutiveSummaryPanel
          summary={summary}
          totals={scenarioTotals}
          buckets={buckets}
          trades={[]}
          hedges={[]}
          market={{
            as_of: new Date().toISOString(),
            spot_rate: 0,
            forward_points_by_month: {},
            provider_metadata: {},
          }}
          validationReport={{ status: "PASS", errors: [], warnings: [] }}
          policy={{
            bucket_mode: "CALENDAR_MONTH",
            hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
            cost_assumptions: { spread_bps: 5 },
            execution_product: "NDF",
            min_trade_size_usd: 10000,
          }}
        />
      );
    }

    case "EXPOSURE_DECOMPOSITION": {
      if (buckets.length === 0) {
        return <Placeholder title={section.title} message="No bucket data available" />;
      }
      return <ExposureInsightsPanel buckets={buckets} />;
    }

    case "HEDGE_EFFICIENCY": {
      if (!summary || buckets.length === 0) {
        return <Placeholder title={section.title} message="No hedge data available" />;
      }
      return <HedgeEfficiencyPanel buckets={buckets} summary={summary} />;
    }

    case "SCENARIO_SENSITIVITY": {
      if (!summary) {
        return <Placeholder title={section.title} message="No scenario data available" />;
      }
      return (
        <ScenarioSensitivityPanel
          totals={scenarioTotals}
          perBucket={[]}
          summary={summary}
        />
      );
    }

    case "POLICY_COMPLIANCE": {
      if (!summary || buckets.length === 0) {
        return <Placeholder title={section.title} message="No policy data available" />;
      }
      return (
        <PolicyCompliancePanel
          buckets={buckets}
          summary={summary}
          policy={{
            bucket_mode: "CALENDAR_MONTH",
            hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
            cost_assumptions: { spread_bps: 5 },
            execution_product: "NDF",
            min_trade_size_usd: 10000,
          }}
          validationReport={{ status: "PASS", errors: [], warnings: [] }}
        />
      );
    }

    default:
      return <Placeholder title={section.title} message="Panel not yet available" />;
  }
}

// ── Placeholder ───────────────────────────────────────────────────────────────

function Placeholder({ title, message }: { title: string; message: string }) {
  return (
    <div
      style={{
        padding: "24px 16px",
        textAlign: "center",
        border: `1px dashed ${T.soft}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontFamily: T.fontMono,
          fontSize: 12,
          fontWeight: 600,
          color: T.secondary,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: T.fontUI,
          fontSize: 12,
          color: T.tertiary,
        }}
      >
        {message}
      </div>
    </div>
  );
}

// ── Toggle Button ─────────────────────────────────────────────────────────────

function ToggleBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: T.fontMono,
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        letterSpacing: "0.06em",
        color: active ? T.accent : T.tertiary,
        background: active ? T.bgSub : "transparent",
        border: `1px solid ${active ? T.accent : T.rim}`,
        borderRadius: 3,
        padding: "3px 10px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
