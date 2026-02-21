"use client";

import { useState, useCallback, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import type { RootState, AppDispatch } from "../../lib/store";
import {
  sandboxCalculateThunk,
  setXRayOpen,
  setXRayContext,
} from "../../lib/store/slices/pipelineSlice";
import type { CalculateRequest } from "../../api/types";
import { DEMO_FIXTURES, DEFAULT_DEMO_MARKET, DEFAULT_DEMO_POLICY } from "../../constants/demoData";
import type { DemoFixture } from "../../constants/demoData";

// UI primitives
import KpiTile from "../../components/ui/KpiTile";
import RailTabs from "../../components/ui/RailTabs";
import XRayDrawer, { JsonViewer } from "../../components/ui/XRayDrawer";
import StatusChip from "../../components/ui/StatusChip";
import type { ChipStatus } from "../../components/ui/StatusChip";
import EmptyState from "../../components/ui/EmptyState";
import ErrorBanner from "../../components/ui/ErrorBanner";

// Sandbox components
import DemoFixtureSelector from "../../components/sandbox/DemoFixtureSelector";
import WaterfallEngine from "../../components/sandbox/WaterfallEngine";
import AllocatorSummary from "../../components/sandbox/AllocatorSummary";
import ExposureTab from "../../components/sandbox/ExposureTab";
import AttributionTab from "../../components/sandbox/AttributionTab";
import ConstraintsTab from "../../components/sandbox/ConstraintsTab";
import BeforeAfterTab from "../../components/sandbox/BeforeAfterTab";
import LiquidityTab from "../../components/sandbox/LiquidityTab";
import RollsTab from "../../components/sandbox/RollsTab";
import ScenariosTab from "../../components/sandbox/ScenariosTab";
import ScenarioStressTester from "../../components/sandbox/ScenarioStressTester";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function SandboxPage() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { token } = useAuth();
  const {
    sandboxResult,
    sandboxLoading,
    xrayOpen,
    error,
    decisionPacketMode,
  } = useSelector((s: RootState) => s.pipeline);

  const [fixtureId, setFixtureId] = useState<string | null>(null);

  const waterfall = sandboxResult?.waterfall_result;
  const v2 = sandboxResult?.v2_results;
  const scenarioResults = sandboxResult?.scenario_results as Record<string, unknown> | undefined;

  const handleRunDemo = useCallback(
    (selectedId: string) => {
      const fixture = DEMO_FIXTURES.find((f: DemoFixture) => f.id === selectedId);
      if (!fixture) return;
      setFixtureId(fixture.id);
      const req: CalculateRequest = {
        trades: fixture.trades,
        hedges: fixture.hedges,
        market: fixture.market,
        policy: fixture.policy,
      };
      dispatch(sandboxCalculateThunk({ request: req, token: token! }));
    },
    [dispatch, token]
  );

  // Auto-load first fixture on mount in demo mode (so the page is never blank)
  useEffect(() => {
    if (DEMO_MODE && !sandboxResult && !sandboxLoading && DEMO_FIXTURES.length > 0 && token) {
      handleRunDemo(DEMO_FIXTURES[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleXRay = useCallback(
    (context: Record<string, unknown>) => {
      dispatch(setXRayContext(context));
      dispatch(setXRayOpen(true));
    },
    [dispatch]
  );

  const v2ModuleCount = v2
    ? Object.keys(v2).filter((k) => (v2 as Record<string, unknown>)[k] != null).length
    : 0;

  // ── Decision Packet Mode ──
  if (decisionPacketMode && sandboxResult) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          Decision Packet — Executive Summary
        </h1>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4">
          <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase mb-2">
            Waterfall Summary
          </h2>
          <div className="flex gap-2 flex-wrap">
            {waterfall?.rules.map((r: { rule_id: string; status: string }) => (
              <div key={r.rule_id} className="flex items-center gap-1">
                <span className="text-[0.625rem] font-mono text-[var(--text-tertiary)]">{r.rule_id}</span>
                <StatusChip status={r.status as ChipStatus} size="sm" />
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-[var(--text-secondary)]">
            Integrity: <span className="font-semibold text-[var(--text-primary)]">{waterfall?.integrity_score ?? "—"}/100</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <KpiTile label="Worst-Case Loss" value={v2?.worst_case ? `$${((v2.worst_case as Record<string, unknown>).worst_case_loss as number)?.toLocaleString() ?? "—"}` : "—"} />
          <KpiTile label="Margin Used" value={v2?.margin_summary ? `$${((v2.margin_summary as Record<string, unknown>).total_margin as number)?.toLocaleString() ?? "—"}` : "—"} />
          <KpiTile label="Liquidity Regime" value={((v2?.liquidity_regime as Record<string, unknown>)?.regime as string) ?? "—"} />
          <KpiTile label="Capital Buffer" value={v2?.capital_adequacy ? `${((v2.capital_adequacy as Record<string, unknown>).buffer_ratio as number)?.toFixed(2) ?? "—"}x` : "—"} />
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] rounded p-4">
          <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase mb-2">Governance Readiness</h2>
          <div className="grid grid-cols-2 gap-1 text-xs text-[var(--text-secondary)]">
            {["Freeze artifact complete", "Deterministic rounding", "Replay-ready", "Capital buffer OK"].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <ScenarioStressTester
          sandboxResult={sandboxResult}
          defaultPolicy={DEFAULT_DEMO_POLICY}
          defaultSpot={DEFAULT_DEMO_MARKET.spot_usdmxn}
        />
      </div>
    );
  }

  // ── Main 3-column layout ──
  return (
    <div className="h-full flex">
      {/* Left Rail — 20% */}
      <aside className="w-[20%] min-w-[240px] border-r border-[var(--border-rim)] bg-[var(--bg-panel)] overflow-auto">
        <RailTabs
          tabs={[
            {
              id: "exposure",
              label: "Exposure",
              content: (
                <ExposureTab
                  tensorResult={v2?.tensor_result as Record<string, unknown> | undefined}
                  calculateResponse={sandboxResult?.calculate_response as Record<string, unknown> | null ?? null}
                />
              ),
            },
            {
              id: "attribution",
              label: "Attribution",
              content: (
                <AttributionTab
                  navAttribution={v2?.nav_attribution as Record<string, unknown> | undefined}
                  factorCovariance={v2?.factor_covariance as Record<string, unknown> | undefined}
                />
              ),
            },
            {
              id: "constraints",
              label: "Constraints",
              content: (
                <ConstraintsTab
                  capitalAdequacy={v2?.capital_adequacy as Record<string, unknown> | undefined}
                  concentration={v2?.concentration as Record<string, unknown> | undefined}
                  marginBreakdown={v2?.margin_breakdown as Record<string, unknown> | undefined}
                  hedgeBands={v2?.hedge_bands as Record<string, unknown> | undefined}
                  transactionCosts={v2?.transaction_costs as Record<string, unknown> | undefined}
                />
              ),
            },
          ]}
        />
      </aside>

      {/* Hero — center */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {error && <ErrorBanner code={error.code} message={error.message} />}

        {DEMO_MODE && (
          <DemoFixtureSelector fixtureId={fixtureId} loading={sandboxLoading} onSelect={handleRunDemo} />
        )}

        {!sandboxResult && !sandboxLoading && (
          DEMO_MODE ? null : (
            <EmptyState
              type="empty"
              title="No simulation data"
              message="Upload exposure positions via the Ingestion Desk to run a hedge calculation."
              action={{ label: "Go to Ingestion Desk", onClick: () => router.push("/input") }}
            />
          )
        )}
        {sandboxLoading && <EmptyState type="loading" message="Running simulation…" />}

        {sandboxResult && waterfall && (
          <>
            <div className="grid grid-cols-5 gap-3">
              <KpiTile label="Integrity" value={`${waterfall.integrity_score}/100`} deltaDirection={waterfall.integrity_score >= 80 ? "positive" : "negative"} />
              <KpiTile label="Status" value={waterfall.overall_status} />
              <KpiTile label="Rules Passed" value={`${waterfall.rules.filter((r: { status: string }) => r.status === "PASS").length}/${waterfall.rules.length}`} />
              <KpiTile label="Run ID" value={sandboxResult.run_id.slice(0, 8)} />
              <KpiTile label="V2 Modules" value={v2ModuleCount.toString()} />
            </div>

            <WaterfallEngine
              waterfall={waterfall}
              runId={sandboxResult.run_id}
              v2ModuleCount={v2ModuleCount}
              onRuleClick={(r) => handleXRay({ tab: "rule", data: r })}
              onXRay={() => handleXRay({ tab: "waterfall", data: waterfall })}
            />

            <AllocatorSummary
              allocatorResult={v2?.allocator_result as Record<string, unknown> | undefined}
              currencyNetting={v2?.currency_netting as Record<string, unknown> | undefined}
            />
          </>
        )}

        {/* Scenario Stress Tester — always visible */}
        <ScenarioStressTester
          sandboxResult={sandboxResult}
          defaultPolicy={DEFAULT_DEMO_POLICY}
          defaultSpot={DEFAULT_DEMO_MARKET.spot_usdmxn}
        />
      </div>

      {/* Right Rail — 30% */}
      <aside className="w-[30%] min-w-[280px] border-l border-[var(--border-rim)] bg-[var(--bg-panel)] overflow-auto">
        <RailTabs
          tabs={[
            { id: "impact", label: "Before/After", content: <BeforeAfterTab worstCase={v2?.worst_case as Record<string, unknown> | undefined} marginSummary={v2?.margin_summary as Record<string, unknown> | undefined} /> },
            { id: "liquidity", label: "Liquidity", content: <LiquidityTab liquidityResult={v2?.liquidity_result as Record<string, unknown> | undefined} liquidityRegime={v2?.liquidity_regime as Record<string, unknown> | undefined} /> },
            { id: "rolls", label: "Rolls", content: <RollsTab rollLadder={v2?.roll_ladder as Record<string, unknown> | undefined} /> },
            { id: "scenarios", label: "Scenarios", content: <ScenariosTab extendedScenarios={v2?.extended_scenarios as Record<string, unknown> | undefined} scenarioResults={scenarioResults} /> },
          ]}
        />
      </aside>

      {/* X-Ray Drawer */}
      <XRayDrawer
        open={xrayOpen}
        onClose={() => dispatch(setXRayOpen(false))}
        title="X-Ray Inspector"
        tabs={[
          { id: "trace", label: "Trace", content: <JsonViewer data={sandboxResult?.trace_events ?? []} initialExpanded={false} /> },
          { id: "hashes", label: "Hashes", content: <JsonViewer data={sandboxResult?.run_envelope ?? {}} initialExpanded /> },
          { id: "raw", label: "Raw Data", content: <JsonViewer data={sandboxResult ?? {}} initialExpanded={false} /> },
        ]}
      />
    </div>
  );
}
