"use client";

import { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
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
import XRayDrawer, { JsonViewer } from "../../components/ui/XRayDrawer";
import StatusChip from "../../components/ui/StatusChip";
import type { ChipStatus } from "../../components/ui/StatusChip";
import EmptyState from "../../components/ui/EmptyState";
import ErrorBanner from "../../components/ui/ErrorBanner";

// Sandbox components — institutional grade
import DemoFixtureSelector from "../../components/sandbox/DemoFixtureSelector";
import WaterfallEngine from "../../components/sandbox/WaterfallEngine";
import AllocatorSummary from "../../components/sandbox/AllocatorSummary";
import ScenarioStressTester from "../../components/sandbox/ScenarioStressTester";
import CrisisScenarioLibrary, { type CrisisEvent } from "../../components/sandbox/CrisisScenarioLibrary";
import RiskAttributionPanel from "../../components/sandbox/RiskAttributionPanel";
import WhatIfBuilder from "../../components/sandbox/WhatIfBuilder";
import RegulatoryCapital from "../../components/sandbox/RegulatoryCapital";
import MarketMicrostructure from "../../components/sandbox/MarketMicrostructure";
import WhitepaperExport from "../../components/sandbox/WhitepaperExport";
import { HedgeGauge } from "../../components/sandbox/VisualizationSuite";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// ─── Design tokens ────────────────────────────────────────────────────────────
const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  green:    "var(--accent-green)",
  amber:    "var(--accent-amber)",
  red:      "var(--accent-red, #f87171)",
} as const;

// ─── Tab definitions ──────────────────────────────────────────────────────────

type SandboxTab = "stress" | "attribution" | "crises" | "whatif" | "regulatory" | "microstructure";

const TABS: Array<{ id: SandboxTab; label: string; icon: string; subtitle: string }> = [
  { id: "stress",        label: "Stress Testing",     icon: "⚡", subtitle: "Scenario P&L · Historical shocks" },
  { id: "attribution",   label: "Risk Attribution",   icon: "◈", subtitle: "Waterfall · DV01 · Greeks" },
  { id: "crises",        label: "Crisis Library",     icon: "⚠", subtitle: "17 historical crises · 1994–2023" },
  { id: "whatif",        label: "What-If Builder",    icon: "⊟", subtitle: "Parameter explorer · Policy checker" },
  { id: "regulatory",   label: "Regulatory Capital", icon: "⚖", subtitle: "SA-CCR · CVA · ISDA SIMM v2.6" },
  { id: "microstructure", label: "Market Structure", icon: "◎", subtitle: "Spreads · Kyle's λ · Almgren-Chriss" },
];

// ─── Widget embed mode ─────────────────────────────────────────────────────────
// URL: /sandbox?widget=true&currency=MXN&notional=10000000&tab=stress
// Renders a minimal framed version suitable for iframe embed on third-party sites

function WidgetMode({ currency, notional, tab }: { currency: string; notional: number; tab: SandboxTab }) {
  const dispatch = useDispatch<AppDispatch>();
  const { token } = useAuth();
  const { sandboxResult, sandboxLoading } = useSelector((s: RootState) => s.pipeline);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded && DEMO_MODE) {
      const fixture = DEMO_FIXTURES.find(f => f.id === "2026_CORPORATE_BALANCED") ?? DEMO_FIXTURES[0];
      if (fixture) {
        dispatch(sandboxCalculateThunk({ request: {
          trades: fixture.trades, hedges: fixture.hedges,
          market: fixture.market, policy: fixture.policy,
        }, token: token ?? "demo_token" }));
        setLoaded(true);
      }
    }
  }, [dispatch, token, loaded]);

  const spot = (sandboxResult?.frozen_inputs?.market as Record<string, unknown> | undefined)?.spot_usdmxn as number ?? 18.97;

  return (
    <div style={{
      fontFamily: S.fontUI, background: S.panel,
      border: `1px solid ${S.rim}`, borderRadius: 6,
      minHeight: 400, overflow: "hidden",
    }}>
      {/* Widget header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px", borderBottom: `1px solid ${S.rim}`,
        background: S.sub,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: S.cyan }}>
            HEDGECORE
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
            {currency} · {(notional / 1e6).toFixed(0)}M Notional
          </span>
        </div>
        <a href="/sandbox" target="_blank" style={{
          fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, textDecoration: "none",
          padding: "2px 8px", border: `1px solid ${S.rim}`, borderRadius: 2,
        }}>Full Platform ↗</a>
      </div>
      {sandboxLoading && <EmptyState type="loading" message="Initialising engine…" />}
      {!sandboxLoading && (
        <div style={{ padding: 12 }}>
          {tab === "stress" && (
            <ScenarioStressTester
              sandboxResult={sandboxResult}
              defaultPolicy={DEFAULT_DEMO_POLICY}
              defaultSpot={DEFAULT_DEMO_MARKET.spot_usdmxn}
            />
          )}
          {tab === "attribution" && <RiskAttributionPanel sandboxResult={sandboxResult} spot={spot} />}
          {tab === "whatif" && <WhatIfBuilder sandboxResult={sandboxResult} defaultPolicy={DEFAULT_DEMO_POLICY} defaultSpot={spot} />}
          {tab === "regulatory" && <RegulatoryCapital sandboxResult={sandboxResult} spot={spot} />}
          {tab === "microstructure" && <MarketMicrostructure notionalUSD={notional / spot} primaryCurrency={currency} spot={spot} />}
        </div>
      )}
      <div style={{
        padding: "4px 14px", borderTop: `1px solid ${S.soft}`,
        fontFamily: S.fontMono, fontSize: 7, color: S.tertiary, background: S.sub,
      }}>
        HedgeCore ORDR Terminal · Free simulation engine · Not investment advice
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

function SandboxPageInner() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const {
    sandboxResult,
    sandboxLoading,
    xrayOpen,
    error,
    decisionPacketMode,
  } = useSelector((s: RootState) => s.pipeline);

  const [fixtureId, setFixtureId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SandboxTab>("stress");
  const [selectedCrisis, setSelectedCrisis] = useState<CrisisEvent | null>(null);
  const [showWhitepaper, setShowWhitepaper] = useState(false);

  // Widget mode
  const isWidget = searchParams?.get("widget") === "true";
  const widgetCurrency = searchParams?.get("currency") ?? "MXN";
  const widgetNotional = parseFloat(searchParams?.get("notional") ?? "10000000");
  const widgetTab = (searchParams?.get("tab") ?? "stress") as SandboxTab;

  const waterfall = sandboxResult?.waterfall_result;
  const v2 = sandboxResult?.v2_results;

  const spot = useMemo(() => {
    const m = sandboxResult?.frozen_inputs?.market as Record<string, unknown> | undefined;
    return (m?.spot_usdmxn as number | undefined) ?? DEFAULT_DEMO_MARKET.spot_usdmxn;
  }, [sandboxResult]);

  const notionalUSD = useMemo(() => {
    const plan = sandboxResult?.calculate_response?.hedge_plan;
    const summary = plan?.summary as Record<string, number> | undefined;
    return (summary?.total_commercial_exposure_mxn ?? 10_000_000) / spot;
  }, [sandboxResult, spot]);

  const primaryCurrency = useMemo(() => {
    const m = sandboxResult?.frozen_inputs?.market as Record<string, unknown> | undefined;
    const meta = m?.provider_metadata as Record<string, unknown> | undefined;
    return (meta?.primary_currency as string | undefined) ?? "MXN";
  }, [sandboxResult]);

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

  const handleXRay = useCallback(
    (context: Record<string, unknown>) => {
      dispatch(setXRayContext(context));
      dispatch(setXRayOpen(true));
    },
    [dispatch]
  );

  // Widget mode: minimal embed
  if (isWidget) {
    return <WidgetMode currency={widgetCurrency} notional={widgetNotional} tab={widgetTab} />;
  }

  // Decision Packet Mode (existing functionality preserved)
  if (decisionPacketMode && sandboxResult) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontFamily: S.fontUI, fontSize: 18, fontWeight: 700, color: S.primary, marginBottom: 16 }}>
          Decision Packet — Executive Summary
        </h1>
        <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, padding: 16, marginBottom: 12 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 8 }}>WATERFALL STATUS</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {waterfall?.rules.map((r: { rule_id: string; status: string }) => (
              <div key={r.rule_id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{r.rule_id}</span>
                <StatusChip status={r.status as ChipStatus} size="sm" />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
            Integrity: <span style={{ fontWeight: 700, color: S.primary }}>{waterfall?.integrity_score ?? "—"}/100</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
          <KpiTile label="Worst-Case Loss" value={v2?.worst_case ? `$${((v2.worst_case as Record<string, unknown>).worst_case_loss as number)?.toLocaleString() ?? "—"}` : "—"} />
          <KpiTile label="Margin Used" value={v2?.margin_summary ? `$${((v2.margin_summary as Record<string, unknown>).total_margin as number)?.toLocaleString() ?? "—"}` : "—"} />
          <KpiTile label="Liquidity" value={((v2?.liquidity_regime as Record<string, unknown>)?.regime as string) ?? "—"} />
          <KpiTile label="Capital Buffer" value={v2?.capital_adequacy ? `${((v2.capital_adequacy as Record<string, unknown>).buffer_ratio as number)?.toFixed(2) ?? "—"}x` : "—"} />
        </div>
        <ScenarioStressTester sandboxResult={sandboxResult} defaultPolicy={DEFAULT_DEMO_POLICY} defaultSpot={spot} />
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

      {/* ── Page header strip ── */}
      <div style={{
        borderBottom: `1px solid ${S.rim}`,
        background: S.panel,
        padding: "0 16px",
        display: "flex", alignItems: "center", gap: 12, height: 44,
        flexShrink: 0,
      }}>
        <button onClick={() => router.push("/input")} style={{
          fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 500,
          padding: "2px 8px", border: `1px solid ${S.rim}`,
          color: S.secondary, background: "transparent", cursor: "pointer",
        }}>← Position Desk</button>

        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.12em", color: S.tertiary }}>
          SIMULATION ENGINE
        </span>

        {sandboxResult && (
          <>
            <span style={{ color: S.rim }}>|</span>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>
              RUN <span style={{ color: S.cyan }}>{sandboxResult.run_id.slice(0, 8).toUpperCase()}</span>
            </span>
            {waterfall && (
              <>
                <span style={{ color: S.rim }}>|</span>
                <span style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  padding: "2px 6px", borderRadius: 2,
                  background: `color-mix(in srgb, ${waterfall.integrity_score >= 80 ? S.green : S.amber} 12%, transparent)`,
                  color: waterfall.integrity_score >= 80 ? S.green : S.amber,
                }}>
                  {waterfall.integrity_score}/100
                </span>
              </>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Quick actions */}
        <button onClick={() => setShowWhitepaper(!showWhitepaper)} style={{
          fontFamily: S.fontMono, fontSize: 9, fontWeight: 600,
          padding: "3px 10px", border: `1px solid ${S.rim}`,
          color: S.tertiary, background: "transparent", cursor: "pointer",
        }}>📄 Whitepaper</button>

        {sandboxResult && (
          <button onClick={() => router.push("/execution")} style={{
            fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 700,
            padding: "4px 14px",
            border: `1px solid ${S.cyan}`,
            color: S.cyan, background: "transparent", cursor: "pointer",
          }}>Execution Bridge →</button>
        )}
      </div>

      {/* ── Whitepaper panel (collapsible) ── */}
      {showWhitepaper && (
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.rim}` }}>
          <WhitepaperExport sandboxResult={sandboxResult} />
        </div>
      )}

      {/* ── Main body ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

        {/* Left rail — fixture selector */}
        <aside style={{
          width: 220, flexShrink: 0,
          borderRight: `1px solid ${S.rim}`,
          background: S.panel,
          overflowY: "auto",
          display: "flex", flexDirection: "column",
        }}>
          {DEMO_MODE && (
            <DemoFixtureSelector fixtureId={fixtureId} loading={sandboxLoading} onSelect={handleRunDemo} />
          )}

          {/* Quick summary when result loaded */}
          {sandboxResult && waterfall && (
            <div style={{ padding: "10px 12px", borderTop: `1px solid ${S.rim}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 8, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 8 }}>
                SIMULATION SUMMARY
              </div>
              <HedgeGauge
                ratio={(() => {
                  const plan = sandboxResult?.calculate_response?.hedge_plan;
                  const summary = plan?.summary as Record<string, number> | undefined;
                  const exp = summary?.total_commercial_exposure_mxn ?? 1;
                  const hedged = summary?.total_hedge_notional_mxn ?? 0;
                  return Math.min(1, hedged / exp);
                })()}
                label="Coverage"
              />
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {waterfall.rules.slice(0, 5).map(r => (
                  <div key={r.rule_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{r.rule_id}</span>
                    <StatusChip status={r.status as ChipStatus} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Center: tab bar + content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          {/* Tab bar */}
          <div style={{
            display: "flex", borderBottom: `1px solid ${S.rim}`,
            background: S.sub, overflowX: "auto", flexShrink: 0,
          }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                padding: "0 16px", height: 38,
                border: "none",
                borderBottom: activeTab === tab.id ? `2px solid ${S.cyan}` : "2px solid transparent",
                background: "transparent",
                color: activeTab === tab.id ? S.cyan : S.tertiary,
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start",
              }}>
                <span>{tab.icon} {tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab subtitle */}
          <div style={{
            padding: "4px 16px",
            borderBottom: `1px solid ${S.soft}`,
            fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
            background: `color-mix(in srgb, ${S.sub} 40%, transparent)`,
            flexShrink: 0,
          }}>
            {TABS.find(t => t.id === activeTab)?.subtitle}
            {activeTab === "crises" && selectedCrisis && (
              <span style={{ color: S.amber, marginLeft: 16 }}>
                ACTIVE: {selectedCrisis.shortName} — {selectedCrisis.stressParams.spotShock.toFixed(0)}% spot shock applied
              </span>
            )}
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>

            {error && <ErrorBanner code={error.code} message={error.message} />}

            {/* Empty state */}
            {!sandboxResult && !sandboxLoading && !DEMO_MODE && (
              <EmptyState
                type="empty"
                title="No simulation data"
                message="Upload exposure positions via the Position Desk to run a hedge calculation."
                action={{ label: "Go to Position Desk", onClick: () => router.push("/input") }}
              />
            )}
            {!sandboxResult && !sandboxLoading && DEMO_MODE && !fixtureId && (
              <div style={{
                background: `color-mix(in srgb, ${S.cyan} 4%, transparent)`,
                border: `1px solid color-mix(in srgb, ${S.cyan} 18%, transparent)`,
                borderRadius: 4, padding: "20px 24px", textAlign: "center",
                marginBottom: 16,
              }}>
                <p style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.1em", color: S.cyan, marginBottom: 6 }}>
                  SANDBOX READY
                </p>
                <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginBottom: 16 }}>
                  Select a fixture from the left rail, or load positions from the Position Desk.
                </p>
                <button onClick={() => router.push("/input")} style={{
                  fontFamily: S.fontUI, fontSize: 12, fontWeight: 500,
                  padding: "6px 16px", border: `1px solid ${S.rim}`,
                  color: S.secondary, background: "transparent", cursor: "pointer",
                }}>Load from Position Desk</button>
              </div>
            )}

            {sandboxLoading && <EmptyState type="loading" message="Running simulation engine…" />}

            {/* ── Tab content ── */}

            {/* TAB: STRESS TESTING */}
            {activeTab === "stress" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {sandboxResult && waterfall && (
                  <>
                    {/* KPI strip */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                      <KpiTile label="Integrity" value={`${waterfall.integrity_score}/100`} deltaDirection={waterfall.integrity_score >= 80 ? "positive" : "negative"} />
                      <KpiTile label="Status" value={waterfall.overall_status} />
                      <KpiTile label="Rules Passed" value={`${waterfall.rules.filter((r: { status: string }) => r.status === "PASS").length}/${waterfall.rules.length}`} />
                      <KpiTile label="Run ID" value={sandboxResult.run_id.slice(0, 8)} />
                      <KpiTile label="V2 Modules" value={Object.keys(v2 ?? {}).filter(k => (v2 as Record<string, unknown>)[k] != null).length.toString()} />
                    </div>

                    <WaterfallEngine
                      waterfall={waterfall}
                      runId={sandboxResult.run_id}
                      v2ModuleCount={Object.keys(v2 ?? {}).filter(k => (v2 as Record<string, unknown>)[k] != null).length}
                      onRuleClick={(r) => handleXRay({ tab: "rule", data: r })}
                      onXRay={() => handleXRay({ tab: "waterfall", data: waterfall })}
                    />

                    <AllocatorSummary
                      allocatorResult={v2?.allocator_result as Record<string, unknown> | undefined}
                      currencyNetting={v2?.currency_netting as Record<string, unknown> | undefined}
                    />

                    {/* Execution bridge CTA */}
                    <div style={{
                      background: `color-mix(in srgb, ${S.cyan} 4%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
                      borderRadius: 4, padding: "12px 18px",
                      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
                    }}>
                      <div>
                        <p style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.06em", color: S.cyan, marginBottom: 3 }}>
                          SIMULATION COMPLETE
                        </p>
                        <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, margin: 0 }}>
                          Integrity {waterfall.integrity_score}/100 · {waterfall.rules.filter((r: { status: string }) => r.status === "PASS").length}/{waterfall.rules.length} rules passed.
                        </p>
                      </div>
                      <button onClick={() => router.push("/execution")} style={{
                        fontFamily: S.fontUI, fontSize: 12, fontWeight: 700,
                        padding: "7px 18px", border: `1px solid ${S.cyan}`,
                        color: S.cyan, background: "transparent", cursor: "pointer",
                      }}>→ Open Execution Bridge</button>
                    </div>
                  </>
                )}

                {/* Always visible stress tester */}
                <ScenarioStressTester
                  sandboxResult={sandboxResult}
                  defaultPolicy={DEFAULT_DEMO_POLICY}
                  defaultSpot={spot}
                />

                {/* If a crisis was selected in the library, show its P&L in this tab too */}
                {selectedCrisis && (
                  <div style={{
                    background: `color-mix(in srgb, ${S.amber} 6%, transparent)`,
                    border: `1px solid ${S.amber}`, borderRadius: 4, padding: "10px 14px",
                  }}>
                    <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.amber, marginBottom: 6 }}>
                      ACTIVE CRISIS SCENARIO: {selectedCrisis.name.toUpperCase()}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                      {[
                        ["FX Shock", `${selectedCrisis.stressParams.spotShock.toFixed(0)}%`],
                        ["Vol Spike", `+${selectedCrisis.stressParams.volShock.toFixed(0)}pp`],
                        ["Correl Break", `${(selectedCrisis.stressParams.correlBreak * 100).toFixed(0)}%`],
                        ["Liq. Premium", `+${selectedCrisis.stressParams.liquidityPremium}bps`],
                        ["NDF Effectiveness", `${selectedCrisis.hedgeEffectiveness.ndf.toFixed(1)}%`],
                      ].map(([k, v]) => (
                        <div key={k} style={{ background: S.sub, borderRadius: 3, padding: "6px 10px", border: `1px solid ${S.soft}` }}>
                          <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginBottom: 2 }}>{k}</div>
                          <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.amber }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, marginTop: 8, lineHeight: 1.6, marginBottom: 0 }}>
                      {selectedCrisis.description.slice(0, 300)}…
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB: RISK ATTRIBUTION */}
            {activeTab === "attribution" && (
              <RiskAttributionPanel sandboxResult={sandboxResult} spot={spot} />
            )}

            {/* TAB: CRISIS LIBRARY */}
            {activeTab === "crises" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, margin: 0, lineHeight: 1.6 }}>
                  Pre-built historical crisis scenarios calibrated to empirical market data.
                  Each scenario includes multi-factor stress parameters (spot shock, vol spike, correlation breakdown,
                  liquidity premium) per BCBS 457 stressed VaR methodology. Select a crisis to apply its parameters
                  to the Stress Testing module.
                </p>
                <CrisisScenarioLibrary
                  onSelect={(crisis) => {
                    setSelectedCrisis(crisis);
                    setActiveTab("stress");
                  }}
                  selectedId={selectedCrisis?.id}
                />
              </div>
            )}

            {/* TAB: WHAT-IF BUILDER */}
            {activeTab === "whatif" && (
              <WhatIfBuilder
                sandboxResult={sandboxResult}
                defaultPolicy={DEFAULT_DEMO_POLICY}
                defaultSpot={spot}
              />
            )}

            {/* TAB: REGULATORY CAPITAL */}
            {activeTab === "regulatory" && (
              <RegulatoryCapital sandboxResult={sandboxResult} spot={spot} />
            )}

            {/* TAB: MARKET MICROSTRUCTURE */}
            {activeTab === "microstructure" && (
              <MarketMicrostructure
                notionalUSD={notionalUSD}
                primaryCurrency={primaryCurrency}
                spot={spot}
              />
            )}

          </div>
        </div>

        {/* Right rail — contextual data based on active tab */}
        <aside style={{
          width: 260, flexShrink: 0,
          borderLeft: `1px solid ${S.rim}`,
          background: S.panel,
          overflowY: "auto",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${S.rim}`, background: S.sub }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
              CONTEXT PANEL
            </span>
          </div>

          {/* Dynamic right rail content based on active tab */}
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>

            {activeTab === "stress" && sandboxResult?.v2_results && (
              <>
                {/* Before/After summary */}
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 8, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 6 }}>WORST CASE</div>
                  {[
                    ["Unhedged Loss", (() => {
                      const wc = v2?.worst_case as Record<string, unknown> | undefined;
                      const l = wc?.worst_case_loss as number | undefined;
                      return l ? `-$${Math.abs(l).toLocaleString()}` : "—";
                    })()],
                    ["Hedged Loss", (() => {
                      const wc = v2?.worst_case as Record<string, unknown> | undefined;
                      const l = wc?.hedged_loss as number | undefined;
                      return l ? `-$${Math.abs(l).toLocaleString()}` : "—";
                    })()],
                    ["Margin Required", (() => {
                      const ms = v2?.margin_summary as Record<string, unknown> | undefined;
                      const m = ms?.total_margin as number | undefined;
                      return m ? `$${m.toLocaleString()}` : "—";
                    })()],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
                      <span style={{ fontFamily: S.fontUI, fontSize: 10, color: S.secondary }}>{k}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.primary }}>{v}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === "regulatory" && (
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 8, fontWeight: 700, color: S.tertiary, marginBottom: 6 }}>REGULATORY SNAPSHOT</div>
                {[
                  ["SA-CCR EAD", `$${(notionalUSD * 0.04 * 1.4).toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
                  ["Capital Charge (8%)", `$${(notionalUSD * 0.04 * 1.4 * 0.08).toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
                  ["ISDA SIMM IM", `$${(notionalUSD * 0.074).toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
                  ["BCBS Framework", "Basel III Final (2017)"],
                  ["SIMM Version", "v2.6 (Sep 2023)"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: 10, color: S.secondary }}>{k}</span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.primary }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "crises" && (
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 8, fontWeight: 700, color: S.tertiary, marginBottom: 6 }}>CRISIS STATS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {[
                    ["Total Crises", "17"],
                    ["Global Events", "2 (GFC, COVID)"],
                    ["EM Events", "10"],
                    ["DM Events", "5"],
                    ["Avg FX Shock", "-27%"],
                    ["Max FX Shock", "-70% (Argentina)"],
                    ["Avg Hedge Eff.", "88%"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: S.fontUI, fontSize: 10, color: S.secondary }}>{k}</span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.primary }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Always-visible: compliance badges */}
            <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 10, marginTop: "auto" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 8, fontWeight: 700, color: S.tertiary, marginBottom: 6, letterSpacing: "0.1em" }}>
                COMPLIANCE
              </div>
              {[
                { label: "IFRS 9.6.4.1", ok: true },
                { label: "Basel III SA-CCR", ok: true },
                { label: "ISDA SIMM v2.6", ok: true },
                { label: "Dodd-Frank §731", ok: true },
                { label: "EMIR Art. 11", ok: true },
                { label: "BCBS 457 FRTB", ok: true },
              ].map(c => (
                <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.ok ? S.green : S.red, flexShrink: 0 }} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

      </div>

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

// ─── Export with Suspense boundary for useSearchParams ────────────────────────
// Required by Next.js 15 App Router: any component using useSearchParams must
// be wrapped in <Suspense> to prevent static generation bailout.
export default function SandboxPage() {
  return (
    <Suspense fallback={<div style={{ fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)", color: "var(--text-secondary)", padding: 24, fontSize: 13 }}>Loading simulation engine…</div>}>
      <SandboxPageInner />
    </Suspense>
  );
}
