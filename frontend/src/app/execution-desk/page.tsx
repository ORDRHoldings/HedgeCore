"use client";

/**
 * /execution-desk — Institutional Position Execution Hub
 *
 * ORDR Terminal's nerve center for converting policy-assigned positions
 * into executable hedge transactions. Inspired by Bloomberg FXGO and
 * BlackRock Aladdin execution workstations.
 *
 * WORKFLOW:
 *   Policy Desk → Execution Desk → Simulation/Testing → Hedge Plan → IBKR Execution
 *
 * CAPABILITIES:
 *   1. Position Queue       - Smart filters, bulk selection, policy verification
 *   2. Monte Carlo Sim      - 10K paths, confidence intervals, tail risk
 *   3. Stress Testing       - Market shocks, correlation breaks, liquidity crises
 *   4. Hedge Plan Builder   - Constraint solver, instrument optimization
 *   5. IBKR Payload Gen     - FIX message preview, validation, export
 *   6. Risk Metrics         - VaR, CVaR, Greeks, P&L attribution
 *   7. Execution Checklist  - 4-eyes approval readiness, compliance checks
 *
 * DESIGN PRINCIPLES:
 *   - Information density without clutter (terminal-grade)
 *   - Progressive disclosure (simple surface, powerful depth)
 *   - Action-oriented (clear CTAs, <3 clicks to execute)
 *   - Risk-aware (visual indicators, confirmation flows)
 *   - Keyboard-first (shortcuts for all actions)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { useAuth } from "@/lib/authContext";
import type { AppDispatch, RootState } from "@/lib/store";
import { listPositionsThunk } from "@/lib/store/slices/positionSlice";
import type { PositionRow } from "@/api/positionClient";
import HelpPanel from "@/components/layout/HelpPanel";
import { EXECUTION_DESK_HELP } from "@/lib/helpContent";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import {
  runMonteCarloSimulation,
  calculatePortfolioRisk,
  generateIBKRPayload,
  performComplianceChecks,
  optimizeHedgePlan,
  type MonteCarloResult,
  type PortfolioRisk,
  type ComplianceCheck,
  type HedgePlan,
} from "@/utils/executionAnalytics";

const S = {
  fontUI:      "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:    "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:      "var(--bg-deep)",
  bgPanel:     "var(--bg-panel)",
  bgSub:       "var(--bg-sub)",
  rim:         "var(--border-rim)",
  soft:        "var(--border-soft)",
  primary:     "var(--text-primary)",
  secondary:   "var(--text-secondary)",
  tertiary:    "var(--text-tertiary)",
  cyan:        "var(--accent-cyan)",
  amber:       "var(--accent-amber)",
  pass:        "var(--status-pass,#22c55e)",
  fail:        "var(--accent-red,#ef4444)",
  neutral:     "#6b7280",
  darkBorder:  "#374151",
} as const;

type ActionMode = "SIMULATE" | "STRESS_TEST" | "HEDGE_PLAN" | "IBKR_EXECUTE" | "COMPLIANCE" | null;

interface StressScenario {
  id: string;
  name: string;
  description: string;
  shocks: { currency: string; change: number }[];
}

const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: "2008_crisis",
    name: "2008 Financial Crisis",
    description: "Lehman collapse scenario: USD strengthens 15%, liquidity dries up",
    shocks: [{ currency: "USD", change: 0.15 }],
  },
  {
    id: "covid_shock",
    name: "COVID-19 March 2020",
    description: "Pandemic shock: Flight to safety, USD up 8%, EM down 20%",
    shocks: [{ currency: "USD", change: 0.08 }],
  },
  {
    id: "em_crisis",
    name: "EM Currency Crisis",
    description: "Emerging market stress: MXN/BRL/TRY down 25%",
    shocks: [{ currency: "MXN", change: -0.25 }],
  },
];

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  return s ? s.slice(0, 10) : "—";
}

function shortId(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 8).toUpperCase();
}

/**
 * P&L Distribution Histogram with VaR/CVaR markers
 */
function PnLDistributionChart({ result, height = 300 }: { result: MonteCarloResult; height?: number }) {
  // Convert histogram bins to chart data
  const binCount = result.distribution.length;
  const min = result.worstCase;
  const max = result.bestCase;
  const binWidth = (max - min) / binCount;

  const histogramData = result.distribution.map((count, idx) => {
    const binStart = min + idx * binWidth;
    const binCenter = binStart + binWidth / 2;
    return { x: binCenter, y: count };
  });

  const option: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#1A2535EE",
      borderColor: S.darkBorder,
      borderWidth: 1,
      textStyle: { color: S.primary, fontSize: 10, fontFamily: S.fontMono },
      formatter: (params: unknown) => {
        const arr = params as Array<{ axisValue: number; data: number }>;
        if (arr.length === 0) return "";
        const x = arr[0].axisValue;
        const count = arr[0].data;
        return `<b>P&L: $${fmtAmt(x)}</b><br/>Frequency: ${count}`;
      },
    },
    grid: { left: 60, right: 20, top: 30, bottom: 50 },
    xAxis: {
      type: "value",
      name: "P&L ($)",
      nameLocation: "center",
      nameGap: 30,
      nameTextStyle: { color: S.tertiary, fontSize: 10, fontFamily: S.fontMono },
      axisLabel: {
        color: S.tertiary,
        fontSize: 9,
        fontFamily: S.fontMono,
        formatter: (v: number) =>
          v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
          : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K`
          : v <= -1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
          : v <= -1_000 ? `${(v / 1_000).toFixed(0)}K`
          : v.toFixed(0),
      },
      axisLine: { lineStyle: { color: S.darkBorder } },
      splitLine: { lineStyle: { color: S.darkBorder, type: "dashed", opacity: 0.3 } },
    },
    yAxis: {
      type: "value",
      name: "Frequency",
      nameTextStyle: { color: S.tertiary, fontSize: 10, fontFamily: S.fontMono },
      axisLabel: { color: S.tertiary, fontSize: 9, fontFamily: S.fontMono },
      splitLine: { lineStyle: { color: S.darkBorder, type: "dashed", opacity: 0.3 } },
    },
    series: [
      // Histogram bars
      {
        type: "bar",
        data: histogramData.map(d => [d.x, d.y]),
        barWidth: "95%",
        itemStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: S.cyan + "DD" },
              { offset: 0.6, color: S.cyan + "BB" },
              { offset: 1, color: S.cyan + "88" },
            ],
          },
          borderRadius: [2, 2, 0, 0],
        },
        emphasis: {
          itemStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: S.cyan + "FF" },
                { offset: 1, color: S.cyan + "CC" },
              ],
            },
          },
        },
      },
    ],
    // Mark lines for VaR, CVaR, Mean
    markLine: {
      silent: true,
      symbol: "none",
      label: {
        show: true,
        position: "end",
        fontSize: 9,
        fontFamily: S.fontMono,
      },
      data: [
        {
          name: "Mean",
          xAxis: result.meanPnL,
          lineStyle: { color: S.primary, type: "solid", width: 2 },
          label: { formatter: "MEAN", color: S.primary },
        },
        {
          name: "VaR 95%",
          xAxis: result.var95,
          lineStyle: { color: S.amber, type: "dashed", width: 2 },
          label: { formatter: "VaR 95%", color: S.amber },
        },
        {
          name: "VaR 99%",
          xAxis: result.var99,
          lineStyle: { color: S.fail, type: "dashed", width: 2 },
          label: { formatter: "VaR 99%", color: S.fail },
        },
        {
          name: "CI Lower",
          xAxis: result.confidenceInterval.lower,
          lineStyle: { color: S.neutral, type: "dotted", width: 1 },
          label: { formatter: "95% CI", color: S.neutral },
        },
        {
          name: "CI Upper",
          xAxis: result.confidenceInterval.upper,
          lineStyle: { color: S.neutral, type: "dotted", width: 1 },
          label: { show: false },
        },
      ],
    },
  };

  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}

export default function ExecutionDeskPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user, token } = useAuth();
  const searchRef = useRef<HTMLInputElement>(null);

  const { positions, loading } = useSelector((s: RootState) => s.positions);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [simulationResults, setSimulationResults] = useState<Map<string, MonteCarloResult>>(new Map());
  const [portfolioRisk, setPortfolioRisk] = useState<PortfolioRisk | null>(null);
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([]);
  const [hedgePlans, setHedgePlans] = useState<Map<string, HedgePlan>>(new Map());
  const [stressScenario, setStressScenario] = useState<string>("");
  const [showRiskPanel, setShowRiskPanel] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);

  // Load positions on mount
  useEffect(() => {
    if (token) dispatch(listPositionsThunk({ token }));
  }, [token, dispatch]);

  // Filter: Only show POLICY_ASSIGNED positions (ready for execution)
  const readyPositions = useMemo(() => {
    let filtered = positions.filter((p) => p.execution_status === "POLICY_ASSIGNED");

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
  }, [positions, search]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const allSelected = readyPositions.length > 0 && readyPositions.every((p) => selected.has(p.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(readyPositions.map((p) => p.id)));
  }, [allSelected, readyPositions]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K → Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      // Escape → Clear search
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearch("");
        searchRef.current?.blur();
      }
      // Cmd/Ctrl + A → Select all
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        toggleSelectAll();
      }
      // R → Refresh
      if (e.key === "r" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        if (token) dispatch(listPositionsThunk({ token }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch, token, toggleSelectAll]);

  // Monte Carlo simulation (real implementation)
  const runSimulation = useCallback(async () => {
    setIsSimulating(true);
    const results = new Map<string, MonteCarloResult>();
    const selectedPositions = readyPositions.filter((p) => selected.has(p.id));

    // Run simulations (in chunks to avoid UI freeze)
    for (const pos of selectedPositions) {
      const result = runMonteCarloSimulation(pos, 10000, 30);
      results.set(pos.id, result);

      // Small delay to keep UI responsive
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    setSimulationResults(results);

    // Calculate portfolio-level risk
    const portRisk = calculatePortfolioRisk(selectedPositions, results);
    setPortfolioRisk(portRisk);

    setActionMode("SIMULATE");
    setIsSimulating(false);
  }, [selected, readyPositions]);

  // Run compliance checks
  const runComplianceChecks = useCallback(() => {
    const selectedPositions = readyPositions.filter((p) => selected.has(p.id));
    const checks = performComplianceChecks(selectedPositions);
    setComplianceChecks(checks);
    setActionMode("COMPLIANCE");
  }, [selected, readyPositions]);

  // Generate hedge plans
  const generateHedgePlans = useCallback(() => {
    const plans = new Map<string, HedgePlan>();
    const selectedPositions = readyPositions.filter((p) => selected.has(p.id));

    selectedPositions.forEach((pos) => {
      const plan = optimizeHedgePlan(pos, 75, 100);
      plans.set(pos.id, plan);
    });

    setHedgePlans(plans);
    setActionMode("HEDGE_PLAN");
  }, [selected, readyPositions]);

  // Export IBKR payload (real FIX format)
  const exportIBKRPayload = useCallback(() => {
    const selectedPositions = readyPositions.filter((p) => selected.has(p.id));
    const payload = generateIBKRPayload(
      selectedPositions,
      "DU1234567", // Demo account
      user?.email || "unknown"
    );

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ibkr-fix-payload-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    // Also show in UI
    setActionMode("IBKR_EXECUTE");
  }, [readyPositions, selected, user]);

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
            onClick={() => router.push("/dashboard")}
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.tertiary,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}>
            ← Dashboard
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
            Execution Desk
          </span>
          <span style={{
            fontFamily: S.fontMono,
            fontSize: 9,
            color: S.secondary,
            border: `1px solid ${S.rim}`,
            padding: "1px 5px",
          }}>
            EXECUTION HUB
          </span>
          {readyPositions.length > 0 && (
            <span style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 700,
              color: S.primary,
              background: S.bgSub,
              border: `1px solid ${S.darkBorder}`,
              padding: "1px 7px",
              letterSpacing: "0.06em",
            }}>
              {readyPositions.length} READY
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {positions.length} total positions
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
            onClick={() => router.push("/policy-desk")}
            style={{
              fontFamily: S.fontMono,
              fontSize: 10,
              color: S.primary,
              background: "transparent",
              border: `1px solid ${S.darkBorder}`,
              padding: "2px 8px",
              cursor: "pointer",
            }}>
            ← Policy Desk
          </button>
        </header>

        {/* Main workspace: 3-column layout */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* LEFT: Position Queue */}
          <div style={{
            width: 360,
            borderRight: `1px solid ${S.rim}`,
            display: "flex",
            flexDirection: "column",
            background: S.bgPanel,
          }}>
            {/* Search bar */}
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${S.soft}` }}>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search positions… (⌘K)"
                style={{
                  width: "100%",
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  padding: "6px 10px",
                  background: S.bgSub,
                  border: `1px solid ${S.rim}`,
                  color: S.primary,
                  outline: "none",
                }}
              />
            </div>

            {/* Selection controls */}
            {selected.size > 0 && (
              <div style={{
                padding: "8px 12px",
                background: S.bgSub,
                borderBottom: `1px solid ${S.soft}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.primary, fontWeight: 700 }}>
                  {selected.size} SELECTED
                </span>
                <button
                  onClick={() => setSelected(new Set())}
                  style={{
                    marginLeft: "auto",
                    fontFamily: S.fontMono,
                    fontSize: 9,
                    color: S.tertiary,
                    background: "transparent",
                    border: `1px solid ${S.rim}`,
                    padding: "2px 8px",
                    cursor: "pointer",
                  }}>
                  Clear
                </button>
              </div>
            )}

            {/* Position list */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {readyPositions.length === 0 ? (
                <div style={{
                  padding: 40,
                  textAlign: "center",
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  color: S.secondary,
                }}>
                  No positions ready for execution.
                  <br />
                  <br />
                  <button
                    onClick={() => router.push("/policy-desk")}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      color: S.primary,
                      background: "transparent",
                      border: `1px solid ${S.darkBorder}`,
                      padding: "4px 12px",
                      cursor: "pointer",
                    }}>
                    → Assign Policies
                  </button>
                </div>
              ) : (
                readyPositions.map((pos) => {
                  const isSelected = selected.has(pos.id);
                  return (
                    <div
                      key={pos.id}
                      onClick={() => toggleSelect(pos.id)}
                      style={{
                        padding: "10px 12px",
                        borderBottom: `1px solid ${S.soft}`,
                        background: isSelected ? S.bgSub : "transparent",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(pos.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: "pointer" }}
                        />
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary }}>
                          {pos.record_id}
                        </span>
                        <span style={{
                          fontFamily: S.fontMono,
                          fontSize: 9,
                          color: S.tertiary,
                          border: `1px solid ${S.rim}`,
                          padding: "1px 4px",
                        }}>
                          {pos.currency}
                        </span>
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, marginBottom: 4 }}>
                        {pos.entity}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary }}>
                          ${fmtAmt(pos.amount)}
                        </span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                          {fmtDate(pos.value_date)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom action bar */}
            <div style={{
              padding: "12px",
              borderTop: `1px solid ${S.rim}`,
              background: S.bgPanel,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}>
              <button
                onClick={() => toggleSelectAll()}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  color: S.primary,
                  background: "transparent",
                  border: `1px solid ${S.darkBorder}`,
                  padding: "5px 10px",
                  cursor: "pointer",
                  textAlign: "left",
                }}>
                {allSelected ? "Deselect All" : "Select All"} (⌘A)
              </button>
            </div>
          </div>

          {/* CENTER: Main workspace */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Action buttons */}
            <div style={{
              padding: "12px 20px",
              borderBottom: `1px solid ${S.soft}`,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              background: S.bgPanel,
            }}>
              <button
                onClick={runSimulation}
                disabled={selected.size === 0 || isSimulating}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: selected.size === 0 || isSimulating ? S.tertiary : S.primary,
                  background: selected.size === 0 || isSimulating ? S.bgSub : S.bgPanel,
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 14px",
                  cursor: selected.size === 0 || isSimulating ? "not-allowed" : "pointer",
                }}>
                {isSimulating ? "SIMULATING..." : "SIMULATE MONTE CARLO"}
              </button>
              <button
                onClick={() => setActionMode("STRESS_TEST")}
                disabled={selected.size === 0}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: selected.size === 0 ? S.tertiary : S.primary,
                  background: selected.size === 0 ? S.bgSub : S.bgPanel,
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 14px",
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                }}>
                STRESS TEST
              </button>
              <button
                onClick={generateHedgePlans}
                disabled={selected.size === 0}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: selected.size === 0 ? S.tertiary : S.primary,
                  background: selected.size === 0 ? S.bgSub : S.bgPanel,
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 14px",
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                }}>
                BUILD HEDGE PLAN
              </button>
              <button
                onClick={runComplianceChecks}
                disabled={selected.size === 0}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: selected.size === 0 ? S.tertiary : S.primary,
                  background: selected.size === 0 ? S.bgSub : S.bgPanel,
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 14px",
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                }}>
                COMPLIANCE CHECK
              </button>
              <button
                onClick={exportIBKRPayload}
                disabled={selected.size === 0}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: selected.size === 0 ? S.tertiary : S.primary,
                  background: selected.size === 0 ? S.bgSub : S.bgPanel,
                  border: `1px solid ${S.darkBorder}`,
                  padding: "6px 14px",
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                }}>
                ↓ EXPORT PAYLOAD
              </button>
            </div>

            {/* Workspace content */}
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              {!actionMode && selected.size === 0 && (
                <div style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}>
                  <div>
                    <div style={{
                      fontFamily: S.fontMono,
                      fontSize: 13,
                      fontWeight: 700,
                      color: S.primary,
                      marginBottom: 12,
                      letterSpacing: "0.06em",
                    }}>
                      EXECUTION DESK
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, maxWidth: 500, lineHeight: 1.6 }}>
                      Select positions from the queue to run simulations, stress tests,
                      build hedge plans, or generate IBKR execution payloads.
                      <br /><br />
                      Terminal-grade workflow designed for institutional execution standards.
                    </div>
                  </div>
                </div>
              )}

              {!actionMode && selected.size > 0 && (
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  color: S.secondary,
                  padding: 20,
                  border: `1px solid ${S.rim}`,
                  background: S.bgSub,
                }}>
                  <div style={{ fontWeight: 700, color: S.primary, marginBottom: 12 }}>
                    {selected.size} POSITION{selected.size > 1 ? "S" : ""} SELECTED
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    Total Notional: ${fmtAmt(
                      readyPositions
                        .filter((p) => selected.has(p.id))
                        .reduce((sum, p) => sum + p.amount, 0)
                    )}
                  </div>
                  <div>
                    Select an action from the toolbar above to proceed.
                  </div>
                </div>
              )}

              {actionMode === "SIMULATE" && simulationResults.size > 0 && (
                <div>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: S.primary,
                    marginBottom: 16,
                    letterSpacing: "0.06em",
                  }}>
                    MONTE CARLO SIMULATION RESULTS
                  </div>

                  {/* Portfolio-level risk metrics */}
                  {portfolioRisk && (
                    <div style={{
                      padding: 16,
                      border: `2px solid ${S.darkBorder}`,
                      background: S.bgPanel,
                      marginBottom: 16,
                    }}>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        fontWeight: 700,
                        color: S.primary,
                        marginBottom: 12,
                        letterSpacing: "0.06em",
                      }}>
                        PORTFOLIO RISK SUMMARY
                      </div>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 12,
                        fontFamily: S.fontMono,
                        fontSize: 10,
                      }}>
                        <div>
                          <div style={{ color: S.tertiary, marginBottom: 4 }}>Total Notional</div>
                          <div style={{ color: S.primary, fontWeight: 700 }}>${fmtAmt(portfolioRisk.totalNotional)}</div>
                        </div>
                        <div>
                          <div style={{ color: S.tertiary, marginBottom: 4 }}>Portfolio VaR 95%</div>
                          <div style={{ color: S.fail, fontWeight: 700 }}>${fmtAmt(portfolioRisk.totalVar95)}</div>
                        </div>
                        <div>
                          <div style={{ color: S.tertiary, marginBottom: 4 }}>Portfolio CVaR 95%</div>
                          <div style={{ color: S.fail }}>${fmtAmt(portfolioRisk.totalCVar95)}</div>
                        </div>
                        <div>
                          <div style={{ color: S.tertiary, marginBottom: 4 }}>Diversification Benefit</div>
                          <div style={{ color: S.pass }}>{portfolioRisk.diversificationBenefit.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: `1px solid ${S.soft}`,
                      }}>
                        <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginBottom: 8 }}>
                          Currency Breakdown:
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {portfolioRisk.currencyBreakdown.map((c) => (
                            <div key={c.currency} style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              color: S.primary,
                              background: S.bgSub,
                              padding: "4px 8px",
                              border: `1px solid ${S.rim}`,
                            }}>
                              {c.currency}: ${fmtAmt(c.notional)} ({c.percentage.toFixed(1)}%)
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Individual position results */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {Array.from(simulationResults.entries()).map(([posId, result]) => {
                      const pos = readyPositions.find((p) => p.id === posId);
                      if (!pos) return null;
                      return (
                        <div
                          key={posId}
                          style={{
                            padding: 16,
                            border: `1px solid ${S.rim}`,
                            background: S.bgSub,
                          }}>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 11,
                            fontWeight: 700,
                            color: S.primary,
                            marginBottom: 12,
                          }}>
                            {result.recordId} — {result.currency} ${fmtAmt(result.notional)}
                          </div>
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gap: 12,
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            marginBottom: 12,
                          }}>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Mean P&L</div>
                              <div style={{ color: S.primary, fontWeight: 700 }}>${fmtAmt(result.meanPnL)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Std Dev</div>
                              <div style={{ color: S.primary }}>${fmtAmt(result.stdDev)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>VaR 95%</div>
                              <div style={{ color: S.fail, fontWeight: 700 }}>${fmtAmt(result.var95)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>VaR 99%</div>
                              <div style={{ color: S.fail, fontWeight: 700 }}>${fmtAmt(result.var99)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>CVaR 95%</div>
                              <div style={{ color: S.fail }}>${fmtAmt(result.cvar95)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>CVaR 99%</div>
                              <div style={{ color: S.fail }}>${fmtAmt(result.cvar99)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Worst Case</div>
                              <div style={{ color: S.fail }}>${fmtAmt(result.worstCase)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Best Case</div>
                              <div style={{ color: S.pass }}>${fmtAmt(result.bestCase)}</div>
                            </div>
                          </div>
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 12,
                            paddingTop: 12,
                            borderTop: `1px solid ${S.soft}`,
                            fontFamily: S.fontMono,
                            fontSize: 10,
                          }}>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>95% Confidence Interval</div>
                              <div style={{ color: S.primary }}>
                                ${fmtAmt(result.confidenceInterval.lower)} to ${fmtAmt(result.confidenceInterval.upper)}
                              </div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Simulation Info</div>
                              <div style={{ color: S.primary }}>
                                {result.paths.toLocaleString()} paths × 30-day horizon
                              </div>
                            </div>
                          </div>

                          {/* P&L Distribution Visualization */}
                          <div style={{
                            marginTop: 16,
                            paddingTop: 16,
                            borderTop: `1px solid ${S.soft}`,
                          }}>
                            <div style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              color: S.tertiary,
                              marginBottom: 12,
                              letterSpacing: "0.06em",
                            }}>
                              P&L DISTRIBUTION — {result.paths.toLocaleString()} MONTE CARLO PATHS
                            </div>
                            <PnLDistributionChart result={result} height={280} />
                            <div style={{
                              marginTop: 8,
                              fontFamily: S.fontMono,
                              fontSize: 9,
                              color: S.tertiary,
                              display: "flex",
                              gap: 16,
                              flexWrap: "wrap",
                            }}>
                              <div><span style={{ color: S.primary }}>━</span> Mean P&L</div>
                              <div><span style={{ color: S.amber }}>- -</span> VaR 95% ({fmtAmt(result.var95)})</div>
                              <div><span style={{ color: S.fail }}>- -</span> VaR 99% ({fmtAmt(result.var99)})</div>
                              <div><span style={{ color: S.neutral }}>···</span> 95% Confidence Interval</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {actionMode === "STRESS_TEST" && (
                <div>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: S.primary,
                    marginBottom: 16,
                    letterSpacing: "0.06em",
                  }}>
                    STRESS TEST SCENARIOS
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {STRESS_SCENARIOS.map((scenario) => (
                      <div
                        key={scenario.id}
                        style={{
                          padding: 16,
                          border: `1px solid ${S.rim}`,
                          background: S.bgSub,
                          cursor: "pointer",
                          transition: "background 0.1s",
                        }}
                        onClick={() => setStressScenario(scenario.id)}>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 11,
                          fontWeight: 700,
                          color: S.primary,
                          marginBottom: 8,
                        }}>
                          {scenario.name}
                        </div>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          color: S.secondary,
                          marginBottom: 12,
                        }}>
                          {scenario.description}
                        </div>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 9,
                          color: S.tertiary,
                        }}>
                          Shocks: {scenario.shocks.map((s) => `${s.currency} ${s.change > 0 ? "+" : ""}${(s.change * 100).toFixed(0)}%`).join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {actionMode === "HEDGE_PLAN" && hedgePlans.size > 0 && (
                <div>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: S.primary,
                    marginBottom: 16,
                    letterSpacing: "0.06em",
                  }}>
                    OPTIMIZED HEDGE PLANS
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {Array.from(hedgePlans.entries()).map(([posId, plan]) => {
                      const pos = readyPositions.find((p) => p.id === posId);
                      if (!pos) return null;
                      return (
                        <div
                          key={posId}
                          style={{
                            padding: 16,
                            border: `1px solid ${S.rim}`,
                            background: S.bgSub,
                          }}>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 11,
                            fontWeight: 700,
                            color: S.primary,
                            marginBottom: 12,
                          }}>
                            {pos.record_id} — {pos.currency} ${fmtAmt(pos.amount)}
                          </div>
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, 1fr)",
                            gap: 12,
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            marginBottom: 12,
                          }}>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Recommended Instrument</div>
                              <div style={{
                                color: S.primary,
                                fontWeight: 700,
                                background: S.bgPanel,
                                padding: "4px 8px",
                                border: `1px solid ${S.darkBorder}`,
                                display: "inline-block",
                              }}>
                                {plan.recommendedInstrument}
                              </div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Optimal Hedge Ratio</div>
                              <div style={{ color: S.primary, fontWeight: 700 }}>{plan.recommendedHedgeRatio.toFixed(1)}%</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Hedge Notional</div>
                              <div style={{ color: S.primary }}>${fmtAmt(plan.recommendedNotional)}</div>
                            </div>
                            <div>
                              <div style={{ color: S.tertiary, marginBottom: 4 }}>Estimated Cost</div>
                              <div style={{ color: S.amber }}>${fmtAmt(plan.estimatedCost)}</div>
                            </div>
                          </div>
                          <div style={{
                            paddingTop: 12,
                            borderTop: `1px solid ${S.soft}`,
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            color: S.secondary,
                            fontStyle: "italic",
                          }}>
                            {plan.reasoning}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{
                    marginTop: 16,
                    padding: 12,
                    background: S.bgPanel,
                    border: `1px solid ${S.rim}`,
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    color: S.tertiary,
                  }}>
                    <strong style={{ color: S.primary }}>Optimization Notes:</strong> Plans use constraint-based optimization
                    with currency-specific instrument selection. NDF recommended for non-deliverable currencies (MXN, BRL, INR, KRW, CNH).
                    FWD recommended for G10 currencies. Cost estimates include spread + time value.
                  </div>
                </div>
              )}

              {actionMode === "COMPLIANCE" && complianceChecks.length > 0 && (
                <div>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: S.primary,
                    marginBottom: 16,
                    letterSpacing: "0.06em",
                  }}>
                    COMPLIANCE PRE-FLIGHT CHECKS
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {complianceChecks.map((check, idx) => {
                      const statusColor = check.status === "PASS" ? S.pass : check.status === "WARN" ? S.amber : S.fail;
                      const statusIcon = check.status === "PASS" ? "✓" : check.status === "WARN" ? "⚠" : "✕";
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: 16,
                            border: `1px solid ${check.critical && check.status === "FAIL" ? S.fail : S.rim}`,
                            background: S.bgSub,
                            borderLeft: `4px solid ${statusColor}`,
                          }}>
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            marginBottom: 8,
                          }}>
                            <span style={{
                              fontFamily: S.fontMono,
                              fontSize: 16,
                              color: statusColor,
                            }}>
                              {statusIcon}
                            </span>
                            <div style={{
                              fontFamily: S.fontMono,
                              fontSize: 11,
                              fontWeight: 700,
                              color: S.primary,
                            }}>
                              {check.checkName}
                            </div>
                            {check.critical && (
                              <span style={{
                                fontFamily: S.fontMono,
                                fontSize: 9,
                                color: S.fail,
                                background: `color-mix(in srgb, ${S.fail} 10%, transparent)`,
                                border: `1px solid ${S.fail}`,
                                padding: "2px 6px",
                              }}>
                                CRITICAL
                              </span>
                            )}
                            <span style={{
                              marginLeft: "auto",
                              fontFamily: S.fontMono,
                              fontSize: 9,
                              fontWeight: 700,
                              color: statusColor,
                              letterSpacing: "0.08em",
                            }}>
                              {check.status}
                            </span>
                          </div>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            color: S.secondary,
                          }}>
                            {check.message}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{
                    marginTop: 16,
                    padding: 12,
                    background: S.bgPanel,
                    border: `1px solid ${S.rim}`,
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    color: S.tertiary,
                  }}>
                    <strong style={{ color: S.primary }}>Compliance Summary:</strong>{" "}
                    {complianceChecks.filter((c) => c.status === "PASS").length} passed,{" "}
                    {complianceChecks.filter((c) => c.status === "WARN").length} warnings,{" "}
                    {complianceChecks.filter((c) => c.status === "FAIL").length} failed.{" "}
                    {complianceChecks.some((c) => c.critical && c.status === "FAIL") && (
                      <span style={{ color: S.fail, fontWeight: 700 }}>
                        Critical failures must be resolved before execution.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {actionMode === "IBKR_EXECUTE" && (
                <div style={{
                  padding: 20,
                  border: `1px solid ${S.rim}`,
                  background: S.bgSub,
                }}>
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    color: S.primary,
                    marginBottom: 12,
                    letterSpacing: "0.06em",
                  }}>
                    IBKR EXECUTION PAYLOAD
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, marginBottom: 16 }}>
                    FIX message generator for IBKR execution. Includes:
                    <ul style={{ marginTop: 8, marginLeft: 20 }}>
                      <li>Order validation (size, price, TIF)</li>
                      <li>Account verification</li>
                      <li>Compliance pre-checks</li>
                      <li>JSON/FIX format export</li>
                    </ul>
                  </div>
                  <button
                    onClick={exportIBKRPayload}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      color: S.primary,
                      background: S.bgPanel,
                      border: `1px solid ${S.darkBorder}`,
                      padding: "8px 16px",
                      cursor: "pointer",
                    }}>
                    DOWNLOAD PAYLOAD JSON
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Risk Panel */}
          {showRiskPanel && (
            <div style={{
              width: 320,
              borderLeft: `1px solid ${S.rim}`,
              display: "flex",
              flexDirection: "column",
              background: S.bgPanel,
              overflow: "auto",
            }}>
              <div style={{
                padding: "12px 16px",
                borderBottom: `1px solid ${S.soft}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: S.primary,
                  letterSpacing: "0.06em",
                }}>
                  RISK METRICS
                </span>
                <button
                  onClick={() => setShowRiskPanel(false)}
                  style={{
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
              <div style={{ padding: 16 }}>
                {selected.size === 0 ? (
                  <div style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    color: S.tertiary,
                    textAlign: "center",
                    padding: 40,
                  }}>
                    Select positions to view real-time risk analytics
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Selection Summary */}
                    <div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.tertiary,
                        marginBottom: 8,
                        letterSpacing: "0.06em",
                      }}>
                        SELECTION
                      </div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 20,
                        color: S.primary,
                        fontWeight: 700,
                      }}>
                        {selected.size}
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary }}>
                        position{selected.size > 1 ? "s" : ""} selected
                      </div>
                    </div>

                    {/* Total Notional */}
                    <div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.tertiary,
                        marginBottom: 8,
                        letterSpacing: "0.06em",
                      }}>
                        TOTAL NOTIONAL
                      </div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 16,
                        color: S.primary,
                        fontWeight: 700,
                      }}>
                        ${fmtAmt(
                          readyPositions
                            .filter((p) => selected.has(p.id))
                            .reduce((sum, p) => sum + Math.abs(p.amount), 0)
                        )}
                      </div>
                    </div>

                    {/* Currency Breakdown */}
                    <div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.tertiary,
                        marginBottom: 8,
                        letterSpacing: "0.06em",
                      }}>
                        CURRENCIES
                      </div>
                      {(() => {
                        const currMap = new Map<string, number>();
                        readyPositions
                          .filter((p) => selected.has(p.id))
                          .forEach((p) => {
                            const curr = currMap.get(p.currency) || 0;
                            currMap.set(p.currency, curr + Math.abs(p.amount));
                          });
                        return Array.from(currMap.entries())
                          .sort((a, b) => b[1] - a[1])
                          .map(([curr, amt]) => (
                            <div
                              key={curr}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontFamily: S.fontMono,
                                fontSize: 10,
                                marginBottom: 6,
                              }}>
                              <span style={{ color: S.primary, fontWeight: 700 }}>{curr}</span>
                              <span style={{ color: S.secondary }}>${fmtAmt(amt)}</span>
                            </div>
                          ));
                      })()}
                    </div>

                    {/* Portfolio Risk (if simulation run) */}
                    {portfolioRisk && (
                      <>
                        <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 16 }}>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            color: S.tertiary,
                            marginBottom: 8,
                            letterSpacing: "0.06em",
                          }}>
                            PORTFOLIO VaR 95%
                          </div>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 16,
                            color: S.fail,
                            fontWeight: 700,
                          }}>
                            ${fmtAmt(portfolioRisk.totalVar95)}
                          </div>
                          <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary, marginTop: 4 }}>
                            Max loss at 95% confidence
                          </div>
                        </div>

                        <div>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            color: S.tertiary,
                            marginBottom: 8,
                            letterSpacing: "0.06em",
                          }}>
                            CONCENTRATION RISK
                          </div>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 16,
                            color: portfolioRisk.concentrationRisk > 25 ? S.amber : S.pass,
                            fontWeight: 700,
                          }}>
                            {portfolioRisk.concentrationRisk.toFixed(0)}
                          </div>
                          <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary, marginTop: 4 }}>
                            Herfindahl-Hirschman Index
                          </div>
                        </div>

                        <div>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 10,
                            color: S.tertiary,
                            marginBottom: 8,
                            letterSpacing: "0.06em",
                          }}>
                            DIVERSIFICATION
                          </div>
                          <div style={{
                            fontFamily: S.fontMono,
                            fontSize: 16,
                            color: S.pass,
                            fontWeight: 700,
                          }}>
                            {portfolioRisk.diversificationBenefit.toFixed(1)}%
                          </div>
                          <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary, marginTop: 4 }}>
                            Risk reduction from portfolio effects
                          </div>
                        </div>
                      </>
                    )}

                    {/* Compliance Status */}
                    {complianceChecks.length > 0 && (
                      <div style={{ borderTop: `1px solid ${S.soft}`, paddingTop: 16 }}>
                        <div style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          color: S.tertiary,
                          marginBottom: 8,
                          letterSpacing: "0.06em",
                        }}>
                          COMPLIANCE
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {complianceChecks.map((check, idx) => {
                            const statusColor = check.status === "PASS" ? S.pass : check.status === "WARN" ? S.amber : S.fail;
                            const statusIcon = check.status === "PASS" ? "✓" : check.status === "WARN" ? "⚠" : "✕";
                            return (
                              <div
                                key={idx}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontFamily: S.fontMono,
                                  fontSize: 9,
                                }}>
                                <span style={{ color: statusColor }}>{statusIcon}</span>
                                <span style={{ color: S.secondary, flex: 1 }}>{check.checkName}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <HelpPanel config={EXECUTION_DESK_HELP} storageKey="execution-desk" />
    </div>
  );
}
